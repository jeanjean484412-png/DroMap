import { create } from "zustand";

export const DROMAP_CUSTOM_MARKERS_STORAGE_KEY =
  "dromap-editor-test-custom-markers-v1";

export const CUSTOM_MARKER_CANVAS_SIZE = 360;

export type DroMapDrawnMarkerPoint = { x: number; y: number };

export type DroMapDrawnMarkerDashStyle = "solid" | "dashed" | "dotted";
export type DroMapDrawnMarkerHatchingStyle =
  "none" | "diagonal-right" | "diagonal-left" | "horizontal" | "vertical";

export type DroMapDrawnMarkerShapeKind =
  "rectangle" | "ellipse" | "circle" | "triangle" | "diamond" | "star";

export type DroMapDrawnMarkerShapeElement = {
  id: string;
  type: "shape";
  shape: DroMapDrawnMarkerShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fillEnabled: boolean;
  fillColor: string;
  fillOpacity?: number;
  strokeEnabled?: boolean;
  strokeColor: string;
  strokeOpacity?: number;
  strokeWidth: number;
  dashStyle?: DroMapDrawnMarkerDashStyle;
  hatchingStyle?: DroMapDrawnMarkerHatchingStyle;
  hatchingColor?: string;
  hatchingWeight?: number;
  hatchingSpacing?: number;
  dotsEnabled?: boolean;
  dotsColor?: string;
  dotsRadius?: number;
  dotsSpacing?: number;
};

export type DroMapDrawnMarkerLineElement = {
  id: string;
  type: "line" | "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeColor: string;
  strokeOpacity?: number;
  strokeWidth: number;
  dashStyle?: DroMapDrawnMarkerDashStyle;
  arrowStart?: boolean;
  arrowEnd?: boolean;
};

export type DroMapDrawnMarkerPathElement = {
  id: string;
  type: "path";
  points: DroMapDrawnMarkerPoint[];
  rawPoints?: DroMapDrawnMarkerPoint[];
  smoothing?: number;
  closed: boolean;
  fillEnabled: boolean;
  fillColor: string;
  fillOpacity?: number;
  strokeEnabled?: boolean;
  strokeColor: string;
  strokeOpacity?: number;
  strokeWidth: number;
  dashStyle?: DroMapDrawnMarkerDashStyle;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  hatchingStyle?: DroMapDrawnMarkerHatchingStyle;
  hatchingColor?: string;
  hatchingWeight?: number;
  hatchingSpacing?: number;
  dotsEnabled?: boolean;
  dotsColor?: string;
  dotsRadius?: number;
  dotsSpacing?: number;
};

export type DroMapDrawnMarkerTextElement = {
  id: string;
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  text: string;
  fontSize: number;
  color: string;
  opacity?: number;
  backgroundEnabled?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderEnabled?: boolean;
  borderColor?: string;
  borderWidth?: number;
};

export type DroMapDrawnMarkerElement =
  | DroMapDrawnMarkerShapeElement
  | DroMapDrawnMarkerLineElement
  | DroMapDrawnMarkerPathElement
  | DroMapDrawnMarkerTextElement;

export type DroMapCustomMarkerDefinition = {
  id: string;
  name: string;
  kind: "drawn" | "image";
  dataUrl: string;
  elements?: DroMapDrawnMarkerElement[];
  /** Masqué de Mes marqueurs, mais conservé pour les objets déjà placés. */
  hiddenFromLibrary?: boolean;
  createdAt: string;
  updatedAt: string;
};

type EditorTestCustomMarkersState = {
  customMarkers: DroMapCustomMarkerDefinition[];
  hasLoadedFromStorage: boolean;
  loadFromStorage: () => void;
  addCustomMarker: (
    marker: Omit<DroMapCustomMarkerDefinition, "createdAt" | "updatedAt"> & {
      createdAt?: string;
      updatedAt?: string;
    },
  ) => DroMapCustomMarkerDefinition;
  updateCustomMarker: (
    markerId: string,
    patch: Partial<
      Pick<
        DroMapCustomMarkerDefinition,
        "name" | "dataUrl" | "elements" | "hiddenFromLibrary"
      >
    >,
  ) => void;
  removeCustomMarker: (markerId: string) => void;
  mergeCustomMarkers: (markers: DroMapCustomMarkerDefinition[]) => void;
  replaceCustomMarkers: (markers: DroMapCustomMarkerDefinition[]) => void;
};

