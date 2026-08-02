"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import type { DromapBasemapBoundaryLayer } from "@/lib/dromap/basemap";
import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import type { DromapBoundaryLineString } from "@/lib/dromap/basemap-boundaries";
import {
  getDromapBoundaryRenderableLineStrings,
  loadDromapBoundaryFeatureCollection,
} from "@/lib/dromap/basemap-boundaries";
import { deactivateGeomanModes } from "@/lib/dromap/geoman-toolbar";
import type { DroMapFeature } from "@/lib/dromap/feature";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import {
  applyDrawingPresetToFeature,
  useEditorTestDrawingOptionsStore,
} from "@/stores/editor-test-drawing-options";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import type {
  DromapGeoJsonFeature,
  DromapGeoJsonGeometry,
  DromapGeoJsonLayer,
} from "@/stores/editor-test-geojson-layers";
import {
  getGeoJsonLayerLoadedDisplayData,
  getRenderableGeoJsonLayers,
  useEditorTestGeoJsonLayersStore,
} from "@/stores/editor-test-geojson-layers";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import {
  createLineArrowBodyLeafletLayer,
  createLineArrowLeafletLayer,
  featureHasLineArrow,
  getLineArrowBodyLineCap,
  getLineArrowStyle,
} from "./line-arrow";
import { getEffectiveGeoJsonFeatureStyle } from "./geojson-layer-style";

const TRACE_START_SNAP_DISTANCE_PX = 42;
const TRACE_SNAP_DISTANCE_PX = 40;
const TRACE_STICKY_SNAP_DISTANCE_PX = 54;
const TRACE_ACTIVE_CANDIDATE_BONUS = 20;
const TRACE_ACTIVE_LAYER_BONUS = 8;
const TRACE_CANDIDATE_SWITCH_PENALTY = 18;
const TRACE_MAX_CANDIDATE_SWITCH_GAP_PX = 28;
const TRACE_MAX_INTENTIONAL_SWITCH_GAP_PX = 92;
const TRACE_INTENTIONAL_SWITCH_DISTANCE_PX = 24;
const TRACE_INTENTIONAL_SWITCH_IMPROVEMENT_PX = 7;
const TRACE_ACTIVE_RELEASE_DISTANCE_PX = 28;
const TRACE_DIRECTIONAL_SWITCH_DISTANCE_PX = 30;
const TRACE_DIRECTIONAL_SWITCH_MIN_CURSOR_MOVE_PX = 6;
const TRACE_DIRECTIONAL_SWITCH_DOT_ADVANTAGE = 0.22;
const TRACE_MAX_SAME_CANDIDATE_JUMP_PX = 90;
const TRACE_MAX_PATH_TO_DIRECT_RATIO = 3.4;
const MIN_TRACED_DISTANCE_PX = 8;
const MAX_TRACED_FEATURE_POINTS = 3600;
const TRACE_PREVIEW_OPACITY_FACTOR = 0.72;

type TraceCandidate = {
  id: string;
  latLngs: L.LatLng[];
  containerPoints: L.Point[];
  layerPointBounds: L.Bounds;
  cumulativeDistances: number[];
  length: number;
  closed: boolean;
  layerIndex: number;
  visualPriority: number;
};

type LoadedTraceLineLayer = {
  sourceId: string;
  sourceKind: "basemap" | "geojson";
  layerIndex: number;
  lineStrings: DromapBoundaryLineString[];
  strokeWeight: number;
  strokeOpacity: number;
};

type TraceProjection = {
  candidate: TraceCandidate;
  containerPoint: L.Point;
  latLng: L.LatLng;
  distancePx: number;
  segmentIndex: number;
  distanceAlong: number;
  intentionalCandidateSwitch?: boolean;
};

function getDashArray(
  dashStyle: "solid" | "dashed" | "dotted",
  weight: number,
) {
  if (dashStyle === "dashed") {
    return `${weight * 3} ${weight * 2}`;
  }

  if (dashStyle === "dotted") {
    return `0.001 ${weight * 2.2}`;
  }

  return undefined;
}

function getPreviewPathOptions(feature: DroMapFeature): L.PolylineOptions {
  const style = feature.properties.style;
  const weight = Math.max(1, style.weight ?? 4);
  const opacity = Math.max(
    0.18,
    Math.min(1, style.opacity ?? 1) * TRACE_PREVIEW_OPACITY_FACTOR,
  );

  return {
    color: style.color ?? "#111827",
    opacity,
    weight,
    dashArray: getDashArray(style.dashStyle ?? "solid", weight),
    lineCap: featureHasLineArrow(feature)
      ? getLineArrowBodyLineCap(feature)
      : "round",
    lineJoin: "round",
    interactive: false,
    bubblingMouseEvents: false,
  };
}

function getLineStringBounds(lineString: DromapBoundaryLineString) {
  const bounds = L.latLngBounds([]);

  for (const [longitude, latitude] of lineString) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }

    bounds.extend([latitude, longitude]);
  }

  return bounds.isValid() ? bounds : null;
}

function lineStringIntersectsBounds(
  lineString: DromapBoundaryLineString,
  bounds: L.LatLngBounds,
) {
  const lineBounds = getLineStringBounds(lineString);

  if (!lineBounds) {
    return false;
  }

  return lineBounds.intersects(bounds);
}

