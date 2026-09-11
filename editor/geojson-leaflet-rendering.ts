"use client";

import L from "leaflet";

import {
  getGeoJsonLayerLoadedDisplayData,
  type DromapGeoJsonFeature,
  type DromapGeoJsonLayer,
} from "@/stores/editor-geojson-layers";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import {
  getEffectiveGeoJsonFeatureStyle,
  getGeoJsonDashArray,
} from "./geojson-layer-style";

const GEOJSON_PANE_PREFIX = "dromap-geojson-layer-pane-";
const GEOJSON_PANE_BASE_Z_INDEX = 410;
const GEOJSON_PANE_STEP = 4;
const GEOJSON_PANE_MAX_Z_INDEX = 19_990;

export type DromapLeafletGeoJsonLayer = L.Layer & {
  dromapGeoJsonLayerId?: string;
  feature?: DromapGeoJsonFeature;
};

type LeafletMapWithPaneInternals = L.Map & {
  _panes?: Record<string, HTMLElement>;
  _paneRenderers?: Record<string, L.Renderer>;
};

export function getWorkspaceLoadingKey(workspaceBounds: WorkspaceBounds | null | undefined) {
  if (!workspaceBounds) {
    return "all";
  }

  return [
    workspaceBounds.southWest.lat,
    workspaceBounds.southWest.lng,
    workspaceBounds.northEast.lat,
    workspaceBounds.northEast.lng,
  ]
    .map((value) => value.toFixed(6))
    .join(":");
}

function encodePaneId(value: string) {
  // Encodage injectif : deux identifiants arbitraires de projet ne doivent
  // jamais partager un pane (par exemple `foo/bar` et `foo?bar`).
  return Array.from(value, (character) =>
    character.codePointAt(0)?.toString(16) ?? "0",
  ).join("-");
}

export function getGeoJsonPaneName(layerId: string) {
  return `${GEOJSON_PANE_PREFIX}${encodePaneId(layerId)}`;
}

export function ensureGeoJsonPane(
  map: L.Map,
  layer: DromapGeoJsonLayer,
  index: number,
  options: { capBelowWorkspaceMask?: boolean } = {},
) {
  const paneName = getGeoJsonPaneName(layer.id);
  const pane = map.getPane(paneName) ?? map.createPane(paneName);
  const requestedZIndex = GEOJSON_PANE_BASE_Z_INDEX + index * GEOJSON_PANE_STEP;

  // Le masque de zone reste à 20 000. Même avec un nombre anormalement élevé
  // de calques, aucun renderer GeoJSON ne doit pouvoir passer devant lui.
  pane.style.zIndex = String(
    options.capBelowWorkspaceMask
      ? Math.min(requestedZIndex, GEOJSON_PANE_MAX_Z_INDEX)
      : requestedZIndex,
  );
  pane.style.pointerEvents = layer.locked ? "none" : "auto";

  return paneName;
}

export function getGeoJsonLayerPathOptions(
  layer: DromapGeoJsonLayer,
  feature: DromapGeoJsonFeature | null | undefined,
  paneName: string,
  renderer?: L.Renderer,
): L.PathOptions & { pane: string; pmIgnore: boolean } {
  const style = getEffectiveGeoJsonFeatureStyle(layer, feature);
  const layerOpacity = Math.max(0, Math.min(1, layer.opacity));
  const strokeOpacity = Math.max(0, Math.min(1, style.strokeOpacity * layerOpacity));
  const fillOpacity = Math.max(0, Math.min(1, style.fillOpacity * layerOpacity));

  return {
    pane: paneName,
    ...(renderer ? { renderer } : {}),
    pmIgnore: true,
    interactive: !layer.locked,
    bubblingMouseEvents: false,
    stroke: strokeOpacity > 0,
    fill: style.zoneFillEnabled && fillOpacity > 0,
    color: style.strokeColor,
    weight: Math.max(1, style.strokeWeight),
    opacity: strokeOpacity,
    fillColor: style.fillColor,
    fillOpacity,
    dashArray: getGeoJsonDashArray(style),
    lineCap: "round",
    lineJoin: "round",
    className: "dromap-geojson-layer",
  };
}

