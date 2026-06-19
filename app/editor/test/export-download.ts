"use client";

import {
  isFreehandLineFeature,
  type DroMapFeature,
} from "@/lib/dromap/feature";
import { getFeaturesByDrawOrder } from "@/lib/dromap/feature-order";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import type {
  ExportFormat,
  ExportLegendPosition,
  ExportScaleBarStyle,
} from "@/stores/editor-test-export";
import type { DroMapLayer } from "@/stores/editor-test-layers";
import {
  getGeoJsonLayerLoadedDisplayData,
  getRenderableGeoJsonLayers,
  normalizeDromapGeoJsonLayers,
  type DromapGeoJsonFeature,
  type DromapGeoJsonGeometry,
  type DromapGeoJsonLayer,
} from "@/stores/editor-test-geojson-layers";

import { getFeatureDashStyle, getFeatureMarkerSize } from "./feature-style";
import {
  drawLineArrowOnCanvas,
  featureHasArrowEnd,
  featureHasArrowStart,
  featureHasLineArrow,
  getLineArrowBodyLineCap,
  getLineVisibleCanvasPoints,
} from "./line-arrow";
import { drawMarkerSymbolOnCanvas } from "./marker-symbol";
import {
  DEFAULT_TEXT_CONTENT,
  getTextBackgroundColor,
  getTextBackgroundEnabled,
  getTextBackgroundOpacity,
  getTextBorderColor,
  getTextBorderEnabled,
  getTextBorderWidth,
  getTextFeatureContent,
  getTextFeatureFontSize,
  getTextFeatureRotation,
  hexToRgba,
  splitTextLines,
  TEXT_HORIZONTAL_PADDING,
  TEXT_LINE_HEIGHT_RATIO,
  TEXT_VERTICAL_PADDING,
} from "./text-rendering";

import {
  EXPORT_BASEMAP_MAX_NATIVE_ZOOM,
  clampExportNumber,
  createExportLayout,
  getProjectedBounds,
  getSafeLegendTitle,
  getVisibleLegendFeatures,
  getWorkspaceBoundsPoints,
  normalizeLegendAppearance,
  projectLatLng,
} from "./export-layout";
import type {
  ExportCanvasRect,
  ExportLatLngPoint,
  ExportLegendAppearance,
} from "./export-layout";
import {
  createExportLegendDisplayItems,
  createExportLegendLayout,
  type ExportLegendDisplayItem,
} from "./export-legend-layout";
import { getLegendEntries, type LegendEntry } from "./legend-entry";
import { mergeLegendEntriesWithGeoJsonLayers } from "./geojson-layer-legend";
import {
  getEffectiveGeoJsonFeatureStyle,
  getGeoJsonCanvasDashArray,
} from "./geojson-layer-style";
import { drawZoneHatchingOnCanvas } from "./zone-hatching";
import { drawExportScaleBarOnCanvas } from "./export-scale";
import { renderMapLibreStyleToCanvas } from "./openfreemap-maplibre";
import {
  drawAlignedZoneOutlineOnCanvas,
  shouldUseAlignedZoneOutline,
} from "./zone-outline";
import {
  getZoneDotsColor,
  getZoneDotsEnabled,
  getZoneDotsRadius,
  getZoneDotsSpacing,
  getZoneHatchingColor,
  getZoneHatchingEnabled,
  getZoneHatchingSpacing,
  getZoneHatchingStyle,
  getZoneHatchingWeight,
  getZoneStrokeEnabled,
  getZoneVisibleFillOpacity,
  getZoneVisibleStrokeOpacity,
} from "./zone-style";
import {
  DEFAULT_DROMAP_BASEMAP_ID,
  getDromapBasemapConfig,
  type DromapBasemapConfig,
  type DromapBasemapId,
} from "@/lib/dromap/basemap";
import {
  attributionHtmlToPlainText,
  getDromapExportAttributionHtml,
} from "@/lib/dromap/credits";
import {
  getDromapBoundaryRenderableLineStrings,
  loadDromapBoundaryFeatureCollection,
} from "@/lib/dromap/basemap-boundaries";

export const EXPORT_CAPTURE_ELEMENT_ID = "dromap-export-capture";

type ProjectedPoint = {
  x: number;
  y: number;
};

type FeatureStyle = {
  color?: string;
  opacity?: number;
  weight?: number;
  fillColor?: string;
  fillOpacity?: number;
  fontSize?: number;
};

type DownloadCanvasExportInput = {
  features: DroMapFeature[];
  layers?: DroMapLayer[];
  geoJsonLayers?: DromapGeoJsonLayer[];
  workspaceBounds: WorkspaceBounds;
  workspaceBasemapZoom: number | null;
  workspaceBasemapBaseZoom?: number | null;
  basemapId?: DromapBasemapId;
  legendTitle: string;
  legendPosition: ExportLegendPosition;
  exportFormat: ExportFormat;

  legendBackgroundColor: string;
  legendSideWidth: number;
  legendBottomHeight: number;
  legendTitleFontSize: number;
  legendItemFontSize: number;
  legendSectionTitleFontSize: number;

  scaleBarEnabled?: boolean;
  scaleBarStyle?: ExportScaleBarStyle;

  hiddenLegendFeatureIds: string[];
  legendFeatureOrder: string[];
  legendGroupOrder: string[];
  legendSectionOrder: string[];
  legendGroupLabels: Record<string, string>;
  legendGroupSections: Record<string, string>;
};

type LoadedTile = {
  image: HTMLImageElement;
  tileX: number;
  tileY: number;
};

type WorkspaceBoundsPoints = {
  southWest: ExportLatLngPoint;
  northEast: ExportLatLngPoint;
};

const TILE_SIZE = 256;
const STANDARD_EXPORT_PIXEL_RATIO = 2;
const MAX_EXPORT_PIXEL_RATIO = 4;
const EXPORT_TILE_DETAIL_RATIO = 1;

export type ExportVisualQuality = "standard" | "high" | "very-high";

function getExportPixelRatioForQuality(quality: ExportVisualQuality) {
  switch (quality) {
    case "very-high":
      return 4;
    case "high":
      return 3;
    case "standard":
    default:
      return STANDARD_EXPORT_PIXEL_RATIO;
  }
}

function getEffectiveExportPixelRatio(
  input: DownloadCanvasExportInput,
  quality: ExportVisualQuality = "standard",
) {
  const basemap = getDromapBasemapConfig(
    input.basemapId ?? DEFAULT_DROMAP_BASEMAP_ID,
  );

  // Les anciens fonds classiques sont des images raster déjà figées. Monter la
  // résolution du canvas ne crée pas de vraie information supplémentaire pour
  // le fond et peut donner une fausse impression de qualité. Les qualités
  // supérieures sont donc réservées aux fonds OpenFreeMap/MapLibre vectoriels.
  if (basemap.kind !== "maplibre") {
    return STANDARD_EXPORT_PIXEL_RATIO;
  }

  return getExportPixelRatioForQuality(quality);
}
const MAX_TILE_ZOOM = 18;
const MAX_TILE_COUNT = 420;

function getExportBaseFileName() {
  const now = new Date();

  const datePart = now.toISOString().slice(0, 10);
  const timePart = now.toTimeString().slice(0, 8).replaceAll(":", "-");

  return `dromap-export-${datePart}-${timePart}`;
}

function getExportFileName(
  extension: "png" | "pdf" | "csv" | "json" | "geojson" | "jpg" | "webp" | "svg",
) {
  return `${getExportBaseFileName()}.${extension}`;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hexColor: string) {
  const cleaned = hexColor.trim().replace("#", "");

  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return null;
  }

  return {
    r: Number.parseInt(cleaned.slice(0, 2), 16),
    g: Number.parseInt(cleaned.slice(2, 4), 16),
    b: Number.parseInt(cleaned.slice(4, 6), 16),
  };
}

function getReadableLegendTextColors(backgroundColor: string) {
  const rgb = hexToRgb(backgroundColor);

  if (!rgb) {
    return {
      titleColor: "#0f172a",
      textColor: "#1e293b",
      mutedTextColor: "#64748b",
      borderColor: "#cbd5e1",
    };
  }

  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;

  if (luminance < 0.45) {
    return {
      titleColor: "#f8fafc",
      textColor: "#e2e8f0",
      mutedTextColor: "#cbd5e1",
      borderColor: "rgba(255, 255, 255, 0.35)",
    };
  }

  return {
    titleColor: "#0f172a",
    textColor: "#1e293b",
    mutedTextColor: "#64748b",
    borderColor: "#cbd5e1",
  };
}

function getLegendSeparatorColor(backgroundColor: string) {
  const rgb = hexToRgb(backgroundColor);

  if (!rgb) {
    return "#94a3b8";
  }

  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;

  return luminance < 0.45 ? "rgba(255, 255, 255, 0.72)" : "#64748b";
}

function getTileCoverage(points: WorkspaceBoundsPoints, zoom: number) {
  const projectedBounds = getProjectedBounds(points, zoom);
  const maxTileIndex = 2 ** zoom - 1;

  // Les fonds classiques peuvent être affichés sur deux copies du monde
  // côte à côte. On ne borne donc plus X à [0, maxTileIndex] : on garde
  // la position réelle pour le placement, puis on wrappe seulement l'index
  // utilisé dans l'URL de tuile.
  const minTileX = Math.floor(projectedBounds.northWest.x / TILE_SIZE);
  const maxTileX = Math.floor((projectedBounds.southEast.x - 1) / TILE_SIZE);

  const minTileY = Math.max(
    0,
    Math.floor(projectedBounds.northWest.y / TILE_SIZE),
  );
  const maxTileY = Math.min(
    maxTileIndex,
    Math.floor((projectedBounds.southEast.y - 1) / TILE_SIZE),
  );

  const tileCount =
    Math.max(0, maxTileX - minTileX + 1) * Math.max(0, maxTileY - minTileY + 1);

  return {
    ...projectedBounds,
    minTileX,
    maxTileX,
    minTileY,
    maxTileY,
    tileCount,
  };
}

function chooseTileZoom(
  points: WorkspaceBoundsPoints,
  logicalMapSize: { width: number; height: number },
  workspaceBasemapZoom: number | null,
) {
  if (
    typeof workspaceBasemapZoom === "number" &&
    Number.isFinite(workspaceBasemapZoom)
  ) {
    const preferredZoom = clamp(
      Math.round(workspaceBasemapZoom),
      0,
      MAX_TILE_ZOOM,
    );

    for (let zoom = preferredZoom; zoom >= 0; zoom -= 1) {
      const coverage = getTileCoverage(points, zoom);

      if (coverage.tileCount <= MAX_TILE_COUNT) {
        return zoom;
      }
    }

    return 0;
  }

  let bestAllowedZoom: number | null = null;

  for (let zoom = MAX_TILE_ZOOM; zoom >= 0; zoom -= 1) {
    const coverage = getTileCoverage(points, zoom);

    if (coverage.tileCount > MAX_TILE_COUNT) {
      continue;
    }

    if (bestAllowedZoom === null) {
      bestAllowedZoom = zoom;
    }

    if (
      coverage.width >= logicalMapSize.width * EXPORT_TILE_DETAIL_RATIO &&
      coverage.height >= logicalMapSize.height * EXPORT_TILE_DETAIL_RATIO
    ) {
      return Math.min(zoom, EXPORT_BASEMAP_MAX_NATIVE_ZOOM);
    }
  }

  return Math.min(bestAllowedZoom ?? 0, EXPORT_BASEMAP_MAX_NATIVE_ZOOM);
}


function getFallbackTileBasemap(
  basemap: DromapBasemapConfig,
): DromapBasemapConfig {
  if (basemap.kind === "tile" && basemap.id !== "osm") {
    return getDromapBasemapConfig("osm");
  }

  return getDromapBasemapConfig("carto-light");
}

function getWrappedTileX(zoom: number, x: number) {
  const worldTileCount = 2 ** zoom;

  return ((x % worldTileCount) + worldTileCount) % worldTileCount;
}

function getExportTileUrl(
  basemap: DromapBasemapConfig,
  zoom: number,
  x: number,
  y: number,
) {
  if (basemap.kind !== "tile") {
    return null;
  }

  return basemap.getExportTileUrl(zoom, getWrappedTileX(zoom, x), y);
}

function loadImageFromBlob(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Impossible de charger une tuile."));
    };

    image.src = objectUrl;
  });
}

async function loadImageFromUrl(url: string) {
  const response = await fetch(url, {
    mode: "cors",
    credentials: "omit",
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(`Tuile non récupérable : ${response.status}`);
  }

  const blob = await response.blob();

  return loadImageFromBlob(blob);
}

async function loadTileImage(
  basemap: DromapBasemapConfig,
  zoom: number,
  x: number,
  y: number,
) {
  const tileUrl = getExportTileUrl(basemap, zoom, x, y);

  if (!tileUrl) {
    throw new Error("Ce fond de carte n’utilise pas de tuiles.");
  }

  try {
    return await loadImageFromUrl(tileUrl);
  } catch (error) {
    console.warn(
      "Tuile ignorée, tentative avec fond de secours :",
      tileUrl,
      error,
    );

    const fallbackBasemap = getFallbackTileBasemap(basemap);
    const fallbackTileUrl = getExportTileUrl(fallbackBasemap, zoom, x, y);

    if (!fallbackTileUrl) {
      throw error;
    }

    return loadImageFromUrl(fallbackTileUrl);
  }
}

function chooseMapLibreDetailZoom(
  points: WorkspaceBoundsPoints,
  logicalMapSize: { width: number; height: number },
  workspaceBasemapZoom: number | null,
) {
  if (
    typeof workspaceBasemapZoom === "number" &&
    Number.isFinite(workspaceBasemapZoom)
  ) {
    return clamp(workspaceBasemapZoom, 0, MAX_TILE_ZOOM);
  }

  return chooseTileZoom(points, logicalMapSize, workspaceBasemapZoom);
}

async function loadTiles(
  points: WorkspaceBoundsPoints,
  logicalMapSize: { width: number; height: number },
  workspaceBasemapZoom: number | null,
  basemap: DromapBasemapConfig,
) {
  const zoom = chooseTileZoom(points, logicalMapSize, workspaceBasemapZoom);
  const coverage = getTileCoverage(points, zoom);
  const loadedTiles: LoadedTile[] = [];

  if (basemap.kind !== "tile") {
    return {
      zoom,
      coverage,
      loadedTiles,
    };
  }

  const tilePromises: Array<Promise<void>> = [];

  for (let tileX = coverage.minTileX; tileX <= coverage.maxTileX; tileX += 1) {
    for (
      let tileY = coverage.minTileY;
      tileY <= coverage.maxTileY;
      tileY += 1
    ) {
      const promise = loadTileImage(basemap, zoom, tileX, tileY)
        .then((image) => {
          loadedTiles.push({
            image,
            tileX,
            tileY,
          });
        })
        .catch((error) => {
          console.warn(
            "Tuile ignorée pendant l’export :",
            { zoom, tileX, tileY },
            error,
          );
        });

      tilePromises.push(promise);
    }
  }

  await Promise.all(tilePromises);

  return {
    zoom,
    coverage,
    loadedTiles,
  };
}

async function drawTiles(
  ctx: CanvasRenderingContext2D,
  points: WorkspaceBoundsPoints,
  mapRect: ExportCanvasRect,
  logicalMapSize: { width: number; height: number },
  workspaceBasemapZoom: number | null,
  basemap: DromapBasemapConfig,
) {
  const { zoom, coverage, loadedTiles } = await loadTiles(
    points,
    logicalMapSize,
    workspaceBasemapZoom,
    basemap,
  );

  const scaleX = mapRect.width / coverage.width;
  const scaleY = mapRect.height / coverage.height;

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapRect.x, mapRect.y, mapRect.width, mapRect.height);
  ctx.clip();

  ctx.fillStyle = basemap.exportBackground;
  ctx.fillRect(mapRect.x, mapRect.y, mapRect.width, mapRect.height);

  for (const tile of loadedTiles) {
    const destX =
      mapRect.x + (tile.tileX * TILE_SIZE - coverage.northWest.x) * scaleX;
    const destY =
      mapRect.y + (tile.tileY * TILE_SIZE - coverage.northWest.y) * scaleY;

    const destWidth = TILE_SIZE * scaleX;
    const destHeight = TILE_SIZE * scaleY;

    ctx.drawImage(tile.image, destX, destY, destWidth, destHeight);
  }

  ctx.restore();

  return {
    zoom,
    projectedNorthWest: coverage.northWest,
    scaleX,
    scaleY,
  };
}

