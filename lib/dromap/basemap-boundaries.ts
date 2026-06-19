import type { DromapBasemapBoundaryLayer } from "./basemap";

export type DromapBoundaryPosition = [number, number];

export type DromapBoundaryLineString = DromapBoundaryPosition[];
export type DromapBoundaryMultiLineString = DromapBoundaryPosition[][];
export type DromapBoundaryPolygon = DromapBoundaryPosition[][];
export type DromapBoundaryMultiPolygon = DromapBoundaryPosition[][][];

export type DromapBoundaryGeometry =
  | {
      type: "LineString";
      coordinates: DromapBoundaryLineString;
    }
  | {
      type: "MultiLineString";
      coordinates: DromapBoundaryMultiLineString;
    }
  | {
      type: "Polygon";
      coordinates: DromapBoundaryPolygon;
    }
  | {
      type: "MultiPolygon";
      coordinates: DromapBoundaryMultiPolygon;
    };

export type DromapBoundaryFeature = {
  type: "Feature";
  properties?: Record<string, unknown> | null;
  geometry: DromapBoundaryGeometry | null;
};

export type DromapBoundaryFeatureCollection = {
  type: "FeatureCollection";
  features: DromapBoundaryFeature[];
};

const boundaryCache = new Map<
  string,
  Promise<DromapBoundaryFeatureCollection>
>();

/**
 * Le fond "Blanc pédagogique" ne doit pas afficher le Sahara occidental comme
 * entité séparée par défaut : ce cas doit devenir un calque optionnel plus tard.
 *
 * Important : on ne filtre volontairement PAS tous les libellés "indefinite" ou
 * "disputed". Dans Natural Earth, certaines frontières internationales réelles
 * peuvent porter une classe ambiguë selon le segment ou le point de vue. Un
 * filtre trop large faisait disparaître, par exemple, la frontière Maroc/Algérie.
 */
const PEDAGOGICAL_HIDDEN_BOUNDARY_PATTERN =
  /\b(western sahara|sahara occidental|sahrawi|sahraoui|sahrawi arab democratic republic|sadr|esh|sah)\b/i;

const FRANCE_OUTLINE_FROM_REGIONS_URL = "dromap://france/outline-from-regions";

const FRANCE_REGIONS_SIMPLIFIED_URL =
  "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson";

type BoundarySegment = {
  start: DromapBoundaryPosition;
  end: DromapBoundaryPosition;
};

function getCoordinateKey(position: DromapBoundaryPosition) {
  return `${position[0].toFixed(6)},${position[1].toFixed(6)}`;
}

function getUndirectedSegmentKey(
  start: DromapBoundaryPosition,
  end: DromapBoundaryPosition,
) {
  const startKey = getCoordinateKey(start);
  const endKey = getCoordinateKey(end);

  return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
}

function areSameBoundaryPosition(
  first: DromapBoundaryPosition,
  second: DromapBoundaryPosition,
) {
  return getCoordinateKey(first) === getCoordinateKey(second);
}

function positionIsInsideBounds(
  position: DromapBoundaryPosition,
  bounds: NonNullable<DromapBasemapBoundaryLayer["metropolitanBounds"]>,
) {
  const [longitude, latitude] = position;
  const longitudeIsInside =
    bounds.west <= bounds.east
      ? longitude >= bounds.west && longitude <= bounds.east
      : longitude >= bounds.west || longitude <= bounds.east;

  return (
    longitudeIsInside && latitude >= bounds.south && latitude <= bounds.north
  );
}

function getLineStringCenter(
  lineString: DromapBoundaryLineString,
): DromapBoundaryPosition | null {
  if (lineString.length === 0) {
    return null;
  }

  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const [longitude, latitude] of lineString) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }

  return [(west + east) / 2, (south + north) / 2];
}

function lineStringMatchesMetropolitanBounds(
  lineString: DromapBoundaryLineString,
  bounds: NonNullable<DromapBasemapBoundaryLayer["metropolitanBounds"]>,
) {
  const center = getLineStringCenter(lineString);

  if (!center) {
    return false;
  }

  return positionIsInsideBounds(center, bounds);
}

