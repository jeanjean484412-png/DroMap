import type {
  DroMapFeature,
  DroMapFeatureMapLabelVisibility,
} from "@/lib/dromap/feature";

export const FEATURE_MAP_LABEL_FONT_SIZE_PX = 12;
export const FEATURE_MAP_LABEL_MAX_WIDTH_PX = 220;
export const FEATURE_MAP_LABEL_HORIZONTAL_PADDING_PX = 6;
export const FEATURE_MAP_LABEL_VERTICAL_PADDING_PX = 3;
export const FEATURE_MAP_LABEL_POINT_GAP_PX = 1;

export const FEATURE_MAP_LABEL_MIN_RENDER_SCALE = 0.125;
export const FEATURE_MAP_LABEL_MAX_RENDER_SCALE = 8;

export function clampFeatureMapLabelRenderScale(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(
    Math.max(value, FEATURE_MAP_LABEL_MIN_RENDER_SCALE),
    FEATURE_MAP_LABEL_MAX_RENDER_SCALE,
  );
}


const UNDETERMINED_BUILDING_LABELS = new Set([
  "batiment sans nom renseigne",
  "batiment sans nom",
  "sans nom",
  "unnamed building",
  "building",
  "batiment",
  "indifferencie",
  "commercial",
  "industriel",
  "industrial",
  "residentiel",
  "residential",
  "entrepot",
  "warehouse",
  "agricole",
  "agricultural",
  "zone geojson",
]);

function normalizeBuildingLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isImportedBuildingFeature(feature: DroMapFeature) {
  if (feature.geometry.type !== "Polygon") {
    return false;
  }

  const source = feature.properties.source;
  if (!source || source.type !== "geojson") {
    return false;
  }

  const sourceName = normalizeBuildingLabel(source.sourceName ?? "");
  const original = source.originalProperties ?? {};
  const originalKeys = Object.keys(original)
    .map((key) => normalizeBuildingLabel(key))
    .join(" ");

  return (
    sourceName.includes("building") ||
    sourceName.includes("batiment") ||
    sourceName.includes("bd topo") ||
    sourceName.includes("ai buildings") ||
    originalKeys.includes("building") ||
    originalKeys.includes("building id")
  );
}

function isUndeterminedBuildingLabel(feature: DroMapFeature, label: string) {
  if (!isImportedBuildingFeature(feature)) {
    return false;
  }

  const normalized = normalizeBuildingLabel(label);
  return !normalized || UNDETERMINED_BUILDING_LABELS.has(normalized);
}

export type FeatureMapLabelPlacement = "above" | "center";

export type FeatureMapLabelAnchor = {
  lat: number;
  lng: number;
  placement: FeatureMapLabelPlacement;
};

type Position = [number, number];

type CartesianPoint = {
  x: number;
  y: number;
};

export function isGeoJsonDerivedFeature(feature: DroMapFeature) {
  return feature.properties.source?.type === "geojson";
}

export function getFeatureMapLabelText(feature: DroMapFeature) {
  if (feature.properties.type === "text") {
    return "";
  }

  const label = feature.properties.label?.trim() ?? "";

  // Les imports de bâtiments utilisent parfois une valeur technique comme
  // « indifférencié », « commercial » ou « Bâtiment sans nom renseigné ».
  // Ce n'est pas un nom propre : l'option globale « afficher les étiquettes »
  // ne doit donc jamais fabriquer une étiquette à partir de cette valeur.
  return isUndeterminedBuildingLabel(feature, label) ? "" : label;
}

export function getFeatureMapLabelVisibility(
  feature: DroMapFeature,
): DroMapFeatureMapLabelVisibility {
  const visibility = feature.properties.mapLabelVisibility;

  if (visibility === "show" || visibility === "hide") {
    return visibility;
  }

  return "inherit";
}

export function shouldShowFeatureMapLabel(
  feature: DroMapFeature,
  showAllGeoJsonFeatureLabels: boolean,
  showAllFeatureLabels = false,
) {
  const label = getFeatureMapLabelText(feature);

  if (!label) {
    return false;
  }

  const visibility = getFeatureMapLabelVisibility(feature);

  if (visibility === "show") {
    return true;
  }

  if (visibility === "hide") {
    return false;
  }

  if (showAllFeatureLabels) {
    return true;
  }

  return showAllGeoJsonFeatureLabels && isGeoJsonDerivedFeature(feature);
}

export function getNextFeatureMapLabelVisibility(
  feature: DroMapFeature,
  showAllGeoJsonFeatureLabels: boolean,
  showAllFeatureLabels = false,
): DroMapFeatureMapLabelVisibility {
  return shouldShowFeatureMapLabel(
    feature,
    showAllGeoJsonFeatureLabels,
    showAllFeatureLabels,
  )
    ? "hide"
    : "show";
}