function getLineStringKey(
  lineString: DromapBoundaryLineString,
  index: number,
  layerIndex: number,
) {
  const first = lineString[0];
  const last = lineString[lineString.length - 1];

  return [
    layerIndex,
    index,
    lineString.length,
    first ? `${first[0].toFixed(5)},${first[1].toFixed(5)}` : "start",
    last ? `${last[0].toFixed(5)},${last[1].toFixed(5)}` : "end",
  ].join("|");
}

function latLngsAreClosed(latLngs: L.LatLng[]) {
  if (latLngs.length < 3) {
    return false;
  }

  const first = latLngs[0];
  const last = latLngs[latLngs.length - 1];

  return (
    Math.abs(first.lat - last.lat) < 0.000001 &&
    Math.abs(first.lng - last.lng) < 0.000001
  );
}

function getLayerVisualPriority(layer: LoadedTraceLineLayer) {
  const strokeWeight = Math.max(0.1, layer.strokeWeight ?? 1);
  const strokeOpacity = Math.max(0.1, layer.strokeOpacity ?? 1);

  // Les couches dessinées après sont visuellement au-dessus. Sur France + régions
  // ou France + départements, le contour national est au-dessus des limites
  // internes : on doit donc le favoriser nettement quand le curseur est proche des
  // deux traits. Les calques GeoJSON importés sont ajoutés après les couches du
  // fond afin que le suivi accroche naturellement les lignes visibles importées
  // quand elles passent près d’une frontière du fond.
  const sourceBonus = layer.sourceKind === "geojson" ? 22 : 0;
  return (
    strokeWeight * strokeOpacity * 16 + layer.layerIndex * 28 + sourceBonus
  );
}

function getTracePositionKey(position: DromapBoundaryLineString[number]) {
  return `${position[0].toFixed(6)},${position[1].toFixed(6)}`;
}

function positionsAreEqual(
  first: DromapBoundaryLineString[number],
  second: DromapBoundaryLineString[number],
) {
  return getTracePositionKey(first) === getTracePositionKey(second);
}

function lineStringIsClosed(lineString: DromapBoundaryLineString) {
  return (
    lineString.length >= 3 &&
    positionsAreEqual(lineString[0], lineString[lineString.length - 1])
  );
}

function reverseLineString(lineString: DromapBoundaryLineString) {
  return [...lineString].reverse();
}

function sanitizeLineString(lineString: DromapBoundaryLineString) {
  return lineString.filter(
    (coordinate): coordinate is [number, number] =>
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      Number.isFinite(coordinate[0]) &&
      Number.isFinite(coordinate[1]),
  );
}

function connectTraceLineStrings(lineStrings: DromapBoundaryLineString[]) {
  const sanitizedLineStrings = lineStrings
    .map(sanitizeLineString)
    .filter((lineString) => lineString.length >= 2);
  const endpointDegree = new Map<string, number>();

  for (const lineString of sanitizedLineStrings) {
    const firstKey = getTracePositionKey(lineString[0]);
    const lastKey = getTracePositionKey(lineString[lineString.length - 1]);

    endpointDegree.set(firstKey, (endpointDegree.get(firstKey) ?? 0) + 1);
    endpointDegree.set(lastKey, (endpointDegree.get(lastKey) ?? 0) + 1);
  }

  const unused = new Set(sanitizedLineStrings.map((_, index) => index));
  const connectedLineStrings: DromapBoundaryLineString[] = [];

  const findAttachableLineString = (
    key: string,
    excludeIndex: number | null,
  ) => {
    // On ne traverse automatiquement que les nœuds simples. Aux carrefours de
    // frontières administratives, suivre une branche au hasard produit des sauts
    // et des diagonales. Le curseur peut toujours reprendre sur une autre branche.
    if ((endpointDegree.get(key) ?? 0) !== 2) {
      return null;
    }

    for (const index of unused) {
      if (index === excludeIndex) {
        continue;
      }

      const lineString = sanitizedLineStrings[index];
      const firstKey = getTracePositionKey(lineString[0]);
      const lastKey = getTracePositionKey(lineString[lineString.length - 1]);

      if (firstKey === key) {
        return { index, lineString };
      }

      if (lastKey === key) {
        return { index, lineString: reverseLineString(lineString) };
      }
    }

    return null;
  };

  for (const startIndex of sanitizedLineStrings.map((_, index) => index)) {
    if (!unused.has(startIndex)) {
      continue;
    }

    unused.delete(startIndex);
    let chain = [...sanitizedLineStrings[startIndex]];

    if (!lineStringIsClosed(chain)) {
      let didExtend = true;

      while (didExtend) {
        didExtend = false;
        const lastKey = getTracePositionKey(chain[chain.length - 1]);
        const next = findAttachableLineString(lastKey, startIndex);

        if (next) {
          unused.delete(next.index);
          chain = [...chain, ...next.lineString.slice(1)];
          didExtend = true;
        }
      }

      didExtend = true;

      while (didExtend) {
        didExtend = false;
        const firstKey = getTracePositionKey(chain[0]);
        const previous = findAttachableLineString(firstKey, startIndex);

        if (previous) {
          unused.delete(previous.index);
          chain = [
            ...reverseLineString(previous.lineString).slice(0, -1),
            ...chain,
          ];
          didExtend = true;
        }
      }
    }

    connectedLineStrings.push(chain);
  }

  return connectedLineStrings;
}

