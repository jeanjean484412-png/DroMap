import type { DroMapFeature } from "@/lib/dromap/feature";

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletLayer = import("leaflet").Layer;
type LeafletPolygon = import("leaflet").Polygon;
type LeafletPolyline = import("leaflet").Polyline;
type LeafletPathOptions = import("leaflet").PathOptions;

type CanvasPoint = {
  x: number;
  y: number;
};

type LineCoordinate = [number, number];

type LineArrowPlacement = "start" | "end";

type LineArrowStyle = {
  color: string;
  opacity: number;
  weight: number;
};

const ARROW_VIEWBOX_SIZE = 32;
const ARROW_TIP_X = 28;
const ARROW_TIP_Y = 16;
const ARROW_HALF_WIDTH_RATIO = 0.42;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function isLineCoordinate(value: unknown): value is LineCoordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function coordinatesAreDifferent(a: LineCoordinate, b: LineCoordinate) {
  return a[0] !== b[0] || a[1] !== b[1];
}

function getLineCoordinates(feature: DroMapFeature): LineCoordinate[] {
  if (feature.geometry?.type !== "LineString") {
    return [];
  }

  const coordinates = feature.geometry.coordinates;

  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates.filter(isLineCoordinate);
}

function isFreehandLikeLineFeature(feature: DroMapFeature) {
  if (feature.properties?.type !== "line" || feature.geometry?.type !== "LineString") {
    return false;
  }

  if (feature.properties.lineVariant === "freehand") {
    return true;
  }

  if (feature.properties.label?.trim().toLowerCase() === "ligne libre") {
    return true;
  }

  return getLineCoordinates(feature).length > 24;
}

function getPointDistance(a: CanvasPoint, b: CanvasPoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return Math.sqrt(dx * dx + dy * dy);
}

function lerpPoint(a: CanvasPoint, b: CanvasPoint, ratio: number): CanvasPoint {
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
  };
}

function getPointAtDistanceFromStart(points: CanvasPoint[], distance: number) {
  if (points.length === 0) {
    return null;
  }

  if (points.length === 1 || distance <= 0) {
    return points[0];
  }

  let remainingDistance = distance;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const segmentLength = getPointDistance(previous, current);

    if (segmentLength <= 0) {
      continue;
    }

    if (remainingDistance <= segmentLength) {
      return lerpPoint(previous, current, remainingDistance / segmentLength);
    }

    remainingDistance -= segmentLength;
  }

  return points[points.length - 1];
}

function getPointAtDistanceFromEnd(points: CanvasPoint[], distance: number) {
  const reversed = [...points].reverse();

  return getPointAtDistanceFromStart(reversed, distance);
}

function trimPointsFromStart(points: CanvasPoint[], distance: number) {
  if (points.length < 2 || distance <= 0) {
    return [...points];
  }

  let remainingDistance = distance;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const segmentLength = getPointDistance(previous, current);

    if (segmentLength <= 0) {
      continue;
    }

    if (remainingDistance <= segmentLength) {
      const basePoint = lerpPoint(
        previous,
        current,
        remainingDistance / segmentLength,
      );

      return [basePoint, ...points.slice(index)];
    }

    remainingDistance -= segmentLength;
  }

  return [points[points.length - 1]];
}

function trimPointsFromEnd(points: CanvasPoint[], distance: number) {
  if (points.length < 2 || distance <= 0) {
    return [...points];
  }

  const reversed = trimPointsFromStart([...points].reverse(), distance);

  return reversed.reverse();
}

function getUnitVectors(tipPoint: CanvasPoint, adjacentPoint: CanvasPoint) {
  const dx = tipPoint.x - adjacentPoint.x;
  const dy = tipPoint.y - adjacentPoint.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length <= 0) {
    return null;
  }

  const ux = dx / length;
  const uy = dy / length;

  return {
    ux,
    uy,
    px: -uy,
    py: ux,
  };
}

function pointFromTip(
  tip: CanvasPoint,
  vectors: { ux: number; uy: number; px: number; py: number },
  backwardDistance: number,
  perpendicularDistance = 0,
): CanvasPoint {
  return {
    x:
      tip.x -
      vectors.ux * backwardDistance +
      vectors.px * perpendicularDistance,
    y:
      tip.y -
      vectors.uy * backwardDistance +
      vectors.py * perpendicularDistance,
  };
}

