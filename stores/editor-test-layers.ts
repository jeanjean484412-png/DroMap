import { create } from "zustand";

import type { DroMapFeature } from "@/lib/dromap/feature";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { isDromapFeatureLoadedInWorkspace } from "@/lib/dromap/workspace-object-loading";

export const DEFAULT_DROMAP_LAYER_ID = "dromap-layer-default";
export const DEFAULT_DROMAP_LAYER_NAME = "Calque 1";

const DROMAP_SAVED_LAYERS_STORAGE_KEY = "dromap-editor-test-saved-layers-v1";
const MIN_LAYER_OPACITY = 0;
const MAX_LAYER_OPACITY = 1;
const LAYER_ORDER_STEP = 1000;

export type DroMapLayer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  sourceSavedLayerId?: string;
};

export type DroMapSavedLayerLegendConfig = {
  title?: string;
  hiddenFeatureIds?: string[];
  featureOrder?: string[];
  groupOrder?: string[];
  sectionOrder?: string[];
  groupLabels?: Record<string, string>;
  groupSections?: Record<string, string>;
};

export type DroMapSavedLayer = {
  id: string;
  name: string;
  savedAt: string;
  features: DroMapFeature[];
  legend?: DroMapSavedLayerLegendConfig;
};

type EditorTestLayersState = {
  layers: DroMapLayer[];
  activeLayerId: string;
  savedLayers: DroMapSavedLayer[];

  ensureDefaultLayer: () => void;
  setLayers: (layers: DroMapLayer[], activeLayerId?: string | null) => void;
  syncLayersForFeatures: (features: DroMapFeature[]) => void;
  setActiveLayerId: (layerId: string) => void;
  createLayer: (name?: string) => string;
  renameLayer: (layerId: string, name: string) => void;
  deleteLayer: (layerId: string) => void;
  toggleLayerVisibility: (layerId: string) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  toggleLayerLocked: (layerId: string) => void;
  moveLayer: (layerId: string, direction: "up" | "down") => void;

  loadSavedLayersFromStorage: () => void;
  saveLayerToLibrary: (savedLayer: DroMapSavedLayer) => void;
  renameSavedLayer: (savedLayerId: string, name: string) => void;
  deleteSavedLayer: (savedLayerId: string) => void;
};

function nowIso() {
  return new Date().toISOString();
}

