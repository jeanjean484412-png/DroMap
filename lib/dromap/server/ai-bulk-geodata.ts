import "server-only";

import { DROMAP_GEOJSON_CATALOG } from "@/editor/geojson-data-catalog";
import type { DroMapAiBounds, DroMapAiCoordinate } from "@/editor/dromap-ai-types";
import { readPublicUrl } from "./public-url";

type Point = [number, number];
type Geometry = { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
type GeoFeature = { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> };
type GeoCollection = { features?: GeoFeature[] };
type Country = { geometry: Geometry; properties: Record<string, unknown> };

export type BulkPlaceRequest = {
  kind: "capitals" | "cities" | "factories" | "hospitals" | "schools" | "universities" | "museums" | "airports" | "stations";
  minimumPopulation: number | null;
  scopeText: string;
  usesWorkspace: boolean;
};
export type GroundedPlace = {
  id: string;
  label: string;
  coordinate: DroMapAiCoordinate;
  population: number | null;
  sourceUrl: string;
};
export type BulkPlaceResult = {
  kind: BulkPlaceRequest["kind"];
  items: GroundedPlace[];
  scopeLabel: string;
  sourceTitle: string;
  sourceUrl: string;
  warnings: string[];
};

const MAX_RESULTS = 2_500;
const CACHE_MS = 60 * 60 * 1_000;
const OSM_URL = "https://overpass-api.de/api/interpreter";
const OSM_TAGS: Record<Exclude<BulkPlaceRequest["kind"], "capitals" | "cities">, { selectors: string[]; label: string; plural: string }> = {
  factories: { selectors: ['nwr["man_made"="works"]', 'nwr["industrial"="factory"]'], label: "Usine", plural: "usines" },
  hospitals: { selectors: ['nwr["amenity"="hospital"]'], label: "Hôpital", plural: "hôpitaux" },
  schools: { selectors: ['nwr["amenity"="school"]'], label: "École", plural: "écoles" },
  universities: { selectors: ['nwr["amenity"="university"]'], label: "Université", plural: "universités" },
  museums: { selectors: ['nwr["tourism"="museum"]'], label: "Musée", plural: "musées" },
  airports: { selectors: ['nwr["aeroway"="aerodrome"]'], label: "Aéroport", plural: "aéroports" },
  stations: { selectors: ['nwr["railway"="station"]'], label: "Gare", plural: "gares" },
};
const SOURCE_URL = "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/";
const BOUNDARY_ID = "natural-earth-countries-50m";
const PLACES_ID = "natural-earth-populated-places-10m-simple";
const cache = new Map<string, { until: number; value: Promise<GeoCollection> }>();
const osmCache = new Map<string, { until: number; value: Promise<GroundedPlace[]> }>();

function normalized(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseBulkPlaceRequest(prompt: string): BulkPlaceRequest | null {
  const text = normalized(prompt);
  const hasMapAction = /\b(affiche|ajoute|place|met|mets|montre|marque|represente|localise|positionne|visualise)\b/.test(text);
  const isBulk = hasMapAction || /^(?:tous|toutes)\s+les\b/.test(text);
  if (!isBulk) return null;
  const categories = [
    /\bcapitales?\b/.test(text) ? "capitals" : null,
    /\b(villes?|agglomerations?)\b/.test(text) ? "cities" : null,
    /\b(usines?|fabriques?)\b/.test(text) ? "factories" : null,
    /\b(hopitaux|hopital)\b/.test(text) ? "hospitals" : null,
    /\b(ecoles?)\b/.test(text) ? "schools" : null,
    /\b(universites?)\b/.test(text) ? "universities" : null,
    /\b(musees?)\b/.test(text) ? "museums" : null,
    /\b(aeroports?|aerodromes?)\b/.test(text) ? "airports" : null,
    /\b(gares?)\b/.test(text) ? "stations" : null,
  ].filter((value): value is BulkPlaceRequest["kind"] => value !== null);
  if (categories.length !== 1) return null;
  const kind = categories[0];
  const numericText = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const populationMatch = numericText.match(/(?:plus de|superieur(?:e|es|s)? a|au dessus de|>)\s*([\d][\d\s.,]*)\s*(millions?|mille|k)?\s*(?:d['’ ]?)?habitants?/);
  const rawNumber = populationMatch?.[1]?.trim().replace(/\s/g, "");
  const multiplier = populationMatch?.[2]?.startsWith("million") ? 1_000_000 :
    populationMatch?.[2] === "mille" || populationMatch?.[2] === "k" ? 1_000 : 1;
  const normalizedNumber = rawNumber
    ? multiplier > 1 ? rawNumber.replace(",", ".") : rawNumber.replace(/[.,](?=\d{3}(?:\D|$))/g, "")
    : null;
  const minimumPopulation = normalizedNumber ? Number(normalizedNumber) * multiplier : null;
  return {
    kind,
    minimumPopulation: minimumPopulation !== null && Number.isFinite(minimumPopulation) ? minimumPopulation : null,
    scopeText: text,
    usesWorkspace: /\b(zone|emprise|selectionnee?)\b/.test(text),
  };
}

function catalogUrl(id: string) {
  const entry = DROMAP_GEOJSON_CATALOG.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Source géographique introuvable : ${id}.`);
  return entry.downloadUrl;
}

async function getGeoCollection(url: string) {
  const hit = cache.get(url);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = readPublicUrl(new URL(url), 25 * 1024 * 1024, 60_000)
    .then((text) => JSON.parse(text) as GeoCollection);
  cache.set(url, { until: Date.now() + CACHE_MS, value });
  try { return await value; }
  catch (error) { cache.delete(url); throw error; }
}

function property(properties: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = properties[key] ?? properties[key.toLowerCase()] ?? properties[key.toUpperCase()];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function pointInRing(point: Point, ring: number[][]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    if (!a || !b || (a[1] > point[1]) === (b[1] > point[1])) continue;
    const crossing = (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0];
    if (point[0] < crossing) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: Point, rings: number[][][]) {
  return Boolean(rings[0] && pointInRing(point, rings[0]) &&
    !rings.slice(1).some((hole) => pointInRing(point, hole)));
}

function pointInGeometry(point: Point, geometry: Geometry) {
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates as number[][][]]
    : geometry.coordinates as number[][][][];
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

function inBounds(point: Point, bounds: DroMapAiBounds | null) {
  if (!bounds) return true;
  return point[1] >= bounds.south && point[1] <= bounds.north &&
    [point[0], point[0] - 360, point[0] + 360]
      .some((longitude) => longitude >= bounds.west && longitude <= bounds.east);
}

function validCountries(collection: GeoCollection): Country[] {
  return (collection.features ?? []).flatMap((feature) => {
    const geometry = feature.geometry;
    return feature.properties && geometry &&
      (geometry.type === "Polygon" || geometry.type === "MultiPolygon") &&
      Array.isArray(geometry.coordinates)
      ? [{ geometry: geometry as Geometry, properties: feature.properties }]
      : [];
  });
}

function scopeCountries(text: string, countries: Country[]) {
  if (/\b(europe|europeen|europeenne)\b/.test(text)) {
    return { label: "Europe", countries: countries.filter((country) =>
      normalized(property(country.properties, "CONTINENT")) === "europe"), european: true };
  }
  if (/\b(monde|mondial|planete)\b/.test(text)) {
    return { label: "monde", countries: [] as Country[], european: false };
  }
  const displayNames = new Intl.DisplayNames(["fr"], { type: "region" });
  const candidates = countries.flatMap((country) => {
    const iso = property(country.properties, "ISO_A2");
    const names = [property(country.properties, "ADMIN", "NAME_EN", "NAME"),
      iso.length === 2 && iso !== "-99" ? displayNames.of(iso) ?? "" : ""];
    return names.filter((name) => name.length > 3).map((name) => ({ country, name }));
  }).sort((a, b) => b.name.length - a.name.length);
  const match = candidates.find(({ name }) => {
    const key = normalized(name);
    return new RegExp(`\\b${key.replace(/ /g, "\\s+")}\\b`).test(text);
  });
  return match ? { label: match.name, countries: [match.country], european: false } :
    { label: "zone de travail", countries: [] as Country[], european: false };
}

function geometryBounds(countries: Country[]): DroMapAiBounds | null {
  if (!countries.length) return null;
  const points = countries.flatMap(({ geometry }) => {
    const polygons = geometry.type === "Polygon"
      ? [geometry.coordinates as number[][][]]
      : geometry.coordinates as number[][][][];
    return polygons.flatMap((polygon) => polygon.flat());
  });
  return {
    south: Math.min(...points.map((point) => point[1])),
    west: Math.min(...points.map((point) => point[0])),
    north: Math.max(...points.map((point) => point[1])),
    east: Math.max(...points.map((point) => point[0])),
  };
}

function polygonBounds(country: Country): DroMapAiBounds[] {
  const polygons = country.geometry.type === "Polygon"
    ? [country.geometry.coordinates as number[][][]]
    : country.geometry.coordinates as number[][][][];
  return polygons.map((polygon) => {
    const points = polygon.flat();
    return {
      south: Math.min(...points.map((point) => point[1])),
      west: Math.min(...points.map((point) => point[0])),
      north: Math.max(...points.map((point) => point[1])),
      east: Math.max(...points.map((point) => point[0])),
    };
  });
}

function intersectBounds(first: DroMapAiBounds, second: DroMapAiBounds | null) {
  if (!second) return first;
  return {
    south: Math.max(first.south, second.south), west: Math.max(first.west, second.west),
    north: Math.min(first.north, second.north), east: Math.min(first.east, second.east),
  };
}

function areaKm2(bounds: DroMapAiBounds) {
  const meanLatitude = (bounds.north + bounds.south) / 2 * Math.PI / 180;
  return Math.abs((bounds.north - bounds.south) * 111.2 *
    (bounds.east - bounds.west) * 111.2 * Math.cos(meanLatitude));
}

function splitLargeBounds(bounds: DroMapAiBounds): DroMapAiBounds[] {
  if (areaKm2(bounds) <= 750_000) return [bounds];
  const latitudeSpan = bounds.north - bounds.south;
  const longitudeSpan = bounds.east - bounds.west;
  if (latitudeSpan < 0.01 || longitudeSpan < 0.01) return [bounds];
  const splitLongitude = longitudeSpan * Math.cos((bounds.north + bounds.south) / 2 * Math.PI / 180) > latitudeSpan;
  const middle = splitLongitude ? (bounds.east + bounds.west) / 2 : (bounds.north + bounds.south) / 2;
  const first = splitLongitude ? { ...bounds, east: middle } : { ...bounds, north: middle };
  const second = splitLongitude ? { ...bounds, west: middle } : { ...bounds, south: middle };
  return [...splitLargeBounds(first), ...splitLargeBounds(second)];
}

async function queryOsmPlaces(bounds: DroMapAiBounds, kind: keyof typeof OSM_TAGS): Promise<GroundedPlace[]> {
  if (areaKm2(bounds) > 750_000) {
    throw new Error("La recherche de tous ces lieux est trop vaste pour une requête fiable. Sélectionne une zone de travail plus petite, puis relance la demande.");
  }
  const bbox = [bounds.south, bounds.west, bounds.north, bounds.east].join(",");
  const query = `[out:json][timeout:60];(${OSM_TAGS[kind].selectors.map((selector) => `${selector}(${bbox});`).join("")});out body center;`;
  const url = new URL(OSM_URL);
  url.searchParams.set("data", query);
  let rawResponse: string;
  try {
    rawResponse = await readPublicUrl(url, 25 * 1024 * 1024, 75_000);
  } catch {
    throw new Error("La source OpenStreetMap est indisponible ou la réponse est trop volumineuse. Réessaie avec une zone plus petite.");
  }
  const response = JSON.parse(rawResponse) as {
    elements?: Array<{ type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> }>;
    remark?: string;
  };
  if (response.remark) throw new Error("La source OpenStreetMap n'a pas pu terminer la recherche. Réessaie avec une zone plus petite.");
  const elements = response.elements ?? [];
  if (elements.length > MAX_RESULTS) throw new Error(`Plus de ${MAX_RESULTS} lieux sont recensés dans ce secteur. Réduis la zone pour obtenir une liste complète sans troncature.`);
  return elements.flatMap((element) => {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !element.type || !element.id) return [];
    return [{
      id: `osm-${element.type}-${element.id}`,
      label: element.tags?.name || `${OSM_TAGS[kind].label} OSM ${element.id}`,
      coordinate: { lat: lat as number, lng: lng as number },
      population: null,
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    }];
  });
}

async function fetchOsmPlaces(bounds: DroMapAiBounds, kind: keyof typeof OSM_TAGS) {
  const key = `${kind}:${JSON.stringify(bounds)}`;
  const hit = osmCache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = queryOsmPlaces(bounds, kind);
  osmCache.set(key, { until: Date.now() + 5 * 60_000, value });
  try { return await value; }
  catch (error) { osmCache.delete(key); throw error; }
}

export async function resolveBulkPlaces(request: BulkPlaceRequest, workspace: DroMapAiBounds | null): Promise<BulkPlaceResult> {
  if (request.usesWorkspace && !workspace) throw new Error("La « zone » désigne la zone de travail validée : sélectionne et valide-la avant cette demande.");
  const countryData = await getGeoCollection(catalogUrl(BOUNDARY_ID));
  const scope = scopeCountries(request.scopeText, validCountries(countryData));
  const hasNamedScope = scope.label !== "zone de travail";
  if (!workspace && !hasNamedScope) throw new Error("Valide d'abord une zone de travail, ou nomme un pays, l'Europe ou le monde dans ta demande.");
  const namedBounds = geometryBounds(scope.countries);
  const activeBounds = workspace && namedBounds ? intersectBounds(workspace, namedBounds) : workspace ?? namedBounds;
  if (activeBounds && (activeBounds.south >= activeBounds.north || activeBounds.west >= activeBounds.east)) {
    throw new Error("Le territoire demandé ne recoupe pas la zone de travail actuelle.");
  }
  const countryScopes = scope.countries.map((country) => ({ country, bounds: geometryBounds([country]) }));
  const countryCodes = new Set(scope.countries.map((country) => property(country.properties, "ADM0_A3")).filter((code) => code && code !== "-99"));
  const inside = (coordinate: DroMapAiCoordinate) => {
    const point: Point = [coordinate.lng, coordinate.lat];
    return inBounds(point, activeBounds) &&
      (!countryScopes.length || countryScopes.some(({ country, bounds }) =>
        inBounds(point, bounds) && pointInGeometry(point, country.geometry))) &&
      (!scope.european || (coordinate.lng <= 60 && coordinate.lat >= 34));
  };
  const warnings: string[] = [];
  if (workspace && hasNamedScope) {
    warnings.push("Seule la partie du territoire demandé comprise dans la zone de travail est incluse.");
  }
  if (scope.countries.length) warnings.push("Le filtrage par pays utilise les contours généralisés Natural Earth à l'échelle 1:50m ; vérifie les points très proches d'une frontière.");
  if (scope.european) warnings.push("L'Europe suit le classement des pays Natural Earth ; les territoires transcontinentaux peuvent être discutables.");
  let items: GroundedPlace[];
  let sourceTitle: string;
  let sourceUrl: string;
  if (request.kind in OSM_TAGS) {
    const osmKind = request.kind as keyof typeof OSM_TAGS;
    if (!activeBounds) throw new Error("Une zone géographique est nécessaire pour rechercher ces lieux.");
    const polygonQueryBounds = scope.countries.length
      ? scope.countries.flatMap((country) => polygonBounds(country))
        .map((bounds) => intersectBounds(bounds, workspace))
        .filter((bounds) => bounds.south < bounds.north && bounds.west < bounds.east)
      : [activeBounds];
    const queryBounds = polygonQueryBounds.flatMap(splitLargeBounds);
    if (queryBounds.length > 4) {
      throw new Error("Le territoire contient trop de secteurs distincts pour rechercher tous ces lieux de façon fiable. Réduis la zone de travail.");
    }
    const factoryGroups: GroundedPlace[][] = [];
    for (let index = 0; index < queryBounds.length; index += 2) {
      factoryGroups.push(...await Promise.all(queryBounds.slice(index, index + 2)
        .map((bounds) => fetchOsmPlaces(bounds, osmKind))));
      if (factoryGroups.reduce((count, group) => count + group.length, 0) > MAX_RESULTS) {
        throw new Error(`Plus de ${MAX_RESULTS} lieux sont recensés dans ce secteur. Réduis la zone pour obtenir une liste complète sans troncature.`);
      }
    }
    items = Array.from(new Map(factoryGroups.flat().filter((item) => inside(item.coordinate))
      .map((item) => [item.id, item])).values());
    sourceTitle = `OpenStreetMap / Overpass — ${OSM_TAGS[osmKind].plural}`;
    sourceUrl = "https://www.openstreetmap.org/copyright";
    warnings.push(`La couverture OpenStreetMap des ${OSM_TAGS[osmKind].plural} peut être incomplète ; seuls les objets correspondant aux étiquettes OSM recherchées sont inclus.`);
  } else {
    if (request.kind === "cities" && request.minimumPopulation === null) {
      throw new Error("Indique un seuil, par exemple « toutes les villes de plus de 100 000 habitants de la zone ».");
    }
    if (request.kind === "cities" && /\b(municipal|municipale|communal|communale|intra muros)\b/.test(request.scopeText)) {
      throw new Error("Je ne dispose pas d'un recensement municipal mondial suffisamment homogène pour cette sélection. Précise une source statistique officielle ou demande les agglomérations estimées de Natural Earth.");
    }
    const collection = await getGeoCollection(catalogUrl(PLACES_ID));
    items = (collection.features ?? []).flatMap((feature, index) => {
      if (feature.geometry?.type !== "Point" || !Array.isArray(feature.geometry.coordinates)) return [];
      const coordinates = feature.geometry.coordinates as number[];
      if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return [];
      const properties = feature.properties ?? {};
      const classification = normalized(property(properties, "FEATURECLA"));
      if (request.kind === "capitals" && !classification.includes("admin 0 capital")) return [];
      const population = Number(properties.POP_MAX ?? properties.pop_max);
      if (request.kind === "cities" && (!Number.isFinite(population) || population <= (request.minimumPopulation ?? 0))) return [];
      const label = property(properties, "NAME", "NAMEASCII", "NAME_EN");
      const coordinate = { lng: coordinates[0], lat: coordinates[1] };
      const capitalMatchesCountry = request.kind === "capitals" && countryCodes.size > 0 &&
        countryCodes.has(property(properties, "ADM0_A3"));
      const accepted = capitalMatchesCountry
        ? inBounds([coordinate.lng, coordinate.lat], workspace) &&
          (!scope.european || (coordinate.lng <= 60 && coordinate.lat >= 34))
        : request.kind === "capitals" && countryCodes.size > 0 ? false : inside(coordinate);
      return label && accepted ? [{
        id: `natural-earth-place-${index}`,
        label,
        coordinate,
        population: Number.isFinite(population) && population > 0 ? population : null,
        sourceUrl: SOURCE_URL,
      }] : [];
    });
    sourceTitle = "Natural Earth — villes et capitales";
    sourceUrl = SOURCE_URL;
    if (request.kind === "cities") warnings.push("Natural Earth est une sélection de localités, pas un recensement exhaustif. Le seuil utilise POP_MAX (estimation de l'agglomération), pas la population municipale ; les villes absentes ou sans estimation ne sont pas inventées.");
  }
  if (items.length > MAX_RESULTS) throw new Error(`La source contient plus de ${MAX_RESULTS} lieux dans ce secteur. Réduis la zone pour obtenir un résultat complet et éditable.`);
  return { kind: request.kind, items, scopeLabel: scope.label, sourceTitle, sourceUrl, warnings };
}
