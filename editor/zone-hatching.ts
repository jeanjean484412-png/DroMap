import L from "leaflet";

import type {
  DroMapFeature,
  DroMapZoneHatchingStyle,
} from "@/lib/dromap/feature";
import {
  getZoneDotsColor,
  getZoneDotsEnabled,
  getZoneDotsRadius,
  getZoneDotsSpacing,
  getZoneHatchingColor,
  getZoneHatchingEnabled,
  getZoneHatchingSpacing,
  getZoneHatchingStyle,
  getZoneHatchingWeight,
} from "./zone-style";

export type Point2D = {
  x: number;
  y: number;
};

export type HatchSegment = [Point2D, Point2D];
export type HatchDot = Point2D;

type HatchLineLayer = L.Polyline & {
  dromapHatchOwnerId?: string;
};

type HatchSvgLayer = L.Layer & {
  dromapHatchOwnerId?: string;
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tagName: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NAMESPACE, tagName);
}

function getDirectionForHatching(style: DroMapZoneHatchingStyle): Point2D {
  switch (style) {
    case "horizontal":
      return { x: 1, y: 0 };
    case "vertical":
      return { x: 0, y: 1 };
    case "diagonal-left":
      return { x: 1, y: 1 };
    case "diagonal-right":
      return { x: 1, y: -1 };
    default:
      return { x: 1, y: -1 };
  }
}

function normalizeVector(vector: Point2D): Point2D {
  const length = Math.hypot(vector.x, vector.y);

  if (length <= 0) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function dot(first: Point2D, second: Point2D) {
  return first.x * second.x + first.y * second.y;
}

function getPointAtSignedDistanceOnNormal(
  normal: Point2D,
  signedDistance: number,
): Point2D {
  return {
    x: normal.x * signedDistance,
    y: normal.y * signedDistance,
  };
}

function getSignedDistance(point: Point2D, normal: Point2D, offset: number) {
  return dot(point, normal) - offset;
}

function dedupeIntersections(intersections: { t: number; point: Point2D }[]) {
  const sorted = [...intersections].sort((a, b) => a.t - b.t);
  const deduped: { t: number; point: Point2D }[] = [];

  for (const item of sorted) {
    const previous = deduped[deduped.length - 1];

    if (!previous || Math.abs(previous.t - item.t) > 0.75) {
      deduped.push(item);
    }
  }

  return deduped;
}

function getPolygonIntersectionsWithLine(
  ring: Point2D[],
  direction: Point2D,
  normal: Point2D,
  offset: number,
) {
  const intersections: { t: number; point: Point2D }[] = [];

  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];

    if (!start || !end) {
      continue;
    }

    const startDistance = getSignedDistance(start, normal, offset);
    const endDistance = getSignedDistance(end, normal, offset);

    if (Math.abs(startDistance) < 0.001 && Math.abs(endDistance) < 0.001) {
      intersections.push({ t: dot(start, direction), point: start });
      intersections.push({ t: dot(end, direction), point: end });
      continue;
    }

    if (Math.abs(startDistance) < 0.001) {
      intersections.push({ t: dot(start, direction), point: start });
      continue;
    }

    if (Math.abs(endDistance) < 0.001) {
      intersections.push({ t: dot(end, direction), point: end });
      continue;
    }

    if (startDistance * endDistance > 0) {
      continue;
    }

    const ratio = startDistance / (startDistance - endDistance);

    if (ratio < 0 || ratio > 1) {
      continue;
    }

    const point = {
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    };

    intersections.push({ t: dot(point, direction), point });
  }

  return dedupeIntersections(intersections);
}

export function createHatchSegmentsForRing(
  ring: Point2D[],
  options: {
    style: DroMapZoneHatchingStyle;
    spacing: number;
    margin?: number;
  },
): HatchSegment[] {
  if (ring.length < 3 || options.style === "none") {
    return [];
  }

  const direction = normalizeVector(getDirectionForHatching(options.style));
  const normal = normalizeVector({ x: -direction.y, y: direction.x });
  const spacing = Math.max(2, options.spacing);
  const margin = Math.max(0, options.margin ?? spacing * 2);
  const signedDistances = ring.map((point) => dot(point, normal));
  const minDistance = Math.min(...signedDistances) - margin;
  const maxDistance = Math.max(...signedDistances) + margin;
  const firstOffset = Math.floor(minDistance / spacing) * spacing;
  const segments: HatchSegment[] = [];

  for (let offset = firstOffset; offset <= maxDistance; offset += spacing) {
    const intersections = getPolygonIntersectionsWithLine(
      ring,
      direction,
      normal,
      offset,
    );

    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const start = intersections[index];
      const end = intersections[index + 1];

      if (!start || !end || Math.abs(end.t - start.t) < 2) {
        continue;
      }

      const lineOrigin = getPointAtSignedDistanceOnNormal(normal, offset);

      segments.push([
        {
          x: lineOrigin.x + direction.x * start.t,
          y: lineOrigin.y + direction.y * start.t,
        },
        {
          x: lineOrigin.x + direction.x * end.t,
          y: lineOrigin.y + direction.y * end.t,
        },
      ]);
    }
  }

  return segments;
}

