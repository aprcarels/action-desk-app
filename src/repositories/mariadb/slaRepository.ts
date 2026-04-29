import {
  execute,
  logDatabaseError,
  query,
  withTransaction,
  type DatabaseRow,
  type DatabaseTransaction,
} from "../../persistence/mariadb/database";
import {
  readBoolean,
  readId,
  readNullableId,
  readNumber,
  readString,
} from "./rowMappers";
import type { DatabaseId, TicketSlaState } from "./schemaTypes";

const MAX_SCHEDULE_ADVANCE_DAYS = 370;
const MILLISECONDS_PER_MINUTE = 60_000;

export type BusinessHour = {
  queueId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type Holiday = {
  queueId: string | null;
  holidayDate: string;
  name: string;
  isWorkingDay: boolean;
};

export type SlaSchedule = {
  businessHours: BusinessHour[];
  holidays: Holiday[];
};

export type WorkingInterval = {
  start: Date;
  end: Date;
};

export type SlaProfile = {
  id: string;
  name: string;
  targetMinutes: number;
  warningThresholdPct: number;
  criticalThresholdPct: number;
};

export type SlaRecalculationEventType =
  | "CREATED"
  | "FIRST_RESPONSE"
  | "RECALCULATED"
  | "WARNING"
  | "CRITICAL"
  | "BREACHED";

export type SlaRecalculationResult = {
  ticketId: string;
  elapsedMinutes: number;
  previousState: TicketSlaState;
  slaState: TicketSlaState;
  stateChanged: boolean;
  eventType: SlaRecalculationEventType | null;
};

export type RecalculateTicketSlaOptions = {
  now?: Date;
  transaction?: DatabaseTransaction;
  eventType?: "CREATED" | "FIRST_RESPONSE" | "RECALCULATED";
  recordUnchangedRecalculation?: boolean;
};

type TicketSlaRecord = {
  id: string;
  receivedAt: string;
  queueId: string | null;
  slaProfileId: string;
  slaState: TicketSlaState;
};

type SlaDatabaseClient = Pick<DatabaseTransaction, "query" | "execute">;

const defaultDatabaseClient: SlaDatabaseClient = {
  query,
  execute,
};

function normalizeDateKey(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const normalized = String(value ?? "").trim();
  return normalized.includes("T")
    ? normalized.slice(0, 10)
    : normalized.split(" ")[0] ?? normalized;
}

function parseUtcDateTime(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  const normalized = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(`${normalized}T00:00:00.000Z`);
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
    return new Date(`${normalized.replace(" ", "T")}Z`);
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid UTC timestamp: ${value}`);
  }

  return parsed;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
}

function addUtcDays(date: Date, days: number): Date {
  const nextDate = startOfUtcDay(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function getUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseTimeParts(timeValue: string): {
  hours: number;
  minutes: number;
  seconds: number;
} {
  const [hours = "0", minutes = "0", seconds = "0"] = timeValue.split(":");

  return {
    hours: Number.parseInt(hours, 10),
    minutes: Number.parseInt(minutes, 10),
    seconds: Number.parseInt(seconds, 10),
  };
}

function buildUtcDateTime(day: Date, timeValue: string): Date {
  const { hours, minutes, seconds } = parseTimeParts(timeValue);

  return new Date(Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    hours,
    minutes,
    seconds,
  ));
}

function mapBusinessHour(row: DatabaseRow): BusinessHour {
  return {
    queueId: readNullableId(row, "queueId"),
    dayOfWeek: readNumber(row, "dayOfWeek"),
    startTime: readString(row, "startTime"),
    endTime: readString(row, "endTime"),
  };
}

function mapHoliday(row: DatabaseRow): Holiday {
  return {
    queueId: readNullableId(row, "queueId"),
    holidayDate: normalizeDateKey(row.holidayDate),
    name: readString(row, "name"),
    isWorkingDay: readBoolean(row, "isWorkingDay"),
  };
}

function mapSlaProfile(row: DatabaseRow): SlaProfile {
  return {
    id: readId(row, "id"),
    name: readString(row, "name"),
    targetMinutes: readNumber(row, "targetMinutes"),
    warningThresholdPct: readNumber(row, "warningThresholdPct"),
    criticalThresholdPct: readNumber(row, "criticalThresholdPct"),
  };
}

function mapTicketSlaRecord(row: DatabaseRow): TicketSlaRecord {
  return {
    id: readId(row, "id"),
    receivedAt: readString(row, "receivedAt"),
    queueId: readNullableId(row, "queueId"),
    slaProfileId: readId(row, "slaProfileId"),
    slaState: readString(row, "slaState") as TicketSlaState,
  };
}

function isNonWorkingHoliday(date: Date, schedule: SlaSchedule): boolean {
  const dateKey = getUtcDateKey(date);
  const sameDayHolidays = schedule.holidays.filter(
    (holiday) => holiday.holidayDate === dateKey,
  );
  const queueOverride = sameDayHolidays.find((holiday) => holiday.queueId !== null);

  if (queueOverride) {
    return !queueOverride.isWorkingDay;
  }

  const globalHoliday = sameDayHolidays.find((holiday) => holiday.queueId === null);
  return globalHoliday ? !globalHoliday.isWorkingDay : false;
}

function getWorkingIntervalsForUtcDay(
  date: Date,
  schedule: SlaSchedule,
): WorkingInterval[] {
  if (isNonWorkingHoliday(date, schedule)) {
    return [];
  }

  const dayStart = startOfUtcDay(date);
  const dayOfWeek = dayStart.getUTCDay();

  return schedule.businessHours
    .filter((businessHour) => businessHour.dayOfWeek === dayOfWeek)
    .map((businessHour) => ({
      start: buildUtcDateTime(dayStart, businessHour.startTime),
      end: buildUtcDateTime(dayStart, businessHour.endTime),
    }))
    .filter((interval) => interval.end.getTime() > interval.start.getTime())
    .sort((left, right) => left.start.getTime() - right.start.getTime());
}

function maxDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function resolveSlaEventType(
  previousState: TicketSlaState,
  nextState: TicketSlaState,
  options: RecalculateTicketSlaOptions,
): SlaRecalculationEventType | null {
  if (options.eventType === "CREATED") {
    return "CREATED";
  }

  if (options.eventType === "FIRST_RESPONSE") {
    return "FIRST_RESPONSE";
  }

  if (previousState !== nextState) {
    return nextState === "OK" ? "RECALCULATED" : nextState;
  }

  if (options.eventType === "RECALCULATED" || options.recordUnchangedRecalculation) {
    return "RECALCULATED";
  }

  return null;
}

async function runInTransaction<T>(
  transaction: DatabaseTransaction | undefined,
  callback: (activeTransaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  if (transaction) {
    return callback(transaction);
  }

  return withTransaction(callback);
}

async function loadSlaProfile(
  slaProfileId: DatabaseId,
  databaseClient: SlaDatabaseClient,
): Promise<SlaProfile | null> {
  const rows = await databaseClient.query(
    `
      SELECT
        id,
        name,
        target_minutes AS targetMinutes,
        warning_threshold_pct AS warningThresholdPct,
        critical_threshold_pct AS criticalThresholdPct
      FROM sla_profiles
      WHERE id = ? AND is_active = TRUE
      LIMIT 1
    `,
    [slaProfileId],
  );

  return rows[0] ? mapSlaProfile(rows[0]) : null;
}

async function loadTicketSlaRecord(
  ticketId: DatabaseId,
  databaseClient: SlaDatabaseClient,
): Promise<TicketSlaRecord | null> {
  const rows = await databaseClient.query(
    `
      SELECT
        id,
        received_at AS receivedAt,
        queue_id AS queueId,
        sla_profile_id AS slaProfileId,
        sla_state AS slaState
      FROM tickets
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [ticketId],
  );

  return rows[0] ? mapTicketSlaRecord(rows[0]) : null;
}

