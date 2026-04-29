import type { RepProfile } from "../types/actionDesk";

export type ActionDeskLocation = {
  id: string;
  name: string;
  domain: "apexpress.com" | "worldpackusa.com";
};

export const ACTION_DESK_LOCATIONS: ActionDeskLocation[] = [
  {
    id: "apexpress-1",
    name: "Apexpress Irwindale",
    domain: "apexpress.com",
  },
  {
    id: "apexpress-2",
    name: "Apexpress Corona",
    domain: "apexpress.com",
  },
  {
    id: "worldpackusa",
    name: "worldpackusa Las Vegas",
    domain: "worldpackusa.com",
  },
];

function normalizeLocationKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

const LOCATION_ALIASES = new Map<string, string>(
  ACTION_DESK_LOCATIONS.flatMap((location) => [
    [normalizeLocationKey(location.id), location.id],
    [normalizeLocationKey(location.name), location.id],
  ]),
);

for (const [alias, locationId] of [
  ["AP Express Irwindale", "apexpress-1"],
  ["Apexpress 1", "apexpress-1"],
  ["Irwindale", "apexpress-1"],
  ["AP Express Corona", "apexpress-2"],
  ["Apexpress 2", "apexpress-2"],
  ["Corona", "apexpress-2"],
  ["World Pack USA Las Vegas", "worldpackusa"],
  ["Worldpack USA Las Vegas", "worldpackusa"],
  ["Worldpackusa", "worldpackusa"],
] as const) {
  LOCATION_ALIASES.set(normalizeLocationKey(alias), locationId);
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

  if (!locationId) {
    return true;
  }

  return normalizeLocationId(currentUser.locationId) === normalizeLocationId(locationId);
}
