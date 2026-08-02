export type DromapOverpassCoordinate = {
  lat: number;
  lon: number;
};

export type DromapOverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: DromapOverpassCoordinate;
  geometry?: DromapOverpassCoordinate[];
  members?: Array<{
    type?: string;
    ref?: number;
    role?: string;
    geometry?: DromapOverpassCoordinate[];
  }>;
  tags?: Record<string, string>;
};

export type DromapOverpassResponse = {
  version?: number;
  generator?: string;
  osm3s?: Record<string, unknown>;
  remark?: string;
  elements?: DromapOverpassElement[];
};

type Position = [number, number];

type GeoJsonGeometry =
  | { type: "Point"; coordinates: Position }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "MultiLineString"; coordinates: Position[][] }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

type GeoJsonFeature = {
  type: "Feature";
  id: string;
  geometry: GeoJsonGeometry;
  properties: Record<string, unknown>;
};

function isFiniteCoordinate(value: DromapOverpassCoordinate | undefined) {
  return Boolean(
    value &&
      Number.isFinite(value.lat) &&
      Number.isFinite(value.lon) &&
      value.lat >= -90 &&
      value.lat <= 90 &&
      value.lon >= -180 &&
      value.lon <= 180,
  );
}

function toPosition(value: DromapOverpassCoordinate): Position {
  return [value.lon, value.lat];
}

function normalizeGeometry(
  geometry: DromapOverpassCoordinate[] | undefined,
): Position[] {
  if (!Array.isArray(geometry)) {
    return [];
  }

  const positions: Position[] = [];

  for (const coordinate of geometry) {
    if (!isFiniteCoordinate(coordinate)) {
      continue;
    }

    const position = toPosition(coordinate);
    const previous = positions[positions.length - 1];

    if (!previous || previous[0] !== position[0] || previous[1] !== position[1]) {
      positions.push(position);
    }
  }

  return positions;
}

function samePosition(a: Position, b: Position, epsilon = 1e-7) {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function closeRing(coordinates: Position[]) {
  if (coordinates.length < 3) {
    return [];
  }

  const ring = coordinates.map((position) => [position[0], position[1]] as Position);

  if (!samePosition(ring[0], ring[ring.length - 1])) {
    ring.push([ring[0][0], ring[0][1]]);
  }

  return ring.length >= 4 ? ring : [];
}

function isClosed(coordinates: Position[]) {
  return coordinates.length >= 4 && samePosition(coordinates[0], coordinates[coordinates.length - 1]);
}

function wayShouldBePolygon(tags: Record<string, string>, coordinates: Position[]) {
  if (!isClosed(coordinates)) {
    return false;
  }

  if (tags.area === "no") {
    return false;
  }

  if (tags.area === "yes") {
    return true;
  }

  if (tags.natural === "coastline" || tags.waterway === "river") {
    return false;
  }

  return Boolean(
    tags.building ||
      tags.landuse ||
      tags.leisure ||
      tags.amenity ||
      tags.shop ||
      tags.tourism ||
      tags.historic ||
      tags.aeroway === "aerodrome" ||
      tags.aeroway === "apron" ||
      tags.natural === "water" ||
      tags.natural === "wood" ||
      tags.water ||
      tags.waterway === "riverbank" ||
      tags.waterway === "dock" ||
      tags.boundary === "protected_area" ||
      tags.power === "plant" ||
      tags.power === "substation",
  );
}

function createProperties(element: DromapOverpassElement) {
  return {
    ...(element.tags ?? {}),
    osm_type: element.type,
    osm_id: element.id,
    osm_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
  };
}

function stitchSegments(rawSegments: Position[][]) {
  const segments = rawSegments
    .map((segment) => segment.map((position) => [position[0], position[1]] as Position))
    .filter((segment) => segment.length >= 2);
  const rings: Position[][] = [];

  while (segments.length > 0) {
    const current = segments.shift() ?? [];

    if (current.length < 2) {
      continue;
    }

    let changed = true;

    while (!isClosed(current) && changed && segments.length > 0) {
      changed = false;
      const first = current[0];
      const last = current[current.length - 1];

      for (let index = 0; index < segments.length; index += 1) {
        const candidate = segments[index];
        const candidateFirst = candidate[0];
        const candidateLast = candidate[candidate.length - 1];

        if (samePosition(last, candidateFirst)) {
          current.push(...candidate.slice(1));
        } else if (samePosition(last, candidateLast)) {
          current.push(...candidate.slice(0, -1).reverse());
        } else if (samePosition(first, candidateLast)) {
          current.unshift(...candidate.slice(0, -1));
        } else if (samePosition(first, candidateFirst)) {
          current.unshift(...candidate.slice(1).reverse());
        } else {
          continue;
        }

        segments.splice(index, 1);
        changed = true;
        break;
      }
    }

    const ring = closeRing(current);
    if (ring.length >= 4) {
      rings.push(ring);
    }
  }

  return rings;
}

function ringSignedArea(ring: Position[]) {
  let area = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }

  return area / 2;
}