function normalizeLongitude(longitude: number) {
  let normalized = longitude;

  while (normalized > 180) {
    normalized -= 360;
  }

  while (normalized < -180) {
    normalized += 360;
  }

  return normalized;
}

function unwrapPositions(positions: Position[]) {
  if (positions.length === 0) {
    return [] as CartesianPoint[];
  }

  const unwrapped: CartesianPoint[] = [
    {
      x: positions[0][0],
      y: positions[0][1],
    },
  ];

  for (let index = 1; index < positions.length; index += 1) {
    const [longitude, latitude] = positions[index];
    const previousLongitude = unwrapped[index - 1].x;
    let adjustedLongitude = longitude;

    while (adjustedLongitude - previousLongitude > 180) {
      adjustedLongitude -= 360;
    }

    while (adjustedLongitude - previousLongitude < -180) {
      adjustedLongitude += 360;
    }

    unwrapped.push({
      x: adjustedLongitude,
      y: latitude,
    });
  }

  return unwrapped;
}

function getPolygonCentroid(points: CartesianPoint[]) {
  if (points.length < 3) {
    return null;
  }

  let twiceArea = 0;
  let xAccumulator = 0;
  let yAccumulator = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;

    twiceArea += cross;
    xAccumulator += (current.x + next.x) * cross;
    yAccumulator += (current.y + next.y) * cross;
  }

  if (Math.abs(twiceArea) < 1e-10) {
    return null;
  }

  return {
    x: xAccumulator / (3 * twiceArea),
    y: yAccumulator / (3 * twiceArea),
  };
}

function isPointInsideRing(point: CartesianPoint, ring: CartesianPoint[]) {
  let inside = false;

  for (
    let currentIndex = 0, previousIndex = ring.length - 1;
    currentIndex < ring.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const current = ring[currentIndex];
    const previous = ring[previousIndex];
    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y || Number.EPSILON) +
          current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function getRingBounds(points: CartesianPoint[]) {
  if (points.length === 0) {
    return null;
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, maxX, minY, maxY };
}

function getInteriorPolygonAnchor(positions: Position[]) {
  const unwrapped = unwrapPositions(positions);

  if (unwrapped.length === 0) {
    return null;
  }

  const bounds = getRingBounds(unwrapped);

  if (!bounds) {
    return null;
  }

  const centroid = getPolygonCentroid(unwrapped);

  if (centroid && isPointInsideRing(centroid, unwrapped)) {
    return centroid;
  }

  const boundsCenter = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };

  if (isPointInsideRing(boundsCenter, unwrapped)) {
    return boundsCenter;
  }

  let bestCandidate: CartesianPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const gridSteps = 10;

  for (let yIndex = 0; yIndex <= gridSteps; yIndex += 1) {
    const y = bounds.minY + ((bounds.maxY - bounds.minY) * yIndex) / gridSteps;

    for (let xIndex = 0; xIndex <= gridSteps; xIndex += 1) {
      const x =
        bounds.minX + ((bounds.maxX - bounds.minX) * xIndex) / gridSteps;
      const candidate = { x, y };

      if (!isPointInsideRing(candidate, unwrapped)) {
        continue;
      }

      const distance = Math.hypot(x - boundsCenter.x, y - boundsCenter.y);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestCandidate = candidate;
      }
    }
  }

  return bestCandidate ?? centroid ?? boundsCenter;
}

function getLineMidpoint(positions: Position[]) {
  if (positions.length === 0) {
    return null;
  }

  if (positions.length === 1) {
    return {
      x: positions[0][0],
      y: positions[0][1],
    };
  }

  const unwrapped = unwrapPositions(positions);
  const segmentLengths: number[] = [];
  let totalLength = 0;

  for (let index = 1; index < unwrapped.length; index += 1) {
    const previous = unwrapped[index - 1];
    const current = unwrapped[index];
    const latitudeFactor = Math.max(
      0.1,
      Math.cos((((previous.y + current.y) / 2) * Math.PI) / 180),
    );
    const length = Math.hypot(
      (current.x - previous.x) * latitudeFactor,
      current.y - previous.y,
    );

    segmentLengths.push(length);
    totalLength += length;
  }

  let remaining = totalLength / 2;

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    const start = unwrapped[index];
    const end = unwrapped[index + 1];

    if (remaining <= segmentLength || index === segmentLengths.length - 1) {
      const ratio = segmentLength > 0 ? remaining / segmentLength : 0;

      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }

    remaining -= segmentLength;
  }

  return unwrapped[Math.floor(unwrapped.length / 2)] ?? null;
}

