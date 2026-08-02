import type {
  DroMapFeature,
  DroMapFeatureStyle,
  DroMapMarkerSymbol,
} from "@/lib/dromap/feature";
import type {
  ExportLegendCustomEntry,
  ExportLegendCustomSymbol,
  ExportLegendSymbolStyle,
} from "@/stores/editor-test-export";

import { DEFAULT_LEGEND_SECTION_LABEL, type LegendEntry } from "./legend-entry";

export function getCustomLegendGroupKey(id: string) {
  return `custom:${id}`;
}

function normalizeSection(section: string | undefined) {
  const trimmed = section?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : DEFAULT_LEGEND_SECTION_LABEL;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeDashStyle(value: unknown) {
  return value === "dashed" || value === "dotted" ? value : "solid";
}

function normalizeKind(
  value: unknown,
  fallback: ExportLegendCustomSymbol,
): ExportLegendCustomSymbol {
  return value === "line" ||
    value === "arrow" ||
    value === "zone" ||
    value === "text" ||
    value === "marker"
    ? value
    : fallback;
}

function getFeatureKind(feature: DroMapFeature): ExportLegendCustomSymbol {
  const type = feature.properties?.type;

  if (type === "line") {
    return feature.properties.style?.arrowStart ||
      feature.properties.style?.arrowEnd
      ? "arrow"
      : "line";
  }

  if (type === "zone") return "zone";
  if (type === "text") return "text";
  return "marker";
}

export function normalizeLegendSymbolStyle(
  value: Partial<ExportLegendSymbolStyle> | Record<string, unknown> | undefined,
  fallbackKind: ExportLegendCustomSymbol = "marker",
): ExportLegendSymbolStyle {
  const style = value ?? {};
  const kind = normalizeKind(style.kind, fallbackKind);

  return {
    kind,
    size:
      typeof style.size === "number" ? clamp(style.size, 12, 300) : undefined,
    markerSymbolId:
      typeof style.markerSymbolId === "string" &&
      style.markerSymbolId.trim().length > 0
        ? style.markerSymbolId
        : undefined,
    color:
      typeof style.color === "string" && style.color.trim().length > 0
        ? style.color
        : undefined,
    opacity:
      typeof style.opacity === "number"
        ? clamp(style.opacity, 0, 1)
        : undefined,
    weight:
      typeof style.weight === "number"
        ? clamp(style.weight, 0.5, 24)
        : undefined,
    dashStyle: normalizeDashStyle(style.dashStyle),
    dashLength:
      typeof style.dashLength === "number"
        ? clamp(style.dashLength, 1, 80)
        : undefined,
    dashGap:
      typeof style.dashGap === "number"
        ? clamp(style.dashGap, 0, 80)
        : undefined,
    dotSpacing:
      typeof style.dotSpacing === "number"
        ? clamp(style.dotSpacing, 1, 80)
        : undefined,
    fillColor:
      typeof style.fillColor === "string" && style.fillColor.trim().length > 0
        ? style.fillColor
        : undefined,
    fillOpacity:
      typeof style.fillOpacity === "number"
        ? clamp(style.fillOpacity, 0, 1)
        : undefined,
    markerFilled:
      typeof style.markerFilled === "boolean" ? style.markerFilled : undefined,
    arrowStart:
      typeof style.arrowStart === "boolean" ? style.arrowStart : undefined,
    arrowEnd: typeof style.arrowEnd === "boolean" ? style.arrowEnd : undefined,
    zoneStrokeEnabled:
      typeof style.zoneStrokeEnabled === "boolean"
        ? style.zoneStrokeEnabled
        : undefined,
    zoneFillEnabled:
      typeof style.zoneFillEnabled === "boolean"
        ? style.zoneFillEnabled
        : undefined,
    zoneHatchingStyle:
      style.zoneHatchingStyle === "diagonal-right" ||
      style.zoneHatchingStyle === "diagonal-left" ||
      style.zoneHatchingStyle === "horizontal" ||
      style.zoneHatchingStyle === "vertical"
        ? style.zoneHatchingStyle
        : style.zoneHatchingStyle === "none"
          ? "none"
          : undefined,
    zoneHatchingColor:
      typeof style.zoneHatchingColor === "string"
        ? style.zoneHatchingColor
        : undefined,
    zoneHatchingWeight:
      typeof style.zoneHatchingWeight === "number"
        ? clamp(style.zoneHatchingWeight, 0.5, 12)
        : undefined,
    zoneHatchingSpacing:
      typeof style.zoneHatchingSpacing === "number"
        ? clamp(style.zoneHatchingSpacing, 2, 80)
        : undefined,
    zoneDotsEnabled:
      typeof style.zoneDotsEnabled === "boolean"
        ? style.zoneDotsEnabled
        : undefined,
    zoneDotsColor:
      typeof style.zoneDotsColor === "string" ? style.zoneDotsColor : undefined,
    zoneDotsRadius:
      typeof style.zoneDotsRadius === "number"
        ? clamp(style.zoneDotsRadius, 0.5, 12)
        : undefined,
    zoneDotsSpacing:
      typeof style.zoneDotsSpacing === "number"
        ? clamp(style.zoneDotsSpacing, 2, 80)
        : undefined,
  };
}

function createBaseFeatureForKind(
  kind: ExportLegendCustomSymbol,
  id: string,
  label: string,
): DroMapFeature {
  const common = {
    type: "Feature" as const,
    id,
  };

  if (kind === "line" || kind === "arrow") {
    return {
      ...common,
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 0],
        ],
      },
      properties: {
        type: "line",
        label,
        legendLabel: label,
        lineVariant: "straight",
        style: {
          color: "#111827",
          opacity: 1,
          weight: 4,
          dashStyle: "solid",
          arrowStart: false,
          arrowEnd: kind === "arrow",
        },
        meta: { version: 1 },
      },
    };
  }

  if (kind === "zone") {
    return {
      ...common,
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
        zoneVariant: "polygon",
        style: {
          color: "#111827",
          opacity: 1,
          weight: 2,
          dashStyle: "solid",
          fillColor: "#ffffff",
          fillOpacity: 0.45,
          zoneStrokeEnabled: true,
          zoneFillEnabled: true,
          zoneHatchingStyle: "none",
          zoneDotsEnabled: false,
        },
        meta: { version: 1 },
      },
    };
  }

  if (kind === "text") {
    return {
      ...common,
      geometry: {
        type: "Point",
        coordinates: [0, 0],
      },
      properties: {
        type: "text",
        label,
        legendLabel: label,
        style: {
          color: "#111827",
          opacity: 1,
          fontSize: 22,
          textRotation: 0,
          textBackgroundEnabled: false,
          textBorderEnabled: false,
        },
        meta: { version: 1 },
      },
    };
  }

  return {
    ...common,
    geometry: {
      type: "Point",
      coordinates: [0, 0],
    },
    properties: {
      type: "marker",
      label,
      legendLabel: label,
      symbol: { type: "builtin", id: "circle" },
      style: {
        color: "#111827",
        opacity: 1,
        weight: 5,
        markerSize: 18,
        markerFilled: true,
      },
      meta: { version: 1 },
    },
  };
}

