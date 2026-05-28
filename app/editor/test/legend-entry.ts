import {
  isFreehandLineFeature,
  type DroMapFeature,
  type DroMapFeatureStyle,
} from "@/lib/dromap/feature";

import { getFeatureDashStyle, getFeatureMarkerSize } from "./feature-style";
import { getFeatureMarkerSymbol } from "./marker-symbol";

export const DEFAULT_LEGEND_SECTION_LABEL = "Général";

export type LegendEntry = {
  id: string;
  dedupeKey: string;
  label: string;
  section: string;
  typeLabel: string;
  representativeFeature: DroMapFeature;
  features: DroMapFeature[];
  featureIds: string[];
  count: number;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function normalizeString(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : fallback;
}

function normalizeNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return numberValue;
}

function normalizeBoolean(value: unknown) {
  return value === true;
}

function normalizeSectionLabel(section: unknown) {
  if (typeof section !== "string") {
    return DEFAULT_LEGEND_SECTION_LABEL;
  }

  const trimmedSection = section.trim();

  return trimmedSection.length > 0 ? trimmedSection : DEFAULT_LEGEND_SECTION_LABEL;
}

function getFeatureTypeLabel(feature: DroMapFeature) {
  const type = feature.properties?.type;

  if (type === "text") return "Texte";
  if (type === "marker") return "Marqueur";
  if (type === "line") return "Ligne";
  if (type === "zone") return "Zone";

  return "Objet";
}

function getFallbackLegendLabel(feature: DroMapFeature) {
  const type = feature.properties?.type;

  if (type === "text") return "Texte";
  if (type === "marker") return "Marqueur";
  if (type === "line") return isFreehandLineFeature(feature) ? "Ligne libre" : "Ligne";
  if (type === "zone") return "Zone";

  return "Objet";
}

export function getLegendFeatureLabel(feature: DroMapFeature) {
  const legendLabel = feature.properties?.legendLabel;

  if (typeof legendLabel === "string" && legendLabel.trim().length > 0) {
    return legendLabel.trim();
  }

  return getFallbackLegendLabel(feature);
}

export function getLegendFeatureTypeLabel(feature: DroMapFeature) {
  return getFeatureTypeLabel(feature);
}

function getStyleKey(feature: DroMapFeature) {
  const type = feature.properties?.type;
  const style = (feature.properties?.style ?? {}) as DroMapFeatureStyle;
  const color = normalizeString(style.color, "#e63946");
  const opacity = normalizeNumber(style.opacity, 1);

  if (type === "marker") {
    return {
      color,
      opacity,
      markerSize: getFeatureMarkerSize(feature),
      symbol: getFeatureMarkerSymbol(feature),
    };
  }

  if (type === "line") {
    return {
      color,
      opacity,
      weight: normalizeNumber(style.weight, 3),
      dashStyle: getFeatureDashStyle(feature),
      arrowStart: normalizeBoolean(style.arrowStart),
      arrowEnd: normalizeBoolean(style.arrowEnd),
      lineVariant: isFreehandLineFeature(feature) ? "freehand" : "straight",
    };
  }

  if (type === "zone") {
    return {
      color,
      opacity,
      weight: normalizeNumber(style.weight, 2),
      fillColor: normalizeString(style.fillColor, color),
      fillOpacity: normalizeNumber(style.fillOpacity, 0.3),
      dashStyle: getFeatureDashStyle(feature),
    };
  }

  if (type === "text") {
    return {
      color,
      opacity,
      fontSize: normalizeNumber(style.fontSize, 22),
    };
  }

  return {
    color,
    opacity,
  };
}

export function getLegendDedupeKey(feature: DroMapFeature) {
  return stableStringify({
    type: feature.properties?.type ?? "object",
    geometryType: feature.geometry?.type ?? "unknown",
    style: getStyleKey(feature),
  });
}

export function getLegendEntries(
  features: DroMapFeature[],
  options: {
    legendGroupLabels?: Record<string, string>;
    legendGroupSections?: Record<string, string>;
    legendGroupOrder?: string[];
  } = {},
): LegendEntry[] {
  const entries: LegendEntry[] = [];
  const entryByKey = new Map<string, LegendEntry>();

  for (const feature of features) {
    const dedupeKey = getLegendDedupeKey(feature);
    const existingEntry = entryByKey.get(dedupeKey);

    if (existingEntry) {
      existingEntry.features.push(feature);
      existingEntry.featureIds.push(feature.id);
      existingEntry.count += 1;
      continue;
    }

    const hasCustomGroupLabel = Object.prototype.hasOwnProperty.call(
      options.legendGroupLabels ?? {},
      dedupeKey,
    );
    const customGroupLabel = options.legendGroupLabels?.[dedupeKey];
    const customSection = options.legendGroupSections?.[dedupeKey];

    const entry: LegendEntry = {
      id: feature.id,
      dedupeKey,
      label:
        hasCustomGroupLabel && typeof customGroupLabel === "string"
          ? customGroupLabel
          : getLegendFeatureLabel(feature),
      section: normalizeSectionLabel(customSection),
      typeLabel: getLegendFeatureTypeLabel(feature),
      representativeFeature: feature,
      features: [feature],
      featureIds: [feature.id],
      count: 1,
    };

    entryByKey.set(dedupeKey, entry);
    entries.push(entry);
  }

  const groupOrder = options.legendGroupOrder ?? [];

  if (groupOrder.length === 0) {
    return entries;
  }

  const orderIndexByKey = new Map(
    groupOrder.map((groupKey, index) => [groupKey, index]),
  );

  return [...entries].sort((firstEntry, secondEntry) => {
    const firstIndex = orderIndexByKey.get(firstEntry.dedupeKey);
    const secondIndex = orderIndexByKey.get(secondEntry.dedupeKey);

    if (typeof firstIndex === "number" && typeof secondIndex === "number") {
      return firstIndex - secondIndex;
    }

    if (typeof firstIndex === "number") {
      return -1;
    }

    if (typeof secondIndex === "number") {
      return 1;
    }

    return entries.indexOf(firstEntry) - entries.indexOf(secondEntry);
  });
}
