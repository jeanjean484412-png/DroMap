import type L from "leaflet";

import { layerToDroMapFeature } from "@/lib/dromap/feature";
import { getLayerFeatureId, setLayerFeatureId } from "@/lib/dromap/layer-id";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { applyDrawingPresetToFeature } from "@/stores/editor-test-drawing-options";

type GeomanLayerEvent = {
  layer: L.Layer;
  shape: string;
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

  const feature = layerToDroMapFeature(event.layer, event.shape, existing);
  if (!feature) return;

  useEditorTestFeaturesStore.getState().updateFeature(id, feature);
}

export function syncEditToStoreWithSessionHistory(
  event: GeomanLayerEvent,
): void {
  commitEditHistoryOnce(event.layer);
  syncEditToStore(event);
}

export function syncDragEndToStoreWithHistory(event: GeomanLayerEvent): void {
  const id = getLayerFeatureId(event.layer);
  if (!id) return;

  const existing = useEditorTestFeaturesStore
    .getState()
    .features.find((feature) => feature.id === id);

  const feature = layerToDroMapFeature(event.layer, event.shape, existing);
  if (!feature) return;

  useEditorTestFeaturesStore
    .getState()
    .updateFeatureWithHistory(id, () => feature);
}

export function syncRemoveFromStore(event: GeomanLayerEvent): void {
  const id = getLayerFeatureId(event.layer);
  if (!id) return;

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

  const onDragEnd = (event: GeomanLayerEvent) =>
    syncDragEndToStoreWithHistory(event);

  const onEditEnabled = () => {
    resetEditHistoryCommit(layer);
  };

  const onEditDisabled = () => {
    resetEditHistoryCommit(layer);
  };

  layer.on("pm:enable", onEditEnabled);
  layer.on("pm:disable", onEditDisabled);
  layer.on("pm:edit", onEdit);
  layer.on("pm:dragend", onDragEnd);
}