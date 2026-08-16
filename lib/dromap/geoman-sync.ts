import type L from "leaflet";

import {
  isBoundaryFillZoneFeature,
  isFeatureGeometryLocked,
  isFeatureLocked,
  layerToDroMapFeature,
} from "@/lib/dromap/feature";
import { getLayerFeatureId, setLayerFeatureId } from "@/lib/dromap/layer-id";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { applyDrawingPresetToFeature } from "@/stores/editor-test-drawing-options";
import {
  isFeatureEffectivelyLocked,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";

type GeomanLayerEvent = {
  layer: L.Layer;
  shape: string;
};

type GeomanVertexDragEvent = GeomanLayerEvent & {
  indexPath?: number[];
};

type DromapGeomanLayer = L.Layer & {
  dromapEditHistoryCommitted?: boolean;
  dromapGeomanEventsBound?: boolean;
};

function getDromapLayer(layer: L.Layer): DromapGeomanLayer {
  return layer as DromapGeomanLayer;
}

function commitEditHistoryOnce(layer: L.Layer): void {
  const dromapLayer = getDromapLayer(layer);

  if (dromapLayer.dromapEditHistoryCommitted) {
    return;
  }

  useEditorTestFeaturesStore.getState().commitFeaturesHistory();
  dromapLayer.dromapEditHistoryCommitted = true;
}

function resetEditHistoryCommit(layer: L.Layer): void {
  const dromapLayer = getDromapLayer(layer);
  dromapLayer.dromapEditHistoryCommitted = false;
}

function dispatchFeatureGeometryPreviewEvent(layer: L.Layer): void {
  if (typeof window === "undefined") return;

  const id = getLayerFeatureId(layer);
  if (!id) return;

  const existing = useEditorTestFeaturesStore
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

  useEditorTestFeaturesStore
    .getState()
    .addFeatureWithHistory(featureWithPreset);
}

export function syncEditToStore(event: GeomanLayerEvent): void {
  const id = getLayerFeatureId(event.layer);
  if (!id) return;

  const existing = useEditorTestFeaturesStore
    .getState()
    .features.find((feature) => feature.id === id);

  if (
    isFeatureLocked(existing) ||
    isFeatureEffectivelyLocked(existing, useEditorTestLayersStore.getState().layers) ||
    isFeatureGeometryLocked(existing) ||
    isBoundaryFillZoneFeature(existing)
  ) return;

  const feature = layerToDroMapFeature(event.layer, event.shape, existing);
  if (!feature) return;

  useEditorTestFeaturesStore.getState().updateFeature(id, feature);
}

export function syncEditToStoreWithSessionHistory(
  event: GeomanLayerEvent,
): void {
  const id = getLayerFeatureId(event.layer);

  if (id) {
    const existing = useEditorTestFeaturesStore
      .getState()
      .features.find((feature) => feature.id === id);

    if (
    isFeatureLocked(existing) ||
    isFeatureEffectivelyLocked(existing, useEditorTestLayersStore.getState().layers) ||
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

  const existing = useEditorTestFeaturesStore
    .getState()
    .features.find((feature) => feature.id === id);

  if (
    isFeatureLocked(existing) ||
    isFeatureEffectivelyLocked(existing, useEditorTestLayersStore.getState().layers) ||
    isFeatureGeometryLocked(existing) ||
    isBoundaryFillZoneFeature(existing)
  ) return;

  const feature = layerToDroMapFeature(event.layer, event.shape, existing);
  if (!feature) return;

  useEditorTestFeaturesStore
    .getState()
    .updateFeatureWithHistory(id, () => feature);
}

export function syncRemoveFromStore(event: GeomanLayerEvent): void {
  const id = getLayerFeatureId(event.layer);
  if (!id) return;

  const existing = useEditorTestFeaturesStore
    .getState()
    .features.find((feature) => feature.id === id);

  if (
    isFeatureLocked(existing) ||
    isFeatureEffectivelyLocked(existing, useEditorTestLayersStore.getState().layers) ||
    isFeatureGeometryLocked(existing) ||
    isBoundaryFillZoneFeature(existing)
  ) return;

  useEditorTestFeaturesStore.getState().removeFeatureWithHistory(id);
}

export function bindLayerGeomanEvents(layer: L.Layer): void {
  const dromapLayer = getDromapLayer(layer);

  if (dromapLayer.dromapGeomanEventsBound) {
    return;
  }

  dromapLayer.dromapGeomanEventsBound = true;

  const onEdit = (event: GeomanLayerEvent) =>
    syncEditToStoreWithSessionHistory(event);

  const onMarkerDragStart = () => {
    commitEditHistoryOnce(layer);
    dispatchFeatureDragLifecycleEvent("dromap:feature-drag-start", layer);
    dispatchFeatureGeometryPreviewEvent(layer);
  };

  const onMarkerDrag = (_event: GeomanVertexDragEvent) => {
    // La poignée Geoman se déplace en direct. La flèche DroMap visible, elle,
    // est une couche dérivée : on lui transmet donc la géométrie temporaire
    // sans réécrire le store à chaque pixel, ce qui évite de recréer les
    // poignées pendant le geste.
    dispatchFeatureGeometryPreviewEvent(layer);
  };

  const onMarkerDragEnd = (event: GeomanVertexDragEvent) => {
    dispatchFeatureGeometryPreviewEvent(layer);
    syncEditToStore(event);
    resetEditHistoryCommit(layer);
    dispatchFeatureDragLifecycleEvent("dromap:feature-drag-end", layer);
  };

  const onDragStart = () => {
    // On mémorise l'état initial une seule fois, puis on synchronise la
    // géométrie pendant le drag sans créer une entrée d'historique par pixel.
    commitEditHistoryOnce(layer);
    dispatchFeatureDragLifecycleEvent("dromap:feature-drag-start", layer);
  };

  const onDrag = (event: GeomanLayerEvent) => {
    syncEditToStore(event);
  };

  const onDragEnd = (event: GeomanLayerEvent) => {
    syncEditToStore(event);
    resetEditHistoryCommit(layer);
    dispatchFeatureDragLifecycleEvent("dromap:feature-drag-end", layer);
  };

  const onEditEnabled = () => {
    resetEditHistoryCommit(layer);
  };

  const onEditDisabled = () => {
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