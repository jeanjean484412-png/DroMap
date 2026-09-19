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

export function readCurveHandleIndices(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.length >= 3 && value.length <= 64 && value[0] === 0
    && value.every((n, i) => Number.isInteger(n) && n >= 0 && (i === 0 || n > value[i - 1])) ? [...value] : undefined;
}

export function getCurveHandleIndices(coordinates: Coordinate[], indices?: unknown): number[] {
  if (Array.isArray(indices) && indices.length >= 3 && indices.length <= 64
    && indices[0] === 0 && indices[indices.length - 1] === coordinates.length - 1
    && indices.every((n, i) => Number.isInteger(n) && n >= 0 && n < coordinates.length && (i === 0 || n > indices[i - 1]))) return [...indices];
  return [0, Math.floor((coordinates.length - 1) / 2), coordinates.length - 1];
}

/** Interpolating cubic spline: shared tangents avoid corners between successive bends. */
export function createMultiCurvedLine(handles: Coordinate[]) {
  if (handles.length < 3 || handles.length > 64) throw new Error("Un trait courbe exige entre 3 et 64 poignées.");
  if (handles.length === 3) return { coordinates: createCurvedLineCoordinates(handles[0], handles[2], handles[1]), indices: [0, 64, 128] };
  const projected = handles.map(project);
  const coordinates: Coordinate[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment < handles.length - 1; segment++) {
    indices.push(coordinates.length);
    const a = projected[segment], b = projected[segment + 1];
    const before = projected[Math.max(0, segment - 1)], after = projected[Math.min(projected.length - 1, segment + 2)];
    for (let i = 0; i < 64; i++) {
      if (i === 0) { coordinates.push([...handles[segment]]); continue; }
      const t = i / 64, t2 = t * t, t3 = t2 * t;
      coordinates.push(unproject([0, 1].map((axis) =>
        (2 * t3 - 3 * t2 + 1) * a[axis] + (t3 - 2 * t2 + t) * (b[axis] - before[axis]) / 2
        + (-2 * t3 + 3 * t2) * b[axis] + (t3 - t2) * (after[axis] - a[axis]) / 2,
      ) as Coordinate));
    }
  }
  indices.push(coordinates.length);
  coordinates.push([...handles[handles.length - 1]]);
  return { coordinates, indices };
}

export function getCurvedLineHandles(coordinates: Coordinate[], indices?: unknown): Coordinate[] | null {
  if (coordinates.length < 2) return null;
  if (indices !== undefined) return getCurveHandleIndices(coordinates, indices).map((index) => coordinates[index]);
  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  const bend = coordinates.length === 2
    ? createCurvedLineCoordinates(start, end)[SAMPLES / 2]
    : coordinates[Math.floor((coordinates.length - 1) / 2)];
  return [start, bend, end];
}
