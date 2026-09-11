import type { LatLng, Map as LeafletMap } from "leaflet";

import type {
  DroMapFeature,
  DroMapFeatureStyle,
  DroMapPolygon,
  DroMapZoneShapeKind,
} from "@/lib/dromap/feature";
import { isQuickShapeZoneFeature } from "@/lib/dromap/feature";

export const DROMAP_QUICK_SHAPES: {
  value: DroMapZoneShapeKind;
  label: string;
}[] = [
  { value: "rectangle", label: "Rectangle" },
  { value: "circle", label: "Cercle" },
  { value: "ellipse", label: "Ellipse" },
];

export const MIN_QUICK_SHAPE_SIZE = 28;
export const MAX_QUICK_SHAPE_SIZE = 50000;
export const DEFAULT_QUICK_SHAPE_WIDTH = 180;
export const DEFAULT_QUICK_SHAPE_HEIGHT = 110;
const MIN_ELLIPSE_SEGMENTS = 144;
const MAX_ELLIPSE_SEGMENTS = 512;
const ELLIPSE_SEGMENT_TARGET_LENGTH = 5;
const OPPOSITE_ELLIPSE_POINT_RATIO = Math.SQRT2;

export type QuickShapeRectangleResizeHandle = "nw" | "ne" | "se" | "sw";
export type QuickShapeResizeHandle = QuickShapeRectangleResizeHandle | "ellipse" | "circle";

type Point = {
  x: number;
  y: number;
};

type Coordinate = [number, number];