function buildTraceCandidate(
  lineString: DromapBoundaryLineString,
  index: number,
  map: L.Map,
  traceLayer: LoadedTraceLineLayer,
): TraceCandidate | null {
  const latLngs = lineString
    .filter(
      (coordinate): coordinate is [number, number] =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1]),
    )
    .map(([longitude, latitude]) => L.latLng(latitude, longitude));

  if (latLngs.length < 2) {
    return null;
  }

  const points = latLngs.map((latLng) => map.latLngToContainerPoint(latLng));
  const layerPointBounds = L.bounds(points);
  const cumulativeDistances: number[] = [0];
  let length = 0;

  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
    length += points[pointIndex - 1].distanceTo(points[pointIndex]);
    cumulativeDistances.push(length);
  }

  if (length <= 0 || !layerPointBounds.isValid()) {
    return null;
  }

  return {
    id: getLineStringKey(lineString, index, traceLayer.layerIndex),
    latLngs,
    containerPoints: points,
    layerPointBounds,
    cumulativeDistances,
    length,
    closed: latLngsAreClosed(latLngs),
    layerIndex: traceLayer.layerIndex,
    visualPriority: getLayerVisualPriority(traceLayer),
  };
}

function buildTraceCandidates(
  loadedLayers: LoadedTraceLineLayer[],
  map: L.Map,
) {
  const mapBounds = map.getBounds().pad(0.8);

  return loadedLayers.flatMap((loadedLayer) =>
    connectTraceLineStrings(loadedLayer.lineStrings)
      .filter((lineString) => lineStringIntersectsBounds(lineString, mapBounds))
      .map((lineString, index) =>
        buildTraceCandidate(lineString, index, map, loadedLayer),
      )
      .filter((candidate): candidate is TraceCandidate => candidate !== null),
  );
}

function projectPointOnSegment(point: L.Point, start: L.Point, end: L.Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return {
      ratio: 0,
      point: start,
      distancePx: point.distanceTo(start),
    };
  }

  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        (dx * dx + dy * dy),
    ),
  );
  const projectedPoint = L.point(start.x + dx * ratio, start.y + dy * ratio);

  return {
    ratio,
    point: projectedPoint,
    distancePx: point.distanceTo(projectedPoint),
  };
}

function pointBoundsContainsWithPadding(
  bounds: L.Bounds,
  point: L.Point,
  paddingPx: number,
) {
  const min = bounds.min;
  const max = bounds.max;

  if (!min || !max) {
    return false;
  }

  return (
    point.x >= min.x - paddingPx &&
    point.x <= max.x + paddingPx &&
    point.y >= min.y - paddingPx &&
    point.y <= max.y + paddingPx
  );
}

function findNearestProjectionOnCandidate(
  containerPoint: L.Point,
  candidate: TraceCandidate,
  map: L.Map,
  searchPaddingPx: number,
): TraceProjection | null {
  const points = candidate.containerPoints;

  if (
    !pointBoundsContainsWithPadding(
      candidate.layerPointBounds,
      containerPoint,
      searchPaddingPx,
    )
  ) {
    return null;
  }

  let bestProjection: TraceProjection | null = null;

  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentStart = points[index];
    const segmentEnd = points[index + 1];
    const projection = projectPointOnSegment(
      containerPoint,
      segmentStart,
      segmentEnd,
    );

    if (bestProjection && projection.distancePx >= bestProjection.distancePx) {
      continue;
    }

    const segmentLength = segmentStart.distanceTo(segmentEnd);

    bestProjection = {
      candidate,
      containerPoint: projection.point,
      latLng: map.containerPointToLatLng(projection.point),
      distancePx: projection.distancePx,
      segmentIndex: index,
      distanceAlong:
        candidate.cumulativeDistances[index] + segmentLength * projection.ratio,
    };
  }

  return bestProjection;
}

function scoreTraceProjection(
  projection: TraceProjection,
  preferredCandidate?: TraceCandidate | null,
  lastProjection?: TraceProjection | null,
) {
  const candidate = projection.candidate;
  const candidateIsActive = candidate.id === preferredCandidate?.id;
  const candidateIsSameLayer =
    preferredCandidate &&
    candidate.layerIndex === preferredCandidate.layerIndex;
  let score =
    projection.distancePx -
    candidate.visualPriority -
    Math.min(24, candidate.length / 120);

  if (preferredCandidate) {
    if (candidateIsActive) {
      score -= TRACE_ACTIVE_CANDIDATE_BONUS;
    } else if (candidateIsSameLayer) {
      score -= TRACE_ACTIVE_LAYER_BONUS;
    } else {
      score += TRACE_CANDIDATE_SWITCH_PENALTY;
    }
  }

  if (lastProjection) {
    const continuityDistance = projection.containerPoint.distanceTo(
      lastProjection.containerPoint,
    );

    // On garde une vraie inertie sur la ligne déjà suivie : l'utilisateur ne
    // suit jamais parfaitement les petits décrochements d'une frontière, donc
    // ces petits écarts ne doivent pas provoquer un changement de branche.
    score += candidateIsActive
      ? Math.min(14, continuityDistance * 0.08)
      : Math.min(82, continuityDistance * 0.65);
  }

  return score;
}

