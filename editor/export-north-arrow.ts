import { getDromapRuntimeFontFamily } from "@/lib/dromap/font-family";
import type {
  ExportMapElementCustomPosition,
  ExportMapElementPosition,
  ExportNorthArrowStyle,
} from "@/stores/editor-export";
import type { ExportCanvasRect } from "./export-layout";

export type ExportNorthArrowPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const NORTH_ARROW_MARGIN = 16;
const NORTH_ARROW_WIDTH = 58;
const NORTH_ARROW_HEIGHT = 78;
const MIN_MAP_WIDTH = 120;
const MIN_MAP_HEIGHT = 120;

export function createExportNorthArrowPlacement(
  mapRect: Pick<ExportCanvasRect, "x" | "y" | "width" | "height">,
  position: ExportMapElementPosition = "top-right",
  collisionOffset = 0,
  mapPosition: ExportMapElementCustomPosition | null = null,
  size = 1,
): ExportNorthArrowPlacement | null {
  if (mapRect.width < MIN_MAP_WIDTH || mapRect.height < MIN_MAP_HEIGHT) {
    return null;
  }

  const safeSize = Math.min(2, Math.max(0.5, Number(size) || 1));
  const width = NORTH_ARROW_WIDTH * safeSize;
  const height = NORTH_ARROW_HEIGHT * safeSize;
  const isRight = position.endsWith("right");
  const isBottom = position.startsWith("bottom");
  const fallbackX = isRight
    ? mapRect.x + mapRect.width - NORTH_ARROW_MARGIN - width
    : mapRect.x + NORTH_ARROW_MARGIN;
  const baseY = isBottom
    ? mapRect.y + mapRect.height - NORTH_ARROW_MARGIN - height
    : mapRect.y + NORTH_ARROW_MARGIN;
  const fallbackY = isBottom ? baseY - collisionOffset : baseY + collisionOffset;
  const x = mapPosition
    ? Math.min(
        Math.max(
          mapRect.x + mapPosition.x * mapRect.width - width / 2,
          mapRect.x + NORTH_ARROW_MARGIN,
        ),
        mapRect.x + mapRect.width - NORTH_ARROW_MARGIN - width,
      )
    : fallbackX;
  const y = mapPosition
    ? Math.min(
        Math.max(
          mapRect.y + mapPosition.y * mapRect.height - height / 2,
          mapRect.y + NORTH_ARROW_MARGIN,
        ),
        mapRect.y + mapRect.height - NORTH_ARROW_MARGIN - height,
      )
    : Math.min(
        Math.max(fallbackY, mapRect.y + NORTH_ARROW_MARGIN),
        mapRect.y + mapRect.height - NORTH_ARROW_MARGIN - height,
      );

  return {
    x,
    y,
    width,
    height,
  };
}

function drawNorthLabel(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  fontSize = 18,
) {
  ctx.save();
  ctx.font = `800 ${fontSize}px ${getDromapRuntimeFontFamily()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = 4;
  ctx.strokeText("N", centerX, y);
  ctx.fillStyle = "#0f172a";
  ctx.fillText("N", centerX, y);
  ctx.restore();
}

function drawClassicNorthArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
) {
  const centerX = x + width / 2;
  const arrowTipY = y + 25;
  const arrowShoulderY = y + 54;
  const arrowTailY = y + 69;

  drawNorthLabel(ctx, centerX, y + 1, 18);

  ctx.beginPath();
  ctx.moveTo(centerX, arrowTipY);
  ctx.lineTo(centerX + 11, arrowShoulderY);
  ctx.lineTo(centerX, arrowShoulderY - 7);
  ctx.closePath();
  ctx.fillStyle = "#0f172a";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX, arrowTipY);
  ctx.lineTo(centerX, arrowShoulderY - 7);
  ctx.lineTo(centerX - 11, arrowShoulderY);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX, arrowShoulderY - 7);
  ctx.lineTo(centerX, arrowTailY);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, arrowTailY, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = "#0f172a";
  ctx.fill();
}

function drawSimpleNorthArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
) {
  const centerX = x + width / 2;
  drawNorthLabel(ctx, centerX, y + 1, 18);

  ctx.beginPath();
  ctx.moveTo(centerX, y + 24);
  ctx.lineTo(centerX + 14, y + 58);
  ctx.lineTo(centerX + 4, y + 53);
  ctx.lineTo(centerX + 4, y + 70);
  ctx.lineTo(centerX - 4, y + 70);
  ctx.lineTo(centerX - 4, y + 53);
  ctx.lineTo(centerX - 14, y + 58);
  ctx.closePath();
  ctx.fillStyle = "#0f172a";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawCompassNorthArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
) {
  const centerX = x + width / 2;
  const centerY = y + 49;
  drawNorthLabel(ctx, centerX, y, 17);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  const points = [
    [0, -25],
    [7, -7],
    [25, 0],
    [7, 7],
    [0, 25],
    [-7, 7],
    [-25, 0],
    [-7, -7],
  ];
  ctx.beginPath();
  points.forEach(([px, py], index) => {
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -25);
  ctx.lineTo(7, -7);
  ctx.lineTo(0, 0);
  ctx.lineTo(-7, -7);
  ctx.closePath();
  ctx.fillStyle = "#0f172a";
  ctx.fill();
  ctx.restore();
}

function drawNeedleNorthArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
) {
  const centerX = x + width / 2;
  drawNorthLabel(ctx, centerX, y + 1, 18);

  ctx.beginPath();
  ctx.moveTo(centerX, y + 24);
  ctx.lineTo(centerX + 7, y + 57);
  ctx.lineTo(centerX, y + 52);
  ctx.lineTo(centerX - 7, y + 57);
  ctx.closePath();
  ctx.fillStyle = "#0f172a";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX, y + 52);
  ctx.lineTo(centerX, y + 70);
  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function drawExportNorthArrowOnCanvas(
  ctx: CanvasRenderingContext2D,
  input: {
    enabled: boolean;
    style?: ExportNorthArrowStyle;
    position: ExportMapElementPosition;
    collisionOffset?: number;
    mapPosition?: ExportMapElementCustomPosition | null;
    mapRect: ExportCanvasRect;
    size?: number;
  },
) {
  if (!input.enabled) {
    return;
  }

  const placement = createExportNorthArrowPlacement(
    input.mapRect,
    input.position,
    input.collisionOffset ?? 0,
    input.mapPosition ?? null,
    input.size ?? 1,
  );

  if (!placement) {
    return;
  }

  const style = input.style ?? "classic";
  const { x, y } = placement;
  const safeSize = Math.min(2, Math.max(0.5, Number(input.size ?? 1) || 1));

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(safeSize, safeSize);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (style === "simple") {
    drawSimpleNorthArrow(ctx, 0, 0, NORTH_ARROW_WIDTH);
  } else if (style === "compass") {
    drawCompassNorthArrow(ctx, 0, 0, NORTH_ARROW_WIDTH);
  } else if (style === "needle") {
    drawNeedleNorthArrow(ctx, 0, 0, NORTH_ARROW_WIDTH);
  } else {
    drawClassicNorthArrow(ctx, 0, 0, NORTH_ARROW_WIDTH);
  }

  ctx.restore();
}
