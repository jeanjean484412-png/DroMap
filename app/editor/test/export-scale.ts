import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import type {
  ExportMapElementCustomPosition,
  ExportMapElementPosition,
  ExportScaleBarStyle,
} from "@/stores/editor-test-export";
import type { ExportCanvasRect } from "./export-layout";

export type ExportScaleBarModel = {
  widthPx: number;
  label: string;
  segments: number;
};

const EARTH_METERS_PER_DEGREE = 111_320;
const MIN_SCALE_BAR_WIDTH = 72;
const MAX_SCALE_BAR_WIDTH = 180;
const TARGET_SCALE_BAR_RATIO = 0.18;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeLngSpanDegrees(west: number, east: number) {
  const rawSpan = Math.abs(east - west);

  if (!Number.isFinite(rawSpan)) {
    return 0;
  }

  if (rawSpan <= 360) {
    return rawSpan;
  }

  return 360;
}

function getNiceDistanceMeters(distanceMeters: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return 0;
  }

  const exponent = Math.floor(Math.log10(distanceMeters));
  const magnitude = 10 ** exponent;
  const normalized = distanceMeters / magnitude;
  const niceMultiplier = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;

  return niceMultiplier * magnitude;
}

function formatDistanceLabel(distanceMeters: number) {
  if (distanceMeters >= 1000) {
    const kilometers = distanceMeters / 1000;

    if (kilometers >= 100 || Number.isInteger(kilometers)) {
      return `${Math.round(kilometers)} km`;
    }

    return `${Number(kilometers.toFixed(1))} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}

export function createExportScaleBarModel(input: {
  workspaceBounds: WorkspaceBounds | null;
  mapRect: Pick<ExportCanvasRect, "width" | "height">;
}): ExportScaleBarModel | null {
  const { workspaceBounds, mapRect } = input;

  if (!workspaceBounds || mapRect.width < 160 || mapRect.height < 120) {
    return null;
  }

  const south = workspaceBounds.southWest.lat;
  const north = workspaceBounds.northEast.lat;
  const west = workspaceBounds.southWest.lng;
  const east = workspaceBounds.northEast.lng;

  const centerLat = clamp((south + north) / 2, -85, 85);
  const lngSpan = normalizeLngSpanDegrees(west, east);
  const cosine = Math.max(0.03, Math.cos((centerLat * Math.PI) / 180));
  const mapWidthMeters = lngSpan * EARTH_METERS_PER_DEGREE * cosine;

  if (!Number.isFinite(mapWidthMeters) || mapWidthMeters <= 0) {
    return null;
  }

  const metersPerPixel = mapWidthMeters / mapRect.width;
  const targetWidth = clamp(
    mapRect.width * TARGET_SCALE_BAR_RATIO,
    MIN_SCALE_BAR_WIDTH,
    MAX_SCALE_BAR_WIDTH,
  );
  const niceMeters = getNiceDistanceMeters(metersPerPixel * targetWidth);
  const widthPx = niceMeters / metersPerPixel;

  if (!Number.isFinite(widthPx) || widthPx < 32) {
    return null;
  }

  return {
    widthPx: Math.round(widthPx),
    label: formatDistanceLabel(niceMeters),
    segments: niceMeters % 4 === 0 ? 4 : niceMeters % 2 === 0 ? 2 : 4,
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

export function drawExportScaleBarOnCanvas(
  ctx: CanvasRenderingContext2D,
  input: {
    enabled: boolean;
    style: ExportScaleBarStyle;
    position: ExportMapElementPosition;
    mapPosition?: ExportMapElementCustomPosition | null;
    workspaceBounds: WorkspaceBounds | null;
    mapRect: ExportCanvasRect;
  },
) {
  if (!input.enabled) {
    return;
  }

  const model = createExportScaleBarModel({
    workspaceBounds: input.workspaceBounds,
    mapRect: input.mapRect,
  });

  if (!model) {
    return;
  }

  const margin = 16;
  const paddingX = input.style === "boxed" ? 7 : 0;
  const paddingY = input.style === "boxed" ? 5 : 0;
  const barHeight = 8;
  const labelHeight = 16;
  const boxWidth = model.widthPx + paddingX * 2;
  const boxHeight = labelHeight + barHeight + paddingY * 2 + 4;
  const isRight = input.position.endsWith("right");
  const isBottom = input.position.startsWith("bottom");
  const fallbackX = isRight
    ? input.mapRect.x + input.mapRect.width - margin - boxWidth
    : input.mapRect.x + margin;
  const fallbackY = isBottom
    ? input.mapRect.y + input.mapRect.height - margin - boxHeight
    : input.mapRect.y + margin;
  const customPosition = input.mapPosition;
  const minX = input.mapRect.x + margin;
  const maxX = Math.max(
    minX,
    input.mapRect.x + input.mapRect.width - margin - boxWidth,
  );
  const minY = input.mapRect.y + margin;
  const maxY = Math.max(
    minY,
    input.mapRect.y + input.mapRect.height - margin - boxHeight,
  );
  const x = customPosition
    ? clamp(
        input.mapRect.x + customPosition.x * input.mapRect.width - boxWidth / 2,
        minX,
        maxX,
      )
    : fallbackX;
  const y = customPosition
    ? clamp(
        input.mapRect.y + customPosition.y * input.mapRect.height - boxHeight / 2,
        minY,
        maxY,
      )
    : fallbackY;
  const barX = x + paddingX;
  const barY = y + paddingY + labelHeight + 3;

  ctx.save();
  ctx.font =
    "600 12px Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";

  if (input.style === "boxed") {
    drawRoundedRect(ctx, x, y, boxWidth, boxHeight, 5);
    ctx.strokeStyle = "rgba(15, 23, 42, 0.72)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = 4;
  ctx.strokeText(model.label, barX, y + paddingY);
  ctx.fillStyle = "#0f172a";
  ctx.fillText(model.label, barX, y + paddingY);

  if (input.style === "line") {
    const tickHeight = 10;
    ctx.strokeStyle = "rgba(255,255,255,0.96)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(barX, barY + barHeight / 2);
    ctx.lineTo(barX + model.widthPx, barY + barHeight / 2);
    ctx.moveTo(barX, barY + barHeight / 2 - tickHeight / 2);
    ctx.lineTo(barX, barY + barHeight / 2 + tickHeight / 2);
    ctx.moveTo(barX + model.widthPx / 2, barY + barHeight / 2 - tickHeight / 2);
    ctx.lineTo(barX + model.widthPx / 2, barY + barHeight / 2 + tickHeight / 2);
    ctx.moveTo(barX + model.widthPx, barY + barHeight / 2 - tickHeight / 2);
    ctx.lineTo(barX + model.widthPx, barY + barHeight / 2 + tickHeight / 2);
    ctx.stroke();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (input.style === "alternating" || input.style === "boxed") {
    const segments = 4;
    const segmentWidth = model.widthPx / segments;

    for (let index = 0; index < segments; index += 1) {
      ctx.fillStyle = index % 2 === 0 ? "#0f172a" : "#ffffff";
      ctx.fillRect(barX + index * segmentWidth, barY, segmentWidth, barHeight);
    }

    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.25;
    ctx.strokeRect(barX, barY, model.widthPx, barHeight);
  } else {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(barX, barY, model.widthPx, barHeight);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, model.widthPx, barHeight);
  }

  ctx.restore();
}