function getArrowCanvasPoints(
  tipPoint: CanvasPoint,
  adjacentPoint: CanvasPoint,
  size: number,
): CanvasPoint[] | null {
  const vectors = getUnitVectors(tipPoint, adjacentPoint);

  if (!vectors) {
    return null;
  }

  const halfWidth = size * ARROW_HALF_WIDTH_RATIO;

  return [
    tipPoint,
    pointFromTip(tipPoint, vectors, size, halfWidth),
    pointFromTip(tipPoint, vectors, size, -halfWidth),
  ];
}

export function featureHasArrowStart(feature: DroMapFeature) {
  return (
    feature.properties?.type === "line" &&
    feature.geometry?.type === "LineString" &&
    feature.properties?.style?.arrowStart === true
  );
}

export function featureHasArrowEnd(feature: DroMapFeature) {
  return (
    feature.properties?.type === "line" &&
    feature.geometry?.type === "LineString" &&
    feature.properties?.style?.arrowEnd === true
  );
}

export function featureHasLineArrow(feature: DroMapFeature) {
  return featureHasArrowStart(feature) || featureHasArrowEnd(feature);
}

export function getLineArrowSegment(
  feature: DroMapFeature,
  placement: LineArrowPlacement,
): {
  adjacent: LineCoordinate;
  tip: LineCoordinate;
} | null {
  if (!featureHasLineArrow(feature)) {
    return null;
  }

  const coordinates = getLineCoordinates(feature);

  if (coordinates.length < 2) {
    return null;
  }

  if (placement === "start") {
    if (!featureHasArrowStart(feature)) {
      return null;
    }

    const tip = coordinates[0];
    const adjacent = coordinates.find((coordinate, index) => {
      if (index === 0) {
        return false;
      }

      return coordinatesAreDifferent(coordinate, tip);
    });

    if (!adjacent) {
      return null;
    }

    return { adjacent, tip };
  }

  if (!featureHasArrowEnd(feature)) {
    return null;
  }

  const tip = coordinates[coordinates.length - 1];
  const adjacent = [...coordinates].reverse().find((coordinate, index) => {
    if (index === 0) {
      return false;
    }

    return coordinatesAreDifferent(coordinate, tip);
  });

  if (!adjacent) {
    return null;
  }

  return { adjacent, tip };
}

export function getLineArrowEndSegment(feature: DroMapFeature): {
  previous: LineCoordinate;
  end: LineCoordinate;
} | null {
  const segment = getLineArrowSegment(feature, "end");

  if (!segment) {
    return null;
  }

  return {
    previous: segment.adjacent,
    end: segment.tip,
  };
}

export function getLineArrowStartSegment(feature: DroMapFeature): {
  next: LineCoordinate;
  start: LineCoordinate;
} | null {
  const segment = getLineArrowSegment(feature, "start");

  if (!segment) {
    return null;
  }

  return {
    next: segment.adjacent,
    start: segment.tip,
  };
}

export function getLineArrowStyle(feature: DroMapFeature): LineArrowStyle {
  const style = feature.properties?.style ?? {};
  const rawOpacity = style.opacity ?? 1;

  const safeOpacity =
    featureHasLineArrow(feature) && rawOpacity <= 0.05 ? 1 : rawOpacity;

  return {
    color: style.color ?? "#334155",
    opacity: clamp(safeOpacity, 0, 1),
    weight: clamp(style.weight ?? 3, 1, 20),
  };
}

export function getLineArrowSize(feature: DroMapFeature, graphicScale = 1) {
  const style = getLineArrowStyle(feature);
  const baseSize = 14 + style.weight * 3.2;

  return clamp(baseSize * graphicScale, 18 * graphicScale, 72 * graphicScale);
}

function getLineArrowDashStyle(feature: DroMapFeature) {
  return feature.properties?.style?.dashStyle ?? "solid";
}

export function getLineArrowBodyLineCap(feature: DroMapFeature): "butt" | "round" {
  // Pour les lignes droites pleines avec flèche, la coupe nette évite
  // que le trait reste visible sous la tête quand l'opacité baisse.
  // Pour le dessin libre, on garde un cap rond : une coupe butt sur une
  // courbe donne une rupture anguleuse et place mal la jonction.
  if (isFreehandLikeLineFeature(feature)) {
    return "round";
  }

  return getLineArrowDashStyle(feature) === "solid" ? "butt" : "round";
}

