import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const IGN_WFS_URL = "https://data.geopf.fr/wfs/ows";
const BUILDING_TYPE_NAME = "BDTOPO_V3:batiment";
const MAX_FEATURES = 15_000;
const PAGE_SIZE = 2_500;
const REQUEST_TIMEOUT_MS = 25_000;
const OSM_NAME_REQUEST_TIMEOUT_MS = 12_000;
const MAX_OSM_ENRICHMENT_AREA_KM2 = 250;
const MAX_OSM_ENRICHMENT_BUILDINGS = 7_500;
const MAX_OSM_NAME_CANDIDATES = 6_000;
const OSM_NAME_GRID_SIZE = 0.0025;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

const USEFUL_PROPERTY_PATTERN =
  /(^|_)(cleabs|id|identifiant|nom|name|label|toponyme|nature|usage|fonction|adresse|numero|voie|hauteur|altitude|etage|logement|construction|materiau|toiture|mur|etat|origine|date)(_|$)/i;

type WorkspaceRequestBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type GeoJsonGeometry = {
  type?: unknown;
  coordinates?: unknown;
};

type GeoJsonFeature = {
  type?: unknown;
  id?: unknown;
  geometry?: GeoJsonGeometry | null;
  properties?: unknown;
};

type GeoJsonFeatureCollection = {
  type?: unknown;
  features?: unknown;
  numberMatched?: unknown;
  numberReturned?: unknown;
  totalFeatures?: unknown;
};

type NormalizedBuildingFeature = {
  type: "Feature";
  id?: string | number;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
  properties: Record<string, unknown>;
};


type OsmNamedElement = {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: unknown;
  tags?: unknown;
};

type OsmNamedResponse = {
  elements?: unknown;
};

type NamedPlaceCandidate = {
  name: string;
  lat: number;
  lng: number;
  semanticScore: number;
  osmType: string;
  osmId: string;
  tags: Record<string, string>;
};

type GeometryExtent = {
  west: number;
  south: number;
  east: number;
  north: number;
};

