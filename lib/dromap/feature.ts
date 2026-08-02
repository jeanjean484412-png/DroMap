import type { Layer } from "leaflet";

export type DroMapFeatureType = "marker" | "line" | "zone" | "text";

export type DroMapFeatureDashStyle = "solid" | "dashed" | "dotted";

export type DroMapZoneHatchingStyle =
  | "none"
  | "diagonal-right"
  | "diagonal-left"
  | "horizontal"
  | "vertical";

export type DroMapZoneVariant = "polygon" | "freehand" | "shape" | "boundary-fill";

export type DroMapZoneShapeKind = "rectangle" | "circle" | "ellipse";

export type DroMapLineVariant = "straight" | "freehand" | "traced";

export type DroMapMarkerBuiltinSymbol = string;

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


export type DroMapFeatureSource = {
  type: "geojson";
  importId: string;
  sourceName?: string | null;
  originalProperties?: Record<string, unknown>;
  /** Identifiant stable de l’entité GeoJSON d’origine, utile pour regrouper les parties Multi* au retour en calque GeoJSON. */
  originalFeatureId?: string | number | null;
  /** Type géométrique d’origine avant conversion en objets DroMap. */
  originalGeometryType?: string | null;
  /** Index de la partie dans une géométrie MultiPoint/MultiLineString/MultiPolygon. */
  originalPartIndex?: number | null;
};

export type DroMapFeatureStyle = {
  color?: string;
  weight?: number;
  opacity?: number;
  fillColor?: string;
  fillOpacity?: number;
  dashStyle?: DroMapFeatureDashStyle;
  zoneStrokeEnabled?: boolean;
  zoneFillEnabled?: boolean;
  zoneHatchingStyle?: DroMapZoneHatchingStyle | "dots";
  zoneHatchingColor?: string;
  zoneHatchingWeight?: number;
  zoneHatchingSpacing?: number;
  zoneDotsEnabled?: boolean;
  zoneDotsColor?: string;
  zoneDotsRadius?: number;
  zoneDotsSpacing?: number;
  zoneShapeWidth?: number;
  zoneShapeHeight?: number;
  zoneShapeRotation?: number;
  markerSize?: number;
  markerFilled?: boolean;
  /** Rotation en degrés des marqueurs dessinés ou importés. */
  markerRotation?: number;
  fontSize?: number;
  /** Graisse du texte DroMap. false/absent = normal. */
  textBold?: boolean;
  /** Italique du texte DroMap. */
  textItalic?: boolean;
  /** Niveau de zoom Leaflet auquel la taille visuelle de cet objet correspond exactement. */
  visualReferenceZoom?: number;
  /** Facteur temporaire de rendu, jamais enregistré dans les données du projet. */
  renderScale?: number;
  /** Niveau de zoom Leaflet auquel fontSize correspond exactement. */
  textReferenceZoom?: number;
  textRotation?: number;
  textBackgroundEnabled?: boolean;
  textBackgroundColor?: string;
  textBackgroundOpacity?: number;
  textBorderEnabled?: boolean;
  textBorderColor?: string;
  textBorderWidth?: number;
  /** Contour directement autour des glyphes du texte. */
  textOutlineEnabled?: boolean;
  textOutlineColor?: string;
  textOutlineWidth?: number;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  /**
   * Niveau de lissage appliqué au moment de la création d’un dessin libre
   * ou d’une zone libre. 0 = tracé brut, 100 = tracé fortement nettoyé.
   */
  freehandSmoothing?: number;
};

export type DroMapFeatureLockOverride = "locked" | "unlocked";

export type DroMapFeatureMapLabelVisibility = "inherit" | "show" | "hide";

export type DroMapFeatureMapLabelOffset = {
  /** Décalage horizontal en pixels au zoom de référence. */
  x: number;
  /** Décalage vertical en pixels au zoom de référence. */
  y: number;
  /** Zoom Leaflet auquel x et y ont été définis. */
  referenceZoom: number;
};