function getLineStringSpan(lineString: DromapBoundaryLineString) {
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const [longitude, latitude] of lineString) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      continue;
    }

    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }

  if (
    west === Number.POSITIVE_INFINITY ||
    east === Number.NEGATIVE_INFINITY ||
    south === Number.POSITIVE_INFINITY ||
    north === Number.NEGATIVE_INFINITY
  ) {
    return null;
  }

  return {
    longitudeSpan: Math.abs(east - west),
    latitudeSpan: Math.abs(north - south),
    maxSpan: Math.max(Math.abs(east - west), Math.abs(north - south)),
  };
}

function shouldKeepBoundaryLineString(
  lineString: DromapBoundaryLineString,
  layer: DromapBasemapBoundaryLayer,
) {
  if (!layer.hideMicroBoundaryLines) {
    return true;
  }

  if (lineString.length < 2) {
    return false;
  }

  const span = getLineStringSpan(lineString);

  if (!span) {
    return false;
  }

  const maxAllowedSpan = layer.microBoundaryMaxSpan ?? 0.35;

  /**
   * Les datasets Natural Earth précis contiennent des micro-enclaves et petits
   * segments administratifs qui apparaissent comme des traits parasites sur un
   * fond pédagogique mondial. On ne filtre que les lignes dont l'emprise totale
   * est minuscule ; les frontières nationales lisibles restent conservées.
   */
  return span.maxSpan >= maxAllowedSpan;
}

function boundaryPositionIsOnForcedAntimeridianSeam(
  position: DromapBoundaryPosition,
) {
  const [longitude] = position;

  if (!Number.isFinite(longitude)) {
    return false;
  }

  // Ne pas utiliser une marge large ici : des vraies frontières et côtes de
  // l'extrême-est russe passent très près de 180°. On ne masque que la couture
  // technique exactement posée sur l'antiméridien par le GeoJSON.
  return Math.abs(longitude - 180) <= 0.02;
}

function boundarySegmentLooksLikeAntimeridianSeam(
  start: DromapBoundaryPosition,
  end: DromapBoundaryPosition,
  layer: DromapBasemapBoundaryLayer,
) {
  if (!layer.hideAntimeridianSeam) {
    return false;
  }

  const [startLongitude, startLatitude] = start;
  const [endLongitude, endLatitude] = end;

  if (
    !Number.isFinite(startLongitude) ||
    !Number.isFinite(startLatitude) ||
    !Number.isFinite(endLongitude) ||
    !Number.isFinite(endLatitude)
  ) {
    return false;
  }

  const longitudeSpan = Math.abs(endLongitude - startLongitude);
  const latitudeSpan = Math.abs(endLatitude - startLatitude);

  // Cas principal : la couture est une suite de petits segments quasi
  // verticaux exactement posés sur 180°. On garde volontairement un seuil très
  // serré pour ne pas supprimer les vraies frontières proches de la couture.
  if (
    boundaryPositionIsOnForcedAntimeridianSeam(start) &&
    boundaryPositionIsOnForcedAntimeridianSeam(end) &&
    longitudeSpan <= 0.04 &&
    latitudeSpan > 0.000001
  ) {
    return true;
  }

  // Sécurité : si une ligne traverse encore directement la coupure -180/180,
  // elle est aussi artificielle sur les fonds dépliés.
  return longitudeSpan >= 300;
}

function lineStringLooksLikeAntimeridianSeam(
  lineString: DromapBoundaryLineString,
  layer: DromapBasemapBoundaryLayer,
) {
  if (!layer.hideAntimeridianSeam || lineString.length < 2) {
    return false;
  }

  return lineString
    .slice(1)
    .every((position, index) =>
      boundarySegmentLooksLikeAntimeridianSeam(
        lineString[index],
        position,
        layer,
      ),
    );
}

function splitLineStringWithoutAntimeridianSeam(
  lineString: DromapBoundaryLineString,
  layer: DromapBasemapBoundaryLayer,
): DromapBoundaryLineString[] {
  if (!layer.hideAntimeridianSeam || lineString.length < 2) {
    return [lineString];
  }

  if (lineStringLooksLikeAntimeridianSeam(lineString, layer)) {
    return [];
  }

  const cleanedLineStrings: DromapBoundaryLineString[] = [];
  let currentLineString: DromapBoundaryLineString = [lineString[0]];

  for (let index = 1; index < lineString.length; index += 1) {
    const previousPosition = lineString[index - 1];
    const position = lineString[index];

    if (
      boundarySegmentLooksLikeAntimeridianSeam(
        previousPosition,
        position,
        layer,
      )
    ) {
      if (currentLineString.length >= 2) {
        cleanedLineStrings.push(currentLineString);
      }

      currentLineString = [position];
      continue;
    }

    currentLineString.push(position);
  }

  if (currentLineString.length >= 2) {
    cleanedLineStrings.push(currentLineString);
  }

  return cleanedLineStrings;
}

