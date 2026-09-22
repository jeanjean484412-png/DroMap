import type {
  DroMapDrawnMarkerPathElement,
  DroMapDrawnMarkerPoint,
} from "@/stores/editor-custom-markers";

const DEFAULT_SAMPLES_PER_SPAN = 24;

function interpolateCatmullRom(
  p0: DroMapDrawnMarkerPoint,
  p1: DroMapDrawnMarkerPoint,
  p2: DroMapDrawnMarkerPoint,
  p3: DroMapDrawnMarkerPoint,
  t: number,
): DroMapDrawnMarkerPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

export function createCurvedMarkerPoints(
  handles: DroMapDrawnMarkerPoint[],
  samplesPerSpan = DEFAULT_SAMPLES_PER_SPAN,
): DroMapDrawnMarkerPoint[] {
  if (handles.length < 3) return handles.map((point) => ({ ...point }));
  const points: DroMapDrawnMarkerPoint[] = [];
  for (let index = 0; index < handles.length - 1; index += 1) {
    const p0 = handles[Math.max(0, index - 1)];
    const p1 = handles[index];
    const p2 = handles[index + 1];
    const p3 = handles[Math.min(handles.length - 1, index + 2)];
    for (let sample = 0; sample < samplesPerSpan; sample += 1) {
      points.push(
        interpolateCatmullRom(p0, p1, p2, p3, sample / samplesPerSpan),
      );
    }
  }
  points.push({ ...handles[handles.length - 1] });
  return points;
}

export function getMarkerPathHandles(
  element: DroMapDrawnMarkerPathElement,
): DroMapDrawnMarkerPoint[] {
  return (element.rawPoints?.length ? element.rawPoints : element.points).map(
    (point) => ({ ...point }),
  );
}

export function updateMarkerPathHandle(
  element: DroMapDrawnMarkerPathElement,
  index: number,
  point: DroMapDrawnMarkerPoint,
): DroMapDrawnMarkerPathElement {
  const handles = getMarkerPathHandles(element);
  if (!handles[index]) return element;
  handles[index] = { ...point };
  const points =
    element.lineVariant === "curved"
      ? createCurvedMarkerPoints(handles)
      : element.points.map((current, pointIndex) => {
          if (pointIndex === 0 && index === 0) return { ...point };
          if (pointIndex === element.points.length - 1 && index === handles.length - 1)
            return { ...point };
          return current;
        });
  return { ...element, rawPoints: handles, points };
}

export function markerArrowHeadLength(strokeWidth: number) {
  return Math.max(12, strokeWidth * 3.2);
}

function polylineLength(points: DroMapDrawnMarkerPoint[]) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1)
    total += Math.hypot(
      points[index + 1].x - points[index].x,
      points[index + 1].y - points[index].y,
    );
  return total;
}

function trimPolylineStart(
  points: DroMapDrawnMarkerPoint[],
  distance: number,
) {
  let remaining = distance;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    if (segmentLength <= remaining) {
      remaining -= segmentLength;
      continue;
    }
    const ratio = remaining / Math.max(1, segmentLength);
    return [
      {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      },
      ...points.slice(index + 1).map((point) => ({ ...point })),
    ];
  }
  return [{ ...points[points.length - 1] }];
}

/**
 * Stops the visible shaft at the inner side of each arrow head.  This avoids
 * the rounded line cap showing through the filled triangle at any thickness.
 */
export function trimMarkerLineForArrowheads(
  points: DroMapDrawnMarkerPoint[],
  strokeWidth: number,
  arrowStart: boolean,
  arrowEnd: boolean,
): DroMapDrawnMarkerPoint[] {
  if (points.length < 2 || (!arrowStart && !arrowEnd))
    return points.map((point) => ({ ...point }));
  const totalLength = polylineLength(points);
  const requestedInset = markerArrowHeadLength(strokeWidth) + strokeWidth * 0.55;
  const inset = Math.min(
    requestedInset,
    totalLength * (arrowStart && arrowEnd ? 0.44 : 0.82),
  );
  let next = points.map((point) => ({ ...point }));
  if (arrowStart) next = trimPolylineStart(next, inset);
  if (arrowEnd)
    next = trimPolylineStart([...next].reverse(), inset).reverse();
  return next.length >= 2 ? next : [next[0], { ...next[0] }];
}
