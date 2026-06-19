import {
  isFreehandLineFeature,
  isTracedLineFeature,
  isFreehandZoneFeature,
  type DroMapFeature,
  type DroMapFeatureStyle,
} from "@/lib/dromap/feature";

import { getFeatureDashStyle, getFeatureMarkerSize } from "./feature-style";
import {
  getZoneDotsColor,
  getZoneDotsEnabled,
  getZoneDotsRadius,
  getZoneDotsSpacing,
  getZoneFillEnabled,
  getZoneHatchingColor,
  getZoneHatchingSpacing,
  getZoneHatchingStyle,
  getZoneHatchingWeight,
  getZoneStrokeEnabled,
  getZoneVisibleFillOpacity,
  getZoneVisibleStrokeOpacity,
} from "./zone-style";
import {
  getFeatureMarkerSymbol,
  markerSymbolSupportsFill,
  markerSymbolSupportsStrokeWeight,
} from "./marker-symbol";

export const DEFAULT_LEGEND_SECTION_LABEL = "Général";

export type LegendEntry = {
  id: string;
  dedupeKey: string;
  label: string;
  section: string;
  typeLabel: string;
  representativeFeature: DroMapFeature;
  features: DroMapFeature[];
  featureIds: string[];
  count: number;
  isAutomaticOverlap?: boolean;
};

type Coordinate2D = [number, number];

type Bounds2D = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

type RgbaPaint = RgbColor & {
  a: number;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function normalizeString(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : fallback;
}

function normalizeNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return numberValue;
}