async function insertSlaEvent(
  ticket: TicketSlaRecord,
  profile: SlaProfile,
  elapsedMinutes: number,
  slaState: TicketSlaState,
  eventType: SlaRecalculationEventType,
  databaseClient: SlaDatabaseClient,
): Promise<void> {
  await databaseClient.execute(
    `
      INSERT INTO sla_events (
        ticket_id,
        event_type,
        sla_profile_id,
        elapsed_minutes,
        sla_state,
        details
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      ticket.id,
      eventType,
      profile.id,
      elapsedMinutes,
      slaState,
      JSON.stringify({
        previous_state: ticket.slaState,
        queue_id: ticket.queueId,
        target_minutes: profile.targetMinutes,
      }),
    ],
  );
}

export async function loadSchedule(
  queueId?: DatabaseId | null,
  transaction?: DatabaseTransaction,
): Promise<SlaSchedule> {
  const databaseClient = transaction ?? defaultDatabaseClient;
  const hasQueueId = queueId !== undefined && queueId !== null;
  const businessHourRows = await databaseClient.query(
    hasQueueId
      ? `
        SELECT
          queue_id AS queueId,
          day_of_week AS dayOfWeek,
          start_time AS startTime,
          end_time AS endTime
        FROM business_hours
        WHERE is_active = TRUE AND (queue_id IS NULL OR queue_id = ?)
        ORDER BY queue_id IS NULL DESC, day_of_week ASC, start_time ASC
      `
      : `
        SELECT
          queue_id AS queueId,
          day_of_week AS dayOfWeek,
          start_time AS startTime,
          end_time AS endTime
        FROM business_hours
        WHERE is_active = TRUE AND queue_id IS NULL
        ORDER BY day_of_week ASC, start_time ASC
      `,
    hasQueueId ? [queueId] : [],
  );
  const mappedBusinessHours = businessHourRows.map(mapBusinessHour);
  const queueBusinessHours = mappedBusinessHours.filter(
    (businessHour) => businessHour.queueId !== null,
  );
  const globalBusinessHours = mappedBusinessHours.filter(
    (businessHour) => businessHour.queueId === null,
  );
  const businessHours =
    hasQueueId && queueBusinessHours.length > 0
      ? queueBusinessHours
      : globalBusinessHours;

  const holidayRows = await databaseClient.query(
    hasQueueId
      ? `
        SELECT
          queue_id AS queueId,
          holiday_date AS holidayDate,
          name,
          is_working_day AS isWorkingDay
        FROM holiday_calendar
        WHERE queue_id IS NULL OR queue_id = ?
        ORDER BY holiday_date ASC, queue_id IS NULL DESC
      `
      : `
        SELECT
          queue_id AS queueId,
          holiday_date AS holidayDate,
          name,
          is_working_day AS isWorkingDay
        FROM holiday_calendar
        WHERE queue_id IS NULL
        ORDER BY holiday_date ASC
      `,
    hasQueueId ? [queueId] : [],
  );

  return {
    businessHours,
    holidays: holidayRows.map(mapHoliday),
  };
}

export function advanceToWorkingTime(date: Date, schedule: SlaSchedule): Date {
  let candidate = new Date(date.getTime());

  for (let guard = 0; guard < MAX_SCHEDULE_ADVANCE_DAYS; guard += 1) {
    const intervals = getWorkingIntervalsForUtcDay(candidate, schedule);

    for (const interval of intervals) {
      if (candidate.getTime() <= interval.start.getTime()) {
        return new Date(interval.start.getTime());
      }

      if (
        candidate.getTime() >= interval.start.getTime() &&
        candidate.getTime() < interval.end.getTime()
      ) {
        return new Date(candidate.getTime());
      }
    }

    candidate = addUtcDays(candidate, 1);
  }

  throw new Error("Could not find working time in configured SLA schedule.");
}

export function getWorkingIntervals(
  schedule: SlaSchedule,
  startUtc: Date,
  endUtc: Date,
): WorkingInterval[] {
  if (endUtc.getTime() <= startUtc.getTime()) {
    return [];
  }

  const intervals: WorkingInterval[] = [];
  let cursor = advanceToWorkingTime(startUtc, schedule);

  for (let guard = 0; cursor.getTime() < endUtc.getTime(); guard += 1) {
    if (guard > MAX_SCHEDULE_ADVANCE_DAYS) {
      throw new Error("Could not calculate working intervals safely.");
    }

    const dayIntervals = getWorkingIntervalsForUtcDay(cursor, schedule);
    const activeInterval = dayIntervals.find(
      (interval) =>
        interval.start.getTime() <= cursor.getTime() &&
        interval.end.getTime() > cursor.getTime(),
    );

    if (!activeInterval) {
      const nextCandidate = advanceToWorkingTime(cursor, schedule);

      if (nextCandidate.getTime() === cursor.getTime()) {
        cursor = advanceToWorkingTime(addUtcDays(cursor, 1), schedule);
      } else {
        cursor = nextCandidate;
      }

      continue;
    }

    const intervalStart = maxDate(cursor, startUtc);
    const intervalEnd = minDate(activeInterval.end, endUtc);

    if (intervalEnd.getTime() > intervalStart.getTime()) {
      intervals.push({
        start: new Date(intervalStart.getTime()),
        end: new Date(intervalEnd.getTime()),
      });
    }

    if (intervalEnd.getTime() >= endUtc.getTime()) {
      break;
    }

    cursor = advanceToWorkingTime(activeInterval.end, schedule);
  }

  return intervals;
}

export function calculateBusinessMinutes(
  startUtc: Date,
  endUtc: Date,
  schedule: SlaSchedule,
): number {
  return Math.floor(
    getWorkingIntervals(schedule, startUtc, endUtc).reduce(
      (totalMinutes, interval) =>
        totalMinutes +
        (interval.end.getTime() - interval.start.getTime()) / MILLISECONDS_PER_MINUTE,
      0,
    ),
  );
}

export function getSlaState(
  elapsedMinutes: number,
  slaProfile: Pick<
    SlaProfile,
    "targetMinutes" | "warningThresholdPct" | "criticalThresholdPct"
  >,
): TicketSlaState {
  const targetMinutes = Math.max(0, slaProfile.targetMinutes);

  if (targetMinutes <= 0 || elapsedMinutes >= targetMinutes) {
    return "BREACHED";
  }

  const criticalStartsAt = Math.ceil(
    targetMinutes * (slaProfile.criticalThresholdPct / 100),
  );
  const warningStartsAt = Math.ceil(
    targetMinutes * (slaProfile.warningThresholdPct / 100),
  );

  if (elapsedMinutes >= criticalStartsAt) {
    return "CRITICAL";
  }

  if (elapsedMinutes >= warningStartsAt) {
    return "WARNING";
  }

  return "OK";
}

export async function recalculateTicketSla(
  ticketId: DatabaseId,
  options: RecalculateTicketSlaOptions = {},
): Promise<SlaRecalculationResult | null> {
  try {
    return await runInTransaction(options.transaction, async (transaction) => {
      const ticket = await loadTicketSlaRecord(ticketId, transaction);

      if (!ticket) {
        return null;
      }

      const profile = await loadSlaProfile(ticket.slaProfileId, transaction);

      if (!profile) {
        throw new Error(`SLA profile ${ticket.slaProfileId} was not found.`);
      }

      const schedule = await loadSchedule(ticket.queueId, transaction);
      const elapsedMinutes = calculateBusinessMinutes(
        parseUtcDateTime(ticket.receivedAt),
        options.now ?? new Date(),
        schedule,
      );
      const slaState = getSlaState(elapsedMinutes, profile);
      const eventType = resolveSlaEventType(ticket.slaState, slaState, options);

      await transaction.execute(
        `
          UPDATE tickets
          SET
            sla_elapsed_minutes = ?,
            sla_state = ?
          WHERE id = ?
        `,
        [elapsedMinutes, slaState, ticket.id],
      );

      if (eventType) {
        await insertSlaEvent(
          ticket,
          profile,
          elapsedMinutes,
          slaState,
          eventType,
          transaction,
        );
      }

      return {
        ticketId: ticket.id,
        elapsedMinutes,
        previousState: ticket.slaState,
        slaState,
        stateChanged: ticket.slaState !== slaState,
        eventType,
      };
    });
  } catch (error) {
    logDatabaseError("Ticket SLA recalculation failed.", error);
    return null;
  }
}

export const slaRepository = {
  loadSchedule,
  advanceToWorkingTime,
  getWorkingIntervals,
  calculateBusinessMinutes,
  getSlaState,
  recalculateTicketSla,
};