export function getLineArrowBackDistance(
  feature: DroMapFeature,
  graphicScale = 1,
  options: { size?: number } = {},
) {
  const style = getLineArrowStyle(feature);
  const size = options.size ?? getLineArrowSize(feature, graphicScale);
  const strokeWidth = style.weight * graphicScale;

  if (getLineArrowBodyLineCap(feature) === "butt") {
    return size;
  }

  // Avec lineCap round, le trait dépasse d'une demi-épaisseur.
  // On coupe donc le corps plus tôt pour que l'arrondi arrive juste
  // au niveau de la base de la flèche, sans transparence superposée.
  return size + strokeWidth * 0.52;
}

function getLineArrowOrientationDistance(
  feature: DroMapFeature,
  graphicScale = 1,
) {
  const arrowSize = getLineArrowSize(feature, graphicScale);
  const style = getLineArrowStyle(feature);

  return Math.max(
    arrowSize * 0.9,
    style.weight * graphicScale * 4,
    22 * graphicScale,
  );
}

export function getLineArrowBasePoint(
  feature: DroMapFeature,
  tipPoint: CanvasPoint,
  adjacentPoint: CanvasPoint,
  graphicScale = 1,
  options: { size?: number } = {},
): CanvasPoint {
  if (!featureHasLineArrow(feature)) {
    return tipPoint;
  }

  const distanceFromTip = getLineArrowBackDistance(
    feature,
    graphicScale,
    options,
  );
  const segmentLength = getPointDistance(tipPoint, adjacentPoint);

  if (segmentLength <= 0) {
    return tipPoint;
  }

  const safeDistance = Math.min(distanceFromTip, segmentLength * 0.82);
  const ratio = safeDistance / segmentLength;

  return {
    x: tipPoint.x + (adjacentPoint.x - tipPoint.x) * ratio,
    y: tipPoint.y + (adjacentPoint.y - tipPoint.y) * ratio,
  };
}

export function getLineArrowCanvasReferencePoints(
  feature: DroMapFeature,
  points: CanvasPoint[],
  placement: LineArrowPlacement,
  graphicScale = 1,
): {
  tipPoint: CanvasPoint;
  adjacentPoint: CanvasPoint;
  basePoint: CanvasPoint;
} | null {
  if (points.length < 2) {
    return null;
  }

  if (placement === "start" && !featureHasArrowStart(feature)) {
    return null;
  }

  if (placement === "end" && !featureHasArrowEnd(feature)) {
    return null;
  }

  const backDistance = getLineArrowBackDistance(feature, graphicScale);

  // Les lignes classiques doivent garder l'orientation du segment final réel.
  // Les dessins libres, eux, ont souvent un dernier micro-segment tremblant :
  // on utilise donc une distance moyenne le long de la courbe.
  if (!isFreehandLikeLineFeature(feature)) {
    const tipPoint = placement === "start" ? points[0] : points[points.length - 1];
    const adjacentPoint =
      placement === "start" ? points[1] : points[points.length - 2];
    const basePoint = getLineArrowBasePoint(
      feature,
      tipPoint,
      adjacentPoint,
      graphicScale,
    );

    if (getPointDistance(tipPoint, adjacentPoint) <= 0) {
      return null;
    }

    return { tipPoint, adjacentPoint, basePoint };
  }

  const orientationDistance = getLineArrowOrientationDistance(
    feature,
    graphicScale,
  );

  if (placement === "start") {
    const tipPoint = points[0];
    const adjacentPoint = getPointAtDistanceFromStart(
      points,
      orientationDistance,
    );
    const basePoint = getPointAtDistanceFromStart(points, backDistance);

    if (
      !adjacentPoint ||
      !basePoint ||
      getPointDistance(tipPoint, adjacentPoint) <= 0
    ) {
      return null;
    }

    return { tipPoint, adjacentPoint, basePoint };
  }

  const tipPoint = points[points.length - 1];
  const adjacentPoint = getPointAtDistanceFromEnd(points, orientationDistance);
  const basePoint = getPointAtDistanceFromEnd(points, backDistance);

  if (
    !adjacentPoint ||
    !basePoint ||
    getPointDistance(tipPoint, adjacentPoint) <= 0
  ) {
    return null;
  }

  return { tipPoint, adjacentPoint, basePoint };
}

