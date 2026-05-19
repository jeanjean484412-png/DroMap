import type L from "leaflet";

import { layerToDroMapFeature } from "@/lib/dromap/feature";
import { getLayerFeatureId, setLayerFeatureId } from "@/lib/dromap/layer-id";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";

type GeomanLayerEvent = {
  layer: L.Layer;
  shape: string;
};

export function syncCreateToStore(event: GeomanLayerEvent): void {
  const feature = layerToDroMapFeature(event.layer, event.shape);
  if (!feature) return;

  setLayerFeatureId(event.layer, feature.id);
  useEditorTestFeaturesStore.getState().addFeature(feature);
}

export function syncEditToStore(event: GeomanLayerEvent): void {
  const id = getLayerFeatureId(event.layer);
  if (!id) return;

  const existing = useEditorTestFeaturesStore
    .getState()
    .features.find((f) => f.id === id);

  const feature = layerToDroMapFeature(event.layer, event.shape, existing);
  if (!feature) return;

  useEditorTestFeaturesStore.getState().updateFeature(id, feature);
}

export function syncRemoveFromStore(event: GeomanLayerEvent): void {
  const id = getLayerFeatureId(event.layer);
  if (!id) return;

  useEditorTestFeaturesStore.getState().removeFeature(id);
}

export function bindLayerGeomanEvents(layer: L.Layer): void {
  const onEdit = (e: GeomanLayerEvent) => syncEditToStore(e);
  layer.on("pm:edit", onEdit);
  layer.on("pm:dragend", onEdit);
}
