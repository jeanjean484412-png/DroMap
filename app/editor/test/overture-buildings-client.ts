"use client";

const OVERTURE_STAC_ROOT_URL =
  "https://stac.overturemaps.org/catalog.json";
const OVERTURE_AWS_BASE_URL =
  "https://overturemaps-us-west-2.s3.amazonaws.com/";
const MAX_INTERSECTING_PARQUET_FILES = 12;

type WorkspaceBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type StacLink = {
  rel?: unknown;
  href?: unknown;
  latest?: unknown;
};

type StacRootCatalog = {
  latest?: unknown;
  links?: unknown;
};

type ManifestFeature = {
  bbox?: unknown;
  properties?: unknown;
};

type ManifestFeatureCollection = {
  features?: unknown;
};

type GeoArrowReader = {
  numBatches?: number;
};

type GeoArrowParquetDataset = {
  read: (options: {
    bbox: [number, number, number, number];
    bboxPaths: {
      xmin: ["bbox", "xmin"];
      ymin: ["bbox", "ymin"];
      xmax: ["bbox", "xmax"];
      ymax: ["bbox", "ymax"];
    };
    limit?: number;
  }) => Promise<GeoArrowReader>;
};

type GeoArrowModule = {
  set_panic_hook: () => void;
  writeGeoJSON: (reader: GeoArrowReader) => Uint8Array;
  ParquetDataset: new (
    basePath: string,
    files: string[],
  ) => GeoArrowParquetDataset | PromiseLike<GeoArrowParquetDataset>;
};

type OvertureCatalogData = {
  releaseId: string;
  releaseCatalogUrl: string;
  manifest: Array<{
    type: string;
    bbox: [number, number, number, number];
    path: string;
  }>;
};

export type OvertureBuildingsResult = {
  type: "FeatureCollection";
  features: unknown[];
  metadata: {
    provider: "overture";
    source: string;
    sourceName: string;
    sourceLabel: string;
    sourceUrl: string;
    license: string;
    attribution: string;
    release: string;
    bbox: WorkspaceBounds;
    matchedCount: number;
    featureCount: number;
  };
};

type DownloadOptions = {
  maxFeatures: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export class OvertureBuildingsError extends Error {
  code: "NO_BUILDINGS" | "TOO_MANY_BUILDINGS" | "ZONE_TOO_LARGE" | "UNAVAILABLE";

  constructor(
    code: OvertureBuildingsError["code"],
    message: string,
  ) {
    super(message);
    this.name = "OvertureBuildingsError";
    this.code = code;
  }
}

let geoArrowModulePromise: Promise<GeoArrowModule> | null = null;
let overtureCatalogPromise: Promise<OvertureCatalogData> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFiniteNumber(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));

  return Number.isFinite(parsed) ? parsed : null;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Import annulé", "AbortError");
  }
}

