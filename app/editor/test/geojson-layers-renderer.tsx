"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import {
  getGeoJsonLayerLoadedDisplayData,
  getRenderableGeoJsonLayers,
  type DromapGeoJsonLayer,
  useEditorTestGeoJsonLayersStore,
} from "@/stores/editor-test-geojson-layers";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import {
  applyLeafletGeoJsonLayerStyle,
  createFullLeafletGeoJsonLayer,
  ensureGeoJsonPane,
  getWorkspaceLoadingKey,
  removeGeoJsonPane,
  type DromapLeafletGeoJsonLayer,
} from "./geojson-leaflet-rendering";

type RenderedGeoJsonLayerEntry = {
  layerId: string;
  leafletLayer: L.GeoJSON;
  paneName: string;
  sourceData: DromapGeoJsonLayer["data"];
  precisionMode: DromapGeoJsonLayer["precisionMode"];
  loadingKey: string;
};

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
    if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  }
}

/**
 * Renderer complet, volontairement indépendant du viewport de l'éditeur.
 *
 * Ce composant est le chemin autorisé pour la preview et le rendu final : il
 * monte toutes les features chargées dans la zone de travail et n'importe
 * aucun module situé sous `editor-only`.
 */
export function FullGeoJsonLayersRenderer() {
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
        if (map.hasLayer(entry.leafletLayer)) {
          map.removeLayer(entry.leafletLayer);
        }
        removeGeoJsonPane(map, entry.paneName);
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

      if (previousEntry && map.hasLayer(previousEntry.leafletLayer)) {
        map.removeLayer(previousEntry.leafletLayer);
      }

      const leafletLayer = createFullLeafletGeoJsonLayer(
        layer,
        paneName,
        workspaceBounds,
      );
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
  }, [layers, map, workspaceBounds]);

  useEffect(() => {
    const renderedLayers = renderedLayersRef.current;

    return () => {
      renderedLayers.forEach((entry) => {
        if (map.hasLayer(entry.leafletLayer)) {
          map.removeLayer(entry.leafletLayer);
        }
        removeGeoJsonPane(map, entry.paneName);
      });
      renderedLayers.clear();
      removeRenderedGeoJsonLayers(map);
    };
  }, [map]);

  return null;
}
