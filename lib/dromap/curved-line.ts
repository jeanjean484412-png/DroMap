import type { DroMapFeature } from "./feature";

type Coordinate = [number, number];

/** Compact legend arch with horizontal end tangents, also matching arrowheads. */
export function getCurvedLegendPoints(startX: number, endX: number, centerY: number): Coordinate[] {
  const amplitude = Math.min(8, Math.abs(endX - startX) * 0.16);
  return Array.from({ length: 33 }, (_, i) => [startX + (endX - startX) * i / 32, centerY - amplitude * Math.sin(Math.PI * i / 32) ** 2]);
}

export function getCurvedLegendPath(startX: number, endX: number, centerY: number) {
  return getCurvedLegendPoints(startX, endX, centerY).map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ");
}
const SAMPLES = 128;
const radians = Math.PI / 180;

function project([lng, lat]: Coordinate): Coordinate {
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, lat));
  return [lng * radians, Math.log(Math.tan(Math.PI / 4 + latitude * radians / 2))];
}

function unproject([x, y]: Coordinate): Coordinate {
  return [x / radians, (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / radians];
}

export function isCurvedLineFeature(feature: DroMapFeature | undefined | null) {
  return feature?.geometry.type === "LineString" && feature.properties.lineVariant === "curved";
}

/** The middle handle lies ON the curve, at t=0.5 (not at the Bézier control point).
 * Store the sampled Mercator geometry so every map, export and GeoJSON uses the same path.
 */
export function createCurvedLineCoordinates(start: Coordinate, end: Coordinate, bend?: Coordinate): Coordinate[] {
  const a = project(start);
  const b = project(end);
  const middle = bend ? project(bend) : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const control = [2 * middle[0] - (a[0] + b[0]) / 2, 2 * middle[1] - (a[1] + b[1]) / 2];
  const points = Array.from({ length: SAMPLES + 1 }, (_, index) => {
    const t = index / SAMPLES;
    return unproject([
      (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * control[0] + t ** 2 * b[0],
      (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * control[1] + t ** 2 * b[1],
    ]);
  });
  points[0] = [...start];
  points[SAMPLES] = [...end];
  if (bend) points[SAMPLES / 2] = [...bend];
  return points;
}

export function getCurvedLineHandles(coordinates: Coordinate[]): [Coordinate, Coordinate, Coordinate] | null {
  if (coordinates.length < 2) return null;
  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  const bend = coordinates.length === 2
    ? createCurvedLineCoordinates(start, end)[SAMPLES / 2]
    : coordinates[Math.floor((coordinates.length - 1) / 2)];
  return [start, bend, end];
}
