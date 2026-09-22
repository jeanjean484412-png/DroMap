/// <reference lib="webworker" />

import type { DromapLoadingBounds } from "@/lib/dromap/workspace-object-loading";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import type {
  DromapGeoJsonFeature,
  DromapGeoJsonGeometry,
} from "@/stores/editor-geojson-layers";
import type {
  GeoJsonWorkerErrorCode,
  GeoJsonWorkerParseRequest,
  GeoJsonWorkerResponse,
} from "./geojson-file-import-types";

const workerScope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

class GeoJsonWorkerError extends Error {
  constructor(
    readonly code: GeoJsonWorkerErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parsePosition(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [lng, lat] = value;
  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat)
  ) {
    return null;
  }
  return [clamp(lng, -360, 360), clamp(lat, -85.05112878, 85.05112878)];
}

function parseLine(value: unknown): [number, number][] | null {
  if (!Array.isArray(value)) return null;
  const positions = value
    .map(parsePosition)
    .filter((position): position is [number, number] => position !== null);
  return positions.length >= 2 ? positions : null;
}

function parsePolygon(value: unknown): [number, number][][] | null {
  if (!Array.isArray(value)) return null;
  const rings = value
    .map(parseLine)
    .filter((ring): ring is [number, number][] => ring !== null && ring.length >= 4);
  return rings.length > 0 ? rings : null;
}

function parseGeometry(value: unknown): DromapGeoJsonGeometry | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  const coordinates = value.coordinates;

  if (type === "Point") {
    const point = parsePosition(coordinates);
    return point ? { type, coordinates: point } : null;
  }
  if (type === "MultiPoint") {
    if (!Array.isArray(coordinates)) return null;
    const points = coordinates
      .map(parsePosition)
      .filter((point): point is [number, number] => point !== null);
    return points.length > 0 ? { type, coordinates: points } : null;
  }
  if (type === "LineString") {
    const line = parseLine(coordinates);
    return line ? { type, coordinates: line } : null;
  }
  if (type === "MultiLineString") {
    if (!Array.isArray(coordinates)) return null;
    const lines = coordinates
      .map(parseLine)
      .filter((line): line is [number, number][] => line !== null);
    return lines.length > 0 ? { type, coordinates: lines } : null;
  }
  if (type === "Polygon") {
    const polygon = parsePolygon(coordinates);
    return polygon ? { type, coordinates: polygon } : null;
  }
  if (type === "MultiPolygon") {
    if (!Array.isArray(coordinates)) return null;
    const polygons = coordinates
      .map(parsePolygon)
      .filter((polygon): polygon is [number, number][][] => polygon !== null);
    return polygons.length > 0 ? { type, coordinates: polygons } : null;
  }
  return null;
}

function forEachCoordinate(
  geometry: DromapGeoJsonGeometry,
  callback: (coordinate: [number, number]) => void,
) {
  if (geometry.type === "Point") {
    callback(geometry.coordinates);
  } else if (geometry.type === "MultiPoint" || geometry.type === "LineString") {
    geometry.coordinates.forEach(callback);
  } else if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    geometry.coordinates.forEach((line) => line.forEach(callback));
  } else {
    geometry.coordinates.forEach((polygon) =>
      polygon.forEach((ring) => ring.forEach(callback)),
    );
  }
}

function inspectGeometry(geometry: DromapGeoJsonGeometry) {
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let coordinateCount = 0;

  forEachCoordinate(geometry, ([lng, lat]) => {
    coordinateCount += 1;
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  });

  return {
    coordinateCount,
    bounds: { west, east, south, north },
  };
}

function intersects(
  featureBounds: ReturnType<typeof inspectGeometry>["bounds"],
  loadingBounds: DromapLoadingBounds | null,
) {
  if (!loadingBounds) return true;
  return !(
    featureBounds.west > loadingBounds.east ||
    featureBounds.east < loadingBounds.west ||
    featureBounds.south > loadingBounds.north ||
    featureBounds.north < loadingBounds.south
  );
}