function createId(prefix = "custom-marker") {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    ? Math.min(max, Math.max(min, numberValue))
    : fallback;
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : fallback;
}

function normalizePoint(value: unknown): DroMapDrawnMarkerPoint | null {
  if (!isRecord(value)) return null;
  return {
    x: clampNumber(value.x, 0, 0, CUSTOM_MARKER_CANVAS_SIZE),
    y: clampNumber(value.y, 0, 0, CUSTOM_MARKER_CANVAS_SIZE),
  };
}

function normalizeDrawnElement(
  value: unknown,
  index: number,
): DroMapDrawnMarkerElement | null {
  if (!isRecord(value)) return null;

  const id =
    typeof value.id === "string" && value.id.trim().length > 0
      ? value.id
      : `element-${index + 1}`;

  if (value.type === "line" || value.type === "arrow") {
    return {
      id,
      type: value.type,
      x1: clampNumber(value.x1, 80, 0, CUSTOM_MARKER_CANVAS_SIZE),
      y1: clampNumber(value.y1, 180, 0, CUSTOM_MARKER_CANVAS_SIZE),
      x2: clampNumber(value.x2, 280, 0, CUSTOM_MARKER_CANVAS_SIZE),
      y2: clampNumber(value.y2, 180, 0, CUSTOM_MARKER_CANVAS_SIZE),
      strokeColor: normalizeColor(value.strokeColor, "#111827"),
      strokeOpacity: clampNumber(value.strokeOpacity, 1, 0, 1),
      strokeWidth: clampNumber(value.strokeWidth, 2, 1, 40),
      dashStyle:
        value.dashStyle === "dashed" || value.dashStyle === "dotted"
          ? value.dashStyle
          : "solid",
      arrowStart: value.arrowStart === true,
      arrowEnd: value.arrowEnd === true || value.type === "arrow",
    };
  }

  if (value.type === "path") {
    const points = Array.isArray(value.points)
      ? value.points
          .map(normalizePoint)
          .filter((point): point is DroMapDrawnMarkerPoint => Boolean(point))
      : [];
    if (points.length < 2) return null;
    const rawPoints = Array.isArray(value.rawPoints)
      ? value.rawPoints
          .map(normalizePoint)
          .filter((point): point is DroMapDrawnMarkerPoint => Boolean(point))
      : points;
    return {
      id,
      type: "path",
      points,
      rawPoints: rawPoints.length >= 2 ? rawPoints : points,
      smoothing: clampNumber(value.smoothing, 45, 0, 100),
      closed: value.closed === true,
      fillEnabled: value.fillEnabled === true,
      fillColor: normalizeColor(value.fillColor, "#2563eb"),
      fillOpacity: clampNumber(value.fillOpacity, 0.25, 0, 1),
      strokeEnabled: value.strokeEnabled !== false,
      strokeColor: normalizeColor(value.strokeColor, "#111827"),
      strokeOpacity: clampNumber(value.strokeOpacity, 1, 0, 1),
      strokeWidth: clampNumber(value.strokeWidth, 2, 1, 40),
      dashStyle:
        value.dashStyle === "dashed" || value.dashStyle === "dotted"
          ? value.dashStyle
          : "solid",
      arrowStart: value.arrowStart === true,
      arrowEnd: value.arrowEnd === true,
      hatchingStyle:
        value.hatchingStyle === "diagonal-right" ||
        value.hatchingStyle === "diagonal-left" ||
        value.hatchingStyle === "horizontal" ||
        value.hatchingStyle === "vertical"
          ? value.hatchingStyle
          : "none",
      hatchingColor: normalizeColor(value.hatchingColor, "#111827"),
      hatchingWeight: clampNumber(value.hatchingWeight, 2, 0.5, 16),
      hatchingSpacing: clampNumber(value.hatchingSpacing, 14, 3, 80),
      dotsEnabled: value.dotsEnabled === true,
      dotsColor: normalizeColor(value.dotsColor, "#111827"),
      dotsRadius: clampNumber(value.dotsRadius, 2, 0.5, 12),
      dotsSpacing: clampNumber(value.dotsSpacing, 14, 3, 80),
    };
  }

  if (value.type === "text") {
    return {
      id,
      type: "text",
      x: clampNumber(value.x, 90, 0, CUSTOM_MARKER_CANVAS_SIZE),
      y: clampNumber(value.y, 145, 0, CUSTOM_MARKER_CANVAS_SIZE),
      width: clampNumber(value.width, 180, 28, CUSTOM_MARKER_CANVAS_SIZE),
      height: clampNumber(value.height, 70, 24, CUSTOM_MARKER_CANVAS_SIZE),
      rotation: clampNumber(value.rotation, 0, -180, 180),
      text:
        typeof value.text === "string" && value.text.trim().length > 0
          ? value.text
          : "Texte",
      fontSize: clampNumber(value.fontSize, 42, 10, 120),
      color: normalizeColor(value.color, "#111827"),
      opacity: clampNumber(value.opacity, 1, 0, 1),
      backgroundEnabled: value.backgroundEnabled === true,
      backgroundColor: normalizeColor(value.backgroundColor, "#ffffff"),
      backgroundOpacity: clampNumber(value.backgroundOpacity, 0.85, 0, 1),
      borderEnabled: value.borderEnabled === true,
      borderColor: normalizeColor(value.borderColor, "#111827"),
      borderWidth: clampNumber(value.borderWidth, 2, 0, 16),
    };
  }

  if (value.type === "shape") {
    const shape: DroMapDrawnMarkerShapeKind =
      value.shape === "ellipse" ||
      value.shape === "circle" ||
      value.shape === "triangle" ||
      value.shape === "diamond" ||
      value.shape === "star"
        ? value.shape
        : "rectangle";

    return {
      id,
      type: "shape",
      shape,
      x: clampNumber(value.x, 80, 0, CUSTOM_MARKER_CANVAS_SIZE),
      y: clampNumber(value.y, 80, 0, CUSTOM_MARKER_CANVAS_SIZE),
      width: clampNumber(value.width, 200, 8, CUSTOM_MARKER_CANVAS_SIZE),
      height: clampNumber(value.height, 200, 8, CUSTOM_MARKER_CANVAS_SIZE),
      rotation: clampNumber(value.rotation, 0, -180, 180),
      fillEnabled: value.fillEnabled === true,
      fillColor: normalizeColor(value.fillColor, "#2563eb"),
      fillOpacity: clampNumber(value.fillOpacity, 0.25, 0, 1),
      strokeEnabled: value.strokeEnabled !== false,
      strokeColor: normalizeColor(value.strokeColor, "#111827"),
      strokeOpacity: clampNumber(value.strokeOpacity, 1, 0, 1),
      strokeWidth: clampNumber(value.strokeWidth, 2, 0, 40),
      dashStyle:
        value.dashStyle === "dashed" || value.dashStyle === "dotted"
          ? value.dashStyle
          : "solid",
      hatchingStyle:
        value.hatchingStyle === "diagonal-right" ||
        value.hatchingStyle === "diagonal-left" ||
        value.hatchingStyle === "horizontal" ||
        value.hatchingStyle === "vertical"
          ? value.hatchingStyle
          : "none",
      hatchingColor: normalizeColor(value.hatchingColor, "#111827"),
      hatchingWeight: clampNumber(value.hatchingWeight, 2, 0.5, 16),
      hatchingSpacing: clampNumber(value.hatchingSpacing, 14, 3, 80),
      dotsEnabled: value.dotsEnabled === true,
      dotsColor: normalizeColor(value.dotsColor, "#111827"),
      dotsRadius: clampNumber(value.dotsRadius, 2, 0.5, 12),
      dotsSpacing: clampNumber(value.dotsSpacing, 14, 3, 80),
    };
  }

  return null;
}

