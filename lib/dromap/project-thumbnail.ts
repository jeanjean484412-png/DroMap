"use client";

import {
  createCanvasExportPreviewDataUrl,
} from "@/app/editor/test/export-download";
import {
  createDromapEditorProjectSnapshot,
  normalizeDromapEditorExportSettings,
} from "@/lib/dromap/editor-project-persistence";
import {
  getRenderableFeaturesForLayers,
} from "@/stores/editor-test-layers";
import {
  getGeoJsonLayerLoadedFeatureCount,
  getRenderableGeoJsonLayers,
} from "@/stores/editor-test-geojson-layers";
import { useEditorTestMapLabelsStore } from "@/stores/editor-test-map-labels";

const THUMBNAIL_WIDTH = 720;
const THUMBNAIL_HEIGHT = 405;

function loadDataUrlImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("La miniature n’a pas pu être chargée."));
    image.src = dataUrl;
  });
}

async function resizePreviewDataUrl(dataUrl: string) {
  const image = await loadDataUrlImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = THUMBNAIL_HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Le navigateur ne peut pas créer la miniature du projet.");
  }

  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(
    canvas.width / Math.max(1, image.naturalWidth),
    canvas.height / Math.max(1, image.naturalHeight),
  );
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = (canvas.width - drawWidth) / 2;
  const drawY = (canvas.height - drawHeight) / 2;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  return canvas.toDataURL("image/jpeg", 0.84);
}

export async function createDromapProjectThumbnailDataUrl() {
  const snapshot = createDromapEditorProjectSnapshot();
  const workspaceBounds = snapshot.workspaceBounds;

  if (!workspaceBounds) {
    return null;
  }

  const layers = snapshot.layers ?? [];
  const geoJsonLayers = snapshot.geoJsonLayers ?? [];
  const exportSettings = normalizeDromapEditorExportSettings(
    snapshot.exportSettings,
  );
  const mapLabelsState = useEditorTestMapLabelsStore.getState();

  const renderableFeatures = getRenderableFeaturesForLayers(
    snapshot.features,
    layers,
    { workspaceBounds },
  );
  const renderableGeoJsonLayers = getRenderableGeoJsonLayers(
    geoJsonLayers,
  ).filter(
    (layer) =>
      getGeoJsonLayerLoadedFeatureCount(layer, workspaceBounds) > 0,
  );

  const previewDataUrl = await createCanvasExportPreviewDataUrl({
    features: renderableFeatures,
    layers,
    geoJsonLayers: renderableGeoJsonLayers,
    workspaceBounds,
    workspaceBasemapZoom: snapshot.workspaceBasemapZoom ?? null,
    workspaceBasemapBaseZoom: snapshot.workspaceBasemapBaseZoom ?? null,
    basemapId: snapshot.basemapId,
    showBasemapLabels:
      snapshot.showBasemapLabels ?? exportSettings.showBasemapLabels,
    mapTitle: exportSettings.mapTitle,
    mapTitlePosition: exportSettings.mapTitlePosition,
    mapTitleFontSize: exportSettings.mapTitleFontSize,
    mapTitleColor: exportSettings.mapTitleColor,
    showCountryNeighborContext:
      snapshot.showCountryNeighborContext !== false,
    showAllFeatureLabels: snapshot.showAllFeatureLabels === true,
    showAllGeoJsonFeatureLabels:
      snapshot.showAllGeoJsonFeatureLabels === true,
    featureMapLabelScale: snapshot.featureMapLabelScale ?? 1,
    featureMapLabelOutlineWidth:
      snapshot.featureMapLabelOutlineWidth ?? 1.5,
    featureMapLabelRenderScale:
      mapLabelsState.editorFeatureMapLabelRenderScale ??
      snapshot.featureMapLabelScale ??
      1,
    featureMapLabelEditorVisualZoom:
      mapLabelsState.editorFeatureMapLabelVisualZoom,
    featureMapLabelEditorOffsets:
      mapLabelsState.editorFeatureMapLabelOffsets,
    legendTitle: exportSettings.legendTitle,
    legendPosition: exportSettings.legendPosition,
    legendMapPosition: exportSettings.legendMapPosition,
    legendMapTitlePosition: exportSettings.legendMapTitlePosition,
    exportFormat: exportSettings.exportFormat,
    legendBackgroundColor: exportSettings.legendBackgroundColor,
    legendSideWidth: exportSettings.legendSideWidth,
    legendBottomHeight: exportSettings.legendBottomHeight,
    legendTitleFontSize: exportSettings.legendTitleFontSize,
    legendItemFontSize: exportSettings.legendItemFontSize,
    legendSectionTitleFontSize:
      exportSettings.legendSectionTitleFontSize,
    legendSymbolSize: exportSettings.legendSymbolSize,
    legendItemGap: exportSettings.legendItemGap,
    legendLabelGap: exportSettings.legendLabelGap,
    legendLabelLineHeight: exportSettings.legendLabelLineHeight,
    legendSectionGap: exportSettings.legendSectionGap,
    legendMapBorderEnabled: exportSettings.legendMapBorderEnabled,
    legendMapBorderColor: exportSettings.legendMapBorderColor,
    legendMapBorderWidth: exportSettings.legendMapBorderWidth,
    legendMapBorderRadius: exportSettings.legendMapBorderRadius,
    legendMapPadding: exportSettings.legendMapPadding,
    customLegendEntries: exportSettings.customLegendEntries,
    legendSymbolOverrides: exportSettings.legendSymbolOverrides,
    scaleBarEnabled: exportSettings.scaleBarEnabled,
    scaleBarStyle: exportSettings.scaleBarStyle,
    scaleBarPosition: exportSettings.scaleBarPosition,
    scaleBarMapPosition: exportSettings.scaleBarMapPosition,
    northArrowEnabled: exportSettings.northArrowEnabled,
    northArrowStyle: exportSettings.northArrowStyle,
    northArrowPosition: exportSettings.northArrowPosition,
    northArrowMapPosition: exportSettings.northArrowMapPosition,
    hiddenLegendFeatureIds: exportSettings.hiddenLegendFeatureIds,
    hiddenLegendGroupKeys: exportSettings.hiddenLegendGroupKeys,
    legendFeatureOrder: exportSettings.legendFeatureOrder,
    legendGroupOrder: exportSettings.legendGroupOrder,
    legendSectionOrder: exportSettings.legendSectionOrder,
    legendGroupLabels: exportSettings.legendGroupLabels,
    legendGroupSections: exportSettings.legendGroupSections,
  });

  return resizePreviewDataUrl(previewDataUrl);
}
