import type { DroMapFeature, DroMapFeatureStyle } from "@/lib/dromap/feature";

const MIN_VISUAL_SCALE = 1 / 64;
const MAX_VISUAL_SCALE = 64;

let currentEditorMapZoom: number | null = null;
let editorFeatureVisualScalingEnabled = false;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function scaleNumber(
  value: unknown,
  fallback: number,
  scale: number,
  min: number,
  max: number,
) {
  const numericValue = Number(value ?? fallback);
  const baseValue = Number.isFinite(numericValue) ? numericValue : fallback;

  return clamp(baseValue * scale, min, max);
}

export function setCurrentEditorMapZoom(zoom: number | null | undefined) {
  currentEditorMapZoom = isFiniteNumber(zoom) ? zoom : null;
}

export function getCurrentEditorMapZoom() {
  return currentEditorMapZoom;
}

export function setEditorFeatureVisualScalingEnabled(enabled: boolean) {
  editorFeatureVisualScalingEnabled = enabled;
}

export function getEditorFeatureVisualScalingEnabled() {
  return editorFeatureVisualScalingEnabled;
}

export function getFeatureVisualReferenceZoom(
  feature: DroMapFeature,
  fallbackZoom: number,
) {
  const style = feature.properties?.style ?? {};
  const rawReferenceZoom =
    feature.properties?.type === "text"
      ? style.textReferenceZoom
      : style.visualReferenceZoom;

  if (isFiniteNumber(rawReferenceZoom)) {
    return rawReferenceZoom;
  }

  return isFiniteNumber(fallbackZoom) ? fallbackZoom : 0;
}

export function getFeatureVisualScale(
  feature: DroMapFeature,
  currentZoom: number,
  fallbackReferenceZoom: number,
) {
  // Avant validation d'une zone de travail, les marqueurs, lignes et zones
  // conservent une taille écran fixe. Le texte reste volontairement
  // géographique et continue donc de suivre le zoom dans tous les modes.
  if (
    feature.properties?.type !== "text" &&
    !editorFeatureVisualScalingEnabled
  ) {
    return 1;
  }

  if (!isFiniteNumber(currentZoom)) {
    return 1;
  }

  const referenceZoom = getFeatureVisualReferenceZoom(
    feature,
    fallbackReferenceZoom,
  );

  return clamp(
    2 ** (currentZoom - referenceZoom),
    MIN_VISUAL_SCALE,
    MAX_VISUAL_SCALE,
  );
}

export function ensureFeatureVisualReferenceZoom(
  feature: DroMapFeature,
  referenceZoom = currentEditorMapZoom,
): DroMapFeature {
  if (
    feature.properties?.type === "text" ||
    isFiniteNumber(feature.properties?.style?.visualReferenceZoom) ||
    !isFiniteNumber(referenceZoom)
  ) {
    return feature;
  }

  return {
    ...feature,
    properties: {
      ...feature.properties,
      style: {
        ...feature.properties.style,
        visualReferenceZoom: referenceZoom,
      },
    },
  };
}

export function scaleFeatureForVisualZoom(
  feature: DroMapFeature,
  currentZoom: number,
  fallbackReferenceZoom: number,
  options: { scaleText?: boolean } = {},
): DroMapFeature {
  const scale = getFeatureVisualScale(
    feature,
    currentZoom,
    fallbackReferenceZoom,
  );

  if (Math.abs(scale - 1) < 0.0001) {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        style: {
          ...feature.properties.style,
          renderScale: 1,
        },
      },
    };
  }

  const type = feature.properties?.type;
  const style = feature.properties?.style ?? {};
  const nextStyle: DroMapFeatureStyle = {
    ...style,
    renderScale: scale,
  };

  if (type === "marker") {
    nextStyle.markerSize = scaleNumber(style.markerSize, 18, scale, 0.5, 4096);
  } else if (type === "line") {
    nextStyle.weight = scaleNumber(style.weight, 3, scale, 0.25, 512);
  } else if (type === "zone") {
    nextStyle.weight = scaleNumber(style.weight, 2, scale, 0.25, 512);
    nextStyle.zoneHatchingWeight = scaleNumber(
      style.zoneHatchingWeight,
      2,
      scale,
      0.25,
      512,
    );
    nextStyle.zoneHatchingSpacing = scaleNumber(
      style.zoneHatchingSpacing,
      14,
      scale,
      0.5,
      4096,
    );
    nextStyle.zoneDotsRadius = scaleNumber(
      style.zoneDotsRadius,
      2,
      scale,
      0.25,
      1024,
    );
    nextStyle.zoneDotsSpacing = scaleNumber(
      style.zoneDotsSpacing,
      14,
      scale,
      0.5,
      4096,
    );
  } else if (type === "text" && options.scaleText === true) {
    nextStyle.fontSize = scaleNumber(style.fontSize, 22, scale, 1, 4096);
    nextStyle.textBorderWidth = scaleNumber(
      style.textBorderWidth,
      2,
      scale,
      0.25,
      512,
    );
  }

  return {
    ...feature,
    properties: {
      ...feature.properties,
      style: nextStyle,
    },
  };
}
