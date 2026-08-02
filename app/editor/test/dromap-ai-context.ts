"use client";

import type { DroMapAiProjectContext } from "./dromap-ai-types";
import { DROMAP_GEOJSON_CATALOG } from "./geojson-data-catalog";
import { getCurrentEditorMapZoom } from "@/lib/dromap/feature-visual-scale";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import { useEditorTestCustomMarkersStore } from "@/stores/editor-test-custom-markers";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestGeoJsonLayersStore } from "@/stores/editor-test-geojson-layers";
import { useEditorTestLayersStore } from "@/stores/editor-test-layers";
import { useEditorTestMapLabelsStore } from "@/stores/editor-test-map-labels";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

const MAX_CONTEXT_FEATURES = 160;
const MAX_COORDINATES_PER_FEATURE = 40;

function compactCoordinates(value: unknown, counter = { value: 0 }): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    counter.value += 1;
    return counter.value <= MAX_COORDINATES_PER_FEATURE
      ? [value[0], value[1]]
      : null;
  }

  return value
    .map((item) => compactCoordinates(item, counter))
    .filter((item) => item !== null);
}

export function buildDroMapAiProjectContext(): DroMapAiProjectContext {
  const basemapState = useEditorTestBasemapStore.getState();
  const customMarkerState = useEditorTestCustomMarkersStore.getState();
  const exportState = useEditorTestExportStore.getState();
  const featuresState = useEditorTestFeaturesStore.getState();
  const geoJsonState = useEditorTestGeoJsonLayersStore.getState();
  const layersState = useEditorTestLayersStore.getState();
  const mapLabelsState = useEditorTestMapLabelsStore.getState();
  const modeState = useEditorTestModeStore.getState();
  const workspaceState = useEditorTestWorkspaceStore.getState();

  const workspaceBounds = workspaceState.workspaceBounds
    ? {
        south: workspaceState.workspaceBounds.southWest.lat,
        west: workspaceState.workspaceBounds.southWest.lng,
        north: workspaceState.workspaceBounds.northEast.lat,
        east: workspaceState.workspaceBounds.northEast.lng,
      }
    : null;

  return {
    basemapId: basemapState.basemapId,
    workspaceBounds,
    workspaceValidated:
      modeState.currentMode === "edit" && workspaceState.workspaceBounds !== null,
    currentZoom: getCurrentEditorMapZoom(),
    activeLayerId: layersState.activeLayerId,
    layers: layersState.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      locked: layer.locked,
      order: layer.order,
    })),
    geoJsonLayers: geoJsonState.geoJsonLayers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      locked: layer.locked,
      order: layer.order,
      featureCount: layer.featureCount,
      precisionMode: layer.precisionMode,
      catalogDatasetId: layer.catalogDatasetId ?? null,
      style: layer.style,
    })),
    customMarkers: customMarkerState.customMarkers
      .filter((marker) => marker.hiddenFromLibrary !== true)
      .map((marker) => ({ id: marker.id, name: marker.name, kind: marker.kind })),
    features: featuresState.features.slice(0, MAX_CONTEXT_FEATURES).map((feature) => ({
      id: feature.id,
      type: feature.properties.type,
      label: feature.properties.label,
      legendLabel: feature.properties.legendLabel ?? null,
      layerId: feature.properties.layerId ?? null,
      geometryType: feature.geometry.type,
      coordinates: compactCoordinates(feature.geometry.coordinates),
      style: feature.properties.style,
      symbol: feature.properties.symbol ?? null,
      mapLabelVisibility: feature.properties.mapLabelVisibility ?? null,
      locked:
        feature.properties.locked === true ||
        feature.properties.lockOverride === "locked",
      geometryLocked: feature.properties.geometryLocked === true,
      sourceType: feature.properties.source?.type ?? null,
    })),
    featureCount: featuresState.features.length,
    mapLabels: {
      showAllFeatureLabels: mapLabelsState.showAllFeatureLabels,
      showAllGeoJsonFeatureLabels:
        mapLabelsState.showAllGeoJsonFeatureLabels,
      scale: mapLabelsState.featureMapLabelScale,
    },
    catalog: DROMAP_GEOJSON_CATALOG.map((entry) => ({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      category: entry.category,
      geography: entry.geography,
      sourceLabel: entry.sourceLabel,
      sizeLabel: entry.sizeLabel,
      keywords: entry.keywords,
      heavy: entry.heavy === true,
    })),
    legend: {
      title: exportState.legendTitle,
      position: exportState.legendPosition,
      exportFormat: exportState.exportFormat,
      scaleBarEnabled: exportState.scaleBarEnabled,
      northArrowEnabled: exportState.northArrowEnabled,
      customEntryCount: exportState.customLegendEntries.length,
      hiddenFeatureCount: exportState.hiddenLegendFeatureIds.length,
      hiddenGroupCount: exportState.hiddenLegendGroupKeys.length,
    },
  };
}
