import L from "leaflet";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { getFeatureDashStyle } from "./feature-style";
import {
  getZoneStrokeEnabled,
  getZoneVisibleStrokeOpacity,
} from "./zone-style";

export type ZoneOutlinePoint = {
  x: number;
  y: number;
};

export type ZoneOutlineSegment = [ZoneOutlinePoint, ZoneOutlinePoint];

export const MIN_ALIGNED_ZONE_OUTLINE_DOT_SPACING = 7;
export const MAX_ALIGNED_ZONE_OUTLINE_DOT_SPACING = 22;
export const MIN_ALIGNED_ZONE_OUTLINE_DASH_LENGTH = 9;
export const MAX_ALIGNED_ZONE_OUTLINE_DASH_LENGTH = 34;
export const MIN_ALIGNED_ZONE_OUTLINE_DASH_GAP = 7;
export const MAX_ALIGNED_ZONE_OUTLINE_DASH_GAP = 28;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function pointsAreEqual(a: ZoneOutlinePoint, b: ZoneOutlinePoint) {
  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}

function getOpenRing(points: ZoneOutlinePoint[]) {
  if (points.length > 1 && pointsAreEqual(points[0], points[points.length - 1])) {
    return points.slice(0, -1);
  }

  return points;
}

function getPointAtDistance(
  start: ZoneOutlinePoint,
  end: ZoneOutlinePoint,
  distance: number,
): ZoneOutlinePoint {
  const length = Math.hypot(end.x - start.x, end.y - start.y);

  if (length <= 0) {
    return start;
  }

  const ratio = clamp(distance / length, 0, 1);

  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
}

function dedupePoints(points: ZoneOutlinePoint[]) {
  const seenKeys = new Set<string>();
  const dedupedPoints: ZoneOutlinePoint[] = [];

  for (const point of points) {
    const key = `${Math.round(point.x * 10) / 10}:${Math.round(point.y * 10) / 10}`;

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    dedupedPoints.push(point);
  }

  return dedupedPoints;
}

export function shouldUseAlignedZoneOutline(feature: DroMapFeature) {
  if (
    feature.properties?.type !== "zone" ||
    !getZoneStrokeEnabled(feature) ||
    getZoneVisibleStrokeOpacity(feature) <= 0 ||
    getFeatureDashStyle(feature) === "solid"
  ) {
    return false;
  }

  if (feature.properties.zoneVariant === "freehand") {
    return false;
  }

  if (
    feature.properties.zoneVariant === "shape" &&
    feature.properties.zoneShapeKind !== "rectangle"
  ) {
    return false;
  }

  return true;
}

export function getAlignedZoneOutlineDotSpacing(lineWidth: number) {
  return clamp(
    lineWidth * 3.2,
    MIN_ALIGNED_ZONE_OUTLINE_DOT_SPACING,
    MAX_ALIGNED_ZONE_OUTLINE_DOT_SPACING,
  );
}

export function getAlignedZoneOutlineDashLength(lineWidth: number) {
  return clamp(
    lineWidth * 4.2,
    MIN_ALIGNED_ZONE_OUTLINE_DASH_LENGTH,
    MAX_ALIGNED_ZONE_OUTLINE_DASH_LENGTH,
  );
}

export function getAlignedZoneOutlineDashGap(lineWidth: number) {
  return clamp(
    lineWidth * 2.5,
    MIN_ALIGNED_ZONE_OUTLINE_DASH_GAP,
    MAX_ALIGNED_ZONE_OUTLINE_DASH_GAP,
  );
}

export function createAlignedDottedZoneOutlinePoints(
  ring: ZoneOutlinePoint[],
  spacing: number,
) {
  const openRing = getOpenRing(ring);
  const points: ZoneOutlinePoint[] = [];

  if (openRing.length < 2) {
    return [];
  }

  for (let index = 0; index < openRing.length; index += 1) {
    const start = openRing[index];
    const end = openRing[(index + 1) % openRing.length];
    const length = Math.hypot(end.x - start.x, end.y - start.y);

    if (length <= 0) {
      continue;
    }

    const segmentCount = Math.max(1, Math.round(length / Math.max(1, spacing)));
    const adjustedSpacing = length / segmentCount;

    for (let dotIndex = 0; dotIndex <= segmentCount; dotIndex += 1) {
      points.push(getPointAtDistance(start, end, adjustedSpacing * dotIndex));
    }
  }

  return dedupePoints(points);
}

export function createAlignedDashedZoneOutlineSegments(
  ring: ZoneOutlinePoint[],
  dashLength: number,
  gapLength: number,
) {
  const openRing = getOpenRing(ring);
  const segments: ZoneOutlineSegment[] = [];

  if (openRing.length < 2) {
    return [];
  }

  for (let index = 0; index < openRing.length; index += 1) {
    const start = openRing[index];
    const end = openRing[(index + 1) % openRing.length];
    const length = Math.hypot(end.x - start.x, end.y - start.y);

    if (length <= 0) {
      continue;
    }

    if (length <= dashLength * 2 + gapLength) {
      segments.push([start, end]);
      continue;
    }

    let dashCount = Math.max(
      2,
      Math.floor((length + gapLength) / (dashLength + gapLength)),
    );

    while (dashCount > 1 && dashCount * dashLength > length) {
      dashCount -= 1;
    }

    if (dashCount <= 1) {
      segments.push([start, end]);
      continue;
    }

    const adjustedGap = (length - dashCount * dashLength) / (dashCount - 1);

    for (let dashIndex = 0; dashIndex < dashCount; dashIndex += 1) {
      const dashStartDistance = dashIndex * (dashLength + adjustedGap);
      const dashEndDistance = dashStartDistance + dashLength;

      segments.push([
        getPointAtDistance(start, end, dashStartDistance),
        getPointAtDistance(start, end, dashEndDistance),
      ]);
    }
  }

  return segments;
}