function normalizeBoolean(value: unknown) {
  return value === true;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function normalizeSectionLabel(section: unknown) {
  if (typeof section !== "string") {
    return DEFAULT_LEGEND_SECTION_LABEL;
  }

  const trimmedSection = section.trim();

  return trimmedSection.length > 0
    ? trimmedSection
    : DEFAULT_LEGEND_SECTION_LABEL;
}

function getFeatureTypeLabel(feature: DroMapFeature) {
  const type = feature.properties?.type;

  if (type === "text") return "Texte";
  if (type === "marker") return "Marqueur";
  if (type === "line") return isTracedLineFeature(feature) ? "Trait suivi" : "Ligne";
  if (type === "zone")
    return isFreehandZoneFeature(feature) ? "Zone libre" : "Zone";

  return "Objet";
}

function getFallbackLegendLabel(feature: DroMapFeature) {
  const type = feature.properties?.type;

  if (type === "text") return "Texte";
  if (type === "marker") return "Marqueur";
  if (type === "line")
    return isTracedLineFeature(feature)
      ? "Trait suivi"
      : isFreehandLineFeature(feature)
        ? "Ligne libre"
        : "Ligne";
  if (type === "zone")
    return isFreehandZoneFeature(feature) ? "Zone libre" : "Zone";

  return "Objet";
}

export function getLegendFeatureLabel(feature: DroMapFeature) {
  const legendLabel = feature.properties?.legendLabel;

  if (typeof legendLabel === "string" && legendLabel.trim().length > 0) {
    return legendLabel.trim();
  }

  return getFallbackLegendLabel(feature);
}

export function getLegendFeatureTypeLabel(feature: DroMapFeature) {
  return getFeatureTypeLabel(feature);
}

function getStyleKey(feature: DroMapFeature) {
  const type = feature.properties?.type;
  const style = (feature.properties?.style ?? {}) as DroMapFeatureStyle;
  const color = normalizeString(style.color, "#000000");
  const opacity = normalizeNumber(style.opacity, 1);

  if (type === "marker") {
    const symbol = getFeatureMarkerSymbol(feature);

    return {
      color,
      opacity,
      markerSize: getFeatureMarkerSize(feature),
      symbol,
      ...(symbol.type === "builtin" &&
      markerSymbolSupportsStrokeWeight(symbol.id)
        ? { weight: normalizeNumber(style.weight, 7) }
        : {}),
      ...(symbol.type === "builtin" && markerSymbolSupportsFill(symbol.id)
        ? { markerFilled: normalizeBoolean(style.markerFilled) }
        : {}),
    };
  }

  if (type === "line") {
    return {
      color,
      opacity,
      weight: normalizeNumber(style.weight, 3),
      dashStyle: getFeatureDashStyle(feature),
      arrowStart: normalizeBoolean(style.arrowStart),
      arrowEnd: normalizeBoolean(style.arrowEnd),
      lineVariant: isTracedLineFeature(feature)
        ? "traced"
        : isFreehandLineFeature(feature)
          ? "freehand"
          : "straight",
    };
  }

  if (type === "zone") {
    const zoneStrokeEnabled = getZoneStrokeEnabled(feature);
    const zoneFillEnabled = getZoneFillEnabled(feature);
    const zoneHatchingStyle = getZoneHatchingStyle(feature);
    const zoneDotsEnabled = getZoneDotsEnabled(feature);

    /**
     * La légende groupe les zones par style réellement visible.
     *
     * Important : pendant un déplacement, Leaflet peut réécrire des valeurs
     * techniques comme fillOpacity à 0 quand le fond est désactivé. Si ces
     * valeurs invisibles restent dans la clé de déduplication, deux zones au
     * rendu identique sont séparées dans la légende après déplacement.
     *
     * On ignore donc les paramètres des couches désactivées :
     * - pas de fond => fillColor/fillOpacity ne comptent pas ;
     * - pas de contour => couleur/épaisseur/opacité/tirets ne comptent pas ;
     * - pas de hachures => leurs réglages ne comptent pas ;
     * - pas de points => leurs réglages ne comptent pas.
     *
     * On ne met pas non plus zoneVariant dans la clé : une zone classique,
     * une zone libre ou une forme rapide doivent fusionner si leur figuré
     * visuel est identique.
     */
    return {
      zoneStrokeEnabled,
      ...(zoneStrokeEnabled
        ? {
            color,
            opacity: getZoneVisibleStrokeOpacity(feature),
            weight: normalizeNumber(style.weight, 2),
            dashStyle: getFeatureDashStyle(feature),
          }
        : {}),
      zoneFillEnabled,
      ...(zoneFillEnabled
        ? {
            fillColor: normalizeString(style.fillColor, color),
            fillOpacity: getZoneVisibleFillOpacity(feature),
          }
        : {}),
      zoneHatchingStyle,
      ...(zoneHatchingStyle !== "none"
        ? {
            zoneHatchingColor: getZoneHatchingColor(feature),
            zoneHatchingWeight: getZoneHatchingWeight(feature),
            zoneHatchingSpacing: getZoneHatchingSpacing(feature),
          }
        : {}),
      zoneDotsEnabled,
      ...(zoneDotsEnabled
        ? {
            zoneDotsColor: getZoneDotsColor(feature),
            zoneDotsRadius: getZoneDotsRadius(feature),
            zoneDotsSpacing: getZoneDotsSpacing(feature),
          }
        : {}),
    };
  }

  if (type === "text") {
    return {
      color,
      opacity,
      fontSize: normalizeNumber(style.fontSize, 22),
      textRotation: normalizeNumber(style.textRotation, 0),
      textBackgroundEnabled: normalizeBoolean(style.textBackgroundEnabled),
      textBackgroundColor: normalizeString(
        style.textBackgroundColor,
        "#ffffff",
      ),
      textBackgroundOpacity: normalizeNumber(style.textBackgroundOpacity, 0.85),
      textBorderEnabled: normalizeBoolean(style.textBorderEnabled),
      textBorderColor: normalizeString(style.textBorderColor, color),
      textBorderWidth: normalizeNumber(style.textBorderWidth, 2),
    };
  }

  return {
    color,
    opacity,
  };
}

export function getLegendDedupeKey(feature: DroMapFeature) {
  return stableStringify({
    type: feature.properties?.type ?? "object",
    geometryType: feature.geometry?.type ?? "unknown",
    style: getStyleKey(feature),
  });
}

function parseHexColor(value: string): RgbColor | null {
  const cleaned = value.trim().replace("#", "");

  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    return {
      r: Number.parseInt(cleaned[0] + cleaned[0], 16),
      g: Number.parseInt(cleaned[1] + cleaned[1], 16),
      b: Number.parseInt(cleaned[2] + cleaned[2], 16),
    };
  }

  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return {
      r: Number.parseInt(cleaned.slice(0, 2), 16),
      g: Number.parseInt(cleaned.slice(2, 4), 16),
      b: Number.parseInt(cleaned.slice(4, 6), 16),
    };
  }

  return null;
}