function parseFiniteNumber(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));

  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBounds(request: NextRequest): WorkspaceRequestBounds | null {
  const south = parseFiniteNumber(request.nextUrl.searchParams.get("south"));
  const west = parseFiniteNumber(request.nextUrl.searchParams.get("west"));
  const north = parseFiniteNumber(request.nextUrl.searchParams.get("north"));
  const east = parseFiniteNumber(request.nextUrl.searchParams.get("east"));

  if (
    south === null ||
    west === null ||
    north === null ||
    east === null
  ) {
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

function createWfsUrl(options: {
  bounds: WorkspaceRequestBounds;
  resultType?: "hits";
  startIndex?: number;
  count?: number;
}) {
  const url = new URL(IGN_WFS_URL);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "2.0.0");
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("TYPENAMES", BUILDING_TYPE_NAME);
  url.searchParams.set("SRSNAME", "EPSG:4326");

  // La Géoplateforme attend ici l'ordre géographique classique
  // longitude, latitude : west, south, east, north. L'ancienne version
  // envoyait latitude, longitude et interrogeait donc une autre partie du
  // monde, ce qui expliquait notamment les résultats vides au centre de Paris.
  url.searchParams.set(
    "BBOX",
    [
      options.bounds.west,
      options.bounds.south,
      options.bounds.east,
      options.bounds.north,
      "EPSG:4326",
    ].join(","),
  );

  if (options.resultType === "hits") {
    url.searchParams.set("RESULTTYPE", "hits");
  } else {
    url.searchParams.set("OUTPUTFORMAT", "application/json");
    url.searchParams.set("COUNT", String(options.count ?? PAGE_SIZE));
    url.searchParams.set("STARTINDEX", String(options.startIndex ?? 0));
  }

  return url;
}

async function fetchIgn(url: URL, accept: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: accept,
        "User-Agent": "DroMap/1.0 IGN-BDTOPO-workspace-buildings",
      },
      cache: "force-cache",
      next: { revalidate: 21_600 },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`IGN WFS returned ${response.status}`);
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseMatchedCount(xmlText: string) {
  const match = xmlText.match(/numberMatched=["'](\d+)["']/i);

  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

async function getMatchedCount(bounds: WorkspaceRequestBounds) {
  try {
    const response = await fetchIgn(
      createWfsUrl({ bounds, resultType: "hits" }),
      "application/xml,text/xml;q=0.9,*/*;q=0.1",
    );

    return parseMatchedCount(await response.text());
  } catch {
    // Le comptage sert surtout à protéger l'éditeur. Si l'IGN ne renvoie pas
    // le nombre, la pagination conserve malgré tout la limite MAX_FEATURES.
    return null;
  }
}

function roundCoordinate(value: number) {
  return Math.round(value * 10_000_000) / 10_000_000;
}

function normalizeCoordinates(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    // La BD TOPO peut fournir un Z. DroMap travaille ici avec l'empreinte 2D.
    return [roundCoordinate(value[0]), roundCoordinate(value[1])];
  }

  return value.map(normalizeCoordinates);
}

function normalizePropertyKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeBuildingNameValue(value: unknown) {
  const candidate =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : "";

  if (!candidate) {
    return null;
  }

  const normalized = candidate
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    normalized === "nr" ||
    normalized === "n/a" ||
    normalized === "non renseigne" ||
    normalized === "non renseignee" ||
    normalized === "sans nom" ||
    normalized === "inconnu" ||
    normalized === "inconnue"
  ) {
    return null;
  }

  return candidate;
}

function getBuildingDisplayName(value: Record<string, unknown>) {
  const entries = Object.entries(value).map(([key, propertyValue]) => ({
    key: normalizePropertyKey(key),
    value: propertyValue,
  }));
  const exactPriority = [
    "label",
    "nom",
    "name",
    "toponyme",
    "denomination",
    "designation",
    "nom_batiment",
    "nom_du_batiment",
  ];

  for (const preferredKey of exactPriority) {
    const entry = entries.find(({ key }) => key === preferredKey);
    const name = entry ? normalizeBuildingNameValue(entry.value) : null;

    if (name) {
      return name;
    }
  }

  for (const entry of entries) {
    if (
      entry.key.includes("toponyme") ||
      entry.key.includes("denomination") ||
      entry.key.includes("designation") ||
      entry.key === "nom_1" ||
      entry.key.startsWith("nom_bat") ||
      entry.key.startsWith("name_")
    ) {
      const name = normalizeBuildingNameValue(entry.value);

      if (name) {
        return name;
      }
    }
  }

  return null;
}

function getBuildingFallbackLabel(value: Record<string, unknown>) {
  const normalizedEntries = new Map(
    Object.entries(value).map(([key, propertyValue]) => [
      normalizePropertyKey(key),
      propertyValue,
    ]),
  );

  for (const addressKey of ["adresse", "address", "adresse_complete"]) {
    const address = normalizeBuildingNameValue(normalizedEntries.get(addressKey));

    if (address) {
      return address;
    }
  }

  const number =
    normalizeBuildingNameValue(normalizedEntries.get("numero")) ??
    normalizeBuildingNameValue(normalizedEntries.get("numero_voie"));
  const street =
    normalizeBuildingNameValue(normalizedEntries.get("voie")) ??
    normalizeBuildingNameValue(normalizedEntries.get("nom_voie")) ??
    normalizeBuildingNameValue(normalizedEntries.get("libelle_voie"));

  if (street) {
    return number ? `${number} ${street}` : street;
  }

  // « Indifférencié », « commercial » ou « industriel » décrivent une
  // catégorie d'usage, pas le nom propre du bâtiment. On les conserve dans
  // les propriétés, mais on ne les affiche plus comme nom de l'objet.
  return "Bâtiment sans nom renseigné";
}

function compactProperties(value: unknown) {
  if (!isRecord(value)) {
    return {
      label: "Bâtiment",
      source: "IGN BD TOPO®",
      source_layer: BUILDING_TYPE_NAME,
    };
  }

  const compacted: Record<string, unknown> = {};
  const displayName = getBuildingDisplayName(value);

  for (const [key, propertyValue] of Object.entries(value)) {
    if (!USEFUL_PROPERTY_PATTERN.test(key)) {
      continue;
    }

    if (
      typeof propertyValue === "string" ||
      typeof propertyValue === "number" ||
      typeof propertyValue === "boolean"
    ) {
      if (typeof propertyValue !== "string" || propertyValue.trim()) {
        compacted[key] = propertyValue;
      }
    }
  }

  // Le champ label est celui que DroMap réutilise comme nom de l’objet et
  // comme contenu potentiel de l’étiquette. Quand aucun nom officiel n’est
  // fourni, une adresse ou une nature utile sert de repli avant « Bâtiment ».
  compacted.label = displayName ?? getBuildingFallbackLabel(value);

  if (displayName) {
    compacted.name = displayName;
    compacted.name_source = "IGN BD TOPO®";
  }

  compacted.source = "IGN BD TOPO®";
  compacted.source_layer = BUILDING_TYPE_NAME;

  return compacted;
}

function normalizeFeature(
  value: unknown,
  fallbackIndex: number,
): NormalizedBuildingFeature | null {
  if (!isRecord(value)) {
    return null;
  }

  const feature = value as GeoJsonFeature;
  const geometry = feature.geometry;

  if (!geometry || !isRecord(geometry)) {
    return null;
  }

  const geometryType = geometry.type;

  if (geometryType !== "Polygon" && geometryType !== "MultiPolygon") {
    return null;
  }

  if (!Array.isArray(geometry.coordinates)) {
    return null;
  }

  const rawId = feature.id;
  const properties = compactProperties(feature.properties);
  const propertyId =
    typeof properties.cleabs === "string" ||
    typeof properties.cleabs === "number"
      ? properties.cleabs
      : undefined;
  const id =
    typeof rawId === "string" || typeof rawId === "number"
      ? rawId
      : propertyId ?? `ign-building-${fallbackIndex + 1}`;

  return {
    type: "Feature",
    id,
    geometry: {
      type: geometryType,
      coordinates: normalizeCoordinates(geometry.coordinates),
    },
    properties,
  };
}


function normalizeComparableText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isUsableExactName(value: unknown) {
  const name = normalizeBuildingNameValue(value);

  if (!name) {
    return null;
  }

  const normalized = normalizeComparableText(name);
  const genericNames = new Set([
    "batiment",
    "batiment sans nom renseigne",
    "indifferencie",
    "commercial",
    "industriel",
    "residentiel",
    "agricole",
    "autre",
  ]);

  return genericNames.has(normalized) ? null : name;
}

function stringTags(value: unknown) {
  if (!isRecord(value)) {
    return {} as Record<string, string>;
  }

  const tags: Record<string, string> = {};

  for (const [key, tagValue] of Object.entries(value)) {
    if (typeof tagValue === "string" && tagValue.trim()) {
      tags[key] = tagValue.trim();
    }
  }

  return tags;
}

const LATIN_LETTER_PATTERN = /\p{Script=Latin}/u;
const CYRILLIC_LETTER_PATTERN = /\p{Script=Cyrillic}/u;
const LETTER_PATTERN = /\p{L}/u;

function localizedNameScriptPriority(value: string) {
  let hasLetter = false;
  let hasLatin = false;
  let hasCyrillic = false;
  let hasUnsupportedLetter = false;

  for (const character of value) {
    if (!LETTER_PATTERN.test(character)) continue;
    hasLetter = true;
    if (LATIN_LETTER_PATTERN.test(character)) hasLatin = true;
    else if (CYRILLIC_LETTER_PATTERN.test(character)) hasCyrillic = true;
    else hasUnsupportedLetter = true;
  }

  if (!hasLetter || hasUnsupportedLetter) return -1;
  if (hasLatin) return 300;
  if (hasCyrillic) return 200;
  return -1;
}

function localizedTagPriority(key: string) {
  const normalized = key.toLocaleLowerCase("fr");
  if (
    normalized.endsWith(":fr") ||
    normalized.endsWith("_fr") ||
    normalized === "name:fr" ||
    normalized === "official_name:fr" ||
    normalized === "short_name:fr"
  ) {
    return 1_400;
  }
  if (
    normalized === "int_name" ||
    normalized.includes("latin") ||
    normalized.includes("latn") ||
    normalized.includes("translit")
  ) {
    return 1_050;
  }
  if (normalized.endsWith(":en") || normalized.endsWith("_en")) return 900;
  if (normalized === "official_name") return 180;
  if (normalized === "name") return 160;
  if (normalized === "short_name") return 140;
  if (normalized === "alt_name" || normalized === "loc_name") return 100;
  if (normalized === "brand") return 70;
  if (normalized === "operator") return 60;
  return 0;
}

function candidateNameFromTags(tags: Record<string, string>) {
  const allowedKeys = Object.keys(tags).filter((key) => {
    const normalized = key.toLocaleLowerCase("fr");
    return (
      normalized === "name" ||
      normalized.startsWith("name:") ||
      normalized.startsWith("name_") ||
      normalized === "official_name" ||
      normalized.startsWith("official_name:") ||
      normalized === "short_name" ||
      normalized.startsWith("short_name:") ||
      normalized === "alt_name" ||
      normalized === "loc_name" ||
      normalized === "int_name" ||
      normalized.includes("latin") ||
      normalized.includes("translit") ||
      normalized === "brand" ||
      normalized === "operator"
    );
  });

  const candidates = allowedKeys
    .map((key, order) => {
      const name = isUsableExactName(tags[key]);
      if (!name) return null;
      const scriptPriority = localizedNameScriptPriority(name);
      if (scriptPriority < 0) return null;
      return {
        name,
        order,
        score: localizedTagPriority(key) + scriptPriority,
      };
    })
    .filter(
      (candidate): candidate is { name: string; order: number; score: number } =>
        candidate !== null,
    )
    .sort(
      (first, second) =>
        second.score - first.score || first.order - second.order,
    );

  return candidates[0]?.name ?? null;
}

function institutionalAmenity(value: string | undefined) {
  return new Set([
    "university",
    "college",
    "school",
    "kindergarten",
    "hospital",
    "clinic",
    "townhall",
    "courthouse",
    "police",
    "fire_station",
    "library",
    "theatre",
    "arts_centre",
    "place_of_worship",
    "community_centre",
    "research_institute",
  ]).has(value ?? "");
}

function semanticCandidateScore(tags: Record<string, string>, osmType: string) {
  let score = osmType === "way" || osmType === "relation" ? 15 : 0;

  if (tags.building && tags.building !== "no") {
    score += 100;
  }

  if (institutionalAmenity(tags.amenity)) {
    score += 90;
  } else if (tags.amenity) {
    score += 55;
  }

  if (tags.office) score += 70;
  if (tags.healthcare) score += 75;
  if (tags.historic) score += 70;
  if (tags.tourism) score += 60;
  if (tags.railway || tags.public_transport || tags.aeroway) score += 65;
  if (tags.leisure || tags.craft || tags.man_made || tags.military) score += 50;
  if (tags.shop) score += 35;
  if (tags.official_name) score += 10;

  return score;
}

function parseOsmNamedCandidates(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray((payload as OsmNamedResponse).elements)) {
    return [] as NamedPlaceCandidate[];
  }

  const candidates: NamedPlaceCandidate[] = [];

  for (const rawElement of (payload as OsmNamedResponse).elements as unknown[]) {
    if (!isRecord(rawElement)) {
      continue;
    }

    const element = rawElement as OsmNamedElement;
    const tags = stringTags(element.tags);
    const name = candidateNameFromTags(tags);
    const osmType = typeof element.type === "string" ? element.type : "node";
    const osmId =
      typeof element.id === "number" || typeof element.id === "string"
        ? String(element.id)
        : "";
    const center = isRecord(element.center) ? element.center : null;
    const lat = parseFiniteNumber(element.lat ?? center?.lat);
    const lng = parseFiniteNumber(element.lon ?? center?.lon);

    if (!name || lat === null || lng === null) {
      continue;
    }

    candidates.push({
      name,
      lat,
      lng,
      semanticScore: semanticCandidateScore(tags, osmType),
      osmType,
      osmId,
      tags,
    });

    if (candidates.length >= MAX_OSM_NAME_CANDIDATES) {
      break;
    }
  }

  return candidates;
}

