"use client";

import { useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import {
  applyGeoJsonFeatureSettings,
  getGeoJsonLayerLoadedDisplayData,
  type DromapGeoJsonFeature,
  type DromapGeoJsonLayer,
  useEditorGeoJsonLayersStore,
} from "@/stores/editor-geojson-layers";
import { useEditorFeatureSettingsPreview, type GeoJsonSettingsPreview } from "@/stores/editor-feature-settings-preview";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorToolStore } from "@/stores/editor-tool";
import { useEditorSelectionStore } from "@/stores/editor-selection";
import { EDIT_GEOJSON_FEATURE_EVENT, type GeoJsonFeatureEditRequest } from "@/stores/editor-layer-commands";
import {
  applyLeafletGeoJsonFeatureStyle,
  applyLeafletGeoJsonLayerStyle,
  createFullLeafletGeoJsonLayer,
  ensureGeoJsonPane,
  getGeoJsonLayerPathOptions,
  getGeoJsonLayerPointOptions,
  getWorkspaceLoadingKey,
  markGeoJsonLayer,
  removeGeoJsonPane,
  type DromapLeafletGeoJsonLayer,
} from "../geojson-leaflet-rendering";
import {
  GEOJSON_VIEWPORT_PADDING_RATIO,
  canReuseGeoJsonViewportIndex,
  createGeoJsonViewportIndex,
  createIndexedGeoJsonFeature,
  isGeoJsonViewportCanvasCandidate,
  queryGeoJsonViewportIndex,
  reuseGeoJsonViewportIndex,
  type GeoJsonViewportIndex,
} from "./geojson-viewport-index";

type FullRenderedEntry = {
  mode: "full";
  layerId: string;
  leafletLayer: L.GeoJSON;
  paneName: string;
  sourceData: DromapGeoJsonLayer["data"];
  precisionMode: DromapGeoJsonLayer["precisionMode"];
  loadingKey: string;
};

type LayerReference = {
  current: DromapGeoJsonLayer;
};

type OptimizedRenderedEntry = {
  mode: "viewport-canvas";
  layerId: string;
  leafletLayer: L.GeoJSON;
  renderer: L.Canvas;
  paneName: string;
  layerReference: LayerReference;
  index: GeoJsonViewportIndex;
  mountedLayers: Map<string, L.Layer>;
};

type EditorRenderedEntry = FullRenderedEntry | OptimizedRenderedEntry;

function syncGeoJsonSettingsPreview(
  entries: Map<string, EditorRenderedEntry>,
  layers: Map<string, DromapGeoJsonLayer>,
  preview: GeoJsonSettingsPreview,
  restore = false,
) {
  const entry = entries.get(preview.layerId);
  const layer = layers.get(preview.layerId);
  if (!entry || !layer) return;

  const featureLayer = entry.mode === "viewport-canvas"
    ? entry.mountedLayers.get(String(preview.featureId))
    : entry.leafletLayer.getLayers().find((item) => (item as DromapLeafletGeoJsonLayer).feature?.id === preview.featureId);
  const renderedFeature = (featureLayer as DromapLeafletGeoJsonLayer | undefined)?.feature;
  if (!featureLayer || !renderedFeature) return;

  const indexedFeature = entry.mode === "viewport-canvas" ? entry.index.featuresById.get(String(preview.featureId)) : undefined;
  const source = indexedFeature
    ? layer.data.features[indexedFeature.sourceIndex]
    : layer.data.features.find((feature) => feature.id === preview.featureId);
  if (!source) return;

  const feature = restore ? source : applyGeoJsonFeatureSettings(layer, source, preview.patch);
  applyLeafletGeoJsonFeatureStyle(
    featureLayer, { ...feature, geometry: renderedFeature.geometry }, layer, entry.paneName,
    entry.mode === "viewport-canvas" ? entry.renderer : undefined,
  );
}

function isEffectivelyVisible(layer: DromapGeoJsonLayer) {
  return layer.visible !== false && layer.opacity > 0;
}

