import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";

export type DromapMapView = {
  center: {
    lat: number;
    lng: number;
  };
  zoom: number;
  /** Emprise réellement visible dans le conteneur qui a produit la vue. */
  visibleBounds?: WorkspaceBounds;
};

export function normalizeDromapMapView(value: unknown): DromapMapView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const center = record.center;

  if (!center || typeof center !== "object" || Array.isArray(center)) {
    return null;
  }

  const centerRecord = center as Record<string, unknown>;
  const lat = centerRecord.lat;
  const lng = centerRecord.lng;
  const zoom = record.zoom;

  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    typeof zoom !== "number" ||
    !Number.isFinite(zoom)
  ) {
    return null;
  }

  const visibleBounds = record.visibleBounds;
  let normalizedVisibleBounds: WorkspaceBounds | undefined;

  if (
    visibleBounds &&
    typeof visibleBounds === "object" &&
    !Array.isArray(visibleBounds)
  ) {
    const boundsRecord = visibleBounds as Record<string, unknown>;
    const southWest = boundsRecord.southWest;
    const northEast = boundsRecord.northEast;

    if (
      southWest &&
      typeof southWest === "object" &&
      !Array.isArray(southWest) &&
      northEast &&
      typeof northEast === "object" &&
      !Array.isArray(northEast)
    ) {
      const southWestRecord = southWest as Record<string, unknown>;
      const northEastRecord = northEast as Record<string, unknown>;
      const south = southWestRecord.lat;
      const west = southWestRecord.lng;
      const north = northEastRecord.lat;
      const east = northEastRecord.lng;

      if (
        typeof south === "number" &&
        Number.isFinite(south) &&
        typeof west === "number" &&
        Number.isFinite(west) &&
        typeof north === "number" &&
        Number.isFinite(north) &&
        typeof east === "number" &&
        Number.isFinite(east)
      ) {
        normalizedVisibleBounds = {
          southWest: {
            lat: Math.min(Math.max(Math.min(south, north), -90), 90),
            lng: Math.min(Math.max(Math.min(west, east), -360), 360),
          },
          northEast: {
            lat: Math.min(Math.max(Math.max(south, north), -90), 90),
            lng: Math.min(Math.max(Math.max(west, east), -360), 360),
          },
        };
      }
    }
  }

  return {
    center: {
      lat: Math.min(Math.max(lat, -90), 90),
      lng: Math.min(Math.max(lng, -360), 360),
    },
    zoom: Math.min(Math.max(zoom, 0), 24),
    ...(normalizedVisibleBounds
      ? { visibleBounds: normalizedVisibleBounds }
      : {}),
  };
}