export function createHatchDotsForRing(
  ring: Point2D[],
  options: {
    spacing: number;
    radius?: number;
    margin?: number;
    origin?: Point2D;
  },
): HatchDot[] {
  if (ring.length < 3) {
    return [];
  }

  const spacing = Math.max(4, options.spacing);
  const radius = Math.max(0, options.radius ?? 0);
  const margin = Math.max(radius, options.margin ?? radius);

  // Les points doivent former une grille globale, pas une grille recalée sur la
  // boîte de chaque zone. Sinon deux zones qui se chevauchent peuvent générer
  // deux trames décalées dans l'intersection, ce qui crée visuellement un
  // surplus de points dans l'éditeur et dans la prévisualisation Leaflet.
  const origin = options.origin ?? { x: 0, y: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of ring) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const dots: HatchDot[] = [];
  const firstRowIndex = Math.floor((minY - margin - origin.y) / spacing) - 1;
  const lastRowIndex = Math.ceil((maxY + margin - origin.y) / spacing) + 1;

  for (let rowIndex = firstRowIndex; rowIndex <= lastRowIndex; rowIndex += 1) {
    const y = origin.y + rowIndex * spacing;
    const normalizedRowParity = ((rowIndex % 2) + 2) % 2;
    const rowOffset = normalizedRowParity === 0 ? 0 : spacing / 2;
    const rowOriginX = origin.x + rowOffset;
    const firstColumnIndex =
      Math.floor((minX - margin - rowOriginX) / spacing) - 1;
    const lastColumnIndex =
      Math.ceil((maxX + margin - rowOriginX) / spacing) + 1;

    for (
      let columnIndex = firstColumnIndex;
      columnIndex <= lastColumnIndex;
      columnIndex += 1
    ) {
      dots.push({
        x: rowOriginX + columnIndex * spacing,
        y,
      });
    }
  }

  return dots;
}

function getOuterRing(feature: DroMapFeature) {
  if (feature.geometry.type !== "Polygon") {
    return [];
  }

  const ring = feature.geometry.coordinates[0];

  if (!Array.isArray(ring)) {
    return [];
  }

  return ring.filter(
    (coordinate): coordinate is [number, number] =>
      Array.isArray(coordinate) &&
      typeof coordinate[0] === "number" &&
      typeof coordinate[1] === "number",
  );
}

function createClippedDotsSvgLayer(options: {
  feature: DroMapFeature;
  map: L.Map;
  leaflet: typeof L;
  layerRing: Point2D[];
  paneName?: string;
  interactive?: boolean;
  scale: number;
}) {
  const radius = getZoneDotsRadius(options.feature) * options.scale;
  const spacing = getZoneDotsSpacing(options.feature) * options.scale;
  const margin = Math.max(radius, 1);
  const dots = createHatchDotsForRing(options.layerRing, {
    spacing,
    radius,
    margin,
  });

  if (dots.length === 0) {
    return null;
  }

  const xValues = options.layerRing.map((point) => point.x);
  const yValues = options.layerRing.map((point) => point.y);
  const minX = Math.min(...xValues) - margin;
  const minY = Math.min(...yValues) - margin;
  const maxX = Math.max(...xValues) + margin;
  const maxY = Math.max(...yValues) + margin;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const clipId = `dromap-zone-dots-clip-${options.feature.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${Math.random().toString(36).slice(2)}`;
  const svg = createSvgElement("svg");

  svg.setAttribute("xmlns", SVG_NAMESPACE);
  svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.style.overflow = "hidden";
  svg.style.pointerEvents = options.interactive ? "auto" : "none";

  const defs = createSvgElement("defs");
  const clipPath = createSvgElement("clipPath");
  const polygon = createSvgElement("polygon");

  clipPath.setAttribute("id", clipId);
  polygon.setAttribute(
    "points",
    options.layerRing.map((point) => `${point.x},${point.y}`).join(" "),
  );
  clipPath.appendChild(polygon);
  defs.appendChild(clipPath);
  svg.appendChild(defs);

  const group = createSvgElement("g");
  group.setAttribute("clip-path", `url(#${clipId})`);
  group.setAttribute("fill", getZoneDotsColor(options.feature));
  group.setAttribute("opacity", String(Math.max(0, Math.min(1, options.feature.properties.style.opacity ?? 1))));

  for (const dot of dots) {
    const circle = createSvgElement("circle");
    circle.setAttribute("cx", String(dot.x));
    circle.setAttribute("cy", String(dot.y));
    circle.setAttribute("r", String(radius));
    group.appendChild(circle);
  }

  svg.appendChild(group);

  const topLeft = options.map.layerPointToLatLng(
    options.leaflet.point(minX, minY),
  );
  const bottomRight = options.map.layerPointToLatLng(
    options.leaflet.point(maxX, maxY),
  );
  const bounds = options.leaflet.latLngBounds(topLeft, bottomRight);
  const layer = options.leaflet.svgOverlay(svg, bounds, {
    interactive: options.interactive ?? false,
    bubblingMouseEvents: false,
    className: "dromap-zone-dots-overlay",
    ...(options.paneName ? { pane: options.paneName } : {}),
  } as L.ImageOverlayOptions & { bubblingMouseEvents: boolean }) as HatchSvgLayer;

  layer.dromapHatchOwnerId = options.feature.id;

  return layer;
}