export function createLegendFeatureWithSymbolStyle(
  baseFeature: DroMapFeature,
  styleInput: Partial<ExportLegendSymbolStyle> | undefined,
): DroMapFeature {
  const fallbackKind = getFeatureKind(baseFeature);
  const style = normalizeLegendSymbolStyle(styleInput, fallbackKind);
  const kind = style.kind ?? fallbackKind;
  const base =
    kind === fallbackKind
      ? baseFeature
      : createBaseFeatureForKind(
          kind,
          `legend-style-${baseFeature.id}`,
          baseFeature.properties.label,
        );
  const baseStyle = base.properties.style ?? {};
  const nextStyle: DroMapFeatureStyle = {
    ...baseStyle,
    color: style.color ?? baseStyle.color,
    opacity: style.opacity ?? baseStyle.opacity,
    weight: style.weight ?? baseStyle.weight,
    dashStyle: style.dashStyle ?? baseStyle.dashStyle,
    fillColor: style.fillColor ?? baseStyle.fillColor,
    fillOpacity: style.fillOpacity ?? baseStyle.fillOpacity,
    markerFilled: style.markerFilled ?? baseStyle.markerFilled,
    arrowStart:
      kind === "arrow"
        ? (style.arrowStart ?? baseStyle.arrowStart ?? false)
        : false,
    arrowEnd:
      kind === "arrow" ? (style.arrowEnd ?? baseStyle.arrowEnd ?? true) : false,
    zoneStrokeEnabled: style.zoneStrokeEnabled ?? baseStyle.zoneStrokeEnabled,
    zoneFillEnabled: style.zoneFillEnabled ?? baseStyle.zoneFillEnabled,
    zoneHatchingStyle: style.zoneHatchingStyle ?? baseStyle.zoneHatchingStyle,
    zoneHatchingColor: style.zoneHatchingColor ?? baseStyle.zoneHatchingColor,
    zoneHatchingWeight:
      style.zoneHatchingWeight ?? baseStyle.zoneHatchingWeight,
    zoneHatchingSpacing:
      style.zoneHatchingSpacing ?? baseStyle.zoneHatchingSpacing,
    zoneDotsEnabled: style.zoneDotsEnabled ?? baseStyle.zoneDotsEnabled,
    zoneDotsColor: style.zoneDotsColor ?? baseStyle.zoneDotsColor,
    zoneDotsRadius: style.zoneDotsRadius ?? baseStyle.zoneDotsRadius,
    zoneDotsSpacing: style.zoneDotsSpacing ?? baseStyle.zoneDotsSpacing,
  };

  let symbol = base.properties.symbol;

  if (kind === "marker") {
    const preserveCustomMarker =
      symbol?.type === "drawn" || symbol?.type === "custom-image";

    if (!preserveCustomMarker) {
      symbol = {
        type: "builtin",
        id:
          style.markerSymbolId ??
          (symbol?.type === "builtin" ? symbol.id : "circle"),
      } satisfies DroMapMarkerSymbol;
    }
  }

  return {
    ...base,
    id: `legend-render-${baseFeature.id}`,
    properties: {
      ...base.properties,
      label: baseFeature.properties.label,
      legendLabel: baseFeature.properties.legendLabel,
      symbol,
      style: nextStyle,
    },
  };
}