function filterBoundaryLineStringsForLayer(
  lineStrings: DromapBoundaryLineString[],
  layer: DromapBasemapBoundaryLayer,
) {
  return lineStrings
    .flatMap((lineString) =>
      splitLineStringWithoutAntimeridianSeam(lineString, layer),
    )
    .filter((lineString) => shouldKeepBoundaryLineString(lineString, layer));
}

function getBoundaryGeometryPositions(
  geometry: DromapBoundaryGeometry,
): DromapBoundaryPosition[] {
  if (geometry.type === "LineString") {
    return geometry.coordinates;
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.flat();
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat();
  }

  return geometry.coordinates.flat(2);
}

function geometryHasAntimeridianSpan(
  geometry: DromapBoundaryGeometry,
  layer: DromapBasemapBoundaryLayer,
) {
  const positions = getBoundaryGeometryPositions(geometry);

  if (positions.length === 0) {
    return false;
  }

  const westThreshold = layer.antimeridianWestThreshold ?? 0;
  let hasFarWest = false;
  let hasFarEast = false;

  for (const [longitude] of positions) {
    if (!Number.isFinite(longitude)) {
      continue;
    }

    if (longitude < westThreshold) {
      hasFarWest = true;
    }

    if (longitude > 120) {
      hasFarEast = true;
    }
  }

  if (layer.countryIsoA3 === "RUS") {
    return hasFarWest;
  }

  if (hasFarWest && hasFarEast) {
    return true;
  }

  for (const lineString of getDromapBoundaryLineStrings(geometry)) {
    for (let index = 1; index < lineString.length; index += 1) {
      const previousLongitude = lineString[index - 1][0];
      const longitude = lineString[index][0];

      if (
        Number.isFinite(previousLongitude) &&
        Number.isFinite(longitude) &&
        Math.abs(longitude - previousLongitude) > 180
      ) {
        return true;
      }
    }
  }

  return false;
}

function unwrapBoundaryPositionEast(
  position: DromapBoundaryPosition,
  layer: DromapBasemapBoundaryLayer,
): DromapBoundaryPosition {
  const westThreshold = layer.antimeridianWestThreshold ?? 0;
  const [longitude, latitude] = position;

  return longitude < westThreshold ? [longitude + 360, latitude] : position;
}

function unwrapBoundaryLineStringEast(
  lineString: DromapBoundaryLineString,
  layer: DromapBasemapBoundaryLayer,
): DromapBoundaryLineString {
  return lineString.map((position) =>
    unwrapBoundaryPositionEast(position, layer),
  );
}

function unwrapGeometryAcrossAntimeridianEast(
  geometry: DromapBoundaryGeometry,
  layer: DromapBasemapBoundaryLayer,
): DromapBoundaryGeometry {
  if (layer.antimeridianMode !== "unwrap-east") {
    return geometry;
  }

  if (!geometryHasAntimeridianSpan(geometry, layer)) {
    return geometry;
  }

  if (geometry.type === "LineString") {
    return {
      ...geometry,
      coordinates: unwrapBoundaryLineStringEast(geometry.coordinates, layer),
    };
  }

  if (geometry.type === "MultiLineString") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((lineString) =>
        unwrapBoundaryLineStringEast(lineString, layer),
      ),
    };
  }

  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring) =>
        unwrapBoundaryLineStringEast(ring, layer),
      ),
    };
  }

  return {
    ...geometry,
    coordinates: geometry.coordinates.map((polygon) =>
      polygon.map((ring) => unwrapBoundaryLineStringEast(ring, layer)),
    ),
  };
}