export function getLineVisibleCanvasPoints(
  feature: DroMapFeature,
  points: CanvasPoint[],
  graphicScale = 1,
): CanvasPoint[] {
  if (!featureHasLineArrow(feature) || points.length < 2) {
    return [...points];
  }

  let visiblePoints = [...points];

  if (featureHasArrowStart(feature)) {
    const reference = getLineArrowCanvasReferencePoints(
      feature,
      visiblePoints,
      "start",
      graphicScale,
    );

    if (reference) {
      if (isFreehandLikeLineFeature(feature)) {
        visiblePoints = trimPointsFromStart(
          visiblePoints,
          getLineArrowBackDistance(feature, graphicScale),
        );
      } else {
        visiblePoints[0] = reference.basePoint;
      }
    }
  }

  if (featureHasArrowEnd(feature)) {
    const reference = getLineArrowCanvasReferencePoints(
      feature,
      visiblePoints,
      "end",
      graphicScale,
    );

    if (reference) {
      if (isFreehandLikeLineFeature(feature)) {
        visiblePoints = trimPointsFromEnd(
          visiblePoints,
          getLineArrowBackDistance(feature, graphicScale),
        );
      } else {
        visiblePoints[visiblePoints.length - 1] = reference.basePoint;
      }
    }
  }

  return visiblePoints.length >= 2 ? visiblePoints : [...points];
}