type ShapeScreenSpec = {
  centerPoint: Point;
  width: number;
  height: number;
  rotation: number;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeRotation(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  let nextValue = value as number;

  while (nextValue > 180) nextValue -= 360;
  while (nextValue < -180) nextValue += 360;

  return Math.round(nextValue);
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function rotatePoint(point: Point, rotation: number): Point {
  const radians = toRadians(rotation);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function getClosedRing(points: Coordinate[]): Coordinate[] {
  if (points.length === 0) {
    return points;
  }

  const first = points[0];
  const last = points[points.length - 1];

  if (first[0] === last[0] && first[1] === last[1]) {
    return points;
  }

  return [...points, first];
}

function getMainRing(feature: DroMapFeature): Coordinate[] {
  if (feature.geometry.type !== "Polygon") {
    return [];
  }

  return feature.geometry.coordinates[0] ?? [];
}

function getOpenRing(feature: DroMapFeature): Coordinate[] {
  const ring = getMainRing(feature);

  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];

    if (first[0] === last[0] && first[1] === last[1]) {
      return ring.slice(0, -1);
    }
  }

  return ring;
}

function getCoordinateCenter(coordinates: Coordinate[]): Coordinate {
  if (coordinates.length === 0) {
    return [0, 0];
  }

  let lngSum = 0;
  let latSum = 0;

  for (const [lng, lat] of coordinates) {
    lngSum += lng;
    latSum += lat;
  }

  return [lngSum / coordinates.length, latSum / coordinates.length];
}

function getShapeLabel(kind: DroMapZoneShapeKind) {
  if (kind === "circle") return "Cercle";
  if (kind === "ellipse") return "Ellipse";
  return "Rectangle";
}

function getEllipseSegments(width: number, height: number) {
  const normalizedWidth = Math.max(width, Number.EPSILON);
  const normalizedHeight = Math.max(height, Number.EPSILON);
  const halfWidth = normalizedWidth / 2;
  const halfHeight = normalizedHeight / 2;

  // Approximation de Ramanujan : elle permet d'augmenter automatiquement
  // le nombre de points quand l'ellipse ou le cercle est grand à l'écran.
  const circumference =
    Math.PI *
    (
      3 * (halfWidth + halfHeight) -
      Math.sqrt((3 * halfWidth + halfHeight) * (halfWidth + 3 * halfHeight))
    );

  return clamp(
    Math.ceil(circumference / ELLIPSE_SEGMENT_TARGET_LENGTH),
    MIN_ELLIPSE_SEGMENTS,
    MAX_ELLIPSE_SEGMENTS,
  );
}

export function buildLocalShapePoints(
  kind: DroMapZoneShapeKind,
  width: number,
  height: number,
): Point[] {
  const normalizedWidth = Math.max(width, Number.EPSILON);
  const normalizedHeight = kind === "circle"
    ? normalizedWidth
    : Math.max(height, Number.EPSILON);
  const halfWidth = normalizedWidth / 2;
  const halfHeight = normalizedHeight / 2;

  if (kind === "ellipse" || kind === "circle") {
    const segments = getEllipseSegments(normalizedWidth, normalizedHeight);

    return Array.from({ length: segments }, (_, index) => {
      const angle = (index / segments) * Math.PI * 2;

      return {
        x: Math.cos(angle) * halfWidth,
        y: Math.sin(angle) * halfHeight,
      };
    });
  }

  return [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];
}

function buildGeometryFromGeoLocalExtents(options: {
  center: Coordinate;
  kind: DroMapZoneShapeKind;
  halfWidth: number;
  halfHeight: number;
  rotation: number;
}): DroMapPolygon {
  const diameter = Math.max(options.halfWidth, options.halfHeight) * 2;
  const width = options.kind === "circle" ? diameter : Math.max(options.halfWidth * 2, Number.EPSILON);
  const height = options.kind === "circle" ? diameter : Math.max(options.halfHeight * 2, Number.EPSILON);
  const rotation = options.kind === "circle" ? 0 : options.rotation;
  const localPoints = buildLocalShapePoints(options.kind, width, height);
  const coordinates = localPoints.map((point): Coordinate => {
    const rotatedPoint = rotatePoint(point, rotation);

    return [
      options.center[0] + rotatedPoint.x,
      options.center[1] + rotatedPoint.y,
    ];
  });

  return {
    type: "Polygon",
    coordinates: [getClosedRing(coordinates)],
  };
}

function getLocalGeoBounds(feature: DroMapFeature, rotation: number) {
  const coordinates = getOpenRing(feature);
  const center = getCoordinateCenter(coordinates);
  let maxX = 0;
  let maxY = 0;

  for (const [lng, lat] of coordinates) {
    const local = rotatePoint(
      {
        x: lng - center[0],
        y: lat - center[1],
      },
      -rotation,
    );

    maxX = Math.max(maxX, Math.abs(local.x));
    maxY = Math.max(maxY, Math.abs(local.y));
  }

  return {
    center,
    halfWidth: Math.max(maxX, Number.EPSILON),
    halfHeight: Math.max(maxY, Number.EPSILON),
  };
}

function getScreenMetrics(map: LeafletMap, feature: DroMapFeature): ShapeScreenSpec | null {
  if (!isQuickShapeZoneFeature(feature) || feature.geometry.type !== "Polygon") {
    return null;
  }

  const ring = getOpenRing(feature);

  if (ring.length === 0) {
    return null;
  }

  const projectedPoints = ring.map(([lng, lat]) =>
    map.latLngToContainerPoint([lat, lng]),
  );
  const centerPoint = projectedPoints.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  centerPoint.x /= projectedPoints.length;
  centerPoint.y /= projectedPoints.length;

  const kind = getQuickShapeKind(feature);
  const rotation = kind === "circle" ? 0 : getQuickShapeRotation(feature);
  let maxX = 0;
  let maxY = 0;

  for (const point of projectedPoints) {
    const localPoint = rotatePoint(
      {
        x: point.x - centerPoint.x,
        y: point.y - centerPoint.y,
      },
      -rotation,
    );

    maxX = Math.max(maxX, Math.abs(localPoint.x));
    maxY = Math.max(maxY, Math.abs(localPoint.y));
  }

  const width = Math.max(MIN_QUICK_SHAPE_SIZE, maxX * 2);
  const height = kind === "circle"
    ? width
    : Math.max(MIN_QUICK_SHAPE_SIZE, maxY * 2);

  return {
    centerPoint,
    width,
    height,
    rotation,
  };
}

function buildPolygonFromScreenSpec(map: LeafletMap, options: {
  kind: DroMapZoneShapeKind;
  centerPoint: Point;
  width: number;
  height: number;
  rotation: number;
}): DroMapPolygon {
  const width = clamp(options.width, MIN_QUICK_SHAPE_SIZE, MAX_QUICK_SHAPE_SIZE);
  const height = options.kind === "circle"
    ? width
    : clamp(options.height, MIN_QUICK_SHAPE_SIZE, MAX_QUICK_SHAPE_SIZE);
  const rotation = options.kind === "circle" ? 0 : normalizeRotation(options.rotation);
  const localPoints = buildLocalShapePoints(options.kind, width, height);
  const coordinates = localPoints.map((point): Coordinate => {
    const rotatedPoint = rotatePoint(point, rotation);
    const latLng = map.containerPointToLatLng([
      options.centerPoint.x + rotatedPoint.x,
      options.centerPoint.y + rotatedPoint.y,
    ]);

    return [latLng.lng, latLng.lat];
  });

  return {
    type: "Polygon",
    coordinates: [getClosedRing(coordinates)],
  };
}

function getPlacementScreenSpec(options: {
  map: LeafletMap;
  startLatLng: LatLng;
  endLatLng: LatLng;
  kind: DroMapZoneShapeKind;
}): ShapeScreenSpec {
  const startPoint = options.map.latLngToContainerPoint(options.startLatLng);
  const endPoint = options.map.latLngToContainerPoint(options.endLatLng);
  const minSize = MIN_QUICK_SHAPE_SIZE;

  if (options.kind === "circle") {
    const radius = Math.max(
      minSize / 2,
      Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y),
    );

    return {
      centerPoint: startPoint,
      width: clamp(radius * 2, minSize, MAX_QUICK_SHAPE_SIZE),
      height: clamp(radius * 2, minSize, MAX_QUICK_SHAPE_SIZE),
      rotation: 0,
    };
  }

  const centerPoint = {
    x: (startPoint.x + endPoint.x) / 2,
    y: (startPoint.y + endPoint.y) / 2,
  };

  if (options.kind === "ellipse") {
    return {
      centerPoint,
      width: clamp(Math.abs(endPoint.x - startPoint.x) * OPPOSITE_ELLIPSE_POINT_RATIO, minSize, MAX_QUICK_SHAPE_SIZE),
      height: clamp(Math.abs(endPoint.y - startPoint.y) * OPPOSITE_ELLIPSE_POINT_RATIO, minSize, MAX_QUICK_SHAPE_SIZE),
      rotation: 0,
    };
  }

  return {
    centerPoint,
    width: clamp(Math.abs(endPoint.x - startPoint.x), minSize, MAX_QUICK_SHAPE_SIZE),
    height: clamp(Math.abs(endPoint.y - startPoint.y), minSize, MAX_QUICK_SHAPE_SIZE),
    rotation: 0,
  };
}