export function normalizeCustomMarkerDefinitions(
  value: unknown,
): DroMapCustomMarkerDefinition[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];

    const kind = item.kind === "image" ? "image" : "drawn";
    const dataUrl = typeof item.dataUrl === "string" ? item.dataUrl : "";
    if (!dataUrl.startsWith("data:image/")) return [];

    const now = new Date().toISOString();
    const elements = Array.isArray(item.elements)
      ? item.elements
          .map((element, elementIndex) =>
            normalizeDrawnElement(element, elementIndex),
          )
          .filter((element): element is DroMapDrawnMarkerElement =>
            Boolean(element),
          )
      : undefined;

    return [
      {
        id:
          typeof item.id === "string" && item.id.trim().length > 0
            ? item.id
            : createId(`custom-marker-${index + 1}`),
        name:
          typeof item.name === "string" && item.name.trim().length > 0
            ? item.name.trim()
            : kind === "image"
              ? "Marqueur importé"
              : "Marqueur dessiné",
        kind,
        dataUrl,
        elements: kind === "drawn" ? elements : undefined,
        hiddenFromLibrary: item.hiddenFromLibrary === true,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : now,
      },
    ];
  });
}

function persist(markers: DroMapCustomMarkerDefinition[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      DROMAP_CUSTOM_MARKERS_STORAGE_KEY,
      JSON.stringify(markers),
    );
  } catch (error) {
    console.warn("Bibliothèque de marqueurs non sauvegardée :", error);
  }
}