export function createZoneHatchingLeafletLayer(
  feature: DroMapFeature,
  map: L.Map,
  leaflet: typeof L,
  paneName?: string,
  options: { interactive?: boolean; scale?: number } = {},
): L.FeatureGroup | null {
  const outerRing = getOuterRing(feature);

  if (outerRing.length < 3) {
    return null;
  }

  const scale = Number.isFinite(options.scale)
    ? Math.max(0.1, options.scale ?? 1)
    : 1;
  const layerRing = outerRing.map((coordinate) =>
    map.latLngToLayerPoint(leaflet.latLng(coordinate[1], coordinate[0])),
  );
  const group = leaflet.featureGroup();
  let hasContent = false;

  if (getZoneHatchingEnabled(feature)) {
    const segments = createHatchSegmentsForRing(layerRing, {
      style: getZoneHatchingStyle(feature),
      spacing: getZoneHatchingSpacing(feature) * scale,
    });
    const color = getZoneHatchingColor(feature);
    const weight = getZoneHatchingWeight(feature) * scale;

    for (const segment of segments) {
      const latLngs = segment.map((point) =>
        map.layerPointToLatLng(leaflet.point(point.x, point.y)),
      ) as [L.LatLng, L.LatLng];
      const line = leaflet.polyline(latLngs, {
        color,
        opacity: Math.max(0, Math.min(1, feature.properties.style.opacity ?? 1)),
        weight,
        lineCap: "butt",
        lineJoin: "miter",
        interactive: options.interactive ?? false,
        bubblingMouseEvents: false,
        pmIgnore: true,
        ...(paneName ? { pane: paneName } : {}),
      } as L.PolylineOptions & { pmIgnore: boolean }) as HatchLineLayer;

      line.dromapHatchOwnerId = feature.id;
      group.addLayer(line);
      hasContent = true;
    }
  }

  if (getZoneDotsEnabled(feature)) {
    const dotsLayer = createClippedDotsSvgLayer({
      feature,
      map,
      leaflet,
      layerRing,
      paneName,
      interactive: options.interactive,
      scale,
    });

    if (dotsLayer) {
      group.addLayer(dotsLayer);
      hasContent = true;
    }
  }

  return hasContent ? group : null;
}

export function drawZoneHatchingOnCanvas(
  ctx: CanvasRenderingContext2D,
  feature: DroMapFeature,
  rings: Point2D[][],
  options: { scale?: number } = {},
) {
  if (
    (!getZoneHatchingEnabled(feature) && !getZoneDotsEnabled(feature)) ||
    rings.length === 0
  ) {
    return;
  }

  const outerRing = rings[0];

  if (!outerRing || outerRing.length < 3) {
    return;
  }

  const scale = Number.isFinite(options.scale)
    ? Math.max(0.1, options.scale ?? 1)
    : 1;

  ctx.save();
  ctx.beginPath();

  for (const ring of rings) {
    if (ring.length < 3) {
      continue;
    }

    ctx.moveTo(ring[0].x, ring[0].y);

    for (const point of ring.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }

    ctx.closePath();
  }

  ctx.clip("evenodd");
  ctx.globalAlpha = Math.max(0, Math.min(1, feature.properties.style.opacity ?? 1));
  ctx.setLineDash([]);

  if (getZoneHatchingEnabled(feature)) {
    const segments = createHatchSegmentsForRing(outerRing, {
      style: getZoneHatchingStyle(feature),
      spacing: getZoneHatchingSpacing(feature) * scale,
    });

    if (segments.length > 0) {
      ctx.strokeStyle = getZoneHatchingColor(feature);
      ctx.lineWidth = getZoneHatchingWeight(feature) * scale;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";

      for (const [start, end] of segments) {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    }
  }

  if (getZoneDotsEnabled(feature)) {
    const radius = getZoneDotsRadius(feature) * scale;
    const dots = createHatchDotsForRing(outerRing, {
      spacing: getZoneDotsSpacing(feature) * scale,
      radius,
      margin: radius,
    });

    if (dots.length > 0) {
      ctx.fillStyle = getZoneDotsColor(feature);

      for (const point of dots) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}