export function getQuickShapeKind(featureOrStyle: DroMapFeature | DroMapFeatureStyle): DroMapZoneShapeKind {
  if ("properties" in featureOrStyle) {
    const kind = featureOrStyle.properties?.zoneShapeKind;

    if (kind === "circle" || kind === "ellipse") return kind;
    return "rectangle";
  }

  const kind = (featureOrStyle as DroMapFeatureStyle & { zoneShapeKind?: DroMapZoneShapeKind }).zoneShapeKind;

  if (kind === "circle" || kind === "ellipse") return kind;
  return "rectangle";
}

export function getQuickShapeWidth(featureOrStyle: DroMapFeature | DroMapFeatureStyle) {
  const style = "properties" in featureOrStyle ? featureOrStyle.properties?.style : featureOrStyle;

  return clamp(
    Number(style?.zoneShapeWidth ?? DEFAULT_QUICK_SHAPE_WIDTH),
    MIN_QUICK_SHAPE_SIZE,
    MAX_QUICK_SHAPE_SIZE,
  );
}

export function getQuickShapeHeight(featureOrStyle: DroMapFeature | DroMapFeatureStyle) {
  const kind = getQuickShapeKind(featureOrStyle);

  if (kind === "circle") {
    return getQuickShapeWidth(featureOrStyle);
  }

  const style = "properties" in featureOrStyle ? featureOrStyle.properties?.style : featureOrStyle;

  return clamp(
    Number(style?.zoneShapeHeight ?? DEFAULT_QUICK_SHAPE_HEIGHT),
    MIN_QUICK_SHAPE_SIZE,
    MAX_QUICK_SHAPE_SIZE,
  );
}