function findBestProjection(
  containerPoint: L.Point,
  candidates: TraceCandidate[],
  map: L.Map,
  maxDistancePx: number,
  preferredCandidate?: TraceCandidate | null,
  lastProjection?: TraceProjection | null,
  excludedCandidateId?: string | null,
): TraceProjection | null {
  let nearestProjection: TraceProjection | null = null;
  let nearestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.id === excludedCandidateId) {
      continue;
    }

    const projection = findNearestProjectionOnCandidate(
      containerPoint,
      candidate,
      map,
      maxDistancePx,
    );

    if (!projection || projection.distancePx > maxDistancePx) {
      continue;
    }

    const score = scoreTraceProjection(
      projection,
      preferredCandidate,
      lastProjection,
    );

    if (!nearestProjection || score < nearestScore) {
      nearestProjection = projection;
      nearestScore = score;
    }
  }

  return nearestProjection;
}

function getVectorDotSimilarity(
  firstStart: L.Point,
  firstEnd: L.Point,
  secondStart: L.Point,
  secondEnd: L.Point,
) {
  const firstDx = firstEnd.x - firstStart.x;
  const firstDy = firstEnd.y - firstStart.y;
  const secondDx = secondEnd.x - secondStart.x;
  const secondDy = secondEnd.y - secondStart.y;
  const firstLength = Math.sqrt(firstDx * firstDx + firstDy * firstDy);
  const secondLength = Math.sqrt(secondDx * secondDx + secondDy * secondDy);

  if (firstLength <= 0 || secondLength <= 0) {
    return -1;
  }

  return (
    (firstDx * secondDx + firstDy * secondDy) / (firstLength * secondLength)
  );
}

function shouldSwitchTraceCandidate(
  activeProjection: TraceProjection | null,
  alternativeProjection: TraceProjection | null,
  lastProjection: TraceProjection | null,
  currentCursorPoint: L.Point | null,
  previousCursorPoint: L.Point | null,
) {
  if (!alternativeProjection || !lastProjection) {
    return false;
  }

  const switchGap = alternativeProjection.containerPoint.distanceTo(
    lastProjection.containerPoint,
  );

  if (switchGap > TRACE_MAX_INTENTIONAL_SWITCH_GAP_PX) {
    return false;
  }

  if (alternativeProjection.distancePx > TRACE_DIRECTIONAL_SWITCH_DISTANCE_PX) {
    return false;
  }

  if (!activeProjection) {
    return (
      alternativeProjection.distancePx <= TRACE_INTENTIONAL_SWITCH_DISTANCE_PX
    );
  }

  const cursorIsClearlyCloserToAlternative =
    activeProjection.distancePx - alternativeProjection.distancePx >=
    TRACE_INTENTIONAL_SWITCH_IMPROVEMENT_PX;
  const activeLineIsClearlyLost =
    activeProjection.distancePx >= TRACE_ACTIVE_RELEASE_DISTANCE_PX &&
    alternativeProjection.distancePx <= TRACE_DIRECTIONAL_SWITCH_DISTANCE_PX;

  if (
    alternativeProjection.distancePx <= TRACE_INTENTIONAL_SWITCH_DISTANCE_PX &&
    (cursorIsClearlyCloserToAlternative || activeLineIsClearlyLost)
  ) {
    return true;
  }

  if (currentCursorPoint && previousCursorPoint) {
    const cursorMove = currentCursorPoint.distanceTo(previousCursorPoint);

    if (
      cursorMove >= TRACE_DIRECTIONAL_SWITCH_MIN_CURSOR_MOVE_PX &&
      alternativeProjection.distancePx <= TRACE_DIRECTIONAL_SWITCH_DISTANCE_PX
    ) {
      const activeDirectionScore = getVectorDotSimilarity(
        previousCursorPoint,
        currentCursorPoint,
        lastProjection.containerPoint,
        activeProjection.containerPoint,
      );
      const alternativeDirectionScore = getVectorDotSimilarity(
        previousCursorPoint,
        currentCursorPoint,
        lastProjection.containerPoint,
        alternativeProjection.containerPoint,
      );

      // Cas important aux embranchements : si le curseur part franchement sur une
      // branche à côté, on doit pouvoir quitter la frontière actuelle, même si la
      // ligne active reste encore proche à cause de l'inertie. En revanche, on
      // exige une vraie cohérence de direction pour ne pas réintroduire les sauts
      // parasites sur les petits zigzags que l'utilisateur ne suit pas au pixel.
      if (
        alternativeDirectionScore >= 0.28 &&
        alternativeDirectionScore - activeDirectionScore >=
          TRACE_DIRECTIONAL_SWITCH_DOT_ADVANTAGE
      ) {
        return true;
      }
    }
  }

  return false;
}

function findNearestProjection(
  containerPoint: L.Point,
  candidates: TraceCandidate[],
  map: L.Map,
  maxDistancePx: number,
  preferredCandidate?: TraceCandidate | null,
  lastProjection?: TraceProjection | null,
  previousCursorPoint?: L.Point | null,
): TraceProjection | null {
  if (!preferredCandidate || !lastProjection) {
    return findBestProjection(
      containerPoint,
      candidates,
      map,
      maxDistancePx,
      preferredCandidate,
      lastProjection,
    );
  }

  const activeProjection = findNearestProjectionOnCandidate(
    containerPoint,
    preferredCandidate,
    map,
    TRACE_STICKY_SNAP_DISTANCE_PX,
  );
  const alternativeProjection = findBestProjection(
    containerPoint,
    candidates,
    map,
    maxDistancePx,
    preferredCandidate,
    lastProjection,
    preferredCandidate.id,
  );

  if (
    alternativeProjection &&
    shouldSwitchTraceCandidate(
      activeProjection,
      alternativeProjection,
      lastProjection,
      containerPoint,
      previousCursorPoint ?? null,
    )
  ) {
    return {
      ...alternativeProjection,
      intentionalCandidateSwitch: true,
    };
  }

  if (activeProjection) {
    return activeProjection;
  }

  return alternativeProjection;
}