function componentToHex(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function rgbToHex(color: RgbColor) {
  return `#${componentToHex(color.r)}${componentToHex(color.g)}${componentToHex(
    color.b,
  )}`;
}

function getZoneFillPaint(feature: DroMapFeature): RgbaPaint | null {
  if (feature.properties?.type !== "zone" || !getZoneFillEnabled(feature)) {
    return null;
  }

  const opacity = getZoneVisibleFillOpacity(feature);

  if (opacity <= 0) {
    return null;
  }

  const style = (feature.properties?.style ?? {}) as DroMapFeatureStyle;
  const strokeColor = normalizeString(style.color, "#000000");
  const fillColor = normalizeString(style.fillColor, strokeColor);
  const rgb = parseHexColor(fillColor) ?? parseHexColor(strokeColor);

  if (!rgb) {
    return null;
  }

  return {
    ...rgb,
    a: clamp01(opacity),
  };
}

function composePaintOver(bottom: RgbaPaint, top: RgbaPaint): RgbaPaint {
  const outputAlpha = top.a + bottom.a * (1 - top.a);

  if (outputAlpha <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  return {
    r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / outputAlpha,
    g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / outputAlpha,
    b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / outputAlpha,
    a: outputAlpha,
  };
}

function coordinateIsValid(value: unknown): value is Coordinate2D {
  return (
    Array.isArray(value) &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function getFeaturePolygonRings(feature: DroMapFeature): Coordinate2D[][] {
  if (feature.geometry?.type !== "Polygon") {
    return [];
  }

  return feature.geometry.coordinates
    .map((ring) => ring.filter(coordinateIsValid))
    .filter((ring) => ring.length >= 3);
}

function closeRing(ring: Coordinate2D[]): Coordinate2D[] {
  const first = ring[0];
  const last = ring[ring.length - 1];

  if (!first || !last) {
    return ring;
  }

  if (first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }

  return [...ring, first];
}

function getRingBounds(ring: Coordinate2D[]): Bounds2D | null {
  if (ring.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
}

function boundsOverlap(first: Bounds2D, second: Bounds2D) {
  return !(
    first.maxX < second.minX ||
    second.maxX < first.minX ||
    first.maxY < second.minY ||
    second.maxY < first.minY
  );
}

function pointIsOnSegment(a: Coordinate2D, b: Coordinate2D, c: Coordinate2D) {
  const epsilon = 1e-9;
  const crossProduct =
    (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);

  if (Math.abs(crossProduct) > epsilon) {
    return false;
  }

  return (
    Math.min(a[0], c[0]) - epsilon <= b[0] &&
    b[0] <= Math.max(a[0], c[0]) + epsilon &&
    Math.min(a[1], c[1]) - epsilon <= b[1] &&
    b[1] <= Math.max(a[1], c[1]) + epsilon
  );
}

function pointIsOnRingBoundary(point: Coordinate2D, rawRing: Coordinate2D[]) {
  const ring = closeRing(rawRing);

  for (let index = 0; index + 1 < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[index + 1];

    if (start && end && pointIsOnSegment(start, point, end)) {
      return true;
    }
  }

  return false;
}

function pointIsInRing(point: Coordinate2D, rawRing: Coordinate2D[]) {
  if (pointIsOnRingBoundary(point, rawRing)) {
    return false;
  }

  const ring = closeRing(rawRing);
  const [x, y] = point;
  let inside = false;

  for (
    let index = 0, previousIndex = ring.length - 1;
    index < ring.length;
    previousIndex = index, index += 1
  ) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previousIndex];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointIsInPolygon(point: Coordinate2D, rings: Coordinate2D[][]) {
  const exteriorRing = rings[0];

  if (!exteriorRing || !pointIsInRing(point, exteriorRing)) {
    return false;
  }

  return !rings.slice(1).some((hole) => pointIsInRing(point, hole));
}

function orientation(a: Coordinate2D, b: Coordinate2D, c: Coordinate2D) {
  return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
}

function segmentsProperlyIntersect(
  firstStart: Coordinate2D,
  firstEnd: Coordinate2D,
  secondStart: Coordinate2D,
  secondEnd: Coordinate2D,
) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  const epsilon = 1e-9;

  if (
    Math.abs(firstOrientation) <= epsilon ||
    Math.abs(secondOrientation) <= epsilon ||
    Math.abs(thirdOrientation) <= epsilon ||
    Math.abs(fourthOrientation) <= epsilon
  ) {
    return false;
  }

  return (
    firstOrientation > 0 !== secondOrientation > 0 &&
    thirdOrientation > 0 !== fourthOrientation > 0
  );
}

function exteriorRingsIntersect(
  firstRing: Coordinate2D[],
  secondRing: Coordinate2D[],
) {
  const firstClosedRing = closeRing(firstRing);
  const secondClosedRing = closeRing(secondRing);

  for (
    let firstIndex = 0;
    firstIndex + 1 < firstClosedRing.length;
    firstIndex += 1
  ) {
    const firstStart = firstClosedRing[firstIndex];
    const firstEnd = firstClosedRing[firstIndex + 1];

    if (!firstStart || !firstEnd) {
      continue;
    }

    for (
      let secondIndex = 0;
      secondIndex + 1 < secondClosedRing.length;
      secondIndex += 1
    ) {
      const secondStart = secondClosedRing[secondIndex];
      const secondEnd = secondClosedRing[secondIndex + 1];

      if (!secondStart || !secondEnd) {
        continue;
      }

      if (
        segmentsProperlyIntersect(firstStart, firstEnd, secondStart, secondEnd)
      ) {
        return true;
      }
    }
  }

  return false;
}

function getComparableRingKey(ring: Coordinate2D[]) {
  return closeRing(ring)
    .map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`)
    .join("|");
}

function exteriorRingsAreEquivalent(
  firstRing: Coordinate2D[],
  secondRing: Coordinate2D[],
) {
  return getComparableRingKey(firstRing) === getComparableRingKey(secondRing);
}

function polygonRingsOverlap(
  firstRings: Coordinate2D[][],
  secondRings: Coordinate2D[][],
) {
  const firstExterior = firstRings[0];
  const secondExterior = secondRings[0];

  if (!firstExterior || !secondExterior) {
    return false;
  }

  const firstBounds = getRingBounds(firstExterior);
  const secondBounds = getRingBounds(secondExterior);

  if (
    !firstBounds ||
    !secondBounds ||
    !boundsOverlap(firstBounds, secondBounds)
  ) {
    return false;
  }

  if (exteriorRingsAreEquivalent(firstExterior, secondExterior)) {
    return true;
  }

  if (exteriorRingsIntersect(firstExterior, secondExterior)) {
    return true;
  }

  return (
    firstExterior.some((point) => pointIsInPolygon(point, secondRings)) ||
    secondExterior.some((point) => pointIsInPolygon(point, firstRings))
  );
}

function paintOverWhite(paint: RgbaPaint): RgbColor {
  const alpha = clamp01(paint.a);

  return {
    r: paint.r * alpha + 255 * (1 - alpha),
    g: paint.g * alpha + 255 * (1 - alpha),
    b: paint.b * alpha + 255 * (1 - alpha),
  };
}

function getVisiblePaintHexOverWhite(paint: RgbaPaint) {
  return rgbToHex(paintOverWhite(paint));
}

function getVisiblePaintKey(paint: RgbaPaint) {
  const visibleColor = paintOverWhite(paint);

  return `${componentToHex(visibleColor.r)}${componentToHex(
    visibleColor.g,
  )}${componentToHex(visibleColor.b)}`;
}

function getAutomaticOverlapLabel(layerCount: number) {
  return layerCount > 2 ? `Zone superposée x${layerCount}` : "Zone superposée";
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return hash;
}

function getOverlapRepresentativeFeature(options: {
  topFeature: DroMapFeature;
  visibleFillColor: string;
  dedupeKey: string;
  label: string;
}): DroMapFeature {
  const topStyle = options.topFeature.properties?.style ?? {};

  return {
    ...options.topFeature,
    id: `legend-overlap-${Math.abs(hashString(options.dedupeKey))}`,
    properties: {
      ...options.topFeature.properties,
      label: options.label,
      legendLabel: options.label,
      style: {
        ...topStyle,
        color: options.visibleFillColor,
        opacity: 0,
        weight: 1,
        fillColor: options.visibleFillColor,
        fillOpacity: 1,
        zoneFillEnabled: true,
        zoneStrokeEnabled: false,
        zoneHatchingStyle: "none",
        zoneDotsEnabled: false,
      },
    },
  };
}

type FilledZoneLegendSource = {
  feature: DroMapFeature;
  index: number;
  rings: Coordinate2D[][];
  exteriorRing: Coordinate2D[];
  bounds: Bounds2D;
  paint: RgbaPaint;
};

function getPolygonCentroid(ring: Coordinate2D[]): Coordinate2D | null {
  const closedRing = closeRing(ring);
  let signedArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index + 1 < closedRing.length; index += 1) {
    const [x0, y0] = closedRing[index];
    const [x1, y1] = closedRing[index + 1];
    const cross = x0 * y1 - x1 * y0;

    signedArea += cross;
    centroidX += (x0 + x1) * cross;
    centroidY += (y0 + y1) * cross;
  }

  if (Math.abs(signedArea) < 1e-12) {
    return null;
  }

  const area = signedArea / 2;

  return [centroidX / (6 * area), centroidY / (6 * area)];
}

function getAveragePoint(points: Coordinate2D[]): Coordinate2D | null {
  if (points.length === 0) {
    return null;
  }

  const total = points.reduce(
    (accumulator, [x, y]) => ({
      x: accumulator.x + x,
      y: accumulator.y + y,
    }),
    { x: 0, y: 0 },
  );

  return [total.x / points.length, total.y / points.length];
}

function getInteriorSamplePoint(rings: Coordinate2D[][]): Coordinate2D | null {
  const exteriorRing = rings[0];

  if (!exteriorRing) {
    return null;
  }

  const bounds = getRingBounds(exteriorRing);
  const candidates: Coordinate2D[] = [];
  const centroid = getPolygonCentroid(exteriorRing);
  const averagePoint = getAveragePoint(exteriorRing);

  if (centroid) candidates.push(centroid);
  if (averagePoint) candidates.push(averagePoint);

  if (bounds) {
    candidates.push([
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
    ]);

    for (let yIndex = 1; yIndex <= 5; yIndex += 1) {
      for (let xIndex = 1; xIndex <= 5; xIndex += 1) {
        candidates.push([
          bounds.minX + ((bounds.maxX - bounds.minX) * xIndex) / 6,
          bounds.minY + ((bounds.maxY - bounds.minY) * yIndex) / 6,
        ]);
      }
    }
  }

  return (
    candidates.find((candidate) => pointIsInPolygon(candidate, rings)) ?? null
  );
}

function getBoundsIntersection(
  first: Bounds2D,
  second: Bounds2D,
): Bounds2D | null {
  const minX = Math.max(first.minX, second.minX);
  const minY = Math.max(first.minY, second.minY);
  const maxX = Math.min(first.maxX, second.maxX);
  const maxY = Math.min(first.maxY, second.maxY);

  if (minX > maxX || minY > maxY) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function getSegmentIntersectionPoint(
  firstStart: Coordinate2D,
  firstEnd: Coordinate2D,
  secondStart: Coordinate2D,
  secondEnd: Coordinate2D,
): Coordinate2D | null {
  const [x1, y1] = firstStart;
  const [x2, y2] = firstEnd;
  const [x3, y3] = secondStart;
  const [x4, y4] = secondEnd;
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  const epsilon = 1e-10;

  if (Math.abs(denominator) <= epsilon) {
    return null;
  }

  const px =
    ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) /
    denominator;
  const py =
    ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) /
    denominator;

  if (
    px < Math.min(x1, x2) - epsilon ||
    px > Math.max(x1, x2) + epsilon ||
    px < Math.min(x3, x4) - epsilon ||
    px > Math.max(x3, x4) + epsilon ||
    py < Math.min(y1, y2) - epsilon ||
    py > Math.max(y1, y2) + epsilon ||
    py < Math.min(y3, y4) - epsilon ||
    py > Math.max(y3, y4) + epsilon
  ) {
    return null;
  }

  return [px, py];
}

function getExteriorIntersectionPoints(
  firstRing: Coordinate2D[],
  secondRing: Coordinate2D[],
) {
  const points: Coordinate2D[] = [];
  const firstClosedRing = closeRing(firstRing);
  const secondClosedRing = closeRing(secondRing);

  for (
    let firstIndex = 0;
    firstIndex + 1 < firstClosedRing.length;
    firstIndex += 1
  ) {
    const firstStart = firstClosedRing[firstIndex];
    const firstEnd = firstClosedRing[firstIndex + 1];

    if (!firstStart || !firstEnd) {
      continue;
    }

    for (
      let secondIndex = 0;
      secondIndex + 1 < secondClosedRing.length;
      secondIndex += 1
    ) {
      const secondStart = secondClosedRing[secondIndex];
      const secondEnd = secondClosedRing[secondIndex + 1];

      if (!secondStart || !secondEnd) {
        continue;
      }

      const intersection = getSegmentIntersectionPoint(
        firstStart,
        firstEnd,
        secondStart,
        secondEnd,
      );

      if (intersection) {
        points.push(intersection);
      }
    }
  }

  return points;
}

function getPointKey(point: Coordinate2D) {
  return `${point[0].toFixed(7)},${point[1].toFixed(7)}`;
}

function pushUniqueSamplePoint(
  samples: Coordinate2D[],
  seenSampleKeys: Set<string>,
  point: Coordinate2D | null | undefined,
) {
  if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
    return;
  }

  const key = getPointKey(point);

  if (seenSampleKeys.has(key)) {
    return;
  }

  seenSampleKeys.add(key);
  samples.push(point);
}

function addOverlapSamplePointsForPair(options: {
  samples: Coordinate2D[];
  seenSampleKeys: Set<string>;
  firstZone: FilledZoneLegendSource;
  secondZone: FilledZoneLegendSource;
}) {
  const { firstZone, secondZone, samples, seenSampleKeys } = options;
  const overlapBounds = getBoundsIntersection(
    firstZone.bounds,
    secondZone.bounds,
  );

  if (
    !overlapBounds ||
    !polygonRingsOverlap(firstZone.rings, secondZone.rings)
  ) {
    return;
  }

  if (
    exteriorRingsAreEquivalent(firstZone.exteriorRing, secondZone.exteriorRing)
  ) {
    pushUniqueSamplePoint(
      samples,
      seenSampleKeys,
      getInteriorSamplePoint(firstZone.rings),
    );
  }

  const overlapWidth = overlapBounds.maxX - overlapBounds.minX;
  const overlapHeight = overlapBounds.maxY - overlapBounds.minY;

  for (let yIndex = 1; yIndex <= 7; yIndex += 1) {
    for (let xIndex = 1; xIndex <= 7; xIndex += 1) {
      pushUniqueSamplePoint(samples, seenSampleKeys, [
        overlapBounds.minX + (overlapWidth * xIndex) / 8,
        overlapBounds.minY + (overlapHeight * yIndex) / 8,
      ]);
    }
  }

  const intersectionPoints = getExteriorIntersectionPoints(
    firstZone.exteriorRing,
    secondZone.exteriorRing,
  );
  const intersectionAverage = getAveragePoint(intersectionPoints);

  pushUniqueSamplePoint(samples, seenSampleKeys, intersectionAverage);
}

function getComposedPaintForStack(stack: FilledZoneLegendSource[]) {
  return stack.reduce<RgbaPaint>(
    (composedPaint, zone) => composePaintOver(composedPaint, zone.paint),
    { r: 0, g: 0, b: 0, a: 0 },
  );
}

function topPaintIsVisuallyIdenticalToStack(
  stack: FilledZoneLegendSource[],
  composedPaint: RgbaPaint,
) {
  const topZone = stack[stack.length - 1];

  if (!topZone) {
    return true;
  }

  return (
    getVisiblePaintKey(composedPaint) === getVisiblePaintKey(topZone.paint)
  );
}

function addAutomaticZoneOverlapEntries(input: {
  features: DroMapFeature[];
  entries: LegendEntry[];
  entryByKey: Map<string, LegendEntry>;
  legendGroupLabels?: Record<string, string>;
  legendGroupSections?: Record<string, string>;
}) {
  const zoneFeatures: FilledZoneLegendSource[] = input.features
    .map((feature, index) => {
      const rings = getFeaturePolygonRings(feature);
      const exteriorRing = rings[0];
      const bounds = exteriorRing ? getRingBounds(exteriorRing) : null;

      return {
        feature,
        index,
        rings,
        exteriorRing,
        bounds,
        paint: getZoneFillPaint(feature),
      };
    })
    .filter((item): item is FilledZoneLegendSource => {
      return (
        item.feature.properties?.type === "zone" &&
        item.rings.length > 0 &&
        Boolean(item.exteriorRing) &&
        item.bounds !== null &&
        item.paint !== null
      );
    });

  if (zoneFeatures.length < 2) {
    return;
  }

  const samples: Coordinate2D[] = [];
  const seenSampleKeys = new Set<string>();

  for (const zone of zoneFeatures) {
    pushUniqueSamplePoint(
      samples,
      seenSampleKeys,
      getInteriorSamplePoint(zone.rings),
    );
  }

  for (let firstIndex = 0; firstIndex < zoneFeatures.length; firstIndex += 1) {
    const firstZone = zoneFeatures[firstIndex];

    if (!firstZone) {
      continue;
    }

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < zoneFeatures.length;
      secondIndex += 1
    ) {
      const secondZone = zoneFeatures[secondIndex];

      if (!secondZone) {
        continue;
      }

      addOverlapSamplePointsForPair({
        samples,
        seenSampleKeys,
        firstZone,
        secondZone,
      });
    }
  }

  const seenStackKeys = new Set<string>();

  for (const sample of samples) {
    const stack = zoneFeatures.filter((zone) =>
      pointIsInPolygon(sample, zone.rings),
    );

    if (stack.length < 2) {
      continue;
    }

    const stackKey = stack.map((zone) => zone.feature.id).join("|");

    if (seenStackKeys.has(stackKey)) {
      continue;
    }

    seenStackKeys.add(stackKey);

    const composedPaint = getComposedPaintForStack(stack);

    if (
      composedPaint.a <= 0 ||
      topPaintIsVisuallyIdenticalToStack(stack, composedPaint)
    ) {
      continue;
    }

    const visibleFillColor = getVisiblePaintHexOverWhite(composedPaint);
    const label = getAutomaticOverlapLabel(stack.length);
    const dedupeKey = stableStringify({
      type: "zone-overlap-visible-color",
      fillColor: visibleFillColor,
      layerCount: stack.length,
    });
    const sourceIds = stack.map((zone) => zone.feature.id).sort();
    const existingEntry = input.entryByKey.get(dedupeKey);

    if (existingEntry) {
      for (const featureId of sourceIds) {
        if (!existingEntry.featureIds.includes(featureId)) {
          existingEntry.featureIds.push(featureId);
        }
      }

      existingEntry.count += 1;
      continue;
    }

    const hasCustomGroupLabel = Object.prototype.hasOwnProperty.call(
      input.legendGroupLabels ?? {},
      dedupeKey,
    );
    const customGroupLabel = input.legendGroupLabels?.[dedupeKey];
    const customSection = input.legendGroupSections?.[dedupeKey];
    const topZone = stack[stack.length - 1];

    if (!topZone) {
      continue;
    }

    const representativeFeature = getOverlapRepresentativeFeature({
      topFeature: topZone.feature,
      visibleFillColor,
      dedupeKey,
      label,
    });
    const entry: LegendEntry = {
      id: representativeFeature.id,
      dedupeKey,
      label:
        hasCustomGroupLabel && typeof customGroupLabel === "string"
          ? customGroupLabel
          : label,
      section: normalizeSectionLabel(customSection),
      typeLabel: "Zone superposée",
      representativeFeature,
      features: [],
      featureIds: sourceIds,
      count: 1,
      isAutomaticOverlap: true,
    };

    input.entryByKey.set(dedupeKey, entry);
    input.entries.push(entry);
  }
}

export function getLegendEntries(
  features: DroMapFeature[],
  options: {
    legendGroupLabels?: Record<string, string>;
    legendGroupSections?: Record<string, string>;
    legendGroupOrder?: string[];
  } = {},
): LegendEntry[] {
  const entries: LegendEntry[] = [];
  const entryByKey = new Map<string, LegendEntry>();

  for (const feature of features) {
    const dedupeKey = getLegendDedupeKey(feature);
    const existingEntry = entryByKey.get(dedupeKey);

    if (existingEntry) {
      existingEntry.features.push(feature);
      existingEntry.featureIds.push(feature.id);
      existingEntry.count += 1;
      continue;
    }

    const hasCustomGroupLabel = Object.prototype.hasOwnProperty.call(
      options.legendGroupLabels ?? {},
      dedupeKey,
    );
    const customGroupLabel = options.legendGroupLabels?.[dedupeKey];
    const customSection = options.legendGroupSections?.[dedupeKey];

    const entry: LegendEntry = {
      id: feature.id,
      dedupeKey,
      label:
        hasCustomGroupLabel && typeof customGroupLabel === "string"
          ? customGroupLabel
          : getLegendFeatureLabel(feature),
      section: normalizeSectionLabel(customSection),
      typeLabel: getLegendFeatureTypeLabel(feature),
      representativeFeature: feature,
      features: [feature],
      featureIds: [feature.id],
      count: 1,
    };

    entryByKey.set(dedupeKey, entry);
    entries.push(entry);
  }

  addAutomaticZoneOverlapEntries({
    features,
    entries,
    entryByKey,
    legendGroupLabels: options.legendGroupLabels,
    legendGroupSections: options.legendGroupSections,
  });

  const groupOrder = options.legendGroupOrder ?? [];

  if (groupOrder.length === 0) {
    return entries;
  }

  const orderIndexByKey = new Map(
    groupOrder.map((groupKey, index) => [groupKey, index]),
  );

  return [...entries].sort((firstEntry, secondEntry) => {
    const firstIndex = orderIndexByKey.get(firstEntry.dedupeKey);
    const secondIndex = orderIndexByKey.get(secondEntry.dedupeKey);

    if (typeof firstIndex === "number" && typeof secondIndex === "number") {
      return firstIndex - secondIndex;
    }

    if (typeof firstIndex === "number") {
      return -1;
    }

    if (typeof secondIndex === "number") {
      return 1;
    }

    return entries.indexOf(firstEntry) - entries.indexOf(secondEntry);
  });
}
