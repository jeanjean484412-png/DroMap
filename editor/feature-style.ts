export type DroMapDashStyle = "solid" | "dashed" | "dotted";

type FeatureWithStyle = {
  properties?: {
    style?: {
      weight?: number;
      dashStyle?: string;
      dashLength?: number;
      dashGap?: number;
      markerSize?: number;
      renderScale?: number;
    };
  };
};

export const DROMAP_DASH_STYLES: {
  value: DroMapDashStyle;
  label: string;
}[] = [
  { value: "solid", label: "Plein" },
  { value: "dashed", label: "Tirets" },
  { value: "dotted", label: "Pointillés" },
];

export const DEFAULT_MARKER_SIZE = 18;
export const MIN_MARKER_SIZE = 8;
export const MAX_MARKER_SIZE = 120;

export function getFeatureDashStyle(feature: FeatureWithStyle): DroMapDashStyle {
  const rawValue = feature.properties?.style?.dashStyle;

  if (rawValue === "dashed" || rawValue === "dotted" || rawValue === "solid") {
    return rawValue;
  }

  return "solid";
}

export function getCssBorderStyle(feature: FeatureWithStyle) {
  const dashStyle = getFeatureDashStyle(feature);

  if (dashStyle === "dashed") return "dashed";
  if (dashStyle === "dotted") return "dotted";

  return "solid";
}

export const MIN_DASH_LENGTH = 2;
export const MAX_DASH_LENGTH = 48;
export const MIN_DASH_GAP = 2;
export const MAX_DASH_GAP = 48;
export const DEFAULT_DASH_LENGTH = 12;
export const DEFAULT_DASH_GAP = 8;
export const DEFAULT_DOT_GAP = 8;

export function getFeatureDashLength(feature: FeatureWithStyle): number {
  const weight = Number(feature.properties?.style?.weight ?? 2);
  const rawValue = Number(feature.properties?.style?.dashLength);
  const fallback = Math.max(DEFAULT_DASH_LENGTH, weight * 4);

  if (!Number.isFinite(rawValue)) {
    return Math.min(MAX_DASH_LENGTH, Math.max(MIN_DASH_LENGTH, fallback));
  }

  return Math.min(MAX_DASH_LENGTH, Math.max(MIN_DASH_LENGTH, rawValue));
}

export function getFeatureDashGap(feature: FeatureWithStyle): number {
  const weight = Number(feature.properties?.style?.weight ?? 2);
  const rawValue = Number(feature.properties?.style?.dashGap);
  const fallback =
    getFeatureDashStyle(feature) === "dotted"
      ? Math.max(DEFAULT_DOT_GAP, weight * 2.8)
      : Math.max(DEFAULT_DASH_GAP, weight * 2.2);

  if (!Number.isFinite(rawValue)) {
    return Math.min(MAX_DASH_GAP, Math.max(MIN_DASH_GAP, fallback));
  }

  return Math.min(MAX_DASH_GAP, Math.max(MIN_DASH_GAP, rawValue));
}

export function getLeafletDashArray(
  feature: FeatureWithStyle,
): string | undefined {
  const dashStyle = getFeatureDashStyle(feature);

  if (dashStyle === "solid") {
    return undefined;
  }

  if (dashStyle === "dashed") {
    return `${getFeatureDashLength(feature)} ${getFeatureDashGap(feature)}`;
  }

  return `0.001 ${getFeatureDashGap(feature)}`;
}

export function getFeatureMarkerSize(feature: FeatureWithStyle): number {
  const rawValue = Number(feature.properties?.style?.markerSize);
  const renderScale = Number(feature.properties?.style?.renderScale);

  if (!Number.isFinite(rawValue)) {
    return DEFAULT_MARKER_SIZE;
  }

  if (Number.isFinite(renderScale)) {
    return Math.min(4096, Math.max(0.5, rawValue));
  }

  return Math.min(MAX_MARKER_SIZE, Math.max(MIN_MARKER_SIZE, rawValue));
}