function getLatLngAtDistance(candidate: TraceCandidate, distance: number) {
  const safeDistance = Math.max(0, Math.min(candidate.length, distance));

  if (safeDistance <= 0) {
    return candidate.latLngs[0];
  }

  if (safeDistance >= candidate.length) {
    return candidate.latLngs[candidate.latLngs.length - 1];
  }

  for (
    let index = 0;
    index < candidate.cumulativeDistances.length - 1;
    index += 1
  ) {
    const segmentStartDistance = candidate.cumulativeDistances[index];
    const segmentEndDistance = candidate.cumulativeDistances[index + 1];

    if (
      safeDistance < segmentStartDistance ||
      safeDistance > segmentEndDistance
    ) {
      continue;
    }

    const segmentDistance = segmentEndDistance - segmentStartDistance;
    const ratio =
      segmentDistance <= 0
        ? 0
        : (safeDistance - segmentStartDistance) / segmentDistance;
    const start = candidate.latLngs[index];
    const end = candidate.latLngs[index + 1];

    return L.latLng(
      start.lat + (end.lat - start.lat) * ratio,
      start.lng + (end.lng - start.lng) * ratio,
    );
  }

  return candidate.latLngs[candidate.latLngs.length - 1];
}

function getForwardPath(
  candidate: TraceCandidate,
  fromDistance: number,
  toDistance: number,
) {
  const startDistance = Math.max(0, Math.min(candidate.length, fromDistance));
  const endDistance = Math.max(0, Math.min(candidate.length, toDistance));
  const points: L.LatLng[] = [getLatLngAtDistance(candidate, startDistance)];

  for (let index = 1; index < candidate.latLngs.length - 1; index += 1) {
    const distance = candidate.cumulativeDistances[index];

    if (distance > startDistance && distance < endDistance) {
      points.push(candidate.latLngs[index]);
    }
  }

  points.push(getLatLngAtDistance(candidate, endDistance));

  return points;
}

function getPathBetweenProjections(
  fromProjection: TraceProjection,
  toProjection: TraceProjection,
) {
  const candidate = fromProjection.candidate;
  const fromDistance = fromProjection.distanceAlong;
  const toDistance = toProjection.distanceAlong;

  if (candidate.id !== toProjection.candidate.id || candidate.length <= 0) {
    return [fromProjection.latLng, toProjection.latLng];
  }

  if (!candidate.closed) {
    if (toDistance >= fromDistance) {
      return getForwardPath(candidate, fromDistance, toDistance);
    }

    return getForwardPath(candidate, toDistance, fromDistance).reverse();
  }

  const forwardDistance =
    toDistance >= fromDistance
      ? toDistance - fromDistance
      : candidate.length - fromDistance + toDistance;
  const backwardDistance = candidate.length - forwardDistance;

  if (forwardDistance <= backwardDistance) {
    if (toDistance >= fromDistance) {
      return getForwardPath(candidate, fromDistance, toDistance);
    }

    const firstPart = getForwardPath(candidate, fromDistance, candidate.length);
    const secondPart = getForwardPath(candidate, 0, toDistance);

    return [...firstPart, ...secondPart.slice(1)];
  }

  if (fromDistance >= toDistance) {
    return getForwardPath(candidate, toDistance, fromDistance).reverse();
  }

  const firstPart = getForwardPath(
    candidate,
    toDistance,
    candidate.length,
  ).reverse();
  const secondPart = getForwardPath(candidate, 0, fromDistance).reverse();

  return [...secondPart, ...firstPart.slice(1)];
}

function getPathPixelDistance(path: L.LatLng[], map: L.Map) {
  if (path.length < 2) {
    return 0;
  }

  let distance = 0;

  for (let index = 1; index < path.length; index += 1) {
    distance += map
      .latLngToContainerPoint(path[index - 1])
      .distanceTo(map.latLngToContainerPoint(path[index]));
  }

  return distance;
}

function pushLatLngIfUseful(points: L.LatLng[], latLng: L.LatLng, map: L.Map) {
  const previousPoint = points[points.length - 1];

  if (!previousPoint) {
    points.push(latLng);
    return;
  }

  if (previousPoint.equals(latLng, 0.0000001)) {
    return;
  }

  if (
    map
      .latLngToContainerPoint(previousPoint)
      .distanceTo(map.latLngToContainerPoint(latLng)) < 1.25
  ) {
    return;
  }

  points.push(latLng);
}

function appendTracePath(
  currentPoints: L.LatLng[],
  path: L.LatLng[],
  map: L.Map,
) {
  const nextPoints = [...currentPoints];

  for (const latLng of path) {
    pushLatLngIfUseful(nextPoints, latLng, map);
  }

  return limitLatLngs(nextPoints, MAX_TRACED_FEATURE_POINTS);
}

