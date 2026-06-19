import type { DroMapFeature } from "@/lib/dromap/feature";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import {
  getGeoJsonLayerLoadedDisplayData,
  type DromapGeoJsonFeature,
  type DromapGeoJsonGeometry,
  type DromapGeoJsonLayer,
} from "@/stores/editor-test-geojson-layers";
import { getEffectiveGeoJsonFeatureStyle } from "./geojson-layer-style";

import {
  DEFAULT_LEGEND_SECTION_LABEL,
  type LegendEntry,
} from "./legend-entry";

export type GeoJsonLayerLegendKind = "points" | "lines" | "zones";

type GeoJsonLayerLegendKindInfo = {
  kind: GeoJsonLayerLegendKind;
  count: number;
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

function findRepresentativeGeoJsonFeature(
  layer: DromapGeoJsonLayer,
  kind: GeoJsonLayerLegendKind,
  workspaceBounds?: WorkspaceBounds | null,
): DromapGeoJsonFeature | null {
  return (
    getGeoJsonLayerLoadedDisplayData(layer, workspaceBounds).features.find(
      (feature) => geometryKind(feature.geometry) === kind,
    ) ?? null
  );
}

export function getGeoJsonLayerLegendKinds(
  layer: DromapGeoJsonLayer,
  workspaceBounds?: WorkspaceBounds | null,
): GeoJsonLayerLegendKindInfo[] {
  const counts: Record<GeoJsonLayerLegendKind, number> = {
    points: 0,
    lines: 0,
    zones: 0,
  };

  for (const feature of getGeoJsonLayerLoadedDisplayData(layer, workspaceBounds).features) {
    counts[geometryKind(feature.geometry)] += 1;
  }

  return (["zones", "lines", "points"] as const)
    .map((kind) => ({ kind, count: counts[kind] }))
    .filter((item) => item.count > 0);
}

export function getGeoJsonLayerLegendId(
  layerId: string,
  kind: GeoJsonLayerLegendKind,
) {
  return `geojson-layer-legend:${layerId}:${kind}`;
}

export function getGeoJsonLayerLegendDedupeKey(
  layerId: string,
  kind: GeoJsonLayerLegendKind,
) {
  return `geojson-layer:${layerId}:${kind}`;
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
  layer: DromapGeoJsonLayer,
  kind: GeoJsonLayerLegendKind,
  workspaceBounds?: WorkspaceBounds | null,
): DroMapFeature {
  const sourceFeature = findRepresentativeGeoJsonFeature(layer, kind, workspaceBounds);
  const style = getEffectiveGeoJsonFeatureStyle(layer, sourceFeature);
  const layerOpacity = clamp01(layer.opacity);
  const strokeOpacity = clamp01(style.strokeOpacity * layerOpacity);
  const fillOpacity = clamp01(style.fillOpacity * layerOpacity);
  const id = getGeoJsonLayerLegendId(layer.id, kind);
  const label = layer.name;

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

    const kinds = getGeoJsonLayerLegendKinds(layer, options.workspaceBounds);

    for (const item of kinds) {
      const id = getGeoJsonLayerLegendId(layer.id, item.kind);

      if (hiddenFeatureIds.has(id)) {
        continue;
      }

      const dedupeKey = getGeoJsonLayerLegendDedupeKey(layer.id, item.kind);
      const customLabel = options.legendGroupLabels?.[dedupeKey];
      const customSection = options.legendGroupSections?.[dedupeKey];
      const representativeFeature = createRepresentativeFeature(
        layer,
        item.kind,
        options.workspaceBounds,
      );

      entries.push({
        id,
        dedupeKey,
        label:
          typeof customLabel === "string" && customLabel.trim()
            ? customLabel.trim()
            : getDefaultLegendLabel(layer, item.kind, kinds.length),
        section: normalizeSectionLabel(customSection),
        typeLabel: getKindTypeLabel(item.kind),
        representativeFeature,
        features: [],
        featureIds: [id],
        count: item.count,
      });
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