function filterGeometryToMetropolitanBounds(
  geometry: DromapBoundaryGeometry,
  bounds: NonNullable<DromapBasemapBoundaryLayer["metropolitanBounds"]>,
): DromapBoundaryGeometry | null {
  if (geometry.type === "LineString") {
    return lineStringMatchesMetropolitanBounds(geometry.coordinates, bounds)
      ? geometry
      : null;
  }

  if (geometry.type === "MultiLineString") {
    const coordinates = geometry.coordinates.filter((lineString) =>
      lineStringMatchesMetropolitanBounds(lineString, bounds),
    );

    if (coordinates.length === 0) {
      return null;
    }

    return { type: "MultiLineString", coordinates };
  }

  if (geometry.type === "Polygon") {
    const exteriorRing = geometry.coordinates[0];

    if (
      !exteriorRing ||
      !lineStringMatchesMetropolitanBounds(exteriorRing, bounds)
    ) {
      return null;
    }

    return geometry;
  }

  const polygons = geometry.coordinates.filter((polygon) => {
    const exteriorRing = polygon[0];

    return exteriorRing
      ? lineStringMatchesMetropolitanBounds(exteriorRing, bounds)
      : false;
  });

  if (polygons.length === 0) {
    return null;
  }

  if (polygons.length === 1) {
    return { type: "Polygon", coordinates: polygons[0] };
  }

  return { type: "MultiPolygon", coordinates: polygons };
}

function getBoundaryPolygonRings(
  geometry: DromapBoundaryGeometry,
): DromapBoundaryLineString[] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates;
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => polygon);
  }

  return [];
}

function getBoundaryPolygonExteriorRings(
  geometry: DromapBoundaryGeometry,
): DromapBoundaryLineString[] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates[0] ? [geometry.coordinates[0]] : [];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) =>
      polygon[0] ? [polygon[0]] : [],
    );
  }

  return [];
}

function boundaryRingMatchesLayerDetail(
  ring: DromapBoundaryLineString,
  layer: DromapBasemapBoundaryLayer,
) {
  const minimumPolygonPartSpan = layer.minimumPolygonPartSpan;

  if (
    typeof minimumPolygonPartSpan !== "number" ||
    !Number.isFinite(minimumPolygonPartSpan) ||
    minimumPolygonPartSpan <= 0
  ) {
    return true;
  }

  const span = getLineStringSpan(ring);

  if (!span) {
    return false;
  }

  return span.maxSpan >= minimumPolygonPartSpan;
}

function getBoundaryPolygonRenderableRings(
  geometry: DromapBoundaryGeometry,
  layer: DromapBasemapBoundaryLayer,
): DromapBoundaryLineString[] {
  const rings = layer.suppressInteriorRings
    ? getBoundaryPolygonExteriorRings(geometry)
    : getBoundaryPolygonRings(geometry);

  return rings.filter((ring) => boundaryRingMatchesLayerDetail(ring, layer));
}

function getBoundarySegmentsFromRing(
  ring: DromapBoundaryLineString,
): BoundarySegment[] {
  if (ring.length < 2) {
    return [];
  }

  const closedRing = areSameBoundaryPosition(ring[0], ring[ring.length - 1])
    ? ring
    : [...ring, ring[0]];
  const segments: BoundarySegment[] = [];

  for (let index = 0; index < closedRing.length - 1; index += 1) {
    const start = closedRing[index];
    const end = closedRing[index + 1];

    if (areSameBoundaryPosition(start, end)) {
      continue;
    }

    segments.push({ start, end });
  }

  return segments;
}

function findNextSegmentIndex(
  segments: BoundarySegment[],
  usedSegmentIndexes: Set<number>,
  point: DromapBoundaryPosition,
) {
  const pointKey = getCoordinateKey(point);

  return segments.findIndex((segment, index) => {
    if (usedSegmentIndexes.has(index)) {
      return false;
    }

    return (
      getCoordinateKey(segment.start) === pointKey ||
      getCoordinateKey(segment.end) === pointKey
    );
  });
}