export function getQuickShapeRotation(featureOrStyle: DroMapFeature | DroMapFeatureStyle) {
  if (getQuickShapeKind(featureOrStyle) === "circle") {
    return 0;
  }

  const style = "properties" in featureOrStyle ? featureOrStyle.properties?.style : featureOrStyle;

  return normalizeRotation(Number(style?.zoneShapeRotation ?? 0));
}

export function createQuickShapePolygonFromMap(options: {
  map: LeafletMap;
  centerLatLng: LatLng;
  kind: DroMapZoneShapeKind;
  width: number;
  height: number;
  rotation: number;
}): DroMapPolygon {
  const centerPoint = options.map.latLngToContainerPoint(options.centerLatLng);

  return buildPolygonFromScreenSpec(options.map, {
    kind: options.kind,
    centerPoint,
    width: options.width,
    height: options.height,
    rotation: options.rotation,
  });
}

export function createQuickShapeFeature(options: {
  map: LeafletMap;
  centerLatLng: LatLng;
  style: DroMapFeatureStyle & { zoneShapeKind?: DroMapZoneShapeKind };
}): DroMapFeature {
  const kind = getQuickShapeKind(options.style);
  const width = getQuickShapeWidth(options.style);
  const height = getQuickShapeHeight(options.style);
  const rotation = getQuickShapeRotation(options.style);

  return createQuickShapeFeatureFromGeometry({
    geometry: createQuickShapePolygonFromMap({
      map: options.map,
      centerLatLng: options.centerLatLng,
      kind,
      width,
      height,
      rotation,
    }),
    kind,
    width,
    height,
    rotation,
    style: options.style,
  });
}

export function createQuickShapeFeatureFromPlacement(options: {
  map: LeafletMap;
  startLatLng: LatLng;
  endLatLng: LatLng;
  style: DroMapFeatureStyle & { zoneShapeKind?: DroMapZoneShapeKind };
}): DroMapFeature {
  const kind = getQuickShapeKind(options.style);
  const spec = getPlacementScreenSpec({
    map: options.map,
    startLatLng: options.startLatLng,
    endLatLng: options.endLatLng,
    kind,
  });

  return createQuickShapeFeatureFromGeometry({
    geometry: buildPolygonFromScreenSpec(options.map, {
      kind,
      ...spec,
    }),
    kind,
    width: spec.width,
    height: spec.height,
    rotation: spec.rotation,
    style: options.style,
  });
}

function createQuickShapeFeatureFromGeometry(options: {
  geometry: DroMapPolygon;
  kind: DroMapZoneShapeKind;
  width: number;
  height: number;
  rotation: number;
  style: DroMapFeatureStyle & { zoneShapeKind?: DroMapZoneShapeKind };
}): DroMapFeature {
  const rotation = options.kind === "circle" ? 0 : normalizeRotation(options.rotation);
  const width = clamp(options.width, MIN_QUICK_SHAPE_SIZE, MAX_QUICK_SHAPE_SIZE);
  const height = options.kind === "circle"
    ? width
    : clamp(options.height, MIN_QUICK_SHAPE_SIZE, MAX_QUICK_SHAPE_SIZE);

  return {
    type: "Feature",
    id: crypto.randomUUID(),
    geometry: options.geometry,
    properties: {
      type: "zone",
      label: getShapeLabel(options.kind),
      legendLabel: "Zone",
      style: {
        ...options.style,
        zoneShapeWidth: width,
        zoneShapeHeight: height,
        zoneShapeRotation: rotation,
      },
      zoneVariant: "shape",
      zoneShapeKind: options.kind,
      meta: { version: 1 },
    },
  };
}