async function fetchJson(url: string, signal?: AbortSignal) {
  const response = await fetch(url, {
    headers: { Accept: "application/json,application/geo+json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<unknown>;
}

function parseManifestBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length < 4) {
    return null;
  }

  const west = parseFiniteNumber(value[0]);
  const south = parseFiniteNumber(value[1]);
  const east = parseFiniteNumber(value[2]);
  const north = parseFiniteNumber(value[3]);

  if (
    west === null ||
    south === null ||
    east === null ||
    north === null
  ) {
    return null;
  }

  return [west, south, east, north];
}

function intersects(
  first: [number, number, number, number],
  second: [number, number, number, number],
) {
  return (
    first[0] < second[2] &&
    first[2] > second[0] &&
    first[1] < second[3] &&
    first[3] > second[1]
  );
}

async function loadOvertureCatalog(signal?: AbortSignal) {
  if (!overtureCatalogPromise) {
    overtureCatalogPromise = (async () => {
      const rootPayload = (await fetchJson(
        OVERTURE_STAC_ROOT_URL,
        signal,
      )) as StacRootCatalog;
      const links = Array.isArray(rootPayload.links)
        ? (rootPayload.links as StacLink[])
        : [];
      const latestLink = links.find(
        (link) =>
          link.rel === "child" &&
          link.latest === true &&
          typeof link.href === "string",
      );

      if (!latestLink || typeof latestLink.href !== "string") {
        throw new Error("Aucune version Overture récente n’a été trouvée.");
      }

      const releaseCatalogUrl = new URL(
        latestLink.href,
        OVERTURE_STAC_ROOT_URL,
      ).href;
      const releaseId =
        typeof rootPayload.latest === "string" && rootPayload.latest.trim()
          ? rootPayload.latest.trim()
          : releaseCatalogUrl.split("/").filter(Boolean).at(-2) ?? "latest";
      const manifestUrl = new URL("manifest.geojson", releaseCatalogUrl).href;
      const manifestPayload = (await fetchJson(
        manifestUrl,
        signal,
      )) as ManifestFeatureCollection;
      const rawFeatures = Array.isArray(manifestPayload.features)
        ? (manifestPayload.features as ManifestFeature[])
        : [];
      const manifest: OvertureCatalogData["manifest"] = [];

      for (const rawFeature of rawFeatures) {
        if (!isRecord(rawFeature.properties)) {
          continue;
        }

        const type = rawFeature.properties.ovt_type;
        const path = rawFeature.properties.rel_path;
        const bbox = parseManifestBbox(rawFeature.bbox);

        if (typeof type !== "string" || typeof path !== "string" || !bbox) {
          continue;
        }

        manifest.push({ type, path, bbox });
      }

      return {
        releaseId,
        releaseCatalogUrl,
        manifest,
      };
    })().catch((error) => {
      overtureCatalogPromise = null;
      throw error;
    });
  }

  return overtureCatalogPromise;
}

async function loadGeoArrowModule() {
  if (!geoArrowModulePromise) {
    geoArrowModulePromise = import("@geoarrow/geoarrow-wasm")
      .then((module) => {
        const typedModule = module as unknown as GeoArrowModule;
        typedModule.set_panic_hook();
        return typedModule;
      })
      .catch((error) => {
        geoArrowModulePromise = null;
        throw error;
      });
  }

  return geoArrowModulePromise;
}

function decodeGeoJson(value: Uint8Array) {
  return new TextDecoder("utf-8").decode(value);
}

function normalizeText(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

type LocalizedNameCandidate = {
  value: string;
  path: string[];
  order: number;
};

const LATIN_LETTER_PATTERN = /\p{Script=Latin}/u;
const CYRILLIC_LETTER_PATTERN = /\p{Script=Cyrillic}/u;
const LETTER_PATTERN = /\p{L}/u;

function getNameScriptPriority(value: string) {
  let hasLetter = false;
  let hasLatin = false;
  let hasCyrillic = false;
  let hasUnsupportedLetter = false;

  for (const character of value) {
    if (!LETTER_PATTERN.test(character)) continue;
    hasLetter = true;
    if (LATIN_LETTER_PATTERN.test(character)) {
      hasLatin = true;
    } else if (CYRILLIC_LETTER_PATTERN.test(character)) {
      hasCyrillic = true;
    } else {
      hasUnsupportedLetter = true;
    }
  }

  if (!hasLetter || hasUnsupportedLetter) return -1;
  if (hasLatin) return 300;
  if (hasCyrillic) return 200;
  return -1;
}

function collectLocalizedNameCandidates(
  value: unknown,
  path: string[] = [],
  depth = 0,
  result: LocalizedNameCandidate[] = [],
) {
  if (depth > 6 || result.length >= 120) return result;

  const direct = normalizeText(value);
  if (direct) {
    result.push({ value: direct, path, order: result.length });
    return result;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectLocalizedNameCandidates(item, [...path, String(index)], depth + 1, result),
    );
    return result;
  }

  if (!isRecord(value)) return result;

  for (const [key, nestedValue] of Object.entries(value)) {
    collectLocalizedNameCandidates(
      nestedValue,
      [...path, key],
      depth + 1,
      result,
    );
  }

  return result;
}

function getNamePathPriority(path: string[]) {
  const joined = path.join(":").toLocaleLowerCase("fr");
  const tokens = path.map((part) => part.toLocaleLowerCase("fr"));

  if (
    tokens.some((token) => token === "fr" || token === "fr-fr" || token === "fra") ||
    /(^|[:_.-])(name|official_name|short_name|common|primary)[:_.-]fr($|[:_.-])/.test(joined)
  ) {
    return 1_400;
  }

  if (
    tokens.some((token) =>
      ["latin", "latn", "romanized", "romanised", "translit", "transliteration", "int_name"].includes(token),
    ) ||
    joined.includes("int_name")
  ) {
    return 1_050;
  }

  if (
    tokens.some((token) => token === "en" || token === "en-us" || token === "en-gb")
  ) {
    return 900;
  }

  let score = 0;
  if (tokens.includes("official") || tokens.includes("official_name")) score += 170;
  if (tokens.includes("primary")) score += 150;
  if (tokens.includes("common")) score += 120;
  if (tokens.includes("name")) score += 100;
  if (tokens.includes("short_name")) score += 80;
  return score;
}

function getOverturePrimaryName(names: unknown) {
  const candidates = collectLocalizedNameCandidates(names)
    .map((candidate) => ({
      ...candidate,
      score:
        getNamePathPriority(candidate.path) +
        getNameScriptPriority(candidate.value),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort(
      (first, second) =>
        second.score - first.score || first.order - second.order,
    );

  return candidates[0]?.value ?? null;
}

function getOvertureFallbackLabel(_properties: Record<string, unknown>) {
  // subtype/class décrivent l'usage du bâtiment, pas son nom propre.
  return "Bâtiment sans nom renseigné";
}

function getSourceDatasets(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const datasets = new Set<string>();

  for (const source of value) {
    if (!isRecord(source)) {
      continue;
    }

    const dataset = normalizeText(source.dataset);

    if (dataset) {
      datasets.add(dataset);
    }

    if (datasets.size >= 8) {
      break;
    }
  }

  return [...datasets];
}

function compactOvertureProperties(
  value: unknown,
  releaseId: string,
) {
  const source = isRecord(value) ? value : {};
  const compacted: Record<string, unknown> = {};
  const primitiveKeys = [
    "subtype",
    "class",
    "has_parts",
    "level",
    "height",
    "is_underground",
    "num_floors",
    "num_floors_underground",
    "min_height",
    "min_floor",
    "facade_color",
    "facade_material",
    "roof_material",
    "roof_shape",
    "roof_direction",
    "roof_orientation",
    "roof_color",
    "roof_height",
    "version",
  ];

  for (const key of primitiveKeys) {
    const propertyValue = source[key];

    if (
      typeof propertyValue === "string" ||
      typeof propertyValue === "number" ||
      typeof propertyValue === "boolean"
    ) {
      compacted[key] = propertyValue;
    }
  }

  const displayName = getOverturePrimaryName(source.names);
  const sourceDatasets = getSourceDatasets(source.sources);

  compacted.label = displayName ?? getOvertureFallbackLabel(source);

  if (displayName) {
    compacted.name = displayName;
    compacted.name_source = "Overture Maps";
  }

  if (sourceDatasets.length > 0) {
    compacted.source_datasets = sourceDatasets.join(", ");
  }

  compacted.source = "Overture Maps Buildings";
  compacted.source_layer = "building";
  compacted.overture_release = releaseId;

  return compacted;
}

function normalizeOvertureFeatures(
  rawPayload: unknown,
  releaseId: string,
) {
  if (!isRecord(rawPayload) || !Array.isArray(rawPayload.features)) {
    return [];
  }

  const normalizedFeatures: unknown[] = [];

  for (const rawFeature of rawPayload.features) {
    if (!isRecord(rawFeature) || rawFeature.type !== "Feature") {
      continue;
    }

    const geometry = rawFeature.geometry;

    if (!isRecord(geometry)) {
      continue;
    }

    let geometryType = geometry.type;
    let coordinates = geometry.coordinates;

    if (
      geometryType === "MultiPolygon" &&
      Array.isArray(coordinates) &&
      coordinates.length === 1
    ) {
      geometryType = "Polygon";
      coordinates = coordinates[0];
    }

    if (
      (geometryType !== "Polygon" && geometryType !== "MultiPolygon") ||
      !Array.isArray(coordinates)
    ) {
      continue;
    }

    const rawProperties = isRecord(rawFeature.properties)
      ? rawFeature.properties
      : {};
    const rawId = rawFeature.id ?? rawProperties.id;
    const id =
      typeof rawId === "string" || typeof rawId === "number"
        ? rawId
        : `overture-building-${normalizedFeatures.length + 1}`;

    normalizedFeatures.push({
      type: "Feature",
      id,
      geometry: {
        type: geometryType,
        coordinates,
      },
      properties: compactOvertureProperties(rawProperties, releaseId),
    });
  }

  return normalizedFeatures;
}

export async function downloadOvertureBuildings(
  bounds: WorkspaceBounds,
  options: DownloadOptions,
): Promise<OvertureBuildingsResult> {
  const { maxFeatures, signal, onProgress } = options;
  const bbox: [number, number, number, number] = [
    bounds.west,
    bounds.south,
    bounds.east,
    bounds.north,
  ];

  throwIfAborted(signal);
  onProgress?.("Chargement du catalogue mondial Overture Maps…");

  try {
    const catalog = await loadOvertureCatalog(signal);
    throwIfAborted(signal);

    const files = catalog.manifest
      .filter(
        (entry) => entry.type === "building" && intersects(bbox, entry.bbox),
      )
      .map((entry) => entry.path);

    if (files.length === 0) {
      throw new OvertureBuildingsError(
        "NO_BUILDINGS",
        "Aucun fichier de bâtiments Overture ne couvre cette zone.",
      );
    }

    if (files.length > MAX_INTERSECTING_PARQUET_FILES) {
      throw new OvertureBuildingsError(
        "ZONE_TOO_LARGE",
        "La zone de travail est trop vaste pour un import mondial direct. Réduis-la autour de la ville ou du secteur utile.",
      );
    }

    onProgress?.(
      `Lecture des bâtiments mondiaux (${files.length} fichier${files.length > 1 ? "s" : ""} utile${files.length > 1 ? "s" : ""})…`,
    );

    const geoArrow = await loadGeoArrowModule();
    throwIfAborted(signal);

    const dataset = await Promise.resolve(
      new geoArrow.ParquetDataset(OVERTURE_AWS_BASE_URL, files),
    );
    const reader = await dataset.read({
      bbox,
      bboxPaths: {
        xmin: ["bbox", "xmin"],
        ymin: ["bbox", "ymin"],
        xmax: ["bbox", "xmax"],
        ymax: ["bbox", "ymax"],
      },
      limit: maxFeatures + 1,
    });

    throwIfAborted(signal);

    if (reader.numBatches === 0) {
      throw new OvertureBuildingsError(
        "NO_BUILDINGS",
        "Aucun bâtiment Overture n’a été trouvé dans cette zone.",
      );
    }

    onProgress?.("Conversion des empreintes en GeoJSON…");

    const rawGeoJson = JSON.parse(decodeGeoJson(geoArrow.writeGeoJSON(reader)));
    const features = normalizeOvertureFeatures(rawGeoJson, catalog.releaseId);

    if (features.length === 0) {
      throw new OvertureBuildingsError(
        "NO_BUILDINGS",
        "Aucun bâtiment Overture exploitable n’a été trouvé dans cette zone.",
      );
    }

    if (features.length > maxFeatures) {
      throw new OvertureBuildingsError(
        "TOO_MANY_BUILDINGS",
        `Cette zone contient plus de ${maxFeatures.toLocaleString("fr-FR")} bâtiments. Réduis la zone de travail pour ne pas bloquer DroMap.`,
      );
    }

    return {
      type: "FeatureCollection",
      features,
      metadata: {
        provider: "overture",
        source: "Overture Maps Buildings",
        sourceName: `overture-buildings-${catalog.releaseId}.geojson`,
        sourceLabel: "Overture Maps — Bâtiments",
        sourceUrl: "https://docs.overturemaps.org/guides/buildings/",
        license: "ODbL 1.0",
        attribution:
          "© OpenStreetMap contributors · © Overture Maps Foundation",
        release: catalog.releaseId,
        bbox: bounds,
        matchedCount: features.length,
        featureCount: features.length,
      },
    };
  } catch (error) {
    if (
      error instanceof OvertureBuildingsError ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw error;
    }

    console.error("DroMap Overture buildings import failed", error);

    throw new OvertureBuildingsError(
      "UNAVAILABLE",
      "Les bâtiments mondiaux Overture Maps sont momentanément indisponibles. Réessaie dans quelques instants.",
    );
  }
}

export type OvertureBuildingNameEnrichmentResult = {
  features: Array<
    GeoJSON.Feature<
      GeoJSON.Polygon | GeoJSON.MultiPolygon,
      GeoJSON.GeoJsonProperties
    >
  >;
  enrichedCount: number;
  placeCandidateCount: number;
  release: string | null;
};

type OverturePlaceCandidate = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  confidence: number | null;
  category: string | null;
  basicCategory: string | null;
  sourceDatasets: string[];
};

type BuildingNameEnrichmentOptions = {
  maxPlaces?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

const OVERTURE_PLACE_GRID_SIZE = 0.002;
const DEFAULT_MAX_OVERTURE_PLACES = 25_000;

function normalizeComparableName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isGenericBuildingName(value: unknown) {
  const name = normalizeText(value);
  if (!name) return true;
  return new Set([
    "batiment",
    "bâtiment",
    "building",
    "batiment sans nom renseigne",
    "bâtiment sans nom renseigné",
    "indifferencie",
    "indifférencié",
    "commercial",
    "industriel",
    "residentiel",
    "résidentiel",
    "agricole",
    "sans nom",
    "unknown",
  ]).has(normalizeComparableName(name));
}

function getExistingBuildingName(
  feature: GeoJSON.Feature<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    GeoJSON.GeoJsonProperties
  >,
) {
  const properties = isRecord(feature.properties) ? feature.properties : {};
  for (const key of [
    "name",
    "official_name",
    "osm_name",
    "nom",
    "toponyme",
    "denomination",
    "designation",
  ]) {
    const value = properties[key];
    if (!isGenericBuildingName(value)) return normalizeText(value);
  }
  return null;
}

function normalizeOverturePlaceCandidates(rawPayload: unknown) {
  if (!isRecord(rawPayload) || !Array.isArray(rawPayload.features)) {
    return [] as OverturePlaceCandidate[];
  }

  const result: OverturePlaceCandidate[] = [];
  for (const rawFeature of rawPayload.features) {
    if (!isRecord(rawFeature) || rawFeature.type !== "Feature") continue;
    const geometry = rawFeature.geometry;
    if (!isRecord(geometry) || geometry.type !== "Point") continue;
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
      continue;
    }
    const lng = parseFiniteNumber(geometry.coordinates[0]);
    const lat = parseFiniteNumber(geometry.coordinates[1]);
    if (lng === null || lat === null) continue;

    const properties = isRecord(rawFeature.properties)
      ? rawFeature.properties
      : {};
    const name = getOverturePrimaryName(properties.names);
    if (!name || isGenericBuildingName(name)) continue;

    const operatingStatus = normalizeText(properties.operating_status);
    if (operatingStatus === "closed_permanently") continue;

    const categories = isRecord(properties.categories)
      ? properties.categories
      : {};
    const category =
      normalizeText(categories.primary) ?? normalizeText(properties.category);
    const basicCategory = normalizeText(properties.basic_category);
    const confidence = parseFiniteNumber(properties.confidence);
    if (confidence !== null && confidence < 0.5) continue;

    const rawId = rawFeature.id ?? properties.id;
    result.push({
      id:
        typeof rawId === "string" || typeof rawId === "number"
          ? String(rawId)
          : `overture-place-${result.length + 1}`,
      name,
      lat,
      lng,
      confidence,
      category,
      basicCategory,
      sourceDatasets: getSourceDatasets(properties.sources),
    });
  }
  return result;
}

function visitCoordinates(
  value: unknown,
  callback: (lng: number, lat: number) => void,
) {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    callback(value[0], value[1]);
    return;
  }
  value.forEach((child) => visitCoordinates(child, callback));
}

function buildingExtent(
  feature: GeoJSON.Feature<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    GeoJSON.GeoJsonProperties
  >,
) {
  const extent = {
    west: Number.POSITIVE_INFINITY,
    south: Number.POSITIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
  };
  visitCoordinates(feature.geometry.coordinates, (lng, lat) => {
    extent.west = Math.min(extent.west, lng);
    extent.east = Math.max(extent.east, lng);
    extent.south = Math.min(extent.south, lat);
    extent.north = Math.max(extent.north, lat);
  });
  return Number.isFinite(extent.west) ? extent : null;
}

function asLngLat(value: unknown): [number, number] | null {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    typeof value[0] !== "number" ||
    typeof value[1] !== "number"
  ) {
    return null;
  }
  return [value[0], value[1]];
}

function pointInRingLngLat(point: [number, number], rawRing: unknown) {
  if (!Array.isArray(rawRing)) return false;
  const ring = rawRing
    .map(asLngLat)
    .filter((entry): entry is [number, number] => entry !== null);
  if (ring.length < 3) return false;

  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const current = ring[index];
    const before = ring[previous];
    const intersects =
      current[1] > point[1] !== before[1] > point[1] &&
      point[0] <
        ((before[0] - current[0]) * (point[1] - current[1])) /
          (before[1] - current[1] || Number.EPSILON) +
          current[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonLngLat(point: [number, number], polygon: unknown) {
  if (!Array.isArray(polygon) || !polygon.length) return false;
  if (!pointInRingLngLat(point, polygon[0])) return false;
  return !polygon
    .slice(1)
    .some((hole) => pointInRingLngLat(point, hole));
}

function pointInBuildingFeature(
  point: [number, number],
  feature: GeoJSON.Feature<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    GeoJSON.GeoJsonProperties
  >,
) {
  if (feature.geometry.type === "Polygon") {
    return pointInPolygonLngLat(point, feature.geometry.coordinates);
  }
  return feature.geometry.coordinates.some((polygon) =>
    pointInPolygonLngLat(point, polygon),
  );
}

function placeGridCoordinate(value: number) {
  return Math.floor(value / OVERTURE_PLACE_GRID_SIZE);
}

function placeGridKey(x: number, y: number) {
  return `${x}:${y}`;
}

function indexOverturePlaces(candidates: OverturePlaceCandidate[]) {
  const index = new Map<string, OverturePlaceCandidate[]>();
  for (const candidate of candidates) {
    const key = placeGridKey(
      placeGridCoordinate(candidate.lng),
      placeGridCoordinate(candidate.lat),
    );
    const bucket = index.get(key);
    if (bucket) bucket.push(candidate);
    else index.set(key, [candidate]);
  }
  return index;
}

function placesForBuildingExtent(
  index: Map<string, OverturePlaceCandidate[]>,
  extent: { west: number; south: number; east: number; north: number },
) {
  const result: OverturePlaceCandidate[] = [];
  const minX = placeGridCoordinate(extent.west);
  const maxX = placeGridCoordinate(extent.east);
  const minY = placeGridCoordinate(extent.south);
  const maxY = placeGridCoordinate(extent.north);
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      result.push(...(index.get(placeGridKey(x, y)) ?? []));
    }
  }
  return result;
}

function structuralPlaceScore(candidate: OverturePlaceCandidate) {
  const category = `${candidate.basicCategory ?? ""} ${candidate.category ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  let score = (candidate.confidence ?? 0.72) * 100;
  if (
    /(education|school|college|university|research|hospital|clinic|government|community|library|museum|theatre|arts|historic|religious|place of worship|police|fire station|courthouse|townhall|transportation|station|airport|lodging|hotel)/.test(
      category,
    )
  ) {
    score += 85;
  } else if (/(services|business|shopping|food|restaurant|cafe|retail)/.test(category)) {
    score += 12;
  } else {
    score += 35;
  }
  return score;
}

function chooseOverturePlaceForBuilding(
  feature: GeoJSON.Feature<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    GeoJSON.GeoJsonProperties
  >,
  candidates: OverturePlaceCandidate[],
) {
  const inside = candidates.filter((candidate) =>
    pointInBuildingFeature([candidate.lng, candidate.lat], feature),
  );
  if (!inside.length) return null;

  const grouped = new Map<
    string,
    { candidate: OverturePlaceCandidate; score: number; count: number }
  >();
  for (const candidate of inside) {
    const key = normalizeComparableName(candidate.name);
    const score = structuralPlaceScore(candidate);
    const previous = grouped.get(key);
    if (!previous) {
      grouped.set(key, { candidate, score, count: 1 });
    } else {
      previous.count += 1;
      if (score > previous.score) {
        previous.candidate = candidate;
        previous.score = score;
      }
    }
  }

  const ranked = [...grouped.values()].sort(
    (first, second) => second.score - first.score,
  );
  const best = ranked[0];
  const second = ranked[1];
  if (!best) return null;
  if (!second) return best.candidate;

  // Un immeuble peut contenir plusieurs commerces. Dans ce cas, le nom du
  // meilleur POI n'est pas forcément le nom du bâtiment. On ne propose un nom
  // que si la meilleure entité est clairement plus structurante.
  return best.score >= 145 && best.score - second.score >= 28
    ? best.candidate
    : null;
}

async function downloadOverturePlaceCandidates(
  bounds: WorkspaceBounds,
  options: BuildingNameEnrichmentOptions,
) {
  const maxPlaces = Math.max(
    100,
    Math.min(50_000, options.maxPlaces ?? DEFAULT_MAX_OVERTURE_PLACES),
  );
  const bbox: [number, number, number, number] = [
    bounds.west,
    bounds.south,
    bounds.east,
    bounds.north,
  ];

  throwIfAborted(options.signal);
  options.onProgress?.(
    "Recherche de noms supplémentaires dans Overture Maps Places…",
  );
  const catalog = await loadOvertureCatalog(options.signal);
  const files = catalog.manifest
    .filter((entry) => entry.type === "place" && intersects(bbox, entry.bbox))
    .map((entry) => entry.path);

  if (!files.length || files.length > MAX_INTERSECTING_PARQUET_FILES) {
    return { candidates: [] as OverturePlaceCandidate[], release: catalog.releaseId };
  }

  const geoArrow = await loadGeoArrowModule();
  const dataset = await Promise.resolve(
    new geoArrow.ParquetDataset(OVERTURE_AWS_BASE_URL, files),
  );
  const reader = await dataset.read({
    bbox,
    bboxPaths: {
      xmin: ["bbox", "xmin"],
      ymin: ["bbox", "ymin"],
      xmax: ["bbox", "xmax"],
      ymax: ["bbox", "ymax"],
    },
    limit: maxPlaces,
  });
  throwIfAborted(options.signal);
  if (reader.numBatches === 0) {
    return { candidates: [] as OverturePlaceCandidate[], release: catalog.releaseId };
  }

  const rawGeoJson = JSON.parse(decodeGeoJson(geoArrow.writeGeoJSON(reader)));
  return {
    candidates: normalizeOverturePlaceCandidates(rawGeoJson),
    release: catalog.releaseId,
  };
}

export async function enrichBuildingNamesFromOverturePlaces(
  inputFeatures: Array<
    GeoJSON.Feature<
      GeoJSON.Polygon | GeoJSON.MultiPolygon,
      GeoJSON.GeoJsonProperties
    >
  >,
  bounds: WorkspaceBounds,
  options: BuildingNameEnrichmentOptions = {},
): Promise<OvertureBuildingNameEnrichmentResult> {
  const features = inputFeatures.map((feature) => structuredClone(feature));
  const unnamed = features.filter((feature) => !getExistingBuildingName(feature));
  if (!unnamed.length) {
    return {
      features,
      enrichedCount: 0,
      placeCandidateCount: 0,
      release: null,
    };
  }

  try {
    const { candidates, release } = await downloadOverturePlaceCandidates(
      bounds,
      options,
    );
    if (!candidates.length) {
      return {
        features,
        enrichedCount: 0,
        placeCandidateCount: 0,
        release,
      };
    }

    const placeIndex = indexOverturePlaces(candidates);
    let enrichedCount = 0;
    for (const feature of unnamed) {
      const extent = buildingExtent(feature);
      if (!extent) continue;
      const candidate = chooseOverturePlaceForBuilding(
        feature,
        placesForBuildingExtent(placeIndex, extent),
      );
      if (!candidate) continue;

      const properties = isRecord(feature.properties)
        ? feature.properties
        : {};
      feature.properties = {
        ...properties,
        label: candidate.name,
        name: candidate.name,
        name_source: "Overture Maps Places",
        name_confidence: candidate.confidence,
        overture_place_id: candidate.id,
        overture_place_category: candidate.category,
        overture_place_basic_category: candidate.basicCategory,
        overture_place_sources: candidate.sourceDatasets.join(", ") || null,
      };
      enrichedCount += 1;
    }

    options.onProgress?.(
      enrichedCount > 0
        ? `${enrichedCount.toLocaleString("fr-FR")} nom${enrichedCount > 1 ? "s" : ""} supplémentaire${enrichedCount > 1 ? "s" : ""} trouvé${enrichedCount > 1 ? "s" : ""} dans Overture Maps Places.`
        : "Aucun nom supplémentaire suffisamment fiable n'a été trouvé dans Overture Maps Places.",
    );

    return {
      features,
      enrichedCount,
      placeCandidateCount: candidates.length,
      release,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    console.warn("DroMap Overture place-name enrichment unavailable", error);
    return {
      features,
      enrichedCount: 0,
      placeCandidateCount: 0,
      release: null,
    };
  }
}
