import type { DroMapFeature } from "@/lib/dromap/feature";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import {
  getGeoJsonLayerLoadedDisplayData,
  type DromapGeoJsonFeature,
  type DromapGeoJsonGeometry,
  type DromapGeoJsonLayer,
  type DromapGeoJsonLayerStyle,
} from "@/stores/editor-geojson-layers";
import { getGeoJsonFeatureName } from "./geojson-layer-conversion";
import { getEffectiveGeoJsonFeatureStyle } from "./geojson-layer-style";

import {
  DEFAULT_LEGEND_SECTION_LABEL,
  type LegendEntry,
} from "./legend-entry";

export type GeoJsonLayerLegendKind = "points" | "lines" | "zones";

const LEGEND_KINDS = ["zones", "lines", "points"] as const;

type GeoJsonLegendStyleGroup = {
  count: number;
  style: DromapGeoJsonLayerStyle;
  sourceFeature: DromapGeoJsonFeature;
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(0, Math.min(1, value));
}

function geometryKind(geometry: DromapGeoJsonGeometry): GeoJsonLayerLegendKind {
  if (geometry.type === "Point" || geometry.type === "MultiPoint") {
    return "points";
  }

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return "zones";
  }

  return "lines";
}

function getVisibleStyleKey(
  kind: GeoJsonLayerLegendKind,
  style: DromapGeoJsonLayerStyle,
) {
  const stroke = style.strokeOpacity > 0
    ? [style.strokeColor, style.strokeOpacity, style.strokeWeight, style.dashStyle]
    : null;
  const fill = kind === "zones" && style.fillOpacity > 0
    ? [style.fillColor, style.fillOpacity]
    : null;

  if (!stroke && !fill) return null;
  return JSON.stringify([stroke, fill, kind === "points" ? style.markerSize : null]);
}

function getGeoJsonLegendStyleGroups(
  layer: DromapGeoJsonLayer,
  workspaceBounds?: WorkspaceBounds | null,
) {
  const groups: Record<GeoJsonLayerLegendKind, Map<string, GeoJsonLegendStyleGroup>> = {
    points: new Map(),
    lines: new Map(),
    zones: new Map(),
  };
  const defaultKeys = {
    points: getVisibleStyleKey("points", layer.style),
    lines: getVisibleStyleKey("lines", layer.style),
    zones: getVisibleStyleKey("zones", layer.style),
  };
  let hasManualZoneClasses = false;

  for (const feature of getGeoJsonLayerLoadedDisplayData(layer, workspaceBounds).features) {
    const kind = geometryKind(feature.geometry);
    if (kind === "zones" && typeof feature.properties.dromap_ai_value === "number") {
      hasManualZoneClasses = true;
    }

    const style = feature.properties.dromap ? getEffectiveGeoJsonFeatureStyle(layer, feature) : layer.style;
    const key = style === layer.style ? defaultKeys[kind] : getVisibleStyleKey(kind, style);
    if (key === null) continue;

    const group = groups[kind].get(key);
    if (group) group.count += 1;
    else groups[kind].set(key, { style, sourceFeature: feature, count: 1 });
  }

  return { groups, defaultKeys, hasManualZoneClasses };
}

export function getGeoJsonLayerLegendId(
  layerId: string,
  kind: GeoJsonLayerLegendKind,
  styleKey?: string,
) {
  const id = `geojson-layer-legend:${layerId}:${kind}`;
  return styleKey ? `${id}:style:${encodeURIComponent(styleKey)}` : id;
}

export function getGeoJsonLayerLegendDedupeKey(
  layerId: string,
  kind: GeoJsonLayerLegendKind,
  styleKey?: string,
) {
  const key = `geojson-layer:${layerId}:${kind}`;
  return styleKey ? `${key}:style:${encodeURIComponent(styleKey)}` : key;
}

function getKindLabel(kind: GeoJsonLayerLegendKind) {
  if (kind === "points") return "points";
  if (kind === "zones") return "zones";
  return "lignes";
}

function getKindTypeLabel(kind: GeoJsonLayerLegendKind) {
  if (kind === "points") return "Points GeoJSON";
  if (kind === "zones") return "Zones GeoJSON";
  return "Lignes GeoJSON";
}

function getDefaultLegendLabel(
  layer: DromapGeoJsonLayer,
  kind: GeoJsonLayerLegendKind,
  kindsCount: number,
) {
  if (kindsCount <= 1) {
    return layer.name;
  }

  return `${layer.name} · ${getKindLabel(kind)}`;
}