function createLayerId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `dromap-layer-${crypto.randomUUID()}`;
  }

  return `dromap-layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createSavedLayerId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `dromap-saved-layer-${crypto.randomUUID()}`;
  }

  return `dromap-saved-layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createDefaultDromapLayer(): DroMapLayer {
  const timestamp = nowIso();

  return {
    id: DEFAULT_DROMAP_LAYER_ID,
    name: DEFAULT_DROMAP_LAYER_NAME,
    visible: true,
    opacity: 1,
    locked: false,
    order: LAYER_ORDER_STEP,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDromapLayer(name?: string, order = LAYER_ORDER_STEP): DroMapLayer {
  const timestamp = nowIso();
  const trimmedName = name?.trim();

  return {
    id: createLayerId(),
    name: trimmedName || "Nouveau calque",
    visible: true,
    opacity: 1,
    locked: false,
    order,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDromapSavedLayer(input: {
  name: string;
  features: DroMapFeature[];
  legend?: DroMapSavedLayerLegendConfig;
}): DroMapSavedLayer {
  return {
    id: createSavedLayerId(),
    name: input.name.trim() || "Calque enregistré",
    savedAt: nowIso(),
    features: cloneJsonValue(input.features),
    ...(input.legend ? { legend: cloneJsonValue(input.legend) } : {}),
  };
}

function clampLayerOpacity(opacity: number) {
  if (!Number.isFinite(opacity)) {
    return 1;
  }

  return Math.max(MIN_LAYER_OPACITY, Math.min(MAX_LAYER_OPACITY, opacity));
}

function cloneJsonValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeLayerName(name: unknown, fallback: string) {
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}

function normalizeLayer(layer: Partial<DroMapLayer>, index: number): DroMapLayer {
  const fallback = createDefaultDromapLayer();
  const id = typeof layer.id === "string" && layer.id.trim() ? layer.id : createLayerId();
  const timestamp = nowIso();

  return {
    id,
    name: normalizeLayerName(layer.name, index === 0 ? DEFAULT_DROMAP_LAYER_NAME : `Calque ${index + 1}`),
    visible: layer.visible !== false,
    opacity: clampLayerOpacity(typeof layer.opacity === "number" ? layer.opacity : 1),
    locked: layer.locked === true,
    order:
      typeof layer.order === "number" && Number.isFinite(layer.order)
        ? layer.order
        : (index + 1) * LAYER_ORDER_STEP,
    createdAt: typeof layer.createdAt === "string" ? layer.createdAt : fallback.createdAt,
    updatedAt: typeof layer.updatedAt === "string" ? layer.updatedAt : timestamp,
    ...(typeof layer.sourceSavedLayerId === "string" && layer.sourceSavedLayerId.trim()
      ? { sourceSavedLayerId: layer.sourceSavedLayerId.trim() }
      : {}),
  };
}

export function normalizeDromapLayers(layers: unknown): DroMapLayer[] {
  if (!Array.isArray(layers)) {
    return [createDefaultDromapLayer()];
  }

  const normalized = layers
    .filter((layer): layer is Partial<DroMapLayer> => typeof layer === "object" && layer !== null)
    .map(normalizeLayer)
    .sort((a, b) => a.order - b.order);

  if (normalized.length === 0) {
    return [];
  }

  return renormalizeLayerOrders(normalized);
}

function renormalizeLayerOrders(layers: DroMapLayer[]) {
  return layers.map((layer, index) => ({
    ...layer,
    order: (index + 1) * LAYER_ORDER_STEP,
  }));
}

export function getFeatureLayerId(feature: DroMapFeature | null | undefined) {
  const layerId = feature?.properties?.layerId;

  return typeof layerId === "string" && layerId.trim()
    ? layerId
    : DEFAULT_DROMAP_LAYER_ID;
}

export function setFeatureLayerId(
  feature: DroMapFeature,
  layerId: string,
): DroMapFeature {
  const safeLayerId = layerId.trim() || DEFAULT_DROMAP_LAYER_ID;

  if (feature.properties.layerId === safeLayerId) {
    return feature;
  }

  return {
    ...feature,
    properties: {
      ...feature.properties,
      layerId: safeLayerId,
      meta: { version: 1 },
    },
  };
}

export function ensureFeatureHasLayerId(
  feature: DroMapFeature,
  fallbackLayerId = DEFAULT_DROMAP_LAYER_ID,
): DroMapFeature {
  return setFeatureLayerId(feature, getFeatureLayerId(feature) || fallbackLayerId);
}

function getLayerById(layers: DroMapLayer[], layerId: string) {
  const exactLayer = layers.find((layer) => layer.id === layerId);

  if (exactLayer) {
    return exactLayer;
  }

  if (layerId === DEFAULT_DROMAP_LAYER_ID || layers.length === 0) {
    return createDefaultDromapLayer();
  }

  return layers[0] ?? createDefaultDromapLayer();
}

export function getLayerForFeature(
  feature: DroMapFeature | null | undefined,
  layers: DroMapLayer[],
) {
  return getLayerById(layers, getFeatureLayerId(feature));
}

export function isFeatureLayerVisible(
  feature: DroMapFeature | null | undefined,
  layers: DroMapLayer[],
) {
  return getLayerForFeature(feature, layers).visible !== false;
}

export function getFeatureLayerOpacity(
  feature: DroMapFeature | null | undefined,
  layers: DroMapLayer[],
) {
  return clampLayerOpacity(getLayerForFeature(feature, layers).opacity);
}

export function isFeatureLayerLocked(
  feature: DroMapFeature | null | undefined,
  layers: DroMapLayer[],
) {
  return getLayerForFeature(feature, layers).locked === true;
}

export function isFeatureEffectivelyLocked(
  feature: DroMapFeature | null | undefined,
  layers: DroMapLayer[],
) {
  const lockOverride = feature?.properties.lockOverride;

  return (
    feature?.properties.locked === true ||
    lockOverride === "locked" ||
    isFeatureLayerLocked(feature, layers)
  );
}

function multiplyOptionalOpacity(value: number | undefined, layerOpacity: number) {
  const baseOpacity = typeof value === "number" && Number.isFinite(value) ? value : 1;

  return Math.max(0, Math.min(1, baseOpacity * layerOpacity));
}

export function applyLayerOpacityToFeature(
  feature: DroMapFeature,
  layers: DroMapLayer[],
): DroMapFeature {
  const layer = getLayerForFeature(feature, layers);
  const layerOpacity = clampLayerOpacity(layer.opacity);
  const style = feature.properties.style ?? {};

  return {
    ...feature,
    properties: {
      ...feature.properties,
      layerRenderOrder: layer.order,
      style:
        layerOpacity >= 0.999
          ? style
          : {
              ...style,
              opacity: multiplyOptionalOpacity(style.opacity, layerOpacity),
              fillOpacity:
                feature.properties.type === "zone"
                  ? multiplyOptionalOpacity(style.fillOpacity, layerOpacity)
                  : style.fillOpacity,
              textBackgroundOpacity:
                feature.properties.type === "text"
                  ? multiplyOptionalOpacity(style.textBackgroundOpacity, layerOpacity)
                  : style.textBackgroundOpacity,
            },
    },
  };
}

export function getRenderableFeaturesForLayers(
  features: DroMapFeature[],
  layers: DroMapLayer[],
  options: { applyOpacity?: boolean; workspaceBounds?: WorkspaceBounds | null } = {},
) {
  const visibleFeatures = features.filter((feature) =>
    isFeatureLayerVisible(feature, layers) &&
    isDromapFeatureLoadedInWorkspace(feature, options.workspaceBounds),
  );

  const orderedByLayer = visibleFeatures.sort((a, b) => {
    const layerA = getLayerForFeature(a, layers);
    const layerB = getLayerForFeature(b, layers);
    const layerOrderDiff = layerA.order - layerB.order;

    if (layerOrderDiff !== 0) {
      return layerOrderDiff;
    }

    return 0;
  });

  return orderedByLayer.map((feature) => {
    const layer = getLayerForFeature(feature, layers);

    if (options.applyOpacity === false) {
      return {
        ...feature,
        properties: {
          ...feature.properties,
          layerRenderOrder: layer.order,
        },
      };
    }

    return applyLayerOpacityToFeature(feature, layers);
  });
}

function persistSavedLayers(savedLayers: DroMapSavedLayer[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      DROMAP_SAVED_LAYERS_STORAGE_KEY,
      JSON.stringify(savedLayers),
    );
  } catch {
    // La base locale de calques ne doit jamais casser l'éditeur.
  }
}

function parseSavedLayers(value: unknown): DroMapSavedLayer[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is DroMapSavedLayer => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const candidate = item as Partial<DroMapSavedLayer>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.savedAt === "string" &&
        Array.isArray(candidate.features)
      );
    })
    .map((item) => ({
      id: item.id,
      name: item.name,
      savedAt: item.savedAt,
      features: cloneJsonValue(item.features),
      ...(item.legend ? { legend: cloneJsonValue(item.legend) } : {}),
    }));
}

