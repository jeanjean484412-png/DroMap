import type { DroMapFeatureStyle } from "@/lib/dromap/feature";
import type {
  DromapGeoJsonFeature,
  DromapGeoJsonLayer,
  DromapGeoJsonLayerDashStyle,
  DromapGeoJsonLayerStyle,
} from "@/stores/editor-test-geojson-layers";

export type EffectiveGeoJsonFeatureStyle = DromapGeoJsonLayerStyle & {
  zoneStrokeEnabled: boolean;
  zoneFillEnabled: boolean;
  dromapFeatureType: "marker" | "text" | "line" | "zone" | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(value, min, max);
  }

  return clamp(fallback, min, max);
}

function normalizeDashStyle(value: unknown, fallback: DromapGeoJsonLayerDashStyle) {
  if (value === "dotted") {
    return "dotted";
  }

  if (value === "dashed") {
    return "dashed";
  }

  return fallback;
}

function getDromapMetadata(feature: DromapGeoJsonFeature) {
  const dromap = feature.properties?.dromap;
  return isRecord(dromap) ? dromap : null;
}

function getDromapFeatureStyle(feature: DromapGeoJsonFeature) {
  const dromap = getDromapMetadata(feature);
  const style = dromap?.style;

  // Ne jamais relire properties.style comme style visuel par défaut : certains
  // fichiers GeoJSON externes y stockent un style Leaflet/geojson.io bleu.
  // Seul le namespace dromap.style est considéré comme un style DroMap réel.
  return isRecord(style) ? (style as DroMapFeatureStyle) : null;
}

function getDromapFeatureType(feature: DromapGeoJsonFeature) {
  const dromap = getDromapMetadata(feature);
  const featureType = dromap?.featureType ?? dromap?.type ?? feature.properties?.dromap_type;

  if (
    featureType === "marker" ||
    featureType === "text" ||
    featureType === "line" ||
    featureType === "zone"
  ) {
    return featureType;
  }

  if (feature.geometry.type === "Point" || feature.geometry.type === "MultiPoint") {
    return "marker";
  }

  if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
    return "zone";
  }

  return "line";
}

export function getEffectiveGeoJsonFeatureStyle(
  layer: DromapGeoJsonLayer,
  feature?: DromapGeoJsonFeature | null,
): EffectiveGeoJsonFeatureStyle {
  const layerStyle = layer.style;
  const dromapStyle = feature ? getDromapFeatureStyle(feature) : null;
  const dromapFeatureType = feature ? getDromapFeatureType(feature) : null;

  if (!dromapStyle) {
    const isZone = dromapFeatureType === "zone";
    return {
      ...layerStyle,
      zoneStrokeEnabled: layerStyle.strokeOpacity > 0,
      zoneFillEnabled: isZone && layerStyle.fillOpacity > 0,
      dromapFeatureType,
    };
  }

  const strokeColor = normalizeString(dromapStyle.color, layerStyle.strokeColor);
  const fillColor = normalizeString(dromapStyle.fillColor, layerStyle.fillColor);
  const zoneStrokeEnabled = dromapStyle.zoneStrokeEnabled !== false;
  const zoneFillEnabled = dromapStyle.zoneFillEnabled === true ||
    (dromapStyle.zoneFillEnabled !== false && typeof dromapStyle.fillOpacity === "number" && dromapStyle.fillOpacity > 0);

  return {
    strokeColor,
    strokeWeight: normalizeNumber(dromapStyle.weight, layerStyle.strokeWeight, 1, 24),
    strokeOpacity: zoneStrokeEnabled
      ? clamp01(
          typeof dromapStyle.opacity === "number"
            ? dromapStyle.opacity
            : layerStyle.strokeOpacity,
        )
      : 0,
    fillColor,
    fillOpacity: zoneFillEnabled
      ? clamp01(
          typeof dromapStyle.fillOpacity === "number"
            ? dromapStyle.fillOpacity
            : layerStyle.fillOpacity,
        )
      : 0,
    markerSize: normalizeNumber(
      dromapStyle.markerSize ?? dromapStyle.fontSize,
      layerStyle.markerSize,
      2,
      80,
    ),
    dashStyle: normalizeDashStyle(dromapStyle.dashStyle, layerStyle.dashStyle),
    zoneStrokeEnabled,
    zoneFillEnabled,
    dromapFeatureType,
  };
}

export function getGeoJsonDashArray(style: Pick<DromapGeoJsonLayerStyle, "dashStyle">) {
  if (style.dashStyle === "dotted") {
    return "1 8";
  }

  if (style.dashStyle === "dashed") {
    return "10 8";
  }

  return undefined;
}

export function getGeoJsonCanvasDashArray(
  style: Pick<DromapGeoJsonLayerStyle, "dashStyle">,
  lineWidth: number,
) {
  if (style.dashStyle === "dotted") {
    return [0.001, Math.max(6, lineWidth * 2.4)];
  }

  if (style.dashStyle === "dashed") {
    return [Math.max(8, lineWidth * 3), Math.max(6, lineWidth * 1.8)];
  }

  return [] as number[];
}
