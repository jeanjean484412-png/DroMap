import type { Layer } from "leaflet";

export type DroMapFeatureType = "marker" | "line" | "zone" | "text";

export type DroMapFeatureDashStyle = "solid" | "dashed" | "dotted";

export type DroMapLineVariant = "straight" | "freehand";

export type DroMapMarkerBuiltinSymbol =
  | "circle"
  | "square"
  | "diamond"
  | "triangle"
  | "star"
  | "pin";

export type DroMapMarkerSymbol =
  | {
      type: "builtin";
      id: DroMapMarkerBuiltinSymbol;
    }
  | {
      type: "custom-svg";
      id: string;
    }
  | {
      type: "custom-image";
      id: string;
    }
  | {
      type: "ai-generated";
      id: string;
    }
  | {
      type: "drawn";
      id: string;
    };

export type DroMapFeatureStyle = {
  color?: string;
  weight?: number;
  opacity?: number;
  fillColor?: string;
  fillOpacity?: number;
  dashStyle?: DroMapFeatureDashStyle;
  markerSize?: number;
  fontSize?: number;
  arrowStart?: boolean;
  arrowEnd?: boolean;
};

export type DroMapFeatureProperties = {
  type: DroMapFeatureType;
  style: DroMapFeatureStyle;
  label: string;
  legendLabel?: string;
  symbol?: DroMapMarkerSymbol;
  lineVariant?: DroMapLineVariant;
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

/** Feature GeoJSON DroMap. */
export type DroMapFeature = {
  type: "Feature";
  id: string;
  geometry: DroMapGeometry;
  properties: DroMapFeatureProperties;
};

type LeafletGeometryLayer = Layer & {
  toGeoJSON?: () => unknown;
  getLatLng?: () => unknown;
  getLatLngs?: () => unknown;
  options?: {
    color?: string;
    weight?: number;
    opacity?: number;
    fillColor?: string;
    fillOpacity?: number;
  };
};

const DEFAULT_MARKER_SYMBOL: DroMapMarkerSymbol = {
  type: "builtin",
  id: "circle",
};

const DEFAULT_STYLE: Record<DroMapFeatureType, DroMapFeatureStyle> = {
  marker: {
    color: "#3388ff",
    opacity: 1,
    markerSize: 18,
  },
  line: {
    color: "#3388ff",
    weight: 3,
    opacity: 0.9,
    dashStyle: "solid",
    arrowStart: false,
    arrowEnd: false,
  },
  zone: {
    color: "#3388ff",
    weight: 2,
    opacity: 0.9,
    fillColor: "#3388ff",
    fillOpacity: 0.2,
    dashStyle: "solid",
  },
  text: {
    color: "#111827",
    opacity: 1,
    fontSize: 22,
  },
};

const DEFAULT_LABEL: Record<DroMapFeatureType, string> = {
  marker: "Marqueur",
  line: "Ligne",
  zone: "Zone",
  text: "Texte",
};

export function isFreehandLineFeature(feature: DroMapFeature) {
  if (
    feature.properties?.type !== "line" ||
    feature.geometry?.type !== "LineString"
  ) {
    return false;
  }

  if (feature.properties.lineVariant === "freehand") {
    return true;
  }

  if (feature.properties.label?.trim().toLowerCase() === "ligne libre") {
    return true;
  }

  return (
    Array.isArray(feature.geometry.coordinates) &&
    feature.geometry.coordinates.length > 24
  );
}

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

function isLeafletGeometryLayer(layer: Layer): layer is LeafletGeometryLayer {
  const candidate = layer as LeafletGeometryLayer;

  return (
    typeof candidate.toGeoJSON === "function" &&
    (typeof candidate.getLatLng === "function" ||
      typeof candidate.getLatLngs === "function")
  );
}

function isPathLikeLayer(layer: LeafletGeometryLayer) {
  return typeof layer.getLatLngs === "function";
}

function styleFromPath(layer: LeafletGeometryLayer): DroMapFeatureStyle {
  const options = layer.options ?? {};

  return {
    color: options.color,
    weight: options.weight,
    opacity: options.opacity,
    fillColor: options.fillColor,
    fillOpacity: options.fillOpacity,
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
    case "text":
      return isPoint(geometry);
    case "line":
      return isLineString(geometry);
    case "zone":
      return isPolygon(geometry);
  }
}

function getFeatureSymbolProperties(
  featureType: DroMapFeatureType,
  existing?: DroMapFeature,
) {
  if (featureType === "marker") {
    return {
      symbol: existing?.properties.symbol ?? DEFAULT_MARKER_SYMBOL,
    };
  }

  return {};
}

function getFeatureLineVariantProperties(
  featureType: DroMapFeatureType,
  existing?: DroMapFeature,
) {
  if (featureType !== "line" || !existing?.properties.lineVariant) {
    return {};
  }

  return {
    lineVariant: existing.properties.lineVariant,
  };
}

/** Extrait une DroMapFeature depuis une couche Leaflet / Geoman. */
export function layerToDroMapFeature(
  layer: Layer,
  shape: string,
  existing?: DroMapFeature,
): DroMapFeature | null {
  const geomanFeatureType = geomanShapeToFeatureType(shape);
  if (!geomanFeatureType) return null;

  const featureType: DroMapFeatureType =
    existing?.properties.type === "text" && geomanFeatureType === "marker"
      ? "text"
      : geomanFeatureType;

  if (!isLeafletGeometryLayer(layer)) {
    return null;
  }

  const raw = layer.toGeoJSON?.() as {
    type: string;
    geometry?: DroMapGeometry;
  };

  if (raw.type !== "Feature" || !raw.geometry) return null;
  if (!geometryMatchesType(raw.geometry, featureType)) return null;

  const existingStyle =
    existing?.properties.style ?? DEFAULT_STYLE[featureType];

  const style =
    isPathLikeLayer(layer) && (featureType === "line" || featureType === "zone")
      ? {
          ...existingStyle,
          ...styleFromPath(layer),
          ...(featureType === "line" &&
          (existingStyle.arrowStart === true || existingStyle.arrowEnd === true)
            ? { opacity: existingStyle.opacity }
            : {}),
        }
      : existingStyle;

  return {
    type: "Feature",
    id: existing?.id ?? crypto.randomUUID(),
    geometry: raw.geometry,
    properties: {
      type: featureType,
      style,
      label: existing?.properties.label ?? DEFAULT_LABEL[featureType],
      legendLabel: existing?.properties.legendLabel,
      ...getFeatureLineVariantProperties(featureType, existing),
      ...getFeatureSymbolProperties(featureType, existing),
      meta: { version: 1 },
    },
  };
}