function ringCentroid(ring: Position[]): Position {
  let areaFactor = 0;
  let x = 0;
  let y = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const cross = x1 * y2 - x2 * y1;
    areaFactor += cross;
    x += (x1 + x2) * cross;
    y += (y1 + y2) * cross;
  }

  if (Math.abs(areaFactor) < 1e-12) {
    return ring[0] ?? [0, 0];
  }

  return [x / (3 * areaFactor), y / (3 * areaFactor)];
}

function pointInRing(point: Position, ring: Position[]) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function createRelationGeometry(element: DromapOverpassElement): GeoJsonGeometry | null {
  const tags = element.tags ?? {};
  const relationType = tags.type ?? "";
  const members = Array.isArray(element.members) ? element.members : [];

  if (relationType === "multipolygon" || relationType === "boundary") {
    const outerSegments: Position[][] = [];
    const innerSegments: Position[][] = [];

    for (const member of members) {
      const geometry = normalizeGeometry(member.geometry);
      if (geometry.length < 2) {
        continue;
      }

      if (member.role === "inner") {
        innerSegments.push(geometry);
      } else {
        outerSegments.push(geometry);
      }
    }

    const outerRings = stitchSegments(outerSegments)
      .sort((a, b) => Math.abs(ringSignedArea(b)) - Math.abs(ringSignedArea(a)));
    const innerRings = stitchSegments(innerSegments);

    if (outerRings.length > 0) {
      const polygons = outerRings.map((outer) => [outer] as Position[][]);

      for (const inner of innerRings) {
        const centroid = ringCentroid(inner);
        let targetIndex = -1;
        let targetArea = Number.POSITIVE_INFINITY;

        outerRings.forEach((outer, index) => {
          const area = Math.abs(ringSignedArea(outer));
          if (area < targetArea && pointInRing(centroid, outer)) {
            targetIndex = index;
            targetArea = area;
          }
        });

        if (targetIndex >= 0) {
          polygons[targetIndex].push(inner);
        }
      }

      if (polygons.length === 1) {
        return { type: "Polygon", coordinates: polygons[0] };
      }

      return { type: "MultiPolygon", coordinates: polygons };
    }
  }

  const lines = members
    .map((member) => normalizeGeometry(member.geometry))
    .filter((geometry) => geometry.length >= 2);

  if (lines.length === 1) {
    return { type: "LineString", coordinates: lines[0] };
  }

  if (lines.length > 1) {
    return { type: "MultiLineString", coordinates: lines };
  }

  if (isFiniteCoordinate(element.center)) {
    return { type: "Point", coordinates: toPosition(element.center as DromapOverpassCoordinate) };
  }

  return null;
}

function elementToFeature(element: DromapOverpassElement): GeoJsonFeature | null {
  let geometry: GeoJsonGeometry | null = null;

  if (element.type === "node") {
    if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
      geometry = {
        type: "Point",
        coordinates: [element.lon as number, element.lat as number],
      };
    }
  } else if (element.type === "way") {
    const coordinates = normalizeGeometry(element.geometry);

    if (coordinates.length >= 2) {
      const tags = element.tags ?? {};
      geometry = wayShouldBePolygon(tags, coordinates)
        ? { type: "Polygon", coordinates: [closeRing(coordinates)] }
        : { type: "LineString", coordinates };
    } else if (isFiniteCoordinate(element.center)) {
      geometry = {
        type: "Point",
        coordinates: toPosition(element.center as DromapOverpassCoordinate),
      };
    }
  } else if (element.type === "relation") {
    geometry = createRelationGeometry(element);
  }

  if (!geometry) {
    return null;
  }

  return {
    type: "Feature",
    id: `osm-${element.type}-${element.id}`,
    geometry,
    properties: createProperties(element),
  };
}

export function getDromapOsmPresetLayerStyle(presetId: string) {
  if (presetId === "osm-motorways-trunks") {
    return {
      strokeColor: "#c2410c",
      strokeWeight: 1.35,
      strokeOpacity: 0.9,
      fillColor: "#c2410c",
      fillOpacity: 0,
      markerSize: 6,
      dashStyle: "solid",
    };
  }

  if (presetId === "osm-trunk-expressways") {
    return {
      strokeColor: "#d97706",
      strokeWeight: 1.15,
      strokeOpacity: 0.82,
      fillColor: "#d97706",
      fillOpacity: 0,
      markerSize: 6,
      dashStyle: "solid",
    };
  }

  if (presetId === "osm-primary-secondary-roads") {
    return {
      strokeColor: "#92400e",
      strokeWeight: 1,
      strokeOpacity: 0.72,
      fillColor: "#92400e",
      fillOpacity: 0,
      markerSize: 6,
      dashStyle: "solid",
    };
  }

  return null;
}