export function getFeatureMapLabelAnchor(
  feature: DroMapFeature,
): FeatureMapLabelAnchor | null {
  const geometry = feature.geometry;

  if (geometry.type === "Point") {
    return {
      lng: geometry.coordinates[0],
      lat: geometry.coordinates[1],
      placement: "above",
    };
  }

  if (geometry.type === "Polygon") {
    const anchor = getInteriorPolygonAnchor(geometry.coordinates[0] ?? []);

    if (!anchor) {
      return null;
    }

    return {
      lng: normalizeLongitude(anchor.x),
      lat: anchor.y,
      placement: "center",
    };
  }

  const anchor = getLineMidpoint(geometry.coordinates);

  if (!anchor) {
    return null;
  }

  return {
    lng: normalizeLongitude(anchor.x),
    lat: anchor.y,
    placement: "center",
  };
}


export function getFeatureMapLabelManualOffsetAtZoom(
  feature: DroMapFeature,
  currentZoom: number,
) {
  const offset = feature.properties.mapLabelOffset;

  if (
    !offset ||
    !Number.isFinite(offset.x) ||
    !Number.isFinite(offset.y) ||
    !Number.isFinite(offset.referenceZoom) ||
    !Number.isFinite(currentZoom)
  ) {
    return null;
  }

  const zoomScale = clampFeatureMapLabelRenderScale(
    2 ** (currentZoom - offset.referenceZoom),
  );

  return {
    x: offset.x * zoomScale,
    y: offset.y * zoomScale,
  };
}

export type FeatureMapLabelScreenPlacement =
  | "above"
  | "below"
  | "right"
  | "left"
  | "above-right"
  | "above-left"
  | "below-right"
  | "below-left"
  | "center"
  | "manual";

export type FeatureMapLabelScreenLayoutRequest = {
  feature: DroMapFeature;
  text: string;
  anchorX: number;
  anchorY: number;
  labelScale: number;
  markerRadius: number;
  preferredPlacement: FeatureMapLabelPlacement;
  maxTextWidth: number;
  /** Décalage manuel déjà ramené au zoom de rendu courant. */
  manualOffsetX?: number;
  /** Décalage manuel déjà ramené au zoom de rendu courant. */
  manualOffsetY?: number;
};

export type FeatureMapLabelScreenLayout = {
  featureId: string;
  /** Texte intégral, avec retours à la ligne lorsque le libellé est long. */
  text: string;
  lines: string[];
  lineHeight: number;
  placement: FeatureMapLabelScreenPlacement;
  centerX: number;
  centerY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  fontSize: number;
};

type FeatureMapLabelScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type FeatureMapLabelMarkerObstacle = {
  featureId: string;
  centerX: number;
  centerY: number;
  radius: number;
};

type FeatureMapLabelViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getRectOverlapArea(
  first: FeatureMapLabelScreenRect,
  second: FeatureMapLabelScreenRect,
) {
  const width = Math.max(
    0,
    Math.min(first.right, second.right) - Math.max(first.left, second.left),
  );
  const height = Math.max(
    0,
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top),
  );

  return width * height;
}

function createScreenRect(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
): FeatureMapLabelScreenRect {
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
  };
}

function splitLongLabelToken(
  token: string,
  maxWidth: number,
  measureTextWidth: (text: string, fontSize: number) => number,
  fontSize: number,
) {
  const chunks: string[] = [];
  let remaining = token;

  while (remaining.length > 0) {
    if (measureTextWidth(remaining, fontSize) <= maxWidth) {
      chunks.push(remaining);
      break;
    }

    let low = 1;
    let high = remaining.length;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const candidate = remaining.slice(0, middle);

      if (measureTextWidth(candidate, fontSize) <= maxWidth) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    const chunkLength = Math.max(1, low);
    chunks.push(remaining.slice(0, chunkLength));
    remaining = remaining.slice(chunkLength);
  }

  return chunks;
}

/**
 * Enveloppe le texte sans jamais le tronquer. Les mots trop longs sont eux
 * aussi découpés, afin que la totalité du nom reste lisible dans l'éditeur,
 * la preview et l'export.
 */
