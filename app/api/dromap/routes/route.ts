import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextRequest, NextResponse } from "next/server";

import {
  getDromapRoadCategoryForHighway,
  getDromapRoadImportHighwayValues,
  getDromapRoadImportMaxAreaKm2,
  isDromapRoadImportCategory,
  type DromapRoadImportCategory,
} from "@/lib/dromap/road-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REQUEST_TIMEOUT_MS = 45_000;
const MAX_RAW_WAYS = 60_000;
const MAX_SELECTION_FEATURES = 25_000;
const PARALLEL_ROAD_DISTANCE_M = {
  motorways: 90,
  main: 70,
} as const;

const DEFAULT_OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

type Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type OverpassCoordinate = { lat?: unknown; lon?: unknown };
type OverpassWay = {
  type?: unknown;
  id?: unknown;
  tags?: unknown;
  nodes?: unknown;
  geometry?: unknown;
};
type OverpassResponse = {
  elements?: unknown;
  remark?: unknown;
};

type Position = [number, number];

type ParsedWay = {
  id: number;
  highway: string;
  name: string | null;
  ref: string | null;
  tags: Record<string, string>;
  nodeIds: number[];
  geometry: Position[];
};

type RoadPart = {
  id: number;
  category: DromapRoadImportCategory;
  highway: string;
  name: string | null;
  ref: string | null;
  tags: Record<string, string>;
  nodeIds: number[];
  lines: Position[][];
  isConnector?: boolean;
  connectorGroups?: string[];
  connectorId?: string;
};

