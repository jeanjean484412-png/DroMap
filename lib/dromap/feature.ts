import L from "leaflet";

export type DroMapFeatureType = "marker" | "line" | "zone";

export type DroMapFeatureStyle = {
  color?: string;
  weight?: number;
  opacity?: number;
  fillColor?: string;
  fillOpacity?: number;
};

export type DroMapFeatureProperties = {
  type: DroMapFeatureType;
  style: DroMapFeatureStyle;
  label: string;
  meta: { version: 1 };
};

export type DroMapPoint = {
  type: "Point";
  coordinates: [number, number];
};

export type DroMapLineString = {
  type: "LineString";
  coordinates: [number, number][];
};

export type DroMapPolygon = {
  type: "Polygon";
  coordinates: [number, number][][];
};

export type DroMapGeometry = DroMapPoint | DroMapLineString | DroMapPolygon;

/** Feature GeoJSON DroMap (Point, LineString ou Polygon uniquement). */
export type DroMapFeature = {
  type: "Feature";
  id: string;
  geometry: DroMapGeometry;
  properties: DroMapFeatureProperties;
};

const DEFAULT_STYLE: Record<DroMapFeatureType, DroMapFeatureStyle> = {
  marker: { color: "#3388ff" },
  line: { color: "#3388ff", weight: 3, opacity: 0.9 },
  zone: {
    color: "#3388ff",
    weight: 2,
    opacity: 0.9,
    fillColor: "#3388ff",
    fillOpacity: 0.2,
  },
};

const DEFAULT_LABEL: Record<DroMapFeatureType, string> = {
  marker: "Marqueur",
  line: "Ligne",
  zone: "Zone",
};

export function geomanShapeToFeatureType(
  shape: string,
): DroMapFeatureType | null {
  switch (shape) {
    case "Marker":
      return "marker";
    case "Line":
      return "line";
    case "Polygon":
      return "zone";
    default:
      return null;
  }
}

function styleFromPath(layer: L.Path): DroMapFeatureStyle {
  return {
    color: layer.options.color,
    weight: layer.options.weight,
    opacity: layer.options.opacity,
    fillColor: layer.options.fillColor,
    fillOpacity: layer.options.fillOpacity,
  };
}

function isPoint(geometry: DroMapGeometry): geometry is DroMapPoint {
  return geometry.type === "Point";
}

function isLineString(geometry: DroMapGeometry): geometry is DroMapLineString {
  return geometry.type === "LineString";
}

function isPolygon(geometry: DroMapGeometry): geometry is DroMapPolygon {
  return geometry.type === "Polygon";
}

function geometryMatchesType(
  geometry: DroMapGeometry,
  featureType: DroMapFeatureType,
): boolean {
  switch (featureType) {
    case "marker":
      return isPoint(geometry);
    case "line":
      return isLineString(geometry);
    case "zone":
      return isPolygon(geometry);
  }
}

/** Extrait une DroMapFeature depuis une couche Leaflet / Geoman. */
export function layerToDroMapFeature(
  layer: L.Layer,
  shape: string,
  existing?: DroMapFeature,
): DroMapFeature | null {
  const featureType = geomanShapeToFeatureType(shape);
  if (!featureType) return null;

  if (
    !(layer instanceof L.Marker) &&
    !(layer instanceof L.Polygon) &&
    !(layer instanceof L.Polyline)
  ) {
    return null;
  }

  const raw = layer.toGeoJSON() as {
    type: string;
    geometry?: DroMapGeometry;
  };

  if (raw.type !== "Feature" || !raw.geometry) return null;
  if (!geometryMatchesType(raw.geometry, featureType)) return null;

  const style =
    layer instanceof L.Path
      ? styleFromPath(layer)
      : (existing?.properties.style ?? DEFAULT_STYLE[featureType]);

  return {
    type: "Feature",
    id: existing?.id ?? crypto.randomUUID(),
    geometry: raw.geometry,
    properties: {
      type: featureType,
      style,
      label: existing?.properties.label ?? DEFAULT_LABEL[featureType],
      meta: { version: 1 },
    },
  };
}