export function convertDromapOverpassResponseToGeoJson(
  response: DromapOverpassResponse,
  options: {
    name: string;
    presetId: string;
    extractedAt?: string;
  },
) {
  const elements = Array.isArray(response.elements) ? response.elements : [];
  const features = elements
    .map(elementToFeature)
    .filter((feature): feature is GeoJsonFeature => feature !== null);
  const layerStyle = getDromapOsmPresetLayerStyle(options.presetId);

  if (layerStyle && features.length > 0) {
    const firstFeature = features[0];
    const currentDromap = firstFeature.properties.dromap;
    const dromap =
      typeof currentDromap === "object" && currentDromap !== null && !Array.isArray(currentDromap)
        ? currentDromap as Record<string, unknown>
        : {};

    features[0] = {
      ...firstFeature,
      properties: {
        ...firstFeature.properties,
        dromap: {
          ...dromap,
          layerStyle,
        },
      },
    };
  }

  return {
    type: "FeatureCollection" as const,
    name: options.name,
    dromap_source: {
      sourceLabel: "OpenStreetMap",
      sourceUrl: "https://www.openstreetmap.org/copyright",
      sourceLicense: "ODbL 1.0",
      sourceAttribution: "© OpenStreetMap contributors",
      extractionService: "Overpass API",
      presetId: options.presetId,
      extractedAt: options.extractedAt ?? new Date().toISOString(),
    },
    features,
  };
}


export type DromapOsmGeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  geometry: GeoJsonGeometry | null;
  properties?: Record<string, unknown> | null;
};

export type DromapOsmGeoJsonFeatureCollection = {
  type: "FeatureCollection";
  name?: string;
  features: DromapOsmGeoJsonFeature[];
  [key: string]: unknown;
};

function parseOhsomeOsmIdentity(properties: Record<string, unknown>) {
  const rawId = typeof properties["@osmId"] === "string" ? properties["@osmId"] : "";
  const match = /^(node|way|relation)\/(\d+)$/.exec(rawId);

  if (!match) {
    return null;
  }

  return {
    type: match[1] as "node" | "way" | "relation",
    id: Number(match[2]),
  };
}

export function decorateDromapOsmGeoJson(
  input: DromapOsmGeoJsonFeatureCollection,
  options: {
    name: string;
    presetId: string;
    extractedAt?: string;
    extractionService?: string;
    sourceTimestamp?: string;
  },
) {
  const features = (Array.isArray(input.features) ? input.features : [])
    .filter((feature) => feature?.type === "Feature" && feature.geometry)
    .map((feature, index) => {
      const properties =
        feature.properties && typeof feature.properties === "object" && !Array.isArray(feature.properties)
          ? { ...feature.properties }
          : {};
      const identity = parseOhsomeOsmIdentity(properties);

      if (identity) {
        properties.osm_type = identity.type;
        properties.osm_id = identity.id;
        properties.osm_url = `https://www.openstreetmap.org/${identity.type}/${identity.id}`;
      }

      return {
        ...feature,
        id:
          feature.id ??
          (identity ? `osm-${identity.type}-${identity.id}` : `osm-feature-${index + 1}`),
        properties,
      } satisfies DromapOsmGeoJsonFeature;
    });

  const layerStyle = getDromapOsmPresetLayerStyle(options.presetId);

  if (layerStyle && features.length > 0) {
    const firstFeature = features[0];
    const properties = firstFeature.properties ?? {};
    const currentDromap = properties.dromap;
    const dromap =
      typeof currentDromap === "object" && currentDromap !== null && !Array.isArray(currentDromap)
        ? (currentDromap as Record<string, unknown>)
        : {};

    features[0] = {
      ...firstFeature,
      properties: {
        ...properties,
        dromap: {
          ...dromap,
          layerStyle,
        },
      },
    };
  }

  return {
    ...input,
    type: "FeatureCollection" as const,
    name: options.name,
    dromap_source: {
      sourceLabel: "OpenStreetMap",
      sourceUrl: "https://www.openstreetmap.org/copyright",
      sourceLicense: "ODbL 1.0",
      sourceAttribution: "© OpenStreetMap contributors",
      extractionService: options.extractionService ?? "OpenStreetMap data service",
      presetId: options.presetId,
      extractedAt: options.extractedAt ?? new Date().toISOString(),
      ...(options.sourceTimestamp ? { sourceTimestamp: options.sourceTimestamp } : {}),
    },
    features,
  };
}