function removeMountedFeature(entry: OptimizedRenderedEntry, featureId: string) {
  const featureLayer = entry.mountedLayers.get(featureId);
  if (!featureLayer) {
    return;
  }

  entry.leafletLayer.removeLayer(featureLayer);
  entry.mountedLayers.delete(featureId);
}

function clearMountedFeatures(entry: OptimizedRenderedEntry) {
  for (const featureId of [...entry.mountedLayers.keys()]) {
    removeMountedFeature(entry, featureId);
  }
}

function teardownOptimizedEntry(map: L.Map, entry: OptimizedRenderedEntry) {
  clearMountedFeatures(entry);

  if (map.hasLayer(entry.leafletLayer)) {
    map.removeLayer(entry.leafletLayer);
  }

  removeGeoJsonPane(map, entry.paneName, entry.renderer);
  entry.mountedLayers.clear();
}

function teardownFullEntry(map: L.Map, entry: FullRenderedEntry) {
  if (map.hasLayer(entry.leafletLayer)) {
    map.removeLayer(entry.leafletLayer);
  }

  removeGeoJsonPane(map, entry.paneName);
}

function teardownEntry(map: L.Map, entry: EditorRenderedEntry) {
  if (entry.mode === "viewport-canvas") {
    teardownOptimizedEntry(map, entry);
    return;
  }

  teardownFullEntry(map, entry);
}

function createOptimizedEntry(
  map: L.Map,
  layer: DromapGeoJsonLayer,
  paneName: string,
  index: GeoJsonViewportIndex,
): OptimizedRenderedEntry {
  const layerReference: LayerReference = { current: layer };
  const renderer = L.canvas({ pane: paneName, padding: 0.5 });
  const leafletLayer = L.geoJSON(undefined, {
    pane: paneName,
    interactive: false,
    style: (feature) =>
      getGeoJsonLayerPathOptions(
        layerReference.current,
        feature as DromapGeoJsonFeature,
        paneName,
        renderer,
      ),
    pointToLayer: (feature, latLng) =>
      L.circleMarker(
        latLng,
        getGeoJsonLayerPointOptions(
          layerReference.current,
          feature as DromapGeoJsonFeature,
          paneName,
          renderer,
        ),
      ),
  });

  markGeoJsonLayer(leafletLayer, layer.id);
  leafletLayer.addTo(map);

  return {
    mode: "viewport-canvas",
    layerId: layer.id,
    leafletLayer,
    renderer,
    paneName,
    layerReference,
    index,
    mountedLayers: new Map(),
  };
}

function addMountedFeature(
  entry: OptimizedRenderedEntry,
  layer: DromapGeoJsonLayer,
  featureId: string,
) {
  const indexedFeature = entry.index.featuresById.get(featureId);
  if (!indexedFeature) {
    return false;
  }

  const feature = createIndexedGeoJsonFeature(layer, entry.index, indexedFeature);
  if (!feature) {
    return false;
  }

  let addedLayer: L.Layer | null = null;
  const captureAddedLayer = (event: L.LayerEvent) => {
    addedLayer = event.layer;
  };

  entry.leafletLayer.once("layeradd", captureAddedLayer);
  entry.leafletLayer.addData(feature as GeoJSON.Feature);
  entry.leafletLayer.off("layeradd", captureAddedLayer);

  if (!addedLayer) {
    return false;
  }

  markGeoJsonLayer(addedLayer, layer.id);
  applyLeafletGeoJsonFeatureStyle(
    addedLayer,
    feature,
    layer,
    entry.paneName,
    entry.renderer,
  );
  entry.mountedLayers.set(featureId, addedLayer);
  return true;
}

function bringMountedFeaturesToFront(entry: OptimizedRenderedEntry) {
  for (const indexedFeature of entry.index.features) {
    const featureLayer = entry.mountedLayers.get(indexedFeature.id) as
      | (L.Layer & { bringToFront?: () => unknown })
      | undefined;
    featureLayer?.bringToFront?.();
  }
}