function approximateBoundsAreaKm2(bounds: WorkspaceRequestBounds) {
  const meanLatitude = ((bounds.south + bounds.north) / 2) * (Math.PI / 180);
  const widthKm = Math.abs(bounds.east - bounds.west) * 111.32 * Math.cos(meanLatitude);
  const heightKm = Math.abs(bounds.north - bounds.south) * 110.57;
  return widthKm * heightKm;
}

function createOverpassNameQuery(bounds: WorkspaceRequestBounds) {
  const bbox = [bounds.south, bounds.west, bounds.north, bounds.east].join(",");
  const objectSelectors = [
    "building",
    "amenity",
    "office",
    "shop",
    "tourism",
    "leisure",
    "healthcare",
    "craft",
    "historic",
    "railway",
    "public_transport",
    "aeroway",
    "man_made",
    "military",
  ];
  const nameSelectors = ["name", "name:fr", "int_name"];
  const selectors = nameSelectors.flatMap((nameKey) =>
    objectSelectors.map(
      (objectKey) => `nwr["${nameKey}"]["${objectKey}"]`,
    ),
  );

  return `[out:json][timeout:18];\n(\n${selectors
    .map((selector) => `  ${selector}(${bbox});`)
    .join("\n")}\n);\nout center tags;`;
}

