import { create } from "zustand";

export const MIN_FEATURE_MAP_LABEL_SCALE = 0.5;
export const MAX_FEATURE_MAP_LABEL_SCALE = 2.5;
export const DEFAULT_FEATURE_MAP_LABEL_SCALE = 1;
export const MIN_FEATURE_MAP_LABEL_OUTLINE_WIDTH = 0;
export const MAX_FEATURE_MAP_LABEL_OUTLINE_WIDTH = 6;
export const DEFAULT_FEATURE_MAP_LABEL_OUTLINE_WIDTH = 1.5;

export type EditorFeatureMapLabelOffset = {
  x: number;
  y: number;
};

export type EditorFeatureMapLabelOffsets = Record<
  string,
  EditorFeatureMapLabelOffset
>;

function clampFeatureMapLabelOutlineWidth(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_FEATURE_MAP_LABEL_OUTLINE_WIDTH;
  }

  return Math.min(
    Math.max(value, MIN_FEATURE_MAP_LABEL_OUTLINE_WIDTH),
    MAX_FEATURE_MAP_LABEL_OUTLINE_WIDTH,
  );
}

function clampFeatureMapLabelScale(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_FEATURE_MAP_LABEL_SCALE;
  }

  return Math.min(
    Math.max(value, MIN_FEATURE_MAP_LABEL_SCALE),
    MAX_FEATURE_MAP_LABEL_SCALE,
  );
}

function clampRenderScale(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(value, 0.125), 8)
    : null;
}

function normalizeVisualZoom(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeOffsets(offsets: EditorFeatureMapLabelOffsets) {
  const normalized: EditorFeatureMapLabelOffsets = {};

  for (const [featureId, offset] of Object.entries(offsets)) {
    if (
      Number.isFinite(offset?.x) &&
      Number.isFinite(offset?.y)
    ) {
      normalized[featureId] = {
        x: offset.x,
        y: offset.y,
      };
    }
  }

  return normalized;
}

function offsetsAreEqual(
  first: EditorFeatureMapLabelOffsets,
  second: EditorFeatureMapLabelOffsets,
) {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);

  if (firstKeys.length !== secondKeys.length) {
    return false;
  }

  for (const key of firstKeys) {
    const firstOffset = first[key];
    const secondOffset = second[key];

    if (
      !secondOffset ||
      Math.abs(firstOffset.x - secondOffset.x) >= 0.01 ||
      Math.abs(firstOffset.y - secondOffset.y) >= 0.01
    ) {
      return false;
    }
  }

  return true;
}

type EditorTestMapLabelsState = {
  showAllFeatureLabels: boolean;
  showAllGeoJsonFeatureLabels: boolean;
  featureMapLabelScale: number;
  featureMapLabelOutlineWidth: number;
  editorFeatureMapLabelRenderScale: number | null;
  editorFeatureMapLabelVisualZoom: number | null;
  editorFeatureMapLabelOffsets: EditorFeatureMapLabelOffsets;
  setShowAllFeatureLabels: (show: boolean) => void;
  toggleShowAllFeatureLabels: () => void;
  setShowAllGeoJsonFeatureLabels: (show: boolean) => void;
  toggleShowAllGeoJsonFeatureLabels: () => void;
  setFeatureMapLabelScale: (scale: number) => void;
  setFeatureMapLabelOutlineWidth: (width: number) => void;
  setEditorFeatureMapLabelRenderScale: (scale: number | null) => void;
  setEditorFeatureMapLabelRenderContext: (
    scale: number | null,
    visualZoom: number | null,
    offsets?: EditorFeatureMapLabelOffsets,
  ) => void;
};

export const useEditorTestMapLabelsStore = create<EditorTestMapLabelsState>(
  (set) => ({
    showAllFeatureLabels: false,
    showAllGeoJsonFeatureLabels: false,
    featureMapLabelScale: DEFAULT_FEATURE_MAP_LABEL_SCALE,
    featureMapLabelOutlineWidth: DEFAULT_FEATURE_MAP_LABEL_OUTLINE_WIDTH,
    editorFeatureMapLabelRenderScale: null,
    editorFeatureMapLabelVisualZoom: null,
    editorFeatureMapLabelOffsets: {},
    setShowAllFeatureLabels: (showAllFeatureLabels) =>
      set({ showAllFeatureLabels }),
    toggleShowAllFeatureLabels: () =>
      set((state) => ({
        showAllFeatureLabels: !state.showAllFeatureLabels,
      })),
    setShowAllGeoJsonFeatureLabels: (showAllGeoJsonFeatureLabels) =>
      set({ showAllGeoJsonFeatureLabels }),
    toggleShowAllGeoJsonFeatureLabels: () =>
      set((state) => ({
        showAllGeoJsonFeatureLabels: !state.showAllGeoJsonFeatureLabels,
      })),
    setFeatureMapLabelScale: (featureMapLabelScale) =>
      set({
        featureMapLabelScale: clampFeatureMapLabelScale(featureMapLabelScale),
      }),
    setFeatureMapLabelOutlineWidth: (featureMapLabelOutlineWidth) =>
      set({
        featureMapLabelOutlineWidth: clampFeatureMapLabelOutlineWidth(
          featureMapLabelOutlineWidth,
        ),
      }),
    setEditorFeatureMapLabelRenderScale: (scale) =>
      set((state) => {
        const nextScale = clampRenderScale(scale);

        if (
          state.editorFeatureMapLabelRenderScale === nextScale ||
          (state.editorFeatureMapLabelRenderScale !== null &&
            nextScale !== null &&
            Math.abs(state.editorFeatureMapLabelRenderScale - nextScale) <
              0.0001)
        ) {
          return state;
        }

        return { editorFeatureMapLabelRenderScale: nextScale };
      }),
    setEditorFeatureMapLabelRenderContext: (scale, visualZoom, offsets = {}) =>
      set((state) => {
        const nextScale = clampRenderScale(scale);
        const nextVisualZoom = normalizeVisualZoom(visualZoom);
        const nextOffsets = normalizeOffsets(offsets);
        const sameScale =
          state.editorFeatureMapLabelRenderScale === nextScale ||
          (state.editorFeatureMapLabelRenderScale !== null &&
            nextScale !== null &&
            Math.abs(state.editorFeatureMapLabelRenderScale - nextScale) <
              0.0001);
        const sameZoom =
          state.editorFeatureMapLabelVisualZoom === nextVisualZoom ||
          (state.editorFeatureMapLabelVisualZoom !== null &&
            nextVisualZoom !== null &&
            Math.abs(state.editorFeatureMapLabelVisualZoom - nextVisualZoom) <
              0.0001);
        const sameOffsets = offsetsAreEqual(
          state.editorFeatureMapLabelOffsets,
          nextOffsets,
        );

        if (sameScale && sameZoom && sameOffsets) {
          return state;
        }

        return {
          editorFeatureMapLabelRenderScale: nextScale,
          editorFeatureMapLabelVisualZoom: nextVisualZoom,
          editorFeatureMapLabelOffsets: nextOffsets,
        };
      }),
  }),
);