function limitLatLngs(points: L.LatLng[], maxPointCount: number) {
  if (points.length <= maxPointCount || maxPointCount < 2) {
    return points;
  }

  const limitedPoints: L.LatLng[] = [];

  for (let index = 0; index < maxPointCount; index += 1) {
    const sourceIndex = Math.round(
      (index * (points.length - 1)) / (maxPointCount - 1),
    );
    limitedPoints.push(points[sourceIndex]);
  }

  return limitedPoints;
}

function getTotalPixelDistance(points: L.LatLng[], map: L.Map) {
  if (points.length < 2) {
    return 0;
  }

  let distance = 0;

  for (let index = 1; index < points.length; index += 1) {
    distance += map
      .latLngToContainerPoint(points[index - 1])
      .distanceTo(map.latLngToContainerPoint(points[index]));
  }

  return distance;
}

function createTracedLineFeature(points: L.LatLng[]): DroMapFeature {
  const feature: DroMapFeature = {
    type: "Feature",
    id: crypto.randomUUID(),
    geometry: {
      type: "LineString",
      coordinates: points.map(
        (point) => [point.lng, point.lat] as [number, number],
      ),
    },
    properties: {
      type: "line",
      label: "Trait suivi",
      legendLabel: "Trait suivi",
      lineVariant: "traced",
      style: {
        color: "#111827",
        opacity: 1,
        weight: 4,
        dashStyle: "solid",
        arrowStart: false,
        arrowEnd: false,
      },
      meta: { version: 1 },
    },
  };

  return applyDrawingPresetToFeature(feature);
}

function createPlainPreviewPolyline(feature: DroMapFeature) {
  if (feature.geometry.type !== "LineString") {
    return null;
  }

  const latLngs = feature.geometry.coordinates
    .filter(
      (coordinate): coordinate is [number, number] =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1]),
    )
    .map((coordinate) => L.latLng(coordinate[1], coordinate[0]));

  if (latLngs.length < 2) {
    return null;
  }

  return L.polyline(latLngs, getPreviewPathOptions(feature));
}

function addPreviewFeatureToLayerGroup(
  feature: DroMapFeature,
  layerGroup: L.LayerGroup,
  map: L.Map,
) {
  layerGroup.clearLayers();

  if (feature.geometry.type !== "LineString") {
    return;
  }

  if (!featureHasLineArrow(feature)) {
    const plainPolyline = createPlainPreviewPolyline(feature);

    if (plainPolyline) {
      plainPolyline.addTo(layerGroup);
    }

    return;
  }

  const bodyLayer = createLineArrowBodyLeafletLayer(
    feature,
    map,
    L,
    getPreviewPathOptions(feature),
  );
  const arrowLayer = createLineArrowLeafletLayer(feature, map, L);

  if (bodyLayer) {
    bodyLayer.addTo(layerGroup);
  }

  if (arrowLayer) {
    const arrowStyle = getLineArrowStyle(feature);
    const arrowOpacity = Math.max(0.18, Math.min(1, arrowStyle.opacity));

    if (arrowLayer instanceof L.Polygon) {
      arrowLayer.setStyle({
        opacity: arrowOpacity,
        fillOpacity: arrowOpacity,
      });
    } else if (arrowLayer instanceof L.FeatureGroup) {
      arrowLayer.eachLayer((layer) => {
        if (layer instanceof L.Polygon) {
          layer.setStyle({
            opacity: arrowOpacity,
            fillOpacity: arrowOpacity,
          });
        }
      });
    }

    arrowLayer.addTo(layerGroup);
  }
}

function collectGeoJsonTraceLineStringsFromGeometry(
  geometry: DromapGeoJsonGeometry,
): DromapBoundaryLineString[] {
  if (geometry.type === "LineString") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates;
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates;
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => polygon);
  }

  return [];
}

function featureHasTraceableStroke(
  layer: DromapGeoJsonLayer,
  feature: DromapGeoJsonFeature,
) {
  const style = getEffectiveGeoJsonFeatureStyle(layer, feature);

  return (
    layer.visible !== false && layer.opacity > 0 && style.strokeOpacity > 0
  );
}

function getGeoJsonTraceLineLayers(
  geoJsonLayers: DromapGeoJsonLayer[],
  layerIndexOffset: number,
  workspaceBounds: ReturnType<
    typeof useEditorTestWorkspaceStore.getState
  >["workspaceBounds"],
): LoadedTraceLineLayer[] {
  return getRenderableGeoJsonLayers(geoJsonLayers).flatMap(
    (layer, visibleLayerIndex) => {
      const displayData = getGeoJsonLayerLoadedDisplayData(
        layer,
        workspaceBounds,
      );
      const lineStrings: DromapBoundaryLineString[] = [];
      let maxStrokeWeight = Math.max(1, layer.style.strokeWeight ?? 2);
      let maxStrokeOpacity = Math.max(0.05, layer.style.strokeOpacity ?? 1);

      for (const feature of displayData.features) {
        if (!featureHasTraceableStroke(layer, feature)) {
          continue;
        }

        const featureLineStrings = collectGeoJsonTraceLineStringsFromGeometry(
          feature.geometry,
        );

        if (featureLineStrings.length === 0) {
          continue;
        }

        const featureStyle = getEffectiveGeoJsonFeatureStyle(layer, feature);
        maxStrokeWeight = Math.max(maxStrokeWeight, featureStyle.strokeWeight);
        maxStrokeOpacity = Math.max(
          maxStrokeOpacity,
          featureStyle.strokeOpacity,
        );
        lineStrings.push(...featureLineStrings);
      }

      if (lineStrings.length === 0) {
        return [];
      }

      return [
        {
          sourceId: `geojson:${layer.id}`,
          sourceKind: "geojson" as const,
          layerIndex: layerIndexOffset + visibleLayerIndex,
          lineStrings,
          strokeWeight: maxStrokeWeight,
          strokeOpacity: maxStrokeOpacity * layer.opacity,
        },
      ];
    },
  );
}