export function resizeQuickShapeFeature(
  feature: DroMapFeature,
  nextSize: { width?: number; height?: number },
): DroMapFeature {
  if (!isQuickShapeZoneFeature(feature)) {
    return feature;
  }

  const kind = getQuickShapeKind(feature);
  const currentWidth = getQuickShapeWidth(feature);
  const currentHeight = getQuickShapeHeight(feature);
  const nextWidth = clamp(nextSize.width ?? currentWidth, MIN_QUICK_SHAPE_SIZE, MAX_QUICK_SHAPE_SIZE);
  const nextHeight = kind === "circle"
    ? nextWidth
    : clamp(nextSize.height ?? currentHeight, MIN_QUICK_SHAPE_SIZE, MAX_QUICK_SHAPE_SIZE);
  const scaleX = nextWidth / currentWidth;
  const scaleY = nextHeight / currentHeight;
  const rotation = getQuickShapeRotation(feature);
  const coordinates = getOpenRing(feature);
  const center = getCoordinateCenter(coordinates);
  const nextCoordinates = coordinates.map(([lng, lat]): Coordinate => {
    const local = rotatePoint({ x: lng - center[0], y: lat - center[1] }, -rotation);
    const scaled = { x: local.x * scaleX, y: local.y * scaleY };
    const rotated = rotatePoint(scaled, rotation);

    return [center[0] + rotated.x, center[1] + rotated.y];
  });

  return {
    ...feature,
    geometry: {
      type: "Polygon",
      coordinates: [getClosedRing(nextCoordinates)],
    },
    properties: {
      ...feature.properties,
      style: {
        ...(feature.properties.style ?? {}),
        zoneShapeWidth: nextWidth,
        zoneShapeHeight: nextHeight,
        zoneShapeRotation: kind === "circle" ? 0 : rotation,
      },
    },
  };
}

export function resizeQuickShapeFeatureFromMapPointer(options: {
  map: LeafletMap;
  feature: DroMapFeature;
  handle: QuickShapeResizeHandle;
  pointerPoint: Point;
}): DroMapFeature {
  const { feature, map, pointerPoint } = options;

  if (!isQuickShapeZoneFeature(feature)) {
    return feature;
  }

  const kind = getQuickShapeKind(feature);
  const metrics = getScreenMetrics(map, feature);

  if (!metrics) {
    return feature;
  }

  let centerPoint = metrics.centerPoint;
  let width = metrics.width;
  let height = metrics.height;
  const rotation = kind === "circle" ? 0 : metrics.rotation;

  if (kind === "circle") {
    const radius = clamp(
      Math.hypot(pointerPoint.x - centerPoint.x, pointerPoint.y - centerPoint.y),
      MIN_QUICK_SHAPE_SIZE / 2,
      MAX_QUICK_SHAPE_SIZE / 2,
    );
    width = radius * 2;
    height = width;
  } else if (kind === "ellipse") {
    const localPointer = rotatePoint(
      {
        x: pointerPoint.x - centerPoint.x,
        y: pointerPoint.y - centerPoint.y,
      },
      -rotation,
    );

    width = clamp(Math.abs(localPointer.x) * OPPOSITE_ELLIPSE_POINT_RATIO * 2, MIN_QUICK_SHAPE_SIZE, MAX_QUICK_SHAPE_SIZE);
    height = clamp(Math.abs(localPointer.y) * OPPOSITE_ELLIPSE_POINT_RATIO * 2, MIN_QUICK_SHAPE_SIZE, MAX_QUICK_SHAPE_SIZE);
  } else {
    const signs: Record<QuickShapeRectangleResizeHandle, { x: number; y: number }> = {
      nw: { x: -1, y: -1 },
      ne: { x: 1, y: -1 },
      se: { x: 1, y: 1 },
      sw: { x: -1, y: 1 },
    };
    const handle = options.handle === "ellipse" || options.handle === "circle"
      ? "se"
      : options.handle;
    const sign = signs[handle];
    const fixedLocal = {
      x: -sign.x * metrics.width / 2,
      y: -sign.y * metrics.height / 2,
    };
    const localPointer = rotatePoint(
      {
        x: pointerPoint.x - metrics.centerPoint.x,
        y: pointerPoint.y - metrics.centerPoint.y,
      },
      -rotation,
    );
    width = clamp(Math.abs(localPointer.x - fixedLocal.x), MIN_QUICK_SHAPE_SIZE, MAX_QUICK_SHAPE_SIZE);
    height = clamp(Math.abs(localPointer.y - fixedLocal.y), MIN_QUICK_SHAPE_SIZE, MAX_QUICK_SHAPE_SIZE);
    const targetLocal = {
      x: fixedLocal.x + sign.x * width,
      y: fixedLocal.y + sign.y * height,
    };
    const nextCenterLocal = {
      x: (fixedLocal.x + targetLocal.x) / 2,
      y: (fixedLocal.y + targetLocal.y) / 2,
    };
    const nextCenterOffset = rotatePoint(nextCenterLocal, rotation);

    centerPoint = {
      x: metrics.centerPoint.x + nextCenterOffset.x,
      y: metrics.centerPoint.y + nextCenterOffset.y,
    };
  }

  return {
    ...feature,
    geometry: buildPolygonFromScreenSpec(map, {
      kind,
      centerPoint,
      width,
      height,
      rotation,
    }),
    properties: {
      ...feature.properties,
      style: {
        ...(feature.properties.style ?? {}),
        zoneShapeWidth: width,
        zoneShapeHeight: kind === "circle" ? width : height,
        zoneShapeRotation: kind === "circle" ? 0 : rotation,
      },
    },
  };
}