function connectBoundarySegments(
  segments: BoundarySegment[],
): DromapBoundaryLineString[] {
  const lineStrings: DromapBoundaryLineString[] = [];
  const usedSegmentIndexes = new Set<number>();

  for (let index = 0; index < segments.length; index += 1) {
    if (usedSegmentIndexes.has(index)) {
      continue;
    }

    const segment = segments[index];
    const lineString: DromapBoundaryLineString = [segment.start, segment.end];
    usedSegmentIndexes.add(index);

    while (true) {
      const nextIndex = findNextSegmentIndex(
        segments,
        usedSegmentIndexes,
        lineString[lineString.length - 1],
      );

      if (nextIndex === -1) {
        break;
      }

      const nextSegment = segments[nextIndex];
      const currentEnd = lineString[lineString.length - 1];
      const nextPoint =
        getCoordinateKey(nextSegment.start) === getCoordinateKey(currentEnd)
          ? nextSegment.end
          : nextSegment.start;

      lineString.push(nextPoint);
      usedSegmentIndexes.add(nextIndex);

      if (areSameBoundaryPosition(lineString[0], nextPoint)) {
        break;
      }
    }

    while (true) {
      const previousIndex = findNextSegmentIndex(
        segments,
        usedSegmentIndexes,
        lineString[0],
      );

      if (previousIndex === -1) {
        break;
      }

      const previousSegment = segments[previousIndex];
      const currentStart = lineString[0];
      const previousPoint =
        getCoordinateKey(previousSegment.end) === getCoordinateKey(currentStart)
          ? previousSegment.start
          : previousSegment.end;

      lineString.unshift(previousPoint);
      usedSegmentIndexes.add(previousIndex);
    }

    if (lineString.length >= 2) {
      lineStrings.push(lineString);
    }
  }

  return lineStrings;
}

function createOutlineFromPolygonFeatureCollection(
  featureCollection: DromapBoundaryFeatureCollection,
): DromapBoundaryFeatureCollection {
  const segmentMap = new Map<
    string,
    { count: number; segment: BoundarySegment }
  >();

  for (const feature of featureCollection.features) {
    if (!feature.geometry) {
      continue;
    }

    const rings = getBoundaryPolygonRings(feature.geometry);

    for (const ring of rings) {
      for (const segment of getBoundarySegmentsFromRing(ring)) {
        const key = getUndirectedSegmentKey(segment.start, segment.end);
        const currentValue = segmentMap.get(key);

        if (currentValue) {
          currentValue.count += 1;
          continue;
        }

        segmentMap.set(key, { count: 1, segment });
      }
    }
  }

  const exteriorSegments = [...segmentMap.values()]
    .filter((value) => value.count === 1)
    .map((value) => value.segment);
  const exteriorLineStrings = connectBoundarySegments(exteriorSegments);

  return {
    type: "FeatureCollection",
    features: exteriorLineStrings.map((lineString) => ({
      type: "Feature",
      properties: {
        name: "Contour de la France depuis les régions",
        source: "france-geojson-regions-outline",
      },
      geometry: {
        type: "LineString",
        coordinates: lineString,
      },
    })),
  };
}