async function loadBoundaryLineStringsForLayer(
  layerConfig: DromapBasemapBoundaryLayer,
  layerIndex: number,
): Promise<LoadedTraceLineLayer> {
  const featureCollection = await loadDromapBoundaryFeatureCollection(
    layerConfig.dataUrl,
  );

  return {
    sourceId: `basemap:${layerConfig.kind}:${layerIndex}`,
    sourceKind: "basemap",
    layerIndex,
    lineStrings: getDromapBoundaryRenderableLineStrings(
      featureCollection,
      layerConfig,
    ),
    strokeWeight: layerConfig.strokeWeight ?? 1,
    strokeOpacity: layerConfig.strokeOpacity ?? 1,
  };
}

export function TraceLineToolLayer() {
  const map = useMap();
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const activeTool = useEditorTestToolStore((state) => state.activeTool);
  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);
  const addFeatureWithHistory = useEditorTestFeaturesStore(
    (state) => state.addFeatureWithHistory,
  );
  const lineStyle = useEditorTestDrawingOptionsStore(
    (state) => state.lineStyle,
  );
  const geoJsonLayers = useEditorTestGeoJsonLayersStore(
    (state) => state.geoJsonLayers,
  );
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );

  useEffect(() => {
    if (currentMode !== "edit" || activeTool !== "trace-line") {
      return;
    }

    const basemap = getDromapBasemapConfig(basemapId);
    const boundaryOverlay = basemap.boundaryOverlay;

    deactivateGeomanModes(map);
    map.pm.disableDraw();

    const container = map.getContainer();
    const previousCursor = container.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const wasMapDraggingEnabled = map.dragging.enabled();

    // En Suivi de trait, un clic-glissé doit uniquement servir au tracé.
    // Même si le curseur n'est pas assez proche d'une frontière, la carte ne doit
    // pas partir en pan : cela rend l'outil imprécis et peut déplacer la zone visée.
    map.dragging.disable();

    let isDisposed = false;
    let isTracing = false;
    let loadedTraceLineLayers: LoadedTraceLineLayer[] = [];
    let candidates: TraceCandidate[] = [];
    let activeCandidate: TraceCandidate | null = null;
    let lastProjection: TraceProjection | null = null;
    let previousCursorPoint: L.Point | null = null;
    let tracedPoints: L.LatLng[] = [];
    let previewLayer: L.LayerGroup | null = null;

    const ensurePreviewLayer = () => {
      if (!previewLayer) {
        previewLayer = L.layerGroup().addTo(map);
      }

      return previewLayer;
    };

    const removePreviewLayer = () => {
      if (previewLayer) {
        map.removeLayer(previewLayer);
        previewLayer = null;
      }
    };

    const refreshCandidates = () => {
      candidates = buildTraceCandidates(loadedTraceLineLayers, map);
    };

    const refreshPreview = () => {
      if (!isTracing || tracedPoints.length < 2) {
        removePreviewLayer();
        return;
      }

      const feature = {
        ...createTracedLineFeature(tracedPoints),
        id: "dromap-trace-line-preview",
      };
      addPreviewFeatureToLayerGroup(feature, ensurePreviewLayer(), map);
    };

    const appendProjection = (projection: TraceProjection) => {
      if (!lastProjection) {
        tracedPoints = [projection.latLng];
        lastProjection = projection;
        activeCandidate = projection.candidate;
        refreshPreview();
        return;
      }

      const directGap = lastProjection.containerPoint.distanceTo(
        projection.containerPoint,
      );
      let path: L.LatLng[] = [];

      if (lastProjection.candidate.id !== projection.candidate.id) {
        // Les frontières visibles peuvent être découpées en plusieurs petits
        // segments. Par défaut, on ne change que localement. Le changement plus
        // large est accepté uniquement quand la recherche a détecté une intention
        // nette : le curseur est vraiment parti sur une autre branche, et pas
        // juste à côté d'un petit zigzag que l'utilisateur n'a pas suivi au pixel.
        const maxSwitchGap = projection.intentionalCandidateSwitch
          ? TRACE_MAX_INTENTIONAL_SWITCH_GAP_PX
          : TRACE_MAX_CANDIDATE_SWITCH_GAP_PX;

        if (directGap > maxSwitchGap) {
          return;
        }

        path = [projection.latLng];
      } else {
        if (directGap > TRACE_MAX_SAME_CANDIDATE_JUMP_PX) {
          return;
        }

        path = getPathBetweenProjections(lastProjection, projection);
        const pathDistance = getPathPixelDistance(path, map);
        const maxExpectedPathDistance = Math.max(
          32,
          directGap * TRACE_MAX_PATH_TO_DIRECT_RATIO,
        );

        if (pathDistance > maxExpectedPathDistance) {
          return;
        }
      }

      tracedPoints = appendTracePath(tracedPoints, path, map);
      lastProjection = projection;
      activeCandidate = projection.candidate;
      refreshPreview();
    };

    const getProjectionFromMouseEvent = (
      event: MouseEvent | L.LeafletMouseEvent,
    ) => {
      const originalEvent =
        "originalEvent" in event ? event.originalEvent : event;
      const containerPoint = map.mouseEventToContainerPoint(originalEvent);
      const projection = findNearestProjection(
        containerPoint,
        candidates,
        map,
        isTracing ? TRACE_SNAP_DISTANCE_PX : TRACE_START_SNAP_DISTANCE_PX,
        activeCandidate,
        lastProjection,
        previousCursorPoint,
      );

      if (isTracing) {
        previousCursorPoint = containerPoint;
      }

      return projection;
    };

    const finishTracing = () => {
      if (!isTracing) {
        return;
      }

      isTracing = false;
      container.style.cursor = "none";
      document.body.style.userSelect = previousUserSelect;
      document.removeEventListener("mousemove", handleDocumentMouseMove, true);
      document.removeEventListener("mouseup", handleDocumentMouseUp, true);

      const finalPoints = tracedPoints;
      tracedPoints = [];
      lastProjection = null;
      activeCandidate = null;
      previousCursorPoint = null;
      removePreviewLayer();

      if (
        finalPoints.length < 2 ||
        getTotalPixelDistance(finalPoints, map) < MIN_TRACED_DISTANCE_PX
      ) {
        return;
      }

      addFeatureWithHistory(createTracedLineFeature(finalPoints));
    };

    function handleDocumentMouseMove(event: MouseEvent) {
      if (!isTracing) {
        return;
      }

      event.preventDefault();
      const projection = getProjectionFromMouseEvent(event);

      if (!projection) {
        return;
      }

      appendProjection(projection);
    }

    function handleDocumentMouseUp(event: MouseEvent) {
      if (!isTracing) {
        return;
      }

      event.preventDefault();
      const projection = getProjectionFromMouseEvent(event);

      if (projection) {
        appendProjection(projection);
      }

      finishTracing();
    }

    const handleMapMouseDown = (event: L.LeafletMouseEvent) => {
      const originalEvent = event.originalEvent;

      if (originalEvent.button !== 0) {
        return;
      }

      // En mode Suivi de trait, le clic-glissé ne doit jamais déclencher le
      // pan Leaflet. On bloque donc immédiatement l'événement, même quand le
      // point de départ n'est pas assez proche d'une ligne vectorielle.
      L.DomEvent.stop(originalEvent);
      originalEvent.preventDefault();

      const projection = getProjectionFromMouseEvent(event);

      if (!projection) {
        return;
      }

      isTracing = true;
      tracedPoints = [projection.latLng];
      lastProjection = projection;
      activeCandidate = projection.candidate;
      previousCursorPoint = map.mouseEventToContainerPoint(originalEvent);
      container.style.cursor = "none";
      document.body.style.userSelect = "none";
      removePreviewLayer();
      refreshPreview();

      document.addEventListener("mousemove", handleDocumentMouseMove, true);
      document.addEventListener("mouseup", handleDocumentMouseUp, true);
    };

    const reloadTraceLineStrings = async () => {
      let loadedBasemapLineLayers: LoadedTraceLineLayer[] = [];

      if (boundaryOverlay) {
        try {
          loadedBasemapLineLayers = await Promise.all(
            boundaryOverlay.layers
              .filter(
                (layerConfig) =>
                  layerConfig.displayRole !== "country-neighbor-context",
              )
              .map((layerConfig, layerIndex) =>
                loadBoundaryLineStringsForLayer(layerConfig, layerIndex),
              ),
          );
        } catch (error) {
          console.warn("Suivi de trait indisponible sur ce fond :", error);
          loadedBasemapLineLayers = [];
        }
      }

      if (isDisposed) {
        return;
      }

      const loadedGeoJsonLineLayers = getGeoJsonTraceLineLayers(
        geoJsonLayers,
        loadedBasemapLineLayers.length,
        workspaceBounds,
      );

      loadedTraceLineLayers = [
        ...loadedBasemapLineLayers,
        ...loadedGeoJsonLineLayers,
      ];
      refreshCandidates();
    };

    const handleMapChanged = () => {
      refreshCandidates();
      refreshPreview();
    };

    container.style.cursor = "none";
    map.on("mousedown", handleMapMouseDown);
    map.on("moveend zoomend resize", handleMapChanged);
    void reloadTraceLineStrings();

    return () => {
      isDisposed = true;
      map.off("mousedown", handleMapMouseDown);
      map.off("moveend zoomend resize", handleMapChanged);
      document.removeEventListener("mousemove", handleDocumentMouseMove, true);
      document.removeEventListener("mouseup", handleDocumentMouseUp, true);
      removePreviewLayer();
      isTracing = false;
      loadedTraceLineLayers = [];
      candidates = [];
      tracedPoints = [];
      lastProjection = null;
      activeCandidate = null;
      previousCursorPoint = null;
      container.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;

      if (wasMapDraggingEnabled) {
        map.dragging.enable();
      }
    };
  }, [
    activeTool,
    addFeatureWithHistory,
    basemapId,
    currentMode,
    lineStyle,
    geoJsonLayers,
    workspaceBounds,
    map,
  ]);

  return null;
}