export function getLineArrowSvgHtml(
  feature: DroMapFeature,
  options: { size?: number; angleDeg?: number } = {},
) {
  const style = getLineArrowStyle(feature);
  const size = options.size ?? getLineArrowSize(feature);
  const angleDeg = options.angleDeg ?? 0;

  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:${size}px;
        height:${size}px;
        line-height:0;
        opacity:${style.opacity};
        pointer-events:none;
        overflow:visible;
      "
    >
      <svg
        width="${size}"
        height="${size}"
        viewBox="0 0 ${ARROW_VIEWBOX_SIZE} ${ARROW_VIEWBOX_SIZE}"
        aria-hidden="true"
        focusable="false"
        style="display:block;overflow:visible;"
      >
        <path
          d="M28 16 L7 5 L7 27 Z"
          fill="${style.color}"
          transform="rotate(${angleDeg} ${ARROW_TIP_X} ${ARROW_TIP_Y})"
        />
      </svg>
    </span>
  `;
}

export function createLineArrowLeafletIcon(
  feature: DroMapFeature,
  angleDeg: number,
  leaflet: LeafletModule,
) {
  const size = getLineArrowSize(feature);
  const tipX = (ARROW_TIP_X / ARROW_VIEWBOX_SIZE) * size;
  const tipY = (ARROW_TIP_Y / ARROW_VIEWBOX_SIZE) * size;

  return leaflet.divIcon({
    className: "dromap-line-arrow-icon",
    iconSize: [size, size],
    iconAnchor: [tipX, tipY],
    html: getLineArrowSvgHtml(feature, { size, angleDeg }),
  });
}

function getLayerPointsFromFeature(
  feature: DroMapFeature,
  map: LeafletMap,
  leaflet: LeafletModule,
) {
  return getLineCoordinates(feature).map((coordinate) => {
    const latLng = leaflet.latLng(coordinate[1], coordinate[0]);
    const point = map.latLngToLayerPoint(latLng);

    return { latLng, point: { x: point.x, y: point.y } };
  });
}

export function createLineArrowBodyLeafletLayer(
  feature: DroMapFeature,
  map: LeafletMap,
  leaflet: LeafletModule,
  pathOptions: LeafletPathOptions,
): LeafletPolyline | null {
  if (!featureHasLineArrow(feature) || feature.geometry.type !== "LineString") {
    return null;
  }

  const projectedPoints = getLayerPointsFromFeature(feature, map, leaflet);

  if (projectedPoints.length < 2) {
    return null;
  }

  const visiblePoints = getLineVisibleCanvasPoints(
    feature,
    projectedPoints.map((point) => point.point),
  );

  if (visiblePoints.length < 2) {
    return null;
  }

  const bodyLatLngs = visiblePoints.map((point) =>
    map.layerPointToLatLng(leaflet.point(point.x, point.y)),
  );

  return leaflet.polyline(bodyLatLngs, {
    ...pathOptions,
    opacity: getLineArrowStyle(feature).opacity,
    lineCap: getLineArrowBodyLineCap(feature),
    interactive: false,
    bubblingMouseEvents: false,
  });
}

function createSingleLineArrowHeadLeafletLayer(
  feature: DroMapFeature,
  placement: LineArrowPlacement,
  map: LeafletMap,
  leaflet: LeafletModule,
  paneName?: string,
): LeafletPolygon | null {
  const projectedPoints = getLayerPointsFromFeature(feature, map, leaflet);
  const referencePoints = getLineArrowCanvasReferencePoints(
    feature,
    projectedPoints.map((point) => point.point),
    placement,
  );

  if (!referencePoints) {
    return null;
  }

  const size = getLineArrowSize(feature);
  const arrowPoints = getArrowCanvasPoints(
    referencePoints.tipPoint,
    referencePoints.adjacentPoint,
    size,
  );

  if (!arrowPoints) {
    return null;
  }

  const latLngs = arrowPoints.map((point) =>
    map.layerPointToLatLng(leaflet.point(point.x, point.y)),
  );
  const style = getLineArrowStyle(feature);

  return leaflet.polygon(latLngs, {
    stroke: false,
    color: style.color,
    opacity: style.opacity,
    fillColor: style.color,
    fillOpacity: style.opacity,
    interactive: false,
    bubblingMouseEvents: false,
    className: `dromap-line-arrow-head dromap-line-arrow-head-${placement}`,
    ...(paneName ? { pane: paneName } : {}),
  });
}

export function createLineArrowLeafletLayer(
  feature: DroMapFeature,
  map: LeafletMap,
  leaflet: LeafletModule,
  paneName?: string,
): LeafletLayer | null {
  if (!featureHasLineArrow(feature)) {
    return null;
  }

  const layers: LeafletPolygon[] = [];
  const startArrowLayer = createSingleLineArrowHeadLeafletLayer(
    feature,
    "start",
    map,
    leaflet,
    paneName,
  );
  const endArrowLayer = createSingleLineArrowHeadLeafletLayer(
    feature,
    "end",
    map,
    leaflet,
    paneName,
  );

  if (startArrowLayer) {
    layers.push(startArrowLayer);
  }

  if (endArrowLayer) {
    layers.push(endArrowLayer);
  }

  if (layers.length === 0) {
    return null;
  }

  if (layers.length === 1) {
    return layers[0];
  }

  return leaflet.featureGroup(layers);
}

function drawSingleLineArrowOnCanvas(
  ctx: CanvasRenderingContext2D,
  feature: DroMapFeature,
  tipPoint: CanvasPoint,
  adjacentPoint: CanvasPoint,
  graphicScale = 1,
  options: { size?: number } = {},
) {
  const style = getLineArrowStyle(feature);
  const size = options.size ?? getLineArrowSize(feature, graphicScale);
  const arrowPoints = getArrowCanvasPoints(tipPoint, adjacentPoint, size);

  if (!arrowPoints) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = style.opacity;
  ctx.fillStyle = style.color;
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(arrowPoints[0].x, arrowPoints[0].y);

  for (const point of arrowPoints.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }

  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function drawLineArrowOnCanvas(
  ctx: CanvasRenderingContext2D,
  feature: DroMapFeature,
  endPoint: CanvasPoint,
  previousPoint: CanvasPoint,
  graphicScale = 1,
  options: {
    size?: number;
    startPoint?: CanvasPoint;
    nextPoint?: CanvasPoint;
    points?: CanvasPoint[];
  } = {},
) {
  const points = options.points;

  if (points && points.length >= 2) {
    const startReference = getLineArrowCanvasReferencePoints(
      feature,
      points,
      "start",
      graphicScale,
    );
    const endReference = getLineArrowCanvasReferencePoints(
      feature,
      points,
      "end",
      graphicScale,
    );

    if (startReference) {
      drawSingleLineArrowOnCanvas(
        ctx,
        feature,
        startReference.tipPoint,
        startReference.adjacentPoint,
        graphicScale,
        options,
      );
    }

    if (endReference) {
      drawSingleLineArrowOnCanvas(
        ctx,
        feature,
        endReference.tipPoint,
        endReference.adjacentPoint,
        graphicScale,
        options,
      );
    }

    return;
  }

  if (
    featureHasArrowStart(feature) &&
    options.startPoint &&
    options.nextPoint
  ) {
    drawSingleLineArrowOnCanvas(
      ctx,
      feature,
      options.startPoint,
      options.nextPoint,
      graphicScale,
      options,
    );
  }

  if (featureHasArrowEnd(feature)) {
    drawSingleLineArrowOnCanvas(
      ctx,
      feature,
      endPoint,
      previousPoint,
      graphicScale,
      options,
    );
  }
}
