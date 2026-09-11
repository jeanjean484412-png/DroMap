import type L from "leaflet";

import {
  isBoundaryFillZoneFeature,
  isFeatureGeometryLocked,
  isFeatureLocked,
  layerToDroMapFeature,
} from "@/lib/dromap/feature";
import { getLayerFeatureId, setLayerFeatureId } from "@/lib/dromap/layer-id";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { applyDrawingPresetToFeature } from "@/stores/editor-drawing-options";
import {
  isFeatureEffectivelyLocked,
  useEditorLayersStore,
} from "@/stores/editor-layers";
import { dispatchFeatureBodyDragPreview } from "@/lib/dromap/drag-preview";

type GeomanLayerEvent = {
  layer: L.Layer;
  shape: string;
};

type GeomanVertexDragEvent = GeomanLayerEvent & {
  indexPath?: number[];
};

type DromapGeomanLayer = L.Layer & {
  dromapBodyDragActive?: boolean;
  dromapBodyDragPreviewAnchor?: [number, number] | null;
  dromapEditHistoryCommitted?: boolean;
  dromapGeomanEventsBound?: boolean;
  dromapVertexDragActive?: boolean;
};

function getDromapLayer(layer: L.Layer): DromapGeomanLayer {
  return layer as DromapGeomanLayer;
}

function commitEditHistoryOnce(layer: L.Layer): void {
  const dromapLayer = getDromapLayer(layer);

  if (dromapLayer.dromapEditHistoryCommitted) {
    return;
  }

  useEditorFeaturesStore.getState().commitFeaturesHistory();
  dromapLayer.dromapEditHistoryCommitted = true;
}

function resetEditHistoryCommit(layer: L.Layer): void {
  const dromapLayer = getDromapLayer(layer);
  dromapLayer.dromapEditHistoryCommitted = false;
}

function getBodyDragPreviewAnchor(layer: L.Layer): [number, number] | null {
  const id = getLayerFeatureId(layer);
  if (!id) return null;

  const existing = useEditorFeaturesStore
    .getState()
    .features.find((feature) => feature.id === id);
  if (!existing) return null;

  const shape =
    existing.geometry.type === "Point"
      ? "Marker"
      : existing.geometry.type === "Polygon"
        ? "Polygon"
        : "Line";
  const feature = layerToDroMapFeature(layer, shape, existing);
  if (!feature) return null;

  if (feature.geometry.type === "Point") {
    return feature.geometry.coordinates;
  }

  if (feature.geometry.type === "LineString") {
    return feature.geometry.coordinates[0] ?? null;
  }

  return feature.geometry.coordinates[0]?.[0] ?? null;
}

function resetBodyDragPreview(layer: L.Layer): void {
  getDromapLayer(layer).dromapBodyDragPreviewAnchor =
    getBodyDragPreviewAnchor(layer);
}

function dispatchBodyDragPreview(layer: L.Layer): void {
  const dromapLayer = getDromapLayer(layer);
  const previousAnchor = dromapLayer.dromapBodyDragPreviewAnchor;
  const nextAnchor = getBodyDragPreviewAnchor(layer);

  dromapLayer.dromapBodyDragPreviewAnchor = nextAnchor;

  const featureId = getLayerFeatureId(layer);
  if (!featureId || !previousAnchor || !nextAnchor) return;

  const lngDelta = nextAnchor[0] - previousAnchor[0];
  const latDelta = nextAnchor[1] - previousAnchor[1];

  if (latDelta === 0 && lngDelta === 0) return;

  dispatchFeatureBodyDragPreview({
    featureId,
    sourceLayer: layer,
    latDelta,
    lngDelta,
  });
}

function dispatchFeatureGeometryPreviewEvent(layer: L.Layer): void {
  if (typeof window === "undefined") return;

  const id = getLayerFeatureId(layer);
  if (!id) return;

  const existing = useEditorFeaturesStore
    .getState()
    .features.find((feature) => feature.id === id);
  if (!existing || existing.geometry.type !== "LineString") return;

  const feature = layerToDroMapFeature(layer, "Line", existing);
  if (!feature || feature.geometry.type !== "LineString") return;

  window.dispatchEvent(
    new CustomEvent("dromap:feature-geometry-preview", {
      detail: {
        featureId: id,
        coordinates: feature.geometry.coordinates,
      },
    }),
  );
}

function dispatchFeatureDragLifecycleEvent(
  type: "dromap:feature-drag-start" | "dromap:feature-drag-end",
  layer: L.Layer,
): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(type, {
      detail: {
        featureId: getLayerFeatureId(layer) ?? null,
      },
    }),
  );
}

export function syncCreateToStore(event: GeomanLayerEvent): void {
  const feature = layerToDroMapFeature(event.layer, event.shape);
  if (!feature) return;

  const featureWithPreset = applyDrawingPresetToFeature(feature);

  setLayerFeatureId(event.layer, featureWithPreset.id);

  useEditorFeaturesStore
    .getState()
    .addFeatureWithHistory(featureWithPreset);
}

export function syncEditToStore(event: GeomanLayerEvent): void {
  const id = getLayerFeatureId(event.layer);
  if (!id) return;

  const existing = useEditorFeaturesStore
    .getState()
    .features.find((feature) => feature.id === id);

  if (
    isFeatureLocked(existing) ||
    isFeatureEffectivelyLocked(existing, useEditorLayersStore.getState().layers) ||
    isFeatureGeometryLocked(existing) ||
    isBoundaryFillZoneFeature(existing)
  ) return;

  const feature = layerToDroMapFeature(event.layer, event.shape, existing);
  if (!feature) return;

  useEditorFeaturesStore.getState().updateFeature(id, feature);
}