function wrapFeatureMapLabelText(
  text: string,
  maxWidth: number,
  measureTextWidth: (text: string, fontSize: number) => number,
  fontSize: number,
) {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let currentLine = "";

    for (const word of words) {
      const parts =
        measureTextWidth(word, fontSize) <= maxWidth
          ? [word]
          : splitLongLabelToken(word, maxWidth, measureTextWidth, fontSize);

      for (const part of parts) {
        const candidate = currentLine ? `${currentLine} ${part}` : part;

        if (
          currentLine &&
          measureTextWidth(candidate, fontSize) > maxWidth
        ) {
          lines.push(currentLine);
          currentLine = part;
        } else {
          currentLine = candidate;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines.length > 0 ? lines : [text];
}

function getPointPlacementCandidates(
  request: FeatureMapLabelScreenLayoutRequest,
  width: number,
  height: number,
) {
  const gap = FEATURE_MAP_LABEL_POINT_GAP_PX;
  const radius = Math.max(0, request.markerRadius);
  const horizontalOffset = radius + gap + width / 2;
  const verticalOffset = radius + gap + height / 2;

  return [
    {
      placement: "above" as const,
      x: request.anchorX,
      y: request.anchorY - verticalOffset,
    },
    {
      placement: "below" as const,
      x: request.anchorX,
      y: request.anchorY + verticalOffset,
    },
    {
      placement: "right" as const,
      x: request.anchorX + horizontalOffset,
      y: request.anchorY,
    },
    {
      placement: "left" as const,
      x: request.anchorX - horizontalOffset,
      y: request.anchorY,
    },
    {
      placement: "above-right" as const,
      x: request.anchorX + horizontalOffset,
      y: request.anchorY - verticalOffset,
    },
    {
      placement: "above-left" as const,
      x: request.anchorX - horizontalOffset,
      y: request.anchorY - verticalOffset,
    },
    {
      placement: "below-right" as const,
      x: request.anchorX + horizontalOffset,
      y: request.anchorY + verticalOffset,
    },
    {
      placement: "below-left" as const,
      x: request.anchorX - horizontalOffset,
      y: request.anchorY + verticalOffset,
    },
  ];
}

function getCenteredPlacementCandidates(
  request: FeatureMapLabelScreenLayoutRequest,
  width: number,
  height: number,
) {
  const gap = FEATURE_MAP_LABEL_POINT_GAP_PX;

  return [
    { placement: "center" as const, x: request.anchorX, y: request.anchorY },
    {
      placement: "above" as const,
      x: request.anchorX,
      y: request.anchorY - height - gap,
    },
    {
      placement: "below" as const,
      x: request.anchorX,
      y: request.anchorY + height + gap,
    },
    {
      placement: "right" as const,
      x: request.anchorX + width / 2 + gap,
      y: request.anchorY,
    },
    {
      placement: "left" as const,
      x: request.anchorX - width / 2 - gap,
      y: request.anchorY,
    },
  ];
}

/**
 * Placement d'étiquettes commun à l'éditeur, la preview et l'export.
 *
 * L'ordre de recherche est volontairement : au-dessus, en dessous, à droite,
 * à gauche, puis les diagonales. Une étiquette ne change donc de côté que si
 * sa position préférée chevauche un autre figuré ou une étiquette déjà placée.
 */
export function createFeatureMapLabelScreenLayouts(
  requests: FeatureMapLabelScreenLayoutRequest[],
  viewport: FeatureMapLabelViewport,
  measureTextWidth: (text: string, fontSize: number) => number,
  markerObstacles: FeatureMapLabelMarkerObstacle[] = [],
) {
  const viewportPadding = 2;
  const viewportRect: FeatureMapLabelScreenRect = {
    left: viewport.x + viewportPadding,
    top: viewport.y + viewportPadding,
    right: viewport.x + viewport.width - viewportPadding,
    bottom: viewport.y + viewport.height - viewportPadding,
  };
  const markerRectByFeatureId = new Map<
    string,
    { featureId: string; rect: FeatureMapLabelScreenRect }
  >();

  for (const obstacle of markerObstacles) {
    if (obstacle.radius <= 0) continue;
    markerRectByFeatureId.set(obstacle.featureId, {
      featureId: obstacle.featureId,
      rect: createScreenRect(
        obstacle.centerX,
        obstacle.centerY,
        obstacle.radius * 2,
        obstacle.radius * 2,
      ),
    });
  }

  for (const request of requests) {
    if (request.markerRadius <= 0) continue;
    markerRectByFeatureId.set(request.feature.id, {
      featureId: request.feature.id,
      rect: createScreenRect(
        request.anchorX,
        request.anchorY,
        request.markerRadius * 2,
        request.markerRadius * 2,
      ),
    });
  }

  const markerRects = Array.from(markerRectByFeatureId.values());
  const occupiedLabelRects: FeatureMapLabelScreenRect[] = [];
  const layouts = new Map<string, FeatureMapLabelScreenLayout>();

  const orderedRequests = requests
    .map((request, index) => ({ request, index }))
    .sort((first, second) => {
      const firstIsManual =
        Number.isFinite(first.request.manualOffsetX) &&
        Number.isFinite(first.request.manualOffsetY);
      const secondIsManual =
        Number.isFinite(second.request.manualOffsetX) &&
        Number.isFinite(second.request.manualOffsetY);

      if (firstIsManual !== secondIsManual) {
        return firstIsManual ? -1 : 1;
      }

      const radiusDifference =
        second.request.markerRadius - first.request.markerRadius;

      return Math.abs(radiusDifference) > 0.001
        ? radiusDifference
        : first.index - second.index;
    });

  for (const { request } of orderedRequests) {
    const safeScale = clampFeatureMapLabelRenderScale(request.labelScale);
    const fontSize = FEATURE_MAP_LABEL_FONT_SIZE_PX * safeScale;
    const maxTextWidth = Math.max(24, request.maxTextWidth);
    const lines = wrapFeatureMapLabelText(
      request.text,
      maxTextWidth,
      measureTextWidth,
      fontSize,
    );
    const lineHeight = fontSize * 1.15;
    const measuredWidth = Math.min(
      maxTextWidth,
      Math.max(
        1,
        ...lines.map((line) => measureTextWidth(line || " ", fontSize)),
      ),
    );
    const width = Math.max(1, measuredWidth + 2);
    const height = Math.max(1, lines.length * lineHeight);
    const displayText = lines.join("\n");
    const hasManualOffset =
      Number.isFinite(request.manualOffsetX) &&
      Number.isFinite(request.manualOffsetY);
    const candidates = hasManualOffset
      ? [
          {
            placement: "manual" as const,
            x: request.anchorX + (request.manualOffsetX ?? 0),
            y: request.anchorY + (request.manualOffsetY ?? 0),
          },
        ]
      : request.preferredPlacement === "above"
        ? getPointPlacementCandidates(request, width, height)
        : getCenteredPlacementCandidates(request, width, height);

    let bestCandidate = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;

    candidates.forEach((candidate, candidateIndex) => {
      const minCenterX = viewportRect.left + width / 2;
      const maxCenterX = viewportRect.right - width / 2;
      const minCenterY = viewportRect.top + height / 2;
      const maxCenterY = viewportRect.bottom - height / 2;
      const centerX =
        minCenterX > maxCenterX
          ? (viewportRect.left + viewportRect.right) / 2
          : Math.min(Math.max(candidate.x, minCenterX), maxCenterX);
      const centerY =
        minCenterY > maxCenterY
          ? (viewportRect.top + viewportRect.bottom) / 2
          : Math.min(Math.max(candidate.y, minCenterY), maxCenterY);
      const rect = createScreenRect(centerX, centerY, width, height);
      const clampDistance = Math.hypot(
        centerX - candidate.x,
        centerY - candidate.y,
      );
      const labelOverlap = hasManualOffset
        ? 0
        : occupiedLabelRects.reduce(
            (total, occupiedRect) =>
              total + getRectOverlapArea(rect, occupiedRect),
            0,
          );
      const markerOverlap = hasManualOffset
        ? 0
        : markerRects.reduce(
            (total, marker) =>
              marker.featureId === request.feature.id
                ? total
                : total + getRectOverlapArea(rect, marker.rect),
            0,
          );
      const score = hasManualOffset
        ? clampDistance
        : (labelOverlap + markerOverlap) * 10_000 +
          clampDistance * 100 +
          candidateIndex;

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = { ...candidate, x: centerX, y: centerY };
      }
    });

    const chosenRect = createScreenRect(
      bestCandidate.x,
      bestCandidate.y,
      width,
      height,
    );
    occupiedLabelRects.push(chosenRect);
    layouts.set(request.feature.id, {
      featureId: request.feature.id,
      text: displayText,
      lines,
      lineHeight,
      placement: bestCandidate.placement,
      centerX: bestCandidate.x,
      centerY: bestCandidate.y,
      offsetX: bestCandidate.x - request.anchorX,
      offsetY: bestCandidate.y - request.anchorY,
      width,
      height,
      fontSize,
    });
  }

  return layouts;
}

export function getFeatureMapLabelPointOffsetPx(feature: DroMapFeature) {
  if (feature.geometry.type !== "Point") {
    return 0;
  }

  const markerSize = Number(feature.properties.style?.markerSize ?? 18);

  return Math.max(
    FEATURE_MAP_LABEL_POINT_GAP_PX,
    markerSize / 2 + FEATURE_MAP_LABEL_POINT_GAP_PX,
  );
}
