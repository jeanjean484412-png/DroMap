"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { getFeatureVisualScale } from "@/lib/dromap/feature-visual-scale";
import { useEditorTestCustomMarkersStore } from "@/stores/editor-test-custom-markers";
import {
  DEFAULT_LEGEND_SECTION,
  type ExportLegendCustomSymbol,
  type ExportLegendSymbolStyle,
  useEditorTestExportStore,
} from "@/stores/editor-test-export";

import type { LegendEntry } from "./legend-entry";
import {
  DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE,
  MAX_EXPORT_LEGEND_SYMBOL_SIZE,
  getExportLegendGlobalSymbolScale,
} from "./export-legend-layout";
import { ColorPicker } from "./color-picker";
import {
  DROMAP_BUILTIN_MARKER_SYMBOLS,
  DROMAP_MARKER_SYMBOL_CATEGORIES,
  getMarkerSymbolHtml,
} from "./marker-symbol";

const SYMBOL_KINDS: Array<{
  value: ExportLegendCustomSymbol;
  label: string;
}> = [
  { value: "marker", label: "Marqueur" },
  { value: "line", label: "Ligne" },
  { value: "arrow", label: "Flèche" },
  { value: "zone", label: "Zone" },
  { value: "text", label: "Texte" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function mergeDefinedLegendStyle(
  base: ExportLegendSymbolStyle,
  ...layers: Array<ExportLegendSymbolStyle | undefined>
): ExportLegendSymbolStyle {
  const result: ExportLegendSymbolStyle = { ...base };

  for (const layer of layers) {
    if (!layer) continue;

    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }

  return result;
}

function getEntryDefaultStyle(entry: LegendEntry): ExportLegendSymbolStyle {
  const feature = entry.representativeFeature;
  const featureStyle = feature.properties.style ?? {};
  const type = feature.properties.type;
  const kind: ExportLegendCustomSymbol =
    type === "line"
      ? featureStyle.arrowStart || featureStyle.arrowEnd
        ? "arrow"
        : "line"
      : type === "zone"
        ? "zone"
        : type === "text"
          ? "text"
          : "marker";

  return {
    kind,
    size: entry.legendSymbolSize,
    markerSymbolId:
      feature.properties.symbol?.type === "builtin"
        ? feature.properties.symbol.id
        : undefined,
    color: featureStyle.color ?? "#111827",
    opacity: featureStyle.opacity ?? 1,
    weight: featureStyle.weight ?? (kind === "zone" ? 2 : 4),
    dashStyle: featureStyle.dashStyle ?? "solid",
    dashLength: 14,
    dashGap: 8,
    dotSpacing: 10,
    fillColor: featureStyle.fillColor ?? "#ffffff",
    fillOpacity: featureStyle.fillOpacity ?? 0.45,
    markerFilled: featureStyle.markerFilled ?? true,
    arrowStart: featureStyle.arrowStart ?? false,
    arrowEnd: featureStyle.arrowEnd ?? kind === "arrow",
    zoneStrokeEnabled: featureStyle.zoneStrokeEnabled ?? true,
    zoneFillEnabled: featureStyle.zoneFillEnabled ?? true,
    zoneHatchingStyle:
      featureStyle.zoneHatchingStyle === "dots"
        ? "none"
        : (featureStyle.zoneHatchingStyle ?? "none"),
    zoneHatchingColor:
      featureStyle.zoneHatchingColor ?? featureStyle.color ?? "#111827",
    zoneHatchingWeight: featureStyle.zoneHatchingWeight ?? 2,
    zoneHatchingSpacing: featureStyle.zoneHatchingSpacing ?? 10,
    zoneDotsEnabled: featureStyle.zoneDotsEnabled ?? false,
    zoneDotsColor:
      featureStyle.zoneDotsColor ?? featureStyle.color ?? "#111827",
    zoneDotsRadius: featureStyle.zoneDotsRadius ?? 2,
    zoneDotsSpacing: featureStyle.zoneDotsSpacing ?? 10,
  };
}

function getEffectiveStyle(
  entry: LegendEntry,
  override: ExportLegendSymbolStyle | undefined,
  _globalSize: number,
): ExportLegendSymbolStyle {
  const defaults = getEntryDefaultStyle(entry);

  return mergeDefinedLegendStyle(
    {
      ...defaults,
      size:
        entry.legendSymbolSize ??
        entry.legendSymbolStyle?.size ??
        DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE,
    },
    entry.legendSymbolStyle,
    override,
    {
      size:
        override?.size ??
        entry.legendSymbolStyle?.size ??
        entry.legendSymbolSize ??
        DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE,
    },
  );
}

function getDashArray(style: ExportLegendSymbolStyle) {
  if (style.dashStyle === "dashed") {
    return `${style.dashLength ?? 14} ${style.dashGap ?? 8}`;
  }

  if (style.dashStyle === "dotted") {
    return `0 ${style.dotSpacing ?? 10}`;
  }

  return undefined;
}

function LegendEditorSymbolPreview({
  feature,
  style,
  compact = false,
  renderActualSize = false,
}: {
  feature: DroMapFeature;
  style: ExportLegendSymbolStyle;
  compact?: boolean;
  renderActualSize?: boolean;
}) {
  const rawClipId = useId();
  const clipId = `legend-editor-zone-${rawClipId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const featureStyle = feature.properties.style ?? {};
  const defaultKind: ExportLegendCustomSymbol =
    feature.properties.type === "line"
      ? featureStyle.arrowStart || featureStyle.arrowEnd
        ? "arrow"
        : "line"
      : feature.properties.type === "zone"
        ? "zone"
        : feature.properties.type === "text"
          ? "text"
          : "marker";
  const kind = style.kind ?? defaultKind;
  const requestedSize = clamp(
    style.size ?? DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE,
    12,
    MAX_EXPORT_LEGEND_SYMBOL_SIZE,
  );
  const size = renderActualSize ? requestedSize : compact ? 30 : 64;
  const color = style.color ?? featureStyle.color ?? "#111827";
  const opacity = style.opacity ?? featureStyle.opacity ?? 1;
  const weight = clamp(style.weight ?? featureStyle.weight ?? 4, 0.5, 24);
  const fixedBoxWidth = compact ? 84 : 150;
  const fixedBoxHeight = compact ? 56 : 96;
  const boxWidth = renderActualSize
    ? Math.max(fixedBoxWidth, Math.ceil(requestedSize))
    : fixedBoxWidth;
  const boxHeight = renderActualSize
    ? Math.max(fixedBoxHeight, Math.ceil(requestedSize))
    : fixedBoxHeight;

  if (kind === "marker") {
    const originalSymbol = feature.properties.symbol;
    const preserveCustomMarker =
      originalSymbol?.type === "drawn" ||
      originalSymbol?.type === "custom-image";
    const markerSymbolId = preserveCustomMarker
      ? undefined
      : (style.markerSymbolId ??
        (originalSymbol?.type === "builtin" ? originalSymbol.id : undefined));
    const previewFeature: DroMapFeature = {
      ...feature,
      geometry: { type: "Point", coordinates: [0, 0] },
      properties: {
        ...feature.properties,
        type: "marker",
        symbol: preserveCustomMarker
          ? originalSymbol
          : markerSymbolId
            ? { type: "builtin", id: markerSymbolId }
            : (originalSymbol ?? { type: "builtin", id: "circle" }),
        style: {
          ...featureStyle,
          color,
          opacity,
          weight,
          markerFilled: style.markerFilled ?? featureStyle.markerFilled ?? true,
          markerSize: size,
        },
      },
    };

    return (
      <div
        className="flex items-center justify-center overflow-visible"
        style={{ width: boxWidth, height: boxHeight }}
        dangerouslySetInnerHTML={{
          __html: getMarkerSymbolHtml(previewFeature, {
            size,
          }),
        }}
      />
    );
  }

  if (kind === "text") {
    return (
      <div
        className="flex items-center justify-center font-black"
        style={{
          width: boxWidth,
          height: boxHeight,
          color,
          opacity,
          fontSize: Math.min(size, compact ? 38 : 68),
        }}
      >
        T
      </div>
    );
  }

  if (kind === "zone") {
    const dashArray = getDashArray(style);
    const x = 10;
    const y = 10;
    const width = boxWidth - 20;
    const height = boxHeight - 20;
    const fill =
      style.zoneFillEnabled === false
        ? "none"
        : (style.fillColor ?? featureStyle.fillColor ?? "#ffffff");
    const fillOpacity =
      style.zoneFillEnabled === false
        ? 0
        : (style.fillOpacity ?? featureStyle.fillOpacity ?? 0.45);
    const hatchStyle =
      style.zoneHatchingStyle ??
      (featureStyle.zoneHatchingStyle === "dots"
        ? "none"
        : (featureStyle.zoneHatchingStyle ?? "none"));
    const hatchColor =
      style.zoneHatchingColor ?? featureStyle.zoneHatchingColor ?? color;
    const hatchWeight = clamp(
      style.zoneHatchingWeight ?? featureStyle.zoneHatchingWeight ?? 2,
      0.5,
      12,
    );
    const hatchSpacing = clamp(
      style.zoneHatchingSpacing ?? featureStyle.zoneHatchingSpacing ?? 10,
      2,
      80,
    );
    const dotsEnabled =
      style.zoneDotsEnabled ?? featureStyle.zoneDotsEnabled ?? false;
    const dotColor = style.zoneDotsColor ?? featureStyle.zoneDotsColor ?? color;
    const dotRadius = clamp(
      style.zoneDotsRadius ?? featureStyle.zoneDotsRadius ?? 2,
      0.5,
      12,
    );
    const dotSpacing = clamp(
      style.zoneDotsSpacing ?? featureStyle.zoneDotsSpacing ?? 10,
      2,
      80,
    );
    const hatchLines: ReactNode[] = [];

    if (hatchStyle === "horizontal" || hatchStyle === "vertical") {
      const limit = hatchStyle === "horizontal" ? height : width;
      for (let offset = 0; offset <= limit; offset += hatchSpacing) {
        hatchLines.push(
          hatchStyle === "horizontal" ? (
            <line
              key={`h-${offset}`}
              x1={x}
              y1={y + offset}
              x2={x + width}
              y2={y + offset}
            />
          ) : (
            <line
              key={`v-${offset}`}
              x1={x + offset}
              y1={y}
              x2={x + offset}
              y2={y + height}
            />
          ),
        );
      }
    } else if (
      hatchStyle === "diagonal-right" ||
      hatchStyle === "diagonal-left"
    ) {
      for (
        let offset = -height;
        offset <= width + height;
        offset += hatchSpacing
      ) {
        hatchLines.push(
          hatchStyle === "diagonal-right" ? (
            <line
              key={`dr-${offset}`}
              x1={x + offset}
              y1={y + height}
              x2={x + offset + height}
              y2={y}
            />
          ) : (
            <line
              key={`dl-${offset}`}
              x1={x + offset}
              y1={y}
              x2={x + offset + height}
              y2={y + height}
            />
          ),
        );
      }
    }

    const dots: ReactNode[] = [];
    if (dotsEnabled) {
      for (
        let dotY = y + dotSpacing / 2;
        dotY < y + height;
        dotY += dotSpacing
      ) {
        for (
          let dotX = x + dotSpacing / 2;
          dotX < x + width;
          dotX += dotSpacing
        ) {
          dots.push(
            <circle
              key={`${dotX}-${dotY}`}
              cx={dotX}
              cy={dotY}
              r={dotRadius}
            />,
          );
        }
      }
    }

    return (
      <svg
        width={boxWidth}
        height={boxHeight}
        viewBox={`0 0 ${boxWidth} ${boxHeight}`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={x} y={y} width={width} height={height} rx={4} />
          </clipPath>
        </defs>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={4}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke="none"
        />
        {hatchLines.length > 0 ? (
          <g
            clipPath={`url(#${clipId})`}
            stroke={hatchColor}
            strokeWidth={hatchWeight}
            strokeLinecap="round"
            opacity={0.96}
          >
            {hatchLines}
          </g>
        ) : null}
        {dots.length > 0 ? (
          <g clipPath={`url(#${clipId})`} fill={dotColor} opacity={0.98}>
            {dots}
          </g>
        ) : null}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={4}
          fill="none"
          stroke={style.zoneStrokeEnabled === false ? "none" : color}
          strokeOpacity={opacity}
          strokeWidth={weight}
          strokeDasharray={dashArray}
          strokeLinecap={style.dashStyle === "dotted" ? "round" : "butt"}
        />
      </svg>
    );
  }

  const dashArray = getDashArray(style);
  const y = boxHeight / 2;
  const startX = 10;
  const endX = boxWidth - 10;
  const arrowSize = Math.max(8, Math.min(20, weight * 2.4));
  const isFreehand = feature.properties.lineVariant === "freehand";

  return (
    <svg
      width={boxWidth}
      height={boxHeight}
      viewBox={`0 0 ${boxWidth} ${boxHeight}`}
    >
      {isFreehand ? (
        <path
          d={`M ${startX} ${y} C ${boxWidth * 0.3} ${y - 12}, ${boxWidth * 0.62} ${y + 12}, ${endX} ${y}`}
          fill="none"
          stroke={color}
          strokeOpacity={opacity}
          strokeWidth={weight}
          strokeDasharray={dashArray}
          strokeLinecap="round"
        />
      ) : (
        <line
          x1={startX}
          y1={y}
          x2={endX}
          y2={y}
          stroke={color}
          strokeOpacity={opacity}
          strokeWidth={weight}
          strokeDasharray={dashArray}
          strokeLinecap={style.dashStyle === "dotted" ? "round" : "round"}
        />
      )}
      {kind === "arrow" && (style.arrowEnd ?? true) ? (
        <path
          d={`M ${endX - arrowSize} ${y - arrowSize * 0.55} L ${endX} ${y} L ${endX - arrowSize} ${y + arrowSize * 0.55}`}
          fill="none"
          stroke={color}
          strokeOpacity={opacity}
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {kind === "arrow" && style.arrowStart ? (
        <path
          d={`M ${startX + arrowSize} ${y - arrowSize * 0.55} L ${startX} ${y} L ${startX + arrowSize} ${y + arrowSize * 0.55}`}
          fill="none"
          stroke={color}
          strokeOpacity={opacity}
          strokeWidth={weight}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

function FullLegendEditorOverview({
  entries,
  overrides,
  globalSymbolSize,
  selectedGroupKey,
  title,
  titleFontSize,
  itemFontSize,
  sectionFontSize,
  itemGap,
  labelGap,
  labelLineHeight,
  sectionGap,
  backgroundColor,
  mapMode,
  mapBorderEnabled,
  mapBorderColor,
  mapBorderWidth,
  mapBorderRadius,
  mapPadding,
  onSelect,
}: {
  entries: LegendEntry[];
  overrides: Record<string, ExportLegendSymbolStyle>;
  globalSymbolSize: number;
  selectedGroupKey: string | null;
  title: string;
  titleFontSize: number;
  itemFontSize: number;
  sectionFontSize: number;
  itemGap: number;
  labelGap: number;
  labelLineHeight: number;
  sectionGap: number;
  backgroundColor: string;
  mapMode: boolean;
  mapBorderEnabled: boolean;
  mapBorderColor: string;
  mapBorderWidth: number;
  mapBorderRadius: number;
  mapPadding: number;
  onSelect: (groupKey: string) => void;
}) {
  let previousSection: string | null = null;

  return (
    <div
      className="min-h-full rounded-2xl"
      style={{
        padding: mapMode ? mapPadding : 18,
        backgroundColor:
          mapMode && mapBorderEnabled
            ? `color-mix(in srgb, ${mapBorderColor} 72%, transparent)`
            : mapMode
              ? "transparent"
              : backgroundColor,
        border:
          mapMode && mapBorderEnabled
            ? `${mapBorderWidth}px solid color-mix(in srgb, ${mapBorderColor} 92%, transparent)`
            : mapMode
              ? "none"
              : "1px solid rgba(148, 163, 184, 0.45)",
        borderRadius: mapMode && mapBorderEnabled ? mapBorderRadius : 16,
        boxShadow:
          mapMode && mapBorderEnabled
            ? "0 2px 12px rgba(15, 23, 42, 0.12)"
            : undefined,
        textShadow: mapMode
          ? "0 0 3px rgba(255,255,255,0.98), 0 1px 2px rgba(255,255,255,0.98)"
          : undefined,
      }}
    >
      {title.trim() ? (
        <div
          className="mb-4 whitespace-pre-wrap break-words font-bold text-slate-950"
          style={{
            fontSize: titleFontSize,
            lineHeight: 1.16,
            WebkitTextStroke: mapMode
              ? "1.5px rgba(255,255,255,0.98)"
              : undefined,
            paintOrder: mapMode ? "stroke fill" : undefined,
          }}
        >
          {title}
        </div>
      ) : null}
      <div>
        {entries.map((entry, index) => {
          const showSection =
            entry.section !== DEFAULT_LEGEND_SECTION &&
            entry.section !== previousSection;
          previousSection = entry.section;
          const style = getEffectiveStyle(
            entry,
            overrides[entry.dedupeKey],
            globalSymbolSize,
          );
          const previewStyle: ExportLegendSymbolStyle = {
            ...style,
            size: clamp(
              (style.size ?? DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE) *
                getExportLegendGlobalSymbolScale(globalSymbolSize),
              12,
              MAX_EXPORT_LEGEND_SYMBOL_SIZE,
            ),
          };
          const selected = entry.dedupeKey === selectedGroupKey;

          return (
            <div
              key={entry.dedupeKey}
              style={{ marginTop: index === 0 ? 0 : itemGap }}
            >
              {showSection ? (
                <div
                  className="font-bold uppercase tracking-[0.1em] text-slate-800"
                  style={{
                    fontSize: sectionFontSize,
                    marginBottom: sectionGap,
                    WebkitTextStroke: mapMode
                      ? "1.5px rgba(255,255,255,0.98)"
                      : undefined,
                    paintOrder: mapMode ? "stroke fill" : undefined,
                  }}
                >
                  {entry.section}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(entry.dedupeKey)}
                className={`flex w-full items-center rounded-xl border text-left transition ${
                  selected
                    ? "border-indigo-500 bg-indigo-50/90 ring-2 ring-indigo-200"
                    : "border-transparent hover:border-slate-300 hover:bg-white/70"
                }`}
                style={{ gap: labelGap, padding: selected ? 6 : 5 }}
              >
                <div className="flex shrink-0 items-center justify-center overflow-visible">
                  <LegendEditorSymbolPreview
                    feature={entry.representativeFeature}
                    style={previewStyle}
                    compact
                    renderActualSize
                  />
                </div>
                <div
                  className="min-w-0 flex-1 whitespace-pre-wrap break-words font-medium text-slate-950"
                  style={{
                    fontSize: itemFontSize,
                    lineHeight: labelLineHeight,
                    overflowWrap: "anywhere",
                  }}
                >
                  {entry.label || "Sans nom"}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type AdvancedLegendPreviewScene = {
  width: number;
  height: number;
  focusRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  content: ReactNode;
};

function ExactLegendPreviewSurface({
  scene,
}: {
  scene: AdvancedLegendPreviewScene;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoomMode, setZoomMode] = useState<"fit" | "actual">("fit");

  const focusRect = scene.focusRect ?? {
    x: 0,
    y: 0,
    width: scene.width,
    height: scene.height,
  };

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateScale = () => {
      const availableWidth = Math.max(1, viewport.clientWidth - 28);
      const availableHeight = Math.max(1, viewport.clientHeight - 28);
      const nextScale = Math.min(
        1,
        availableWidth / Math.max(1, focusRect.width),
        availableHeight / Math.max(1, focusRect.height),
      );

      setFitScale(Math.max(0.08, nextScale));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [focusRect.height, focusRect.width]);

  const scale = zoomMode === "actual" ? 1 : fitScale;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <div className="text-[11px] font-medium text-slate-500">
          Légende réelle, avec seulement un peu de carte autour pour contrôler
          le contraste.
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setZoomMode("fit")}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
              zoomMode === "fit"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Ajuster
          </button>
          <button
            type="button"
            onClick={() => setZoomMode("actual")}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
              zoomMode === "actual"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            100 %
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-slate-200 p-3"
      >
        <div
          className="relative mx-auto"
          style={{
            width: focusRect.width * scale,
            height: focusRect.height * scale,
            minWidth: focusRect.width * scale,
            minHeight: focusRect.height * scale,
          }}
        >
          <div
            className="absolute left-0 top-0 overflow-hidden bg-white shadow-lg ring-1 ring-slate-300"
            style={{
              width: focusRect.width,
              height: focusRect.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              pointerEvents: "auto",
              userSelect: "none",
            }}
          >
            <div
              className="absolute"
              style={{
                left: -focusRect.x,
                top: -focusRect.y,
                width: scene.width,
                height: scene.height,
              }}
            >
              {scene.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendKindPicker({
  feature,
  style,
  value,
  onChange,
}: {
  feature: DroMapFeature;
  style: ExportLegendSymbolStyle;
  value: ExportLegendCustomSymbol;
  onChange: (value: ExportLegendCustomSymbol) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-slate-700">
        Type de figuré
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SYMBOL_KINDS.map((item) => {
          const selected = value === item.value;
          const previewStyle: ExportLegendSymbolStyle = {
            ...style,
            kind: item.value,
            // Une prévisualisation de type « Flèche » doit toujours montrer
            // au moins une pointe à l'extrémité. Sans cela, le bouton serait
            // visuellement identique au type « Ligne ».
            arrowEnd: item.value === "arrow" ? true : style.arrowEnd,
          };

          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                selected
                  ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
              aria-pressed={selected}
            >
              <span className="relative flex h-10 w-14 shrink-0 items-center justify-center overflow-visible rounded-lg bg-slate-50">
                <span
                  className="absolute left-1/2 top-1/2"
                  style={{
                    transform: "translate(-50%, -50%) scale(0.56)",
                    transformOrigin: "center",
                  }}
                >
                  <LegendEditorSymbolPreview
                    feature={feature}
                    style={previewStyle}
                    compact
                  />
                </span>
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  {item.label}
                </span>
                <span className="block text-[11px] leading-tight text-slate-500">
                  {item.value === "marker"
                    ? "Pictogramme ou symbole ponctuel"
                    : item.value === "line"
                      ? "Trait simple, plein ou rythmé"
                      : item.value === "arrow"
                        ? "Trait avec une ou deux pointes"
                        : item.value === "zone"
                          ? "Surface avec fond, contour ou motif"
                          : "Figuré typographique"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "px",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold text-slate-700">
        <span>{label}</span>
        <span className="tabular-nums text-slate-500">
          {Number.isInteger(value) ? value : value.toFixed(2)}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="w-full accent-indigo-600"
      />
    </label>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-700">
        {label}
      </span>
      <div className="grid grid-cols-[44px_1fr] gap-2">
        <ColorPicker
          value={value}
          onChange={onChange}
          ariaLabel={label}
          className="h-10 w-11"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase"
        />
      </div>
    </div>
  );
}

function MarkerPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("basic");
  const normalizedSearch = search.trim().toLowerCase();
  const options = useMemo(
    () =>
      DROMAP_BUILTIN_MARKER_SYMBOLS.filter((option) => {
        if (normalizedSearch.length > 0) {
          const haystack =
            `${option.label} ${option.keywords.join(" ")} ${option.id}`.toLowerCase();
          return haystack.includes(normalizedSearch);
        }

        return option.categoryId === category;
      }),
    [category, normalizedSearch],
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Rechercher un figuré..."
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <select
          value={category}
          onChange={(event) => {
            setCategory(event.currentTarget.value);
            setSearch("");
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {DROMAP_MARKER_SYMBOL_CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid max-h-72 grid-cols-6 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
        {options.map((option) => {
          const previewFeature: DroMapFeature = {
            type: "Feature",
            id: `picker-${option.id}`,
            geometry: { type: "Point", coordinates: [0, 0] },
            properties: {
              type: "marker",
              label: option.label,
              symbol: { type: "builtin", id: option.id },
              style: {
                color: "#111827",
                opacity: 1,
                weight: 5,
                markerSize: 22,
                markerFilled: true,
              },
              meta: { version: 1 },
            },
          };

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={`flex h-16 flex-col items-center justify-center rounded-lg border bg-white p-1 text-[9px] font-medium leading-tight hover:border-indigo-400 ${
                value === option.id
                  ? "border-indigo-500 ring-2 ring-indigo-200"
                  : "border-slate-200"
              }`}
              title={option.label}
            >
              <span
                className="mb-1 flex h-8 items-center justify-center"
                dangerouslySetInnerHTML={{
                  __html: getMarkerSymbolHtml(previewFeature, { size: 28 }),
                }}
              />
              <span className="line-clamp-2">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AdvancedLegendEditor({
  entries,
  onClose,
  previewScene,
  mapVisualZoom,
  fallbackReferenceZoom,
}: {
  entries: LegendEntry[];
  onClose: () => void;
  previewScene?: AdvancedLegendPreviewScene;
  mapVisualZoom?: number | null;
  fallbackReferenceZoom?: number | null;
}) {
  // Le contenu des marqueurs dessinés/importés vit dans un store séparé.
  // Cette souscription force l’aperçu avancé à se rafraîchir dès qu’un
  // marqueur personnalisé est créé, modifié ou retiré de la bibliothèque.
  useEditorTestCustomMarkersStore((state) => state.customMarkers);

  const legendPosition = useEditorTestExportStore(
    (state) => state.legendPosition,
  );
  const legendTitle = useEditorTestExportStore((state) => state.legendTitle);
  const legendBackgroundColor = useEditorTestExportStore(
    (state) => state.legendBackgroundColor,
  );
  const legendTitleFontSize = useEditorTestExportStore(
    (state) => state.legendTitleFontSize,
  );
  const legendItemFontSize = useEditorTestExportStore(
    (state) => state.legendItemFontSize,
  );
  const legendSectionTitleFontSize = useEditorTestExportStore(
    (state) => state.legendSectionTitleFontSize,
  );
  const legendSymbolOverrides = useEditorTestExportStore(
    (state) => state.legendSymbolOverrides,
  );
  const hiddenLegendFeatureIds = useEditorTestExportStore(
    (state) => state.hiddenLegendFeatureIds,
  );
  const hiddenLegendGroupKeys = useEditorTestExportStore(
    (state) => state.hiddenLegendGroupKeys,
  );
  const globalSymbolSize = useEditorTestExportStore(
    (state) => state.legendSymbolSize,
  );
  const legendItemGap = useEditorTestExportStore(
    (state) => state.legendItemGap,
  );
  const legendLabelGap = useEditorTestExportStore(
    (state) => state.legendLabelGap,
  );
  const legendLabelLineHeight = useEditorTestExportStore(
    (state) => state.legendLabelLineHeight,
  );
  const legendSectionGap = useEditorTestExportStore(
    (state) => state.legendSectionGap,
  );
  const legendMapBorderEnabled = useEditorTestExportStore(
    (state) => state.legendMapBorderEnabled,
  );
  const legendMapBorderColor = useEditorTestExportStore(
    (state) => state.legendMapBorderColor,
  );
  const legendMapBorderWidth = useEditorTestExportStore(
    (state) => state.legendMapBorderWidth,
  );
  const legendMapBorderRadius = useEditorTestExportStore(
    (state) => state.legendMapBorderRadius,
  );
  const legendMapPadding = useEditorTestExportStore(
    (state) => state.legendMapPadding,
  );
  const setLegendItemGap = useEditorTestExportStore(
    (state) => state.setLegendItemGap,
  );
  const setLegendLabelGap = useEditorTestExportStore(
    (state) => state.setLegendLabelGap,
  );
  const setLegendLabelLineHeight = useEditorTestExportStore(
    (state) => state.setLegendLabelLineHeight,
  );
  const setLegendSectionGap = useEditorTestExportStore(
    (state) => state.setLegendSectionGap,
  );
  const setLegendMapBorderEnabled = useEditorTestExportStore(
    (state) => state.setLegendMapBorderEnabled,
  );
  const setLegendMapBorderColor = useEditorTestExportStore(
    (state) => state.setLegendMapBorderColor,
  );
  const setLegendMapBorderWidth = useEditorTestExportStore(
    (state) => state.setLegendMapBorderWidth,
  );
  const setLegendMapBorderRadius = useEditorTestExportStore(
    (state) => state.setLegendMapBorderRadius,
  );
  const setLegendMapPadding = useEditorTestExportStore(
    (state) => state.setLegendMapPadding,
  );
  const setLegendSymbolOverride = useEditorTestExportStore(
    (state) => state.setLegendSymbolOverride,
  );
  const setLegendSymbolOverrides = useEditorTestExportStore(
    (state) => state.setLegendSymbolOverrides,
  );
  const resetLegendSymbolOverride = useEditorTestExportStore(
    (state) => state.resetLegendSymbolOverride,
  );
  const setLegendGroupLabel = useEditorTestExportStore(
    (state) => state.setLegendGroupLabel,
  );
  const setLegendGroupOrder = useEditorTestExportStore(
    (state) => state.setLegendGroupOrder,
  );
  const toggleLegendGroupVisibility = useEditorTestExportStore(
    (state) => state.toggleLegendGroupVisibility,
  );
  const toggleLegendFeatureVisibility = useEditorTestExportStore(
    (state) => state.toggleLegendFeatureVisibility,
  );
  const addCustomLegendEntry = useEditorTestExportStore(
    (state) => state.addCustomLegendEntry,
  );
  const removeCustomLegendEntry = useEditorTestExportStore(
    (state) => state.removeCustomLegendEntry,
  );
  const [search, setSearch] = useState("");
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(
    entries[0]?.dedupeKey ?? null,
  );
  const pendingCreatedGroupKeyRef = useRef<string | null>(null);
  const [alignmentPassesRemaining, setAlignmentPassesRemaining] = useState(0);

  function beginCreateEntry() {
    const id = addCustomLegendEntry({
      label: "Nouvel élément",
      section: DEFAULT_LEGEND_SECTION,
      symbol: "marker",
      color: "#111827",
      fillColor: "#ffffff",
      dashStyle: "solid",
      symbolStyle: {
        kind: "marker",
        markerSymbolId: "circle",
        color: "#111827",
        fillColor: "#ffffff",
        dashStyle: "solid",
        size: 48,
      },
    });

    // L'élément est créé immédiatement comme un élément normal de la légende.
    // Il est sélectionné afin que l'utilisateur puisse le modifier sans ouvrir
    // un second panneau ni confirmer une étape intermédiaire.
    const groupKey = `custom:${id}`;
    pendingCreatedGroupKeyRef.current = groupKey;
    setSearch("");
    setSelectedGroupKey(groupKey);
  }

  function applyLegendSizesFromCurrentMapScale() {
    const safeMapVisualZoom =
      typeof mapVisualZoom === "number" && Number.isFinite(mapVisualZoom)
        ? mapVisualZoom
        : typeof fallbackReferenceZoom === "number" &&
            Number.isFinite(fallbackReferenceZoom)
          ? fallbackReferenceZoom
          : 0;
    const safeFallbackReferenceZoom =
      typeof fallbackReferenceZoom === "number" &&
      Number.isFinite(fallbackReferenceZoom)
        ? fallbackReferenceZoom
        : safeMapVisualZoom;
    const nextOverrides = { ...legendSymbolOverrides };
    const globalSymbolScale =
      getExportLegendGlobalSymbolScale(globalSymbolSize);

    for (const entry of entries) {
      // Les éléments ajoutés manuellement n'ont pas d'équivalent sur la carte.
      if (entry.featureIds.length === 0) {
        continue;
      }

      const feature = entry.features[0] ?? entry.representativeFeature;
      const style = feature.properties.style ?? {};
      const type = feature.properties.type;
      const visualScale = getFeatureVisualScale(
        feature,
        safeMapVisualZoom,
        safeFallbackReferenceZoom,
      );
      const currentOverride = nextOverrides[entry.dedupeKey] ?? {};

      if (type === "marker") {
        nextOverrides[entry.dedupeKey] = {
          ...currentOverride,
          size: clamp(
            (Number(style.markerSize ?? DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE) *
              visualScale) /
              globalSymbolScale,
            1,
            MAX_EXPORT_LEGEND_SYMBOL_SIZE,
          ),
          weight: clamp(Number(style.weight ?? 4) * visualScale, 0.5, 512),
        };
        continue;
      }

      if (type === "text") {
        nextOverrides[entry.dedupeKey] = {
          ...currentOverride,
          size: clamp(
            (Number(style.fontSize ?? DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE) *
              visualScale) /
              globalSymbolScale,
            1,
            MAX_EXPORT_LEGEND_SYMBOL_SIZE,
          ),
          weight: clamp(
            Number(style.textBorderWidth ?? 1.5) * visualScale,
            0.5,
            512,
          ),
        };
        continue;
      }

      nextOverrides[entry.dedupeKey] = {
        ...currentOverride,
        weight: clamp(Number(style.weight ?? 3) * visualScale, 0.5, 512),
      };
    }

    setLegendSymbolOverrides(nextOverrides);
  }

  function alignLegendSizesWithMap() {
    // Plusieurs passes permettent de rester exact dans les formats fixes :
    // si la légende doit s'élargir, la carte se réduit légèrement, son zoom
    // visuel change, puis les tailles sont recalculées sur le nouveau rendu.
    setAlignmentPassesRemaining(4);
  }

  useEffect(() => {
    if (alignmentPassesRemaining <= 0) {
      return;
    }

    applyLegendSizesFromCurrentMapScale();
    setAlignmentPassesRemaining((remaining) => Math.max(0, remaining - 1));
  }, [
    alignmentPassesRemaining,
    mapVisualZoom,
    fallbackReferenceZoom,
    entries,
    legendSymbolOverrides,
    globalSymbolSize,
    setLegendSymbolOverrides,
  ]);

  function closeAdvancedEditor() {
    onClose();
  }

  useEffect(() => {
    if (
      selectedGroupKey &&
      entries.some((entry) => entry.dedupeKey === selectedGroupKey)
    ) {
      if (pendingCreatedGroupKeyRef.current === selectedGroupKey) {
        pendingCreatedGroupKeyRef.current = null;
      }
      return;
    }

    // Le parent peut avoir besoin d'un rendu pour reconstruire la liste des
    // entrées après l'ajout. Pendant ce court délai, on garde la sélection du
    // nouvel élément au lieu de revenir au premier figuré.
    if (pendingCreatedGroupKeyRef.current === selectedGroupKey) {
      return;
    }

    setSelectedGroupKey(entries[0]?.dedupeKey ?? null);
  }, [entries, selectedGroupKey]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAdvancedEditor();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;

    return entries.filter((entry) =>
      `${entry.label} ${entry.section} ${entry.typeLabel}`
        .toLowerCase()
        .includes(query),
    );
  }, [entries, search]);
  const selectedEntry =
    entries.find((entry) => entry.dedupeKey === selectedGroupKey) ?? null;
  const selectedStyle = selectedEntry
    ? getEffectiveStyle(
        selectedEntry,
        legendSymbolOverrides[selectedEntry.dedupeKey],
        globalSymbolSize,
      )
    : null;

  function patchSelected(patch: Partial<ExportLegendSymbolStyle>) {
    if (!selectedEntry) return;
    setLegendSymbolOverride(selectedEntry.dedupeKey, patch);
  }

  function isEntryHidden(entry: LegendEntry) {
    if (hiddenLegendGroupKeys.includes(entry.dedupeKey)) {
      return true;
    }

    return (
      entry.featureIds.length > 0 &&
      entry.featureIds.every((featureId) =>
        hiddenLegendFeatureIds.includes(featureId),
      )
    );
  }

  function toggleEntryVisibility(entry: LegendEntry) {
    if (hiddenLegendGroupKeys.includes(entry.dedupeKey)) {
      toggleLegendGroupVisibility(entry.dedupeKey);
      return;
    }

    const hiddenFeatureIds = new Set(hiddenLegendFeatureIds);
    const hiddenByLegacyFeatureIds =
      entry.featureIds.length > 0 &&
      entry.featureIds.every((featureId) => hiddenFeatureIds.has(featureId));

    if (hiddenByLegacyFeatureIds) {
      for (const featureId of entry.featureIds) {
        if (hiddenFeatureIds.has(featureId)) {
          toggleLegendFeatureVisibility(featureId);
        }
      }
      return;
    }

    toggleLegendGroupVisibility(entry.dedupeKey);
  }

  function moveEntry(entry: LegendEntry, direction: -1 | 1) {
    const currentIndex = entries.findIndex(
      (candidate) => candidate.dedupeKey === entry.dedupeKey,
    );
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= entries.length) {
      return;
    }

    const nextEntries = [...entries];
    [nextEntries[currentIndex], nextEntries[targetIndex]] = [
      nextEntries[targetIndex],
      nextEntries[currentIndex],
    ];
    setLegendGroupOrder(nextEntries.map((candidate) => candidate.dedupeKey));
  }

  return (
    <div
      className="dromap-advanced-legend-editor fixed inset-0 z-[4000] bg-slate-100"
      role="dialog"
      aria-modal="true"
    >
      <style jsx global>{`
        .dromap-advanced-legend-editor
          input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),
        .dromap-advanced-legend-editor textarea,
        .dromap-advanced-legend-editor select {
          color: #0f172a !important;
          background-color: #ffffff;
          opacity: 1;
        }

        .dromap-advanced-legend-editor input::placeholder,
        .dromap-advanced-legend-editor textarea::placeholder {
          color: #64748b !important;
          opacity: 1;
        }
      `}</style>
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-950">
            Édition avancée de la légende
          </h2>
          <p className="text-xs text-slate-500">
            Les modifications concernent uniquement la légende, jamais les
            objets de la carte.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={alignLegendSizesWithMap}
            disabled={alignmentPassesRemaining > 0}
            className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-70"
            title="Donner aux figurés de légende exactement les mêmes tailles visuelles que les objets correspondants sur la carte"
          >
            {alignmentPassesRemaining > 0
              ? "Alignement en cours…"
              : "Aligner les tailles sur la carte"}
          </button>
          <button
            type="button"
            onClick={beginCreateEntry}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + Ajouter un élément
          </button>
          <button
            type="button"
            onClick={closeAdvancedEditor}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Fermer
          </button>
        </div>
      </header>

      <div className="grid h-[calc(100%-4rem)] grid-cols-[330px_minmax(420px,1fr)_minmax(520px,0.95fr)] overflow-hidden">
        <aside className="min-h-0 overflow-y-auto overscroll-contain border-r border-slate-200 bg-white">
          <div className="space-y-3 border-b border-slate-200 p-4">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Rechercher un élément..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Resserrement général
              </div>
              <div className="space-y-3">
                <RangeControl
                  label="Écart vertical"
                  value={legendItemGap}
                  min={0}
                  max={40}
                  onChange={setLegendItemGap}
                />
                <RangeControl
                  label="Figuré / label"
                  value={legendLabelGap}
                  min={0}
                  max={48}
                  onChange={setLegendLabelGap}
                />
                <RangeControl
                  label="Interligne"
                  value={legendLabelLineHeight}
                  min={0.8}
                  max={1.8}
                  step={0.05}
                  suffix=""
                  onChange={setLegendLabelLineHeight}
                />
                <RangeControl
                  label="Sous-légendes"
                  value={legendSectionGap}
                  min={0}
                  max={48}
                  onChange={setLegendSectionGap}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Avec un écart vertical à 0, les éléments peuvent se toucher.
              </p>
            </div>

            {legendPosition === "map" ? (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800">
                  <span>Fond blanc translucide</span>
                  <input
                    type="checkbox"
                    checked={legendMapBorderEnabled}
                    onChange={(event) =>
                      setLegendMapBorderEnabled(event.currentTarget.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                </label>
                {legendMapBorderEnabled ? (
                  <>
                    <ColorControl
                      label="Couleur du fond et du cadre"
                      value={legendMapBorderColor}
                      onChange={setLegendMapBorderColor}
                    />
                    <RangeControl
                      label="Épaisseur du contour"
                      value={legendMapBorderWidth}
                      min={1}
                      max={12}
                      onChange={setLegendMapBorderWidth}
                    />
                    <RangeControl
                      label="Arrondi du cadre"
                      value={legendMapBorderRadius}
                      min={0}
                      max={40}
                      onChange={setLegendMapBorderRadius}
                    />
                  </>
                ) : null}
                <RangeControl
                  label="Marge intérieure"
                  value={legendMapPadding}
                  min={0}
                  max={48}
                  onChange={setLegendMapPadding}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2 p-3">
            <div className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <span>Éléments</span>
              <span>↑ ↓ ordre · × masquer</span>
            </div>
            {filteredEntries.map((entry) => {
              const style = getEffectiveStyle(
                entry,
                legendSymbolOverrides[entry.dedupeKey],
                globalSymbolSize,
              );
              const selected = entry.dedupeKey === selectedGroupKey;

              const hidden = isEntryHidden(entry);
              const entryIndex = entries.findIndex(
                (candidate) => candidate.dedupeKey === entry.dedupeKey,
              );

              return (
                <div
                  key={entry.dedupeKey}
                  className={`flex w-full items-center gap-1 rounded-xl border p-1.5 transition ${
                    selected
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  } ${hidden ? "opacity-60" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedGroupKey(entry.dedupeKey)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left"
                  >
                    <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                      <LegendEditorSymbolPreview
                        feature={entry.representativeFeature}
                        style={style}
                        compact
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {entry.label || "Sans nom"}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {entry.section} · {entry.typeLabel}
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      disabled={entryIndex <= 0}
                      onClick={() => moveEntry(entry, -1)}
                      className="flex h-6 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                      title="Monter dans la légende"
                      aria-label="Monter dans la légende"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={
                        entryIndex < 0 || entryIndex >= entries.length - 1
                      }
                      onClick={() => moveEntry(entry, 1)}
                      className="flex h-6 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                      title="Descendre dans la légende"
                      aria-label="Descendre dans la légende"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleEntryVisibility(entry)}
                      className={[
                        "flex h-6 w-7 items-center justify-center rounded-md border text-[11px] font-bold transition",
                        hidden
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
                      ].join(" ")}
                      title={
                        hidden
                          ? "Réafficher dans la légende"
                          : "Masquer dans la légende"
                      }
                      aria-label={
                        hidden
                          ? "Réafficher dans la légende"
                          : "Masquer dans la légende"
                      }
                    >
                      {hidden ? "+" : "×"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-6">
          {selectedEntry && selectedStyle ? (
            <div className="mx-auto max-w-3xl space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-5">
                  <div className="flex min-h-32 w-48 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                    <LegendEditorSymbolPreview
                      feature={selectedEntry.representativeFeature}
                      style={selectedStyle}
                    />
                  </div>
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
                    <label className="col-span-2 block">
                      <span className="mb-1 block text-xs font-semibold text-slate-700">
                        Label
                      </span>
                      <textarea
                        value={selectedEntry.label}
                        onChange={(event) =>
                          setLegendGroupLabel(
                            selectedEntry.dedupeKey,
                            event.currentTarget.value,
                          )
                        }
                        rows={2}
                        className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="col-span-2">
                      <LegendKindPicker
                        feature={selectedEntry.representativeFeature}
                        style={selectedStyle}
                        value={selectedStyle.kind ?? "marker"}
                        onChange={(kind) =>
                          patchSelected({
                            kind,
                            // Passer explicitement au type « Flèche » crée
                            // par défaut une pointe à la fin. L'utilisateur peut
                            // ensuite la désactiver ou activer la pointe de début.
                            arrowEnd:
                              kind === "arrow" ? true : selectedStyle.arrowEnd,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="col-span-2 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-950">
                      Dimensions et trait
                    </h3>
                    <p className="text-xs text-slate-500">
                      La taille du label ne change pas lorsque tu modifies ce
                      figuré.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      resetLegendSymbolOverride(selectedEntry.dedupeKey)
                    }
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Reprendre le style de la carte
                  </button>
                </div>
                <RangeControl
                  label="Taille de ce figuré uniquement"
                  value={selectedStyle.size ?? globalSymbolSize}
                  min={12}
                  max={MAX_EXPORT_LEGEND_SYMBOL_SIZE}
                  onChange={(value) => patchSelected({ size: value })}
                />
                <RangeControl
                  label="Épaisseur"
                  value={selectedStyle.weight ?? 4}
                  min={0.5}
                  max={24}
                  step={0.5}
                  onChange={(value) => patchSelected({ weight: value })}
                />
                <ColorControl
                  label="Couleur"
                  value={selectedStyle.color ?? "#111827"}
                  onChange={(value) => patchSelected({ color: value })}
                />
                <RangeControl
                  label="Opacité"
                  value={selectedStyle.opacity ?? 1}
                  min={0}
                  max={1}
                  step={0.05}
                  suffix=""
                  onChange={(value) => patchSelected({ opacity: value })}
                />
              </section>

              {selectedStyle.kind === "marker" ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 font-bold text-slate-950">Pictogramme</h3>
                  {selectedEntry.representativeFeature.properties.symbol
                    ?.type === "drawn" ||
                  selectedEntry.representativeFeature.properties.symbol
                    ?.type === "custom-image" ? (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                      <div className="flex items-center gap-4">
                        <LegendEditorSymbolPreview
                          feature={selectedEntry.representativeFeature}
                          style={{
                            ...selectedStyle,
                            markerSymbolId: undefined,
                          }}
                          compact
                        />
                        <div>
                          <strong className="block text-sm text-violet-950">
                            Marqueur personnalisé conservé
                          </strong>
                          <p className="mt-1 text-xs leading-relaxed text-violet-800">
                            Le marqueur dessiné ou importé reste affiché tel
                            quel dans l’édition avancée, la preview et les
                            exports.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <MarkerPicker
                        value={selectedStyle.markerSymbolId ?? "circle"}
                        onChange={(value) =>
                          patchSelected({ markerSymbolId: value })
                        }
                      />
                      <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedStyle.markerFilled ?? true}
                          onChange={(event) =>
                            patchSelected({
                              markerFilled: event.currentTarget.checked,
                            })
                          }
                        />
                        Forme remplie lorsque le pictogramme le permet
                      </label>
                    </>
                  )}
                </section>
              ) : null}

              {selectedStyle.kind === "line" ||
              selectedStyle.kind === "arrow" ||
              selectedStyle.kind === "zone" ? (
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-bold text-slate-950">Rythme du trait</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {(["solid", "dashed", "dotted"] as const).map(
                      (dashStyle) => (
                        <button
                          key={dashStyle}
                          type="button"
                          onClick={() => patchSelected({ dashStyle })}
                          className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                            selectedStyle.dashStyle === dashStyle
                              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {dashStyle === "solid"
                            ? "Plein"
                            : dashStyle === "dashed"
                              ? "Tirets"
                              : "Points"}
                        </button>
                      ),
                    )}
                  </div>
                  {selectedStyle.dashStyle === "dashed" ? (
                    <div className="grid grid-cols-2 gap-4">
                      <RangeControl
                        label="Longueur des tirets"
                        value={selectedStyle.dashLength ?? 14}
                        min={1}
                        max={80}
                        onChange={(value) =>
                          patchSelected({ dashLength: value })
                        }
                      />
                      <RangeControl
                        label="Espacement des tirets"
                        value={selectedStyle.dashGap ?? 8}
                        min={0}
                        max={80}
                        onChange={(value) => patchSelected({ dashGap: value })}
                      />
                    </div>
                  ) : null}
                  {selectedStyle.dashStyle === "dotted" ? (
                    <RangeControl
                      label="Espacement des points"
                      value={selectedStyle.dotSpacing ?? 10}
                      min={1}
                      max={80}
                      onChange={(value) => patchSelected({ dotSpacing: value })}
                    />
                  ) : null}
                </section>
              ) : null}

              {selectedStyle.kind === "arrow" ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 font-bold text-slate-950">
                    Pointes de flèche
                  </h3>
                  <div className="flex gap-5">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedStyle.arrowStart ?? false}
                        onChange={(event) =>
                          patchSelected({
                            arrowStart: event.currentTarget.checked,
                          })
                        }
                      />
                      Pointe au début
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedStyle.arrowEnd ?? true}
                        onChange={(event) =>
                          patchSelected({
                            arrowEnd: event.currentTarget.checked,
                          })
                        }
                      />
                      Pointe à la fin
                    </label>
                  </div>
                </section>
              ) : null}

              {selectedStyle.kind === "zone" ? (
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-bold text-slate-950">
                    Zone dans la légende
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedStyle.zoneStrokeEnabled ?? true}
                        onChange={(event) =>
                          patchSelected({
                            zoneStrokeEnabled: event.currentTarget.checked,
                          })
                        }
                      />
                      Contour
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedStyle.zoneFillEnabled ?? true}
                        onChange={(event) =>
                          patchSelected({
                            zoneFillEnabled: event.currentTarget.checked,
                          })
                        }
                      />
                      Fond
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <ColorControl
                      label="Couleur du fond"
                      value={selectedStyle.fillColor ?? "#ffffff"}
                      onChange={(value) => patchSelected({ fillColor: value })}
                    />
                    <RangeControl
                      label="Opacité du fond"
                      value={selectedStyle.fillOpacity ?? 0.45}
                      min={0}
                      max={1}
                      step={0.05}
                      suffix=""
                      onChange={(value) =>
                        patchSelected({ fillOpacity: value })
                      }
                    />
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-700">
                      Hachures
                    </span>
                    <select
                      value={selectedStyle.zoneHatchingStyle ?? "none"}
                      onChange={(event) =>
                        patchSelected({
                          zoneHatchingStyle: event.currentTarget
                            .value as ExportLegendSymbolStyle["zoneHatchingStyle"],
                        })
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="none">Aucune</option>
                      <option value="diagonal-right">Diagonales /</option>
                      <option value="diagonal-left">Diagonales \</option>
                      <option value="horizontal">Horizontales</option>
                      <option value="vertical">Verticales</option>
                    </select>
                  </label>
                  {selectedStyle.zoneHatchingStyle &&
                  selectedStyle.zoneHatchingStyle !== "none" ? (
                    <div className="grid grid-cols-3 gap-4">
                      <ColorControl
                        label="Couleur hachures"
                        value={
                          selectedStyle.zoneHatchingColor ??
                          selectedStyle.color ??
                          "#111827"
                        }
                        onChange={(value) =>
                          patchSelected({ zoneHatchingColor: value })
                        }
                      />
                      <RangeControl
                        label="Épaisseur hachures"
                        value={selectedStyle.zoneHatchingWeight ?? 2}
                        min={0.5}
                        max={12}
                        step={0.5}
                        onChange={(value) =>
                          patchSelected({ zoneHatchingWeight: value })
                        }
                      />
                      <RangeControl
                        label="Espacement hachures"
                        value={selectedStyle.zoneHatchingSpacing ?? 10}
                        min={2}
                        max={80}
                        onChange={(value) =>
                          patchSelected({ zoneHatchingSpacing: value })
                        }
                      />
                    </div>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedStyle.zoneDotsEnabled ?? false}
                      onChange={(event) =>
                        patchSelected({
                          zoneDotsEnabled: event.currentTarget.checked,
                        })
                      }
                    />
                    Ajouter des points
                  </label>
                  {selectedStyle.zoneDotsEnabled ? (
                    <div className="grid grid-cols-3 gap-4">
                      <ColorControl
                        label="Couleur des points"
                        value={
                          selectedStyle.zoneDotsColor ??
                          selectedStyle.color ??
                          "#111827"
                        }
                        onChange={(value) =>
                          patchSelected({ zoneDotsColor: value })
                        }
                      />
                      <RangeControl
                        label="Rayon des points"
                        value={selectedStyle.zoneDotsRadius ?? 2}
                        min={0.5}
                        max={12}
                        step={0.5}
                        onChange={(value) =>
                          patchSelected({ zoneDotsRadius: value })
                        }
                      />
                      <RangeControl
                        label="Espacement des points"
                        value={selectedStyle.zoneDotsSpacing ?? 10}
                        min={2}
                        max={80}
                        onChange={(value) =>
                          patchSelected({ zoneDotsSpacing: value })
                        }
                      />
                    </div>
                  ) : null}
                </section>
              ) : null}

              {selectedEntry.isCustom ? (
                <section className="flex justify-end rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <button
                    type="button"
                    onClick={() => {
                      const id = selectedEntry.dedupeKey.replace(
                        /^custom:/,
                        "",
                      );
                      removeCustomLegendEntry(id);
                    }}
                    className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Supprimer cet élément manuel
                  </button>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Sélectionne un élément à gauche.
            </div>
          )}
        </main>

        <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white p-5">
          <div className="shrink-0">
            <h3 className="font-bold text-slate-950">
              Aperçu complet de la légende
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              La légende conserve exactement ses dimensions et ses proportions
              réelles. La carte est volontairement recadrée autour d’elle pour
              que les changements restent lisibles.
            </p>
          </div>

          <div className="mt-4 min-h-0 flex flex-1 flex-col">
            {previewScene ? (
              <ExactLegendPreviewSurface scene={previewScene} />
            ) : (
              <div
                className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 p-4"
                style={{
                  background:
                    legendPosition === "map"
                      ? "linear-gradient(135deg, #dbeafe 0%, #f8fafc 38%, #dcfce7 100%)"
                      : "#f8fafc",
                }}
              >
                <FullLegendEditorOverview
                  entries={entries}
                  overrides={legendSymbolOverrides}
                  globalSymbolSize={globalSymbolSize}
                  selectedGroupKey={selectedGroupKey}
                  title={legendTitle}
                  titleFontSize={legendTitleFontSize}
                  itemFontSize={legendItemFontSize}
                  sectionFontSize={legendSectionTitleFontSize}
                  itemGap={legendItemGap}
                  labelGap={legendLabelGap}
                  labelLineHeight={legendLabelLineHeight}
                  sectionGap={legendSectionGap}
                  backgroundColor={legendBackgroundColor}
                  mapMode={legendPosition === "map"}
                  mapBorderEnabled={legendMapBorderEnabled}
                  mapBorderColor={legendMapBorderColor}
                  mapBorderWidth={legendMapBorderWidth}
                  mapBorderRadius={legendMapBorderRadius}
                  mapPadding={legendMapPadding}
                  onSelect={setSelectedGroupKey}
                />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
