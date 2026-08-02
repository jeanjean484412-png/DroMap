"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent as ReactChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import {
  isFreehandLineFeature,
  type DroMapFeature,
} from "@/lib/dromap/feature";
import {
  useEditorTestExportStore,
  type ExportLegendMapPosition,
  type ExportLegendSymbolStyle,
  type ExportMapElementCustomPosition,
  type ExportMapElementPosition,
  type ExportNorthArrowStyle,
  type ExportScaleBarStyle,
} from "@/stores/editor-test-export";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import {
  getRenderableFeaturesForLayers,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import {
  getRenderableGeoJsonLayers,
  useEditorTestGeoJsonLayersStore,
} from "@/stores/editor-test-geojson-layers";
import { EXPORT_CAPTURE_ELEMENT_ID } from "./export-download";
import {
  EXPORT_LAYOUT_GAP,
  MAX_LEGEND_BOTTOM_HEIGHT,
  MAX_LEGEND_SIDE_WIDTH,
  MAP_LEGEND_MARGIN,
  MIN_LEGEND_BOTTOM_HEIGHT,
  MIN_LEGEND_SIDE_WIDTH,
  clampExportNumber,
  createExportLayout,
  createMapLegendTitleRect,
  getExportMapVisualZoom,
  getSafeLegendTitle,
  getVisibleLegendFeatures,
  normalizeLegendAppearance,
} from "./export-layout";
import type { ExportCanvasRect, ExportLegendAppearance } from "./export-layout";
import {
  DEFAULT_EXPORT_LEGEND_SECTION,
  MAX_EXPORT_LEGEND_SYMBOL_SIZE,
  getExportLegendGlobalSymbolScale,
  createExportLegendDisplayItems,
  createExportLegendLayout,
  getExportLegendEntrySymbolMetrics,
  getExportLegendEntrySymbolVisualHeight,
  isDefaultLegendSection,
  type ExportLegendDisplayItem,
} from "./export-legend-layout";
import { getLegendEntries, type LegendEntry } from "./legend-entry";
import { mergeLegendEntriesWithCustomEntries } from "./export-custom-legend";
import { AdvancedLegendEditor } from "./advanced-legend-editor";
import { createExportScaleBarModel } from "./export-scale";
import { createExportNorthArrowPlacement } from "./export-north-arrow";
import { mergeLegendEntriesWithGeoJsonLayers } from "./geojson-layer-legend";
import {
  getZoneDotsColor,
  getZoneDotsEnabled,
  getZoneDotsRadius,
  getZoneDotsSpacing,
  getZoneHatchingColor,
  getZoneHatchingEnabled,
  getZoneHatchingSpacing,
  getZoneHatchingStyle,
  getZoneHatchingWeight,
  getZoneStrokeEnabled,
  getZoneVisibleFillOpacity,
  getZoneVisibleStrokeOpacity,
} from "./zone-style";
import { getFeatureDashStyle, getFeatureMarkerSize } from "./feature-style";
import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { EXPORT_LEGEND_FONT_FAMILY } from "./export-text-metrics";

import { getMarkerSymbolHtml } from "./marker-symbol";
import {
  featureHasArrowEnd,
  featureHasArrowStart,
  featureHasLineArrow,
} from "./line-arrow";
import {
  getTextBackgroundColor,
  getTextBackgroundEnabled,
  getTextBackgroundOpacity,
  getTextBorderColor,
  getTextBorderEnabled,
  getTextBorderWidth,
  hexToRgba,
} from "./text-rendering";

const ExportLeafletPreview = dynamic(
  () =>
    import("./export-leaflet-preview").then(
      (module) => module.ExportLeafletPreview,
    ),
  {
    ssr: false,
    loading: () => <ExportMapPreviewFallback />,
  },
);

const MIN_PREVIEW_BASEMAP_DETAIL_ZOOM = 0;
const PREVIEW_BASEMAP_DETAIL_STEP = 0.25;
const PREVIEW_BASEMAP_DETAIL_DELTA = 1;

function formatBasemapDetailZoom(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "auto";
  }

  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatBasemapDetailDelta(value: number, base: number) {
  const delta = Math.round((value - base) * 100) / 100;

  if (Math.abs(delta) < 0.01) {
    return "base";
  }

  const formatted = Number.isInteger(delta)
    ? String(Math.abs(delta))
    : Math.abs(delta).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");

  return `${delta > 0 ? "+" : "-"}${formatted}`;
}

const EXPORT_SCALE_BAR_STYLE_OPTIONS: Array<{
  value: ExportScaleBarStyle;
  label: string;
}> = [
  { value: "alternating", label: "Alternée" },
  { value: "bar", label: "Barre pleine" },
  { value: "line", label: "Ligne graduée" },
  { value: "boxed", label: "Contour" },
];

const EXPORT_NORTH_ARROW_STYLE_OPTIONS: Array<{
  value: ExportNorthArrowStyle;
  label: string;
}> = [
  { value: "classic", label: "Classique" },
  { value: "simple", label: "Simple" },
  { value: "compass", label: "Rose des vents" },
  { value: "needle", label: "Aiguille" },
];

const EXPORT_MAP_ELEMENT_POSITION_OPTIONS: Array<{
  value: ExportMapElementPosition;
  label: string;
}> = [
  { value: "top-left", label: "Haut gauche" },
  { value: "top-right", label: "Haut droite" },
  { value: "bottom-left", label: "Bas gauche" },
  { value: "bottom-right", label: "Bas droite" },
];

const MAP_ELEMENT_MARGIN = 16;

function getMapElementPositionStyle(
  position: ExportMapElementPosition,
  collisionOffset = 0,
): CSSProperties {
  const isRight = position.endsWith("right");
  const isBottom = position.startsWith("bottom");
  const verticalOffset = MAP_ELEMENT_MARGIN + collisionOffset;

  return {
    left: isRight ? undefined : MAP_ELEMENT_MARGIN,
    right: isRight ? MAP_ELEMENT_MARGIN : undefined,
    top: isBottom ? undefined : verticalOffset,
    bottom: isBottom ? verticalOffset : undefined,
  };
}

function getFreeMapElementPositionStyle(
  position: ExportMapElementCustomPosition | null,
): CSSProperties | null {
  if (!position) return null;

  return {
    left: `${position.x * 100}%`,
    top: `${position.y * 100}%`,
    right: undefined,
    bottom: undefined,
    transform: "translate(-50%, -50%)",
  };
}

type MapElementPointerDragState = {
  pointerId: number;
  parentRect: DOMRect;
  halfWidth: number;
  halfHeight: number;
  offsetX: number;
  offsetY: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
};

function useMapElementPointerDrag(
  onPositionChange?: (position: ExportMapElementCustomPosition) => void,
) {
  const dragRef = useRef<MapElementPointerDragState | null>(null);
  const suppressClickRef = useRef(false);

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const element = event.currentTarget;
    const parent = element.parentElement;
    if (!parent) return;

    event.preventDefault();
    event.stopPropagation();
    const rect = element.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    dragRef.current = {
      pointerId: event.pointerId,
      parentRect,
      halfWidth: rect.width / 2,
      halfHeight: rect.height / 2,
      offsetX: event.clientX - centerX,
      offsetY: event.clientY - centerY,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
    element.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    const distance = Math.hypot(
      event.clientX - drag.startClientX,
      event.clientY - drag.startClientY,
    );
    if (distance > 3) drag.moved = true;

    const parentWidth = Math.max(1, drag.parentRect.width);
    const parentHeight = Math.max(1, drag.parentRect.height);
    const minX = drag.halfWidth / parentWidth;
    const maxX = 1 - minX;
    const minY = drag.halfHeight / parentHeight;
    const maxY = 1 - minY;
    const x = clampExportNumber(
      (event.clientX - drag.offsetX - drag.parentRect.left) / parentWidth,
      Math.min(minX, 0.5),
      Math.max(maxX, 0.5),
    );
    const y = clampExportNumber(
      (event.clientY - drag.offsetY - drag.parentRect.top) / parentHeight,
      Math.min(minY, 0.5),
      Math.max(maxY, 0.5),
    );
    if (typeof onPositionChange === "function") {
      onPositionChange({ x, y });
    }
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function consumeClickAfterDrag(event: ReactMouseEvent<HTMLButtonElement>) {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: finishPointerDrag,
    onPointerCancel: finishPointerDrag,
    consumeClickAfterDrag,
  };
}

type ResizeStartState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startSideWidth: number;
  startBottomHeight: number;
  scale: number;
};

type LegendOverlayMoveStartState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startLegendX: number;
  startLegendY: number;
  scale: number;
  active: boolean;
  target: HTMLElement;
};

type LegendOverlayMoveRef = {
  current: LegendOverlayMoveStartState | null;
};

type LegendPointerDragState = {
  pointerId: number;
  groupKey: string;
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  localX: number;
  localY: number;
  hasMoved: boolean;
};

type LegendMoveTarget = {
  targetSection: string;
  beforeGroupKey?: string;
};

function hexToRgb(hexColor: string) {
  const cleaned = hexColor.trim().replace("#", "");

  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return null;
  }

  return {
    r: Number.parseInt(cleaned.slice(0, 2), 16),
    g: Number.parseInt(cleaned.slice(2, 4), 16),
    b: Number.parseInt(cleaned.slice(4, 6), 16),
  };
}

function getReadableLegendTextColors(backgroundColor: string) {
  const rgb = hexToRgb(backgroundColor);

  if (!rgb) {
    return {
      titleColor: "#0f172a",
      textColor: "#1e293b",
      mutedTextColor: "#64748b",
      borderColor: "#cbd5e1",
    };
  }

  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;

  if (luminance < 0.45) {
    return {
      titleColor: "#f8fafc",
      textColor: "#e2e8f0",
      mutedTextColor: "#cbd5e1",
      borderColor: "rgba(255, 255, 255, 0.35)",
    };
  }

  return {
    titleColor: "#0f172a",
    textColor: "#1e293b",
    mutedTextColor: "#64748b",
    borderColor: "#cbd5e1",
  };
}

function getLegendSeparatorColor(backgroundColor: string) {
  const rgb = hexToRgb(backgroundColor);

  if (!rgb) {
    return "#94a3b8";
  }

  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;

  return luminance < 0.45 ? "rgba(255, 255, 255, 0.72)" : "#64748b";
}

function getFeatureColor(feature: DroMapFeature) {
  return feature.properties?.style?.color ?? "#334155";
}