async function loadFranceOutlineFromRegionsFeatureCollection() {
  const response = await fetch(FRANCE_REGIONS_SIMPLIFIED_URL, {
    mode: "cors",
    credentials: "omit",
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(`Contour France non récupérable : ${response.status}`);
  }

  const regionsFeatureCollection = normalizeBoundaryFeatureCollection(
    await response.json(),
  );

  return createOutlineFromPolygonFeatureCollection(regionsFeatureCollection);
}

function isBoundaryPosition(value: unknown): value is DromapBoundaryPosition {
  if (!Array.isArray(value) || value.length < 2) {
    return false;
  }

  return typeof value[0] === "number" && typeof value[1] === "number";
}

function isBoundaryLineString(
  value: unknown,
): value is DromapBoundaryLineString {
  return Array.isArray(value) && value.every(isBoundaryPosition);
}

function isBoundaryMultiLineString(
  value: unknown,
): value is DromapBoundaryMultiLineString {
  return Array.isArray(value) && value.every(isBoundaryLineString);
}

function isBoundaryPolygon(value: unknown): value is DromapBoundaryPolygon {
  return (
    Array.isArray(value) &&
    value.every((ring) => Array.isArray(ring) && ring.every(isBoundaryPosition))
  );
}

function isBoundaryMultiPolygon(
  value: unknown,
): value is DromapBoundaryMultiPolygon {
  return Array.isArray(value) && value.every(isBoundaryPolygon);
}

function normalizeBoundaryFeatureCollection(
  value: unknown,
): DromapBoundaryFeatureCollection {
  if (typeof value !== "object" || value === null) {
    throw new Error("Données de frontières invalides.");
  }

  const candidate = value as Partial<DromapBoundaryFeatureCollection>;

  if (
    candidate.type !== "FeatureCollection" ||
    !Array.isArray(candidate.features)
  ) {
    throw new Error("Collection de frontières invalide.");
  }

  const features: DromapBoundaryFeature[] = [];

  for (const rawFeature of candidate.features) {
    if (typeof rawFeature !== "object" || rawFeature === null) {
      continue;
    }

    const feature = rawFeature as Partial<DromapBoundaryFeature>;
    const geometry = feature.geometry;

    if (!geometry) {
      continue;
    }

    if (
      geometry.type === "LineString" &&
      isBoundaryLineString(geometry.coordinates)
    ) {
      features.push({
        type: "Feature",
        properties:
          typeof feature.properties === "object" ? feature.properties : null,
        geometry,
      });
      continue;
    }

    if (
      geometry.type === "MultiLineString" &&
      isBoundaryMultiLineString(geometry.coordinates)
    ) {
      features.push({
        type: "Feature",
        properties:
          typeof feature.properties === "object" ? feature.properties : null,
        geometry,
      });
      continue;
    }

    if (
      geometry.type === "Polygon" &&
      isBoundaryPolygon(geometry.coordinates)
    ) {
      features.push({
        type: "Feature",
        properties:
          typeof feature.properties === "object" ? feature.properties : null,
        geometry,
      });
      continue;
    }

    if (
      geometry.type === "MultiPolygon" &&
      isBoundaryMultiPolygon(geometry.coordinates)
    ) {
      features.push({
        type: "Feature",
        properties:
          typeof feature.properties === "object" ? feature.properties : null,
        geometry,
      });
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function getFeatureStringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap(getFeatureStringValues);
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(getFeatureStringValues);
  }

  return [];
}

function normalizeBoundaryFilterValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getFeaturePropertyValuesByKey(
  feature: DromapBoundaryFeature,
  keys: string[],
) {
  const properties = feature.properties;

  if (!properties) {
    return [];
  }

  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));
  const values: string[] = [];

  for (const [key, value] of Object.entries(properties)) {
    if (!normalizedKeys.has(key.toLowerCase())) {
      continue;
    }

    values.push(...getFeatureStringValues(value));
  }

  return values;
}

function featureHasNormalizedValue(
  feature: DromapBoundaryFeature,
  keys: string[],
  expectedValue: string,
) {
  const normalizedExpectedValue = normalizeBoundaryFilterValue(expectedValue);

  return getFeaturePropertyValuesByKey(feature, keys).some(
    (value) => normalizeBoundaryFilterValue(value) === normalizedExpectedValue,
  );
}

function featureHasIso3166SubdivisionPrefix(
  feature: DromapBoundaryFeature,
  countryIsoA2: string,
) {
  const normalizedCountryIsoA2 = countryIsoA2.toUpperCase();
  const values = getFeaturePropertyValuesByKey(feature, [
    "iso_3166_2",
    "ISO_3166_2",
    "code_hasc",
    "CODE_HASC",
    "adm1_code",
    "ADM1_CODE",
  ]);

  return values.some((value) => {
    const normalizedValue = value.trim().toUpperCase();

    return (
      normalizedValue.startsWith(`${normalizedCountryIsoA2}-`) ||
      normalizedValue.startsWith(`${normalizedCountryIsoA2}.`)
    );
  });
}

function featureMatchesAdmin1ParentCountry(
  feature: DromapBoundaryFeature,
  layer: DromapBasemapBoundaryLayer,
) {
  const { countryIsoA2, countryIsoA3 } = layer;

  if (!countryIsoA2 && !countryIsoA3) {
    return true;
  }

  // Pour les subdivisions, on ne doit JAMAIS utiliser des champs ambigus comme
  // postal, region, name ou une recherche globale dans toutes les propriétés :
  // des régions appelées Delta, Denguélé, Destrnik, etc. peuvent alors matcher
  // un pays qui n'a rien à voir. On garde uniquement le pays parent explicite
  // fourni par Natural Earth, puis un repli ISO_3166-2 strict du type "DE-BW".
  if (
    countryIsoA3 &&
    featureHasNormalizedValue(
      feature,
      [
        "adm0_a3",
        "ADM0_A3",
        "adm0_a3_us",
        "ADM0_A3_US",
        "geonunit_a3",
        "GEOUNIT_A3",
        "gu_a3",
        "GU_A3",
      ],
      countryIsoA3,
    )
  ) {
    return true;
  }

  if (
    countryIsoA2 &&
    featureHasIso3166SubdivisionPrefix(feature, countryIsoA2)
  ) {
    return true;
  }

  return false;
}

