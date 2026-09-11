import type { DroMapFeature } from "@/lib/dromap/feature";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";

type Point = [number, number];

type NormalizedWorkspaceBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

function normalizeWorkspaceBounds(
  workspaceBounds: WorkspaceBounds,
): NormalizedWorkspaceBounds {
  return {
    south: Math.min(
      workspaceBounds.southWest.lat,
      workspaceBounds.northEast.lat,
    ),
    west: Math.min(
      workspaceBounds.southWest.lng,
      workspaceBounds.northEast.lng,
    ),
    north: Math.max(
      workspaceBounds.southWest.lat,
      workspaceBounds.northEast.lat,
    ),
    east: Math.max(
      workspaceBounds.southWest.lng,
      workspaceBounds.northEast.lng,
    ),
  };
}

function pointIsInsideBounds(point: Point, bounds: NormalizedWorkspaceBounds) {
  const [longitude, latitude] = point;
  const longitudeCandidates = [longitude, longitude - 360, longitude + 360];

  return (
    latitude >= bounds.south &&
    latitude <= bounds.north &&
    longitudeCandidates.some(
      (candidate) => candidate >= bounds.west && candidate <= bounds.east,
    )
  );
}

function orientation(a: Point, b: Point, c: Point) {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);

  if (Math.abs(value) < 1e-12) {
    return 0;
  }

  return value > 0 ? 1 : 2;
}

function pointIsOnSegment(a: Point, b: Point, c: Point) {
  return (
    b[0] <= Math.max(a[0], c[0]) + 1e-12 &&
    b[0] >= Math.min(a[0], c[0]) - 1e-12 &&
    b[1] <= Math.max(a[1], c[1]) + 1e-12 &&
    b[1] >= Math.min(a[1], c[1]) - 1e-12
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const firstOrientation = orientation(a, b, c);
  const secondOrientation = orientation(a, b, d);
  const thirdOrientation = orientation(c, d, a);
  const fourthOrientation = orientation(c, d, b);

  if (
    firstOrientation !== secondOrientation &&
    thirdOrientation !== fourthOrientation
  ) {
    return true;
  }

  if (firstOrientation === 0 && pointIsOnSegment(a, c, b)) return true;
  if (secondOrientation === 0 && pointIsOnSegment(a, d, b)) return true;
  if (thirdOrientation === 0 && pointIsOnSegment(c, a, d)) return true;
  if (fourthOrientation === 0 && pointIsOnSegment(c, b, d)) return true;

  return false;
}

function getWorkspaceEdges(bounds: NormalizedWorkspaceBounds) {
  const southWest: Point = [bounds.west, bounds.south];
  const northWest: Point = [bounds.west, bounds.north];
  const northEast: Point = [bounds.east, bounds.north];
  const southEast: Point = [bounds.east, bounds.south];

  return [
    [southWest, northWest],
    [northWest, northEast],
    [northEast, southEast],
    [southEast, southWest],
  ] as const;
}

function segmentIntersectsBounds(
  start: Point,
  end: Point,
  bounds: NormalizedWorkspaceBounds,
) {
  if (pointIsInsideBounds(start, bounds) || pointIsInsideBounds(end, bounds)) {
    return true;
  }

  const longitudeOffsets = [0, -360, 360];

  return longitudeOffsets.some((offset) => {
    const shiftedStart: Point = [start[0] + offset, start[1]];
    const shiftedEnd: Point = [end[0] + offset, end[1]];

    return getWorkspaceEdges(bounds).some(([edgeStart, edgeEnd]) =>
      segmentsIntersect(shiftedStart, shiftedEnd, edgeStart, edgeEnd),
    );
  });
}

function lineIntersectsBounds(
  coordinates: Point[],
  bounds: NormalizedWorkspaceBounds,
) {
  if (
    coordinates.some((coordinate) => pointIsInsideBounds(coordinate, bounds))
  ) {
    return true;
  }

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];

    if (start && end && segmentIntersectsBounds(start, end, bounds)) {
      return true;
    }
  }

  return false;
}

function pointIsInsideRing(point: Point, ring: Point[]) {
  let isInside = false;

  for (
    let index = 0, previousIndex = ring.length - 1;
    index < ring.length;
    previousIndex = index, index += 1
  ) {
    const current = ring[index];
    const previous = ring[previousIndex];

    if (!current || !previous) {
      continue;
    }

    const intersects =
      current[1] > point[1] !== previous[1] > point[1] &&
      point[0] <
        ((previous[0] - current[0]) * (point[1] - current[1])) /
          (previous[1] - current[1]) +
          current[0];

    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function polygonIntersectsBounds(
  rings: Point[][],
  bounds: NormalizedWorkspaceBounds,
) {
  if (rings.some((ring) => lineIntersectsBounds(ring, bounds))) {
    return true;
  }

  const outerRing = rings[0];

  if (!outerRing || outerRing.length < 3) {
    return false;
  }

  const workspaceCorners: Point[] = [
    [bounds.west, bounds.south],
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
  ];

  return workspaceCorners.some((corner) =>
    pointIsInsideRing(corner, outerRing),
  );
}

export function featureIntersectsWorkspace(
  feature: DroMapFeature,
  workspaceBounds: WorkspaceBounds,
) {
  const bounds = normalizeWorkspaceBounds(workspaceBounds);
  const geometry = feature.geometry;

  if (geometry.type === "Point") {
    return pointIsInsideBounds(geometry.coordinates, bounds);
  }

  if (geometry.type === "LineString") {
    return lineIntersectsBounds(geometry.coordinates, bounds);
  }

  return polygonIntersectsBounds(geometry.coordinates, bounds);
}

export function getFeatureIdsOutsideWorkspace(
  features: DroMapFeature[],
  workspaceBounds: WorkspaceBounds,
) {
  return features
    .filter((feature) => !featureIntersectsWorkspace(feature, workspaceBounds))
    .map((feature) => feature.id);
}
