import type L from "leaflet";

type LayerWithDroMapId = L.Layer & { dromapFeatureId?: string };

export function setLayerFeatureId(layer: L.Layer, id: string): void {
  (layer as LayerWithDroMapId).dromapFeatureId = id;
}

export function getLayerFeatureId(layer: L.Layer): string | undefined {
  return (layer as LayerWithDroMapId).dromapFeatureId;
}
