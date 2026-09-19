"use client";

import { getCurvedLineHandles, isCurvedLineFeature } from "@/lib/dromap/curved-line";

import type { DroMapAiProjectContext } from "./dromap-ai-types";
import { DROMAP_GEOJSON_CATALOG } from "./geojson-data-catalog";
import { getCurrentEditorMapZoom } from "@/lib/dromap/feature-visual-scale";
import { useEditorBasemapStore } from "@/stores/editor-basemap";
import { useEditorCustomMarkersStore } from "@/stores/editor-custom-markers";
import { useEditorExportStore } from "@/stores/editor-export";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useEditorGeoJsonLayersStore } from "@/stores/editor-geojson-layers";
import { useEditorLayersStore } from "@/stores/editor-layers";
import { useEditorMapLabelsStore } from "@/stores/editor-map-labels";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";

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
  const basemapState = useEditorBasemapStore.getState();
  const customMarkerState = useEditorCustomMarkersStore.getState();
  const exportState = useEditorExportStore.getState();
  const featuresState = useEditorFeaturesStore.getState();
  const geoJsonState = useEditorGeoJsonLayersStore.getState();
  const layersState = useEditorLayersStore.getState();
  const mapLabelsState = useEditorMapLabelsStore.getState();
  const modeState = useEditorModeStore.getState();
  const workspaceState = useEditorWorkspaceStore.getState();

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
    workspaceBasemapZoom: workspaceState.workspaceBasemapZoom,
    workspaceBasemapBaseZoom: workspaceState.workspaceBasemapBaseZoom,
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
      lineVariant: feature.properties.lineVariant ?? null,
      coordinates: isCurvedLineFeature(feature) && feature.geometry.type === "LineString"
        ? getCurvedLineHandles(feature.geometry.coordinates, feature.properties.curveHandleIndices)
        : compactCoordinates(feature.geometry.coordinates),
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
      mapTitle: exportState.mapTitle,
      mapTitleFontSize: exportState.mapTitleFontSize,
      mapTitleColor: exportState.mapTitleColor,
      showBasemapLabels: exportState.showBasemapLabels,
      legendSymbolSize: exportState.legendSymbolSize,
      scaleBarEnabled: exportState.scaleBarEnabled,
      northArrowEnabled: exportState.northArrowEnabled,
      customEntryCount: exportState.customLegendEntries.length,
      hiddenFeatureCount: exportState.hiddenLegendFeatureIds.length,
      hiddenGroupCount: exportState.hiddenLegendGroupKeys.length,
    },
  };
}