function loadSavedLayersFromStorageValue() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DROMAP_SAVED_LAYERS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    return parseSavedLayers(JSON.parse(raw));
  } catch {
    return [];
  }
}

export const useEditorTestLayersStore = create<EditorTestLayersState>((set, get) => ({
  layers: [createDefaultDromapLayer()],
  activeLayerId: DEFAULT_DROMAP_LAYER_ID,
  savedLayers: [],

  ensureDefaultLayer: () =>
    set((state) => {
      if (state.layers.length > 0) {
        return state;
      }

      return {
        layers: [createDefaultDromapLayer()],
        activeLayerId: DEFAULT_DROMAP_LAYER_ID,
      };
    }),

  setLayers: (layers, activeLayerId) =>
    set(() => {
      const normalizedLayers = normalizeDromapLayers(layers);

      if (normalizedLayers.length === 0) {
        return {
          layers: [],
          activeLayerId: "",
        };
      }

      const requestedActiveLayerId = activeLayerId ?? normalizedLayers[0]?.id ?? DEFAULT_DROMAP_LAYER_ID;
      const safeActiveLayerId = normalizedLayers.some((layer) => layer.id === requestedActiveLayerId)
        ? requestedActiveLayerId
        : normalizedLayers[0]?.id ?? DEFAULT_DROMAP_LAYER_ID;

      return {
        layers: normalizedLayers,
        activeLayerId: safeActiveLayerId,
      };
    }),

  syncLayersForFeatures: (features) =>
    set((state) => {
      if (state.layers.length === 0) {
        return { layers: [], activeLayerId: "" };
      }

      const currentLayers = normalizeDromapLayers(state.layers);
      const layerIds = new Set(currentLayers.map((layer) => layer.id));
      let nextLayers = currentLayers;
      let changed = false;

      for (const feature of features) {
        const layerId = getFeatureLayerId(feature);
        if (layerIds.has(layerId)) {
          continue;
        }

        const timestamp = nowIso();
        layerIds.add(layerId);
        nextLayers = [
          ...nextLayers,
          {
            id: layerId,
            name: `Calque ${nextLayers.length + 1}`,
            visible: true,
            opacity: 1,
            locked: false,
            order: (nextLayers.length + 1) * LAYER_ORDER_STEP,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ];
        changed = true;
      }

      const activeLayerId = nextLayers.some((layer) => layer.id === state.activeLayerId)
        ? state.activeLayerId
        : nextLayers[0]?.id ?? DEFAULT_DROMAP_LAYER_ID;

      return changed
        ? { layers: renormalizeLayerOrders(nextLayers), activeLayerId }
        : { layers: currentLayers, activeLayerId };
    }),

  setActiveLayerId: (layerId) =>
    set((state) => {
      if (!state.layers.some((layer) => layer.id === layerId)) {
        return state;
      }

      return { activeLayerId: layerId };
    }),

  createLayer: (name) => {
    const currentLayers = get().layers;
    const nextLayer = createDromapLayer(
      name ?? `Calque ${currentLayers.length + 1}`,
      (currentLayers.length + 1) * LAYER_ORDER_STEP,
    );

    set((state) => ({
      layers: renormalizeLayerOrders([...state.layers, nextLayer]),
      activeLayerId: nextLayer.id,
    }));

    return nextLayer.id;
  },

  renameLayer: (layerId, name) =>
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              name: name.trim() || layer.name,
              updatedAt: nowIso(),
            }
          : layer,
      ),
    })),

  deleteLayer: (layerId) =>
    set((state) => {
      const nextLayers = renormalizeLayerOrders(
        state.layers.filter((layer) => layer.id !== layerId),
      );

      return {
        layers: nextLayers,
        activeLayerId:
          nextLayers.length === 0
            ? ""
            : state.activeLayerId === layerId
              ? nextLayers[0]?.id ?? DEFAULT_DROMAP_LAYER_ID
              : state.activeLayerId,
      };
    }),

  toggleLayerVisibility: (layerId) =>
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === layerId
          ? { ...layer, visible: !layer.visible, updatedAt: nowIso() }
          : layer,
      ),
    })),

  setLayerOpacity: (layerId, opacity) =>
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === layerId
          ? { ...layer, opacity: clampLayerOpacity(opacity), updatedAt: nowIso() }
          : layer,
      ),
    })),

  toggleLayerLocked: (layerId) =>
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === layerId
          ? { ...layer, locked: !layer.locked, updatedAt: nowIso() }
          : layer,
      ),
    })),

  moveLayer: (layerId, direction) =>
    set((state) => {
      const sortedLayers = [...state.layers].sort((a, b) => a.order - b.order);
      const currentIndex = sortedLayers.findIndex((layer) => layer.id === layerId);

      if (currentIndex < 0) {
        return state;
      }

      const targetIndex = direction === "up" ? currentIndex + 1 : currentIndex - 1;

      if (targetIndex < 0 || targetIndex >= sortedLayers.length) {
        return state;
      }

      const nextLayers = [...sortedLayers];
      const [movedLayer] = nextLayers.splice(currentIndex, 1);

      if (!movedLayer) {
        return state;
      }

      nextLayers.splice(targetIndex, 0, movedLayer);

      return { layers: renormalizeLayerOrders(nextLayers) };
    }),

  loadSavedLayersFromStorage: () =>
    set({ savedLayers: loadSavedLayersFromStorageValue() }),

  saveLayerToLibrary: (savedLayer) =>
    set((state) => {
      const nextSavedLayers = [savedLayer, ...state.savedLayers];
      persistSavedLayers(nextSavedLayers);
      return { savedLayers: nextSavedLayers };
    }),

  renameSavedLayer: (savedLayerId, name) =>
    set((state) => {
      const nextSavedLayers = state.savedLayers.map((savedLayer) =>
        savedLayer.id === savedLayerId
          ? { ...savedLayer, name: name.trim() || savedLayer.name }
          : savedLayer,
      );
      persistSavedLayers(nextSavedLayers);
      return { savedLayers: nextSavedLayers };
    }),

  deleteSavedLayer: (savedLayerId) =>
    set((state) => {
      const nextSavedLayers = state.savedLayers.filter(
        (savedLayer) => savedLayer.id !== savedLayerId,
      );
      persistSavedLayers(nextSavedLayers);
      return { savedLayers: nextSavedLayers };
    }),
}));

export function getActiveDromapLayerId() {
  const state = useEditorTestLayersStore.getState();

  if (state.layers.length === 0) {
    return null;
  }

  return state.layers.some((layer) => layer.id === state.activeLayerId)
    ? state.activeLayerId
    : state.layers[0]?.id ?? DEFAULT_DROMAP_LAYER_ID;
}

export function assignFeatureToActiveLayer(feature: DroMapFeature) {
  const activeLayerId = getActiveDromapLayerId();

  return activeLayerId ? setFeatureLayerId(feature, activeLayerId) : feature;
}