function featureMatchesAdmin0Country(
  feature: DromapBoundaryFeature,
  layer: DromapBasemapBoundaryLayer,
) {
  const { countryIsoA2, countryIsoA3, countryName } = layer;

  if (!countryIsoA2 && !countryIsoA3 && !countryName) {
    return true;
  }

  // Pour un fond "pays seul", on ne matche que l'entité cartographique du pays
  // lui-même. On exclut volontairement SOV_A3, BRK_A3, GU_A3 et toute recherche
  // large, car ces champs rattachent souvent des territoires ultramarins ou des
  // dépendances au souverain au lieu de la métropole attendue par DroMap.
  if (
    countryIsoA3 &&
    featureHasNormalizedValue(
      feature,
      ["adm0_a3", "ADM0_A3", "iso_a3", "ISO_A3", "iso_a3_eh", "ISO_A3_EH"],
      countryIsoA3,
    )
  ) {
    return true;
  }

  if (
    countryIsoA2 &&
    featureHasNormalizedValue(
      feature,
      ["iso_a2", "ISO_A2", "iso_a2_eh", "ISO_A2_EH"],
      countryIsoA2,
    )
  ) {
    return true;
  }

  if (
    !countryIsoA2 &&
    !countryIsoA3 &&
    countryName &&
    featureHasNormalizedValue(
      feature,
      ["name", "NAME", "name_en", "NAME_EN", "name_fr", "NAME_FR"],
      countryName,
    )
  ) {
    return true;
  }

  return false;
}

function featureMatchesContinentFilter(
  feature: DromapBoundaryFeature,
  continent: string,
) {
  return featureHasNormalizedValue(
    feature,
    ["continent", "CONTINENT", "region_un", "REGION_UN"],
    continent,
  );
}

function featureMatchesCountryFilter(
  feature: DromapBoundaryFeature,
  layer: DromapBasemapBoundaryLayer,
) {
  if (layer.kind === "admin1-regions") {
    return featureMatchesAdmin1ParentCountry(feature, layer);
  }

  if (layer.kind === "admin0-countries") {
    return featureMatchesAdmin0Country(feature, layer);
  }

  const { countryIsoA2, countryIsoA3, countryName } = layer;

  if (!countryIsoA2 && !countryIsoA3 && !countryName) {
    return true;
  }

  if (countryIsoA3) {
    return featureHasNormalizedValue(
      feature,
      ["adm0_a3", "ADM0_A3", "iso_a3", "ISO_A3"],
      countryIsoA3,
    );
  }

  if (countryIsoA2) {
    return featureHasNormalizedValue(
      feature,
      ["iso_a2", "ISO_A2"],
      countryIsoA2,
    );
  }

  if (countryName) {
    return featureHasNormalizedValue(
      feature,
      ["name", "NAME", "name_en", "NAME_EN", "name_fr", "NAME_FR"],
      countryName,
    );
  }

  return false;
}

export async function loadDromapBoundaryFeatureCollection(url: string) {
  const cached = boundaryCache.get(url);

  if (cached) {
    return cached;
  }

  const request =
    url === FRANCE_OUTLINE_FROM_REGIONS_URL
      ? loadFranceOutlineFromRegionsFeatureCollection()
      : fetch(url, {
          mode: "cors",
          credentials: "omit",
          cache: "force-cache",
        })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(
                `Frontières non récupérables : ${response.status}`,
              );
            }

            return response.json();
          })
          .then(normalizeBoundaryFeatureCollection);

  boundaryCache.set(url, request);

  return request;
}

export function shouldRenderDromapBoundaryFeature(
  feature: DromapBoundaryFeature,
  layer: DromapBasemapBoundaryLayer,
) {
  if (layer.hideDisputed) {
    const values = getFeatureStringValues(feature.properties);

    if (
      values.some((value) => PEDAGOGICAL_HIDDEN_BOUNDARY_PATTERN.test(value))
    ) {
      return false;
    }
  }

  if (
    layer.continent &&
    !featureMatchesContinentFilter(feature, layer.continent)
  ) {
    return false;
  }

  return featureMatchesCountryFilter(feature, layer);
}