export function syncEditToStoreWithSessionHistory(
  event: GeomanLayerEvent,
): void {
  const id = getLayerFeatureId(event.layer);

  if (id) {
    const existing = useEditorFeaturesStore
      .getState()
      .features.find((feature) => feature.id === id);

    if (
    isFeatureLocked(existing) ||
    isFeatureEffectivelyLocked(existing, useEditorLayersStore.getState().layers) ||
    isFeatureGeometryLocked(existing) ||
    isBoundaryFillZoneFeature(existing)
  ) return;
  }

  commitEditHistoryOnce(event.layer);
  syncEditToStore(event);
}

export function syncDragEndToStoreWithHistory(event: GeomanLayerEvent): void {
  const id = getLayerFeatureId(event.layer);
  if (!id) return;

  const existing = useEditorFeaturesStore
    .getState()
    .features.find((feature) => feature.id === id);

  if (
    isFeatureLocked(existing) ||
    isFeatureEffectivelyLocked(existing, useEditorLayersStore.getState().layers) ||
    isFeatureGeometryLocked(existing) ||
    isBoundaryFillZoneFeature(existing)
  ) return;

  const feature = layerToDroMapFeature(event.layer, event.shape, existing);
  if (!feature) return;

  useEditorFeaturesStore
    .getState()
    .updateFeatureWithHistory(id, () => feature);
}

export function syncRemoveFromStore(event: GeomanLayerEvent): void {
  const id = getLayerFeatureId(event.layer);
  if (!id) return;

  const existing = useEditorFeaturesStore
    .getState()
    .features.find((feature) => feature.id === id);

  if (
    isFeatureLocked(existing) ||
    isFeatureEffectivelyLocked(existing, useEditorLayersStore.getState().layers) ||
    isFeatureGeometryLocked(existing) ||
    isBoundaryFillZoneFeature(existing)
  ) return;

  useEditorFeaturesStore.getState().removeFeatureWithHistory(id);
}

export function bindLayerGeomanEvents(layer: L.Layer): void {
  const dromapLayer = getDromapLayer(layer);

  if (dromapLayer.dromapGeomanEventsBound) {
    return;
  }

  dromapLayer.dromapGeomanEventsBound = true;

  const onEdit = (event: GeomanLayerEvent) => {
    const currentLayer = getDromapLayer(layer);
    if (
      currentLayer.dromapBodyDragActive ||
      currentLayer.dromapVertexDragActive
    ) return;

    syncEditToStoreWithSessionHistory(event);
  };

  const onMarkerDragStart = () => {
    getDromapLayer(layer).dromapVertexDragActive = true;
    commitEditHistoryOnce(layer);
    dispatchFeatureDragLifecycleEvent("dromap:feature-drag-start", layer);
    dispatchFeatureGeometryPreviewEvent(layer);
  };

  const onMarkerDrag: L.LeafletEventHandlerFn = () => {
    // La poignée Geoman se déplace en direct. La flèche DroMap visible, elle,
    // est une couche dérivée : on lui transmet donc la géométrie temporaire
    // sans réécrire le store à chaque pixel, ce qui évite de recréer les
    // poignées pendant le geste.
    dispatchFeatureGeometryPreviewEvent(layer);
  };

  const onMarkerDragEnd: L.LeafletEventHandlerFn = (leafletEvent) => {
    const event = leafletEvent as unknown as GeomanVertexDragEvent;

    dispatchFeatureGeometryPreviewEvent(layer);
    syncEditToStore(event);
    dispatchFeatureDragLifecycleEvent("dromap:feature-drag-end", layer);

    window.setTimeout(() => {
      getDromapLayer(layer).dromapVertexDragActive = false;
      resetEditHistoryCommit(layer);
    }, 0);
  };

  const onDragStart = () => {
    const dromapLayer = getDromapLayer(layer);
    dromapLayer.dromapBodyDragActive = true;
    resetBodyDragPreview(layer);
    dispatchFeatureDragLifecycleEvent("dromap:feature-drag-start", layer);
  };

  const onDrag = () => {
    dispatchBodyDragPreview(layer);
  };

  const onDragEnd = (event: GeomanLayerEvent) => {
    dispatchBodyDragPreview(layer);
    syncDragEndToStoreWithHistory(event);
    getDromapLayer(layer).dromapBodyDragPreviewAnchor = null;
    resetEditHistoryCommit(layer);
    dispatchFeatureDragLifecycleEvent("dromap:feature-drag-end", layer);

    window.setTimeout(() => {
      getDromapLayer(layer).dromapBodyDragActive = false;
    }, 0);
  };

  const onEditEnabled = () => {
    const dromapLayer = getDromapLayer(layer);
    dromapLayer.dromapBodyDragActive = false;
    dromapLayer.dromapBodyDragPreviewAnchor = null;
    dromapLayer.dromapVertexDragActive = false;
    resetEditHistoryCommit(layer);
  };

  const onEditDisabled = () => {
    const dromapLayer = getDromapLayer(layer);
    dromapLayer.dromapBodyDragActive = false;
    dromapLayer.dromapBodyDragPreviewAnchor = null;
    dromapLayer.dromapVertexDragActive = false;
    resetEditHistoryCommit(layer);
  };

  layer.on("pm:enable", onEditEnabled);
  layer.on("pm:disable", onEditDisabled);
  layer.on("pm:edit", onEdit);
  layer.on("pm:markerdragstart", onMarkerDragStart);
  layer.on("pm:markerdrag", onMarkerDrag);
  layer.on("pm:markerdragend", onMarkerDragEnd);
  layer.on("pm:dragstart", onDragStart);
  layer.on("pm:drag", onDrag);
  layer.on("pm:dragend", onDragEnd);
}
