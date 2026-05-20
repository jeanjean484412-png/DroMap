export const GRAPHIC_ZOOM_MIN = 0.5;
export const GRAPHIC_ZOOM_MAX = 2;
export const GRAPHIC_ZOOM_STEP = 0.1;
export const GRAPHIC_ZOOM_DEFAULT = 1;

export function clampGraphicZoomLevel(level: number): number {
  return Math.min(GRAPHIC_ZOOM_MAX, Math.max(GRAPHIC_ZOOM_MIN, level));
}

export function graphicZoomToPercent(level: number): number {
  return Math.round(level * 100);
}
