"use client";

import {
  createCanvasExportPreviewDataUrl,
} from "@/editor/export-download";
import {
  createDromapEditorProjectSnapshot,
  normalizeDromapEditorExportSettings,
} from "@/lib/dromap/editor-project-persistence";
import {
  getRenderableFeaturesForLayers,
} from "@/stores/editor-layers";
import {
  getGeoJsonLayerLoadedFeatureCount,
  getRenderableGeoJsonLayers,
} from "@/stores/editor-geojson-layers";
import { useEditorMapLabelsStore } from "@/stores/editor-map-labels";

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

function encodeBestThumbnail(canvas: HTMLCanvasElement) {
  const jpeg = canvas.toDataURL("image/jpeg", 0.82);
  const webp = canvas.toDataURL("image/webp", 0.82);
  return webp.startsWith("data:image/webp;") && webp.length < jpeg.length ? webp : jpeg;
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
  return encodeBestThumbnail(canvas);
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
  const mapLabelsState = useEditorMapLabelsStore.getState();

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
    guestWatermarkMapPosition: exportSettings.guestWatermarkMapPosition,
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
    // La miniature est un rendu statique et peut être générée pendant une
    // transition de mode. Elle doit donc toujours relire le visualReferenceZoom
    // stocké sur les objets, sans modifier la logique de l’éditeur/preview/export.
    useStoredFeatureVisualScale: true,
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
    scaleBarSize: exportSettings.scaleBarSize,
    northArrowEnabled: exportSettings.northArrowEnabled,
    northArrowStyle: exportSettings.northArrowStyle,
    northArrowPosition: exportSettings.northArrowPosition,
    northArrowMapPosition: exportSettings.northArrowMapPosition,
    northArrowSize: exportSettings.northArrowSize,
    hiddenLegendFeatureIds: exportSettings.hiddenLegendFeatureIds,
    hiddenLegendGroupKeys: exportSettings.hiddenLegendGroupKeys,
    legendFeatureOrder: exportSettings.legendFeatureOrder,
    legendGroupOrder: exportSettings.legendGroupOrder,
    legendSectionOrder: exportSettings.legendSectionOrder,
    legendGroupLabels: exportSettings.legendGroupLabels,
    legendGroupSections: exportSettings.legendGroupSections,
  }, 1);

  return resizePreviewDataUrl(previewDataUrl);
}