function createPaddedBounds(
  west: number,
  east: number,
  south: number,
  north: number,
): WorkspaceBounds | null {
  if (![west, east, south, north].every(Number.isFinite)) return null;
  const longitudeSpan = east - west;
  const latitudeSpan = north - south;
  const longitudePadding =
    longitudeSpan > 0 ? Math.max(longitudeSpan * 0.08, 0.02) : 0.08;
  const latitudePadding =
    latitudeSpan > 0 ? Math.max(latitudeSpan * 0.08, 0.02) : 0.08;
  const paddedWest = clamp(west - longitudePadding, -360, 360);
  const paddedEast = clamp(east + longitudePadding, -360, 360);
  const paddedSouth = clamp(south - latitudePadding, -85.05112878, 85.05112878);
  const paddedNorth = clamp(north + latitudePadding, -85.05112878, 85.05112878);
  if (paddedEast - paddedWest < 0.000001 || paddedNorth - paddedSouth < 0.000001) {
    return null;
  }
  return {
    southWest: { lat: paddedSouth, lng: paddedWest },
    northEast: { lat: paddedNorth, lng: paddedEast },
  };
}

type ParsedGeometryWithProperties = {
  geometry: DromapGeoJsonGeometry;
  properties: Record<string, unknown>;
};

function flattenGeometry(
  value: unknown,
  properties: Record<string, unknown>,
  result: ParsedGeometryWithProperties[],
) {
  if (!isRecord(value)) return 1;
  if (value.type === "GeometryCollection") {
    if (!Array.isArray(value.geometries)) return 1;
    let skipped = 0;
    for (const geometry of value.geometries) {
      skipped += flattenGeometry(geometry, properties, result);
    }
    return skipped;
  }
  const geometry = parseGeometry(value);
  if (!geometry) return 1;
  result.push({ geometry, properties });
  return 0;
}

function flattenFeature(value: unknown) {
  const result: ParsedGeometryWithProperties[] = [];
  if (!isRecord(value)) return { result, skipped: 1 };
  if (value.type === "Feature") {
    const properties = isRecord(value.properties) ? value.properties : {};
    return {
      result,
      skipped: flattenGeometry(value.geometry, properties, result),
    };
  }
  return {
    result,
    skipped: flattenGeometry(value, {}, result),
  };
}