export const useEditorTestCustomMarkersStore =
  create<EditorTestCustomMarkersState>((set, get) => ({
    customMarkers: [],
    hasLoadedFromStorage: false,

    loadFromStorage: () => {
      if (get().hasLoadedFromStorage || typeof window === "undefined") return;

      let markers: DroMapCustomMarkerDefinition[] = [];
      try {
        const raw = window.localStorage.getItem(
          DROMAP_CUSTOM_MARKERS_STORAGE_KEY,
        );
        markers = raw
          ? normalizeCustomMarkerDefinitions(JSON.parse(raw) as unknown)
          : [];
      } catch (error) {
        console.warn("Bibliothèque de marqueurs illisible :", error);
      }
      set({ customMarkers: markers, hasLoadedFromStorage: true });
    },

    addCustomMarker: (markerInput) => {
      const now = new Date().toISOString();
      const marker: DroMapCustomMarkerDefinition = {
        ...markerInput,
        hiddenFromLibrary: false,
        id: markerInput.id.trim().length > 0 ? markerInput.id : createId(),
        name: markerInput.name.trim() || "Mon marqueur",
        createdAt: markerInput.createdAt ?? now,
        updatedAt: markerInput.updatedAt ?? now,
      };
      const customMarkers = [
        marker,
        ...get().customMarkers.filter((item) => item.id !== marker.id),
      ];
      set({ customMarkers });
      persist(customMarkers);
      return marker;
    },

    updateCustomMarker: (markerId, patch) => {
      const customMarkers = get().customMarkers.map((marker) =>
        marker.id === markerId
          ? {
              ...marker,
              ...patch,
              name:
                typeof patch.name === "string"
                  ? patch.name.trim() || marker.name
                  : marker.name,
              updatedAt: new Date().toISOString(),
            }
          : marker,
      );
      set({ customMarkers });
      persist(customMarkers);
    },

    removeCustomMarker: (markerId) => {
      // On le retire de la bibliothèque sans casser les objets déjà placés,
      // la légende ni les anciens projets qui référencent encore son identifiant.
      const customMarkers = get().customMarkers.map((marker) =>
        marker.id === markerId
          ? {
              ...marker,
              hiddenFromLibrary: true,
              updatedAt: new Date().toISOString(),
            }
          : marker,
      );
      set({ customMarkers });
      persist(customMarkers);
    },

    mergeCustomMarkers: (markers) => {
      const normalized = normalizeCustomMarkerDefinitions(markers);
      const merged = new Map(
        get().customMarkers.map((marker) => [marker.id, marker]),
      );
      for (const marker of normalized) merged.set(marker.id, marker);
      const customMarkers = Array.from(merged.values()).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
      set({ customMarkers, hasLoadedFromStorage: true });
      persist(customMarkers);
    },

    replaceCustomMarkers: (markers) => {
      const customMarkers = normalizeCustomMarkerDefinitions(markers);
      set({ customMarkers, hasLoadedFromStorage: true });
      persist(customMarkers);
    },
  }));

export function getCustomMarkerById(markerId: string) {
  return useEditorTestCustomMarkersStore
    .getState()
    .customMarkers.find((marker) => marker.id === markerId);
}

export function createCustomMarkerId(kind: "drawn" | "image") {
  return createId(kind === "drawn" ? "drawn-marker" : "image-marker");
}