function createRepresentativeFeature(
  entry: ExportLegendCustomEntry,
): DroMapFeature {
  const style = normalizeLegendSymbolStyle(
    {
      kind: entry.symbol,
      color: entry.color,
      fillColor: entry.fillColor,
      dashStyle: entry.dashStyle,
      ...(entry.symbolStyle ?? {}),
    },
    entry.symbol,
  );
  const base = createBaseFeatureForKind(
    style.kind ?? entry.symbol,
    `legend-custom-feature-${entry.id}`,
    entry.label,
  );

  return createLegendFeatureWithSymbolStyle(base, style);
}

export function createCustomLegendEntries(
  customEntries: ExportLegendCustomEntry[],
  options: {
    legendGroupLabels?: Record<string, string>;
    legendGroupSections?: Record<string, string>;
  } = {},
): LegendEntry[] {
  return customEntries.map((customEntry) => {
    const dedupeKey = getCustomLegendGroupKey(customEntry.id);
    const representativeFeature = createRepresentativeFeature(customEntry);
    const symbolStyle = normalizeLegendSymbolStyle(
      {
        kind: customEntry.symbol,
        color: customEntry.color,
        fillColor: customEntry.fillColor,
        dashStyle: customEntry.dashStyle,
        ...(customEntry.symbolStyle ?? {}),
      },
      customEntry.symbol,
    );

    return {
      id: `legend-custom-${customEntry.id}`,
      dedupeKey,
      label: options.legendGroupLabels?.[dedupeKey] ?? customEntry.label,
      section: normalizeSection(
        options.legendGroupSections?.[dedupeKey] ?? customEntry.section,
      ),
      typeLabel:
        customEntry.symbol === "marker"
          ? "Symbole"
          : customEntry.symbol === "line"
            ? "Ligne"
            : customEntry.symbol === "arrow"
              ? "Flèche"
              : customEntry.symbol === "text"
                ? "Texte"
                : "Zone",
      representativeFeature,
      features: [],
      featureIds: [],
      count: 1,
      isCustom: true,
      legendSymbolStyle: symbolStyle,
      legendSymbolSize: symbolStyle.size,
    };
  });
}

export function applyLegendSymbolOverrides(
  entries: LegendEntry[],
  overrides: Record<string, ExportLegendSymbolStyle> = {},
): LegendEntry[] {
  return entries.map((entry) => {
    const override = overrides[entry.dedupeKey];
    const mergedStyle = normalizeLegendSymbolStyle(
      {
        ...(entry.legendSymbolStyle ?? {}),
        ...(override ?? {}),
      },
      getFeatureKind(entry.representativeFeature),
    );
    const hasOverride = Boolean(entry.legendSymbolStyle) || Boolean(override);

    if (!hasOverride) {
      return entry;
    }

    return {
      ...entry,
      representativeFeature: createLegendFeatureWithSymbolStyle(
        entry.representativeFeature,
        mergedStyle,
      ),
      legendSymbolStyle: mergedStyle,
      legendSymbolSize: mergedStyle.size,
    };
  });
}

export function mergeLegendEntriesWithCustomEntries(
  entries: LegendEntry[],
  customEntries: ExportLegendCustomEntry[],
  options: {
    legendGroupLabels?: Record<string, string>;
    legendGroupSections?: Record<string, string>;
    legendGroupOrder?: string[];
    legendSymbolOverrides?: Record<string, ExportLegendSymbolStyle>;
  } = {},
) {
  const merged = [
    ...entries,
    ...createCustomLegendEntries(customEntries, options),
  ];
  const withOverrides = applyLegendSymbolOverrides(
    merged,
    options.legendSymbolOverrides,
  );
  const order = new Map(
    (options.legendGroupOrder ?? []).map((key, index) => [key, index]),
  );

  return withOverrides
    .map((entry, index) => ({ entry, index }))
    .sort((first, second) => {
      const firstOrder = order.get(first.entry.dedupeKey);
      const secondOrder = order.get(second.entry.dedupeKey);

      if (firstOrder !== undefined && secondOrder !== undefined) {
        return firstOrder - secondOrder;
      }

      if (firstOrder !== undefined) return -1;
      if (secondOrder !== undefined) return 1;
      return first.index - second.index;
    })
    .map(({ entry }) => entry);
}