function createRepresentativeFeature(
  id: string,
  label: string,
  kind: GeoJsonLayerLegendKind,
  style: DromapGeoJsonLayerStyle,
  layerOpacity: number,
): DroMapFeature {
  const strokeOpacity = clamp01(style.strokeOpacity * layerOpacity);
  const fillOpacity = clamp01(style.fillOpacity * layerOpacity);

  if (kind === "points") {
    return {
      type: "Feature",
      id,
      geometry: { type: "Point", coordinates: [0, 0] },
      properties: {
        type: "marker",
        label,
        legendLabel: label,
        symbol: { type: "builtin", id: "circle" },
        style: {
          color: style.strokeColor,
          opacity: strokeOpacity,
          markerSize: style.markerSize,
          markerFilled: true,
          weight: Math.max(1, style.strokeWeight),
        },
        meta: { version: 1 },
      },
    };
  }

  if (kind === "zones") {
    return {
      type: "Feature",
      id,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
      properties: {
        type: "zone",
        label,
        legendLabel: label,
        style: {
          color: style.strokeColor,
          weight: style.strokeWeight,
          opacity: strokeOpacity,
          fillColor: style.fillColor,
          fillOpacity,
          dashStyle: style.dashStyle,
          zoneStrokeEnabled: strokeOpacity > 0,
          zoneFillEnabled: fillOpacity > 0,
          zoneHatchingStyle: "none",
          zoneDotsEnabled: false,
        },
        zoneVariant: "polygon",
        meta: { version: 1 },
      },
    };
  }

  return {
    type: "Feature",
    id,
    geometry: {
      type: "LineString",
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    },
    properties: {
      type: "line",
      label,
      legendLabel: label,
      style: {
        color: style.strokeColor,
        weight: style.strokeWeight,
        opacity: strokeOpacity,
        dashStyle: style.dashStyle,
        arrowStart: false,
        arrowEnd: false,
      },
      lineVariant: "straight",
      meta: { version: 1 },
    },
  };
}

function normalizeSectionLabel(section: unknown) {
  return typeof section === "string" && section.trim()
    ? section.trim()
    : DEFAULT_LEGEND_SECTION_LABEL;
}

export function getGeoJsonLayerLegendEntries(
  layers: DromapGeoJsonLayer[],
  options: {
    legendGroupLabels?: Record<string, string>;
    legendGroupSections?: Record<string, string>;
    hiddenLegendFeatureIds?: string[];
    workspaceBounds?: WorkspaceBounds | null;
  } = {},
): LegendEntry[] {
  const hiddenFeatureIds = new Set(options.hiddenLegendFeatureIds ?? []);
  const entries: LegendEntry[] = [];

  for (const layer of layers) {
    if (layer.visible === false || layer.opacity <= 0) {
      continue;
    }

    const { groups, defaultKeys, hasManualZoneClasses } = getGeoJsonLegendStyleGroups(layer, options.workspaceBounds);
    const kinds = LEGEND_KINDS.filter((kind) => groups[kind].size > 0);

    for (const kind of kinds) {
      const styleGroups = [...groups[kind]];
      const defaultIndex = styleGroups.findIndex(([key]) => key === defaultKeys[kind]);
      if (defaultIndex > 0) {
        const [defaultGroup] = styleGroups.splice(defaultIndex, 1);
        styleGroups.unshift(defaultGroup);
      }
      const baseLabel = getDefaultLegendLabel(layer, kind, kinds.length);
      const baseDedupeKey = getGeoJsonLayerLegendDedupeKey(layer.id, kind);

      // Les classes d’une carte choroplèthe ont déjà leurs entrées personnalisées.
      const usesManualClasses = kind === "zones" && hasManualZoneClasses;
      for (const [index, [key, group]] of styleGroups.entries()) {
        if (usesManualClasses && index > 0) break;

        const styleKey = index === 0 ? undefined : key;
        const id = getGeoJsonLayerLegendId(layer.id, kind, styleKey);
        if (hiddenFeatureIds.has(id)) continue;

        const dedupeKey = getGeoJsonLayerLegendDedupeKey(layer.id, kind, styleKey);
        const customLabel = options.legendGroupLabels?.[dedupeKey];
        const customSection = options.legendGroupSections?.[dedupeKey] ?? options.legendGroupSections?.[baseDedupeKey];
        const featureName = styleKey ? getGeoJsonFeatureName(group.sourceFeature, "") : null;
        const defaultLabel = styleKey
          ? featureName ? (group.count === 1 ? featureName : `${featureName} et autres`) : `${baseLabel} · style ${index + 1}`
          : baseLabel;
        const label = typeof customLabel === "string" && customLabel.trim() ? customLabel.trim() : defaultLabel;

        entries.push({
          id,
          dedupeKey,
          label,
          section: normalizeSectionLabel(customSection),
          typeLabel: getKindTypeLabel(kind),
          representativeFeature: createRepresentativeFeature(id, label, kind, group.style, clamp01(layer.opacity)),
          features: [],
          featureIds: [id],
          count: usesManualClasses ? styleGroups.reduce((count, [, item]) => count + item.count, 0) : group.count,
        });
      }
    }
  }

  return entries;
}

export function mergeLegendEntriesWithGeoJsonLayers(
  baseEntries: LegendEntry[],
  layers: DromapGeoJsonLayer[],
  options: {
    legendGroupLabels?: Record<string, string>;
    legendGroupSections?: Record<string, string>;
    legendGroupOrder?: string[];
    hiddenLegendFeatureIds?: string[];
    workspaceBounds?: WorkspaceBounds | null;
  } = {},
) {
  const entries = [
    ...baseEntries,
    ...getGeoJsonLayerLegendEntries(layers, options),
  ];
  const groupOrder = options.legendGroupOrder ?? [];

  if (groupOrder.length === 0) {
    return entries;
  }

  const originalIndex = new Map(
    entries.map((entry, index) => [entry.dedupeKey, index]),
  );
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

    return (
      (originalIndex.get(firstEntry.dedupeKey) ?? 0) -
      (originalIndex.get(secondEntry.dedupeKey) ?? 0)
    );
  });
}