export function rotateQuickShapeFeature(options: {
  map: LeafletMap;
  feature: DroMapFeature;
  rotation: number;
  metrics?: {
    centerPoint: Point;
    width: number;
    height: number;
  };
}): DroMapFeature {
  const { map, feature } = options;

  if (!isQuickShapeZoneFeature(feature)) {
    return feature;
  }

  const kind = getQuickShapeKind(feature);

  if (kind === "circle") {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        style: {
          ...(feature.properties.style ?? {}),
          zoneShapeRotation: 0,
        },
      },
    };
  }

  const nextRotation = normalizeRotation(options.rotation);
  const currentMetrics = options.metrics ?? getScreenMetrics(map, feature);

  if (!currentMetrics) {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        style: {
          ...(feature.properties.style ?? {}),
          zoneShapeRotation: nextRotation,
        },
      },
    };
  }

  const width = clamp(
    currentMetrics.width,
    MIN_QUICK_SHAPE_SIZE,
    MAX_QUICK_SHAPE_SIZE,
  );
  const height = clamp(
    currentMetrics.height,
    MIN_QUICK_SHAPE_SIZE,
    MAX_QUICK_SHAPE_SIZE,
  );

  return {
    ...feature,
    geometry: buildPolygonFromScreenSpec(map, {
      kind,
      centerPoint: currentMetrics.centerPoint,
      width,
      height,
      rotation: nextRotation,
    }),
    properties: {
      ...feature.properties,
      style: {
        ...(feature.properties.style ?? {}),
        zoneShapeWidth: width,
        zoneShapeHeight: height,
        zoneShapeRotation: nextRotation,
      },
    },
  };
}

export function changeQuickShapeKind(
  feature: DroMapFeature,
  kind: DroMapZoneShapeKind,
): DroMapFeature {
  if (!isQuickShapeZoneFeature(feature)) {
    return feature;
  }

  const currentKind = getQuickShapeKind(feature);
  const rotation = kind === "circle" ? 0 : getQuickShapeRotation(feature);
  const bounds = getLocalGeoBounds(feature, currentKind === "circle" ? 0 : getQuickShapeRotation(feature));
  const maxHalfSize = Math.max(bounds.halfWidth, bounds.halfHeight);
  const halfWidth = kind === "circle" ? maxHalfSize : bounds.halfWidth;
  const halfHeight = kind === "circle" ? maxHalfSize : bounds.halfHeight;
  const width = clamp(halfWidth * 2, MIN_QUICK_SHAPE_SIZE, MAX_QUICK_SHAPE_SIZE);
  const height = kind === "circle" ? width : clamp(halfHeight * 2, MIN_QUICK_SHAPE_SIZE, MAX_QUICK_SHAPE_SIZE);

  return {
    ...feature,
    geometry: buildGeometryFromGeoLocalExtents({
      center: bounds.center,
      kind,
      halfWidth,
      halfHeight,
      rotation,
    }),
    properties: {
      ...feature.properties,
      label: getShapeLabel(kind),
      zoneShapeKind: kind,
      style: {
        ...(feature.properties.style ?? {}),
        zoneShapeWidth: width,
        zoneShapeHeight: height,
        zoneShapeRotation: rotation,
      },
    },
  };
}

export function getQuickShapeCenterLatLng(feature: DroMapFeature): [number, number] | null {
  if (!isQuickShapeZoneFeature(feature)) {
    return null;
  }

  const coordinates = getOpenRing(feature);

  if (coordinates.length === 0) {
    return null;
  }

  const [lng, lat] = getCoordinateCenter(coordinates);
  return [lat, lng];
}
