import type { RepProfile } from "../types/actionDesk";
import locationsConfig from "../config/actionDeskLocations.json";

export type ActionDeskLocation = {
  id: string;
  name: string;
  domain: "apexpress.com" | "worldpackusa.com";
};

type ActionDeskLocationConfig = {
  locations: Array<ActionDeskLocation & { aliases?: string[] }>;
};

const typedLocationsConfig = locationsConfig as ActionDeskLocationConfig;

export const ACTION_DESK_LOCATIONS: ActionDeskLocation[] =
  typedLocationsConfig.locations.map(({ id, name, domain }) => ({
    id,
    name,
    domain,
  }));

function normalizeLocationKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

const LOCATION_ALIASES = new Map<string, string>();

for (const location of typedLocationsConfig.locations) {
  for (const alias of [location.id, location.name, ...(location.aliases ?? [])]) {
    LOCATION_ALIASES.set(normalizeLocationKey(alias), location.id);
  }
}

export function normalizeLocationId(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    return undefined;
  }

  return LOCATION_ALIASES.get(normalizeLocationKey(normalized));
}

export function getLocationLabel(locationId?: string): string {
  const normalizedLocationId = normalizeLocationId(locationId);

  return (
    ACTION_DESK_LOCATIONS.find((location) => location.id === normalizedLocationId)?.name ??
    "Unassigned location"
  );
}

export function canAccessLocation(
  currentUser: RepProfile,
  locationId?: string,
): boolean {
  if (currentUser.role === "admin") {
    return true;
  }

  const targetLocationId = normalizeLocationId(locationId);

  if (!targetLocationId) {
    return true;
  }

  const currentLocationId = normalizeLocationId(currentUser.locationId);

  if (currentLocationId === targetLocationId) {
    return true;
  }

  return (currentUser.allowedLocations ?? [])
    .map((allowedLocation) => normalizeLocationId(allowedLocation))
    .includes(targetLocationId);
}
