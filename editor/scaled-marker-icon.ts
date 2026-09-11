import L from "leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { getFeatureMarkerSize } from "./feature-style";
import { getMarkerSymbolHtml } from "./marker-symbol";

const MIN_EDITOR_MARKER_DISPLAY_SIZE = 1;
const MAX_EDITOR_MARKER_DISPLAY_SIZE = 720;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSafeZoom(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

export function getEditorMarkerScale(
  map: L.Map,
  workspaceBasemapZoom: number | null,
) {
  const currentZoom = getSafeZoom(map.getZoom());
  const referenceZoom = getSafeZoom(workspaceBasemapZoom);

  if (currentZoom === null || referenceZoom === null) {
    return 1;
  }

  return Math.pow(2, currentZoom - referenceZoom);
}

export function getEditorMarkerDisplaySize(
  feature: DroMapFeature,
  map: L.Map,
  workspaceBasemapZoom: number | null,
) {
  const baseSize = getFeatureMarkerSize(feature);
  const scaledSize = baseSize * getEditorMarkerScale(map, workspaceBasemapZoom);

  return clamp(
    Math.round(scaledSize * 100) / 100,
    MIN_EDITOR_MARKER_DISPLAY_SIZE,
    MAX_EDITOR_MARKER_DISPLAY_SIZE,
  );
}

export function createEditorMarkerLeafletIcon(
  feature: DroMapFeature,
  leaflet: typeof L,
  map: L.Map,
  workspaceBasemapZoom: number | null,
) {
  const markerSize = getEditorMarkerDisplaySize(
    feature,
    map,
    workspaceBasemapZoom,
  );

  return leaflet.divIcon({
    className: "dromap-marker-icon",
    iconSize: [markerSize, markerSize],
    iconAnchor: [markerSize / 2, markerSize / 2],
    html: getMarkerSymbolHtml(feature, { size: markerSize }),
  });
}

export function syncEditorMarkerIconSizes(
  map: L.Map,
  features: DroMapFeature[],
  leaflet: typeof L,
  workspaceBasemapZoom: number | null,
) {
  const markerFeaturesById = new Map(
    features
      .filter(
        (feature) =>
          feature.properties.type === "marker" && feature.geometry.type === "Point",
      )
      .map((feature) => [feature.id, feature]),
  );

  map.eachLayer((layer) => {
    const featureId = (layer as L.Layer & { dromapFeatureId?: string })
      .dromapFeatureId;

    if (!featureId || !(layer instanceof L.Marker)) {
      return;
    }

    const feature = markerFeaturesById.get(featureId);

    if (!feature) {
      return;
    }

    layer.setIcon(
      createEditorMarkerLeafletIcon(feature, leaflet, map, workspaceBasemapZoom),
    );
  });
}
