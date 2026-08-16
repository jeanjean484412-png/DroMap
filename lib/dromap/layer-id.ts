import type L from "leaflet";

type LayerWithDroMapId = L.Layer & { dromapFeatureId?: string };

export const DROMAP_FEATURE_ID_SET_EVENT = "dromap:feature-id-set";

export function setLayerFeatureId(layer: L.Layer, id: string): void {
  (layer as LayerWithDroMapId).dromapFeatureId = id;
  layer.fire(DROMAP_FEATURE_ID_SET_EVENT, { featureId: id });
}

export function getLayerFeatureId(layer: L.Layer): string | undefined {
  return (layer as LayerWithDroMapId).dromapFeatureId;
}