function replaceOptimizedIndex(
  entry: OptimizedRenderedEntry,
  nextIndex: GeoJsonViewportIndex,
) {
  if (entry.index === nextIndex) {
    return;
  }

  for (const [featureId] of entry.mountedLayers) {
    const previousFeature = entry.index.featuresById.get(featureId);
    const nextFeature = nextIndex.featuresById.get(featureId);

    if (
      !previousFeature ||
      !nextFeature ||
      previousFeature.displayGeometry !== nextFeature.displayGeometry
    ) {
      removeMountedFeature(entry, featureId);
    }
  }

  entry.index = nextIndex;
}

function applyOptimizedEntryStyle(
  entry: OptimizedRenderedEntry,
  layer: DromapGeoJsonLayer,
) {
  for (const [featureId, featureLayer] of entry.mountedLayers) {
    const indexedFeature = entry.index.featuresById.get(featureId);
    if (!indexedFeature) {
      removeMountedFeature(entry, featureId);
      continue;
    }

    const feature = createIndexedGeoJsonFeature(layer, entry.index, indexedFeature);
    if (!feature) {
      removeMountedFeature(entry, featureId);
      continue;
    }

    applyLeafletGeoJsonFeatureStyle(
      featureLayer,
      feature,
      layer,
      entry.paneName,
      entry.renderer,
    );
  }
}

function reconcileOptimizedEntry(
  entry: OptimizedRenderedEntry,
  layer: DromapGeoJsonLayer,
  wantedIds: Set<string>,
) {
  let changed = false;

  for (const featureId of [...entry.mountedLayers.keys()]) {
    if (!wantedIds.has(featureId)) {
      removeMountedFeature(entry, featureId);
      changed = true;
    }
  }

  for (const featureId of wantedIds) {
    if (!entry.mountedLayers.has(featureId)) {
      if (addMountedFeature(entry, layer, featureId)) {
        changed = true;
      }
    }
  }

  // `addData` ajoute à la fin de la liste Canvas. Sans ce replay, une feature
  // sortie puis rentrée pourrait changer l'ordre visuel aux recouvrements.
  if (changed) {
    bringMountedFeaturesToFront(entry);
  }
}

function getPaddedViewportBounds(map: L.Map) {
  const bounds = map.getBounds().pad(GEOJSON_VIEWPORT_PADDING_RATIO);

  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  };
}

type LeafletPathWithHitTest = L.Path & {
  _containsPoint?: (point: L.Point, closed?: boolean) => boolean;
};

function findGeoJsonFeatureAtPoint(
  layer: L.Layer,
  point: L.Point,
  includeUnfilledPolygons: boolean,
): DromapGeoJsonFeature | undefined {
  if (layer instanceof L.LayerGroup) {
    for (const child of layer.getLayers().reverse()) {
      const feature = findGeoJsonFeatureAtPoint(child, point, includeUnfilledPolygons);
      if (feature) return feature;
    }
    return undefined;
  }

  if (!(layer instanceof L.Path) || (!layer.options.stroke && !layer.options.fill)) {
    return undefined;
  }

  // Leaflet utilise le même test géométrique pour ses Canvas interactifs.
  // Ici, le calque peut rester verrouillé et ne capter ni clic simple ni dessin.
  const path = layer as LeafletPathWithHitTest;
  const hit = layer instanceof L.Polygon && !path.options.fill && !includeUnfilledPolygons
    ? (L.Polyline.prototype as LeafletPathWithHitTest)._containsPoint?.call(path, point, true)
    : path._containsPoint?.(point);
  return hit ? (layer as DromapLeafletGeoJsonLayer).feature : undefined;
}

/**
 * Renderer de la carte éditeur uniquement.
 *
 * Les gros calques verrouillés compatibles suivent le chemin viewport+Canvas.
 * Tous les autres calques conservent le renderer historique complet.
 */
