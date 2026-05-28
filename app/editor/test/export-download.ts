"use client";

import {
  isFreehandLineFeature,
  type DroMapFeature,
} from "@/lib/dromap/feature";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import type {
  ExportFormat,
  ExportLegendPosition,
} from "@/stores/editor-test-export";

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
  workspaceBounds: WorkspaceBounds;
  workspaceBasemapZoom: number | null;
  legendTitle: string;
  legendPosition: ExportLegendPosition;
  exportFormat: ExportFormat;

  legendBackgroundColor: string;
  legendSideWidth: number;
  legendBottomHeight: number;
  legendTitleFontSize: number;
  legendItemFontSize: number;
  legendSectionTitleFontSize: number;

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
const EXPORT_PIXEL_RATIO = 2;
const EXPORT_TILE_DETAIL_RATIO = 1;
const MAX_TILE_ZOOM = 18;
const MAX_TILE_COUNT = 420;

function getExportFileName() {
  const now = new Date();

  const datePart = now.toISOString().slice(0, 10);
  const timePart = now.toTimeString().slice(0, 8).replaceAll(":", "-");

  return `dromap-export-${datePart}-${timePart}.png`;
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

function wrapTileX(x: number, zoom: number) {
  const tileCount = 2 ** zoom;

  return ((x % tileCount) + tileCount) % tileCount;
}

function getOsmTileUrl(zoom: number, x: number, y: number) {
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

function getCartoFallbackTileUrl(zoom: number, x: number, y: number) {
  const subdomains = ["a", "b", "c", "d"];
  const subdomain = subdomains[Math.abs(x + y + zoom) % subdomains.length];

  return `https://${subdomain}.basemaps.cartocdn.com/light_all/${zoom}/${x}/${y}@2x.png`;
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

async function loadTileImage(zoom: number, x: number, y: number) {
  const osmUrl = getOsmTileUrl(zoom, x, y);

  try {
    return await loadImageFromUrl(osmUrl);
  } catch (error) {
    console.warn("Tuile OSM ignorée, tentative Carto :", osmUrl, error);

    const cartoUrl = getCartoFallbackTileUrl(zoom, x, y);
    return loadImageFromUrl(cartoUrl);
  }
}

async function loadTiles(
  points: WorkspaceBoundsPoints,
  logicalMapSize: { width: number; height: number },
  workspaceBasemapZoom: number | null,
) {
  const zoom = chooseTileZoom(points, logicalMapSize, workspaceBasemapZoom);
  const coverage = getTileCoverage(points, zoom);
  const loadedTiles: LoadedTile[] = [];

  const tilePromises: Array<Promise<void>> = [];

  for (let tileX = coverage.minTileX; tileX <= coverage.maxTileX; tileX += 1) {
    for (
      let tileY = coverage.minTileY;
      tileY <= coverage.maxTileY;
      tileY += 1
    ) {
      const wrappedTileX = wrapTileX(tileX, zoom);

      const promise = loadTileImage(zoom, wrappedTileX, tileY)
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
            { zoom, tileX: wrappedTileX, tileY },
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
) {
  const { zoom, coverage, loadedTiles } = await loadTiles(
    points,
    logicalMapSize,
    workspaceBasemapZoom,
  );

  const scaleX = mapRect.width / coverage.width;
  const scaleY = mapRect.height / coverage.height;

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapRect.x, mapRect.y, mapRect.width, mapRect.height);
  ctx.clip();

  ctx.fillStyle = "#f8fafc";
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

function getFeatureStyle(feature: DroMapFeature): Required<FeatureStyle> {
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

function getLegendCanvasLineDash(feature: DroMapFeature, lineWidth: number) {
  const dashStyle = getFeatureDashStyle(feature);

  if (dashStyle === "solid") {
    return [] as number[];
  }

  if (dashStyle === "dashed") {
    return [Math.max(10, lineWidth * 2.5), Math.max(6, lineWidth * 1.5)];
  }

  return [0.001, Math.max(7, lineWidth * 2)];
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

function getFeatureText(feature: DroMapFeature) {
  const label = feature.properties?.label;

  if (typeof label === "string" && label.trim().length > 0) {
    return label.trim();
  }

  return "Texte";
}

function getFeatureFontSize(feature: DroMapFeature) {
  const rawValue = Number(feature.properties?.style?.fontSize);

  if (!Number.isFinite(rawValue)) {
    return 22;
  }

  return clamp(rawValue, 10, 72);
}

function drawTextFeature(
  ctx: CanvasRenderingContext2D,
  feature: DroMapFeature,
  x: number,
  y: number,
  graphicScale: number,
) {
  const style = getFeatureStyle(feature);
  const text = getFeatureText(feature);
  const fontSize = getFeatureFontSize(feature) * graphicScale;

  ctx.save();

  ctx.globalAlpha = clamp(style.opacity, 0, 1);
  ctx.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = Math.max(3, fontSize * 0.18);
  ctx.strokeText(text, x, y);

  ctx.fillStyle = style.color;
  ctx.fillText(text, x, y);

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

    ctx.beginPath();

    for (const ring of rings) {
      ctx.moveTo(ring[0].x, ring[0].y);

      for (const point of ring.slice(1)) {
        ctx.lineTo(point.x, point.y);
      }

      ctx.closePath();
    }

    ctx.globalAlpha = style.fillOpacity;
    ctx.fillStyle = style.fillColor;
    ctx.fill("evenodd");

    ctx.globalAlpha = style.opacity;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(getCanvasLineDash(feature, lineWidth));
    ctx.stroke();

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

    if (ctx.measureText(nextLine).width <= maxWidth || currentLine.length === 0) {
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
  const squareX = x + Math.max(0, (symbolBoxWidth - symbolSize) / 2);

  if (type === "text") {
    ctx.save();

    ctx.globalAlpha = style.opacity;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.roundRect(squareX + 3, y + 3, symbolSize - 6, symbolSize - 6, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = style.color;
    ctx.font = `700 ${Math.round(symbolSize * 0.58)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("T", centerX, centerY + 1);

    ctx.restore();
    return;
  }

  if (type === "marker") {
    const markerSize = clamp(
      getFeatureMarkerSize(feature),
      symbolSize * 0.42,
      symbolSize * 0.86,
    );

    drawMarkerSymbolOnCanvas(ctx, feature, centerX, centerY, markerSize);
    return;
  }

  if (type === "line") {
    const symbolLineWidth = Math.max(3, Math.min(style.weight * 1.6, 9));
    const startX = x + 2;
    const endX = x + symbolBoxWidth - 2;
    const hasArrowStart = featureHasArrowStart(feature);
    const hasArrowEnd = featureHasArrowEnd(feature);
    const arrowLength = Math.max(13, Math.min(24, symbolLineWidth * 2.1));
    const arrowHalfHeight = Math.max(8, symbolLineWidth * 1.4);
    const startArrowBaseX = startX + arrowLength;
    const endArrowBaseX = endX - arrowLength;
    const lineStartX = hasArrowStart
      ? startArrowBaseX - Math.max(1.5, symbolLineWidth * 0.45)
      : startX;
    const lineEndX = hasArrowEnd
      ? endArrowBaseX + Math.max(1.5, symbolLineWidth * 0.45)
      : endX;

    ctx.save();
    ctx.globalAlpha = style.opacity;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = symbolLineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(getLegendCanvasLineDash(feature, symbolLineWidth));

    ctx.beginPath();

    if (isFreehandLineFeature(feature)) {
      const controlOffset = Math.max(7, symbolSize * 0.26);
      const segmentWidth = lineEndX - lineStartX;

      ctx.moveTo(lineStartX, centerY);
      ctx.bezierCurveTo(
        lineStartX + segmentWidth * 0.22,
        centerY - controlOffset,
        lineStartX + segmentWidth * 0.44,
        centerY + controlOffset,
        lineStartX + segmentWidth * 0.62,
        centerY,
      );
      ctx.bezierCurveTo(
        lineStartX + segmentWidth * 0.76,
        centerY - controlOffset,
        lineStartX + segmentWidth * 0.9,
        centerY + controlOffset,
        lineEndX,
        centerY,
      );
    } else {
      ctx.moveTo(lineStartX, centerY);
      ctx.lineTo(lineEndX, centerY);
    }

    ctx.stroke();

    ctx.setLineDash([]);

    if (hasArrowStart) {
      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.moveTo(startX, centerY);
      ctx.lineTo(startArrowBaseX, centerY - arrowHalfHeight);
      ctx.lineTo(startArrowBaseX, centerY + arrowHalfHeight);
      ctx.closePath();
      ctx.fill();
    }

    if (hasArrowEnd) {
      ctx.fillStyle = style.color;
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

  const symbolLineWidth = Math.max(3, Math.min(style.weight * 1.2, 7));
  const rectX = squareX + 6;
  const rectY = y + 6;
  const rectWidth = symbolSize - 12;
  const rectHeight = symbolSize - 12;

  ctx.save();
  ctx.globalAlpha = Math.max(0.12, style.fillOpacity);
  ctx.fillStyle = style.fillColor;
  ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

  ctx.globalAlpha = style.opacity;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = symbolLineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(getLegendCanvasLineDash(feature, symbolLineWidth));

  ctx.beginPath();
  ctx.rect(rectX, rectY, rectWidth, rectHeight);
  ctx.stroke();

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
  const sectionSeparatorColor = getLegendSeparatorColor(appearance.backgroundColor);
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
          Math.round((legendLayout.itemHeight + legendLayout.sectionFontSize) / 2),
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

      ctx.strokeStyle = sectionSeparatorColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(item.x, sectionTextY + 8);
      ctx.lineTo(item.x + item.width, sectionTextY + 8);
      ctx.stroke();
      continue;
    }

    const entry = entries[displayItem.entryIndex];

    if (!entry) {
      continue;
    }

    const feature = entry.representativeFeature;

    const symbolX = item.x;
    const symbolY =
      item.y + Math.max(0, (legendLayout.itemHeight - legendLayout.symbolSize) / 2);
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

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Impossible de générer le PNG."));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

async function downloadCanvas(canvas: HTMLCanvasElement) {
  const blob = await canvasToBlob(canvas);
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = getExportFileName();
    link.click();
  } finally {
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }
}

export async function downloadCanvasExportAsPng(
  input: DownloadCanvasExportInput,
) {
  const points = getWorkspaceBoundsPoints(input.workspaceBounds);

  if (!points) {
    throw new Error("Zone de travail invalide.");
  }

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
  const visibleLegendEntries = getLegendEntries(visibleLegendFeatures, {
    legendGroupLabels: input.legendGroupLabels,
    legendGroupSections: input.legendGroupSections,
    legendGroupOrder: input.legendGroupOrder,
  });
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
  canvas.width = layout.canvasWidth * EXPORT_PIXEL_RATIO;
  canvas.height = layout.canvasHeight * EXPORT_PIXEL_RATIO;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Impossible de créer le contexte canvas.");
  }

  ctx.scale(EXPORT_PIXEL_RATIO, EXPORT_PIXEL_RATIO);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);

  const projection = await drawTiles(
    ctx,
    points,
    layout.mapRect,
    layout.logicalMapSize,
    input.workspaceBasemapZoom,
  );

  clearOutsideMapRect(
    ctx,
    {
      width: layout.canvasWidth,
      height: layout.canvasHeight,
    },
    layout.mapRect,
  );

  const featuresByDrawOrder = [
    ...input.features.filter(
      (feature) =>
        feature.properties?.type !== "marker" &&
        feature.properties?.type !== "text",
    ),
    ...input.features.filter(
      (feature) => feature.properties?.type === "marker",
    ),
    ...input.features.filter((feature) => feature.properties?.type === "text"),
  ];

  for (const feature of featuresByDrawOrder) {
    drawFeature(
      ctx,
      feature,
      layout.mapRect,
      projection,
      layout.mapRenderScale,
    );
  }

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

  await downloadCanvas(canvas);
}
