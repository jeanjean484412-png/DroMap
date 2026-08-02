import type {
  DroMapFeature,
  DroMapFeatureDashStyle,
  DroMapFeatureProperties,
  DroMapFeatureMapLabelVisibility,
  DroMapFeatureStyle,
  DroMapMarkerSymbol,
  DroMapLineVariant,
  DroMapZoneShapeKind,
  DroMapZoneVariant,
} from "@/lib/dromap/feature";
import { setFeatureLayerId } from "@/stores/editor-test-layers";
import type {
  DromapGeoJsonFeature,
  DromapGeoJsonGeometry,
  DromapGeoJsonLayer,
  DromapGeoJsonLayerStyle,
} from "@/stores/editor-test-geojson-layers";

export const GEOJSON_TO_DROMAP_HEAVY_FEATURE_THRESHOLD = 500;

type Coordinate = [number, number];

function cloneJsonValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function createDromapFeatureId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `feature-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFeatureNamePart(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getFirstProperty(properties: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = properties[key];
    const parsed = normalizeFeatureNamePart(value);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function getFeatureLabel(
  feature: DromapGeoJsonFeature,
  fallback: string,
  partIndex?: number,
) {
  const properties = feature.properties ?? {};
  const dromap = properties.dromap;
  const dromapLabel = isRecord(dromap)
    ? getFirstProperty(dromap, ["legendLabel", "label", "name"])
    : null;

  const label =
    dromapLabel ??
    getFirstProperty(properties, [
      "legendLabel",
      "legend_label",
      "label",
      "name",
      "nom",
      "Name",
      "NAME",
      "shapeName",
      "shape_name",
      "SHAPENAME",
      "name_fr",
      "NAME_FR",
      "nom_fr",
      "NOM",
      "title",
      "titre",
      "ref",
      "REF",
      "id",
    ]) ??
    fallback;

  if (typeof partIndex === "number" && partIndex > 0) {
    return `${label} ${partIndex + 1}`;
  }

  return label;
}

function getDashStyle(style: DromapGeoJsonLayerStyle): DroMapFeatureDashStyle {
  return style.dashStyle === "dotted"
    ? "dotted"
    : style.dashStyle === "dashed"
      ? "dashed"
      : "solid";
}

function closeRing(ring: Coordinate[]) {
  if (ring.length < 3) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];

  if (!first || !last) {
    return ring;
  }

  if (first[0] === last[0] && first[1] === last[1]) {
    return ring;
  }

  return [...ring, first];
}

function getDromapMetadata(feature: DromapGeoJsonFeature) {
  const value = feature.properties?.dromap;
  return isRecord(value) ? value : null;
}

function getStringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumberValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBooleanValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function getDromapMapLabelVisibility(
  dromap: Record<string, unknown>,
): DroMapFeatureMapLabelVisibility | undefined {
  const visibility = getStringValue(dromap, "mapLabelVisibility");

  if (visibility === "inherit" || visibility === "show" || visibility === "hide") {
    return visibility;
  }

  return undefined;
}

function getDromapFeatureType(
  dromap: Record<string, unknown>,
  geometryType: "Point" | "LineString" | "Polygon",
): DroMapFeatureProperties["type"] | null {
  const rawType = getStringValue(dromap, "featureType") ?? getStringValue(dromap, "type");

  if ((rawType === "marker" || rawType === "text") && geometryType === "Point") {
    return rawType;
  }

  if (rawType === "line" && geometryType === "LineString") {
    return "line";
  }

  if (rawType === "zone" && geometryType === "Polygon") {
    return "zone";
  }

  return null;
}

function getDromapStyle(dromap: Record<string, unknown>): DroMapFeatureStyle | null {
  const style = dromap.style;
  return isRecord(style) ? (cloneJsonValue(style) as DroMapFeatureStyle) : null;
}

function getDromapSymbol(dromap: Record<string, unknown>): DroMapMarkerSymbol | undefined {
  const symbol = dromap.symbol;
  return isRecord(symbol) ? (cloneJsonValue(symbol) as DroMapMarkerSymbol) : undefined;
}

function getDromapLineVariant(dromap: Record<string, unknown>): DroMapLineVariant | undefined {
  const variant = getStringValue(dromap, "lineVariant");
  if (variant === "straight" || variant === "freehand" || variant === "traced") {
    return variant;
  }

  return undefined;
}

function getDromapZoneVariant(dromap: Record<string, unknown>): DroMapZoneVariant | undefined {
  const variant = getStringValue(dromap, "zoneVariant");
  if (
    variant === "polygon" ||
    variant === "freehand" ||
    variant === "shape" ||
    variant === "boundary-fill"
  ) {
    return variant;
  }

  return undefined;
}

function getDromapZoneShapeKind(
  dromap: Record<string, unknown>,
): DroMapZoneShapeKind | undefined {
  const shapeKind = getStringValue(dromap, "zoneShapeKind");
  if (shapeKind === "rectangle" || shapeKind === "circle" || shapeKind === "ellipse") {
    return shapeKind;
  }

  return undefined;
}

function getDromapLegendLabel(dromap: Record<string, unknown>, layer: DromapGeoJsonLayer) {
  const legendLabel = getStringValue(dromap, "legendLabel");
  if (legendLabel) {
    return legendLabel;
  }

  return layer.name;
}

function getDromapOrder(dromap: Record<string, unknown>) {
  const order = getNumberValue(dromap, "order");
  return typeof order === "number" ? order : undefined;
}

function getDromapSource(dromap: Record<string, unknown>): DroMapFeatureProperties["source"] {
  const source = dromap.source;

  if (!isRecord(source)) {
    return undefined;
  }

  if (source.type !== "geojson" || typeof source.importId !== "string") {
    return undefined;
  }

  return {
    type: "geojson",
    importId: source.importId,
    sourceName:
      typeof source.sourceName === "string" ? source.sourceName : undefined,
    originalProperties: isRecord(source.originalProperties)
      ? (cloneJsonValue(source.originalProperties) as Record<string, unknown>)
      : undefined,
    originalFeatureId:
      typeof source.originalFeatureId === "string" || typeof source.originalFeatureId === "number"
        ? source.originalFeatureId
        : null,
    originalGeometryType:
      typeof source.originalGeometryType === "string" ? source.originalGeometryType : null,
    originalPartIndex:
      typeof source.originalPartIndex === "number" && Number.isFinite(source.originalPartIndex)
        ? source.originalPartIndex
        : null,
  };
}

function getOriginalFeatureId(feature: DromapGeoJsonFeature, featureIndex: number) {
  if (typeof feature.id === "string" || typeof feature.id === "number") {
    return feature.id;
  }

  const properties = feature.properties ?? {};
  const candidate = properties.id ?? properties.ID ?? properties.ref ?? properties.name ?? properties.nom;

  if (typeof candidate === "string" || typeof candidate === "number") {
    return candidate;
  }

  return `geojson-feature-${featureIndex}`;
}

function createGeoJsonFeatureSource(input: {
  layer: DromapGeoJsonLayer;
  feature: DromapGeoJsonFeature;
  featureIndex: number;
  partIndex?: number;
}): DroMapFeatureProperties["source"] {
  return {
    type: "geojson",
    importId: input.layer.id,
    sourceName: input.layer.sourceName ?? input.layer.name,
    originalProperties: cloneJsonValue(input.feature.properties ?? {}),
    originalFeatureId: getOriginalFeatureId(input.feature, input.featureIndex),
    originalGeometryType: input.feature.geometry.type,
    originalPartIndex: typeof input.partIndex === "number" ? input.partIndex : 0,
  };
}

function createExactDromapFeatureFromMetadata(input: {
  layer: DromapGeoJsonLayer;
  layerId: string;
  feature: DromapGeoJsonFeature;
  geometry: DroMapFeature["geometry"];
  featureIndex: number;
  partIndex?: number;
}): DroMapFeature | null {
  const dromap = getDromapMetadata(input.feature);

  if (!dromap) {
    return null;
  }

  const featureType = getDromapFeatureType(dromap, input.geometry.type);
  if (!featureType) {
    return null;
  }

  const label =
    getStringValue(dromap, "label") ??
    getFeatureLabel(
      input.feature,
      featureType === "marker"
        ? "Point GeoJSON"
        : featureType === "text"
          ? "Texte GeoJSON"
          : featureType === "line"
            ? "Ligne GeoJSON"
            : "Zone GeoJSON",
    );
  const style = getDromapStyle(dromap);

  if (!style) {
    return null;
  }

  const locked = getBooleanValue(dromap, "locked") === true;
  const lockOverride = getStringValue(dromap, "lockOverride");
  const baseProperties: DroMapFeatureProperties = {
    type: featureType,
    label,
    legendLabel: getDromapLegendLabel(dromap, input.layer),
    mapLabelVisibility: getDromapMapLabelVisibility(dromap),
    style,
    locked,
    ...(lockOverride === "locked" || lockOverride === "unlocked" ? { lockOverride } : {}),
    meta: { version: 1 },
  };

  const order = getDromapOrder(dromap);
  if (typeof order === "number") {
    baseProperties.order = order;
  }

  const sourceFromMetadata = getDromapSource(dromap);
  const source = sourceFromMetadata
    ? {
        ...sourceFromMetadata,
        originalGeometryType: sourceFromMetadata.originalGeometryType ?? input.feature.geometry.type,
        originalPartIndex:
          typeof input.partIndex === "number"
            ? input.partIndex
            : sourceFromMetadata.originalPartIndex ?? 0,
      }
    : createGeoJsonFeatureSource(input);

  if (source) {
    baseProperties.source = source;
  }

  if (featureType === "marker") {
    baseProperties.symbol = getDromapSymbol(dromap) ?? { type: "builtin", id: "circle" };
  }

  if (featureType === "line") {
    baseProperties.lineVariant = getDromapLineVariant(dromap) ?? "straight";
  }

  if (featureType === "zone") {
    baseProperties.zoneVariant = getDromapZoneVariant(dromap) ?? "polygon";
    const shapeKind = getDromapZoneShapeKind(dromap);
    if (shapeKind) {
      baseProperties.zoneShapeKind = shapeKind;
    }
  }

  return setFeatureLayerId(
    {
      type: "Feature",
      id: createDromapFeatureId(),
      geometry: input.geometry,
      properties: baseProperties,
    },
    input.layerId,
  );
}

function createMarkerFeature(input: {
  layer: DromapGeoJsonLayer;
  layerId: string;
  feature: DromapGeoJsonFeature;
  featureIndex: number;
  coordinates: Coordinate;
  partIndex?: number;
}): DroMapFeature {
  const label = getFeatureLabel(input.feature, "Point GeoJSON", input.partIndex);

  return setFeatureLayerId(
    {
      type: "Feature",
      id: createDromapFeatureId(),
      geometry: {
        type: "Point",
        coordinates: input.coordinates,
      },
      properties: {
        type: "marker",
        label,
        legendLabel: input.layer.name,
        symbol: { type: "builtin", id: "circle" },
        style: {
          color: input.layer.style.strokeColor,
          weight: Math.max(3, input.layer.style.strokeWeight),
          opacity: input.layer.style.strokeOpacity,
          markerSize: input.layer.style.markerSize,
          markerFilled: true,
        },
        locked: false,
        source: createGeoJsonFeatureSource(input),
        meta: { version: 1 },
      },
    },
    input.layerId,
  );
}

function createLineFeature(input: {
  layer: DromapGeoJsonLayer;
  layerId: string;
  feature: DromapGeoJsonFeature;
  featureIndex: number;
  coordinates: Coordinate[];
  partIndex?: number;
}): DroMapFeature {
  const label = getFeatureLabel(input.feature, "Ligne GeoJSON", input.partIndex);

  return setFeatureLayerId(
    {
      type: "Feature",
      id: createDromapFeatureId(),
      geometry: {
        type: "LineString",
        coordinates: input.coordinates,
      },
      properties: {
        type: "line",
        label,
        legendLabel: input.layer.name,
        lineVariant: "straight",
        style: {
          color: input.layer.style.strokeColor,
          weight: input.layer.style.strokeWeight,
          opacity: input.layer.style.strokeOpacity,
          dashStyle: getDashStyle(input.layer.style),
          arrowStart: false,
          arrowEnd: false,
        },
        locked: false,
        source: createGeoJsonFeatureSource(input),
        meta: { version: 1 },
      },
    },
    input.layerId,
  );
}

function createZoneFeature(input: {
  layer: DromapGeoJsonLayer;
  layerId: string;
  feature: DromapGeoJsonFeature;
  featureIndex: number;
  coordinates: Coordinate[][];
  partIndex?: number;
}): DroMapFeature {
  const label = getFeatureLabel(input.feature, "Zone GeoJSON", input.partIndex);

  return setFeatureLayerId(
    {
      type: "Feature",
      id: createDromapFeatureId(),
      geometry: {
        type: "Polygon",
        coordinates: input.coordinates.map(closeRing),
      },
      properties: {
        type: "zone",
        label,
        legendLabel: input.layer.name,
        zoneVariant: "polygon",
        style: {
          color: input.layer.style.strokeColor,
          weight: input.layer.style.strokeWeight,
          opacity: input.layer.style.strokeOpacity,
          fillColor: input.layer.style.fillColor,
          fillOpacity: input.layer.style.fillOpacity,
          dashStyle: getDashStyle(input.layer.style),
          zoneStrokeEnabled: true,
          zoneFillEnabled: input.layer.style.fillOpacity > 0,
          zoneHatchingStyle: "none",
          zoneHatchingColor: "#111827",
          zoneHatchingWeight: 2,
          zoneHatchingSpacing: 14,
          zoneDotsEnabled: false,
          zoneDotsColor: "#111827",
          zoneDotsRadius: 2,
          zoneDotsSpacing: 14,
        },
        locked: false,
        source: createGeoJsonFeatureSource(input),
        meta: { version: 1 },
      },
    },
    input.layerId,
  );
}

function getDromapFeatureCountForGeometry(geometry: DromapGeoJsonGeometry) {
  if (geometry.type === "Point" || geometry.type === "LineString" || geometry.type === "Polygon") {
    return 1;
  }

  if (geometry.type === "MultiPoint" || geometry.type === "MultiLineString" || geometry.type === "MultiPolygon") {
    return geometry.coordinates.length;
  }

  return 0;
}

export function countDromapFeaturesForGeoJsonLayer(layer: DromapGeoJsonLayer) {
  return layer.data.features.reduce(
    (count, feature) => count + getDromapFeatureCountForGeometry(feature.geometry),
    0,
  );
}

function convertGeoJsonFeatureToDromapFeatures(
  layer: DromapGeoJsonLayer,
  feature: DromapGeoJsonFeature,
  layerId: string,
  featureIndex: number,
): DroMapFeature[] {
  const geometry = feature.geometry;

  if (geometry.type === "Point") {
    const dromapFeature = createExactDromapFeatureFromMetadata({
      layer,
      layerId,
      feature,
      featureIndex,
      geometry: { type: "Point", coordinates: geometry.coordinates },
    });

    if (dromapFeature) {
      return [dromapFeature];
    }

    return [
      createMarkerFeature({ layer, layerId, feature, featureIndex, coordinates: geometry.coordinates }),
    ];
  }

  if (geometry.type === "MultiPoint") {
    return geometry.coordinates.map((coordinates, partIndex) => {
      const dromapFeature = createExactDromapFeatureFromMetadata({
        layer,
        layerId,
        feature,
        featureIndex,
        partIndex,
        geometry: { type: "Point", coordinates },
      });

      return dromapFeature ?? createMarkerFeature({ layer, layerId, feature, featureIndex, coordinates, partIndex });
    });
  }

  if (geometry.type === "LineString") {
    const dromapFeature = createExactDromapFeatureFromMetadata({
      layer,
      layerId,
      feature,
      featureIndex,
      geometry: { type: "LineString", coordinates: geometry.coordinates },
    });

    if (dromapFeature) {
      return [dromapFeature];
    }

    return [
      createLineFeature({ layer, layerId, feature, featureIndex, coordinates: geometry.coordinates }),
    ];
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.map((coordinates, partIndex) => {
      const dromapFeature = createExactDromapFeatureFromMetadata({
        layer,
        layerId,
        feature,
        featureIndex,
        partIndex,
        geometry: { type: "LineString", coordinates },
      });

      return dromapFeature ?? createLineFeature({ layer, layerId, feature, featureIndex, coordinates, partIndex });
    });
  }

  if (geometry.type === "Polygon") {
    const dromapFeature = createExactDromapFeatureFromMetadata({
      layer,
      layerId,
      feature,
      featureIndex,
      geometry: { type: "Polygon", coordinates: geometry.coordinates.map(closeRing) },
    });

    if (dromapFeature) {
      return [dromapFeature];
    }

    return [
      createZoneFeature({ layer, layerId, feature, featureIndex, coordinates: geometry.coordinates }),
    ];
  }

  return geometry.coordinates.map((coordinates, partIndex) => {
    const dromapFeature = createExactDromapFeatureFromMetadata({
      layer,
      layerId,
      feature,
      featureIndex,
      partIndex,
      geometry: { type: "Polygon", coordinates: coordinates.map(closeRing) },
    });

    return dromapFeature ?? createZoneFeature({ layer, layerId, feature, featureIndex, coordinates, partIndex });
  });
}

export function convertGeoJsonLayerToDromapFeatures(
  layer: DromapGeoJsonLayer,
  layerId: string,
) {
  return layer.data.features.flatMap((feature, featureIndex) =>
    convertGeoJsonFeatureToDromapFeatures(layer, feature, layerId, featureIndex),
  );
}
