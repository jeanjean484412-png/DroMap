import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";

export const MIN_WORKSPACE_ASPECT_RATIO = 1 / 3;
export const MAX_WORKSPACE_ASPECT_RATIO = 3;

type LatLngPoint = {
  lat: number;
  lng: number;
};

type WorkspaceValidationResult = {
  isValid: boolean;
  ratio: number | null;
  message: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readLatLngPoint(value: unknown): LatLngPoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const lat = value.lat;
  const lng = value.lng;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  return { lat, lng };
}

function getWorkspaceBoundsPoints(
  workspaceBounds: WorkspaceBounds | null,
): { southWest: LatLngPoint; northEast: LatLngPoint } | null {
  if (!workspaceBounds || !isRecord(workspaceBounds)) {
    return null;
  }

  const southWest =
    readLatLngPoint(workspaceBounds.southWest) ??
    readLatLngPoint(workspaceBounds.sw) ??
    readLatLngPoint(workspaceBounds._southWest);

  const northEast =
    readLatLngPoint(workspaceBounds.northEast) ??
    readLatLngPoint(workspaceBounds.ne) ??
    readLatLngPoint(workspaceBounds._northEast);

  if (southWest && northEast) {
    return { southWest, northEast };
  }

  const south = workspaceBounds.south;
  const west = workspaceBounds.west;
  const north = workspaceBounds.north;
  const east = workspaceBounds.east;

  if (
    typeof south === "number" &&
    typeof west === "number" &&
    typeof north === "number" &&
    typeof east === "number"
  ) {
    return {
      southWest: { lat: south, lng: west },
      northEast: { lat: north, lng: east },
    };
  }

  return null;
}

export function getWorkspaceAspectRatio(
  workspaceBounds: WorkspaceBounds | null,
): number | null {
  const points = getWorkspaceBoundsPoints(workspaceBounds);

  if (!points) {
    return null;
  }

  const latDiff = Math.abs(points.northEast.lat - points.southWest.lat);
  const lngDiff = Math.abs(points.northEast.lng - points.southWest.lng);

  if (latDiff === 0 || lngDiff === 0) {
    return null;
  }

  const averageLat =
    ((points.northEast.lat + points.southWest.lat) / 2) * (Math.PI / 180);

  const correctedLngDiff = lngDiff * Math.max(0.2, Math.cos(averageLat));

  return correctedLngDiff / latDiff;
}

export function validateWorkspaceBoundsRatio(
  workspaceBounds: WorkspaceBounds | null,
): WorkspaceValidationResult {
  const ratio = getWorkspaceAspectRatio(workspaceBounds);

  if (ratio === null) {
    return {
      isValid: false,
      ratio: null,
      message: "Sélectionne une zone de travail avant de valider.",
    };
  }

  if (ratio < MIN_WORKSPACE_ASPECT_RATIO) {
    return {
      isValid: false,
      ratio,
      message:
        "Zone trop verticale pour un export propre. Élargis la sélection.",
    };
  }

  if (ratio > MAX_WORKSPACE_ASPECT_RATIO) {
    return {
      isValid: false,
      ratio,
      message:
        "Zone trop horizontale pour un export propre. Augmente la hauteur de la sélection.",
    };
  }

  return {
    isValid: true,
    ratio,
    message: null,
  };
}