type GroupedRoad = {
  type: "Feature";
  id: string;
  geometry:
    | { type: "LineString"; coordinates: Position[] }
    | { type: "MultiLineString"; coordinates: Position[][] };
  properties: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFiniteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseBounds(request: NextRequest): Bounds | null {
  const south = parseFiniteNumber(request.nextUrl.searchParams.get("south"));
  const west = parseFiniteNumber(request.nextUrl.searchParams.get("west"));
  const north = parseFiniteNumber(request.nextUrl.searchParams.get("north"));
  const east = parseFiniteNumber(request.nextUrl.searchParams.get("east"));

  if (south === null || west === null || north === null || east === null) {
    return null;
  }

  const normalized = {
    south: clamp(Math.min(south, north), -85.05112878, 85.05112878),
    west: clamp(Math.min(west, east), -180, 180),
    north: clamp(Math.max(south, north), -85.05112878, 85.05112878),
    east: clamp(Math.max(west, east), -180, 180),
  };

  if (normalized.south >= normalized.north || normalized.west >= normalized.east) {
    return null;
  }

  return normalized;
}

function parseCategories(request: NextRequest): DromapRoadImportCategory[] {
  const values: string[] = (request.nextUrl.searchParams.get("categories") ?? "")
    .split(",")
    .map((value: string) => value.trim())
    .filter(Boolean);
  const valid = values.filter(isDromapRoadImportCategory);
  return [...new Set<DromapRoadImportCategory>(valid)];
}

function getAreaKm2(bounds: Bounds) {
  const middleLatitude = (bounds.south + bounds.north) / 2;
  const heightKm = Math.abs(bounds.north - bounds.south) * 111.32;
  const widthKm =
    Math.abs(bounds.east - bounds.west) *
    111.32 *
    Math.max(0.05, Math.cos((middleLatitude * Math.PI) / 180));
  return widthKm * heightKm;
}

function getOverpassEndpoints() {
  const configured = process.env.DROMAP_OVERPASS_API_URLS
    ?.split(",")
    .map((value: string) => value.trim())
    .filter(Boolean);

  if (configured?.length) {
    return configured;
  }

  const single = process.env.DROMAP_OVERPASS_API_URL?.trim();
  if (single) {
    return [single];
  }

  return [...DEFAULT_OVERPASS_ENDPOINTS];
}

function buildQuery(bounds: Bounds, highwayValues: string[]) {
  const escapedValues = highwayValues.map((value) => value.replace(/[^a-z_]/g, ""));
  const pattern = `^(${escapedValues.join("|")})$`;
  const bbox = [bounds.south, bounds.west, bounds.north, bounds.east].join(",");

  // `body geom` conserve les identifiants de nœuds : ils permettent de distinguer
  // une vraie liaison entre deux autoroutes d'une simple bretelle de sortie.
  return `[out:json][timeout:40];\nway["highway"~"${pattern}"](${bbox});\nout body geom qt;`;
}

async function fetchOverpass(query: string) {
  let lastError: unknown = null;

  for (const endpoint of getOverpassEndpoints()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "DroMap/1.0 road-import",
        },
        body: new URLSearchParams({ data: query }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Service routes indisponible (${response.status}).`);
      }

      const payload = (await response.json()) as OverpassResponse;
      if (typeof payload.remark === "string" && /runtime error|timed out|out of memory/i.test(payload.remark)) {
        throw new Error("La requête de routes est trop lourde pour le service de données.");
      }
      return payload;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Le service de routes est momentanément indisponible.");
}

function parseTags(value: unknown) {
  if (!isRecord(value)) return {};
  const tags: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue === "string") tags[key] = rawValue;
  }
  return tags;
}

function parseNodeIds(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];
  return value
    .map(parseFiniteNumber)
    .filter((nodeId): nodeId is number => nodeId !== null)
    .map((nodeId) => Math.trunc(nodeId));
}

function parseGeometry(value: unknown) {
  if (!Array.isArray(value)) return [] as Position[];
  const positions: Position[] = [];

  for (const rawCoordinate of value) {
    if (!isRecord(rawCoordinate)) continue;
    const lat = parseFiniteNumber((rawCoordinate as OverpassCoordinate).lat);
    const lon = parseFiniteNumber((rawCoordinate as OverpassCoordinate).lon);
    if (lat === null || lon === null) continue;
    const position: Position = [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
    const previous = positions.at(-1);
    if (!previous || previous[0] !== position[0] || previous[1] !== position[1]) {
      positions.push(position);
    }
  }

  return positions;
}

function samePosition(a: Position, b: Position, epsilon = 1e-7) {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function clipSegmentToBounds(a: Position, b: Position, bounds: Bounds): [Position, Position] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;

  const checks: Array<[number, number]> = [
    [-dx, a[0] - bounds.west],
    [dx, bounds.east - a[0]],
    [-dy, a[1] - bounds.south],
    [dy, bounds.north - a[1]],
  ];

  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-15) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }

  const start: Position = [a[0] + t0 * dx, a[1] + t0 * dy];
  const end: Position = [a[0] + t1 * dx, a[1] + t1 * dy];
  return [start, end];
}

function clipLineToBounds(coordinates: Position[], bounds: Bounds) {
  const lines: Position[][] = [];
  let current: Position[] = [];

  const flush = () => {
    if (current.length >= 2) lines.push(current);
    current = [];
  };

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const clipped = clipSegmentToBounds(coordinates[index], coordinates[index + 1], bounds);
    if (!clipped) {
      flush();
      continue;
    }

    const [start, end] = clipped;
    const last = current.at(-1);
    if (!last || !samePosition(last, start)) {
      flush();
      current = [start, end];
    } else if (!samePosition(last, end)) {
      current.push(end);
    }
  }

  flush();
  return lines;
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRoadRef(value: string) {
  return normalizeKey(value).replace(/[^a-z0-9]/g, "");
}

function getRoadGroupKeyFromValues(
  category: DromapRoadImportCategory,
  id: number,
  ref: string | null,
  name: string | null,
) {
  if (ref) return `${category}:ref:${normalizeRoadRef(ref)}`;
  if (name) return `${category}:name:${normalizeKey(name)}`;
  return `${category}:way:${id}`;
}

function getRoadGroupKey(part: RoadPart) {
  return getRoadGroupKeyFromValues(part.category, part.id, part.ref, part.name);
}

function endpointKey(position: Position) {
  return `${position[0].toFixed(7)},${position[1].toFixed(7)}`;
}

function turnContinuationScore(
  previous: Position | undefined,
  junction: Position,
  next: Position | undefined,
) {
  if (!previous || !next) return 1;
  const inX = junction[0] - previous[0];
  const inY = junction[1] - previous[1];
  const outX = next[0] - junction[0];
  const outY = next[1] - junction[1];
  const denominator = Math.hypot(inX, inY) * Math.hypot(outX, outY);
  if (denominator <= 1e-15) return 1;
  return (inX * outX + inY * outY) / denominator;
}

function stitchLines(lines: Position[][], avoidUTurns = false) {
  const remaining = lines.map((line) => line.map((point) => [point[0], point[1]] as Position));
  const stitched: Position[][] = [];

  while (remaining.length > 0) {
    const current = remaining.shift() ?? [];
    if (current.length < 2) continue;

    let changed = true;
    while (changed && remaining.length > 0) {
      changed = false;
      const first = current[0];
      const second = current[1];
      const penultimate = current.at(-2);
      const last = current.at(-1) as Position;
      type StitchOption = {
        index: number;
        mode: "append" | "prepend";
        reversed: boolean;
        score: number;
      };
      let best: StitchOption | null = null;

      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        const candidateFirst = candidate[0];
        const candidateSecond = candidate[1];
        const candidateLast = candidate.at(-1) as Position;
        const candidatePenultimate = candidate.at(-2);
        let option: StitchOption | null = null;

        if (endpointKey(last) === endpointKey(candidateFirst)) {
          option = {
            index,
            mode: "append",
            reversed: false,
            score: turnContinuationScore(penultimate, last, candidateSecond),
          };
        } else if (endpointKey(last) === endpointKey(candidateLast)) {
          option = {
            index,
            mode: "append",
            reversed: true,
            score: turnContinuationScore(penultimate, last, candidatePenultimate),
          };
        } else if (endpointKey(first) === endpointKey(candidateLast)) {
          option = {
            index,
            mode: "prepend",
            reversed: false,
            score: turnContinuationScore(candidatePenultimate, first, second),
          };
        } else if (endpointKey(first) === endpointKey(candidateFirst)) {
          option = {
            index,
            mode: "prepend",
            reversed: true,
            score: turnContinuationScore(candidateSecond, first, second),
          };
        }

        if (!option) continue;
        if (avoidUTurns && option.score < -0.35) continue;
        if (!best || option.score > best.score) best = option;
      }

      if (!best) continue;
      const candidate = remaining[best.index];
      const oriented = best.reversed ? [...candidate].reverse() : candidate;
      if (best.mode === "append") {
        current.push(...oriented.slice(1));
      } else {
        current.unshift(...oriented.slice(0, -1));
      }
      remaining.splice(best.index, 1);
      changed = true;
    }

    stitched.push(current);
  }

  return stitched;
}

function getReferenceLatitude(lines: Position[][]) {
  let total = 0;
  let count = 0;
  for (const line of lines) {
    for (const point of line) {
      total += point[1];
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}

function toLocalMeters(position: Position, referenceLatitude: number): [number, number] {
  const cosLat = Math.max(0.05, Math.cos((referenceLatitude * Math.PI) / 180));
  return [position[0] * 111_320 * cosLat, position[1] * 111_320];
}

function distanceMeters(a: Position, b: Position, referenceLatitude: number) {
  const [ax, ay] = toLocalMeters(a, referenceLatitude);
  const [bx, by] = toLocalMeters(b, referenceLatitude);
  return Math.hypot(ax - bx, ay - by);
}

function lineLengthMeters(line: Position[], referenceLatitude: number) {
  let total = 0;
  for (let index = 1; index < line.length; index += 1) {
    total += distanceMeters(line[index - 1], line[index], referenceLatitude);
  }
  return total;
}

function nearestPointOnSegment(
  point: Position,
  a: Position,
  b: Position,
  referenceLatitude: number,
): { point: Position; distanceM: number } {
  const p = toLocalMeters(point, referenceLatitude);
  const pa = toLocalMeters(a, referenceLatitude);
  const pb = toLocalMeters(b, referenceLatitude);
  const vx = pb[0] - pa[0];
  const vy = pb[1] - pa[1];
  const denominator = vx * vx + vy * vy;
  const t = denominator <= 1e-9
    ? 0
    : clamp(((p[0] - pa[0]) * vx + (p[1] - pa[1]) * vy) / denominator, 0, 1);
  const snapped: Position = [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  return { point: snapped, distanceM: distanceMeters(point, snapped, referenceLatitude) };
}

function nearestPointOnLines(
  point: Position,
  lines: Position[][],
  referenceLatitude: number,
): { point: Position; distanceM: number } | null {
  let best: { point: Position; distanceM: number } | null = null;
  for (const line of lines) {
    for (let index = 1; index < line.length; index += 1) {
      const candidate = nearestPointOnSegment(point, line[index - 1], line[index], referenceLatitude);
      if (!best || candidate.distanceM < best.distanceM) best = candidate;
    }
  }
  return best;
}

function sampleLine(line: Position[], referenceLatitude: number, sampleCount = 24) {
  if (line.length <= 2) return line;
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 1; index < line.length; index += 1) {
    const length = distanceMeters(line[index - 1], line[index], referenceLatitude);
    segmentLengths.push(length);
    totalLength += length;
  }
  if (totalLength <= 0) return [line[0], line.at(-1) as Position];

  const targetCount = Math.max(2, Math.min(sampleCount, Math.ceil(totalLength / 5000) + 4));
  const samples: Position[] = [];
  for (let sampleIndex = 0; sampleIndex < targetCount; sampleIndex += 1) {
    const target = (sampleIndex / (targetCount - 1)) * totalLength;
    let walked = 0;
    for (let segmentIndex = 0; segmentIndex < segmentLengths.length; segmentIndex += 1) {
      const length = segmentLengths[segmentIndex];
      if (target <= walked + length || segmentIndex === segmentLengths.length - 1) {
        const ratio = length <= 1e-9 ? 0 : clamp((target - walked) / length, 0, 1);
        const a = line[segmentIndex];
        const b = line[segmentIndex + 1];
        samples.push([
          a[0] + (b[0] - a[0]) * ratio,
          a[1] + (b[1] - a[1]) * ratio,
        ]);
        break;
      }
      walked += length;
    }
  }
  return samples;
}

function isMostlyParallelDuplicate(
  candidate: Position[],
  reference: Position[],
  referenceLatitude: number,
  maxDistanceM: number,
) {
  const candidateLength = lineLengthMeters(candidate, referenceLatitude);
  const referenceLength = lineLengthMeters(reference, referenceLatitude);
  if (candidateLength < 80 || referenceLength < 80) return false;

  const samples = sampleLine(candidate, referenceLatitude);
  const closeSamples = samples.filter((point) => {
    const nearest = nearestPointOnLines(point, [reference], referenceLatitude);
    return nearest !== null && nearest.distanceM <= maxDistanceM;
  }).length;

  const closeRatio = closeSamples / Math.max(1, samples.length);
  const candidateNotMuchLonger = candidateLength <= referenceLength * 1.35;
  return closeRatio >= 0.82 && candidateNotMuchLonger;
}

function collapseParallelRoadLines(lines: Position[][], maxDistanceM: number) {
  if (lines.length <= 1) return lines;
  const referenceLatitude = getReferenceLatitude(lines);
  const sorted = [...lines].sort(
    (a, b) => lineLengthMeters(b, referenceLatitude) - lineLengthMeters(a, referenceLatitude),
  );
  const kept: Position[][] = [];

  for (const candidate of sorted) {
    const duplicate = kept.some((reference) =>
      isMostlyParallelDuplicate(candidate, reference, referenceLatitude, maxDistanceM),
    );
    if (!duplicate) kept.push(candidate);
  }

  return kept;
}

function parseWays(payload: OverpassResponse) {
  const elements = Array.isArray(payload.elements) ? (payload.elements as OverpassWay[]) : [];
  if (elements.length > MAX_RAW_WAYS) {
    throw new Error(
      "Cette zone contient trop de segments routiers pour une sélection interactive. Réduis la zone ou choisis moins de catégories.",
    );
  }

  const ways: ParsedWay[] = [];
  for (const element of elements) {
    if (element.type !== "way") continue;
    const id = parseFiniteNumber(element.id);
    if (id === null) continue;
    const tags = parseTags(element.tags);
    const highway = tags.highway;
    if (!highway) continue;
    const geometry = parseGeometry(element.geometry);
    if (geometry.length < 2) continue;
    ways.push({
      id: Math.trunc(id),
      highway,
      name: tags.name?.trim() || null,
      ref: tags.ref?.trim() || null,
      tags,
      nodeIds: parseNodeIds(element.nodes),
      geometry,
    });
  }
  return ways;
}

function buildRoadParts(ways: ParsedWay[], bounds: Bounds) {
  const mainParts: RoadPart[] = [];
  const motorwayWays: ParsedWay[] = [];
  const motorwayLinks: ParsedWay[] = [];

  for (const way of ways) {
    if (way.highway === "motorway_link") {
      motorwayLinks.push(way);
      continue;
    }
    if (way.highway.endsWith("_link")) continue;

    const category = getDromapRoadCategoryForHighway(way.highway);
    if (!category) continue;
    const lines = clipLineToBounds(way.geometry, bounds);
    if (!lines.length) continue;

    const part: RoadPart = {
      id: way.id,
      category,
      highway: way.highway,
      name: way.name,
      ref: way.ref,
      tags: way.tags,
      nodeIds: way.nodeIds,
      lines,
    };
    mainParts.push(part);
    if (way.highway === "motorway") motorwayWays.push(way);
  }

  if (motorwayLinks.length === 0 || motorwayWays.length === 0) {
    return mainParts;
  }

  const motorwayGroupsByNode = new Map<number, Set<string>>();
  for (const way of motorwayWays) {
    const groupKey = getRoadGroupKeyFromValues("motorways", way.id, way.ref, way.name);
    for (const nodeId of way.nodeIds) {
      const groups = motorwayGroupsByNode.get(nodeId) ?? new Set<string>();
      groups.add(groupKey);
      motorwayGroupsByNode.set(nodeId, groups);
    }
  }

  const linkIndexesByNode = new Map<number, number[]>();
  motorwayLinks.forEach((way, index) => {
    for (const nodeId of way.nodeIds) {
      linkIndexesByNode.set(nodeId, [...(linkIndexesByNode.get(nodeId) ?? []), index]);
    }
  });

  const visited = new Set<number>();
  motorwayLinks.forEach((_way, startIndex) => {
    if (visited.has(startIndex)) return;
    const queue = [startIndex];
    const componentIndexes: number[] = [];
    const touchedGroups = new Set<string>();
    visited.add(startIndex);

    while (queue.length > 0) {
      const index = queue.shift();
      if (index === undefined) break;
      const link = motorwayLinks[index];
      componentIndexes.push(index);
      for (const nodeId of link.nodeIds) {
        motorwayGroupsByNode.get(nodeId)?.forEach((group) => touchedGroups.add(group));
        for (const neighborIndex of linkIndexesByNode.get(nodeId) ?? []) {
          if (!visited.has(neighborIndex)) {
            visited.add(neighborIndex);
            queue.push(neighborIndex);
          }
        }
      }
    }

    // On ne garde que les composants de *_link qui relient réellement deux
    // autoroutes différentes. Les sorties/entrées d'une même autoroute restent exclues.
    if (touchedGroups.size < 2) return;
    const connectorGroups = [...touchedGroups].sort();
    const connectorId = `motorway-connector:${connectorGroups.join("|")}:${componentIndexes[0]}`;

    for (const index of componentIndexes) {
      const link = motorwayLinks[index];
      const lines = clipLineToBounds(link.geometry, bounds);
      if (!lines.length) continue;
      mainParts.push({
        id: link.id,
        category: "motorways",
        highway: link.highway,
        name: link.name,
        ref: link.ref,
        tags: link.tags,
        nodeIds: link.nodeIds,
        lines,
        isConnector: true,
        connectorGroups,
        connectorId,
      });
    }
  });

  return mainParts;
}

function buildGroupedRoads(parts: RoadPart[]) {
  const mainGroups = new Map<string, RoadPart[]>();
  const connectorGroups = new Map<string, RoadPart[]>();

  for (const part of parts) {
    if (part.isConnector && part.connectorId) {
      connectorGroups.set(part.connectorId, [...(connectorGroups.get(part.connectorId) ?? []), part]);
    } else {
      const key = getRoadGroupKey(part);
      mainGroups.set(key, [...(mainGroups.get(key) ?? []), part]);
    }
  }

  const features: GroupedRoad[] = [];
  const linesByRoadGroup = new Map<string, Position[][]>();
  const labelByRoadGroup = new Map<string, string>();

  for (const [groupKey, groupParts] of mainGroups) {
    const representative = groupParts[0];
    let lines = stitchLines(
      groupParts.flatMap((part) => part.lines),
      representative.category === "motorways",
    );
    if (representative.category === "motorways" || representative.category === "main") {
      lines = collapseParallelRoadLines(
        lines,
        PARALLEL_ROAD_DISTANCE_M[representative.category],
      );
    }
    lines = lines.filter((line) => line.length >= 2);
    if (lines.length === 0) continue;

    const ids = groupParts.map((part) => part.id).sort((a, b) => a - b);
    const selectionId = `road:${groupKey}:${ids[0]}`;
    const label =
      [representative.ref, representative.name]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(" — ") || "Route sans nom";
    labelByRoadGroup.set(groupKey, label);
    linesByRoadGroup.set(groupKey, lines);

    features.push({
      type: "Feature",
      id: selectionId,
      geometry:
        lines.length === 1
          ? { type: "LineString", coordinates: lines[0] }
          : { type: "MultiLineString", coordinates: lines },
      properties: {
        ...representative.tags,
        name: representative.name,
        ref: representative.ref,
        label,
        highway: representative.highway,
        __dromapRoadCategory: representative.category,
        __dromapRoadSelectionId: selectionId,
        __dromapRoadGroupKey: groupKey,
        __dromapRoadIsConnector: false,
        __dromapOsmWayIds: ids,
        osm_type: "way",
        osm_id: ids[0],
        osm_url: `https://www.openstreetmap.org/way/${ids[0]}`,
      },
    });
  }

  for (const [connectorId, connectorParts] of connectorGroups) {
    const representative = connectorParts[0];
    const relatedGroups = representative.connectorGroups ?? [];
    if (relatedGroups.length < 2) continue;

    // Les géométries motorway_link OSM décrivent chaque bretelle et chaque sens.
    // On ne les dessine pas telles quelles : elles servent seulement à prouver
    // qu'une vraie connexion existe entre deux autoroutes. DroMap reconstruit
    // ensuite une liaison cartographique unique et propre entre les axes retenus.
    const componentPoints = connectorParts.flatMap((part) =>
      part.lines.flatMap((line) => line),
    );
    if (componentPoints.length === 0) continue;
    const connectorCenter: Position = [
      componentPoints.reduce((sum, point) => sum + point[0], 0) / componentPoints.length,
      componentPoints.reduce((sum, point) => sum + point[1], 0) / componentPoints.length,
    ];
    const referenceLatitude = connectorCenter[1];
    const snappedByGroup = relatedGroups
      .map((group) => {
        const snapped = nearestPointOnLines(
          connectorCenter,
          linesByRoadGroup.get(group) ?? [],
          referenceLatitude,
        );
        return snapped ? { group, point: snapped.point } : null;
      })
      .filter((value): value is { group: string; point: Position } => value !== null);

    if (snappedByGroup.length < 2) continue;
    let lines: Position[][];
    if (snappedByGroup.length === 2) {
      const a = snappedByGroup[0].point;
      const b = snappedByGroup[1].point;
      if (distanceMeters(a, b, referenceLatitude) < 8) {
        // Les axes se croisent déjà visuellement : pas besoin d'ajouter une
        // micro-bretelle qui épaissirait inutilement le carrefour.
        continue;
      }
      lines = [[a, b]];
    } else {
      const center: Position = [
        snappedByGroup.reduce((sum, entry) => sum + entry.point[0], 0) / snappedByGroup.length,
        snappedByGroup.reduce((sum, entry) => sum + entry.point[1], 0) / snappedByGroup.length,
      ];
      lines = snappedByGroup
        .map((entry) => [entry.point, center] as Position[])
        .filter((line) => distanceMeters(line[0], line[1], referenceLatitude) >= 8);
      if (lines.length === 0) continue;
    }

    const ids = connectorParts.map((part) => part.id).sort((a, b) => a - b);
    const connectorSelectionId = `road:${connectorId}`;
    const relatedLabels = relatedGroups.map((group) => labelByRoadGroup.get(group) ?? group);
    const label = `Liaison ${relatedLabels.join(" ↔ ")}`;

    features.push({
      type: "Feature",
      id: connectorSelectionId,
      geometry:
        lines.length === 1
          ? { type: "LineString", coordinates: lines[0] }
          : { type: "MultiLineString", coordinates: lines },
      properties: {
        name: label,
        label,
        highway: "motorway_link",
        __dromapRoadCategory: "motorways",
        __dromapRoadSelectionId: connectorSelectionId,
        __dromapRoadIsConnector: true,
        __dromapRoadConnectorGroups: relatedGroups,
        __dromapOsmWayIds: ids,
        osm_type: "way",
        osm_id: ids[0],
        osm_url: `https://www.openstreetmap.org/way/${ids[0]}`,
      },
    });
  }

  return features;
}