export function getGeoJsonLayerPointOptions(
  layer: DromapGeoJsonLayer,
  feature: DromapGeoJsonFeature | null | undefined,
  paneName: string,
  renderer?: L.Renderer,
): L.CircleMarkerOptions & { pane: string; pmIgnore: boolean } {
  const style = getEffectiveGeoJsonFeatureStyle(layer, feature);
  const layerOpacity = Math.max(0, Math.min(1, layer.opacity));
  const pointOpacity = Math.max(0, Math.min(1, style.strokeOpacity * layerOpacity));

  return {
    ...getGeoJsonLayerPathOptions(layer, feature, paneName, renderer),
    stroke: pointOpacity > 0,
    fill: pointOpacity > 0,
    radius: Math.max(2, style.markerSize / 2),
    color: style.strokeColor,
    fillColor: style.strokeColor,
    opacity: pointOpacity,
    fillOpacity: pointOpacity,
  };
}

export function markGeoJsonLayer(layer: L.Layer, layerId: string) {
  (layer as DromapLeafletGeoJsonLayer).dromapGeoJsonLayerId = layerId;

  const group = layer as L.LayerGroup;
  if (typeof group.eachLayer === "function") {
    group.eachLayer((childLayer) => markGeoJsonLayer(childLayer, layerId));
  }
}

function setGeoJsonFeatureReference(layer: L.Layer, feature: DromapGeoJsonFeature) {
  (layer as DromapLeafletGeoJsonLayer).feature = feature;

  const group = layer as L.LayerGroup;
  if (typeof group.eachLayer === "function") {
    group.eachLayer((childLayer) => setGeoJsonFeatureReference(childLayer, feature));
  }
}

export function applyLeafletGeoJsonFeatureStyle(
  featureLayer: L.Layer,
  feature: DromapGeoJsonFeature,
  layer: DromapGeoJsonLayer,
  paneName: string,
  renderer?: L.Renderer,
) {
  setGeoJsonFeatureReference(featureLayer, feature);
  const isPoint =
    feature.geometry.type === "Point" || feature.geometry.type === "MultiPoint";

  // Reproduit exactement le contrat historique du renderer complet : un
  // Point direct reçoit les options de CircleMarker ; un MultiPoint est un
  // FeatureGroup et reçoit le style Path via FeatureGroup#setStyle.
  if (featureLayer instanceof L.CircleMarker && isPoint) {
    const options = getGeoJsonLayerPointOptions(layer, feature, paneName, renderer);
    featureLayer.setRadius(options.radius ?? 4);
    featureLayer.setStyle(options);
    return;
  }

  const pathLayer = featureLayer as L.Path;
  if (typeof pathLayer.setStyle === "function") {
    pathLayer.setStyle(
      getGeoJsonLayerPathOptions(layer, feature, paneName, renderer),
    );
  }
}

export function applyLeafletGeoJsonLayerStyle(
  leafletLayer: L.GeoJSON,
  layer: DromapGeoJsonLayer,
  paneName: string,
) {
  leafletLayer.eachLayer((childLayer) => {
    const feature = (childLayer as DromapLeafletGeoJsonLayer).feature;
    if (feature) {
      applyLeafletGeoJsonFeatureStyle(childLayer, feature, layer, paneName);
    }
  });
}

export function createFullLeafletGeoJsonLayer(
  layer: DromapGeoJsonLayer,
  paneName: string,
  workspaceBounds: WorkspaceBounds | null | undefined,
): L.GeoJSON {
  const displayData = getGeoJsonLayerLoadedDisplayData(layer, workspaceBounds);
  const geoJsonLayer = L.geoJSON(displayData as GeoJSON.GeoJsonObject, {
    pane: paneName,
    interactive: !layer.locked,
    style: (feature) =>
      getGeoJsonLayerPathOptions(layer, feature as DromapGeoJsonFeature, paneName),
    pointToLayer: (feature, latLng) =>
      L.circleMarker(
        latLng,
        getGeoJsonLayerPointOptions(layer, feature as DromapGeoJsonFeature, paneName),
      ),
  });

  applyLeafletGeoJsonLayerStyle(geoJsonLayer, layer, paneName);
  markGeoJsonLayer(geoJsonLayer, layer.id);

  return geoJsonLayer;
}

export function removeGeoJsonPane(
  map: L.Map,
  paneName: string,
  explicitRenderer?: L.Renderer,
) {
  const mapWithInternals = map as LeafletMapWithPaneInternals;
  const paneRenderer = mapWithInternals._paneRenderers?.[paneName];

  for (const renderer of [explicitRenderer, paneRenderer]) {
    if (renderer && map.hasLayer(renderer)) {
      map.removeLayer(renderer);
    }
  }

  if (mapWithInternals._paneRenderers?.[paneName]) {
    delete mapWithInternals._paneRenderers[paneName];
  }

  const pane = map.getPane(paneName);
  pane?.remove();

  if (mapWithInternals._panes?.[paneName]) {
    delete mapWithInternals._panes[paneName];
  }
}