export type DroMapFeatureProperties = {
  type: DroMapFeatureType;
  style: DroMapFeatureStyle;
  label: string;
  legendLabel?: string;
  /** Affichage de l’étiquette du nom sur la carte. */
  mapLabelVisibility?: DroMapFeatureMapLabelVisibility;
  /** Placement manuel de l’étiquette, enregistré indépendamment du zoom courant. */
  mapLabelOffset?: DroMapFeatureMapLabelOffset;
  symbol?: DroMapMarkerSymbol;
  lineVariant?: DroMapLineVariant;
  zoneVariant?: DroMapZoneVariant;
  zoneShapeKind?: DroMapZoneShapeKind;
  order?: number;
  locked?: boolean;
  /**
   * La géométrie reste liée à sa donnée géographique d'origine.
   * L'objet peut toujours être stylisé, renommé, étiqueté ou supprimé,
   * mais il ne peut ni être déplacé ni déformé.
   */
  geometryLocked?: boolean;
  /**
   * Verrouillage explicite de l’objet.
   * - absent : l’objet suit uniquement son verrouillage simple et celui du calque ;
   * - "locked" : l’objet est verrouillé individuellement ;
   * - "unlocked" : ancien état conservé pour compatibilité, mais n’outrepasse plus un calque verrouillé.
   */
  lockOverride?: DroMapFeatureLockOverride;
  layerId?: string;
  /** Ordre de calque calculé au rendu, non utilisé comme donnée métier persistante. */
  layerRenderOrder?: number;
  source?: DroMapFeatureSource;
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
    color: "#000000",
    weight: 7,
    opacity: 1,
    markerSize: 18,
    markerFilled: true,
    markerRotation: 0,
  },
  line: {
    color: "#3388ff",
    weight: 3,
    opacity: 0.9,
    dashStyle: "solid",
    arrowStart: false,
    arrowEnd: false,
    freehandSmoothing: 45,
  },
  zone: {
    color: "#3388ff",
    weight: 2,
    opacity: 0.9,
    fillColor: "#3388ff",
    fillOpacity: 0.2,
    dashStyle: "solid",
    zoneStrokeEnabled: true,
    zoneFillEnabled: false,
    zoneHatchingStyle: "none",
    zoneHatchingColor: "#111827",
    zoneHatchingWeight: 2,
    zoneHatchingSpacing: 14,
    zoneDotsEnabled: false,
    zoneDotsColor: "#111827",
    zoneDotsRadius: 2,
    zoneDotsSpacing: 14,
    zoneShapeWidth: 180,
    zoneShapeHeight: 110,
    zoneShapeRotation: 0,
    freehandSmoothing: 45,
  },
  text: {
    color: "#111827",
    opacity: 1,
    fontSize: 22,
    textBold: false,
    textItalic: false,
    textReferenceZoom: undefined,
    textRotation: 0,
    textBackgroundEnabled: false,
    textBackgroundColor: "#ffffff",
    textBackgroundOpacity: 0.85,
    textBorderEnabled: false,
    textBorderColor: "#111827",
    textBorderWidth: 2,
    textOutlineEnabled: true,
    textOutlineColor: "#ffffff",
    textOutlineWidth: 1.5,
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

export function isTracedLineFeature(feature: DroMapFeature | null | undefined) {
  return (
    feature?.properties?.type === "line" &&
    feature.geometry?.type === "LineString" &&
    feature.properties.lineVariant === "traced"
  );
}

export function isQuickShapeZoneFeature(feature: DroMapFeature) {
  return (
    feature.properties?.type === "zone" &&
    feature.geometry?.type === "Polygon" &&
    feature.properties.zoneVariant === "shape"
  );
}

export function isFreehandZoneFeature(feature: DroMapFeature) {
  if (
    feature.properties?.type !== "zone" ||
    feature.geometry?.type !== "Polygon"
  ) {
    return false;
  }

  if (feature.properties.zoneVariant === "freehand") {
    return true;
  }

  if (feature.properties.label?.trim().toLowerCase() === "zone libre") {
    return true;
  }

  return false;
}


function getLargestPolygonRingLength(feature: DroMapFeature): number {
  if (feature.geometry?.type !== "Polygon") {
    return 0;
  }

  return feature.geometry.coordinates.reduce(
    (largest, ring) => Math.max(largest, Array.isArray(ring) ? ring.length : 0),
    0,
  );
}

export function isBoundaryFillZoneFeature(feature: DroMapFeature | null | undefined): boolean {
  if (
    feature?.properties?.type !== "zone" ||
    feature.geometry?.type !== "Polygon"
  ) {
    return false;
  }

  if (feature.properties.zoneVariant === "boundary-fill") {
    return true;
  }

  /**
   * Compatibilite avec les zones deja creees par les premiers patchs de
   * remplissage vectoriel : elles etaient encore sauvegardees comme
   * zoneVariant = "polygon" alors que leur contour contient souvent des
   * dizaines/centaines de points issus du fond de carte.
   * On les traite comme non-editables geometriquement pour eviter la foret
   * de poignees Geoman.
   */
  return (
    (feature.properties.zoneVariant === "polygon" ||
      !feature.properties.zoneVariant) &&
    getLargestPolygonRingLength(feature) > 48
  );
}

export function getFeatureLockOverride(
  feature: DroMapFeature | null | undefined,
): DroMapFeatureLockOverride | null {
  const override = feature?.properties?.lockOverride;

  return override === "locked" || override === "unlocked" ? override : null;
}

export function isFeatureLocked(feature: DroMapFeature | null | undefined): boolean {
  const override = getFeatureLockOverride(feature);

  return feature?.properties?.locked === true || override === "locked";
}

export function isFeatureExplicitlyUnlocked(
  feature: DroMapFeature | null | undefined,
): boolean {
  return getFeatureLockOverride(feature) === "unlocked";
}

function normalizeSourceMetadataValue(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Reconnaît les empreintes de bâtiments importées depuis une source dédiée :
 * IGN BD TOPO® en France ou Overture Maps Buildings ailleurs. La détection
 * s'appuie d'abord sur le nom de la source, puis sur les métadonnées conservées
 * dans chaque feature. Elle fonctionne donc aussi après conversion en objets
 * DroMap et pour les anciens imports IGN.
 */
export function isIgnBdTopoBuildingFeature(
  feature: DroMapFeature | null | undefined,
): boolean {
  const source = feature?.properties?.source;

  if (source?.type !== "geojson") {
    return false;
  }

  const sourceName = normalizeSourceMetadataValue(source.sourceName);

  if (
    sourceName.includes("ign-bdtopo-buildings") ||
    sourceName.includes("bdtopo_v3:batiment") ||
    sourceName.includes("overture-buildings")
  ) {
    return true;
  }

  const originalProperties = source.originalProperties;

  if (!originalProperties || typeof originalProperties !== "object") {
    return false;
  }

  const sourceLayer = normalizeSourceMetadataValue(
    originalProperties.source_layer,
  );

  const sourceProvider = normalizeSourceMetadataValue(
    originalProperties.source,
  );

  return (
    sourceLayer === "bdtopo_v3:batiment" ||
    sourceLayer.endsWith(":batiment") ||
    sourceLayer === "building" ||
    sourceProvider.includes("overture maps buildings")
  );
}

/**
 * Verrouillage géométrique distinct du verrouillage complet : les styles,
 * noms et étiquettes restent éditables.
 */
export function isFeatureGeometryLocked(
  feature: DroMapFeature | null | undefined,
): boolean {
  return (
    feature?.properties?.geometryLocked === true ||
    isIgnBdTopoBuildingFeature(feature)
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

function getFeatureZoneVariantProperties(
  featureType: DroMapFeatureType,
  existing?: DroMapFeature,
) {
  if (featureType !== "zone") {
    return {};
  }

  return {
    ...(existing?.properties.zoneVariant
      ? { zoneVariant: existing.properties.zoneVariant }
      : {}),
    ...(existing?.properties.zoneShapeKind
      ? { zoneShapeKind: existing.properties.zoneShapeKind }
      : {}),
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
      // Lors d'une edition geometrique, conserver toutes les metadonnees de
      // l'objet (source GeoJSON, visibilite de l'etiquette, etc.). L'ancienne
      // reconstruction champ par champ supprimait ces informations au premier
      // deplacement et faisait notamment disparaitre les etiquettes.
      ...(existing?.properties ?? {}),
      type: featureType,
      style,
      label: existing?.properties.label ?? DEFAULT_LABEL[featureType],
      legendLabel: existing?.properties.legendLabel,
      order: existing?.properties.order,
      locked: existing?.properties.locked === true,
      ...(existing?.properties.lockOverride
        ? { lockOverride: existing.properties.lockOverride }
        : {}),
      layerId: existing?.properties.layerId,
      ...getFeatureLineVariantProperties(featureType, existing),
      ...getFeatureZoneVariantProperties(featureType, existing),
      ...getFeatureSymbolProperties(featureType, existing),
      meta: existing?.properties.meta ?? { version: 1 },
    },
  };
}
