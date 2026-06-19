"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import {
  getGeoJsonLayerLoadedDisplayData,
  getRenderableGeoJsonLayers,
  type DromapGeoJsonFeature,
  type DromapGeoJsonLayer,
  useEditorTestGeoJsonLayersStore,
} from "@/stores/editor-test-geojson-layers";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import {
  getEffectiveGeoJsonFeatureStyle,
  getGeoJsonDashArray,
} from "./geojson-layer-style";

const GEOJSON_PANE_PREFIX = "dromap-geojson-layer-pane-";
const GEOJSON_PANE_BASE_Z_INDEX = 410;
const GEOJSON_PANE_STEP = 4;

type DromapLeafletGeoJsonLayer = L.Layer & {
  dromapGeoJsonLayerId?: string;
};

type RenderedGeoJsonLayerEntry = {
  layerId: string;
  leafletLayer: L.GeoJSON;
  paneName: string;
  sourceData: DromapGeoJsonLayer["data"];
  precisionMode: DromapGeoJsonLayer["precisionMode"];
  loadingKey: string;
};


function getWorkspaceLoadingKey(workspaceBounds: ReturnType<typeof useEditorTestWorkspaceStore.getState>["workspaceBounds"]) {
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

function sanitizePaneId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function getGeoJsonPaneName(layerId: string) {
  return `${GEOJSON_PANE_PREFIX}${sanitizePaneId(layerId)}`;
}

function ensureGeoJsonPane(map: L.Map, layer: DromapGeoJsonLayer, index: number) {
  const paneName = getGeoJsonPaneName(layer.id);
  const pane = map.getPane(paneName) ?? map.createPane(paneName);

  pane.style.zIndex = String(GEOJSON_PANE_BASE_Z_INDEX + index * GEOJSON_PANE_STEP);
  pane.style.pointerEvents = layer.locked ? "none" : "auto";

  return paneName;
}

function getLayerPathOptions(
  layer: DromapGeoJsonLayer,
  feature: DromapGeoJsonFeature | null | undefined,
  paneName: string,
): L.PathOptions & { pane: string; pmIgnore: boolean } {
  const style = getEffectiveGeoJsonFeatureStyle(layer, feature);
  const layerOpacity = Math.max(0, Math.min(1, layer.opacity));

  const strokeOpacity = Math.max(0, Math.min(1, style.strokeOpacity * layerOpacity));
  const fillOpacity = Math.max(0, Math.min(1, style.fillOpacity * layerOpacity));

  return {
    pane: paneName,
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

function getLayerPointOptions(
  layer: DromapGeoJsonLayer,
  feature: DromapGeoJsonFeature | null | undefined,
  paneName: string,
): L.CircleMarkerOptions & { pane: string; pmIgnore: boolean } {
  const style = getEffectiveGeoJsonFeatureStyle(layer, feature);
  const layerOpacity = Math.max(0, Math.min(1, layer.opacity));
  const pointOpacity = Math.max(0, Math.min(1, style.strokeOpacity * layerOpacity));

  return {
    ...getLayerPathOptions(layer, feature, paneName),
    stroke: pointOpacity > 0,
    fill: pointOpacity > 0,
    radius: Math.max(2, style.markerSize / 2),
    color: style.strokeColor,
    fillColor: style.strokeColor,
    opacity: pointOpacity,
    fillOpacity: pointOpacity,
  };
}

function markGeoJsonLayer(layer: L.Layer, layerId: string) {
  (layer as DromapLeafletGeoJsonLayer).dromapGeoJsonLayerId = layerId;

  const group = layer as L.LayerGroup;
  if (typeof group.eachLayer === "function") {
    group.eachLayer((childLayer) => {
      (childLayer as DromapLeafletGeoJsonLayer).dromapGeoJsonLayerId = layerId;
    });
  }
}

function isRenderedGeoJsonLayer(layer: L.Layer): layer is DromapLeafletGeoJsonLayer {
  return Boolean((layer as DromapLeafletGeoJsonLayer).dromapGeoJsonLayerId);
}

function removeRenderedGeoJsonLayers(map: L.Map) {
  const layersToRemove: L.Layer[] = [];

  map.eachLayer((layer) => {
    if (isRenderedGeoJsonLayer(layer)) {
      layersToRemove.push(layer);
    }
  });

  for (const layer of layersToRemove) {
    map.removeLayer(layer);
  }
}

function applyLeafletGeoJsonLayerStyle(
  leafletLayer: L.GeoJSON,
  layer: DromapGeoJsonLayer,
  paneName: string,
) {
  leafletLayer.eachLayer((childLayer) => {
    const pathLayer = childLayer as L.Path;
    const feature = (childLayer as L.Layer & { feature?: DromapGeoJsonFeature }).feature;
    const isPoint =
      feature?.geometry?.type === "Point" || feature?.geometry?.type === "MultiPoint";

    if (pathLayer instanceof L.CircleMarker && isPoint) {
      const options = getLayerPointOptions(layer, feature, paneName);
      pathLayer.setRadius(options.radius ?? 4);
      pathLayer.setStyle(options);
      return;
    }

    if (typeof pathLayer.setStyle === "function") {
      pathLayer.setStyle(getLayerPathOptions(layer, feature, paneName));
    }
  });
}

function createLeafletGeoJsonLayer(
  layer: DromapGeoJsonLayer,
  paneName: string,
  workspaceBounds: ReturnType<typeof useEditorTestWorkspaceStore.getState>["workspaceBounds"],
): L.GeoJSON {
  const displayData = getGeoJsonLayerLoadedDisplayData(layer, workspaceBounds);
  const geoJsonLayer = L.geoJSON(displayData as GeoJSON.GeoJsonObject, {
    pane: paneName,
    interactive: !layer.locked,
    style: (feature) =>
      getLayerPathOptions(layer, feature as DromapGeoJsonFeature, paneName),
    pointToLayer: (feature, latLng) =>
      L.circleMarker(
        latLng,
        getLayerPointOptions(layer, feature as DromapGeoJsonFeature, paneName),
      ),
  });

  applyLeafletGeoJsonLayerStyle(geoJsonLayer, layer, paneName);
  markGeoJsonLayer(geoJsonLayer, layer.id);

  return geoJsonLayer;
}

export function GeoJsonLayersRenderer() {
  const map = useMap();
  const layers = useEditorTestGeoJsonLayersStore((state) => state.geoJsonLayers);
  const workspaceBounds = useEditorTestWorkspaceStore((state) => state.workspaceBounds);
  const renderedLayersRef = useRef<Map<string, RenderedGeoJsonLayerEntry>>(new Map());

  useEffect(() => {
    const renderableLayers = getRenderableGeoJsonLayers(layers).filter(
      (layer) => getGeoJsonLayerLoadedDisplayData(layer, workspaceBounds).features.length > 0,
    );
    const loadingKey = getWorkspaceLoadingKey(workspaceBounds);
    const renderableLayerIds = new Set(renderableLayers.map((layer) => layer.id));

    renderedLayersRef.current.forEach((entry, layerId) => {
      if (!renderableLayerIds.has(layerId)) {
        map.removeLayer(entry.leafletLayer);
        renderedLayersRef.current.delete(layerId);
      }
    });

    renderableLayers.forEach((layer, index) => {
      const paneName = ensureGeoJsonPane(map, layer, index);
      const previousEntry = renderedLayersRef.current.get(layer.id);
      const canReuseLayer =
        previousEntry &&
        previousEntry.sourceData === layer.data &&
        previousEntry.precisionMode === layer.precisionMode &&
        previousEntry.loadingKey === loadingKey &&
        previousEntry.paneName === paneName;

      if (canReuseLayer) {
        applyLeafletGeoJsonLayerStyle(previousEntry.leafletLayer, layer, paneName);
        return;
      }

      if (previousEntry) {
        map.removeLayer(previousEntry.leafletLayer);
      }

      const leafletLayer = createLeafletGeoJsonLayer(layer, paneName, workspaceBounds);
      leafletLayer.addTo(map);
      renderedLayersRef.current.set(layer.id, {
        layerId: layer.id,
        leafletLayer,
        paneName,
        sourceData: layer.data,
        precisionMode: layer.precisionMode,
        loadingKey,
      });
    });

    return undefined;
  }, [layers, map, workspaceBounds]);

  useEffect(() => {
    return () => {
      renderedLayersRef.current.forEach((entry) => {
        map.removeLayer(entry.leafletLayer);
      });
      renderedLayersRef.current.clear();
      removeRenderedGeoJsonLayers(map);
    };
  }, [map]);

  return null;
}