async function handleGET(request: NextRequest) {
  try {
    const bounds = parseBounds(request);
    const categories = parseCategories(request);

    if (!bounds) {
      return NextResponse.json({ error: "Zone de travail invalide." }, { status: 400 });
    }
    if (!categories.length) {
      return NextResponse.json({ error: "Sélectionne au moins une catégorie de routes." }, { status: 400 });
    }

    const areaKm2 = getAreaKm2(bounds);
    const maxAreaKm2 = getDromapRoadImportMaxAreaKm2(categories);
    if (areaKm2 > maxAreaKm2) {
      return NextResponse.json(
        {
          error: `La zone est trop grande pour les catégories choisies (${Math.round(areaKm2).toLocaleString("fr-FR")} km²). Limite actuelle : ${Math.round(maxAreaKm2).toLocaleString("fr-FR")} km².`,
          code: "ZONE_TOO_LARGE",
          metadata: { areaKm2, maxAreaKm2 },
        },
        { status: 413 },
      );
    }

    const highwayValues = getDromapRoadImportHighwayValues(categories);
    // On récupère aussi motorway_link, mais uniquement pour reconstruire les
    // liaisons entre deux autoroutes différentes. Les bretelles de sortie seules
    // sont filtrées ensuite grâce au graphe de nœuds OSM.
    if (categories.includes("motorways")) highwayValues.push("motorway_link");

    const payload = await fetchOverpass(buildQuery(bounds, [...new Set(highwayValues)]));
    const ways = parseWays(payload);
    const parts = buildRoadParts(ways, bounds);
    const features = buildGroupedRoads(parts);

    if (!features.length) {
      return NextResponse.json(
        {
          error: "Aucune route correspondant aux catégories choisies n’a été trouvée dans cette zone.",
          code: "NO_ROADS",
        },
        { status: 404 },
      );
    }

    if (features.length > MAX_SELECTION_FEATURES) {
      return NextResponse.json(
        {
          error: `La zone contient ${features.length.toLocaleString("fr-FR")} routes analysables. Réduis la zone ou retire les catégories les plus détaillées.`,
          code: "TOO_MANY_ROADS",
        },
        { status: 413 },
      );
    }

    return NextResponse.json({
      type: "FeatureCollection",
      features,
      metadata: {
        source: "OpenStreetMap",
        sourceName: "openstreetmap-roads.geojson",
        sourceLabel: "OpenStreetMap — Routes",
        sourceUrl: "https://www.openstreetmap.org/copyright",
        license: "ODbL 1.0",
        attribution: "© OpenStreetMap contributors",
        extractionService: "Overpass API",
        categories,
        bbox: bounds,
        areaKm2,
        rawWayCount: ways.length,
        featureCount: features.length,
      },
    });
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === "AbortError";
    return NextResponse.json(
      {
        error: isAbort
          ? "L’analyse des routes a pris trop de temps. Réduis la zone ou choisis moins de catégories."
          : error instanceof Error
            ? error.message
            : "L’import des routes a échoué.",
      },
      { status: isAbort ? 504 : 502 },
    );
  }
}

export const GET = withRequestSecurity(handleGET);