async function parseFile(request: GeoJsonWorkerParseRequest) {
  const { file, loadingBounds, limits } = request;
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  const features: DromapGeoJsonFeature[] = [];
  let buffer = "";
  let bytesRead = 0;
  let parsedFeatures = 0;
  let retainedCoordinates = 0;
  let retainedSourceBytes = 0;
  let outsideWorkspaceFeatures = 0;
  let skippedGeometries = 0;
  let retainedWest = Number.POSITIVE_INFINITY;
  let retainedEast = Number.NEGATIVE_INFINITY;
  let retainedSouth = Number.POSITIVE_INFINITY;
  let retainedNorth = Number.NEGATIVE_INFINITY;
  let foundFeaturesArray = false;
  let arrayComplete = false;
  let collectingObject = false;
  let objectStart = -1;
  let scanIndex = 0;
  let depth = 0;
  let inString = false;
  let escaping = false;
  let lastProgressAt = 0;

  const postProgress = (force = false) => {
    const now = performance.now();
    if (!force && now - lastProgressAt < 180) return;
    lastProgressAt = now;
    workerScope.postMessage({
      type: "progress",
      bytesRead,
      totalBytes: file.size,
      parsedFeatures,
      retainedFeatures: features.length,
    } satisfies GeoJsonWorkerResponse);
  };

  const retainRawFeature = (rawFeature: string) => {
    parsedFeatures += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawFeature) as unknown;
    } catch {
      throw new GeoJsonWorkerError(
        "invalid-geojson",
        "Import GeoJSON impossible : une entité du fichier est invalide.",
      );
    }

    const flattened = flattenFeature(parsed);
    skippedGeometries += flattened.skipped;
    let retainedFromRawFeature = false;

    for (const item of flattened.result) {
      const inspected = inspectGeometry(item.geometry);
      if (!intersects(inspected.bounds, loadingBounds)) {
        outsideWorkspaceFeatures += 1;
        continue;
      }

      if (
        features.length + 1 > limits.maxRetainedFeatures ||
        retainedCoordinates + inspected.coordinateCount > limits.maxRetainedCoordinates ||
        retainedSourceBytes + rawFeature.length > limits.maxRetainedSourceBytes
      ) {
        throw new GeoJsonWorkerError(
          "retained-limit",
          "Le GeoJSON reste trop dense dans la zone de travail. Réduis la zone avant l’import ; le fichier complet n’a pas été chargé afin de protéger ton ordinateur.",
        );
      }

      features.push({
        type: "Feature",
        geometry: item.geometry,
        properties: item.properties,
      });
      retainedCoordinates += inspected.coordinateCount;
      retainedWest = Math.min(retainedWest, inspected.bounds.west);
      retainedEast = Math.max(retainedEast, inspected.bounds.east);
      retainedSouth = Math.min(retainedSouth, inspected.bounds.south);
      retainedNorth = Math.max(retainedNorth, inspected.bounds.north);
      retainedFromRawFeature = true;
    }

    if (retainedFromRawFeature) retainedSourceBytes += rawFeature.length;
  };

  const processBuffer = () => {
    if (!foundFeaturesArray) {
      const match = /"features"\s*:\s*\[/.exec(buffer);
      if (!match) {
        if (buffer.length > 2048) buffer = buffer.slice(-2048);
        return;
      }
      buffer = buffer.slice(match.index + match[0].length);
      foundFeaturesArray = true;
      scanIndex = 0;
    }

    while (!arrayComplete && scanIndex < buffer.length) {
      if (!collectingObject) {
        const character = buffer[scanIndex];
        if (/\s|,/.test(character)) {
          scanIndex += 1;
          continue;
        }
        if (character === "]") {
          arrayComplete = true;
          scanIndex += 1;
          break;
        }
        if (character !== "{") {
          throw new GeoJsonWorkerError(
            "invalid-geojson",
            "Import GeoJSON impossible : la collection d’entités est invalide.",
          );
        }
        collectingObject = true;
        objectStart = scanIndex;
        depth = 1;
        inString = false;
        escaping = false;
        scanIndex += 1;
      }

      while (collectingObject && scanIndex < buffer.length) {
        const character = buffer[scanIndex];
        if (inString) {
          if (escaping) {
            escaping = false;
          } else if (character === "\\") {
            escaping = true;
          } else if (character === '"') {
            inString = false;
          }
        } else if (character === '"') {
          inString = true;
        } else if (character === "{") {
          depth += 1;
        } else if (character === "}") {
          depth -= 1;
          if (depth === 0) {
            const end = scanIndex + 1;
            retainRawFeature(buffer.slice(objectStart, end));
            buffer = buffer.slice(end);
            scanIndex = 0;
            objectStart = -1;
            collectingObject = false;
            postProgress();
            break;
          }
        }
        scanIndex += 1;
      }

      if (collectingObject) {
        if (objectStart > 0) {
          buffer = buffer.slice(objectStart);
          scanIndex -= objectStart;
          objectStart = 0;
        }
        if (buffer.length > limits.maxSingleFeatureBytes) {
          throw new GeoJsonWorkerError(
            "single-feature-limit",
            "Une seule entité GeoJSON est trop volumineuse pour être traitée en sécurité dans le navigateur.",
          );
        }
        return;
      }
    }

    if (!collectingObject && scanIndex > 0) {
      buffer = buffer.slice(scanIndex);
      scanIndex = 0;
    }
  };

  try {
    while (!arrayComplete) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      processBuffer();
      postProgress();
    }
    buffer += decoder.decode();
    processBuffer();
  } finally {
    if (arrayComplete) await reader.cancel();
    reader.releaseLock();
  }

  if (!foundFeaturesArray || !arrayComplete) {
    throw new GeoJsonWorkerError(
      "invalid-geojson",
      "Import GeoJSON impossible : aucune FeatureCollection complète n’a été trouvée.",
    );
  }
  if (features.length === 0) {
    throw new GeoJsonWorkerError(
      "invalid-geojson",
      loadingBounds
        ? "Aucune entité du GeoJSON ne recoupe la zone de travail actuelle."
        : "Aucune entité GeoJSON exploitable n’a été trouvée.",
    );
  }

  postProgress(true);
  workerScope.postMessage({
    type: "complete",
    features,
    parsedFeatures,
    retainedFeatures: features.length,
    retainedCoordinates,
    bounds: createPaddedBounds(
      retainedWest,
      retainedEast,
      retainedSouth,
      retainedNorth,
    ),
    outsideWorkspaceFeatures,
    skippedGeometries,
  } satisfies GeoJsonWorkerResponse);
}

workerScope.addEventListener("message", (event: MessageEvent<GeoJsonWorkerParseRequest>) => {
  if (event.data?.type !== "parse") return;
  void parseFile(event.data).catch((error: unknown) => {
    const response: GeoJsonWorkerResponse = {
      type: "error",
      code: error instanceof GeoJsonWorkerError ? error.code : "read-error",
      message:
        error instanceof Error
          ? error.message
          : "La lecture progressive du GeoJSON a échoué.",
    };
    workerScope.postMessage(response);
  });
});

export {};