async function drawMapLibreBasemap(
  ctx: CanvasRenderingContext2D,
  points: WorkspaceBoundsPoints,
  mapRect: ExportCanvasRect,
  logicalMapSize: { width: number; height: number },
  workspaceBasemapZoom: number | null,
  basemap: DromapBasemapConfig,
  pixelRatio: number,
) {
  const zoom = chooseMapLibreDetailZoom(
    points,
    logicalMapSize,
    workspaceBasemapZoom,
  );
  const projectedBounds = getProjectedBounds(points, zoom);
  const scaleX = mapRect.width / projectedBounds.width;
  const scaleY = mapRect.height / projectedBounds.height;

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapRect.x, mapRect.y, mapRect.width, mapRect.height);
  ctx.clip();

  ctx.fillStyle = basemap.exportBackground;
  ctx.fillRect(mapRect.x, mapRect.y, mapRect.width, mapRect.height);

  if (basemap.kind === "maplibre") {
    try {
      const mapCanvas = await renderMapLibreStyleToCanvas({
        styleUrl: basemap.styleUrl,
        bounds: points,
        width: mapRect.width * pixelRatio,
        height: mapRect.height * pixelRatio,
        detailLeafletZoom: zoom,
      });

      ctx.drawImage(
        mapCanvas,
        mapRect.x,
        mapRect.y,
        mapRect.width,
        mapRect.height,
      );
    } catch (error) {
      console.warn(
        "Fond OpenFreeMap impossible à rendre dans l’export, fallback raster.",
        error,
      );

      ctx.restore();

      return drawTiles(
        ctx,
        points,
        mapRect,
        logicalMapSize,
        workspaceBasemapZoom,
        getDromapBasemapConfig("carto-light"),
      );
    }
  }

  ctx.restore();

  return {
    zoom,
    projectedNorthWest: projectedBounds.northWest,
    scaleX,
    scaleY,
  };
}

async function drawBasemap(
  ctx: CanvasRenderingContext2D,
  points: WorkspaceBoundsPoints,
  mapRect: ExportCanvasRect,
  logicalMapSize: { width: number; height: number },
  workspaceBasemapZoom: number | null,
  basemap: DromapBasemapConfig,
  pixelRatio: number,
) {
  if (basemap.kind === "maplibre") {
    return drawMapLibreBasemap(
      ctx,
      points,
      mapRect,
      logicalMapSize,
      workspaceBasemapZoom,
      basemap,
      pixelRatio,
    );
  }

  return drawTiles(
    ctx,
    points,
    mapRect,
    logicalMapSize,
    workspaceBasemapZoom,
    basemap,
  );
}


function getBasemapAttributionText(basemap: DromapBasemapConfig) {
  return attributionHtmlToPlainText(getDromapExportAttributionHtml(basemap));
}

