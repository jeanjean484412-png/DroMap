export type DroMapDashStyle = "solid" | "dashed" | "dotted";

type FeatureWithStyle = {
  properties?: {
    style?: {
      weight?: number;
      dashStyle?: string;
      markerSize?: number;
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
export const MAX_MARKER_SIZE = 42;

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

export function getLeafletDashArray(
  feature: FeatureWithStyle,
): string | undefined {
  const dashStyle = getFeatureDashStyle(feature);
  const weight = Number(feature.properties?.style?.weight ?? 2);

  if (dashStyle === "solid") {
    return undefined;
  }

  if (dashStyle === "dashed") {
    return `${Math.max(8, weight * 4)} ${Math.max(6, weight * 2.2)}`;
  }

  return `0.001 ${Math.max(6, weight * 2.8)}`;
}

export function getFeatureMarkerSize(feature: FeatureWithStyle): number {
  const rawValue = Number(feature.properties?.style?.markerSize);

  if (!Number.isFinite(rawValue)) {
    return DEFAULT_MARKER_SIZE;
  }

  return Math.min(MAX_MARKER_SIZE, Math.max(MIN_MARKER_SIZE, rawValue));
}