function getFeatureFillColor(feature: DroMapFeature) {
  return feature.properties?.style?.fillColor ?? getFeatureColor(feature);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function getFeatureOpacity(feature: DroMapFeature) {
  const opacity = feature.properties?.style?.opacity ?? 1;

  return featureHasLineArrow(feature) && opacity <= 0.05 ? 1 : opacity;
}

function getLegendZoneFillOpacity(feature: DroMapFeature) {
  const visibleFillOpacity = getZoneVisibleFillOpacity(feature);

  if (visibleFillOpacity > 0) {
    return visibleFillOpacity;
  }

  const style = feature.properties?.style ?? {};

  if (
    feature.properties?.type === "zone" &&
    feature.properties?.zoneVariant === "boundary-fill" &&
    style.zoneFillEnabled !== false
  ) {
    return clamp01(Number(style.fillOpacity ?? 0));
  }

  return 0;
}

function getFeatureWeight(feature: DroMapFeature) {
  return feature.properties?.style?.weight ?? 3;
}

function getLegendDashStyle(feature: DroMapFeature) {
  return getFeatureDashStyle(feature);
}

function createEvenSteps(count: number, start: number, end: number) {
  if (count <= 1) return [start];

  const step = (end - start) / (count - 1);

  return Array.from({ length: count }, (_, index) => start + step * index);
}

function getLegendPreviewStrokeWeight(weight: number) {
  return Math.max(3, Math.min(weight * 1.35, 7));
}

function renderLegendPreviewLineStroke({
  feature,
  color,
  lineStartX,
  lineEndX,
  centerY,
  symbolWeight,
  freehandPath,
  symbolStyle,
}: {
  feature: DroMapFeature;
  color: string;
  lineStartX: number;
  lineEndX: number;
  centerY: number;
  symbolWeight: number;
  freehandPath: string;
  symbolStyle?: ExportLegendSymbolStyle;
}) {
  const dashStyle = symbolStyle?.dashStyle ?? getLegendDashStyle(feature);

  if (dashStyle === "solid") {
    return isFreehandLineFeature(feature) ? (
      <path
        d={freehandPath}
        fill="none"
        stroke={color}
        strokeWidth={symbolWeight}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : (
      <line
        x1={lineStartX}
        y1={centerY}
        x2={lineEndX}
        y2={centerY}
        stroke={color}
        strokeWidth={symbolWeight}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (dashStyle === "dotted") {
    const dotRadius = Math.max(2.1, Math.min(symbolWeight * 0.58, 3.9));
    const requestedDotSpacing = Math.max(
      dotRadius * 2 + 0.5,
      symbolStyle?.dotSpacing ?? 7,
    );
    const dotCount = Math.max(
      2,
      Math.floor((lineEndX - lineStartX) / requestedDotSpacing) + 1,
    );
    const xValues = createEvenSteps(
      dotCount,
      lineStartX + dotRadius,
      lineEndX - dotRadius,
    );

    return (
      <g fill={color}>
        {xValues.map((dotX, index) => {
          const freehandOffset = isFreehandLineFeature(feature)
            ? Math.sin(index * 1.35) * Math.max(2.2, symbolWeight * 0.55)
            : 0;

          return (
            <circle
              key={`dot-${index}`}
              cx={dotX}
              cy={centerY + freehandOffset}
              r={dotRadius}
            />
          );
        })}
      </g>
    );
  }

  const totalWidth = lineEndX - lineStartX;
  const segmentLength = Math.max(
    1,
    Math.min(symbolStyle?.dashLength ?? 14, totalWidth),
  );
  const gap = Math.max(
    0,
    symbolStyle?.dashGap ?? Math.max(5, symbolWeight * 1.15),
  );
  const segmentCount = Math.max(
    1,
    Math.floor((totalWidth + gap) / Math.max(1, segmentLength + gap)),
  );
  const usedWidth = segmentLength * segmentCount + gap * (segmentCount - 1);
  const firstX = lineStartX + Math.max(0, (totalWidth - usedWidth) / 2);

  return (
    <g
      stroke={color}
      strokeWidth={symbolWeight}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      {Array.from({ length: segmentCount }, (_, index) => {
        const x1 = firstX + index * (segmentLength + gap);
        const x2 = x1 + segmentLength;
        const offset1 = isFreehandLineFeature(feature)
          ? Math.sin(index * 1.2) * Math.max(2, symbolWeight * 0.45)
          : 0;
        const offset2 = isFreehandLineFeature(feature)
          ? Math.sin(index * 1.2 + 0.8) * Math.max(2, symbolWeight * 0.45)
          : 0;

        return (
          <line
            key={`dash-${index}`}
            x1={x1}
            y1={centerY + offset1}
            x2={x2}
            y2={centerY + offset2}
          />
        );
      })}
    </g>
  );
}

function renderLegendPreviewZoneOutline({
  feature,
  color,
  opacity,
  x,
  y,
  width,
  height,
  strokeWidth,
  symbolStyle,
}: {
  feature: DroMapFeature;
  color: string;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth: number;
  symbolStyle?: ExportLegendSymbolStyle;
}) {
  const dashStyle = symbolStyle?.dashStyle ?? getLegendDashStyle(feature);

  if (dashStyle === "solid") {
    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={2}
        fill="none"
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (dashStyle === "dotted") {
    const radius = Math.max(1.6, Math.min(strokeWidth * 0.58, 2.8));
    const spacing = Math.max(radius * 2 + 0.5, symbolStyle?.dotSpacing ?? 7);
    const topBottomCount = Math.max(2, Math.round(width / spacing) + 1);
    const sideCount = Math.max(2, Math.round(height / spacing) + 1);
    const topBottom = createEvenSteps(topBottomCount, x, x + width);
    const sides = createEvenSteps(sideCount, y, y + height).slice(1, -1);

    return (
      <g fill={color} fillOpacity={opacity}>
        {topBottom.map((dotX, index) => (
          <circle key={`top-${index}`} cx={dotX} cy={y} r={radius} />
        ))}
        {topBottom.map((dotX, index) => (
          <circle
            key={`bottom-${index}`}
            cx={dotX}
            cy={y + height}
            r={radius}
          />
        ))}
        {sides.map((dotY, index) => (
          <circle key={`left-${index}`} cx={x} cy={dotY} r={radius} />
        ))}
        {sides.map((dotY, index) => (
          <circle key={`right-${index}`} cx={x + width} cy={dotY} r={radius} />
        ))}
      </g>
    );
  }

  const segments = [];
  const horizontalGap = Math.max(
    0,
    symbolStyle?.dashGap ?? Math.max(5, width * 0.08),
  );
  const verticalGap = Math.max(
    0,
    symbolStyle?.dashGap ?? Math.max(4, height * 0.12),
  );
  const requestedLength = Math.max(1, symbolStyle?.dashLength ?? 14);
  const horizontalSegments = Math.max(
    1,
    Math.floor(
      (width + horizontalGap) / Math.max(1, requestedLength + horizontalGap),
    ),
  );
  const verticalSegments = Math.max(
    1,
    Math.floor(
      (height + verticalGap) / Math.max(1, requestedLength + verticalGap),
    ),
  );
  const horizontalLength = Math.min(
    requestedLength,
    (width - horizontalGap * (horizontalSegments - 1)) / horizontalSegments,
  );
  const verticalLength = Math.min(
    requestedLength,
    (height - verticalGap * (verticalSegments - 1)) / verticalSegments,
  );

  for (let index = 0; index < horizontalSegments; index += 1) {
    const x1 = x + index * (horizontalLength + horizontalGap);
    const x2 = x1 + horizontalLength;

    segments.push(
      <line key={`top-${index}`} x1={x1} y1={y} x2={x2} y2={y} />,
      <line
        key={`bottom-${index}`}
        x1={x1}
        y1={y + height}
        x2={x2}
        y2={y + height}
      />,
    );
  }

  for (let index = 0; index < verticalSegments; index += 1) {
    const y1 = y + index * (verticalLength + verticalGap);
    const y2 = y1 + verticalLength;

    segments.push(
      <line key={`left-${index}`} x1={x} y1={y1} x2={x} y2={y2} />,
      <line
        key={`right-${index}`}
        x1={x + width}
        y1={y1}
        x2={x + width}
        y2={y2}
      />,
    );
  }

  return (
    <g
      stroke={color}
      strokeOpacity={opacity}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    >
      {segments}
    </g>
  );
}

function rectToStyle(rect: ExportCanvasRect): CSSProperties {
  return {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function createAdvancedLegendFocusRect(
  canvasWidth: number,
  canvasHeight: number,
  legendRect: ExportCanvasRect,
  titleRect: ExportCanvasRect | null,
): ExportCanvasRect {
  const horizontalGap = titleRect
    ? Math.max(
        0,
        Math.max(legendRect.x, titleRect.x) -
          Math.min(
            legendRect.x + legendRect.width,
            titleRect.x + titleRect.width,
          ),
      )
    : 0;
  const verticalGap = titleRect
    ? Math.max(
        0,
        Math.max(legendRect.y, titleRect.y) -
          Math.min(
            legendRect.y + legendRect.height,
            titleRect.y + titleRect.height,
          ),
      )
    : 0;
  const includeTitle = Boolean(
    titleRect && horizontalGap <= 140 && verticalGap <= 140,
  );
  const effectiveTitleRect = includeTitle ? titleRect : null;
  const minX = Math.min(legendRect.x, effectiveTitleRect?.x ?? legendRect.x);
  const minY = Math.min(legendRect.y, effectiveTitleRect?.y ?? legendRect.y);
  const maxX = Math.max(
    legendRect.x + legendRect.width,
    effectiveTitleRect
      ? effectiveTitleRect.x + effectiveTitleRect.width
      : legendRect.x + legendRect.width,
  );
  const maxY = Math.max(
    legendRect.y + legendRect.height,
    effectiveTitleRect
      ? effectiveTitleRect.y + effectiveTitleRect.height
      : legendRect.y + legendRect.height,
  );

  // On conserve juste assez de carte autour de la légende pour comprendre le
  // contraste et le placement, sans réduire inutilement la légende complète.
  const horizontalContext = clampExportNumber(
    Math.round((maxX - minX) * 0.18),
    54,
    120,
  );
  const verticalContext = clampExportNumber(
    Math.round((maxY - minY) * 0.18),
    54,
    110,
  );
  const x = Math.max(0, minX - horizontalContext);
  const y = Math.max(0, minY - verticalContext);
  const right = Math.min(canvasWidth, maxX + horizontalContext);
  const bottom = Math.min(canvasHeight, maxY + verticalContext);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function LegendSymbol({
  feature,
  symbolStyle,
  renderSize,
}: {
  feature: DroMapFeature;
  symbolStyle?: ExportLegendSymbolStyle;
  renderSize?: number;
}) {
  const type = feature.properties?.type;
  const color = getFeatureColor(feature);
  const opacity = getFeatureOpacity(feature);
  const weight = getFeatureWeight(feature);

  if (type === "text") {
    const hasBackground = getTextBackgroundEnabled(feature);
    const hasBorder = getTextBorderEnabled(feature);

    return (
      <span
        className="inline-flex items-center justify-center rounded font-bold"
        style={{
          width: 34,
          height: 34,
          color: hexToRgba(color, opacity),
          fontSize: 20,
          background: hasBackground
            ? hexToRgba(
                getTextBackgroundColor(feature),
                getTextBackgroundOpacity(feature),
              )
            : "#ffffff",
          border: hasBorder
            ? `${Math.max(1, Math.min(getTextBorderWidth(feature), 3))}px solid ${getTextBorderColor(feature)}`
            : "1px solid #cbd5e1",
        }}
        aria-hidden="true"
      >
        T
      </span>
    );
  }

  if (type === "marker") {
    const displaySize = clampExportNumber(
      Number(renderSize ?? getFeatureMarkerSize(feature)),
      1,
      MAX_EXPORT_LEGEND_SYMBOL_SIZE,
    );

    return (
      <span
        className="inline-flex items-center justify-center leading-none"
        style={{ width: displaySize, height: displaySize }}
        dangerouslySetInnerHTML={{
          __html: getMarkerSymbolHtml(feature, { size: displaySize }),
        }}
      />
    );
  }

  if (type === "line") {
    const symbolWeight = getLegendPreviewStrokeWeight(weight);
    const symbolWidth = 64;
    const symbolHeight = 30;
    const centerY = symbolHeight / 2;
    const startX = 3;
    const endX = symbolWidth - 3;
    const hasArrowStart = featureHasArrowStart(feature);
    const hasArrowEnd = featureHasArrowEnd(feature);
    const arrowLength = Math.max(12, Math.min(20, symbolWeight * 2.45));
    const arrowHalfHeight = Math.max(6.5, Math.min(10.5, symbolWeight * 1.35));
    const startArrowBaseX = startX + arrowLength;
    const endArrowBaseX = endX - arrowLength;
    const lineStartX = hasArrowStart
      ? startArrowBaseX - Math.max(1.4, symbolWeight * 0.42)
      : startX + Math.max(1, symbolWeight * 0.2);
    const lineEndX = hasArrowEnd
      ? endArrowBaseX + Math.max(1.4, symbolWeight * 0.42)
      : endX - Math.max(1, symbolWeight * 0.2);
    const freehandControlOffset = Math.max(5, symbolHeight * 0.18);
    const freehandPath = `M ${lineStartX} ${centerY} C ${lineStartX + (lineEndX - lineStartX) * 0.25} ${centerY - freehandControlOffset}, ${lineStartX + (lineEndX - lineStartX) * 0.48} ${centerY + freehandControlOffset}, ${lineStartX + (lineEndX - lineStartX) * 0.66} ${centerY} C ${lineStartX + (lineEndX - lineStartX) * 0.8} ${centerY - freehandControlOffset}, ${lineStartX + (lineEndX - lineStartX) * 0.92} ${centerY + freehandControlOffset * 0.65}, ${lineEndX} ${centerY}`;

    return (
      <svg
        width={symbolWidth}
        height={symbolHeight}
        viewBox={`0 0 ${symbolWidth} ${symbolHeight}`}
        aria-hidden="true"
        focusable="false"
        style={{ display: "block", overflow: "visible", opacity }}
      >
        {renderLegendPreviewLineStroke({
          feature,
          color,
          lineStartX,
          lineEndX,
          centerY,
          symbolWeight,
          freehandPath,
          symbolStyle,
        })}

        {hasArrowStart ? (
          <path
            d={`M ${startX} ${centerY} L ${startArrowBaseX} ${centerY - arrowHalfHeight} L ${startArrowBaseX} ${centerY + arrowHalfHeight} Z`}
            fill={color}
          />
        ) : null}

        {hasArrowEnd ? (
          <path
            d={`M ${endX} ${centerY} L ${endArrowBaseX} ${centerY - arrowHalfHeight} L ${endArrowBaseX} ${centerY + arrowHalfHeight} Z`}
            fill={color}
          />
        ) : null}
      </svg>
    );
  }

  const zoneX = 4;
  const zoneY = 6;
  const zoneWidth = 42;
  const zoneHeight = 22;
  const zoneStrokeWidth = Math.max(2.6, Math.min(weight * 1.05, 5.6));
  const legendFillOpacity = getLegendZoneFillOpacity(feature);
  const legendFillColor = getFeatureFillColor(feature);

  const hatchingStyle = getZoneHatchingStyle(feature);
  const hatchSpacing = Math.max(
    6,
    Math.min(getZoneHatchingSpacing(feature), 10),
  );
  const hatchWeight = Math.max(
    1.1,
    Math.min(getZoneHatchingWeight(feature), 2.8),
  );
  const zoneDotsEnabled = getZoneDotsEnabled(feature);
  const zoneDotsSpacing = Math.max(
    7,
    Math.min(getZoneDotsSpacing(feature), 12),
  );
  const zoneDotsRadius = Math.max(
    1.5,
    Math.min(getZoneDotsRadius(feature), 2.8),
  );
  const hatchLines = [];
  const hatchDots = [];
  const clipId = `dromap-preview-zone-symbol-${feature.id}`;

  if (getZoneHatchingEnabled(feature)) {
    for (
      let offset = -zoneHeight;
      offset <= zoneWidth + zoneHeight;
      offset += hatchSpacing
    ) {
      if (hatchingStyle === "horizontal") {
        hatchLines.push(
          <line
            key={offset}
            x1={zoneX}
            y1={zoneY + offset}
            x2={zoneX + zoneWidth}
            y2={zoneY + offset}
          />,
        );
      } else if (hatchingStyle === "vertical") {
        hatchLines.push(
          <line
            key={offset}
            x1={zoneX + offset}
            y1={zoneY}
            x2={zoneX + offset}
            y2={zoneY + zoneHeight}
          />,
        );
      } else if (hatchingStyle === "diagonal-left") {
        hatchLines.push(
          <line
            key={offset}
            x1={zoneX + offset}
            y1={zoneY}
            x2={zoneX + offset + zoneHeight}
            y2={zoneY + zoneHeight}
          />,
        );
      } else {
        hatchLines.push(
          <line
            key={offset}
            x1={zoneX + offset}
            y1={zoneY + zoneHeight}
            x2={zoneX + offset + zoneHeight}
            y2={zoneY}
          />,
        );
      }
    }
  }

  if (zoneDotsEnabled) {
    const startY = zoneY + zoneDotsRadius + 2;
    const endY = zoneY + zoneHeight - zoneDotsRadius - 2;
    const startX = zoneX + zoneDotsRadius + 3;
    const endX = zoneX + zoneWidth - zoneDotsRadius - 3;

    for (let y = startY; y <= endY; y += zoneDotsSpacing) {
      const rowIndex = Math.round((y - startY) / zoneDotsSpacing);
      const rowOffset = rowIndex % 2 === 0 ? 0 : zoneDotsSpacing / 2;

      for (let x = startX + rowOffset; x <= endX; x += zoneDotsSpacing) {
        hatchDots.push(
          <circle key={`${x}-${y}`} cx={x} cy={y} r={zoneDotsRadius} />,
        );
      }
    }
  }

  return (
    <svg
      width={50}
      height={34}
      viewBox="0 0 50 34"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x={zoneX}
            y={zoneY}
            width={zoneWidth}
            height={zoneHeight}
            rx={2}
          />
        </clipPath>
      </defs>

      {legendFillOpacity > 0 ? (
        <rect
          x={zoneX}
          y={zoneY}
          width={zoneWidth}
          height={zoneHeight}
          rx={2}
          fill={legendFillColor}
          fillOpacity={Math.max(0.16, legendFillOpacity)}
        />
      ) : null}

      {hatchLines.length > 0 ? (
        <g
          clipPath={`url(#${clipId})`}
          stroke={getZoneHatchingColor(feature)}
          strokeWidth={hatchWeight}
          strokeLinecap="round"
          opacity={0.96}
        >
          {hatchLines}
        </g>
      ) : null}

      {hatchDots.length > 0 ? (
        <g
          clipPath={`url(#${clipId})`}
          fill={getZoneDotsColor(feature)}
          opacity={0.98}
        >
          {hatchDots}
        </g>
      ) : null}

      {getZoneStrokeEnabled(feature) && getZoneVisibleStrokeOpacity(feature) > 0
        ? renderLegendPreviewZoneOutline({
            feature,
            color,
            opacity: getZoneVisibleStrokeOpacity(feature),
            x: zoneX,
            y: zoneY,
            width: zoneWidth,
            height: zoneHeight,
            strokeWidth: zoneStrokeWidth,
            symbolStyle,
          })
        : null}
    </svg>
  );
}

function EditableLegendText({
  value,
  onCommit,
  placeholder,
  className,
  style,
  multiline = false,
  liveCommit = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  multiline?: boolean;
  liveCommit?: boolean;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editingStartValueRef = useRef(value);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(value);
    }
  }, [isEditing, value]);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!multiline || !textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 1)}px`;
  }, [draftValue, multiline, style]);

  function commit() {
    setIsEditing(false);
    onCommit(draftValue);
  }

  function cancel(target: HTMLInputElement | HTMLTextAreaElement) {
    const initialValue = editingStartValueRef.current;
    setDraftValue(initialValue);
    if (liveCommit) {
      onCommit(initialValue);
    }
    setIsEditing(false);
    target.blur();
  }

  const sharedProps = {
    value: draftValue,
    placeholder,
    onFocus: () => {
      editingStartValueRef.current = value;
      setIsEditing(true);
    },
    onChange: (
      event: ReactChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      const nextValue = event.target.value;
      setDraftValue(nextValue);
      if (liveCommit) {
        onCommit(nextValue);
      }
    },
    onBlur: commit,
    onPointerDown: (
      event: ReactPointerEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      event.stopPropagation();
    },
    onClick: (
      event: ReactMouseEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      event.stopPropagation();
    },
    onKeyDown: (
      event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (event.key === "Escape") {
        cancel(event.currentTarget);
        return;
      }

      if (event.key === "Enter" && !multiline) {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
    className,
    style: {
      ...style,
      fontFamily: EXPORT_LEGEND_FONT_FAMILY,
      boxSizing: style?.boxSizing ?? ("content-box" as const),
    },
  };

  if (multiline) {
    return <textarea ref={textareaRef} {...sharedProps} rows={1} wrap="soft" />;
  }

  return <input {...sharedProps} type="text" />;
}

function ExportLegendPreview({
  title,
  entries,
  displayItems,
  rect,
  legendPosition,
  appearance,
  hiddenLegendFeatureIds,
  suspendEntryDrag = false,
  showAlwaysVisibleHideControls = false,
  onContainerPointerDownCapture,
  onContainerPointerMove,
  onContainerPointerUp,
  onTitleChange,
  onTitleRemove,
  onRenameSection,
  onEntryLabelChange,
  onEntryHide,
  onEntryMove,
  onRemoveSection,
}: {
  title: string;
  entries: LegendEntry[];
  displayItems: ExportLegendDisplayItem[];
  rect: ExportCanvasRect;
  legendPosition: "left" | "right" | "bottom" | "map";
  appearance: ExportLegendAppearance;
  hiddenLegendFeatureIds: string[];
  suspendEntryDrag?: boolean;
  showAlwaysVisibleHideControls?: boolean;
  onContainerPointerDownCapture?: (
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  onContainerPointerMove?: (event: ReactPointerEvent<HTMLElement>) => void;
  onContainerPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void;
  onTitleChange: (title: string) => void;
  onTitleRemove?: () => void;
  onRenameSection: (currentSection: string, nextSection: string) => void;
  onEntryLabelChange: (groupKey: string, label: string) => void;
  onEntryHide: (entry: LegendEntry) => void;
  onEntryMove: (input: {
    groupKey: string;
    targetSection: string;
    beforeGroupKey?: string;
  }) => void;
  onRemoveSection: (section: string) => void;
}) {
  const backgroundColor = appearance.backgroundColor;
  const titleFontSize = appearance.titleFontSize;
  const itemFontSize = appearance.itemFontSize;
  const asideRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<LegendPointerDragState | null>(null);
  const lastPointerMoveSignatureRef = useRef<string | null>(null);
  const [pointerDrag, setPointerDrag] = useState<LegendPointerDragState | null>(
    null,
  );
  const [isContainerHovered, setIsContainerHovered] = useState(false);
  const [hoveredEntryKey, setHoveredEntryKey] = useState<string | null>(null);
  const effectiveColorReference =
    legendPosition === "map" ? "#ffffff" : backgroundColor;
  const colors = getReadableLegendTextColors(effectiveColorReference);
  const separatorColor = getLegendSeparatorColor(effectiveColorReference);
  const legendLayout = createExportLegendLayout({
    legendRect: rect,
    displayItems,
    entries,
    legendPosition,
    appearance: {
      ...appearance,
      sideWidth: rect.width,
      bottomHeight: rect.height,
    },
    title,
  });
  const safeTitle = getSafeLegendTitle(title);
  const draggedEntry = pointerDrag
    ? (entries.find((entry) => entry.dedupeKey === pointerDrag.groupKey) ??
      null)
    : null;

  function getLocalPoint(clientX: number, clientY: number) {
    const element = asideRef.current;

    if (!element) {
      return null;
    }

    const bounds = element.getBoundingClientRect();
    const scaleX = bounds.width > 0 ? bounds.width / rect.width : 1;
    const scaleY = bounds.height > 0 ? bounds.height / rect.height : 1;

    return {
      x: (clientX - bounds.left) / scaleX,
      y: (clientY - bounds.top) / scaleY,
    };
  }

  function getNextEntryKeyAfterVisibleItem(
    visibleItemIndex: number,
    targetSection: string,
  ) {
    const draggedGroupKey = dragStateRef.current?.groupKey ?? null;

    for (
      let nextIndex = visibleItemIndex + 1;
      nextIndex < legendLayout.visibleItems.length;
      nextIndex += 1
    ) {
      const nextLayoutItem = legendLayout.visibleItems[nextIndex];
      const nextDisplayItem = displayItems[nextLayoutItem.featureIndex];

      if (!nextDisplayItem || nextDisplayItem.type !== "entry") {
        continue;
      }

      const nextEntry = entries[nextDisplayItem.entryIndex];

      if (!nextEntry) {
        continue;
      }

      if (
        nextEntry.section === targetSection &&
        nextEntry.dedupeKey !== draggedGroupKey
      ) {
        return nextEntry.dedupeKey;
      }
    }

    return undefined;
  }

  function getBottomColumnMoveTarget(localPoint: { x: number; y: number }) {
    if (!legendLayout.isBottomSectionColumnMode) {
      return null;
    }

    const columns = new Map<
      number,
      { section: string; left: number; right: number }
    >();

    for (const item of legendLayout.visibleItems) {
      const displayItem = displayItems[item.featureIndex];

      if (!displayItem) {
        continue;
      }

      const section =
        displayItem.type === "section"
          ? displayItem.section
          : entries[displayItem.entryIndex]?.section;

      if (!section) {
        continue;
      }

      const currentColumn = columns.get(item.columnIndex);
      const left = item.x - rect.x - legendLayout.columnGap / 2;
      const right = item.x - rect.x + item.width + legendLayout.columnGap / 2;

      columns.set(item.columnIndex, {
        section,
        left: currentColumn ? Math.min(currentColumn.left, left) : left,
        right: currentColumn ? Math.max(currentColumn.right, right) : right,
      });
    }

    for (const column of columns.values()) {
      if (
        localPoint.x >= column.left &&
        localPoint.x <= column.right &&
        localPoint.y >= legendLayout.itemsTop - rect.y &&
        localPoint.y <= legendLayout.itemsBottom - rect.y
      ) {
        return { targetSection: column.section };
      }
    }

    return null;
  }

  function getMoveTargetFromPointer(
    clientX: number,
    clientY: number,
  ): LegendMoveTarget | null {
    const localPoint = getLocalPoint(clientX, clientY);

    if (!localPoint) {
      return null;
    }

    for (const [
      visibleItemIndex,
      item,
    ] of legendLayout.visibleItems.entries()) {
      const displayItem = displayItems[item.featureIndex];

      if (!displayItem) {
        continue;
      }

      const itemLeft = item.x - rect.x;
      const itemTop = item.y - rect.y;
      const itemRight = itemLeft + item.width;
      const itemBottom = itemTop + item.height;
      const isInsideItem =
        localPoint.x >= itemLeft - 4 &&
        localPoint.x <= itemRight + 4 &&
        localPoint.y >= itemTop - 4 &&
        localPoint.y <= itemBottom + 4;

      if (!isInsideItem) {
        continue;
      }

      if (displayItem.type === "section") {
        return { targetSection: displayItem.section };
      }

      const entry = entries[displayItem.entryIndex];

      if (!entry) {
        continue;
      }

      const shouldPlaceAfter = localPoint.y > itemTop + item.height / 2;

      if (shouldPlaceAfter) {
        return {
          targetSection: entry.section,
          beforeGroupKey: getNextEntryKeyAfterVisibleItem(
            visibleItemIndex,
            entry.section,
          ),
        };
      }

      return {
        targetSection: entry.section,
        beforeGroupKey: entry.dedupeKey,
      };
    }

    const isInsideLegend =
      localPoint.x >= 0 &&
      localPoint.x <= rect.width &&
      localPoint.y >= 0 &&
      localPoint.y <= rect.height;

    if (!isInsideLegend) {
      return null;
    }

    const bottomColumnTarget = getBottomColumnMoveTarget(localPoint);

    if (bottomColumnTarget) {
      return bottomColumnTarget;
    }

    return { targetSection: DEFAULT_EXPORT_LEGEND_SECTION };
  }

  function moveDraggedEntry(target: LegendMoveTarget | null) {
    const currentDragState = dragStateRef.current;

    if (!currentDragState || !target) {
      return;
    }

    if (target.beforeGroupKey === currentDragState.groupKey) {
      return;
    }

    const moveSignature = `${currentDragState.groupKey}|${target.targetSection}|${
      target.beforeGroupKey ?? "end"
    }`;

    if (lastPointerMoveSignatureRef.current === moveSignature) {
      return;
    }

    lastPointerMoveSignatureRef.current = moveSignature;
    onEntryMove({
      groupKey: currentDragState.groupKey,
      targetSection: target.targetSection,
      beforeGroupKey: target.beforeGroupKey,
    });
  }

  function stopPointerDrag(pointerId?: number) {
    const currentDragState = dragStateRef.current;

    if (
      typeof pointerId === "number" &&
      currentDragState &&
      currentDragState.pointerId !== pointerId
    ) {
      return;
    }

    if (currentDragState) {
      try {
        asideRef.current?.releasePointerCapture(currentDragState.pointerId);
      } catch {
        // La capture peut déjà être libérée si le navigateur a annulé le pointeur.
      }
    }

    dragStateRef.current = null;
    lastPointerMoveSignatureRef.current = null;
    setPointerDrag(null);
  }

  function updatePointerDrag(
    pointerId: number,
    clientX: number,
    clientY: number,
  ) {
    const currentDragState = dragStateRef.current;

    if (!currentDragState || currentDragState.pointerId !== pointerId) {
      return;
    }

    const localPoint = getLocalPoint(clientX, clientY);

    if (!localPoint) {
      return;
    }

    const distance = Math.hypot(
      clientX - currentDragState.startClientX,
      clientY - currentDragState.startClientY,
    );
    const hasMoved = currentDragState.hasMoved || distance >= 5;
    const nextDragState: LegendPointerDragState = {
      ...currentDragState,
      clientX,
      clientY,
      localX: localPoint.x,
      localY: localPoint.y,
      hasMoved,
    };

    dragStateRef.current = nextDragState;
    setPointerDrag(nextDragState);

    if (hasMoved) {
      moveDraggedEntry(getMoveTargetFromPointer(clientX, clientY));
    }
  }

  function handleEntryPointerDown(
    event: ReactPointerEvent<HTMLElement>,
    entry: LegendEntry,
  ) {
    if (suspendEntryDrag || event.button !== 0) {
      return;
    }

    const localPoint = getLocalPoint(event.clientX, event.clientY);

    if (!localPoint) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const nextDragState: LegendPointerDragState = {
      pointerId: event.pointerId,
      groupKey: entry.dedupeKey,
      startClientX: event.clientX,
      startClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      localX: localPoint.x,
      localY: localPoint.y,
      hasMoved: false,
    };

    dragStateRef.current = nextDragState;
    lastPointerMoveSignatureRef.current = null;
    setPointerDrag(nextDragState);

    try {
      asideRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Certains navigateurs peuvent refuser la capture si le pointeur a déjà changé d'état.
    }
  }

  useEffect(() => {
    if (!pointerDrag) {
      return;
    }

    function handleWindowPointerMove(event: PointerEvent) {
      if (dragStateRef.current?.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      updatePointerDrag(event.pointerId, event.clientX, event.clientY);
    }

    function handleWindowPointerUp(event: PointerEvent) {
      stopPointerDrag(event.pointerId);
    }

    function handleWindowBlur() {
      stopPointerDrag();
    }

    window.addEventListener("pointermove", handleWindowPointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [pointerDrag]);

  useEffect(() => {
    if (suspendEntryDrag) {
      stopPointerDrag();
    }
  }, [suspendEntryDrag]);

  return (
    <aside
      ref={asideRef}
      className="absolute z-[1000] overflow-visible"
      onDragStart={(event) => event.preventDefault()}
      onPointerDownCapture={onContainerPointerDownCapture}
      onPointerMove={onContainerPointerMove}
      onPointerUp={onContainerPointerUp}
      onPointerCancel={onContainerPointerUp}
      onPointerEnter={() => setIsContainerHovered(true)}
      onPointerLeave={() => {
        setIsContainerHovered(false);
        setHoveredEntryKey(null);
      }}
      style={{
        ...rectToStyle(rect),
        cursor: legendPosition === "map" ? "grab" : undefined,
        touchAction: legendPosition === "map" ? "none" : undefined,
        backgroundColor:
          legendPosition === "map"
            ? appearance.mapBorderEnabled
              ? hexToRgba(appearance.mapBorderColor, 0.72)
              : "transparent"
            : backgroundColor,
        borderStyle: "solid",
        borderWidth:
          legendPosition === "map"
            ? appearance.mapBorderEnabled
              ? appearance.mapBorderWidth
              : 0
            : 1,
        borderColor:
          legendPosition === "map"
            ? appearance.mapBorderEnabled
              ? appearance.mapBorderColor
              : "transparent"
            : colors.borderColor,
        borderRadius:
          legendPosition === "map" && appearance.mapBorderEnabled
            ? appearance.mapBorderRadius
            : 0,
        boxShadow:
          legendPosition === "map" && appearance.mapBorderEnabled
            ? "0 2px 12px rgba(15, 23, 42, 0.12)"
            : undefined,
        textShadow:
          legendPosition === "map"
            ? "0 0 3px rgba(255, 255, 255, 0.98), 0 1px 2px rgba(255, 255, 255, 0.98)"
            : undefined,
        fontFamily: EXPORT_LEGEND_FONT_FAMILY,
      }}
    >
      {legendPosition === "map" ? (
        <div
          data-legend-overlay-drag-surface="true"
          className="absolute -inset-7 z-0 rounded-2xl"
          aria-hidden="true"
        />
      ) : null}
      {legendPosition === "map" &&
      isContainerHovered &&
      !hoveredEntryKey &&
      !pointerDrag ? (
        <div
          className="pointer-events-none absolute -inset-7 z-20 rounded-2xl border-2 border-dashed border-indigo-500 bg-indigo-50/10 shadow-[0_0_0_3px_rgba(255,255,255,0.7)]"
          aria-hidden="true"
        />
      ) : null}
      <div className="absolute inset-0 z-10 overflow-visible">
        {legendLayout.isBottomSectionColumnMode &&
        legendLayout.columnCount > 1 ? (
          <>
            {Array.from({ length: legendLayout.columnCount - 1 }).map(
              (_, columnIndex) => {
                const x =
                  legendLayout.padding +
                  (columnIndex + 1) *
                    (legendLayout.columnWidth + legendLayout.columnGap) -
                  legendLayout.columnGap / 2;

                return (
                  <span
                    key={`section-column-separator-${columnIndex}`}
                    className="absolute rounded-full shadow-sm"
                    style={{
                      left: x - 2,
                      top: legendLayout.itemsTop - rect.y,
                      width: 4,
                      height: Math.max(
                        0,
                        legendLayout.itemsBottom - legendLayout.itemsTop,
                      ),
                      backgroundColor: separatorColor,
                      opacity: 0.9,
                    }}
                    aria-hidden="true"
                  />
                );
              },
            )}
          </>
        ) : null}

        {legendLayout.hasTitle ? (
          <div
            className="group/legend-title absolute z-[70] overflow-visible"
            style={{
              left: legendLayout.titleX - rect.x,
              top: legendLayout.titleY - rect.y - titleFontSize,
              width: legendLayout.titleMaxWidth,
              minHeight: legendLayout.titleHeight,
            }}
          >
            <EditableLegendText
              value={safeTitle}
              onCommit={onTitleChange}
              multiline
              liveCommit={legendPosition === "map"}
              placeholder="Titre de légende"
              className="relative block w-full resize-none overflow-hidden rounded border border-transparent bg-transparent p-0 font-bold outline-none hover:border-slate-300 hover:bg-white/70 focus:border-indigo-400 focus:bg-white/90 focus:ring-2 focus:ring-indigo-200"
              style={{
                width: "100%",
                minHeight: legendLayout.titleHeight,
                color: colors.titleColor,
                fontSize: titleFontSize,
                lineHeight: `${legendLayout.titleLineHeight}px`,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                height: "auto",
                WebkitTextStroke:
                  legendPosition === "map"
                    ? "1.5px rgba(255,255,255,0.98)"
                    : undefined,
                paintOrder: legendPosition === "map" ? "stroke fill" : undefined,
              }}
            />
            {onTitleRemove ? (
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onTitleRemove();
                }}
                className="absolute left-full top-1/2 z-[80] ml-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border-2 border-rose-300 bg-white text-xl font-bold leading-none text-rose-600 shadow-md transition hover:border-rose-400 hover:bg-rose-50"
                title="Supprimer le titre de la légende"
                aria-label="Supprimer le titre de la légende"
              >
                ×
              </button>
            ) : null}
          </div>
        ) : null}

        {entries.length === 0 &&
        displayItems.length === 0 &&
        safeTitle.length === 0 ? (
          <div
            className="absolute rounded-lg border border-dashed p-3"
            style={{
              left: legendLayout.titleX - rect.x,
              top: legendLayout.itemsTop - rect.y,
              width: legendLayout.titleMaxWidth,
              borderColor: colors.borderColor,
              color: colors.mutedTextColor,
              fontSize: itemFontSize,
            }}
          >
            Aucun objet visible dans la légende.
          </div>
        ) : (
          <ul className="absolute inset-0 m-0 list-none p-0">
            {legendLayout.visibleItems.map((item) => {
              const displayItem = displayItems[item.featureIndex];

              if (!displayItem) {
                return null;
              }

              if (displayItem.type === "section") {
                const isDefaultSection = isDefaultLegendSection(
                  displayItem.section,
                );

                if (isDefaultSection) {
                  return null;
                }

                return (
                  <li
                    key={displayItem.id}
                    data-legend-entry-hitbox="true"
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    onPointerEnter={() => setHoveredEntryKey(displayItem.id)}
                    onPointerLeave={() =>
                      setHoveredEntryKey((current) =>
                        current === displayItem.id ? null : current,
                      )
                    }
                    className={`group/section absolute min-w-0 rounded-lg border border-transparent px-1 hover:border-indigo-200 hover:bg-indigo-50/60 ${legendPosition === "map" ? "overflow-visible" : "overflow-hidden"}`}
                    style={{
                      left: item.x - rect.x,
                      top: item.y - rect.y,
                      width: item.width,
                      height: item.height,
                      color: colors.titleColor,
                      fontSize: legendLayout.sectionFontSize,
                      lineHeight: 1.12,
                    }}
                    title="Sous-légende : glisse des groupes ici"
                  >
                    <EditableLegendText
                      value={displayItem.label}
                      onCommit={(nextValue) => {
                        const trimmedValue = nextValue.trim();
                        if (trimmedValue.length === 0) return;
                        onRenameSection(displayItem.section, trimmedValue);
                      }}
                      placeholder="Sous-légende"
                      multiline
                      liveCommit
                      className="absolute left-0 top-0 min-w-0 resize-none overflow-hidden whitespace-pre-wrap rounded border border-transparent bg-transparent p-0 pr-8 font-bold uppercase tracking-[0.12em] outline-none hover:border-slate-300 hover:bg-white/70 focus:border-indigo-400 focus:bg-white/95 focus:ring-2 focus:ring-indigo-200"
                      style={{
                        color: colors.titleColor,
                        fontSize: legendLayout.sectionFontSize,
                        // La croix de suppression est superposée au survol :
                        // elle ne doit jamais voler de largeur au sous-titre.
                        width: Math.max(1, item.width),
                        minHeight: item.height,
                        lineHeight: 1.2,
                        height: item.height,
                        boxSizing: "border-box",
                        overflowWrap: "break-word",
                        wordBreak: "normal",
                        WebkitTextStroke:
                          legendPosition === "map"
                            ? "1.5px rgba(255,255,255,0.98)"
                            : undefined,
                        paintOrder:
                          legendPosition === "map" ? "stroke fill" : undefined,
                      }}
                    />

                    {!legendLayout.isBottomSectionColumnMode ? (
                      <span
                        className="absolute left-0 right-0 rounded-full shadow-sm"
                        style={{
                          // Le séparateur reste toujours sous le texte. Le
                          // calcul de layout est déjà le même que celui de
                          // l'export ; il ne faut pas le replacer à partir de la
                          // seule première ligne de texte.
                          top: Math.max(0, item.height - 4),
                          height: 4,
                          backgroundColor: separatorColor,
                        }}
                      />
                    ) : null}

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveSection(displayItem.section);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-rose-200 bg-white/95 text-rose-600 opacity-0 shadow-sm transition hover:bg-rose-50 group-hover/section:opacity-100 focus:opacity-100"
                      title="Supprimer cette sous-légende"
                      aria-label="Supprimer cette sous-légende"
                    >
                      ×
                    </button>
                  </li>
                );
              }

              const entry = entries[displayItem.entryIndex];

              if (!entry) {
                return null;
              }

              const feature = entry.representativeFeature;
              const isDragged = pointerDrag?.groupKey === entry.dedupeKey;
              const itemSymbolSize = item.symbolSize ?? legendLayout.symbolSize;
              const itemSymbolBoxWidth =
                item.symbolBoxWidth ?? legendLayout.symbolBoxWidth;
              const itemSymbolAnchorOffset =
                item.symbolAnchorOffset ?? legendLayout.symbolAnchorOffset;
              const itemLabelOffset =
                item.labelOffset ?? legendLayout.labelOffset;
              const symbolY =
                item.y - rect.y + (item.height - itemSymbolSize) / 2;
              // Dans l’éditeur avancé, la croix de masquage est un contrôle
              // superposé. Elle ne doit jamais réduire la largeur réelle du
              // label, sinon l’aperçu avancé ne serait plus WYSIWYG et un label
              // pourrait passer sur deux lignes uniquement dans cet écran.
              const hideControlReserve = showAlwaysVisibleHideControls
                ? 0
                : legendPosition === "map"
                  ? 0
                  : 50;
              const textMaxWidth = Math.max(
                20,
                item.width - itemLabelOffset - hideControlReserve,
              );
              const isHidden =
                entry.featureIds.length > 0 &&
                entry.featureIds.every((featureId) =>
                  hiddenLegendFeatureIds.includes(featureId),
                );

              return (
                <li
                  key={displayItem.id}
                  data-legend-entry-hitbox="true"
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  onPointerEnter={() => setHoveredEntryKey(entry.dedupeKey)}
                  onPointerLeave={() =>
                    setHoveredEntryKey((current) =>
                      current === entry.dedupeKey ? null : current,
                    )
                  }
                  onPointerDown={(event) =>
                    handleEntryPointerDown(event, entry)
                  }
                  className={`group absolute flex min-w-0 cursor-grab items-center rounded-lg border border-transparent active:cursor-grabbing hover:border-indigo-200 hover:bg-indigo-50/50 ${
                    legendPosition === "map" || showAlwaysVisibleHideControls
                      ? "overflow-visible"
                      : "overflow-hidden"
                  }`}
                  style={{
                    left: item.x - rect.x,
                    top: item.y - rect.y,
                    width: item.width,
                    height: item.height,
                    color: colors.textColor,
                    fontSize: itemFontSize,
                    lineHeight: 1.12,
                    opacity: isDragged || isHidden ? 0.48 : 1,
                    touchAction: "none",
                    userSelect: "none",
                  }}
                  title="Glisser pour changer l’ordre ou déplacer dans une sous-légende"
                >
                  <span
                    className="absolute flex shrink-0 items-center justify-center overflow-visible"
                    style={{
                      left: itemSymbolAnchorOffset - itemSymbolBoxWidth / 2,
                      top: symbolY - (item.y - rect.y),
                      width: itemSymbolBoxWidth,
                      height: itemSymbolSize,
                    }}
                  >
                    {feature.properties.type === "marker" ? (
                      <LegendSymbol
                        feature={feature}
                        symbolStyle={entry.legendSymbolStyle}
                        renderSize={itemSymbolSize}
                      />
                    ) : (
                      <span
                        className="inline-flex items-center justify-center"
                        style={{
                          transform: `scale(${itemSymbolSize / 48})`,
                          transformOrigin: "center",
                        }}
                      >
                        <LegendSymbol
                          feature={feature}
                          symbolStyle={entry.legendSymbolStyle}
                        />
                      </span>
                    )}
                  </span>

                  <span
                    className="absolute min-w-0"
                    style={{
                      left: itemLabelOffset,
                      top: Math.max(
                        0,
                        Math.round(
                          (item.height -
                            Math.max(
                              itemFontSize,
                              (item.textLines?.length ?? 1) *
                                itemFontSize *
                                appearance.labelLineHeight,
                            )) /
                            2,
                        ),
                      ),
                      width: textMaxWidth,
                      minHeight:
                        legendPosition === "map" ? item.height : undefined,
                      height: legendPosition === "map" ? "auto" : undefined,
                      overflow:
                        legendPosition === "map" ? "visible" : undefined,
                    }}
                  >
                    <EditableLegendText
                      value={entry.label}
                      onCommit={(nextValue) =>
                        onEntryLabelChange(entry.dedupeKey, nextValue)
                      }
                      placeholder="Nom"
                      multiline={legendPosition === "map"}
                      liveCommit={legendPosition === "map"}
                      className={`block w-full resize-none overflow-hidden rounded border border-transparent bg-transparent p-0 font-medium outline-none hover:border-slate-300 hover:bg-white/70 focus:border-indigo-400 focus:bg-white/90 focus:ring-2 focus:ring-indigo-200 ${legendPosition === "map" ? "whitespace-pre-wrap" : "truncate"}`}
                      style={{
                        color: colors.textColor,
                        fontSize: itemFontSize,
                        lineHeight:
                          legendPosition === "map"
                            ? appearance.labelLineHeight
                            : 1.12,
                        minHeight:
                          legendPosition === "map" ? item.height : undefined,
                        height: legendPosition === "map" ? "auto" : undefined,
                        overflowWrap:
                          legendPosition === "map" ? "anywhere" : undefined,
                        wordBreak:
                          legendPosition === "map" ? "break-word" : undefined,
                      }}
                    />
                  </span>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEntryHide(entry);
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={[
                      "absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full border bg-white/95 shadow-md transition focus:opacity-100",
                      showAlwaysVisibleHideControls
                        ? "left-full ml-2 h-10 w-10 border-rose-300 text-2xl font-black leading-none text-rose-600 opacity-100 hover:bg-rose-100 hover:text-rose-700"
                        : "right-1 h-12 w-12 border-slate-200 text-slate-500 opacity-0 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100",
                    ].join(" ")}
                    title="Masquer cet élément dans la légende"
                    aria-label="Masquer cet élément dans la légende"
                  >
                    {showAlwaysVisibleHideControls ? (
                      <span aria-hidden="true">×</span>
                    ) : (
                      <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {legendLayout.hasOverflow && legendLayout.warningRect ? (
          <div
            className="absolute rounded-lg border px-3 py-2 font-medium"
            style={{
              left: legendLayout.warningRect.x - rect.x,
              top: legendLayout.warningRect.y - rect.y,
              width: legendLayout.warningRect.width,
              minHeight: legendLayout.warningRect.height,
              borderColor: "#f59e0b",
              backgroundColor: "rgba(255, 251, 235, 0.96)",
              color: "#92400e",
              fontSize: Math.max(12, Math.round(itemFontSize * 0.72)),
              lineHeight: 1.25,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
              height: "auto",
            }}
          >
            ⚠ {legendLayout.warningText}
          </div>
        ) : null}
      </div>

      {pointerDrag?.hasMoved && draggedEntry ? (
        <div
          className="pointer-events-none absolute z-[1500] flex max-w-[260px] items-center gap-2 rounded-xl border border-indigo-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-800 shadow-2xl ring-4 ring-indigo-100/60"
          style={{
            left: Math.min(
              Math.max(pointerDrag.localX + 12, 8),
              rect.width - 20,
            ),
            top: Math.min(
              Math.max(pointerDrag.localY + 12, 8),
              rect.height - 20,
            ),
            transform: "translateY(-50%)",
          }}
        >
          <LegendSymbol
            feature={draggedEntry.representativeFeature}
            symbolStyle={draggedEntry.legendSymbolStyle}
          />
          <span className="min-w-0 truncate">
            {draggedEntry.label || "Sans nom"}
          </span>
        </div>
      ) : null}
    </aside>
  );
}

function ExportMapLegendTitlePreview(input: {
  title: string;
  rect: ExportCanvasRect;
  appearance: ExportLegendAppearance;
  onTitleChange: (title: string) => void;
  onTitleRemove?: () => void;
  onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  isMoving: boolean;
}) {
  const safeTitle = getSafeLegendTitle(input.title);
  const titleFontSize = input.appearance.titleFontSize;
  const [isHovered, setIsHovered] = useState(false);

  if (!safeTitle) {
    return null;
  }

  const colors = getReadableLegendTextColors("#ffffff");
  const titleLayout = createExportLegendLayout({
    legendRect: input.rect,
    displayItems: [],
    legendPosition: "map",
    appearance: {
      ...input.appearance,
      mapBorderEnabled: false,
      sideWidth: input.rect.width,
      bottomHeight: input.rect.height,
    },
    title: safeTitle,
  });

  return (
    <aside
      className="absolute z-[1050] overflow-visible"
      onPointerDownCapture={input.onPointerDownCapture}
      onPointerMove={input.onPointerMove}
      onPointerUp={input.onPointerUp}
      onPointerCancel={input.onPointerUp}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      style={{
        ...rectToStyle(input.rect),
        backgroundColor: "transparent",
        borderColor: "transparent",
        cursor: input.isMoving ? "grabbing" : "grab",
        touchAction: "none",
        userSelect: "none",
        textShadow:
          "0 0 3px rgba(255, 255, 255, 0.98), 0 1px 2px rgba(255, 255, 255, 0.98)",
        fontFamily: EXPORT_LEGEND_FONT_FAMILY,
      }}
    >
      <div
        data-legend-overlay-drag-surface="true"
        className="absolute -inset-6 z-0 rounded-2xl"
        aria-hidden="true"
      />
      {isHovered ? (
        <div
          className="pointer-events-none absolute -inset-6 z-20 rounded-2xl border-2 border-dashed border-indigo-500 bg-indigo-50/10 shadow-[0_0_0_3px_rgba(255,255,255,0.7)]"
          aria-hidden="true"
        />
      ) : null}
      <div
        className="group/map-legend-title absolute z-10 overflow-visible"
        style={{
          left: titleLayout.titleX - input.rect.x,
          top: titleLayout.titleY - input.rect.y - titleFontSize,
          width: titleLayout.titleMaxWidth,
          minHeight: titleLayout.titleHeight,
        }}
      >
        <EditableLegendText
          value={safeTitle}
          onCommit={input.onTitleChange}
          multiline
          liveCommit
          placeholder="Titre de légende"
          className="relative block w-full resize-none overflow-hidden rounded border border-transparent bg-transparent p-0 text-center font-bold outline-none hover:border-slate-300 hover:bg-white/70 focus:border-indigo-400 focus:bg-white/90 focus:ring-2 focus:ring-indigo-200"
          style={{
            width: "100%",
            minHeight: titleLayout.titleHeight,
            color: colors.titleColor,
            fontSize: titleFontSize,
            lineHeight: `${titleLayout.titleLineHeight}px`,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            height: "auto",
            WebkitTextStroke: "1.5px rgba(255,255,255,0.98)",
            paintOrder: "stroke fill",
          }}
        />
        {input.onTitleRemove ? (
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              input.onTitleRemove?.();
            }}
            className="absolute left-full top-1/2 z-30 ml-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border-2 border-rose-300 bg-white text-xl font-bold leading-none text-rose-600 shadow-md transition hover:border-rose-400 hover:bg-rose-50"
            title="Supprimer le titre de la légende"
            aria-label="Supprimer le titre de la légende"
          >
            ×
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function ExportMapPreviewFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 p-4 text-center text-sm text-slate-500">
      Chargement de la carte...
    </div>
  );
}

function ScaleStyleGraphic({
  style,
  width = 76,
}: {
  style: ExportScaleBarStyle;
  width?: number;
}) {
  const isLine = style === "line";
  const isAlternating = style === "alternating" || style === "boxed";

  return (
    <div
      className={[
        "flex h-8 items-center justify-center",
        style === "boxed" ? "rounded border border-slate-700 px-1.5 py-1" : "",
      ].join(" ")}
      style={{ width }}
      aria-hidden="true"
    >
      {isLine ? (
        <div className="relative h-3 w-full">
          <span className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-slate-950" />
          <span className="absolute left-0 top-0 h-3 w-0.5 bg-slate-950" />
          <span className="absolute left-1/2 top-0 h-3 w-0.5 -translate-x-1/2 bg-slate-950" />
          <span className="absolute right-0 top-0 h-3 w-0.5 bg-slate-950" />
        </div>
      ) : isAlternating ? (
        <div className="flex h-2 w-full overflow-hidden border border-slate-950">
          {Array.from({ length: 4 }, (_, index) => (
            <span
              key={index}
              className={
                index % 2 === 0 ? "flex-1 bg-slate-950" : "flex-1 bg-white"
              }
            />
          ))}
        </div>
      ) : (
        <div className="h-2 w-full border border-white bg-slate-950 ring-1 ring-slate-950" />
      )}
    </div>
  );
}

function NorthArrowGraphic({
  style,
  width = 44,
  height = 58,
}: {
  style: ExportNorthArrowStyle;
  width?: number;
  height?: number;
}) {
  if (style === "simple") {
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 44 58"
        fill="none"
        aria-hidden="true"
      >
        <text
          x="22"
          y="13"
          textAnchor="middle"
          fontSize="13"
          fontWeight="800"
          fill="#0f172a"
        >
          N
        </text>
        <path
          d="M22 16 L34 46 L25 42 L25 56 L19 56 L19 42 L10 46 Z"
          fill="#0f172a"
          stroke="white"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M22 16 L34 46 L25 42 L25 56 L19 56 L19 42 L10 46 Z"
          stroke="#0f172a"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (style === "compass") {
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 44 58"
        fill="none"
        aria-hidden="true"
      >
        <text
          x="22"
          y="12"
          textAnchor="middle"
          fontSize="12"
          fontWeight="800"
          fill="#0f172a"
        >
          N
        </text>
        <circle
          cx="22"
          cy="36"
          r="13"
          fill="white"
          stroke="#0f172a"
          strokeWidth="1.2"
        />
        <path
          d="M22 17 L27 31 L41 36 L27 41 L22 55 L17 41 L3 36 L17 31 Z"
          fill="white"
          stroke="white"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M22 17 L27 31 L41 36 L27 41 L22 55 L17 41 L3 36 L17 31 Z"
          fill="white"
          stroke="#0f172a"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M22 17 L27 31 L22 36 L17 31 Z" fill="#0f172a" />
      </svg>
    );
  }

  if (style === "needle") {
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 44 58"
        fill="none"
        aria-hidden="true"
      >
        <text
          x="22"
          y="13"
          textAnchor="middle"
          fontSize="13"
          fontWeight="800"
          fill="#0f172a"
        >
          N
        </text>
        <path
          d="M22 16 L28 43 L22 39 L16 43 Z"
          fill="#0f172a"
          stroke="white"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M22 16 L28 43 L22 39 L16 43 Z"
          stroke="#0f172a"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M22 39 V56"
          stroke="white"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M22 39 V56"
          stroke="#0f172a"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 44 58"
      fill="none"
      aria-hidden="true"
    >
      <text
        x="22"
        y="13"
        textAnchor="middle"
        fontSize="13"
        fontWeight="800"
        fill="#0f172a"
      >
        N
      </text>
      <path
        d="M22 16 L31 42 L22 36 Z"
        fill="#0f172a"
        stroke="white"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M22 16 L31 42 L22 36 Z"
        fill="#0f172a"
        stroke="#0f172a"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M22 16 L22 36 L13 42 Z"
        fill="white"
        stroke="#0f172a"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M22 36 V53"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M22 36 V53"
        stroke="#0f172a"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="22" cy="53" r="2" fill="#0f172a" />
    </svg>
  );
}

function ExportScaleBarPreview(input: {
  enabled: boolean;
  style: ExportScaleBarStyle;
  position: ExportMapElementPosition;
  mapPosition: ExportMapElementCustomPosition | null;
  workspaceBounds: WorkspaceBounds | null;
  mapRect: ExportCanvasRect;
  onMapPositionChange: (position: ExportMapElementCustomPosition) => void;
  onRequestDisable: () => void;
}) {
  const drag = useMapElementPointerDrag((position) => {
    if (typeof input.onMapPositionChange === "function") {
      input.onMapPositionChange(position);
      return;
    }
    useEditorTestExportStore.setState({ scaleBarMapPosition: position });
  });
  const model = createExportScaleBarModel({
    workspaceBounds: input.workspaceBounds,
    mapRect: input.mapRect,
  });

  if (!input.enabled || !model) {
    return null;
  }

  const isBoxed = input.style === "boxed";
  const isLine = input.style === "line";
  const segments = 4;
  const freePositionStyle = getFreeMapElementPositionStyle(input.mapPosition);

  return (
    <button
      type="button"
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onClick={(event) => {
        if (drag.consumeClickAfterDrag(event)) return;
        event.stopPropagation();
        input.onRequestDisable();
      }}
      className={[
        "absolute z-[900] cursor-grab touch-none select-none px-0 py-0 text-left text-[12px] font-semibold leading-none text-slate-950 transition active:cursor-grabbing hover:ring-2 hover:ring-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500",
        isBoxed
          ? "rounded border border-slate-900/70 px-1.5 py-1"
          : "border-0 bg-transparent",
      ].join(" ")}
      style={{
        ...(freePositionStyle ?? getMapElementPositionStyle(input.position)),
        minWidth: model.widthPx,
        filter:
          "drop-shadow(0 1px 0 rgba(255,255,255,0.98)) drop-shadow(0 0 2px rgba(255,255,255,0.95))",
      }}
      title="Glisser pour déplacer l’échelle. Cliquer sans déplacer pour la désactiver."
      aria-label="Déplacer ou désactiver l’échelle"
    >
      <div className="mb-1.5">{model.label}</div>
      {isLine ? (
        <div className="relative h-3" style={{ width: model.widthPx }}>
          <span className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-slate-950" />
          <span className="absolute left-0 top-0 h-3 w-0.5 bg-slate-950" />
          <span className="absolute left-1/2 top-0 h-3 w-0.5 -translate-x-1/2 bg-slate-950" />
          <span className="absolute right-0 top-0 h-3 w-0.5 bg-slate-950" />
        </div>
      ) : input.style === "alternating" || input.style === "boxed" ? (
        <div
          className="flex h-2 overflow-hidden border border-slate-950"
          style={{ width: model.widthPx }}
        >
          {Array.from({ length: segments }, (_, index) => (
            <span
              key={index}
              className={index % 2 === 0 ? "bg-slate-950" : "bg-white"}
              style={{ width: model.widthPx / segments }}
            />
          ))}
        </div>
      ) : (
        <div
          className="h-2 border border-white bg-slate-950 ring-1 ring-slate-950"
          style={{ width: model.widthPx }}
        />
      )}
    </button>
  );
}

function ExportNorthArrowPreview(input: {
  enabled: boolean;
  style: ExportNorthArrowStyle;
  position: ExportMapElementPosition;
  mapPosition: ExportMapElementCustomPosition | null;
  collisionOffset: number;
  mapRect: ExportCanvasRect;
  onMapPositionChange: (position: ExportMapElementCustomPosition) => void;
  onRequestDisable: () => void;
}) {
  const drag = useMapElementPointerDrag((position) => {
    if (typeof input.onMapPositionChange === "function") {
      input.onMapPositionChange(position);
      return;
    }
    useEditorTestExportStore.setState({ northArrowMapPosition: position });
  });
  const placement = createExportNorthArrowPlacement(
    input.mapRect,
    input.position,
    input.collisionOffset,
    input.mapPosition,
  );

  if (!input.enabled || !placement) {
    return null;
  }

  const freePositionStyle = getFreeMapElementPositionStyle(input.mapPosition);

  return (
    <button
      type="button"
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onClick={(event) => {
        if (drag.consumeClickAfterDrag(event)) return;
        event.stopPropagation();
        input.onRequestDisable();
      }}
      className="absolute z-[900] flex cursor-grab touch-none select-none items-center justify-center border-0 bg-transparent p-0 transition active:cursor-grabbing hover:ring-2 hover:ring-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      style={{
        ...(freePositionStyle ??
          getMapElementPositionStyle(input.position, input.collisionOffset)),
        width: placement.width,
        height: placement.height,
        filter: "drop-shadow(0 0 2px rgba(255,255,255,0.96))",
      }}
      title="Glisser pour déplacer la flèche du nord. Cliquer sans déplacer pour la désactiver."
      aria-label="Déplacer ou désactiver la flèche du nord"
    >
      <NorthArrowGraphic style={input.style} width={52} height={70} />
    </button>
  );
}

function MapElementControls(input: {
  scaleBarEnabled: boolean;
  scaleBarStyle: ExportScaleBarStyle;
  scaleBarPosition: ExportMapElementPosition;
  northArrowEnabled: boolean;
  northArrowStyle: ExportNorthArrowStyle;
  northArrowPosition: ExportMapElementPosition;
  onScaleEnabledChange: (enabled: boolean) => void;
  onScaleStyleChange: (style: ExportScaleBarStyle) => void;
  onScalePositionChange: (position: ExportMapElementPosition) => void;
  onNorthEnabledChange: (enabled: boolean) => void;
  onNorthStyleChange: (style: ExportNorthArrowStyle) => void;
  onNorthPositionChange: (position: ExportMapElementPosition) => void;
}) {
  const [openMenu, setOpenMenu] = useState<"scale" | "north" | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        setOpenMenu(null);
        return;
      }

      if (!controlsRef.current?.contains(target)) {
        setOpenMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  return (
    <div ref={controlsRef} className="flex items-center gap-1.5">
      <div className="relative">
        <button
          type="button"
          onClick={() =>
            setOpenMenu((value) => (value === "scale" ? null : "scale"))
          }
          className={[
            "flex min-w-[112px] items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs font-semibold transition",
            input.scaleBarEnabled
              ? "border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
              : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50",
          ].join(" ")}
          aria-expanded={openMenu === "scale"}
        >
          <span className="flex h-7 w-9 items-center justify-center rounded bg-white/70">
            <ScaleStyleGraphic style={input.scaleBarStyle} width={28} />
          </span>
          <span>Échelle</span>
        </button>

        {openMenu === "scale" ? (
          <div className="absolute left-0 top-full z-[1900] mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-900">Échelle</div>
              <button
                type="button"
                onClick={() =>
                  input.onScaleEnabledChange(!input.scaleBarEnabled)
                }
                className={[
                  "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold",
                  input.scaleBarEnabled
                    ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : "bg-indigo-600 text-white hover:bg-indigo-700",
                ].join(" ")}
              >
                {input.scaleBarEnabled ? "Désactiver" : "Activer"}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {EXPORT_SCALE_BAR_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => input.onScaleStyleChange(option.value)}
                  title={option.label}
                  aria-label={option.label}
                  className={[
                    "flex h-14 items-center justify-center rounded-xl border transition",
                    input.scaleBarStyle === option.value
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  ].join(" ")}
                >
                  <ScaleStyleGraphic style={option.value} />
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {EXPORT_MAP_ELEMENT_POSITION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => input.onScalePositionChange(option.value)}
                  className={[
                    "rounded-lg border px-2 py-1.5 text-xs font-semibold",
                    input.scaleBarPosition === option.value
                      ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() =>
            setOpenMenu((value) => (value === "north" ? null : "north"))
          }
          className={[
            "flex min-w-[104px] items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs font-semibold transition",
            input.northArrowEnabled
              ? "border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
              : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50",
          ].join(" ")}
          aria-expanded={openMenu === "north"}
        >
          <span className="flex h-8 w-9 items-center justify-center rounded bg-white/70">
            <NorthArrowGraphic
              style={input.northArrowStyle}
              width={28}
              height={36}
            />
          </span>
          <span>Nord</span>
        </button>

        {openMenu === "north" ? (
          <div className="absolute right-0 top-full z-[1900] mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-900">
                Flèche du nord
              </div>
              <button
                type="button"
                onClick={() =>
                  input.onNorthEnabledChange(!input.northArrowEnabled)
                }
                className={[
                  "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold",
                  input.northArrowEnabled
                    ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : "bg-indigo-600 text-white hover:bg-indigo-700",
                ].join(" ")}
              >
                {input.northArrowEnabled ? "Désactiver" : "Activer"}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {EXPORT_NORTH_ARROW_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => input.onNorthStyleChange(option.value)}
                  title={option.label}
                  aria-label={option.label}
                  className={[
                    "flex h-16 items-center justify-center rounded-xl border transition",
                    input.northArrowStyle === option.value
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  ].join(" ")}
                >
                  <NorthArrowGraphic
                    style={option.value}
                    width={38}
                    height={50}
                  />
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {EXPORT_MAP_ELEMENT_POSITION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => input.onNorthPositionChange(option.value)}
                  className={[
                    "rounded-lg border px-2 py-1.5 text-xs font-semibold",
                    input.northArrowPosition === option.value
                      ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      });
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return { ref, size };
}

export function ExportPreviewScene() {
  const { ref: viewportRef, size: viewportSize } =
    useElementSize<HTMLDivElement>();
  const resizeStartRef = useRef<ResizeStartState | null>(null);
  const legendOverlayMoveStartRef = useRef<LegendOverlayMoveStartState | null>(
    null,
  );
  const legendTitleMoveStartRef = useRef<LegendOverlayMoveStartState | null>(
    null,
  );
  const [isHiddenListOpen, setIsHiddenListOpen] = useState(false);
  const [pendingMapElementDisable, setPendingMapElementDisable] = useState<
    "scale-bar" | "north-arrow" | null
  >(null);
  const [isAdvancedLegendEditorOpen, setIsAdvancedLegendEditorOpen] =
    useState(false);
  const [isLegendOverlayMoving, setIsLegendOverlayMoving] = useState(false);
  const [isLegendTitleMoving, setIsLegendTitleMoving] = useState(false);

  const legendTitle = useEditorTestExportStore((state) => state.legendTitle);
  const setLegendTitle = useEditorTestExportStore(
    (state) => state.setLegendTitle,
  );
  const legendPosition = useEditorTestExportStore(
    (state) => state.legendPosition,
  );
  const legendMapPosition = useEditorTestExportStore(
    (state) => state.legendMapPosition,
  );
  const setLegendMapPosition = useEditorTestExportStore(
    (state) => state.setLegendMapPosition,
  );
  const legendMapTitlePosition = useEditorTestExportStore(
    (state) => state.legendMapTitlePosition,
  );
  const setLegendMapTitlePosition = useEditorTestExportStore(
    (state) => state.setLegendMapTitlePosition,
  );
  const exportFormat = useEditorTestExportStore((state) => state.exportFormat);
  const showBasemapLabels = useEditorTestExportStore(
    (state) => state.showBasemapLabels,
  );
  const setShowBasemapLabels = useEditorTestExportStore(
    (state) => state.setShowBasemapLabels,
  );

  const legendBackgroundColor = useEditorTestExportStore(
    (state) => state.legendBackgroundColor,
  );
  const legendSideWidth = useEditorTestExportStore(
    (state) => state.legendSideWidth,
  );
  const setLegendSideWidth = useEditorTestExportStore(
    (state) => state.setLegendSideWidth,
  );
  const legendBottomHeight = useEditorTestExportStore(
    (state) => state.legendBottomHeight,
  );
  const setLegendBottomHeight = useEditorTestExportStore(
    (state) => state.setLegendBottomHeight,
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
  const legendSymbolSize = useEditorTestExportStore(
    (state) => state.legendSymbolSize,
  );
  const setLegendSymbolSize = useEditorTestExportStore(
    (state) => state.setLegendSymbolSize,
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
  const customLegendEntries = useEditorTestExportStore(
    (state) => state.customLegendEntries,
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
  const legendFeatureOrder = useEditorTestExportStore(
    (state) => state.legendFeatureOrder,
  );
  const legendGroupLabels = useEditorTestExportStore(
    (state) => state.legendGroupLabels,
  );
  const legendGroupSections = useEditorTestExportStore(
    (state) => state.legendGroupSections,
  );
  const legendGroupOrder = useEditorTestExportStore(
    (state) => state.legendGroupOrder,
  );
  const legendSectionOrder = useEditorTestExportStore(
    (state) => state.legendSectionOrder,
  );
  const scaleBarEnabled = useEditorTestExportStore(
    (state) => state.scaleBarEnabled,
  );
  const scaleBarStyle = useEditorTestExportStore(
    (state) => state.scaleBarStyle,
  );
  const scaleBarPosition = useEditorTestExportStore(
    (state) => state.scaleBarPosition,
  );
  const scaleBarMapPosition = useEditorTestExportStore(
    (state) => state.scaleBarMapPosition,
  );
  const setScaleBarEnabled = useEditorTestExportStore(
    (state) => state.setScaleBarEnabled,
  );
  const setScaleBarStyle = useEditorTestExportStore(
    (state) => state.setScaleBarStyle,
  );
  const setScaleBarPosition = useEditorTestExportStore(
    (state) => state.setScaleBarPosition,
  );
  const setScaleBarMapPosition = useEditorTestExportStore(
    (state) => state.setScaleBarMapPosition,
  );
  const northArrowEnabled = useEditorTestExportStore(
    (state) => state.northArrowEnabled,
  );
  const northArrowStyle = useEditorTestExportStore(
    (state) => state.northArrowStyle,
  );
  const northArrowPosition = useEditorTestExportStore(
    (state) => state.northArrowPosition,
  );
  const northArrowMapPosition = useEditorTestExportStore(
    (state) => state.northArrowMapPosition,
  );
  const setNorthArrowEnabled = useEditorTestExportStore(
    (state) => state.setNorthArrowEnabled,
  );
  const setNorthArrowStyle = useEditorTestExportStore(
    (state) => state.setNorthArrowStyle,
  );
  const setNorthArrowPosition = useEditorTestExportStore(
    (state) => state.setNorthArrowPosition,
  );
  const setNorthArrowMapPosition = useEditorTestExportStore(
    (state) => state.setNorthArrowMapPosition,
  );
  const setLegendGroupLabel = useEditorTestExportStore(
    (state) => state.setLegendGroupLabel,
  );
  const setLegendGroupSection = useEditorTestExportStore(
    (state) => state.setLegendGroupSection,
  );
  const updateCustomLegendEntry = useEditorTestExportStore(
    (state) => state.updateCustomLegendEntry,
  );
  const setLegendGroupOrder = useEditorTestExportStore(
    (state) => state.setLegendGroupOrder,
  );
  const toggleLegendFeatureVisibility = useEditorTestExportStore(
    (state) => state.toggleLegendFeatureVisibility,
  );
  const toggleLegendGroupVisibility = useEditorTestExportStore(
    (state) => state.toggleLegendGroupVisibility,
  );
  const addLegendSection = useEditorTestExportStore(
    (state) => state.addLegendSection,
  );
  const renameLegendSection = useEditorTestExportStore(
    (state) => state.renameLegendSection,
  );
  const removeLegendSection = useEditorTestExportStore(
    (state) => state.removeLegendSection,
  );

  const rawFeatures = useEditorTestFeaturesStore((state) => state.features);
  const layers = useEditorTestLayersStore((state) => state.layers);
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const workspaceBasemapZoom = useEditorTestWorkspaceStore(
    (state) => state.workspaceBasemapZoom,
  );
  const workspaceBasemapBaseZoom = useEditorTestWorkspaceStore(
    (state) => state.workspaceBasemapBaseZoom,
  );
  const setWorkspaceBasemapZoom = useEditorTestWorkspaceStore(
    (state) => state.setWorkspaceBasemapZoom,
  );
  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);
  const basemap = getDromapBasemapConfig(basemapId);
  const canAdjustBasemapDetail = basemap.kind === "maplibre";
  const rawBasemapDetailZoomValue =
    typeof workspaceBasemapZoom === "number" &&
    Number.isFinite(workspaceBasemapZoom)
      ? workspaceBasemapZoom
      : MIN_PREVIEW_BASEMAP_DETAIL_ZOOM;
  const baseBasemapDetailZoom =
    typeof workspaceBasemapBaseZoom === "number" &&
    Number.isFinite(workspaceBasemapBaseZoom)
      ? workspaceBasemapBaseZoom
      : rawBasemapDetailZoomValue;
  const minPreviewBasemapDetailZoom = Math.max(
    MIN_PREVIEW_BASEMAP_DETAIL_ZOOM,
    baseBasemapDetailZoom - PREVIEW_BASEMAP_DETAIL_DELTA,
  );
  const maxPreviewBasemapDetailZoom = Math.min(
    basemap.kind === "maplibre" ? basemap.maxZoom : 19,
    baseBasemapDetailZoom + PREVIEW_BASEMAP_DETAIL_DELTA,
  );
  const basemapDetailZoomValue = Math.min(
    Math.max(rawBasemapDetailZoomValue, minPreviewBasemapDetailZoom),
    maxPreviewBasemapDetailZoom,
  );
  const features = useMemo(
    () =>
      getRenderableFeaturesForLayers(rawFeatures, layers, { workspaceBounds }),
    [rawFeatures, layers, workspaceBounds],
  );
  const rawGeoJsonLayers = useEditorTestGeoJsonLayersStore(
    (state) => state.geoJsonLayers,
  );
  const geoJsonLayers = useMemo(
    () => getRenderableGeoJsonLayers(rawGeoJsonLayers),
    [rawGeoJsonLayers],
  );
  const updateFeature = useEditorTestFeaturesStore(
    (state) => state.updateFeature,
  );

  const appearance = useMemo(
    () =>
      normalizeLegendAppearance({
        backgroundColor: legendBackgroundColor,
        sideWidth: legendSideWidth,
        bottomHeight: legendBottomHeight,
        titleFontSize: legendTitleFontSize,
        itemFontSize: legendItemFontSize,
        sectionTitleFontSize: legendSectionTitleFontSize,
        symbolSize: legendSymbolSize,
        itemGap: legendItemGap,
        labelGap: legendLabelGap,
        labelLineHeight: legendLabelLineHeight,
        sectionGap: legendSectionGap,
        mapBorderEnabled: legendMapBorderEnabled,
        mapBorderColor: legendMapBorderColor,
        mapBorderWidth: legendMapBorderWidth,
        mapBorderRadius: legendMapBorderRadius,
        mapPadding: legendMapPadding,
      }),
    [
      legendBackgroundColor,
      legendSideWidth,
      legendBottomHeight,
      legendTitleFontSize,
      legendItemFontSize,
      legendSectionTitleFontSize,
      legendSymbolSize,
      legendItemGap,
      legendLabelGap,
      legendLabelLineHeight,
      legendSectionGap,
      legendMapBorderEnabled,
      legendMapBorderColor,
      legendMapBorderWidth,
      legendMapBorderRadius,
      legendMapPadding,
    ],
  );

  const allLegendFeatures = useMemo(
    () =>
      getVisibleLegendFeatures({
        features,
        hiddenLegendFeatureIds: [],
        legendFeatureOrder,
      }),
    [features, legendFeatureOrder],
  );

  const allLegendEntries = useMemo(
    () =>
      mergeLegendEntriesWithCustomEntries(
        mergeLegendEntriesWithGeoJsonLayers(
          getLegendEntries(allLegendFeatures, {
            legendGroupLabels,
            legendGroupSections,
            legendGroupOrder,
          }),
          geoJsonLayers,
          {
            legendGroupLabels,
            legendGroupSections,
            legendGroupOrder,
            workspaceBounds,
          },
        ),
        customLegendEntries,
        {
          legendGroupLabels,
          legendGroupSections,
          legendGroupOrder,
          legendSymbolOverrides,
        },
      ),
    [
      allLegendFeatures,
      geoJsonLayers,
      legendGroupLabels,
      legendGroupSections,
      legendGroupOrder,
      workspaceBounds,
      customLegendEntries,
      legendSymbolOverrides,
    ],
  );

  const hiddenLegendEntries = useMemo(
    () =>
      allLegendEntries.filter((entry) => {
        if (hiddenLegendGroupKeys.includes(entry.dedupeKey)) {
          return true;
        }

        // Compatibilité avec les anciennes sauvegardes qui masquaient les
        // groupes via leurs identifiants de features. Une superposition est
        // volontairement indépendante des zones qui la composent.
        return (
          !entry.isAutomaticOverlap &&
          entry.featureIds.length > 0 &&
          entry.featureIds.every((featureId) =>
            hiddenLegendFeatureIds.includes(featureId),
          )
        );
      }),
    [allLegendEntries, hiddenLegendFeatureIds, hiddenLegendGroupKeys],
  );

  const visibleLegendEntries = useMemo(
    () =>
      allLegendEntries.filter((entry) => {
        if (hiddenLegendGroupKeys.includes(entry.dedupeKey)) {
          return false;
        }

        if (entry.isAutomaticOverlap) {
          return true;
        }

        return !(
          entry.featureIds.length > 0 &&
          entry.featureIds.every((featureId) =>
            hiddenLegendFeatureIds.includes(featureId),
          )
        );
      }),
    [allLegendEntries, hiddenLegendFeatureIds, hiddenLegendGroupKeys],
  );

  const visibleLegendDisplayItems = useMemo(
    () =>
      createExportLegendDisplayItems(visibleLegendEntries, {
        legendSectionOrder,
        includeEmptySections: true,
      }),
    [visibleLegendEntries, legendSectionOrder],
  );

  const safeLegendTitle = getSafeLegendTitle(legendTitle);
  const hasVisibleLegendEntries = visibleLegendEntries.length > 0;
  const hasVisibleLegendSections = visibleLegendDisplayItems.some(
    (item) => item.type === "section",
  );
  const hasVisibleLegendTitle = safeLegendTitle.length > 0;
  const hasVisibleLegendBody =
    hasVisibleLegendEntries || hasVisibleLegendSections;
  const hasVisibleLegend = hasVisibleLegendBody || hasVisibleLegendTitle;
  const effectiveLegendPosition = hasVisibleLegend ? legendPosition : "map";
  const shouldRenderLegendPanel =
    legendPosition === "map" ? hasVisibleLegendBody : hasVisibleLegend;

  const mapLegendContent = useMemo(() => {
    const symbolMetrics = visibleLegendEntries.map((entry) =>
      getExportLegendEntrySymbolMetrics(entry, appearance.symbolSize),
    );
    const symbolVisualHeights = visibleLegendEntries.map((entry, index) =>
      getExportLegendEntrySymbolVisualHeight(
        entry,
        symbolMetrics[index]?.symbolSize ?? appearance.symbolSize,
      ),
    );

    return {
      entryLabels: visibleLegendEntries.map((entry) => entry.label),
      entrySymbolSizes: symbolMetrics.map((metrics) => metrics.symbolSize),
      entrySymbolBoxWidths: symbolMetrics.map(
        (metrics) => metrics.symbolBoxWidth,
      ),
      sectionLabels: visibleLegendDisplayItems
        .filter(
          (
            item,
          ): item is Extract<ExportLegendDisplayItem, { type: "section" }> =>
            item.type === "section",
        )
        .map((item) => item.label),
      items: visibleLegendDisplayItems.map((item) => {
        if (item.type === "section") {
          return { type: "section" as const, label: item.label };
        }

        const metrics = symbolMetrics[item.entryIndex];

        return {
          type: "entry" as const,
          label: visibleLegendEntries[item.entryIndex]?.label ?? "Sans nom",
          symbolSize: metrics?.symbolSize ?? appearance.symbolSize,
          symbolBoxWidth:
            metrics?.symbolBoxWidth ??
            getExportLegendEntrySymbolMetrics(undefined, appearance.symbolSize)
              .symbolBoxWidth,
          symbolVisualHeight:
            symbolVisualHeights[item.entryIndex] ??
            getExportLegendEntrySymbolVisualHeight(
              undefined,
              appearance.symbolSize,
            ),
        };
      }),
    };
  }, [appearance.symbolSize, visibleLegendDisplayItems, visibleLegendEntries]);

  const layout = useMemo(() => {
    if (!workspaceBounds) {
      return null;
    }

    return createExportLayout({
      workspaceBounds,
      legendPosition: effectiveLegendPosition,
      legendMapPosition,
      exportFormat,
      legendFeaturesCount: hasVisibleLegendBody
        ? visibleLegendDisplayItems.length
        : 0,
      appearance,
      mapLegendContent: hasVisibleLegendBody ? mapLegendContent : undefined,
    });
  }, [
    workspaceBounds,
    effectiveLegendPosition,
    legendMapPosition,
    exportFormat,
    hasVisibleLegendBody,
    visibleLegendDisplayItems.length,
    appearance,
    mapLegendContent,
  ]);

  const mapVisualZoom = useMemo(() => {
    if (!layout || !workspaceBounds) {
      return null;
    }

    return getExportMapVisualZoom(workspaceBounds, layout.mapRect);
  }, [layout, workspaceBounds]);

  const scale = useMemo(() => {
    if (!layout) {
      return 1;
    }

    return Math.min(
      1,
      viewportSize.width / layout.canvasWidth,
      viewportSize.height / layout.canvasHeight,
    );
  }, [layout, viewportSize.height, viewportSize.width]);

  function handleBasemapDetailChange(
    event: ReactChangeEvent<HTMLInputElement>,
  ) {
    const nextZoom = Number(event.currentTarget.value);

    if (!Number.isFinite(nextZoom)) {
      return;
    }

    setWorkspaceBasemapZoom(nextZoom);
  }

  function handleResizePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (!layout) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    resizeStartRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSideWidth: appearance.sideWidth,
      startBottomHeight:
        appearance.bottomHeight === 0
          ? layout.legendRect.height
          : appearance.bottomHeight,
      scale,
    };
  }

  function handleResizePointerMove(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const resizeStart = resizeStartRef.current;

    if (!resizeStart || resizeStart.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();

    if (legendPosition === "bottom") {
      const deltaY =
        (event.clientY - resizeStart.startClientY) / resizeStart.scale;
      const nextHeight = clampExportNumber(
        resizeStart.startBottomHeight - deltaY,
        MIN_LEGEND_BOTTOM_HEIGHT,
        MAX_LEGEND_BOTTOM_HEIGHT,
      );

      setLegendBottomHeight(Math.round(nextHeight));
      return;
    }

    const deltaX =
      (event.clientX - resizeStart.startClientX) / resizeStart.scale;
    const signedDelta = legendPosition === "left" ? -deltaX : deltaX;
    const nextWidth = clampExportNumber(
      resizeStart.startSideWidth + signedDelta,
      MIN_LEGEND_SIDE_WIDTH,
      MAX_LEGEND_SIDE_WIDTH,
    );

    setLegendSideWidth(Math.round(nextWidth));
  }

  function handleResizePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (resizeStartRef.current?.pointerId === event.pointerId) {
      resizeStartRef.current = null;
    }
  }

  function clearOverlayMove(
    moveRef: LegendOverlayMoveRef,
    setMoving: (moving: boolean) => void,
    pointerId?: number,
  ) {
    const moveStart = moveRef.current;

    if (
      typeof pointerId === "number" &&
      moveStart &&
      moveStart.pointerId !== pointerId
    ) {
      return;
    }

    if (moveStart) {
      try {
        moveStart.target.releasePointerCapture(moveStart.pointerId);
      } catch {
        // La capture peut déjà avoir été libérée par le navigateur.
      }
    }

    moveRef.current = null;
    setMoving(false);
  }

  function shouldIgnoreLegendOverlayMoveTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(
      target.closest(
        '[data-legend-entry-hitbox="true"], button, input, textarea, select, a, [contenteditable="true"]',
      ),
    );
  }

  function beginOverlayMove(
    event: ReactPointerEvent<HTMLElement>,
    moveRef: LegendOverlayMoveRef,
    rect: ExportCanvasRect,
    ignoreLegendElements: boolean,
  ) {
    if (!layout || legendPosition !== "map" || event.button !== 0) {
      return;
    }

    if (
      ignoreLegendElements &&
      shouldIgnoreLegendOverlayMoveTarget(event.target)
    ) {
      return;
    }

    const target = event.currentTarget;
    moveRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLegendX: rect.x,
      startLegendY: rect.y,
      scale,
      active: false,
      target,
    };

    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // La fin du geste reste gérée par pointerup/pointercancel.
    }
  }

  function moveOverlay(
    event: ReactPointerEvent<HTMLElement>,
    moveRef: LegendOverlayMoveRef,
    currentRect: ExportCanvasRect,
    onPositionChange: (position: ExportLegendMapPosition) => void,
    setMoving: (moving: boolean) => void,
    edgeBleed = 0,
  ) {
    const moveStart = moveRef.current;

    if (
      !layout ||
      legendPosition !== "map" ||
      !moveStart ||
      moveStart.pointerId !== event.pointerId
    ) {
      return;
    }

    const rawDistance = Math.hypot(
      event.clientX - moveStart.startClientX,
      event.clientY - moveStart.startClientY,
    );

    if (!moveStart.active && rawDistance < 3) {
      return;
    }

    if (!moveStart.active) {
      moveStart.active = true;
      setMoving(true);

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }

    event.preventDefault();
    event.stopPropagation();

    const deltaX = (event.clientX - moveStart.startClientX) / moveStart.scale;
    const deltaY = (event.clientY - moveStart.startClientY) / moveStart.scale;
    const safeEdgeBleed = Math.max(0, edgeBleed);
    const minX = layout.mapRect.x + MAP_LEGEND_MARGIN - safeEdgeBleed;
    const minY = layout.mapRect.y + MAP_LEGEND_MARGIN - safeEdgeBleed;
    const maxX = Math.max(
      minX,
      layout.mapRect.x +
        layout.mapRect.width -
        currentRect.width -
        MAP_LEGEND_MARGIN +
        safeEdgeBleed,
    );
    const maxY = Math.max(
      minY,
      layout.mapRect.y +
        layout.mapRect.height -
        currentRect.height -
        MAP_LEGEND_MARGIN +
        safeEdgeBleed,
    );
    const nextX = clampExportNumber(
      moveStart.startLegendX + deltaX,
      minX,
      maxX,
    );
    const nextY = clampExportNumber(
      moveStart.startLegendY + deltaY,
      minY,
      maxY,
    );
    const availableX = Math.max(0, maxX - minX);
    const availableY = Math.max(0, maxY - minY);

    onPositionChange({
      x: availableX > 0 ? (nextX - minX) / availableX : 0,
      y: availableY > 0 ? (nextY - minY) / availableY : 0,
    });
  }

  function handleLegendOverlayMovePointerDown(
    event: ReactPointerEvent<HTMLElement>,
  ) {
    if (!layout) return;
    beginOverlayMove(event, legendOverlayMoveStartRef, layout.legendRect, true);
  }

  function handleLegendOverlayMovePointerMove(
    event: ReactPointerEvent<HTMLElement>,
  ) {
    if (!layout) return;
    moveOverlay(
      event,
      legendOverlayMoveStartRef,
      layout.legendRect,
      setLegendMapPosition,
      setIsLegendOverlayMoving,
      appearance.mapBorderEnabled ? 0 : appearance.mapPadding,
    );
  }

  function handleLegendOverlayMovePointerUp(
    event: ReactPointerEvent<HTMLElement>,
  ) {
    clearOverlayMove(
      legendOverlayMoveStartRef,
      setIsLegendOverlayMoving,
      event.pointerId,
    );
  }

  function getCurrentLegendTitleRect() {
    if (!layout) return null;

    return createMapLegendTitleRect(
      layout.mapRect,
      appearance,
      legendMapTitlePosition,
      legendTitle,
    );
  }

  function handleLegendTitleMovePointerDown(
    event: ReactPointerEvent<HTMLElement>,
  ) {
    const titleRect = getCurrentLegendTitleRect();
    if (!titleRect) return;

    beginOverlayMove(event, legendTitleMoveStartRef, titleRect, true);
  }

  function handleLegendTitleMovePointerMove(
    event: ReactPointerEvent<HTMLElement>,
  ) {
    const titleRect = getCurrentLegendTitleRect();
    if (!titleRect) return;

    moveOverlay(
      event,
      legendTitleMoveStartRef,
      titleRect,
      setLegendMapTitlePosition,
      setIsLegendTitleMoving,
      Math.max(2, appearance.mapPadding),
    );
  }

  function handleLegendTitleMovePointerUp(
    event: ReactPointerEvent<HTMLElement>,
  ) {
    clearOverlayMove(
      legendTitleMoveStartRef,
      setIsLegendTitleMoving,
      event.pointerId,
    );
  }

  function handleLegendEntryMove(input: {
    groupKey: string;
    targetSection: string;
    beforeGroupKey?: string;
  }) {
    const movedEntry = visibleLegendEntries.find(
      (entry) => entry.dedupeKey === input.groupKey,
    );

    if (!movedEntry) {
      return;
    }

    if (input.beforeGroupKey === input.groupKey) {
      return;
    }

    if (
      !input.beforeGroupKey &&
      movedEntry.section === input.targetSection &&
      visibleLegendEntries[visibleLegendEntries.length - 1]?.dedupeKey ===
        input.groupKey
    ) {
      return;
    }

    // On réordonne la liste complète, y compris les groupes actuellement
    // masqués. Sinon leur clé disparaît de legendGroupOrder et ils perdent
    // leur place lorsqu’ils sont réaffichés.
    const nextEntries = allLegendEntries.filter(
      (entry) => entry.dedupeKey !== input.groupKey,
    );
    const targetIndex = input.beforeGroupKey
      ? nextEntries.findIndex(
          (entry) => entry.dedupeKey === input.beforeGroupKey,
        )
      : -1;

    const movedEntryWithSection = {
      ...movedEntry,
      section: input.targetSection,
    };

    if (targetIndex === -1) {
      nextEntries.push(movedEntryWithSection);
    } else {
      nextEntries.splice(targetIndex, 0, movedEntryWithSection);
    }

    setLegendGroupSection(input.groupKey, input.targetSection);
    if (input.groupKey.startsWith("custom:")) {
      updateCustomLegendEntry(input.groupKey.slice("custom:".length), {
        section: input.targetSection,
      });
    }
    // L’ordre visuel de la légende doit rester totalement indépendant de
    // l’ordre des features sources. Une entrée automatique de superposition
    // réutilise les IDs des zones qui la composent : réordonner ces IDs ici
    // changeait sa couleur calculée, sa clé, son libellé et sa visibilité.
    setLegendGroupOrder(nextEntries.map((entry) => entry.dedupeKey));
  }

  function handleLegendGroupLabelChange(groupKey: string, label: string) {
    setLegendGroupLabel(groupKey, label);

    if (groupKey.startsWith("custom:")) {
      updateCustomLegendEntry(groupKey.slice("custom:".length), { label });
    }

    const entry = allLegendEntries.find(
      (candidate) => candidate.dedupeKey === groupKey,
    );

    if (!entry) {
      return;
    }

    for (const feature of entry.features) {
      updateFeature(feature.id, {
        ...feature,
        properties: {
          ...feature.properties,
          legendLabel: label,
        },
      });
    }
  }

  function handleLegendEntryHide(entry: LegendEntry) {
    // Chaque entrée est masquée par sa clé de groupe. Ainsi, une zone et la
    // nuance de superposition calculée à partir de cette zone restent deux
    // éléments totalement indépendants dans la légende.
    if (!hiddenLegendGroupKeys.includes(entry.dedupeKey)) {
      toggleLegendGroupVisibility(entry.dedupeKey);
    }
  }

  function handleLegendEntryShow(entry: LegendEntry) {
    if (hiddenLegendGroupKeys.includes(entry.dedupeKey)) {
      toggleLegendGroupVisibility(entry.dedupeKey);
      return;
    }

    // Restauration des anciens projets qui utilisaient encore les IDs de
    // features au lieu d'une clé de groupe dédiée.
    const hiddenFeatureIds = new Set(hiddenLegendFeatureIds);

    for (const featureId of entry.featureIds) {
      if (hiddenFeatureIds.has(featureId)) {
        toggleLegendFeatureVisibility(featureId);
      }
    }
  }

  function requestMapElementDisable(element: "scale-bar" | "north-arrow") {
    setPendingMapElementDisable(element);
  }

  function handleScaleBarEnabledChange(enabled: boolean) {
    if (enabled) {
      setScaleBarEnabled(true);
      return;
    }

    requestMapElementDisable("scale-bar");
  }

  function handleNorthArrowEnabledChange(enabled: boolean) {
    if (enabled) {
      setNorthArrowEnabled(true);
      return;
    }

    requestMapElementDisable("north-arrow");
  }

  function confirmMapElementDisable() {
    if (pendingMapElementDisable === "scale-bar") {
      setScaleBarEnabled(false);
    } else if (pendingMapElementDisable === "north-arrow") {
      setNorthArrowEnabled(false);
    }

    setPendingMapElementDisable(null);
  }

  const mapElementsSharePosition =
    scaleBarEnabled &&
    northArrowEnabled &&
    !scaleBarMapPosition &&
    !northArrowMapPosition &&
    scaleBarPosition === northArrowPosition;
  const northArrowCollisionOffset = mapElementsSharePosition ? 56 : 0;

  const resizeHandleStyle = useMemo<CSSProperties>(() => {
    if (!layout) {
      return {};
    }

    if (legendPosition === "bottom") {
      return {
        left: layout.legendRect.x,
        top: layout.legendRect.y - EXPORT_LAYOUT_GAP / 2 - 10,
        width: layout.legendRect.width,
        height: 20,
        cursor: "row-resize",
      };
    }

    const x =
      legendPosition === "right"
        ? layout.legendRect.x - EXPORT_LAYOUT_GAP / 2 - 10
        : layout.legendRect.x +
          layout.legendRect.width +
          EXPORT_LAYOUT_GAP / 2 -
          10;

    return {
      left: x,
      top: layout.contentRect.y,
      width: 20,
      height: layout.contentRect.height,
      cursor: "col-resize",
    };
  }, [layout, legendPosition]);

  const hiddenEntriesCount = hiddenLegendEntries.length;

  if (!layout || !workspaceBounds) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Aucune zone de travail à prévisualiser.
      </div>
    );
  }

  const mapLegendTitleRect =
    hasVisibleLegendTitle && legendPosition === "map"
      ? createMapLegendTitleRect(
          layout.mapRect,
          appearance,
          legendMapTitlePosition,
          legendTitle,
        )
      : null;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {isAdvancedLegendEditorOpen ? (
        <AdvancedLegendEditor
          entries={allLegendEntries}
          mapVisualZoom={mapVisualZoom}
          fallbackReferenceZoom={workspaceBasemapZoom}
          onClose={() => setIsAdvancedLegendEditorOpen(false)}
          previewScene={{
            width: layout.canvasWidth,
            height: layout.canvasHeight,
            focusRect: createAdvancedLegendFocusRect(
              layout.canvasWidth,
              layout.canvasHeight,
              layout.legendRect,
              mapLegendTitleRect,
            ),
            content: (
              <div
                className="relative overflow-hidden bg-white"
                style={{
                  width: layout.canvasWidth,
                  height: layout.canvasHeight,
                }}
              >
                <div
                  className="absolute overflow-hidden border border-slate-400 bg-slate-100"
                  style={rectToStyle(layout.mapRect)}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(135deg, #dbeafe 0%, #f8fafc 42%, #dcfce7 100%)",
                    }}
                  />
                  <div
                    className="absolute inset-0 opacity-25"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(15,23,42,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.14) 1px, transparent 1px)",
                      backgroundSize: "64px 64px",
                    }}
                  />
                  <ExportScaleBarPreview
                    enabled={scaleBarEnabled}
                    style={scaleBarStyle}
                    position={scaleBarPosition}
                    mapPosition={scaleBarMapPosition}
                    workspaceBounds={workspaceBounds}
                    mapRect={layout.mapRect}
                    onMapPositionChange={setScaleBarMapPosition}
                    onRequestDisable={() => undefined}
                  />
                  <ExportNorthArrowPreview
                    enabled={northArrowEnabled}
                    style={northArrowStyle}
                    position={northArrowPosition}
                    mapPosition={northArrowMapPosition}
                    collisionOffset={northArrowCollisionOffset}
                    mapRect={layout.mapRect}
                    onMapPositionChange={setNorthArrowMapPosition}
                    onRequestDisable={() => undefined}
                  />
                </div>

                {mapLegendTitleRect ? (
                  <ExportMapLegendTitlePreview
                    title={legendTitle}
                    rect={mapLegendTitleRect}
                    appearance={appearance}
                    onTitleChange={setLegendTitle}
                    onTitleRemove={() => setLegendTitle("")}
                    onPointerDownCapture={() => undefined}
                    onPointerMove={() => undefined}
                    onPointerUp={() => undefined}
                    isMoving={false}
                  />
                ) : null}

                {shouldRenderLegendPanel ? (
                  <ExportLegendPreview
                    title={legendPosition === "map" ? "" : legendTitle}
                    entries={visibleLegendEntries}
                    displayItems={visibleLegendDisplayItems}
                    rect={layout.legendRect}
                    legendPosition={legendPosition}
                    appearance={appearance}
                    hiddenLegendFeatureIds={hiddenLegendFeatureIds}
                    showAlwaysVisibleHideControls
                    onTitleChange={setLegendTitle}
                    onTitleRemove={() => setLegendTitle("")}
                    onRenameSection={renameLegendSection}
                    onEntryLabelChange={handleLegendGroupLabelChange}
                    onEntryHide={handleLegendEntryHide}
                    onEntryMove={handleLegendEntryMove}
                    onRemoveSection={removeLegendSection}
                  />
                ) : null}
              </div>
            ),
          }}
        />
      ) : null}

      <div
        className="relative z-[1750] flex shrink-0 flex-nowrap items-center gap-1.5 border-b border-slate-200 bg-white px-2 py-1.5"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => addLegendSection()}
          className="rounded-xl border border-indigo-300 bg-indigo-50 px-2.5 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
          title="Ajouter une sous-légende directement dans la légende"
        >
          + Sous-légende
        </button>

        {hiddenEntriesCount > 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsHiddenListOpen((isOpen) => !isOpen)}
              className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              title="Réafficher des groupes masqués"
            >
              Masqués ({hiddenEntriesCount})
            </button>

            {isHiddenListOpen ? (
              <div
                className="absolute left-0 top-full z-[1900] mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Éléments masqués
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {hiddenLegendEntries.map((entry) => (
                    <div
                      key={entry.dedupeKey}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-slate-50"
                    >
                      <span className="min-w-0 truncate font-medium text-slate-700">
                        {entry.label || "Sans nom"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          handleLegendEntryShow(entry);
                          setIsHiddenListOpen(false);
                        }}
                        className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        Réafficher
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {safeLegendTitle.length === 0 ? (
          <button
            type="button"
            onClick={() => setLegendTitle("Légende")}
            className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            title="Ajouter un titre de légende"
          >
            + Titre
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setIsAdvancedLegendEditorOpen((isOpen) => !isOpen)}
          className={`rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
            isAdvancedLegendEditorOpen
              ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
          title="Ouvrir les réglages avancés de la légende"
        >
          Édition avancée
        </button>

        <div
          className="flex w-44 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5"
          title="Augmenter ou réduire tous les figurés de légende en même temps"
        >
          <span className="text-[11px] font-semibold text-slate-700">
            Figurés
          </span>
          <input
            type="range"
            min={24}
            max={144}
            step={2}
            value={legendSymbolSize}
            onChange={(event) =>
              setLegendSymbolSize(Number(event.currentTarget.value))
            }
            className="min-w-0 flex-1 accent-indigo-600"
            aria-label="Taille globale des figurés de légende"
          />
          <span className="w-9 text-right text-[10px] font-bold tabular-nums text-slate-500">
            {Math.round(
              getExportLegendGlobalSymbolScale(legendSymbolSize) * 100,
            )}
            %
          </span>
        </div>

        <div className="mx-0.5 h-8 w-px bg-slate-200" />

        <MapElementControls
          scaleBarEnabled={scaleBarEnabled}
          scaleBarStyle={scaleBarStyle}
          scaleBarPosition={scaleBarPosition}
          northArrowEnabled={northArrowEnabled}
          northArrowStyle={northArrowStyle}
          northArrowPosition={northArrowPosition}
          onScaleEnabledChange={handleScaleBarEnabledChange}
          onScaleStyleChange={setScaleBarStyle}
          onScalePositionChange={setScaleBarPosition}
          onNorthEnabledChange={handleNorthArrowEnabledChange}
          onNorthStyleChange={setNorthArrowStyle}
          onNorthPositionChange={setNorthArrowPosition}
        />

        {basemap.kind === "maplibre" ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowBasemapLabels(!showBasemapLabels);
            }}
            className={[
              "shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition",
              showBasemapLabels
                ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                : "border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100",
            ].join(" ")}
            title={
              showBasemapLabels
                ? "Masquer les noms, rues et autres écritures du fond vectoriel"
                : "Réafficher les écritures du fond vectoriel"
            }
          >
            {showBasemapLabels
              ? "Masquer les écritures du fond"
              : "Réafficher les écritures du fond"}
          </button>
        ) : null}

        {canAdjustBasemapDetail ? (
          <div
            className="ml-auto flex w-[260px] max-w-[30vw] shrink-0 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-1"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700">
                <span>Détail du fond</span>
                <span className="tabular-nums text-slate-500">
                  z{formatBasemapDetailZoom(basemapDetailZoomValue)} ·{" "}
                  {formatBasemapDetailDelta(
                    basemapDetailZoomValue,
                    baseBasemapDetailZoom,
                  )}
                </span>
              </div>
              <input
                type="range"
                min={minPreviewBasemapDetailZoom}
                max={maxPreviewBasemapDetailZoom}
                step={PREVIEW_BASEMAP_DETAIL_STEP}
                value={basemapDetailZoomValue}
                onChange={handleBasemapDetailChange}
                className="mt-0.5 w-full accent-indigo-600"
                title="Change la quantité de détails du fond vectoriel sans modifier la zone de travail"
              />
            </div>
          </div>
        ) : (
          <div className="ml-auto" />
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={viewportRef}
          className="h-full min-h-0 overflow-auto bg-slate-200 p-2"
        >
          <div
            className="relative mx-auto"
            style={{
              width: layout.canvasWidth * scale,
              height: layout.canvasHeight * scale,
              minWidth: layout.canvasWidth * scale,
              minHeight: layout.canvasHeight * scale,
            }}
          >
            <div
              id={EXPORT_CAPTURE_ELEMENT_ID}
              className="absolute left-0 top-0 overflow-hidden bg-white shadow-xl ring-1 ring-slate-300"
              style={{
                width: layout.canvasWidth,
                height: layout.canvasHeight,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <div
                className="absolute overflow-hidden border border-slate-400 bg-slate-100"
                style={rectToStyle(layout.mapRect)}
              >
                <ExportLeafletPreview symbolScale={layout.mapRenderScale} />
                <ExportScaleBarPreview
                  enabled={scaleBarEnabled}
                  style={scaleBarStyle}
                  position={scaleBarPosition}
                  mapPosition={scaleBarMapPosition}
                  workspaceBounds={workspaceBounds}
                  mapRect={layout.mapRect}
                  onMapPositionChange={setScaleBarMapPosition}
                  onRequestDisable={() => requestMapElementDisable("scale-bar")}
                />
                <ExportNorthArrowPreview
                  enabled={northArrowEnabled}
                  style={northArrowStyle}
                  position={northArrowPosition}
                  mapPosition={northArrowMapPosition}
                  collisionOffset={northArrowCollisionOffset}
                  mapRect={layout.mapRect}
                  onMapPositionChange={setNorthArrowMapPosition}
                  onRequestDisable={() =>
                    requestMapElementDisable("north-arrow")
                  }
                />
              </div>

              {mapLegendTitleRect ? (
                <ExportMapLegendTitlePreview
                  title={legendTitle}
                  rect={mapLegendTitleRect}
                  appearance={appearance}
                  onTitleChange={setLegendTitle}
                  onTitleRemove={() => setLegendTitle("")}
                  onPointerDownCapture={handleLegendTitleMovePointerDown}
                  onPointerMove={handleLegendTitleMovePointerMove}
                  onPointerUp={handleLegendTitleMovePointerUp}
                  isMoving={isLegendTitleMoving}
                />
              ) : null}

              {shouldRenderLegendPanel ? (
                <ExportLegendPreview
                  title={legendPosition === "map" ? "" : legendTitle}
                  entries={visibleLegendEntries}
                  displayItems={visibleLegendDisplayItems}
                  rect={layout.legendRect}
                  legendPosition={legendPosition}
                  appearance={appearance}
                  hiddenLegendFeatureIds={hiddenLegendFeatureIds}
                  suspendEntryDrag={isLegendOverlayMoving}
                  onContainerPointerDownCapture={
                    legendPosition === "map"
                      ? handleLegendOverlayMovePointerDown
                      : undefined
                  }
                  onContainerPointerMove={
                    legendPosition === "map"
                      ? handleLegendOverlayMovePointerMove
                      : undefined
                  }
                  onContainerPointerUp={
                    legendPosition === "map"
                      ? handleLegendOverlayMovePointerUp
                      : undefined
                  }
                  onTitleChange={setLegendTitle}
                  onTitleRemove={() => setLegendTitle("")}
                  onRenameSection={renameLegendSection}
                  onEntryLabelChange={handleLegendGroupLabelChange}
                  onEntryHide={handleLegendEntryHide}
                  onEntryMove={handleLegendEntryMove}
                  onRemoveSection={removeLegendSection}
                />
              ) : null}

              {hasVisibleLegend && legendPosition !== "map" ? (
                <button
                  type="button"
                  onPointerDown={handleResizePointerDown}
                  onPointerMove={handleResizePointerMove}
                  onPointerUp={handleResizePointerUp}
                  onPointerCancel={handleResizePointerUp}
                  className="absolute z-[1200] rounded-full bg-indigo-600/80 outline-none ring-4 ring-white/80 transition hover:bg-indigo-500"
                  style={resizeHandleStyle}
                  title="Tirer pour redimensionner la légende"
                >
                  <span className="sr-only">Redimensionner la légende</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {pendingMapElementDisable ? (
        <div
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[1px]"
          onClick={() => setPendingMapElementDisable(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-element-disable-title"
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="map-element-disable-title"
              className="text-base font-semibold text-slate-950"
            >
              Désactiver{" "}
              {pendingMapElementDisable === "scale-bar"
                ? "l’échelle"
                : "la flèche du nord"}{" "}
              ?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Cet élément ne sera plus visible dans la prévisualisation ni dans
              les exports. Tu pourras le réactiver à tout moment.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingMapElementDisable(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Conserver
              </button>
              <button
                type="button"
                onClick={confirmMapElementDisable}
                className="rounded-xl border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Désactiver
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
