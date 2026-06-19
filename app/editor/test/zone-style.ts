import type {
  DroMapFeature,
  DroMapZoneHatchingStyle,
} from "@/lib/dromap/feature";

export const DROMAP_ZONE_HATCHING_STYLES: {
  value: DroMapZoneHatchingStyle;
  label: string;
}[] = [
  { value: "none", label: "Aucune" },
  { value: "diagonal-right", label: "Diagonale /" },
  { value: "diagonal-left", label: "Diagonale \\" },
  { value: "horizontal", label: "Horizontales" },
  { value: "vertical", label: "Verticales" },
];

export const MIN_ZONE_HATCHING_WEIGHT = 1;
export const MAX_ZONE_HATCHING_WEIGHT = 10;
export const MIN_ZONE_HATCHING_SPACING = 6;
export const MAX_ZONE_HATCHING_SPACING = 42;

export const MIN_ZONE_DOTS_RADIUS = 1;
export const MAX_ZONE_DOTS_RADIUS = 8;
export const MIN_ZONE_DOTS_SPACING = 6;
export const MAX_ZONE_DOTS_SPACING = 42;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function isLegacyDotsMode(feature: DroMapFeature) {
  return feature.properties?.style?.zoneHatchingStyle === "dots";
}

export function getZoneStrokeEnabled(feature: DroMapFeature) {
  return feature.properties?.style?.zoneStrokeEnabled !== false;
}

export function getZoneFillEnabled(feature: DroMapFeature) {
  return feature.properties?.style?.zoneFillEnabled !== false;
}

export function getZoneHatchingStyle(
  feature: DroMapFeature,
): DroMapZoneHatchingStyle {
  const value = feature.properties?.style?.zoneHatchingStyle;

  if (
    value === "diagonal-right" ||
    value === "diagonal-left" ||
    value === "horizontal" ||
    value === "vertical"
  ) {
    return value;
  }

  return "none";
}

export function getZoneHatchingEnabled(feature: DroMapFeature) {
  return getZoneHatchingStyle(feature) !== "none";
}

export function getZoneHatchingColor(feature: DroMapFeature) {
  return (
    feature.properties?.style?.zoneHatchingColor ??
    feature.properties?.style?.color ??
    "#111827"
  );
}

export function getZoneHatchingWeight(feature: DroMapFeature) {
  return clamp(
    Number(feature.properties?.style?.zoneHatchingWeight ?? 2),
    MIN_ZONE_HATCHING_WEIGHT,
    MAX_ZONE_HATCHING_WEIGHT,
  );
}

export function getZoneHatchingSpacing(feature: DroMapFeature) {
  return clamp(
    Number(feature.properties?.style?.zoneHatchingSpacing ?? 14),
    MIN_ZONE_HATCHING_SPACING,
    MAX_ZONE_HATCHING_SPACING,
  );
}

export function getZoneDotsEnabled(feature: DroMapFeature) {
  const explicitValue = feature.properties?.style?.zoneDotsEnabled;

  if (typeof explicitValue === "boolean") {
    return explicitValue;
  }

  return isLegacyDotsMode(feature);
}

export function getZoneDotsColor(feature: DroMapFeature) {
  return (
    feature.properties?.style?.zoneDotsColor ??
    (isLegacyDotsMode(feature)
      ? feature.properties?.style?.zoneHatchingColor
      : undefined) ??
    feature.properties?.style?.color ??
    "#111827"
  );
}

export function getZoneDotsRadius(feature: DroMapFeature) {
  const fallback = isLegacyDotsMode(feature)
    ? Number(feature.properties?.style?.zoneHatchingWeight ?? 2) * 0.6
    : 2;

  return clamp(
    Number(feature.properties?.style?.zoneDotsRadius ?? fallback),
    MIN_ZONE_DOTS_RADIUS,
    MAX_ZONE_DOTS_RADIUS,
  );
}

export function getZoneDotsSpacing(feature: DroMapFeature) {
  const fallback = isLegacyDotsMode(feature)
    ? Number(feature.properties?.style?.zoneHatchingSpacing ?? 14)
    : 14;

  return clamp(
    Number(feature.properties?.style?.zoneDotsSpacing ?? fallback),
    MIN_ZONE_DOTS_SPACING,
    MAX_ZONE_DOTS_SPACING,
  );
}

export function getZoneVisibleFillOpacity(feature: DroMapFeature) {
  if (!getZoneFillEnabled(feature)) {
    return 0;
  }

  return clamp(Number(feature.properties?.style?.fillOpacity ?? 0.3), 0, 1);
}

export function getZoneVisibleStrokeOpacity(feature: DroMapFeature) {
  if (!getZoneStrokeEnabled(feature)) {
    return 0;
  }

  return clamp(Number(feature.properties?.style?.opacity ?? 1), 0, 1);
}