async function fetchOsmNamedCandidates(bounds: WorkspaceRequestBounds) {
  const query = createOverpassNameQuery(bounds);
  let lastError: unknown = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      OSM_NAME_REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "DroMap/1.0 building-name-enrichment",
        },
        body: new URLSearchParams({ data: query }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Overpass returned ${response.status}`);
      }

      return parseOsmNamedCandidates(await response.json());
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (lastError) {
    console.warn("DroMap building-name enrichment unavailable", lastError);
  }

  return [] as NamedPlaceCandidate[];
}

function visitGeometryCoordinates(value: unknown, extent: GeometryExtent) {
  if (!Array.isArray(value)) {
    return;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  ) {
    extent.west = Math.min(extent.west, value[0]);
    extent.east = Math.max(extent.east, value[0]);
    extent.south = Math.min(extent.south, value[1]);
    extent.north = Math.max(extent.north, value[1]);
    return;
  }

  for (const child of value) {
    visitGeometryCoordinates(child, extent);
  }
}

function getGeometryExtent(coordinates: unknown) {
  const extent: GeometryExtent = {
    west: Number.POSITIVE_INFINITY,
    south: Number.POSITIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
  };
  visitGeometryCoordinates(coordinates, extent);

  return Number.isFinite(extent.west) && Number.isFinite(extent.south)
    ? extent
    : null;
}

function asPosition(value: unknown): [number, number] | null {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    typeof value[0] !== "number" ||
    typeof value[1] !== "number" ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1])
  ) {
    return null;
  }

  return [value[0], value[1]];
}

function pointInRing(point: [number, number], rawRing: unknown) {
  if (!Array.isArray(rawRing) || rawRing.length < 3) {
    return false;
  }

  const ring = rawRing.map(asPosition).filter((value): value is [number, number] => value !== null);

  if (ring.length < 3) {
    return false;
  }

  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    const intersects =
      currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
      point[0] <
        ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1] || Number.EPSILON) +
          currentPoint[0];

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(point: [number, number], rawPolygon: unknown) {
  if (!Array.isArray(rawPolygon) || rawPolygon.length === 0) {
    return false;
  }

  if (!pointInRing(point, rawPolygon[0])) {
    return false;
  }

  for (let index = 1; index < rawPolygon.length; index += 1) {
    if (pointInRing(point, rawPolygon[index])) {
      return false;
    }
  }

  return true;
}

function pointInBuilding(
  point: [number, number],
  geometry: NormalizedBuildingFeature["geometry"],
) {
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }

  if (!Array.isArray(geometry.coordinates)) {
    return false;
  }

  return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
}

function gridCoordinate(value: number) {
  return Math.floor(value / OSM_NAME_GRID_SIZE);
}

function gridKey(x: number, y: number) {
  return `${x}:${y}`;
}

function indexNamedCandidates(candidates: NamedPlaceCandidate[]) {
  const index = new Map<string, NamedPlaceCandidate[]>();

  for (const candidate of candidates) {
    const key = gridKey(gridCoordinate(candidate.lng), gridCoordinate(candidate.lat));
    const bucket = index.get(key);

    if (bucket) {
      bucket.push(candidate);
    } else {
      index.set(key, [candidate]);
    }
  }

  return index;
}

function candidatesForExtent(
  index: Map<string, NamedPlaceCandidate[]>,
  extent: GeometryExtent,
) {
  const result: NamedPlaceCandidate[] = [];
  const minX = gridCoordinate(extent.west);
  const maxX = gridCoordinate(extent.east);
  const minY = gridCoordinate(extent.south);
  const maxY = gridCoordinate(extent.north);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      result.push(...(index.get(gridKey(x, y)) ?? []));
    }
  }

  return result;
}

function chooseBuildingNameCandidate(
  feature: NormalizedBuildingFeature,
  candidates: NamedPlaceCandidate[],
  extent: GeometryExtent,
) {
  const centerLng = (extent.west + extent.east) / 2;
  const centerLat = (extent.south + extent.north) / 2;
  const inside = candidates
    .filter((candidate) =>
      pointInBuilding([candidate.lng, candidate.lat], feature.geometry),
    )
    .map((candidate) => ({
      candidate,
      score:
        candidate.semanticScore -
        Math.hypot(candidate.lng - centerLng, candidate.lat - centerLat) * 10_000,
    }))
    .sort((first, second) => second.score - first.score);

  if (inside.length === 0) {
    return null;
  }

  const first = inside[0];
  const second = inside[1];

  if (!second) {
    return first.candidate;
  }

  if (
    normalizeComparableText(first.candidate.name) ===
    normalizeComparableText(second.candidate.name)
  ) {
    return first.candidate;
  }

  // Plusieurs commerces ou services dans le même immeuble ne constituent pas
  // nécessairement le nom du bâtiment. On ne tranche que si la meilleure
  // donnée est clairement plus structurante que les autres.
  return first.score - second.score >= 22 && first.candidate.semanticScore >= 70
    ? first.candidate
    : null;
}

async function enrichBuildingsWithOpenStreetMapNames(
  features: NormalizedBuildingFeature[],
  bounds: WorkspaceRequestBounds,
) {
  if (
    features.length === 0 ||
    features.length > MAX_OSM_ENRICHMENT_BUILDINGS ||
    approximateBoundsAreaKm2(bounds) > MAX_OSM_ENRICHMENT_AREA_KM2
  ) {
    return 0;
  }

  const unnamedFeatures = features.filter(
    (feature) => !isUsableExactName(feature.properties.name),
  );

  if (unnamedFeatures.length === 0) {
    return 0;
  }

  const candidates = await fetchOsmNamedCandidates(bounds);

  if (candidates.length === 0) {
    return 0;
  }

  const candidateIndex = indexNamedCandidates(candidates);
  let enrichedCount = 0;

  for (const feature of unnamedFeatures) {
    const extent = getGeometryExtent(feature.geometry.coordinates);

    if (!extent) {
      continue;
    }

    const candidate = chooseBuildingNameCandidate(
      feature,
      candidatesForExtent(candidateIndex, extent),
      extent,
    );

    if (!candidate) {
      continue;
    }

    feature.properties.label = candidate.name;
    feature.properties.name = candidate.name;
    feature.properties.name_source = "OpenStreetMap";
    feature.properties.osm_type = candidate.osmType;
    feature.properties.osm_id = candidate.osmId;

    for (const key of [
      "amenity",
      "office",
      "shop",
      "tourism",
      "leisure",
      "healthcare",
      "historic",
      "railway",
      "public_transport",
      "aeroway",
      "building",
    ]) {
      if (candidate.tags[key]) {
        feature.properties[`osm_${key}`] = candidate.tags[key];
      }
    }

    enrichedCount += 1;
  }

  return enrichedCount;
}

async function fetchBuildingPage(
  bounds: WorkspaceRequestBounds,
  startIndex: number,
) {
  const response = await fetchIgn(
    createWfsUrl({ bounds, startIndex, count: PAGE_SIZE }),
    "application/geo+json,application/json;q=0.9,*/*;q=0.1",
  );
  const responseText = await response.text();

  if (responseText.trimStart().startsWith("<")) {
    throw new Error("IGN WFS returned an XML exception instead of GeoJSON");
  }

  const payload = JSON.parse(responseText) as GeoJsonFeatureCollection;
  const rawFeatures = Array.isArray(payload.features) ? payload.features : [];

  return {
    rawFeatures,
    numberReturned:
      parseFiniteNumber(payload.numberReturned) ?? rawFeatures.length,
    numberMatched:
      parseFiniteNumber(payload.numberMatched) ??
      parseFiniteNumber(payload.totalFeatures),
  };
}

export async function GET(request: NextRequest) {
  const bounds = parseBounds(request);

  if (!bounds) {
    return NextResponse.json(
      {
        error:
          "La zone de travail transmise est invalide. Modifie puis valide à nouveau la zone.",
      },
      { status: 400 },
    );
  }

  try {
    const matchedCount = await getMatchedCount(bounds);

    if (matchedCount !== null && matchedCount > MAX_FEATURES) {
      return NextResponse.json(
        {
          error:
            `Cette zone contient environ ${matchedCount.toLocaleString("fr-FR")} bâtiments. ` +
            `L’import est limité à ${MAX_FEATURES.toLocaleString("fr-FR")} bâtiments pour ne pas bloquer DroMap. Réduis la zone de travail.`,
          code: "TOO_MANY_BUILDINGS",
          matchedCount,
          maxFeatures: MAX_FEATURES,
        },
        { status: 413 },
      );
    }

    const features: NormalizedBuildingFeature[] = [];
    const seenIds = new Set<string>();
    let startIndex = 0;
    let knownMatchedCount = matchedCount;

    while (features.length < MAX_FEATURES) {
      const page = await fetchBuildingPage(bounds, startIndex);

      if (knownMatchedCount === null && page.numberMatched !== null) {
        knownMatchedCount = page.numberMatched;

        if (knownMatchedCount > MAX_FEATURES) {
          return NextResponse.json(
            {
              error:
                `Cette zone contient environ ${knownMatchedCount.toLocaleString("fr-FR")} bâtiments. ` +
                `L’import est limité à ${MAX_FEATURES.toLocaleString("fr-FR")} bâtiments pour ne pas bloquer DroMap. Réduis la zone de travail.`,
              code: "TOO_MANY_BUILDINGS",
              matchedCount: knownMatchedCount,
              maxFeatures: MAX_FEATURES,
            },
            { status: 413 },
          );
        }
      }

      let addedOnThisPage = 0;

      for (const rawFeature of page.rawFeatures) {
        const normalized = normalizeFeature(
          rawFeature,
          startIndex + features.length,
        );

        if (!normalized) {
          continue;
        }

        const key = String(normalized.id ?? "");

        if (key && seenIds.has(key)) {
          continue;
        }

        if (key) {
          seenIds.add(key);
        }

        features.push(normalized);
        addedOnThisPage += 1;

        if (features.length >= MAX_FEATURES) {
          break;
        }
      }

      const returnedCount = Math.max(
        0,
        Math.round(page.numberReturned || page.rawFeatures.length),
      );

      if (
        page.rawFeatures.length === 0 ||
        returnedCount === 0 ||
        returnedCount < PAGE_SIZE ||
        addedOnThisPage === 0 ||
        (knownMatchedCount !== null &&
          startIndex + returnedCount >= knownMatchedCount)
      ) {
        break;
      }

      startIndex += returnedCount;
    }

    if (features.length === 0) {
      return NextResponse.json(
        {
          error:
            "Aucun bâtiment BD TOPO® n’a été trouvé dans cette zone. La source actuelle couvre les territoires diffusés par l’IGN ; vérifie aussi que la zone est bien située en France ou dans un territoire couvert.",
          code: "NO_BUILDINGS",
        },
        { status: 404 },
      );
    }

    const enrichedNameCount = await enrichBuildingsWithOpenStreetMapNames(
      features,
      bounds,
    );

    return NextResponse.json(
      {
        type: "FeatureCollection",
        features,
        metadata: {
          provider: "ign",
          source: "IGN BD TOPO®",
          sourceName: "ign-bdtopo-buildings.geojson",
          sourceLabel: "IGN BD TOPO® — Bâtiments",
          sourceUrl: "https://cartes.gouv.fr/",
          license: "Licence Ouverte / Etalab 2.0",
          attribution: "© IGN · BD TOPO®",
          typeName: BUILDING_TYPE_NAME,
          bbox: bounds,
          matchedCount: knownMatchedCount,
          featureCount: features.length,
          enrichedNameCount,
          nameEnrichmentSource:
            enrichedNameCount > 0 ? "OpenStreetMap" : null,
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=21600",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Le service de bâtiments IGN a mis trop de temps à répondre. Réduis la zone de travail puis réessaie."
        : "Le service de bâtiments IGN est momentanément indisponible.";

    console.error("DroMap IGN buildings import failed", error);

    return NextResponse.json({ error: message }, { status: 503 });
  }
}
