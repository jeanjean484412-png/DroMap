import L from "leaflet";

/** Bounds Leaflet sérialisables (zone de travail, hors features pédagogiques). */
export type WorkspaceBounds = {
  southWest: { lat: number; lng: number };
  northEast: { lat: number; lng: number };
};

export function boundsFromRectangle(layer: L.Rectangle): WorkspaceBounds {
  const bounds = layer.getBounds();
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();
  return {
    southWest: { lat: southWest.lat, lng: southWest.lng },
    northEast: { lat: northEast.lat, lng: northEast.lng },
  };
}

export function toLatLngBounds(bounds: WorkspaceBounds): L.LatLngBounds {
  return L.latLngBounds(
    [bounds.southWest.lat, bounds.southWest.lng],
    [bounds.northEast.lat, bounds.northEast.lng],
  );
}