export function EditorGeoJsonLayersRenderer() {
  const map = useMap();
  const layers = useEditorGeoJsonLayersStore((state) => state.geoJsonLayers);
  const settingsPreview = useEditorFeatureSettingsPreview((state) => state.geoJson);
  const workspaceBounds = useEditorWorkspaceStore((state) => state.workspaceBounds);
  const renderedEntriesRef = useRef<Map<string, EditorRenderedEntry>>(new Map());
  const indexCacheRef = useRef<Map<string, GeoJsonViewportIndex>>(new Map());
  const layersByIdRef = useRef<Map<string, DromapGeoJsonLayer>>(new Map());
  const workspaceBoundsRef = useRef(workspaceBounds);
  const frameIdRef = useRef<number | null>(null);
  const previousSettingsPreviewRef = useRef<GeoJsonSettingsPreview | null>(null);

  const runViewportUpdate = useCallback(() => {
    const viewportBounds = getPaddedViewportBounds(map);

    for (const entry of renderedEntriesRef.current.values()) {
      if (entry.mode !== "viewport-canvas") {
        continue;
      }

      const layer = layersByIdRef.current.get(entry.layerId);
      if (
        !layer ||
        !isEffectivelyVisible(layer) ||
        !isGeoJsonViewportCanvasCandidate(layer)
      ) {
        clearMountedFeatures(entry);
        continue;
      }

      const wantedIds = queryGeoJsonViewportIndex(
        entry.index,
        viewportBounds,
        workspaceBoundsRef.current,
      );
      reconcileOptimizedEntry(entry, layer, wantedIds);
    }
    const preview = useEditorFeatureSettingsPreview.getState().geoJson;
    if (preview) syncGeoJsonSettingsPreview(renderedEntriesRef.current, layersByIdRef.current, preview);
  }, [map]);

  const scheduleViewportUpdate = useCallback(() => {
    if (frameIdRef.current !== null) {
      return;
    }

    frameIdRef.current = window.requestAnimationFrame(() => {
      frameIdRef.current = null;
      runViewportUpdate();
    });
  }, [runViewportUpdate]);

  useEffect(() => {
    const handleViewportChange = () => scheduleViewportUpdate();

    map.on("moveend", handleViewportChange);
    map.on("zoomend", handleViewportChange);
    map.on("resize", handleViewportChange);

    return () => {
      map.off("moveend", handleViewportChange);
      map.off("zoomend", handleViewportChange);
      map.off("resize", handleViewportChange);

      if (frameIdRef.current !== null) {
        window.cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }
    };
  }, [map, scheduleViewportUpdate]);

  useEffect(() => {
    const container = map.getContainer();
    const handleDoubleClick = (event: MouseEvent) => {
      const { activeTool } = useEditorToolStore.getState();
      if (event.defaultPrevented || event.button !== 0 ||
          useEditorModeStore.getState().currentMode !== "edit" ||
          (activeTool !== "select" && activeTool !== "edit") ||
          useEditorSelectionStore.getState().areaSelectionEnabled) return;

      if (event.target instanceof Element && event.target.closest(
        "button, a, input, select, textarea, .leaflet-control, .leaflet-popup, .leaflet-marker-icon, [class*='dromap-feature-pane-']",
      )) return;

      const workspace = workspaceBoundsRef.current;
      if (!workspace) return;
      const { lat, lng } = map.mouseEventToLatLng(event);
      if (lat < workspace.southWest.lat || lat > workspace.northEast.lat ||
          ![lng, lng - 360, lng + 360].some((value) => value >= workspace.southWest.lng && value <= workspace.northEast.lng)) return;

      const point = map.mouseEventToLayerPoint(event);
      const visibleLayers = [...layersByIdRef.current.values()]
        .filter(isEffectivelyVisible)
        .sort((first, second) => second.order - first.order);

      // Privilégie les traits et les surfaces visibles. Une zone représentée
      // seulement par son contour reste accessible en cliquant à l'intérieur.
      for (const includeUnfilledPolygons of [false, true]) {
        for (const layer of visibleLayers) {
          const entry = renderedEntriesRef.current.get(layer.id);
          if (!entry || !map.hasLayer(entry.leafletLayer)) continue;
          const feature = findGeoJsonFeatureAtPoint(entry.leafletLayer, point, includeUnfilledPolygons);
          if (!feature) continue;

          event.preventDefault();
          event.stopImmediatePropagation();
          window.dispatchEvent(new CustomEvent<GeoJsonFeatureEditRequest>(EDIT_GEOJSON_FEATURE_EVENT, {
            detail: { layerId: layer.id, featureId: feature.id },
          }));
          return;
        }
      }
    };

    container.addEventListener("dblclick", handleDoubleClick, true);
    return () => container.removeEventListener("dblclick", handleDoubleClick, true);
  }, [map]);

  useEffect(() => {
    workspaceBoundsRef.current = workspaceBounds;
    layersByIdRef.current = new Map(layers.map((layer) => [layer.id, layer]));

    const currentLayerIds = new Set(layers.map((layer) => layer.id));
    for (const [layerId, entry] of renderedEntriesRef.current) {
      if (!currentLayerIds.has(layerId)) {
        teardownEntry(map, entry);
        renderedEntriesRef.current.delete(layerId);
        indexCacheRef.current.delete(layerId);
      }
    }
    // Un calque masqué n'a plus d'entrée rendue mais conserve volontairement
    // son index pour un show rapide. Sa suppression doit donc aussi nettoyer
    // le cache indépendamment du registre Leaflet.
    for (const layerId of indexCacheRef.current.keys()) {
      if (!currentLayerIds.has(layerId)) {
        indexCacheRef.current.delete(layerId);
      }
    }

    const visibleLayers = layers
      .filter(isEffectivelyVisible)
      .sort((first, second) => first.order - second.order);
    const visibleLayerIndexes = new Map(
      visibleLayers.map((layer, index) => [layer.id, index]),
    );
    const loadingKey = getWorkspaceLoadingKey(workspaceBounds);

    for (const layer of layers) {
      const previousEntry = renderedEntriesRef.current.get(layer.id);
      const candidate = isGeoJsonViewportCanvasCandidate(layer);
      const cachedIndexForLayer = indexCacheRef.current.get(layer.id);

      // Même masqué ou temporairement déverrouillé, un calque peut recevoir un
      // patch de style qui remplace `data` sans changer les géométries. On
      // actualise alors la référence source pour ne pas retenir une ancienne
      // FeatureCollection complète ; une vraie mutation géométrique invalide
      // simplement le cache et sera reconstruite à la prochaine activation.
      if (cachedIndexForLayer) {
        if (canReuseGeoJsonViewportIndex(cachedIndexForLayer, layer)) {
          reuseGeoJsonViewportIndex(cachedIndexForLayer, layer);
        } else {
          indexCacheRef.current.delete(layer.id);
        }
      }

      if (!isEffectivelyVisible(layer)) {
        if (previousEntry?.mode === "viewport-canvas" && candidate) {
          // Le cache bbox reste en mémoire, mais le groupe, le renderer Canvas
          // et le pane n'ont aucune raison de rester dans le DOM tant que le
          // calque est masqué.
          teardownOptimizedEntry(map, previousEntry);
          renderedEntriesRef.current.delete(layer.id);
        } else if (previousEntry) {
          teardownEntry(map, previousEntry);
          renderedEntriesRef.current.delete(layer.id);
        }
        continue;
      }

      const visibleIndex = visibleLayerIndexes.get(layer.id) ?? 0;
      let paneName = ensureGeoJsonPane(map, layer, visibleIndex, {
        capBelowWorkspaceMask: true,
      });

      if (candidate) {
        const cachedIndex = indexCacheRef.current.get(layer.id);
        const canReuseIndex = Boolean(
          cachedIndex && canReuseGeoJsonViewportIndex(cachedIndex, layer),
        );
        const nextIndex = canReuseIndex && cachedIndex
          ? reuseGeoJsonViewportIndex(cachedIndex, layer)
          : createGeoJsonViewportIndex(layer);

        if (nextIndex) {
          indexCacheRef.current.set(layer.id, nextIndex);

          let optimizedEntry: OptimizedRenderedEntry;
          if (previousEntry?.mode === "viewport-canvas") {
            optimizedEntry = previousEntry;
            replaceOptimizedIndex(optimizedEntry, nextIndex);
          } else {
            if (previousEntry) {
              teardownEntry(map, previousEntry);
              paneName = ensureGeoJsonPane(map, layer, visibleIndex, {
                capBelowWorkspaceMask: true,
              });
            }
            optimizedEntry = createOptimizedEntry(map, layer, paneName, nextIndex);
            renderedEntriesRef.current.set(layer.id, optimizedEntry);
          }

          const previousLayer = optimizedEntry.layerReference.current;
          const shouldRestyle =
            previousLayer.style !== layer.style ||
            previousLayer.opacity !== layer.opacity ||
            previousLayer.data !== layer.data;

          optimizedEntry.layerReference.current = layer;
          if (shouldRestyle) {
            applyOptimizedEntryStyle(optimizedEntry, layer);
          }
          continue;
        }
      }

      if (previousEntry?.mode === "viewport-canvas") {
        teardownOptimizedEntry(map, previousEntry);
        renderedEntriesRef.current.delete(layer.id);
        paneName = ensureGeoJsonPane(map, layer, visibleIndex, {
          capBelowWorkspaceMask: true,
        });
      }

      const fullEntry = renderedEntriesRef.current.get(layer.id);
      const canReuseFullLayer =
        fullEntry?.mode === "full" &&
        fullEntry.sourceData === layer.data &&
        fullEntry.precisionMode === layer.precisionMode &&
        fullEntry.loadingKey === loadingKey &&
        fullEntry.paneName === paneName;

      if (canReuseFullLayer) {
        applyLeafletGeoJsonLayerStyle(fullEntry.leafletLayer, layer, paneName);
        continue;
      }

      if (fullEntry?.mode === "full") {
        if (map.hasLayer(fullEntry.leafletLayer)) {
          map.removeLayer(fullEntry.leafletLayer);
        }
      }

      if (getGeoJsonLayerLoadedDisplayData(layer, workspaceBounds).features.length === 0) {
        removeGeoJsonPane(map, paneName);
        if (fullEntry?.mode === "full") {
          renderedEntriesRef.current.delete(layer.id);
        }
        continue;
      }

      const leafletLayer = createFullLeafletGeoJsonLayer(layer, paneName, workspaceBounds);
      leafletLayer.addTo(map);
      renderedEntriesRef.current.set(layer.id, {
        mode: "full",
        layerId: layer.id,
        leafletLayer,
        paneName,
        sourceData: layer.data,
        precisionMode: layer.precisionMode,
        loadingKey,
      });
    }

    scheduleViewportUpdate();
  }, [layers, map, scheduleViewportUpdate, workspaceBounds]);

  useEffect(() => {
    const previous = previousSettingsPreviewRef.current;
    if (previous && (previous.layerId !== settingsPreview?.layerId || previous.featureId !== settingsPreview?.featureId)) {
      syncGeoJsonSettingsPreview(renderedEntriesRef.current, layersByIdRef.current, previous, true);
    }
    if (settingsPreview) {
      syncGeoJsonSettingsPreview(renderedEntriesRef.current, layersByIdRef.current, settingsPreview);
    }
    previousSettingsPreviewRef.current = settingsPreview;
  }, [settingsPreview, layers, workspaceBounds]);

  useEffect(() => {
    const renderedEntries = renderedEntriesRef.current;
    const indexCache = indexCacheRef.current;

    return () => {
      if (frameIdRef.current !== null) {
        window.cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = null;
      }

      for (const entry of renderedEntries.values()) {
        teardownEntry(map, entry);
      }

      renderedEntries.clear();
      indexCache.clear();
      layersByIdRef.current.clear();
    };
  }, [map]);

  return null;
}