export function createAlignedZoneOutlineSvgParts(
  feature: DroMapFeature,
  ring: ZoneOutlinePoint[],
  lineWidth: number,
) {
  const dashStyle = getFeatureDashStyle(feature);

  if (dashStyle === "dotted") {
    return {
      dots: createAlignedDottedZoneOutlinePoints(
        ring,
        getAlignedZoneOutlineDotSpacing(lineWidth),
      ),
      segments: [] as ZoneOutlineSegment[],
    };
  }

  if (dashStyle === "dashed") {
    return {
      dots: [] as ZoneOutlinePoint[],
      segments: createAlignedDashedZoneOutlineSegments(
        ring,
        getAlignedZoneOutlineDashLength(lineWidth),
        getAlignedZoneOutlineDashGap(lineWidth),
      ),
    };
  }

  return {
    dots: [] as ZoneOutlinePoint[],
    segments: [] as ZoneOutlineSegment[],
  };
}

export function drawAlignedZoneOutlineOnCanvas(
  ctx: CanvasRenderingContext2D,
  feature: DroMapFeature,
  rings: ZoneOutlinePoint[][],
  options: {
    color: string;
    opacity: number;
    lineWidth: number;
  },
) {
  const dashStyle = getFeatureDashStyle(feature);

  if (dashStyle === "solid") {
    return false;
  }

  ctx.save();
  ctx.globalAlpha = clamp(options.opacity, 0, 1);
  ctx.strokeStyle = options.color;
  ctx.fillStyle = options.color;
  ctx.lineWidth = Math.max(0.5, options.lineWidth);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);

  for (const ring of rings) {
    if (ring.length < 2) {
      continue;
    }

    if (dashStyle === "dotted") {
      const radius = Math.max(1.2, options.lineWidth / 2);
      const dots = createAlignedDottedZoneOutlinePoints(
        ring,
        getAlignedZoneOutlineDotSpacing(options.lineWidth),
      );

      for (const dot of dots) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      continue;
    }

    const segments = createAlignedDashedZoneOutlineSegments(
      ring,
      getAlignedZoneOutlineDashLength(options.lineWidth),
      getAlignedZoneOutlineDashGap(options.lineWidth),
    );

    for (const [start, end] of segments) {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }

  ctx.restore();
  return true;
}

function getOuterRings(feature: DroMapFeature) {
  if (feature.geometry.type !== "Polygon") {
    return [];
  }

  return feature.geometry.coordinates
    .map((ring) =>
      ring.filter(
        (coordinate): coordinate is [number, number] =>
          Array.isArray(coordinate) &&
          typeof coordinate[0] === "number" &&
          typeof coordinate[1] === "number",
      ),
    )
    .filter((ring) => ring.length >= 3);
}

export function createAlignedZoneOutlineLeafletLayer(
  feature: DroMapFeature,
  map: L.Map,
  leaflet: typeof L,
  paneName?: string,
  options: { scale?: number; opacityFactor?: number } = {},
): L.FeatureGroup | null {
  if (!shouldUseAlignedZoneOutline(feature)) {
    return null;
  }

  const rings = getOuterRings(feature);

  if (rings.length === 0) {
    return null;
  }

  const scale = Number.isFinite(options.scale)
    ? Math.max(0.1, options.scale ?? 1)
    : 1;
  const opacityFactor = Number.isFinite(options.opacityFactor)
    ? clamp(options.opacityFactor ?? 1, 0, 1)
    : 1;
  const style = feature.properties.style;
  const color = style.color ?? "#111827";
  const lineWidth = Math.max(0.5, (style.weight ?? 2) * scale);
  const opacity = getZoneVisibleStrokeOpacity(feature) * opacityFactor;
  const dashStyle = getFeatureDashStyle(feature);
  const group = leaflet.featureGroup();

  if (opacity <= 0 || lineWidth <= 0) {
    return null;
  }

  for (const ring of rings) {
    const layerRing = ring.map(([lng, lat]) =>
      map.latLngToLayerPoint(leaflet.latLng(lat, lng)),
    );

    if (dashStyle === "dotted") {
      const radius = Math.max(1.2, lineWidth / 2);
      const dots = createAlignedDottedZoneOutlinePoints(
        layerRing,
        getAlignedZoneOutlineDotSpacing(lineWidth),
      );

      for (const dot of dots) {
        const latLng = map.layerPointToLatLng(leaflet.point(dot.x, dot.y));
        const circle = leaflet.circleMarker(latLng, {
          radius,
          stroke: false,
          fill: true,
          fillColor: color,
          fillOpacity: opacity,
          interactive: false,
          bubblingMouseEvents: false,
          pane: paneName,
        });

        group.addLayer(circle);
      }

      continue;
    }

    const segments = createAlignedDashedZoneOutlineSegments(
      layerRing,
      getAlignedZoneOutlineDashLength(lineWidth),
      getAlignedZoneOutlineDashGap(lineWidth),
    );

    for (const segment of segments) {
      const latLngs = segment.map((point) =>
        map.layerPointToLatLng(leaflet.point(point.x, point.y)),
      ) as [L.LatLng, L.LatLng];
      const dash = leaflet.polyline(latLngs, {
        color,
        opacity,
        weight: lineWidth,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
        bubblingMouseEvents: false,
        pane: paneName,
      });

      group.addLayer(dash);
    }
  }

  return group.getLayers().length > 0 ? group : null;
}