function wrapAttributionText(
  ctx: CanvasRenderingContext2D,
  attributionText: string,
  maxLineWidth: number,
) {
  const parts = attributionText.split(/\s+·\s+/g).filter(Boolean);
  const lines: string[] = [];

  let currentLine = "";

  for (const part of parts) {
    const nextLine = currentLine ? `${currentLine} · ${part}` : part;

    if (ctx.measureText(nextLine).width <= maxLineWidth || !currentLine) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = part;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [attributionText];
}

function drawBasemapAttribution(
  ctx: CanvasRenderingContext2D,
  basemap: DromapBasemapConfig,
  mapRect: ExportCanvasRect,
) {
  const attributionText = getBasemapAttributionText(basemap);

  if (!attributionText) {
    return;
  }

  const fontSize = Math.max(6, Math.min(8, Math.round(mapRect.width / 210)));
  const lineHeight = fontSize + 2;
  const paddingX = 3;
  const paddingY = 1.5;
  const maxLineWidth = Math.max(80, Math.min(mapRect.width * 0.62, mapRect.width - 12));

  ctx.save();
  ctx.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textBaseline = "bottom";

  const lines = wrapAttributionText(ctx, attributionText, maxLineWidth);
  const textWidth = Math.min(
    maxLineWidth,
    Math.max(...lines.map((line) => ctx.measureText(line).width)),
  );
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = lines.length * lineHeight + paddingY * 2;
  const x = mapRect.x + mapRect.width - boxWidth - 2;
  const y = mapRect.y + mapRect.height - boxHeight - 2;

  // Attribution obligatoire mais volontairement minimale : petite, transparente
  // et collée au bord du fond pour ne pas parasiter la carte pédagogique.
  ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.fillStyle = "rgba(15, 23, 42, 0.52)";

  lines.forEach((line, index) => {
    ctx.fillText(
      line,
      x + paddingX,
      y + paddingY + fontSize + index * lineHeight,
    );
  });

  ctx.restore();
}

function clearOutsideMapRect(
  ctx: CanvasRenderingContext2D,
  canvas: { width: number; height: number },
  mapRect: ExportCanvasRect,
) {
  ctx.save();
  ctx.fillStyle = "#ffffff";

  ctx.fillRect(0, 0, canvas.width, mapRect.y);
  ctx.fillRect(0, mapRect.y + mapRect.height, canvas.width, canvas.height);
  ctx.fillRect(0, mapRect.y, mapRect.x, mapRect.height);
  ctx.fillRect(
    mapRect.x + mapRect.width,
    mapRect.y,
    canvas.width - (mapRect.x + mapRect.width),
    mapRect.height,
  );

  ctx.restore();
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function getLegendZoneFillOpacity(feature: DroMapFeature) {
  const visibleFillOpacity = getZoneVisibleFillOpacity(feature);

  if (visibleFillOpacity > 0) {
    return visibleFillOpacity;
  }

  const style = feature.properties?.style ?? {};

  if (
    feature.properties?.type === "zone" &&
    feature.properties?.zoneVariant === "boundary-fill" &&
    style.zoneFillEnabled !== false
  ) {
    return clamp01(Number(style.fillOpacity ?? 0));
  }

  return 0;
}

function getFeatureStyle(
  feature: DroMapFeature,
): Required<
  Pick<
    FeatureStyle,
    "color" | "opacity" | "weight" | "fillColor" | "fillOpacity"
  >
> &
  Pick<FeatureStyle, "fontSize"> {
  const style = feature.properties?.style as FeatureStyle | undefined;
  const color = style?.color ?? "#334155";
  const rawOpacity = style?.opacity ?? 1;
  const opacity =
    featureHasLineArrow(feature) && rawOpacity <= 0.05 ? 1 : rawOpacity;

  return {
    color,
    opacity,
    weight: style?.weight ?? 3,
    fillColor: style?.fillColor ?? color,
    fillOpacity: style?.fillOpacity ?? 0.3,
    fontSize: style?.fontSize ?? 22,
  };
}

function getCanvasLineDash(feature: DroMapFeature, lineWidth: number) {
  const dashStyle = getFeatureDashStyle(feature);

  if (dashStyle === "solid") {
    return [] as number[];
  }

  if (dashStyle === "dashed") {
    return [Math.max(8, lineWidth * 3), Math.max(6, lineWidth * 1.8)];
  }

  return [0.001, Math.max(6, lineWidth * 2.4)];
}

function getLegendZoneStrokeWidth(feature: DroMapFeature, weight: number) {
  const dashStyle = getFeatureDashStyle(feature);
  const baseWidth = Math.max(3, Math.min(weight * 1.35, 9));

  // Dans la légende, un contour trop épais masque vite les interruptions des
  // tirets/pointillés. On limite seulement le figuré de légende pour préserver
  // la lisibilité, sans changer l'objet réel sur la carte ou dans le PNG.
  if (dashStyle === "dotted") {
    return Math.min(baseWidth, 4.2);
  }

  if (dashStyle === "dashed") {
    return Math.min(baseWidth, 5);
  }

  return baseWidth;
}


function getCleanLegendLineWidth(weight: number) {
  return Math.max(3.2, Math.min(weight * 1.35, 7.2));
}

function drawCleanLegendLineStrokeOnCanvas(
  ctx: CanvasRenderingContext2D,
  feature: DroMapFeature,
  startX: number,
  endX: number,
  centerY: number,
  lineWidth: number,
) {
  const dashStyle = getFeatureDashStyle(feature);

  if (dashStyle === "solid") {
    ctx.beginPath();

    if (isFreehandLineFeature(feature)) {
      const controlOffset = Math.max(5, lineWidth * 1.35);
      const segmentWidth = endX - startX;

      ctx.moveTo(startX, centerY);
      ctx.bezierCurveTo(
        startX + segmentWidth * 0.25,
        centerY - controlOffset,
        startX + segmentWidth * 0.48,
        centerY + controlOffset,
        startX + segmentWidth * 0.66,
        centerY,
      );
      ctx.bezierCurveTo(
        startX + segmentWidth * 0.8,
        centerY - controlOffset,
        startX + segmentWidth * 0.92,
        centerY + controlOffset * 0.65,
        endX,
        centerY,
      );
    } else {
      ctx.moveTo(startX, centerY);
      ctx.lineTo(endX, centerY);
    }

    ctx.stroke();
    return;
  }

  if (dashStyle === "dotted") {
    const dotRadius = Math.max(2.2, Math.min(lineWidth * 0.58, 4));
    const dotCount = Math.max(5, Math.min(8, Math.floor((endX - startX) / 8)));
    const firstX = startX + dotRadius;
    const lastX = endX - dotRadius;

    for (let index = 0; index < dotCount; index += 1) {
      const progress = dotCount <= 1 ? 0 : index / (dotCount - 1);
      const dotX = firstX + (lastX - firstX) * progress;
      const freehandOffset = isFreehandLineFeature(feature)
        ? Math.sin(index * 1.35) * Math.max(2.2, lineWidth * 0.55)
        : 0;

      ctx.beginPath();
      ctx.arc(dotX, centerY + freehandOffset, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    return;
  }

  const segmentCount = Math.max(3, Math.min(4, Math.floor((endX - startX) / 15)));
  const totalWidth = endX - startX;
  const gap = Math.max(6, lineWidth * 1.15);
  const segmentLength = Math.max(9, (totalWidth - gap * (segmentCount - 1)) / segmentCount);
  const usedWidth = segmentLength * segmentCount + gap * (segmentCount - 1);
  const firstX = startX + Math.max(0, (totalWidth - usedWidth) / 2);

  for (let index = 0; index < segmentCount; index += 1) {
    const segmentStartX = firstX + index * (segmentLength + gap);
    const segmentEndX = segmentStartX + segmentLength;
    const offset1 = isFreehandLineFeature(feature)
      ? Math.sin(index * 1.2) * Math.max(2, lineWidth * 0.45)
      : 0;
    const offset2 = isFreehandLineFeature(feature)
      ? Math.sin(index * 1.2 + 0.8) * Math.max(2, lineWidth * 0.45)
      : 0;

    ctx.beginPath();
    ctx.moveTo(segmentStartX, centerY + offset1);
    ctx.lineTo(segmentEndX, centerY + offset2);
    ctx.stroke();
  }
}

function drawCleanLegendZoneOutlineOnCanvas(
  ctx: CanvasRenderingContext2D,
  feature: DroMapFeature,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  opacity: number,
  lineWidth: number,
) {
  const dashStyle = getFeatureDashStyle(feature);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (dashStyle === "solid") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 4);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (dashStyle === "dotted") {
    const radius = Math.max(1.6, Math.min(lineWidth * 0.58, 3));
    const topBottomCount = Math.max(5, Math.round(width / 8));
    const sideCount = Math.max(4, Math.round(height / 7));

    for (let index = 0; index < topBottomCount; index += 1) {
      const progress = topBottomCount <= 1 ? 0 : index / (topBottomCount - 1);
      const dotX = x + width * progress;

      ctx.beginPath();
      ctx.arc(dotX, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(dotX, y + height, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let index = 1; index < sideCount - 1; index += 1) {
      const progress = index / (sideCount - 1);
      const dotY = y + height * progress;

      ctx.beginPath();
      ctx.arc(x, dotY, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x + width, dotY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    return;
  }

  const horizontalSegments = 3;
  const verticalSegments = 2;
  const horizontalGap = Math.max(6, width * 0.08);
  const verticalGap = Math.max(5, height * 0.13);
  const horizontalLength = (width - horizontalGap * (horizontalSegments - 1)) / horizontalSegments;
  const verticalLength = (height - verticalGap * (verticalSegments - 1)) / verticalSegments;

  for (let index = 0; index < horizontalSegments; index += 1) {
    const segmentX = x + index * (horizontalLength + horizontalGap);

    ctx.beginPath();
    ctx.moveTo(segmentX, y);
    ctx.lineTo(segmentX + horizontalLength, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(segmentX, y + height);
    ctx.lineTo(segmentX + horizontalLength, y + height);
    ctx.stroke();
  }

  for (let index = 0; index < verticalSegments; index += 1) {
    const segmentY = y + index * (verticalLength + verticalGap);

    ctx.beginPath();
    ctx.moveTo(x, segmentY);
    ctx.lineTo(x, segmentY + verticalLength);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + width, segmentY);
    ctx.lineTo(x + width, segmentY + verticalLength);
    ctx.stroke();
  }

  ctx.restore();
}

function geoJsonPositionToLatLng(position: unknown): ExportLatLngPoint | null {
  if (!Array.isArray(position)) {
    return null;
  }

  const lng = position[0];
  const lat = position[1];

  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  return { lat, lng };
}

function projectToCanvas(
  point: ExportLatLngPoint,
  mapRect: ExportCanvasRect,
  zoom: number,
  projectedNorthWest: ProjectedPoint,
  scaleX: number,
  scaleY: number,
) {
  const projected = projectLatLng(point.lat, point.lng, zoom);

  return {
    x: mapRect.x + (projected.x - projectedNorthWest.x) * scaleX,
    y: mapRect.y + (projected.y - projectedNorthWest.y) * scaleY,
  };
}

function traceCanvasRingsPath(
  ctx: CanvasRenderingContext2D,
  rings: ProjectedPoint[][],
) {
  ctx.beginPath();

  for (const ring of rings) {
    if (ring.length < 3 || !ring[0]) {
      continue;
    }

    ctx.moveTo(ring[0].x, ring[0].y);

    for (const point of ring.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }

    ctx.closePath();
  }
}

function projectBoundaryPositionToCanvas(
  position: [number, number],
  mapRect: ExportCanvasRect,
  projection: {
    zoom: number;
    projectedNorthWest: ProjectedPoint;
    scaleX: number;
    scaleY: number;
  },
) {
  const [lng, lat] = position;

  return projectToCanvas(
    { lat, lng },
    mapRect,
    projection.zoom,
    projection.projectedNorthWest,
    projection.scaleX,
    projection.scaleY,
  );
}

function shouldSkipLongBoundarySegment(
  previousPoint: ProjectedPoint,
  nextPoint: ProjectedPoint,
  mapRect: ExportCanvasRect,
) {
  return Math.abs(nextPoint.x - previousPoint.x) > mapRect.width * 0.72;
}

function strokeBoundaryRing(
  ctx: CanvasRenderingContext2D,
  ring: [number, number][],
  mapRect: ExportCanvasRect,
  projection: {
    zoom: number;
    projectedNorthWest: ProjectedPoint;
    scaleX: number;
    scaleY: number;
  },
) {
  if (ring.length < 2) {
    return;
  }

  let previousPoint: ProjectedPoint | null = null;
  let hasOpenPath = false;

  for (const position of ring) {
    const point = projectBoundaryPositionToCanvas(
      position,
      mapRect,
      projection,
    );

    if (
      previousPoint &&
      shouldSkipLongBoundarySegment(previousPoint, point, mapRect)
    ) {
      if (hasOpenPath) {
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      hasOpenPath = true;
      previousPoint = point;
      continue;
    }

    if (!hasOpenPath) {
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      hasOpenPath = true;
    } else {
      ctx.lineTo(point.x, point.y);
    }

    previousPoint = point;
  }

  if (hasOpenPath) {
    ctx.stroke();
  }
}

async function drawBasemapBoundaryOverlay(
  ctx: CanvasRenderingContext2D,
  basemap: DromapBasemapConfig,
  mapRect: ExportCanvasRect,
  projection: {
    zoom: number;
    projectedNorthWest: ProjectedPoint;
    scaleX: number;
    scaleY: number;
  },
) {
  const boundaryOverlay = basemap.boundaryOverlay;

  if (!boundaryOverlay) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapRect.x, mapRect.y, mapRect.width, mapRect.height);
  ctx.clip();

  try {
    for (const layerConfig of boundaryOverlay.layers) {
      const featureCollection = await loadDromapBoundaryFeatureCollection(
        layerConfig.dataUrl,
      );

      ctx.strokeStyle = layerConfig.strokeColor;
      ctx.globalAlpha = layerConfig.strokeOpacity;
      ctx.lineWidth = layerConfig.strokeWeight;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(
        layerConfig.strokeDashArray
          ?.split(/\s+/)
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0) ?? [],
      );

      const lineStrings = getDromapBoundaryRenderableLineStrings(
        featureCollection,
        layerConfig,
      );

      for (const lineString of lineStrings) {
        strokeBoundaryRing(ctx, lineString, mapRect, projection);
      }
    }
  } catch (error) {
    console.warn("Frontières non dessinées pendant l’export :", error);
  } finally {
    ctx.restore();
  }
}

function projectGeoJsonPositionForCanvas(
  position: unknown,
  mapRect: ExportCanvasRect,
  projection: {
    zoom: number;
    projectedNorthWest: ProjectedPoint;
    scaleX: number;
    scaleY: number;
  },
) {
  const point = geoJsonPositionToLatLng(position);

  if (!point) {
    return null;
  }

  return projectToCanvas(
    point,
    mapRect,
    projection.zoom,
    projection.projectedNorthWest,
    projection.scaleX,
    projection.scaleY,
  );
}

function projectGeoJsonLineForCanvas(
  coordinates: [number, number][],
  mapRect: ExportCanvasRect,
  projection: {
    zoom: number;
    projectedNorthWest: ProjectedPoint;
    scaleX: number;
    scaleY: number;
  },
) {
  return coordinates
    .map((position) => projectGeoJsonPositionForCanvas(position, mapRect, projection))
    .filter((point): point is ProjectedPoint => point !== null);
}

function drawGeoJsonLayerPointOnCanvas(
  ctx: CanvasRenderingContext2D,
  layer: DromapGeoJsonLayer,
  feature: DromapGeoJsonFeature,
  position: [number, number],
  mapRect: ExportCanvasRect,
  projection: {
    zoom: number;
    projectedNorthWest: ProjectedPoint;
    scaleX: number;
    scaleY: number;
  },
  graphicScale: number,
) {
  const point = projectGeoJsonPositionForCanvas(position, mapRect, projection);

  if (!point) {
    return;
  }

  const style = getEffectiveGeoJsonFeatureStyle(layer, feature);
  const layerOpacity = clamp(layer.opacity, 0, 1);
  const radius = Math.max(1.5, (style.markerSize / 2) * graphicScale);
  const pointOpacity = Math.max(0, Math.min(1, style.strokeOpacity * layerOpacity));

  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.globalAlpha = pointOpacity;
  ctx.fillStyle = style.strokeColor;
  ctx.fill();
  ctx.globalAlpha = pointOpacity;
  ctx.strokeStyle = style.strokeColor;
  ctx.lineWidth = Math.max(1, style.strokeWeight * graphicScale);
  ctx.setLineDash([]);
  ctx.stroke();
}

function drawGeoJsonLayerLineOnCanvas(
  ctx: CanvasRenderingContext2D,
  layer: DromapGeoJsonLayer,
  feature: DromapGeoJsonFeature,
  coordinates: [number, number][],
  mapRect: ExportCanvasRect,
  projection: {
    zoom: number;
    projectedNorthWest: ProjectedPoint;
    scaleX: number;
    scaleY: number;
  },
  graphicScale: number,
) {
  const points = projectGeoJsonLineForCanvas(coordinates, mapRect, projection);

  if (points.length < 2) {
    return;
  }

  const style = getEffectiveGeoJsonFeatureStyle(layer, feature);
  const layerOpacity = clamp(layer.opacity, 0, 1);
  const lineWidth = Math.max(1, style.strokeWeight * graphicScale);

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (const point of points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }

  ctx.globalAlpha = Math.max(0, Math.min(1, style.strokeOpacity * layerOpacity));
  ctx.strokeStyle = style.strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(getGeoJsonCanvasDashArray(style, lineWidth));
  ctx.stroke();
}

function drawGeoJsonLayerPolygonOnCanvas(
  ctx: CanvasRenderingContext2D,
  layer: DromapGeoJsonLayer,
  feature: DromapGeoJsonFeature,
  coordinates: [number, number][][],
  mapRect: ExportCanvasRect,
  projection: {
    zoom: number;
    projectedNorthWest: ProjectedPoint;
    scaleX: number;
    scaleY: number;
  },
  graphicScale: number,
) {
  const rings = coordinates
    .map((ring) => projectGeoJsonLineForCanvas(ring, mapRect, projection))
    .filter((ring) => ring.length >= 3);

  if (rings.length === 0) {
    return;
  }

  const style = getEffectiveGeoJsonFeatureStyle(layer, feature);
  const layerOpacity = clamp(layer.opacity, 0, 1);
  const lineWidth = Math.max(1, style.strokeWeight * graphicScale);
  const fillOpacity = Math.max(0, Math.min(1, style.fillOpacity * layerOpacity));
  const strokeOpacity = Math.max(0, Math.min(1, style.strokeOpacity * layerOpacity));

  if (style.zoneFillEnabled && fillOpacity > 0) {
    traceCanvasRingsPath(ctx, rings);
    ctx.globalAlpha = fillOpacity;
    ctx.fillStyle = style.fillColor;
    ctx.fill("evenodd");
  }

  if (style.zoneStrokeEnabled && strokeOpacity > 0) {
    traceCanvasRingsPath(ctx, rings);
    ctx.globalAlpha = strokeOpacity;
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(getGeoJsonCanvasDashArray(style, lineWidth));
    ctx.stroke();
  }
}

function drawGeoJsonLayerGeometryOnCanvas(
  ctx: CanvasRenderingContext2D,
  layer: DromapGeoJsonLayer,
  feature: DromapGeoJsonFeature,
  geometry: DromapGeoJsonGeometry,
  mapRect: ExportCanvasRect,
  projection: {
    zoom: number;
    projectedNorthWest: ProjectedPoint;
    scaleX: number;
    scaleY: number;
  },
  graphicScale: number,
) {
  if (geometry.type === "Point") {
    drawGeoJsonLayerPointOnCanvas(ctx, layer, feature, geometry.coordinates, mapRect, projection, graphicScale);
    return;
  }

  if (geometry.type === "MultiPoint") {
    geometry.coordinates.forEach((position) =>
      drawGeoJsonLayerPointOnCanvas(ctx, layer, feature, position, mapRect, projection, graphicScale),
    );
    return;
  }

  if (geometry.type === "LineString") {
    drawGeoJsonLayerLineOnCanvas(ctx, layer, feature, geometry.coordinates, mapRect, projection, graphicScale);
    return;
  }

  if (geometry.type === "MultiLineString") {
    geometry.coordinates.forEach((line) =>
      drawGeoJsonLayerLineOnCanvas(ctx, layer, feature, line, mapRect, projection, graphicScale),
    );
    return;
  }

  if (geometry.type === "Polygon") {
    drawGeoJsonLayerPolygonOnCanvas(ctx, layer, feature, geometry.coordinates, mapRect, projection, graphicScale);
    return;
  }

  geometry.coordinates.forEach((polygon) =>
    drawGeoJsonLayerPolygonOnCanvas(ctx, layer, feature, polygon, mapRect, projection, graphicScale),
  );
}

function drawGeoJsonLayersOnCanvas(
  ctx: CanvasRenderingContext2D,
  layers: DromapGeoJsonLayer[] | undefined,
  mapRect: ExportCanvasRect,
  projection: {
    zoom: number;
    projectedNorthWest: ProjectedPoint;
    scaleX: number;
    scaleY: number;
  },
  graphicScale: number,
  workspaceBounds: WorkspaceBounds,
) {
  const renderableLayers = getRenderableGeoJsonLayers(layers ?? []);

  if (renderableLayers.length === 0) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapRect.x, mapRect.y, mapRect.width, mapRect.height);
  ctx.clip();

  for (const layer of renderableLayers) {
    const displayData = getGeoJsonLayerLoadedDisplayData(layer, workspaceBounds);
    for (const feature of displayData.features as DromapGeoJsonFeature[]) {
      drawGeoJsonLayerGeometryOnCanvas(
        ctx,
        layer,
        feature,
        feature.geometry,
        mapRect,
        projection,
        graphicScale,
      );
    }
  }

  ctx.restore();
}

function drawTextFeature(
  ctx: CanvasRenderingContext2D,
  feature: DroMapFeature,
  x: number,
  y: number,
  graphicScale: number,
) {
  const style = getFeatureStyle(feature);
  const text = getTextFeatureContent(feature);
  const lines = splitTextLines(text, DEFAULT_TEXT_CONTENT);
  const fontSize = getTextFeatureFontSize(feature) * graphicScale;
  const lineHeight = fontSize * TEXT_LINE_HEIGHT_RATIO;
  const horizontalPadding = TEXT_HORIZONTAL_PADDING * graphicScale;
  const verticalPadding = TEXT_VERTICAL_PADDING * graphicScale;
  const rotation = (getTextFeatureRotation(feature) * Math.PI) / 180;
  const hasBackground = getTextBackgroundEnabled(feature);
  const hasBorder = getTextBorderEnabled(feature);

  ctx.save();
  ctx.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`;

  const measuredLineWidths = lines.map((line) => {
    if (line.length === 0) {
      return fontSize * 0.5;
    }

    return ctx.measureText(line).width;
  });
  const boxWidth =
    Math.max(56 * graphicScale, ...measuredLineWidths) + horizontalPadding;
  const boxHeight = lines.length * lineHeight + verticalPadding;
  const firstLineY = -boxHeight / 2 + verticalPadding / 2 + lineHeight / 2;

  ctx.translate(x, y);
  ctx.rotate(rotation);

  if (hasBackground) {
    ctx.fillStyle = hexToRgba(
      getTextBackgroundColor(feature),
      getTextBackgroundOpacity(feature),
    );
    ctx.beginPath();
    ctx.roundRect(
      -boxWidth / 2,
      -boxHeight / 2,
      boxWidth,
      boxHeight,
      6 * graphicScale,
    );
    ctx.fill();
  }

  if (hasBorder) {
    ctx.strokeStyle = getTextBorderColor(feature);
    ctx.lineWidth = getTextBorderWidth(feature) * graphicScale;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.roundRect(
      -boxWidth / 2,
      -boxHeight / 2,
      boxWidth,
      boxHeight,
      6 * graphicScale,
    );
    ctx.stroke();
  }

  ctx.fillStyle = hexToRgba(style.color, clamp(style.opacity, 0, 1));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  lines.forEach((line, index) => {
    if (line.length === 0) {
      return;
    }

    ctx.fillText(line, 0, firstLineY + index * lineHeight);
  });

  ctx.restore();
}

function drawFeature(
  ctx: CanvasRenderingContext2D,
  feature: DroMapFeature,
  mapRect: ExportCanvasRect,
  projection: {
    zoom: number;
    projectedNorthWest: ProjectedPoint;
    scaleX: number;
    scaleY: number;
  },
  graphicScale: number,
) {
  const geometry = feature.geometry as {
    type?: string;
    coordinates?: unknown;
  };

  if (!geometry?.type) {
    return;
  }

  const style = getFeatureStyle(feature);
  const lineWidth = Math.max(1, style.weight * graphicScale);

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapRect.x, mapRect.y, mapRect.width, mapRect.height);
  ctx.clip();

  if (geometry.type === "Point") {
    const latLng = geoJsonPositionToLatLng(geometry.coordinates);

    if (!latLng) {
      ctx.restore();
      return;
    }

    const canvasPoint = projectToCanvas(
      latLng,
      mapRect,
      projection.zoom,
      projection.projectedNorthWest,
      projection.scaleX,
      projection.scaleY,
    );

    if (feature.properties?.type === "text") {
      drawTextFeature(ctx, feature, canvasPoint.x, canvasPoint.y, graphicScale);

      ctx.restore();
      return;
    }

    drawMarkerSymbolOnCanvas(
      ctx,
      feature,
      canvasPoint.x,
      canvasPoint.y,
      getFeatureMarkerSize(feature) * graphicScale,
    );

    ctx.restore();
    return;
  }

  if (geometry.type === "LineString") {
    if (!Array.isArray(geometry.coordinates)) {
      ctx.restore();
      return;
    }

    const points = geometry.coordinates
      .map((position) => geoJsonPositionToLatLng(position))
      .filter((point): point is ExportLatLngPoint => point !== null)
      .map((point) =>
        projectToCanvas(
          point,
          mapRect,
          projection.zoom,
          projection.projectedNorthWest,
          projection.scaleX,
          projection.scaleY,
        ),
      );

    if (points.length < 2) {
      ctx.restore();
      return;
    }

    ctx.globalAlpha = style.opacity;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = featureHasLineArrow(feature)
      ? getLineArrowBodyLineCap(feature)
      : "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(getCanvasLineDash(feature, lineWidth));

    const visibleLinePoints = getLineVisibleCanvasPoints(
      feature,
      points,
      graphicScale,
    );

    ctx.beginPath();
    ctx.moveTo(visibleLinePoints[0].x, visibleLinePoints[0].y);

    for (const point of visibleLinePoints.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }

    ctx.stroke();

    drawLineArrowOnCanvas(
      ctx,
      feature,
      points[points.length - 1],
      points[points.length - 2],
      graphicScale,
      {
        startPoint: points[0],
        nextPoint: points[1],
        points,
      },
    );

    ctx.restore();
    return;
  }

  if (geometry.type === "Polygon") {
    if (!Array.isArray(geometry.coordinates)) {
      ctx.restore();
      return;
    }

    const rings = geometry.coordinates
      .map((ring) => {
        if (!Array.isArray(ring)) {
          return [];
        }

        return ring
          .map((position) => geoJsonPositionToLatLng(position))
          .filter((point): point is ExportLatLngPoint => point !== null)
          .map((point) =>
            projectToCanvas(
              point,
              mapRect,
              projection.zoom,
              projection.projectedNorthWest,
              projection.scaleX,
              projection.scaleY,
            ),
          );
      })
      .filter((ring) => ring.length >= 3);

    if (rings.length === 0) {
      ctx.restore();
      return;
    }

    traceCanvasRingsPath(ctx, rings);

    const fillOpacity = getZoneVisibleFillOpacity(feature);

    if (fillOpacity > 0) {
      ctx.globalAlpha = fillOpacity;
      ctx.fillStyle = style.fillColor;
      ctx.fill("evenodd");
    }

    drawZoneHatchingOnCanvas(ctx, feature, rings, { scale: graphicScale });

    const strokeOpacity = getZoneVisibleStrokeOpacity(feature);

    if (getZoneStrokeEnabled(feature) && strokeOpacity > 0 && lineWidth > 0) {
      traceCanvasRingsPath(ctx, rings);
      ctx.globalAlpha = strokeOpacity;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const alignedOutlineDrawn = shouldUseAlignedZoneOutline(feature)
        ? drawAlignedZoneOutlineOnCanvas(ctx, feature, rings, {
            color: style.color,
            opacity: strokeOpacity,
            lineWidth,
          })
        : false;

      if (!alignedOutlineDrawn) {
        ctx.setLineDash(getCanvasLineDash(feature, lineWidth));
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

function drawMapBorder(
  ctx: CanvasRenderingContext2D,
  mapRect: ExportCanvasRect,
) {
  ctx.save();
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.strokeRect(mapRect.x, mapRect.y, mapRect.width, mapRect.height);
  ctx.restore();
}

function drawTruncatedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
) {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }

  let truncated = text;

  while (
    truncated.length > 0 &&
    ctx.measureText(`${truncated}…`).width > maxWidth
  ) {
    truncated = truncated.slice(0, -1);
  }

  ctx.fillText(`${truncated}…`, x, y);
}

function drawWrappedWarningText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (
      ctx.measureText(nextLine).width <= maxWidth ||
      currentLine.length === 0
    ) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;

    if (lines.length >= maxLines) {
      break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  for (let index = 0; index < lines.length; index += 1) {
    ctx.fillText(lines[index], x, y + index * lineHeight);
  }
}

function drawLegendSymbol(
  ctx: CanvasRenderingContext2D,
  feature: DroMapFeature,
  x: number,
  y: number,
  symbolBoxWidth: number,
  symbolSize: number,
) {
  const type = feature.properties?.type;
  const style = getFeatureStyle(feature);
  const centerX = x + symbolBoxWidth / 2;
  const centerY = y + symbolSize / 2;

  if (type === "text") {
    const textSymbolSize = Math.round(Math.max(34, symbolSize * 0.86));
    const hasBackground = getTextBackgroundEnabled(feature);
    const hasBorder = getTextBorderEnabled(feature);

    ctx.save();
    ctx.translate(centerX, centerY);

    if (hasBackground) {
      ctx.fillStyle = hexToRgba(
        getTextBackgroundColor(feature),
        getTextBackgroundOpacity(feature),
      );
      ctx.beginPath();
      ctx.roundRect(
        -textSymbolSize / 2,
        -textSymbolSize / 2,
        textSymbolSize,
        textSymbolSize,
        5,
      );
      ctx.fill();
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(
        -textSymbolSize / 2,
        -textSymbolSize / 2,
        textSymbolSize,
        textSymbolSize,
        5,
      );
      ctx.fill();
    }

    ctx.strokeStyle = hasBorder ? getTextBorderColor(feature) : "#cbd5e1";
    ctx.lineWidth = hasBorder
      ? Math.max(1, Math.min(getTextBorderWidth(feature), 4))
      : 1.5;
    ctx.beginPath();
    ctx.roundRect(
      -textSymbolSize / 2,
      -textSymbolSize / 2,
      textSymbolSize,
      textSymbolSize,
      5,
    );
    ctx.stroke();

    ctx.fillStyle = hexToRgba(style.color, style.opacity);
    ctx.font = `700 ${Math.round(textSymbolSize * 0.58)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("T", 0, 1);

    ctx.restore();
    return;
  }

  if (type === "marker") {
    const markerSize = clamp(
      getFeatureMarkerSize(feature),
      symbolSize * 0.44,
      symbolSize * 0.9,
    );

    drawMarkerSymbolOnCanvas(ctx, feature, centerX, centerY, markerSize);
    return;
  }

  if (type === "line") {
    const symbolLineWidth = getCleanLegendLineWidth(style.weight);
    const startX = x + Math.max(5, symbolLineWidth * 0.65);
    const endX = x + symbolBoxWidth - Math.max(5, symbolLineWidth * 0.65);
    const hasArrowStart = featureHasArrowStart(feature);
    const hasArrowEnd = featureHasArrowEnd(feature);
    const arrowLength = Math.max(13, Math.min(24, symbolLineWidth * 2.45));
    const arrowHalfHeight = Math.max(7, Math.min(symbolSize * 0.34, symbolLineWidth * 1.35));
    const startArrowBaseX = startX + arrowLength;
    const endArrowBaseX = endX - arrowLength;
    const lineStartX = hasArrowStart
      ? startArrowBaseX - Math.max(1.8, symbolLineWidth * 0.42)
      : startX + Math.max(1, symbolLineWidth * 0.2);
    const lineEndX = hasArrowEnd
      ? endArrowBaseX + Math.max(1.8, symbolLineWidth * 0.42)
      : endX - Math.max(1, symbolLineWidth * 0.2);

    ctx.save();
    ctx.globalAlpha = style.opacity;
    ctx.strokeStyle = style.color;
    ctx.fillStyle = style.color;
    ctx.lineWidth = symbolLineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawCleanLegendLineStrokeOnCanvas(
      ctx,
      feature,
      lineStartX,
      lineEndX,
      centerY,
      symbolLineWidth,
    );

    if (hasArrowStart) {
      ctx.beginPath();
      ctx.moveTo(startX, centerY);
      ctx.lineTo(startArrowBaseX, centerY - arrowHalfHeight);
      ctx.lineTo(startArrowBaseX, centerY + arrowHalfHeight);
      ctx.closePath();
      ctx.fill();
    }

    if (hasArrowEnd) {
      ctx.beginPath();
      ctx.moveTo(endX, centerY);
      ctx.lineTo(endArrowBaseX, centerY - arrowHalfHeight);
      ctx.lineTo(endArrowBaseX, centerY + arrowHalfHeight);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
    return;
  }

  const symbolLineWidth = getLegendZoneStrokeWidth(feature, style.weight);
  const horizontalInset = Math.max(4, Math.round(symbolBoxWidth * 0.05));
  const verticalInset = Math.max(7, Math.round(symbolSize * 0.18));
  const rectX = x + horizontalInset;
  const rectY = y + verticalInset;
  const rectWidth = Math.max(1, symbolBoxWidth - horizontalInset * 2);
  const rectHeight = Math.max(1, symbolSize - verticalInset * 2);

  ctx.save();

  const legendFillOpacity = getLegendZoneFillOpacity(feature);

  if (legendFillOpacity > 0) {
    ctx.globalAlpha = Math.max(0.16, legendFillOpacity);
    ctx.fillStyle = style.fillColor;
    ctx.beginPath();
    ctx.roundRect(rectX, rectY, rectWidth, rectHeight, 4);
    ctx.fill();
  }

  if (getZoneHatchingEnabled(feature) || getZoneDotsEnabled(feature)) {
    const hatchingStyle = getZoneHatchingStyle(feature);
    const hatchSpacing = Math.max(7, Math.min(getZoneHatchingSpacing(feature), 14));
    const hatchWeight = Math.max(1.1, Math.min(getZoneHatchingWeight(feature), 3.2));
    const dotsSpacing = Math.max(8, Math.min(getZoneDotsSpacing(feature), 15));
    const dotRadius = Math.max(1.5, Math.min(getZoneDotsRadius(feature), 3.2));

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rectX, rectY, rectWidth, rectHeight, 4);
    ctx.clip();
    ctx.globalAlpha = 1;

    if (getZoneHatchingEnabled(feature)) {
      ctx.strokeStyle = getZoneHatchingColor(feature);
      ctx.lineWidth = hatchWeight;
      ctx.lineCap = "round";

      if (hatchingStyle === "horizontal" || hatchingStyle === "vertical") {
        for (
          let offset = -rectHeight;
          offset <= rectWidth + rectHeight;
          offset += hatchSpacing
        ) {
          ctx.beginPath();
          if (hatchingStyle === "horizontal") {
            ctx.moveTo(rectX, rectY + offset);
            ctx.lineTo(rectX + rectWidth, rectY + offset);
          } else {
            ctx.moveTo(rectX + offset, rectY);
            ctx.lineTo(rectX + offset, rectY + rectHeight);
          }
          ctx.stroke();
        }
      } else {
        for (
          let offset = -rectHeight;
          offset <= rectWidth + rectHeight;
          offset += hatchSpacing
        ) {
          ctx.beginPath();
          if (hatchingStyle === "diagonal-left") {
            ctx.moveTo(rectX + offset, rectY);
            ctx.lineTo(rectX + offset + rectHeight, rectY + rectHeight);
          } else {
            ctx.moveTo(rectX + offset, rectY + rectHeight);
            ctx.lineTo(rectX + offset + rectHeight, rectY);
          }
          ctx.stroke();
        }
      }
    }

    if (getZoneDotsEnabled(feature)) {
      ctx.fillStyle = getZoneDotsColor(feature);

      for (
        let yDot = rectY + dotRadius + 3;
        yDot <= rectY + rectHeight - dotRadius - 3;
        yDot += dotsSpacing
      ) {
        const rowIndex = Math.round((yDot - (rectY + dotRadius + 3)) / dotsSpacing);
        const rowOffset = rowIndex % 2 === 0 ? 0 : dotsSpacing / 2;

        for (
          let xDot = rectX + dotRadius + 4 + rowOffset;
          xDot <= rectX + rectWidth - dotRadius - 4;
          xDot += dotsSpacing
        ) {
          ctx.beginPath();
          ctx.arc(xDot, yDot, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  const legendStrokeOpacity = getZoneVisibleStrokeOpacity(feature);

  if (getZoneStrokeEnabled(feature) && legendStrokeOpacity > 0) {
    drawCleanLegendZoneOutlineOnCanvas(
      ctx,
      feature,
      rectX,
      rectY,
      rectWidth,
      rectHeight,
      style.color,
      legendStrokeOpacity,
      symbolLineWidth,
    );
  }

  ctx.restore();

}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  legendRect: ExportCanvasRect,
  title: string,
  entries: LegendEntry[],
  displayItems: ExportLegendDisplayItem[],
  appearance: ExportLegendAppearance,
  legendPosition: ExportLegendPosition,
) {
  const colors = getReadableLegendTextColors(appearance.backgroundColor);
  const sectionSeparatorColor = getLegendSeparatorColor(
    appearance.backgroundColor,
  );
  const legendLayout = createExportLegendLayout({
    legendRect,
    displayItems,
    legendPosition,
    appearance,
    title,
  });

  ctx.save();

  ctx.fillStyle = appearance.backgroundColor;
  ctx.fillRect(legendRect.x, legendRect.y, legendRect.width, legendRect.height);

  ctx.strokeStyle = colors.borderColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    legendRect.x,
    legendRect.y,
    legendRect.width,
    legendRect.height,
  );

  if (legendLayout.hasTitle) {
    ctx.fillStyle = colors.titleColor;
    ctx.font = `700 ${legendLayout.titleFontSize}px Arial, Helvetica, sans-serif`;
    ctx.textBaseline = "alphabetic";

    legendLayout.titleLines.forEach((line, lineIndex) => {
      ctx.fillText(
        line,
        legendLayout.titleX,
        legendLayout.titleY + lineIndex * legendLayout.titleLineHeight,
      );
    });
  }

  if (entries.length === 0) {
    ctx.font = `400 ${legendLayout.itemFontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = colors.mutedTextColor;
    ctx.fillText(
      "Aucun objet visible dans la légende.",
      legendLayout.titleX,
      legendLayout.itemsTop + legendLayout.itemFontSize,
    );
    ctx.restore();
    return;
  }

  if (legendLayout.isBottomSectionColumnMode && legendLayout.columnCount > 1) {
    ctx.save();
    ctx.strokeStyle = sectionSeparatorColor;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 4;
    ctx.setLineDash([]);

    for (
      let columnIndex = 1;
      columnIndex < legendLayout.columnCount;
      columnIndex += 1
    ) {
      const x =
        legendRect.x +
        legendLayout.padding +
        columnIndex * (legendLayout.columnWidth + legendLayout.columnGap) -
        legendLayout.columnGap / 2;

      ctx.beginPath();
      ctx.moveTo(x, legendLayout.itemsTop);
      ctx.lineTo(x, legendLayout.itemsBottom);
      ctx.stroke();
    }

    ctx.restore();
  }

  for (const item of legendLayout.visibleItems) {
    const displayItem = displayItems[item.featureIndex];

    if (!displayItem) {
      continue;
    }

    if (displayItem.type === "section") {
      const sectionTextY =
        item.y +
        Math.max(
          legendLayout.sectionFontSize,
          Math.round(
            (legendLayout.itemHeight + legendLayout.sectionFontSize) / 2,
          ),
        );

      ctx.font = `700 ${legendLayout.sectionFontSize}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle = colors.titleColor;
      ctx.textBaseline = "alphabetic";

      drawTruncatedText(
        ctx,
        displayItem.label.toUpperCase(),
        item.x,
        sectionTextY,
        item.width,
      );

      if (!legendLayout.isBottomSectionColumnMode) {
        ctx.strokeStyle = sectionSeparatorColor;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(item.x, sectionTextY + 12);
        ctx.lineTo(item.x + item.width, sectionTextY + 12);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      continue;
    }

    const entry = entries[displayItem.entryIndex];

    if (!entry) {
      continue;
    }

    const feature = entry.representativeFeature;

    const symbolX = item.x;
    const symbolY =
      item.y +
      Math.max(0, (legendLayout.itemHeight - legendLayout.symbolSize) / 2);
    const textX = item.x + legendLayout.symbolBoxWidth + legendLayout.textGap;
    const textTop =
      item.y +
      Math.max(
        0,
        Math.round((legendLayout.itemHeight - legendLayout.itemFontSize) / 2),
      );
    const textMaxWidth = Math.max(
      20,
      item.width - legendLayout.symbolBoxWidth - legendLayout.textGap,
    );

    drawLegendSymbol(
      ctx,
      feature,
      symbolX,
      symbolY,
      legendLayout.symbolBoxWidth,
      legendLayout.symbolSize,
    );

    ctx.font = `500 ${legendLayout.itemFontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = colors.textColor;
    ctx.textBaseline = "alphabetic";

    drawTruncatedText(
      ctx,
      entry.label,
      textX,
      textTop + legendLayout.itemFontSize,
      textMaxWidth,
    );
  }

  if (legendLayout.hasOverflow && legendLayout.warningRect) {
    const warningRect = legendLayout.warningRect;
    const warningFontSize = Math.max(
      12,
      Math.round(legendLayout.itemFontSize * 0.72),
    );
    const warningLineHeight = Math.round(warningFontSize * 1.28);

    ctx.fillStyle = "rgba(255, 251, 235, 0.96)";
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(
      warningRect.x,
      warningRect.y,
      warningRect.width,
      warningRect.height,
      10,
    );
    ctx.fill();
    ctx.stroke();

    ctx.font = `600 ${warningFontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = "#92400e";
    ctx.textBaseline = "alphabetic";

    drawWrappedWarningText(
      ctx,
      `⚠ ${legendLayout.warningText ?? "Légende trop petite."}`,
      warningRect.x + 14,
      warningRect.y + warningFontSize + 10,
      Math.max(20, warningRect.width - 28),
      warningLineHeight,
      Math.max(1, Math.floor((warningRect.height - 18) / warningLineHeight)),
    );
  }

  ctx.restore();
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/png" | "image/jpeg" | "image/webp",
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Impossible de générer l’image."));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.click();
  } finally {
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }
}

async function downloadCanvasAsPng(canvas: HTMLCanvasElement) {
  const blob = await canvasToBlob(canvas, "image/png");

  downloadBlob(blob, getExportFileName("png"));
}

async function downloadCanvasAsJpeg(canvas: HTMLCanvasElement) {
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);

  downloadBlob(blob, getExportFileName("jpg"));
}

async function downloadCanvasAsWebp(canvas: HTMLCanvasElement) {
  const blob = await canvasToBlob(canvas, "image/webp", 0.9);

  downloadBlob(blob, getExportFileName("webp"));
}

function createSvgBlobFromCanvas(canvas: HTMLCanvasElement) {
  const pngDataUrl = canvas.toDataURL("image/png");
  const width = Math.max(1, Math.round(canvas.width));
  const height = Math.max(1, Math.round(canvas.height));
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<image href="${pngDataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>`,
    "</svg>",
  ].join("\n");

  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

function downloadCanvasAsSvg(canvas: HTMLCanvasElement) {
  const blob = createSvgBlobFromCanvas(canvas);

  downloadBlob(blob, getExportFileName("svg"));
}

function asciiToBytes(value: string) {
  const bytes = new Uint8Array(value.length);

  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }

  return bytes;
}

function concatBytes(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1];

  if (!base64) {
    throw new Error("Image PDF invalide.");
  }

  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function padPdfOffset(offset: number) {
  return offset.toString().padStart(10, "0");
}

function createPdfBlobFromCanvas(canvas: HTMLCanvasElement) {
  const jpegBytes = dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.95));
  const pageWidth = Math.max(1, Math.round(canvas.width));
  const pageHeight = Math.max(1, Math.round(canvas.height));

  const objectBodies: Uint8Array[] = [
    asciiToBytes("<< /Type /Catalog /Pages 2 0 R >>"),
    asciiToBytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    asciiToBytes(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    ),
    concatBytes([
      asciiToBytes(
        `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
      ),
      jpegBytes,
      asciiToBytes("\nendstream"),
    ]),
    asciiToBytes(
      `<< /Length ${`q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`.length} >>\nstream\nq ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q\nendstream`,
    ),
  ];

  const parts: Uint8Array[] = [asciiToBytes("%PDF-1.4\n%DroMap\n")];
  const offsets = [0];
  let byteOffset = parts[0].length;

  objectBodies.forEach((body, index) => {
    const objectStart = asciiToBytes(`${index + 1} 0 obj\n`);
    const objectEnd = asciiToBytes("\nendobj\n");

    offsets.push(byteOffset);
    parts.push(objectStart, body, objectEnd);
    byteOffset += objectStart.length + body.length + objectEnd.length;
  });

  const xrefOffset = byteOffset;
  const xrefLines = [
    "xref",
    `0 ${objectBodies.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${padPdfOffset(offset)} 00000 n `),
    "trailer",
    `<< /Size ${objectBodies.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");

  parts.push(asciiToBytes(xrefLines));

  return new Blob([concatBytes(parts)], { type: "application/pdf" });
}

function downloadCanvasAsPdf(canvas: HTMLCanvasElement) {
  const blob = createPdfBlobFromCanvas(canvas);

  downloadBlob(blob, getExportFileName("pdf"));
}

function stringifyCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function escapeCsvValue(value: unknown) {
  const stringValue = stringifyCsvValue(value);

  if (!/[";\n\r]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function getFeatureVariant(feature: DroMapFeature) {
  if (feature.properties.type === "line") {
    return feature.properties.lineVariant ?? "straight";
  }

  if (feature.properties.type === "zone") {
    return feature.properties.zoneVariant ?? "polygon";
  }

  return "";
}

function getFeatureSymbolId(feature: DroMapFeature) {
  const symbol = feature.properties.symbol;

  if (!symbol) {
    return "";
  }

  return `${symbol.type}:${symbol.id}`;
}

function getPointCoordinates(feature: DroMapFeature) {
  if (feature.geometry.type !== "Point") {
    return { longitude: "", latitude: "" };
  }

  const [longitude, latitude] = feature.geometry.coordinates;

  return { longitude, latitude };
}

function createFeaturesCsv(features: DroMapFeature[]) {
  const headers = [
    "id",
    "type",
    "label",
    "legend_label",
    "geometry_type",
    "variant",
    "symbol",
    "locked",
    "order",
    "layer_id",
    "longitude",
    "latitude",
    "color",
    "weight",
    "opacity",
    "fill_color",
    "fill_opacity",
    "dash_style",
    "zone_stroke_enabled",
    "zone_fill_enabled",
    "zone_hatching_style",
    "zone_hatching_color",
    "zone_hatching_weight",
    "zone_hatching_spacing",
    "zone_dots_enabled",
    "zone_dots_color",
    "zone_dots_radius",
    "zone_dots_spacing",
    "marker_size",
    "marker_filled",
    "font_size",
    "text_rotation",
    "arrow_start",
    "arrow_end",
    "coordinates_json",
  ];

  const rows = features.map((feature) => {
    const style = feature.properties.style ?? {};
    const point = getPointCoordinates(feature);

    return [
      feature.id,
      feature.properties.type,
      feature.properties.label,
      feature.properties.legendLabel ?? "",
      feature.geometry.type,
      getFeatureVariant(feature),
      getFeatureSymbolId(feature),
      feature.properties.locked ?? false,
      feature.properties.order ?? "",
      feature.properties.layerId ?? "",
      point.longitude,
      point.latitude,
      style.color ?? "",
      style.weight ?? "",
      style.opacity ?? "",
      style.fillColor ?? "",
      style.fillOpacity ?? "",
      style.dashStyle ?? "",
      style.zoneStrokeEnabled ?? "",
      style.zoneFillEnabled ?? "",
      style.zoneHatchingStyle ?? "",
      style.zoneHatchingColor ?? "",
      style.zoneHatchingWeight ?? "",
      style.zoneHatchingSpacing ?? "",
      style.zoneDotsEnabled ?? "",
      style.zoneDotsColor ?? "",
      style.zoneDotsRadius ?? "",
      style.zoneDotsSpacing ?? "",
      style.markerSize ?? "",
      style.markerFilled ?? "",
      style.fontSize ?? "",
      style.textRotation ?? "",
      style.arrowStart ?? "",
      style.arrowEnd ?? "",
      feature.geometry.coordinates,
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(";"))
    .join("\n");
}

export function downloadFeaturesAsCsv(features: DroMapFeature[]) {
  const csvContent = createFeaturesCsv(features);
  const blob = new Blob([`\ufeff${csvContent}`], {
    type: "text/csv;charset=utf-8",
  });

  downloadBlob(blob, getExportFileName("csv"));
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createProjectJson(input: DownloadCanvasExportInput) {
  const basemap = getDromapBasemapConfig(
    input.basemapId ?? DEFAULT_DROMAP_BASEMAP_ID,
  );

  return {
    schema: "dromap.project",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    application: "DroMap",
    intent:
      "Projet DroMap complet : source de vérité prévue pour un futur import/réouverture modifiable.",
    workspace: {
      bounds: input.workspaceBounds,
      basemapId: input.basemapId ?? DEFAULT_DROMAP_BASEMAP_ID,
      basemapLabel: basemap.label,
      basemapKind: basemap.kind,
      basemapZoom: input.workspaceBasemapZoom,
      basemapBaseZoom: input.workspaceBasemapBaseZoom ?? input.workspaceBasemapZoom,
    },
    export: {
      format: input.exportFormat,
      legendPosition: input.legendPosition,
      legendAppearance: {
        backgroundColor: input.legendBackgroundColor,
        sideWidth: input.legendSideWidth,
        bottomHeight: input.legendBottomHeight,
        titleFontSize: input.legendTitleFontSize,
        itemFontSize: input.legendItemFontSize,
        sectionTitleFontSize: input.legendSectionTitleFontSize,
      },
      scaleBar: {
        enabled: input.scaleBarEnabled === true,
        style: input.scaleBarStyle ?? "alternating",
      },
    },
    legend: {
      schemaVersion: 1,
      title: input.legendTitle,
      hiddenFeatureIds: input.hiddenLegendFeatureIds,
      featureOrder: input.legendFeatureOrder,
      groupOrder: input.legendGroupOrder,
      sectionOrder: input.legendSectionOrder,
      groupLabels: input.legendGroupLabels,
      groupSections: input.legendGroupSections,
    },
    layers: cloneJsonValue(input.layers ?? []),
    geoJsonLayers: cloneJsonValue(input.geoJsonLayers ?? []),
    features: cloneJsonValue(input.features),
  };
}


export type ImportedDromapProject = {
  workspaceBounds: WorkspaceBounds;
  workspaceBasemapZoom: number | null;
  workspaceBasemapBaseZoom: number | null;
  basemapId: DromapBasemapId;
  exportFormat: ExportFormat;
  legendPosition: ExportLegendPosition;
  legendBackgroundColor: string;
  legendSideWidth: number;
  legendBottomHeight: number;
  legendTitleFontSize: number;
  legendItemFontSize: number;
  legendSectionTitleFontSize: number;
  scaleBarEnabled: boolean;
  scaleBarStyle: ExportScaleBarStyle;
  legendTitle: string;
  hiddenLegendFeatureIds: string[];
  legendFeatureOrder: string[];
  legendGroupOrder: string[];
  legendSectionOrder: string[];
  legendGroupLabels: Record<string, string>;
  legendGroupSections: Record<string, string>;
  layers: DroMapLayer[];
  geoJsonLayers: DromapGeoJsonLayer[];
  features: DroMapFeature[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordValue(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
}

function parseFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseNullableZoom(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(20, Math.round(value * 4) / 4));
}

function parseString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string")),
  );
}

function parseStringRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function parseExportFormat(value: unknown): ExportFormat {
  switch (value) {
    case "16-9":
    case "4-3":
    case "a4-landscape":
    case "a4-portrait":
    case "square":
    case "auto":
      return value;
    default:
      return "auto";
  }
}

function parseLegendPosition(value: unknown): ExportLegendPosition {
  switch (value) {
    case "left":
    case "bottom":
    case "right":
      return value;
    default:
      return "right";
  }
}

function parseScaleBarStyle(value: unknown): ExportScaleBarStyle {
  switch (value) {
    case "bar":
    case "line":
    case "boxed":
    case "alternating":
      return value;
    default:
      return "alternating";
  }
}

function parseWorkspaceBounds(value: unknown): WorkspaceBounds | null {
  if (!isRecord(value)) {
    return null;
  }

  const southWest = getRecordValue(value, "southWest");
  const northEast = getRecordValue(value, "northEast");

  if (!isRecord(southWest) || !isRecord(northEast)) {
    return null;
  }

  const south = getRecordValue(southWest, "lat");
  const west = getRecordValue(southWest, "lng");
  const north = getRecordValue(northEast, "lat");
  const east = getRecordValue(northEast, "lng");

  if (
    typeof south !== "number" ||
    typeof west !== "number" ||
    typeof north !== "number" ||
    typeof east !== "number" ||
    !Number.isFinite(south) ||
    !Number.isFinite(west) ||
    !Number.isFinite(north) ||
    !Number.isFinite(east)
  ) {
    return null;
  }

  const safeSouth = clamp(Math.min(south, north), -85.05112878, 85.05112878);
  const safeNorth = clamp(Math.max(south, north), -85.05112878, 85.05112878);
  const safeWest = clamp(Math.min(west, east), -360, 360);
  const safeEast = clamp(Math.max(west, east), -360, 360);

  if (safeNorth - safeSouth < 0.000001 || safeEast - safeWest < 0.000001) {
    return null;
  }

  return {
    southWest: { lat: safeSouth, lng: safeWest },
    northEast: { lat: safeNorth, lng: safeEast },
  };
}

function parseCoordinatePosition(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const lng = value[0];
  const lat = value[1];

  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat)
  ) {
    return null;
  }

  return [clamp(lng, -360, 360), clamp(lat, -85.05112878, 85.05112878)];
}

function parseLineCoordinates(value: unknown): [number, number][] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const coordinates = value
    .map(parseCoordinatePosition)
    .filter((position): position is [number, number] => position !== null);

  return coordinates.length >= 2 ? coordinates : null;
}

function parsePolygonCoordinates(value: unknown): [number, number][][] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const rings = value
    .map((ring) => {
      if (!Array.isArray(ring)) {
        return [];
      }

      return ring
        .map(parseCoordinatePosition)
        .filter((position): position is [number, number] => position !== null);
    })
    .filter((ring) => ring.length >= 4);

  return rings.length > 0 ? rings : null;
}

function parseDromapMarkerSymbol(
  value: unknown,
): DroMapFeature["properties"]["symbol"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = getRecordValue(value, "type");
  const id = getRecordValue(value, "id");

  if (typeof type !== "string" || typeof id !== "string") {
    return null;
  }

  return cloneJsonValue(value) as DroMapFeature["properties"]["symbol"];
}

function parseDromapFeatureSource(
  value: unknown,
): DroMapFeature["properties"]["source"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const type = getRecordValue(value, "type");
  const importId = getRecordValue(value, "importId");

  if (type !== "geojson" || typeof importId !== "string" || !importId.trim()) {
    return undefined;
  }

  const sourceName = getRecordValue(value, "sourceName");
  const originalProperties = getRecordValue(value, "originalProperties");
  const originalFeatureId = getRecordValue(value, "originalFeatureId");
  const originalGeometryType = getRecordValue(value, "originalGeometryType");
  const originalPartIndex = getRecordValue(value, "originalPartIndex");

  return {
    type: "geojson",
    importId,
    ...(typeof sourceName === "string" ? { sourceName } : {}),
    ...(sourceName === null ? { sourceName: null } : {}),
    ...(isRecord(originalProperties)
      ? { originalProperties: cloneJsonValue(originalProperties) as Record<string, unknown> }
      : {}),
    ...(typeof originalFeatureId === "string" || typeof originalFeatureId === "number"
      ? { originalFeatureId }
      : {}),
    ...(typeof originalGeometryType === "string" ? { originalGeometryType } : {}),
    ...(typeof originalPartIndex === "number" && Number.isFinite(originalPartIndex)
      ? { originalPartIndex }
      : {}),
  };
}

function parseDromapFeature(value: unknown): DroMapFeature | null {
  if (!isRecord(value)) {
    return null;
  }

  const geometry = getRecordValue(value, "geometry");
  const properties = getRecordValue(value, "properties");

  if (!isRecord(geometry) || !isRecord(properties)) {
    return null;
  }

  const featureType = getRecordValue(properties, "type");

  if (
    featureType !== "marker" &&
    featureType !== "line" &&
    featureType !== "zone" &&
    featureType !== "text"
  ) {
    return null;
  }

  const geometryType = getRecordValue(geometry, "type");
  const rawCoordinates = getRecordValue(geometry, "coordinates");
  let safeGeometry: DroMapFeature["geometry"] | null = null;

  if ((featureType === "marker" || featureType === "text") && geometryType === "Point") {
    const point = parseCoordinatePosition(rawCoordinates);
    safeGeometry = point ? { type: "Point", coordinates: point } : null;
  }

  if (featureType === "line" && geometryType === "LineString") {
    const line = parseLineCoordinates(rawCoordinates);
    safeGeometry = line ? { type: "LineString", coordinates: line } : null;
  }

  if (featureType === "zone" && geometryType === "Polygon") {
    const polygon = parsePolygonCoordinates(rawCoordinates);
    safeGeometry = polygon ? { type: "Polygon", coordinates: polygon } : null;
  }

  if (!safeGeometry) {
    return null;
  }

  const featureId = parseString(
    getRecordValue(value, "id"),
    `imported-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const rawStyle = getRecordValue(properties, "style");
  const rawSymbol = getRecordValue(properties, "symbol");
  const rawSource = getRecordValue(properties, "source");
  const safeStyle = isRecord(rawStyle)
    ? (cloneJsonValue(rawStyle) as DroMapFeature["properties"]["style"])
    : {};
  const safeSymbol = parseDromapMarkerSymbol(rawSymbol);
  const safeSource = parseDromapFeatureSource(rawSource);

  return {
    type: "Feature",
    id: featureId,
    geometry: safeGeometry,
    properties: {
      type: featureType,
      style: safeStyle,
      label: parseString(getRecordValue(properties, "label"), featureType),
      ...(typeof getRecordValue(properties, "legendLabel") === "string"
        ? { legendLabel: getRecordValue(properties, "legendLabel") as string }
        : {}),
      ...(safeSymbol ? { symbol: safeSymbol } : {}),
      ...(typeof getRecordValue(properties, "lineVariant") === "string"
        ? { lineVariant: getRecordValue(properties, "lineVariant") as DroMapFeature["properties"]["lineVariant"] }
        : {}),
      ...(typeof getRecordValue(properties, "zoneVariant") === "string"
        ? { zoneVariant: getRecordValue(properties, "zoneVariant") as DroMapFeature["properties"]["zoneVariant"] }
        : {}),
      ...(typeof getRecordValue(properties, "zoneShapeKind") === "string"
        ? { zoneShapeKind: getRecordValue(properties, "zoneShapeKind") as DroMapFeature["properties"]["zoneShapeKind"] }
        : {}),
      ...(typeof getRecordValue(properties, "order") === "number" &&
      Number.isFinite(getRecordValue(properties, "order"))
        ? { order: getRecordValue(properties, "order") as number }
        : {}),
      ...(getRecordValue(properties, "locked") === true ? { locked: true } : {}),
      ...(getRecordValue(properties, "lockOverride") === "locked" ||
      getRecordValue(properties, "lockOverride") === "unlocked"
        ? {
            lockOverride: getRecordValue(properties, "lockOverride") as
              | "locked"
              | "unlocked",
          }
        : {}),
      ...(typeof getRecordValue(properties, "layerId") === "string"
        ? { layerId: getRecordValue(properties, "layerId") as string }
        : {}),
      ...(safeSource ? { source: safeSource } : {}),
      meta: { version: 1 },
    },
  };
}

function parseProjectLayers(value: unknown): DroMapLayer[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Partial<DroMapLayer> => isRecord(item))
    .map((item, index) => {
      const fallbackOrder = (index + 1) * 1000;
      const id = parseString(getRecordValue(item, "id"), `dromap-layer-imported-${index + 1}`);
      const name = parseString(getRecordValue(item, "name"), `Calque ${index + 1}`);
      const opacity = clamp(
        parseFiniteNumber(getRecordValue(item, "opacity"), 1),
        0,
        1,
      );
      const order = parseFiniteNumber(getRecordValue(item, "order"), fallbackOrder);
      const createdAt = parseString(getRecordValue(item, "createdAt"), new Date().toISOString());
      const updatedAt = parseString(getRecordValue(item, "updatedAt"), createdAt);

      return {
        id,
        name,
        visible: getRecordValue(item, "visible") !== false,
        opacity,
        locked: getRecordValue(item, "locked") === true,
        order,
        createdAt,
        updatedAt,
      };
    });
}

function parseProjectFeatures(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(parseDromapFeature)
    .filter((feature): feature is DroMapFeature => feature !== null);
}

export function parseDromapProjectJson(jsonText: string): ImportedDromapProject {
  const parsed = JSON.parse(jsonText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Fichier projet invalide.");
  }

  const schema = getRecordValue(parsed, "schema");

  if (schema !== "dromap.project") {
    throw new Error("Ce fichier JSON n’est pas un export projet DroMap.");
  }

  const workspace = getRecordValue(parsed, "workspace");
  const exportSettings = getRecordValue(parsed, "export");
  const legend = getRecordValue(parsed, "legend");

  if (!isRecord(workspace) || !isRecord(exportSettings) || !isRecord(legend)) {
    throw new Error("Le fichier projet DroMap est incomplet.");
  }

  const workspaceBounds = parseWorkspaceBounds(getRecordValue(workspace, "bounds"));

  if (!workspaceBounds) {
    throw new Error("La zone de travail du projet importé est invalide.");
  }

  const rawBasemapId = getRecordValue(workspace, "basemapId");
  const basemapId =
    typeof rawBasemapId === "string" ? rawBasemapId : DEFAULT_DROMAP_BASEMAP_ID;
  const legendAppearance = getRecordValue(exportSettings, "legendAppearance");
  const safeAppearance = isRecord(legendAppearance) ? legendAppearance : {};
  const scaleBar = getRecordValue(exportSettings, "scaleBar");
  const safeScaleBar = isRecord(scaleBar) ? scaleBar : {};
  const safeBasemapId = getDromapBasemapConfig(basemapId).id;

  return {
    workspaceBounds,
    workspaceBasemapZoom: parseNullableZoom(getRecordValue(workspace, "basemapZoom")),
    workspaceBasemapBaseZoom: parseNullableZoom(getRecordValue(workspace, "basemapBaseZoom")),
    basemapId: safeBasemapId,
    exportFormat: parseExportFormat(getRecordValue(exportSettings, "format")),
    legendPosition: parseLegendPosition(getRecordValue(exportSettings, "legendPosition")),
    legendBackgroundColor: parseString(
      getRecordValue(safeAppearance, "backgroundColor"),
      "#ffffff",
    ),
    legendSideWidth: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "sideWidth"), 420),
      240,
      900,
    ),
    legendBottomHeight: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "bottomHeight"), 0),
      0,
      900,
    ),
    legendTitleFontSize: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "titleFontSize"), 32),
      12,
      72,
    ),
    legendItemFontSize: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "itemFontSize"), 24),
      10,
      56,
    ),
    legendSectionTitleFontSize: clamp(
      parseFiniteNumber(getRecordValue(safeAppearance, "sectionTitleFontSize"), 20),
      10,
      56,
    ),
    scaleBarEnabled: getRecordValue(safeScaleBar, "enabled") === true,
    scaleBarStyle: parseScaleBarStyle(getRecordValue(safeScaleBar, "style")),
    legendTitle: parseString(getRecordValue(legend, "title"), "Légende"),
    hiddenLegendFeatureIds: parseStringArray(
      getRecordValue(legend, "hiddenFeatureIds"),
    ),
    legendFeatureOrder: parseStringArray(getRecordValue(legend, "featureOrder")),
    legendGroupOrder: parseStringArray(getRecordValue(legend, "groupOrder")),
    legendSectionOrder: parseStringArray(getRecordValue(legend, "sectionOrder")),
    legendGroupLabels: parseStringRecord(getRecordValue(legend, "groupLabels")),
    legendGroupSections: parseStringRecord(getRecordValue(legend, "groupSections")),
    layers: parseProjectLayers(getRecordValue(parsed, "layers")),
    geoJsonLayers: normalizeDromapGeoJsonLayers(getRecordValue(parsed, "geoJsonLayers")),
    features: parseProjectFeatures(getRecordValue(parsed, "features")),
  };
}

function createGeoJsonFeatureProperties(feature: DroMapFeature) {
  const variant = getFeatureVariant(feature);

  return {
    name: feature.properties.label,
    label: feature.properties.label,
    legend_label: feature.properties.legendLabel ?? null,
    dromap_type: feature.properties.type,
    dromap_variant: variant || null,
    dromap_locked: feature.properties.locked ?? false,
    dromap_order: feature.properties.order ?? null,
    dromap_layer_id: feature.properties.layerId ?? null,
    style: cloneJsonValue(feature.properties.style ?? {}),
    symbol: feature.properties.symbol
      ? cloneJsonValue(feature.properties.symbol)
      : null,
    dromap: {
      schema: "dromap.geojson-feature",
      schemaVersion: 1,
      id: feature.id,
      featureType: feature.properties.type,
      label: feature.properties.label,
      legendLabel: feature.properties.legendLabel ?? null,
      lineVariant: feature.properties.lineVariant ?? null,
      zoneVariant: feature.properties.zoneVariant ?? null,
      zoneShapeKind: feature.properties.zoneShapeKind ?? null,
      locked: feature.properties.locked ?? false,
      order: feature.properties.order ?? null,
      layerId: feature.properties.layerId ?? null,
      style: cloneJsonValue(feature.properties.style ?? {}),
      symbol: feature.properties.symbol
        ? cloneJsonValue(feature.properties.symbol)
        : null,
      source: feature.properties.source
        ? cloneJsonValue(feature.properties.source)
        : null,
      meta: cloneJsonValue(feature.properties.meta ?? { version: 1 }),
    },
  };
}

function createFeaturesGeoJson(input: DownloadCanvasExportInput) {
  const basemap = getDromapBasemapConfig(
    input.basemapId ?? DEFAULT_DROMAP_BASEMAP_ID,
  );

  return {
    type: "FeatureCollection",
    name: "DroMap export",
    dromap: {
      schema: "dromap.geojson",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      intent:
        "GeoJSON standard enrichi DroMap. Prévu pour préparer le futur import manuel, bouton ou IA de routes, frontières, zones et marqueurs.",
      workspace: {
        bounds: input.workspaceBounds,
        basemapId: input.basemapId ?? DEFAULT_DROMAP_BASEMAP_ID,
        basemapLabel: basemap.label,
        basemapKind: basemap.kind,
        basemapZoom: input.workspaceBasemapZoom,
      },
      legend: {
        title: input.legendTitle,
        hiddenFeatureIds: input.hiddenLegendFeatureIds,
        featureOrder: input.legendFeatureOrder,
        groupOrder: input.legendGroupOrder,
        sectionOrder: input.legendSectionOrder,
        groupLabels: input.legendGroupLabels,
        groupSections: input.legendGroupSections,
      },
    },
    features: [
      ...input.features.map((feature) => ({
        type: "Feature",
        id: feature.id,
        geometry: cloneJsonValue(feature.geometry),
        properties: createGeoJsonFeatureProperties(feature),
      })),
      ...getRenderableGeoJsonLayers(input.geoJsonLayers ?? []).flatMap((layer) =>
        layer.data.features.map((feature, index) => ({
          type: "Feature",
          id: feature.id ?? `${layer.id}-${index + 1}`,
          geometry: cloneJsonValue(feature.geometry),
          properties: {
            ...cloneJsonValue(feature.properties ?? {}),
            dromap_geojson_layer_id: layer.id,
            dromap_geojson_layer_name: layer.name,
            dromap_geojson_layer_style: cloneJsonValue(layer.style),
            dromap: {
              schema: "dromap.geojson-layer-feature",
              schemaVersion: 1,
              layerId: layer.id,
              layerName: layer.name,
              layerStyle: cloneJsonValue(layer.style),
            },
          },
        })),
      ),
    ],
  };
}


type ImportedGeoJsonFeatureCollection = {
  features: DroMapFeature[];
  skippedGeometries: number;
  workspaceBounds: WorkspaceBounds | null;
  sourceName: string | null;
  importId: string;
};

type GeoJsonImportOptions = {
  sourceName?: string;
  existingFeatureCount?: number;
};

type GeoJsonImportContext = {
  sourceName: string | null;
  importId: string;
  nextIndex: number;
  skippedGeometries: number;
};

function createGeoJsonImportId() {
  return `geojson-import-${Date.now()}-${
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  }`;
}

function createImportedFeatureId() {
  return `geojson-${Date.now()}-${
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  }`;
}

function parseNumberLike(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function parseBooleanLike(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "oui"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "non"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function getFirstStringProperty(
  properties: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = getRecordValue(properties, key);

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function getFirstNumberProperty(
  properties: Record<string, unknown>,
  keys: string[],
  fallback: number,
) {
  for (const key of keys) {
    const value = getRecordValue(properties, key);
    const parsed = parseNumberLike(value, Number.NaN);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function getDromapGeoJsonProperties(properties: Record<string, unknown>) {
  const dromap = getRecordValue(properties, "dromap");

  return isRecord(dromap) ? dromap : null;
}

function getImportedGeoJsonLabel(
  properties: Record<string, unknown>,
  fallback: string,
) {
  const dromap = getDromapGeoJsonProperties(properties);

  if (dromap) {
    const dromapLabel = getRecordValue(dromap, "label");
    if (typeof dromapLabel === "string" && dromapLabel.trim()) {
      return dromapLabel.trim();
    }
  }

  const directLabel = getFirstStringProperty(properties, [
    "name",
    "NAME",
    "Name",
    "nom",
    "NOM",
    "label",
    "LABEL",
    "title",
    "titre",
    "ref",
    "REF",
  ]);

  if (directLabel) {
    return directLabel;
  }

  const highway = getFirstStringProperty(properties, ["highway"]);
  if (highway) {
    const ref = getFirstStringProperty(properties, ["ref", "REF"]);
    return ref ? `Route ${ref}` : "Route";
  }

  const route = getFirstStringProperty(properties, ["route"]);
  if (route) {
    return route === "road" ? "Route" : route;
  }

  const boundary = getFirstStringProperty(properties, ["boundary"]);
  const adminLevel = getFirstStringProperty(properties, ["admin_level"]);
  if (boundary === "administrative" || adminLevel) {
    return "Frontière";
  }

  return fallback;
}

function getImportedGeoJsonLegendLabel(
  properties: Record<string, unknown>,
): string | undefined {
  const dromap = getDromapGeoJsonProperties(properties);
  const dromapLegendLabel = dromap ? getRecordValue(dromap, "legendLabel") : null;

  if (typeof dromapLegendLabel === "string" && dromapLegendLabel.trim()) {
    return dromapLegendLabel.trim();
  }

  const legendLabel = getFirstStringProperty(properties, [
    "legend_label",
    "legendLabel",
    "legend",
    "legende",
  ]);

  return legendLabel ?? undefined;
}

function getImportedGeoJsonStyleFromDromap(
  properties: Record<string, unknown>,
): DroMapFeature["properties"]["style"] | null {
  const dromap = getDromapGeoJsonProperties(properties);
  const dromapStyle = dromap ? getRecordValue(dromap, "style") : null;

  if (isRecord(dromapStyle)) {
    return cloneJsonValue(dromapStyle) as DroMapFeature["properties"]["style"];
  }

  const directStyle = getRecordValue(properties, "style");

  if (isRecord(directStyle)) {
    return cloneJsonValue(directStyle) as DroMapFeature["properties"]["style"];
  }

  return null;
}

function getImportedGeoJsonSymbol(
  properties: Record<string, unknown>,
): DroMapFeature["properties"]["symbol"] | undefined {
  const dromap = getDromapGeoJsonProperties(properties);
  const dromapSymbol = dromap ? getRecordValue(dromap, "symbol") : null;

  if (isRecord(dromapSymbol)) {
    const symbol = parseDromapMarkerSymbol(dromapSymbol);
    if (symbol) {
      return symbol;
    }
  }

  const directSymbol = getRecordValue(properties, "symbol");
  if (isRecord(directSymbol)) {
    const symbol = parseDromapMarkerSymbol(directSymbol);
    if (symbol) {
      return symbol;
    }
  }

  return { type: "builtin", id: "circle" };
}

function getImportedColor(
  properties: Record<string, unknown>,
  keys: string[],
  fallback: string,
) {
  return getFirstStringProperty(properties, keys) ?? fallback;
}

function getImportedMarkerStyle(
  properties: Record<string, unknown>,
): DroMapFeature["properties"]["style"] {
  const dromapStyle = getImportedGeoJsonStyleFromDromap(properties);

  if (dromapStyle) {
    return dromapStyle;
  }

  return {
    color: getImportedColor(
      properties,
      ["marker-color", "markerColor", "color", "stroke", "fill"],
      "#111827",
    ),
    weight: getFirstNumberProperty(properties, ["weight", "stroke-width"], 7),
    opacity: clamp(
      getFirstNumberProperty(properties, ["opacity", "marker-opacity"], 1),
      0,
      1,
    ),
    markerSize: clamp(
      getFirstNumberProperty(properties, ["marker-size", "markerSize", "size"], 22),
      8,
      120,
    ),
    markerFilled: parseBooleanLike(getRecordValue(properties, "markerFilled"), true),
  };
}

function getImportedLineStyle(
  properties: Record<string, unknown>,
): DroMapFeature["properties"]["style"] {
  const dromapStyle = getImportedGeoJsonStyleFromDromap(properties);

  if (dromapStyle) {
    return dromapStyle;
  }

  const lineDash = getFirstStringProperty(properties, [
    "dashStyle",
    "stroke-dashstyle",
    "strokeDashStyle",
    "stroke-dasharray",
    "strokeDasharray",
  ]);

  return {
    color: getImportedColor(
      properties,
      ["stroke", "strokeColor", "color", "colour"],
      "#2563eb",
    ),
    weight: clamp(
      getFirstNumberProperty(properties, ["stroke-width", "strokeWidth", "weight"], 3),
      1,
      24,
    ),
    opacity: clamp(
      getFirstNumberProperty(properties, ["stroke-opacity", "strokeOpacity", "opacity"], 0.9),
      0,
      1,
    ),
    dashStyle:
      lineDash && lineDash !== "solid" && lineDash !== "0"
        ? "dashed"
        : "solid",
    arrowStart: false,
    arrowEnd: false,
  };
}

function getImportedZoneStyle(
  properties: Record<string, unknown>,
): DroMapFeature["properties"]["style"] {
  const dromapStyle = getImportedGeoJsonStyleFromDromap(properties);

  if (dromapStyle) {
    return dromapStyle;
  }

  const strokeColor = getImportedColor(
    properties,
    ["stroke", "strokeColor", "color", "colour"],
    "#2563eb",
  );
  const fillColor = getImportedColor(
    properties,
    ["fill", "fillColor", "fill-color"],
    strokeColor,
  );
  const fillOpacity = clamp(
    getFirstNumberProperty(properties, ["fill-opacity", "fillOpacity"], 0.2),
    0,
    1,
  );

  return {
    color: strokeColor,
    weight: clamp(
      getFirstNumberProperty(properties, ["stroke-width", "strokeWidth", "weight"], 2),
      1,
      24,
    ),
    opacity: clamp(
      getFirstNumberProperty(properties, ["stroke-opacity", "strokeOpacity", "opacity"], 0.9),
      0,
      1,
    ),
    fillColor,
    fillOpacity,
    dashStyle: "solid",
    zoneStrokeEnabled: true,
    zoneFillEnabled: fillOpacity > 0,
    zoneHatchingStyle: "none",
    zoneHatchingColor: "#111827",
    zoneHatchingWeight: 2,
    zoneHatchingSpacing: 14,
    zoneDotsEnabled: false,
    zoneDotsColor: "#111827",
    zoneDotsRadius: 2,
    zoneDotsSpacing: 14,
  };
}

function getImportedTextStyle(
  properties: Record<string, unknown>,
): DroMapFeature["properties"]["style"] {
  const dromapStyle = getImportedGeoJsonStyleFromDromap(properties);

  if (dromapStyle) {
    return dromapStyle;
  }

  return {
    color: getImportedColor(properties, ["color", "textColor", "stroke"], "#111827"),
    opacity: clamp(getFirstNumberProperty(properties, ["opacity"], 1), 0, 1),
    fontSize: clamp(getFirstNumberProperty(properties, ["fontSize", "font-size"], 22), 8, 96),
    textRotation: 0,
    textBackgroundEnabled: false,
    textBackgroundColor: "#ffffff",
    textBackgroundOpacity: 0.85,
    textBorderEnabled: false,
    textBorderColor: "#111827",
    textBorderWidth: 2,
  };
}

function getImportedDromapFeatureType(
  properties: Record<string, unknown>,
  geometryType: DroMapFeature["geometry"]["type"],
): DroMapFeature["properties"]["type"] | null {
  const dromap = getDromapGeoJsonProperties(properties);
  const rawType = dromap ? getRecordValue(dromap, "featureType") : null;

  if (rawType === "text" && geometryType === "Point") {
    return "text";
  }

  if (rawType === "marker" && geometryType === "Point") {
    return "marker";
  }

  if (rawType === "line" && geometryType === "LineString") {
    return "line";
  }

  if (rawType === "zone" && geometryType === "Polygon") {
    return "zone";
  }

  if (geometryType === "Point") {
    return "marker";
  }

  if (geometryType === "LineString") {
    return "line";
  }

  if (geometryType === "Polygon") {
    return "zone";
  }

  return null;
}

function getImportedLineVariant(
  properties: Record<string, unknown>,
): DroMapFeature["properties"]["lineVariant"] {
  const dromap = getDromapGeoJsonProperties(properties);
  const rawVariant = dromap ? getRecordValue(dromap, "lineVariant") : null;

  if (rawVariant === "freehand" || rawVariant === "traced" || rawVariant === "straight") {
    return rawVariant;
  }

  return "straight";
}

function getImportedZoneVariant(
  properties: Record<string, unknown>,
): DroMapFeature["properties"]["zoneVariant"] {
  const dromap = getDromapGeoJsonProperties(properties);
  const rawVariant = dromap ? getRecordValue(dromap, "zoneVariant") : null;

  if (
    rawVariant === "freehand" ||
    rawVariant === "shape" ||
    rawVariant === "boundary-fill" ||
    rawVariant === "polygon"
  ) {
    return rawVariant;
  }

  return "polygon";
}

function getImportedZoneShapeKind(
  properties: Record<string, unknown>,
): DroMapFeature["properties"]["zoneShapeKind"] | undefined {
  const dromap = getDromapGeoJsonProperties(properties);
  const rawShapeKind = dromap ? getRecordValue(dromap, "zoneShapeKind") : null;

  if (rawShapeKind === "rectangle" || rawShapeKind === "circle" || rawShapeKind === "ellipse") {
    return rawShapeKind;
  }

  return undefined;
}

function createImportedFeatureProperties(
  featureType: DroMapFeature["properties"]["type"],
  properties: Record<string, unknown>,
  fallbackLabel: string,
): DroMapFeature["properties"] {
  const label = getImportedGeoJsonLabel(properties, fallbackLabel);
  const legendLabel = getImportedGeoJsonLegendLabel(properties);

  if (featureType === "marker") {
    return {
      type: "marker",
      style: getImportedMarkerStyle(properties),
      label,
      ...(legendLabel ? { legendLabel } : {}),
      symbol: getImportedGeoJsonSymbol(properties),
      meta: { version: 1 },
    };
  }

  if (featureType === "text") {
    return {
      type: "text",
      style: getImportedTextStyle(properties),
      label,
      ...(legendLabel ? { legendLabel } : {}),
      meta: { version: 1 },
    };
  }

  if (featureType === "line") {
    return {
      type: "line",
      style: getImportedLineStyle(properties),
      label,
      ...(legendLabel ? { legendLabel } : {}),
      lineVariant: getImportedLineVariant(properties),
      meta: { version: 1 },
    };
  }

  const zoneShapeKind = getImportedZoneShapeKind(properties);

  return {
    type: "zone",
    style: getImportedZoneStyle(properties),
    label,
    ...(legendLabel ? { legendLabel } : {}),
    zoneVariant: getImportedZoneVariant(properties),
    ...(zoneShapeKind ? { zoneShapeKind } : {}),
    meta: { version: 1 },
  };
}

function closePolygonRingIfNeeded(ring: [number, number][]) {
  if (ring.length === 0) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }

  return [...ring, first];
}

function parseGeoJsonPolygonCoordinates(value: unknown): [number, number][][] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const rings = value
    .map((ring) => {
      if (!Array.isArray(ring)) {
        return [];
      }

      const parsedRing = ring
        .map(parseCoordinatePosition)
        .filter((position): position is [number, number] => position !== null);

      return closePolygonRingIfNeeded(parsedRing);
    })
    .filter((ring) => ring.length >= 4);

  return rings.length > 0 ? rings : null;
}

function createImportedDroMapFeature(
  geometry: DroMapFeature["geometry"],
  properties: Record<string, unknown>,
  context: GeoJsonImportContext,
): DroMapFeature | null {
  const featureType = getImportedDromapFeatureType(properties, geometry.type);

  if (!featureType) {
    return null;
  }

  context.nextIndex += 1;

  const fallbackLabel =
    featureType === "marker"
      ? "Point GeoJSON"
      : featureType === "line"
        ? "Ligne GeoJSON"
        : featureType === "zone"
          ? "Zone GeoJSON"
          : "Texte GeoJSON";
  const parsedProperties = createImportedFeatureProperties(
    featureType,
    properties,
    fallbackLabel,
  );

  return {
    type: "Feature",
    id: createImportedFeatureId(),
    geometry,
    properties: {
      ...parsedProperties,
      order: context.nextIndex,
      source: {
        type: "geojson",
        importId: context.importId,
        sourceName: context.sourceName,
        originalProperties: cloneJsonValue(properties) as Record<string, unknown>,
      },
    },
  };
}

function parseGeometryRecordToDromapFeatures(
  geometry: Record<string, unknown>,
  properties: Record<string, unknown>,
  context: GeoJsonImportContext,
): DroMapFeature[] {
  const geometryType = getRecordValue(geometry, "type");
  const coordinates = getRecordValue(geometry, "coordinates");

  if (geometryType === "GeometryCollection") {
    const geometries = getRecordValue(geometry, "geometries");

    if (!Array.isArray(geometries)) {
      context.skippedGeometries += 1;
      return [];
    }

    return geometries.flatMap((item) =>
      isRecord(item)
        ? parseGeometryRecordToDromapFeatures(item, properties, context)
        : [],
    );
  }

  if (geometryType === "Point") {
    const point = parseCoordinatePosition(coordinates);
    const feature = point
      ? createImportedDroMapFeature({ type: "Point", coordinates: point }, properties, context)
      : null;

    if (!feature) {
      context.skippedGeometries += 1;
      return [];
    }

    return [feature];
  }

  if (geometryType === "MultiPoint") {
    if (!Array.isArray(coordinates)) {
      context.skippedGeometries += 1;
      return [];
    }

    const features = coordinates
      .map((point) => parseCoordinatePosition(point))
      .filter((point): point is [number, number] => point !== null)
      .map((point) =>
        createImportedDroMapFeature({ type: "Point", coordinates: point }, properties, context),
      )
      .filter((feature): feature is DroMapFeature => feature !== null);

    if (features.length === 0) {
      context.skippedGeometries += 1;
    }

    return features;
  }

  if (geometryType === "LineString") {
    const line = parseLineCoordinates(coordinates);
    const feature = line
      ? createImportedDroMapFeature({ type: "LineString", coordinates: line }, properties, context)
      : null;

    if (!feature) {
      context.skippedGeometries += 1;
      return [];
    }

    return [feature];
  }

  if (geometryType === "MultiLineString") {
    if (!Array.isArray(coordinates)) {
      context.skippedGeometries += 1;
      return [];
    }

    const features = coordinates
      .map(parseLineCoordinates)
      .filter((line): line is [number, number][] => line !== null)
      .map((line) =>
        createImportedDroMapFeature({ type: "LineString", coordinates: line }, properties, context),
      )
      .filter((feature): feature is DroMapFeature => feature !== null);

    if (features.length === 0) {
      context.skippedGeometries += 1;
    }

    return features;
  }

  if (geometryType === "Polygon") {
    const polygon = parseGeoJsonPolygonCoordinates(coordinates);
    const feature = polygon
      ? createImportedDroMapFeature({ type: "Polygon", coordinates: polygon }, properties, context)
      : null;

    if (!feature) {
      context.skippedGeometries += 1;
      return [];
    }

    return [feature];
  }

  if (geometryType === "MultiPolygon") {
    if (!Array.isArray(coordinates)) {
      context.skippedGeometries += 1;
      return [];
    }

    const features = coordinates
      .map(parseGeoJsonPolygonCoordinates)
      .filter((polygon): polygon is [number, number][][] => polygon !== null)
      .map((polygon) =>
        createImportedDroMapFeature({ type: "Polygon", coordinates: polygon }, properties, context),
      )
      .filter((feature): feature is DroMapFeature => feature !== null);

    if (features.length === 0) {
      context.skippedGeometries += 1;
    }

    return features;
  }

  context.skippedGeometries += 1;
  return [];
}

function parseGeoJsonFeatureRecord(
  value: Record<string, unknown>,
  context: GeoJsonImportContext,
): DroMapFeature[] {
  const type = getRecordValue(value, "type");

  if (type === "Feature") {
    const geometry = getRecordValue(value, "geometry");
    const properties = getRecordValue(value, "properties");

    if (!isRecord(geometry)) {
      context.skippedGeometries += 1;
      return [];
    }

    return parseGeometryRecordToDromapFeatures(
      geometry,
      isRecord(properties) ? properties : {},
      context,
    );
  }

  if (typeof type === "string") {
    return parseGeometryRecordToDromapFeatures(value, {}, context);
  }

  context.skippedGeometries += 1;
  return [];
}

function parseGeoJsonRootWorkspaceBounds(value: Record<string, unknown>) {
  const dromap = getRecordValue(value, "dromap");

  if (!isRecord(dromap)) {
    return null;
  }

  const workspace = getRecordValue(dromap, "workspace");

  if (!isRecord(workspace)) {
    return null;
  }

  return parseWorkspaceBounds(getRecordValue(workspace, "bounds"));
}

export function getWorkspaceBoundsFromDromapFeatures(
  features: DroMapFeature[],
): WorkspaceBounds | null {
  const lngs: number[] = [];
  const lats: number[] = [];

  function collectPosition(position: [number, number]) {
    const parsed = parseCoordinatePosition(position);

    if (!parsed) {
      return;
    }

    lngs.push(parsed[0]);
    lats.push(parsed[1]);
  }

  for (const feature of features) {
    if (feature.geometry.type === "Point") {
      collectPosition(feature.geometry.coordinates);
      continue;
    }

    if (feature.geometry.type === "LineString") {
      feature.geometry.coordinates.forEach(collectPosition);
      continue;
    }

    if (feature.geometry.type === "Polygon") {
      feature.geometry.coordinates.forEach((ring) => ring.forEach(collectPosition));
    }
  }

  if (lngs.length === 0 || lats.length === 0) {
    return null;
  }

  let west = Math.min(...lngs);
  let east = Math.max(...lngs);
  let south = Math.min(...lats);
  let north = Math.max(...lats);

  const lngSpan = east - west;
  const latSpan = north - south;
  const paddingLng = lngSpan > 0 ? Math.max(lngSpan * 0.08, 0.02) : 0.08;
  const paddingLat = latSpan > 0 ? Math.max(latSpan * 0.08, 0.02) : 0.08;

  west = clamp(west - paddingLng, -360, 360);
  east = clamp(east + paddingLng, -360, 360);
  south = clamp(south - paddingLat, -85.05112878, 85.05112878);
  north = clamp(north + paddingLat, -85.05112878, 85.05112878);

  if (east - west < 0.000001 || north - south < 0.000001) {
    return null;
  }

  return {
    southWest: { lat: south, lng: west },
    northEast: { lat: north, lng: east },
  };
}

export function parseGeoJsonToDromapFeatures(
  jsonText: string,
  options: GeoJsonImportOptions = {},
): ImportedGeoJsonFeatureCollection {
  const parsed = JSON.parse(jsonText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Import GeoJSON impossible : le fichier doit contenir un objet GeoJSON.");
  }

  const context: GeoJsonImportContext = {
    sourceName: options.sourceName ?? null,
    importId: createGeoJsonImportId(),
    nextIndex: Math.max(0, options.existingFeatureCount ?? 0),
    skippedGeometries: 0,
  };
  const type = getRecordValue(parsed, "type");
  let features: DroMapFeature[] = [];

  if (type === "FeatureCollection") {
    const rawFeatures = getRecordValue(parsed, "features");

    if (!Array.isArray(rawFeatures)) {
      throw new Error("Import GeoJSON impossible : FeatureCollection sans tableau features.");
    }

    features = rawFeatures.flatMap((item) =>
      isRecord(item) ? parseGeoJsonFeatureRecord(item, context) : [],
    );
  } else if (type === "Feature" || typeof type === "string") {
    features = parseGeoJsonFeatureRecord(parsed, context);
  } else {
    throw new Error("Import GeoJSON impossible : type GeoJSON non reconnu.");
  }

  const workspaceBounds =
    parseGeoJsonRootWorkspaceBounds(parsed) ?? getWorkspaceBoundsFromDromapFeatures(features);

  return {
    features,
    skippedGeometries: context.skippedGeometries,
    workspaceBounds,
    sourceName: context.sourceName,
    importId: context.importId,
  };
}

export function downloadProjectAsJson(input: DownloadCanvasExportInput) {
  const jsonContent = JSON.stringify(createProjectJson(input), null, 2);
  const blob = new Blob([jsonContent], {
    type: "application/json;charset=utf-8",
  });

  downloadBlob(blob, getExportFileName("json"));
}

export function downloadFeaturesAsGeoJson(input: DownloadCanvasExportInput) {
  const geoJsonContent = JSON.stringify(createFeaturesGeoJson(input), null, 2);
  const blob = new Blob([geoJsonContent], {
    type: "application/geo+json;charset=utf-8",
  });

  downloadBlob(blob, getExportFileName("geojson"));
}


async function renderCanvasExportToCanvas(
  input: DownloadCanvasExportInput,
  pixelRatio: number,
) {
  const points = getWorkspaceBoundsPoints(input.workspaceBounds);

  if (!points) {
    throw new Error("Zone de travail invalide.");
  }

  const safePixelRatio = clamp(pixelRatio, 0.25, MAX_EXPORT_PIXEL_RATIO);
  const appearance = normalizeLegendAppearance({
    backgroundColor: input.legendBackgroundColor,
    sideWidth: input.legendSideWidth,
    bottomHeight: input.legendBottomHeight,
    titleFontSize: input.legendTitleFontSize,
    itemFontSize: input.legendItemFontSize,
    sectionTitleFontSize: input.legendSectionTitleFontSize,
  });

  const visibleLegendFeatures = getVisibleLegendFeatures({
    features: input.features,
    hiddenLegendFeatureIds: input.hiddenLegendFeatureIds,
    legendFeatureOrder: input.legendFeatureOrder,
  });
  const visibleLegendEntries = mergeLegendEntriesWithGeoJsonLayers(
    getLegendEntries(visibleLegendFeatures, {
      legendGroupLabels: input.legendGroupLabels,
      legendGroupSections: input.legendGroupSections,
      legendGroupOrder: input.legendGroupOrder,
    }),
    input.geoJsonLayers ?? [],
    {
      legendGroupLabels: input.legendGroupLabels,
      legendGroupSections: input.legendGroupSections,
      legendGroupOrder: input.legendGroupOrder,
      hiddenLegendFeatureIds: input.hiddenLegendFeatureIds,
      workspaceBounds: input.workspaceBounds,
    },
  );
  const visibleLegendDisplayItems = createExportLegendDisplayItems(
    visibleLegendEntries,
    {
      legendSectionOrder: input.legendSectionOrder,
      includeEmptySections: true,
    },
  );

  const layout = createExportLayout({
    workspaceBounds: input.workspaceBounds,
    legendPosition: input.legendPosition,
    exportFormat: input.exportFormat,
    legendFeaturesCount: visibleLegendDisplayItems.length,
    appearance,
  });

  if (!layout) {
    throw new Error("Mise en page d’export impossible.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(layout.canvasWidth * safePixelRatio));
  canvas.height = Math.max(1, Math.round(layout.canvasHeight * safePixelRatio));

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Impossible de créer le contexte canvas.");
  }

  ctx.scale(safePixelRatio, safePixelRatio);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = safePixelRatio >= 2 ? "high" : "medium";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);

  const basemap = getDromapBasemapConfig(
    input.basemapId ?? DEFAULT_DROMAP_BASEMAP_ID,
  );

  const projection = await drawBasemap(
    ctx,
    points,
    layout.mapRect,
    layout.logicalMapSize,
    input.workspaceBasemapZoom,
    basemap,
    safePixelRatio,
  );

  await drawBasemapBoundaryOverlay(ctx, basemap, layout.mapRect, projection);
  drawGeoJsonLayersOnCanvas(
    ctx,
    input.geoJsonLayers,
    layout.mapRect,
    projection,
    layout.mapRenderScale,
    input.workspaceBounds,
  );

  clearOutsideMapRect(
    ctx,
    {
      width: layout.canvasWidth,
      height: layout.canvasHeight,
    },
    layout.mapRect,
  );

  const featuresByDrawOrder = getFeaturesByDrawOrder(input.features);

  for (const feature of featuresByDrawOrder) {
    drawFeature(
      ctx,
      feature,
      layout.mapRect,
      projection,
      layout.mapRenderScale,
    );
  }

  drawExportScaleBarOnCanvas(ctx, {
    enabled: input.scaleBarEnabled === true,
    style: input.scaleBarStyle ?? "alternating",
    workspaceBounds: input.workspaceBounds,
    mapRect: layout.mapRect,
  });

  drawBasemapAttribution(ctx, basemap, layout.mapRect);
  drawMapBorder(ctx, layout.mapRect);

  drawLegend(
    ctx,
    layout.legendRect,
    input.legendTitle,
    visibleLegendEntries,
    visibleLegendDisplayItems,
    appearance,
    input.legendPosition,
  );

  return canvas;
}

export async function createCanvasExportPreviewDataUrl(
  input: DownloadCanvasExportInput,
) {
  const canvas = await renderCanvasExportToCanvas(input, 1);

  return canvas.toDataURL("image/png");
}

export async function downloadCanvasExportAsPng(
  input: DownloadCanvasExportInput,
  options: { quality?: ExportVisualQuality } = {},
) {
  const canvas = await renderCanvasExportToCanvas(
    input,
    getEffectiveExportPixelRatio(input, options.quality),
  );

  await downloadCanvasAsPng(canvas);
}

export async function downloadCanvasExportAsJpeg(
  input: DownloadCanvasExportInput,
  options: { quality?: ExportVisualQuality } = {},
) {
  const canvas = await renderCanvasExportToCanvas(
    input,
    getEffectiveExportPixelRatio(input, options.quality),
  );

  await downloadCanvasAsJpeg(canvas);
}

export async function downloadCanvasExportAsWebp(
  input: DownloadCanvasExportInput,
  options: { quality?: ExportVisualQuality } = {},
) {
  const canvas = await renderCanvasExportToCanvas(
    input,
    getEffectiveExportPixelRatio(input, options.quality),
  );

  await downloadCanvasAsWebp(canvas);
}

export async function downloadCanvasExportAsSvg(
  input: DownloadCanvasExportInput,
  options: { quality?: ExportVisualQuality } = {},
) {
  const canvas = await renderCanvasExportToCanvas(
    input,
    getEffectiveExportPixelRatio(input, options.quality),
  );

  downloadCanvasAsSvg(canvas);
}

export async function downloadCanvasExportAsPdf(
  input: DownloadCanvasExportInput,
  options: { quality?: ExportVisualQuality } = {},
) {
  const canvas = await renderCanvasExportToCanvas(
    input,
    getEffectiveExportPixelRatio(input, options.quality),
  );

  downloadCanvasAsPdf(canvas);
}
