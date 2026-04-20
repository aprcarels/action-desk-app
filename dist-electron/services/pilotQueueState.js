"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultPilotQueueItemState = getDefaultPilotQueueItemState;
exports.createSnoozeUntilTomorrow = createSnoozeUntilTomorrow;
exports.loadPilotQueueStateMap = loadPilotQueueStateMap;
exports.savePilotQueueStateMap = savePilotQueueStateMap;
exports.getPilotQueueItemState = getPilotQueueItemState;
exports.updatePilotQueueItemState = updatePilotQueueItemState;
exports.setPilotWorkflowStatus = setPilotWorkflowStatus;
exports.snoozePilotQueueItemUntilTomorrow = snoozePilotQueueItemUntilTomorrow;
exports.setPilotUsefulnessFeedback = setPilotUsefulnessFeedback;
exports.getPilotQueueViewForItem = getPilotQueueViewForItem;
exports.shouldShowPilotQueueItemInView = shouldShowPilotQueueItemInView;
const PILOT_QUEUE_STATE_STORAGE_KEY = "action-desk-pilot-queue-state";
function getDefaultPilotQueueItemState(now = new Date()) {
    return {
        workflowStatus: "active",
        updatedAt: now.toISOString(),
    };
}
function createSnoozeUntilTomorrow(now = new Date()) {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(8, 0, 0, 0);
    return next.toISOString();
}
function isPilotQueueItemState(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return ((candidate.workflowStatus === "active" ||
        candidate.workflowStatus === "done" ||
        candidate.workflowStatus === "not_relevant" ||
        candidate.workflowStatus === "waiting_on_customer") &&
        typeof candidate.updatedAt === "string" &&
        (candidate.snoozedUntil === undefined || typeof candidate.snoozedUntil === "string") &&
        (candidate.usefulness === undefined ||
            candidate.usefulness === "helpful" ||
            candidate.usefulness === "not_helpful"));
}
function loadPilotQueueStateMap() {
    if (typeof window === "undefined") {
        return {};
    }
    try {
        const raw = window.localStorage.getItem(PILOT_QUEUE_STATE_STORAGE_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return {};
        }
        return Object.fromEntries(Object.entries(parsed).filter((entry) => isPilotQueueItemState(entry[1])));
    }
    catch {
        return {};
    }
}
function savePilotQueueStateMap(stateMap) {
    if (typeof window === "undefined") {
        return;
    }
    try {
        window.localStorage.setItem(PILOT_QUEUE_STATE_STORAGE_KEY, JSON.stringify(stateMap));
    }
    catch {
        // Ignore storage failures during pilot mode so queue actions do not break the session.
    }
}
function getPilotQueueItemState(stateMap, emailId, now = new Date()) {
    return stateMap[emailId] ?? getDefaultPilotQueueItemState(now);
}
function updatePilotQueueItemState(stateMap, emailId, updates, now = new Date()) {
    const current = getPilotQueueItemState(stateMap, emailId, now);
    const nextState = {
        ...current,
        ...updates,
        updatedAt: now.toISOString(),
    };
    if (nextState.workflowStatus !== "active" && nextState.workflowStatus !== "waiting_on_customer") {
        delete nextState.snoozedUntil;
    }
    return {
        ...stateMap,
        [emailId]: nextState,
    };
}
function setPilotWorkflowStatus(stateMap, emailId, workflowStatus, now = new Date()) {
    return updatePilotQueueItemState(stateMap, emailId, {
        workflowStatus,
        snoozedUntil: undefined,
    }, now);
}
function snoozePilotQueueItemUntilTomorrow(stateMap, emailId, now = new Date()) {
    return updatePilotQueueItemState(stateMap, emailId, {
        workflowStatus: "active",
        snoozedUntil: createSnoozeUntilTomorrow(now),
    }, now);
}
function setPilotUsefulnessFeedback(stateMap, emailId, usefulness, now = new Date()) {
    return updatePilotQueueItemState(stateMap, emailId, {
        usefulness,
    }, now);
}
function getPilotQueueViewForItem(itemState, now = new Date()) {
    if (itemState.snoozedUntil) {
        const snoozedUntilTime = Date.parse(itemState.snoozedUntil);
        if (!Number.isNaN(snoozedUntilTime) && snoozedUntilTime > now.getTime()) {
            return "snoozed";
        }
    }
    if (itemState.workflowStatus === "done") {
        return "done";
    }
    if (itemState.workflowStatus === "not_relevant") {
        return "not_relevant";
    }
    if (itemState.workflowStatus === "waiting_on_customer") {
        return "waiting_on_customer";
    }
    return "active";
}
function shouldShowPilotQueueItemInView(itemState, view, now = new Date()) {
    if (view === "all") {
        return true;
    }
    const derivedView = getPilotQueueViewForItem(itemState, now);
    if (view === "active") {
        return derivedView === "active" || derivedView === "waiting_on_customer";
    }
    return derivedView === view;
}