export function getDromapBoundaryFeatureForLayer(
  feature: DromapBoundaryFeature,
  layer: DromapBasemapBoundaryLayer,
): DromapBoundaryFeature | null {
  if (!shouldRenderDromapBoundaryFeature(feature, layer) || !feature.geometry) {
    return null;
  }

  const filteredGeometry = layer.metropolitanBounds
    ? filterGeometryToMetropolitanBounds(
        feature.geometry,
        layer.metropolitanBounds,
      )
    : feature.geometry;

  if (!filteredGeometry) {
    return null;
  }

  const geometry = unwrapGeometryAcrossAntimeridianEast(
    filteredGeometry,
    layer,
  );

  return {
    ...feature,
    geometry,
  };
}

function getBoundarySegmentsFromGeometry(
  geometry: DromapBoundaryGeometry,
  layer: DromapBasemapBoundaryLayer,
): BoundarySegment[] {
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return getBoundaryPolygonRenderableRings(geometry, layer).flatMap(
      getBoundarySegmentsFromRing,
    );
  }

  return [];
}

function getBoundaryLineStringsFromFeatures(
  features: DromapBoundaryFeature[],
  layer: DromapBasemapBoundaryLayer,
): DromapBoundaryLineString[] {
  return features.flatMap((feature) => {
    if (!feature.geometry) {
      return [];
    }

    if (
      feature.geometry.type === "Polygon" ||
      feature.geometry.type === "MultiPolygon"
    ) {
      return getBoundaryPolygonRenderableRings(feature.geometry, layer);
    }

    return getDromapBoundaryLineStrings(feature.geometry);
  });
}

function getCountedBoundaryLineStringsFromFeatures(
  features: DromapBoundaryFeature[],
  layer: DromapBasemapBoundaryLayer,
  mode: "unique" | "interior" | "exterior",
): DromapBoundaryLineString[] {
  const segmentMap = new Map<
    string,
    { count: number; segment: BoundarySegment }
  >();

  for (const feature of features) {
    if (!feature.geometry) {
      continue;
    }

    for (const segment of getBoundarySegmentsFromGeometry(
      feature.geometry,
      layer,
    )) {
      const key = getUndirectedSegmentKey(segment.start, segment.end);
      const currentValue = segmentMap.get(key);

      if (currentValue) {
        currentValue.count += 1;
        continue;
      }

      segmentMap.set(key, { count: 1, segment });
    }
  }

  const selectedSegments = [...segmentMap.values()]
    .filter((value) => {
      if (mode === "unique") {
        return value.count >= 1;
      }

      if (mode === "exterior") {
        return value.count === 1;
      }

      return value.count > 1;
    })
    .map((value) => value.segment);

  // Ne pas reconnecter automatiquement ces segments : les réseaux de limites
  // administratives ont souvent des jonctions en T ou des micro-décalages. Les
  // reconnecter au hasard peut créer des traits parasites, notamment sur des
  // fonds pays + régions. Chaque segment est donc rendu à sa vraie position.
  return selectedSegments.map((segment) => [segment.start, segment.end]);
}

export function getDromapBoundaryRenderableLineStrings(
  featureCollection: DromapBoundaryFeatureCollection,
  layer: DromapBasemapBoundaryLayer,
): DromapBoundaryLineString[] {
  const visibleFeatures = featureCollection.features.flatMap((feature) => {
    const visibleFeature = getDromapBoundaryFeatureForLayer(feature, layer);

    return visibleFeature ? [visibleFeature] : [];
  });
  const renderMode = layer.boundaryRenderMode ?? "all";

  if (
    renderMode === "unique" ||
    renderMode === "interior" ||
    renderMode === "exterior"
  ) {
    return filterBoundaryLineStringsForLayer(
      getCountedBoundaryLineStringsFromFeatures(
        visibleFeatures,
        layer,
        renderMode,
      ),
      layer,
    );
  }

  return filterBoundaryLineStringsForLayer(
    getBoundaryLineStringsFromFeatures(visibleFeatures, layer),
    layer,
  );
}

export function getDromapBoundaryLineStrings(
  geometry: DromapBoundaryGeometry,
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

  return geometry.coordinates.flatMap((polygon) => polygon);
}
