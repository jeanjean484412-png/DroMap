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
  MIN_LEGEND_BOTTOM_HEIGHT,
  MIN_LEGEND_SIDE_WIDTH,
  clampExportNumber,
  createExportLayout,
  getExportFormatLabel,
  getSafeLegendTitle,
  getVisibleLegendFeatures,
  normalizeLegendAppearance,
} from "./export-layout";
import type { ExportCanvasRect } from "./export-layout";
import {
  DEFAULT_EXPORT_LEGEND_SECTION,
  createExportLegendDisplayItems,
  createExportLegendLayout,
  isDefaultLegendSection,
  type ExportLegendDisplayItem,
} from "./export-legend-layout";
import { getLegendEntries, type LegendEntry } from "./legend-entry";
import { createExportScaleBarModel } from "./export-scale";
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
  { value: "boxed", label: "Cartouche" },
];

type ResizeStartState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startSideWidth: number;
  startBottomHeight: number;
  scale: number;
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
}: {
  feature: DroMapFeature;
  color: string;
  lineStartX: number;
  lineEndX: number;
  centerY: number;
  symbolWeight: number;
  freehandPath: string;
}) {
  const dashStyle = getLegendDashStyle(feature);

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
    const dotCount = Math.max(
      5,
      Math.min(8, Math.floor((lineEndX - lineStartX) / 7)),
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

  const segmentCount = Math.max(
    3,
    Math.min(4, Math.floor((lineEndX - lineStartX) / 13)),
  );
  const totalWidth = lineEndX - lineStartX;
  const gap = Math.max(5, symbolWeight * 1.15);
  const segmentLength = Math.max(
    8,
    (totalWidth - gap * (segmentCount - 1)) / segmentCount,
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
}: {
  feature: DroMapFeature;
  color: string;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth: number;
}) {
  const dashStyle = getLegendDashStyle(feature);

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
    const topBottomCount = Math.max(5, Math.round(width / 7));
    const sideCount = Math.max(4, Math.round(height / 6));
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
  const horizontalSegments = 3;
  const verticalSegments = 2;
  const horizontalGap = Math.max(5, width * 0.08);
  const verticalGap = Math.max(4, height * 0.12);
  const horizontalLength =
    (width - horizontalGap * (horizontalSegments - 1)) / horizontalSegments;
  const verticalLength =
    (height - verticalGap * (verticalSegments - 1)) / verticalSegments;

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

function LegendSymbol({ feature }: { feature: DroMapFeature }) {
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
    const displaySize = Math.max(
      14,
      Math.min(getFeatureMarkerSize(feature), 34),
    );

    return (
      <span
        className="inline-block leading-none"
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
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  multiline?: boolean;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(value);
    }
  }, [isEditing, value]);

  function commit() {
    setIsEditing(false);
    onCommit(draftValue);
  }

  function cancel(target: HTMLInputElement | HTMLTextAreaElement) {
    setDraftValue(value);
    setIsEditing(false);
    target.blur();
  }

  const sharedProps = {
    value: draftValue,
    placeholder,
    onFocus: () => setIsEditing(true),
    onChange: (
      event: ReactChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraftValue(event.target.value),
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
    style,
  };

  if (multiline) {
    return <textarea {...sharedProps} rows={1} />;
  }

  return <input {...sharedProps} type="text" />;
}

function ExportLegendPreview({
  title,
  entries,
  displayItems,
  rect,
  legendPosition,
  backgroundColor,
  titleFontSize,
  sectionTitleFontSize,
  itemFontSize,
  hiddenLegendFeatureIds,
  onTitleChange,
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
  legendPosition: "left" | "right" | "bottom";
  backgroundColor: string;
  titleFontSize: number;
  sectionTitleFontSize: number;
  itemFontSize: number;
  hiddenLegendFeatureIds: string[];
  onTitleChange: (title: string) => void;
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
  const asideRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<LegendPointerDragState | null>(null);
  const lastPointerMoveSignatureRef = useRef<string | null>(null);
  const [pointerDrag, setPointerDrag] = useState<LegendPointerDragState | null>(
    null,
  );
  const colors = getReadableLegendTextColors(backgroundColor);
  const separatorColor = getLegendSeparatorColor(backgroundColor);
  const legendLayout = createExportLegendLayout({
    legendRect: rect,
    displayItems,
    legendPosition,
    appearance: {
      backgroundColor,
      sideWidth: rect.width,
      bottomHeight: rect.height,
      titleFontSize,
      sectionTitleFontSize,
      itemFontSize,
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
    if (event.button !== 0) {
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

  return (
    <aside
      ref={asideRef}
      className="absolute z-[1000] overflow-visible border"
      onDragStart={(event) => event.preventDefault()}
      style={{
        ...rectToStyle(rect),
        backgroundColor,
        borderColor: colors.borderColor,
      }}
    >
      <div className="absolute inset-0 overflow-hidden">
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
          <EditableLegendText
            value={safeTitle}
            onCommit={onTitleChange}
            multiline
            placeholder="Titre de légende"
            className="absolute resize-none overflow-hidden rounded border border-transparent bg-transparent p-0 font-bold outline-none hover:border-slate-300 hover:bg-white/70 focus:border-indigo-400 focus:bg-white/90 focus:ring-2 focus:ring-indigo-200"
            style={{
              left: legendLayout.titleX - rect.x,
              top: legendLayout.titleY - rect.y - titleFontSize,
              width: legendLayout.titleMaxWidth,
              minHeight: legendLayout.titleHeight,
              color: colors.titleColor,
              fontSize: titleFontSize,
              lineHeight: `${legendLayout.titleLineHeight}px`,
              whiteSpace: "normal",
            }}
          />
        ) : null}

        {entries.length === 0 && displayItems.length === 0 ? (
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
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    className="group/section absolute min-w-0 overflow-hidden rounded-lg border border-transparent px-1 hover:border-indigo-200 hover:bg-indigo-50/60"
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
                      className="absolute left-0 top-0 min-w-0 max-w-[calc(100%-42px)] rounded border border-transparent bg-transparent px-2 py-1 font-bold uppercase tracking-[0.12em] outline-none hover:border-slate-300 hover:bg-white/70 focus:border-indigo-400 focus:bg-white/95 focus:ring-2 focus:ring-indigo-200"
                      style={{
                        color: colors.titleColor,
                        fontSize: legendLayout.sectionFontSize,
                      }}
                    />

                    {!legendLayout.isBottomSectionColumnMode ? (
                      <span
                        className="absolute left-0 right-0 rounded-full shadow-sm"
                        style={{
                          top: Math.min(
                            item.height - 5,
                            Math.max(
                              legendLayout.sectionFontSize + 12,
                              Math.round(item.height * 0.72),
                            ),
                          ),
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
              const symbolY =
                item.y -
                rect.y +
                Math.max(
                  0,
                  (legendLayout.itemHeight - legendLayout.symbolSize) / 2,
                );
              const textMaxWidth = Math.max(
                20,
                item.width -
                  legendLayout.symbolBoxWidth -
                  legendLayout.textGap -
                  50,
              );
              const isHidden = entry.featureIds.every((featureId) =>
                hiddenLegendFeatureIds.includes(featureId),
              );

              return (
                <li
                  key={displayItem.id}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  onPointerDown={(event) =>
                    handleEntryPointerDown(event, entry)
                  }
                  className="group absolute flex min-w-0 cursor-grab items-center overflow-hidden rounded-lg border border-transparent active:cursor-grabbing hover:border-indigo-200 hover:bg-indigo-50/50"
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
                    className="absolute flex shrink-0 items-center justify-center"
                    style={{
                      left: 0,
                      top: symbolY - (item.y - rect.y),
                      width: legendLayout.symbolBoxWidth,
                      height: legendLayout.symbolSize,
                    }}
                  >
                    <LegendSymbol feature={feature} />
                  </span>

                  <span
                    className="absolute min-w-0"
                    style={{
                      left: legendLayout.symbolBoxWidth + legendLayout.textGap,
                      top: Math.max(
                        0,
                        Math.round(
                          (legendLayout.itemHeight - itemFontSize) / 2,
                        ),
                      ),
                      width: textMaxWidth,
                    }}
                  >
                    <EditableLegendText
                      value={entry.label}
                      onCommit={(nextValue) =>
                        onEntryLabelChange(entry.dedupeKey, nextValue)
                      }
                      placeholder="Nom"
                      className="block w-full truncate rounded border border-transparent bg-transparent p-0 font-medium outline-none hover:border-slate-300 hover:bg-white/70 focus:border-indigo-400 focus:bg-white/90 focus:ring-2 focus:ring-indigo-200"
                      style={{
                        color: colors.textColor,
                        fontSize: itemFontSize,
                        lineHeight: 1.12,
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
                    className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-500 opacity-0 shadow-md transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100"
                    title="Masquer ce groupe dans la légende"
                    aria-label="Masquer ce groupe dans la légende"
                  >
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
              whiteSpace: "normal",
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
          <LegendSymbol feature={draggedEntry.representativeFeature} />
          <span className="min-w-0 truncate">
            {draggedEntry.label || "Sans nom"}
          </span>
        </div>
      ) : null}
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

function ExportScaleBarPreview(input: {
  enabled: boolean;
  style: ExportScaleBarStyle;
  workspaceBounds: WorkspaceBounds | null;
  mapRect: ExportCanvasRect;
}) {
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

  return (
    <div
      className={[
        "pointer-events-none absolute bottom-4 left-4 z-[900] select-none rounded-md px-2 py-1.5 text-[12px] font-semibold leading-none text-slate-950",
        isBoxed
          ? "border border-slate-900/25 bg-white/95 shadow-sm"
          : "bg-white/85 shadow-sm",
      ].join(" ")}
      style={{ minWidth: model.widthPx + 16 }}
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
          className="h-2 border border-white bg-slate-950"
          style={{ width: model.widthPx }}
        />
      )}
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
  const [isHiddenListOpen, setIsHiddenListOpen] = useState(false);

  const legendTitle = useEditorTestExportStore((state) => state.legendTitle);
  const setLegendTitle = useEditorTestExportStore(
    (state) => state.setLegendTitle,
  );
  const legendPosition = useEditorTestExportStore(
    (state) => state.legendPosition,
  );
  const exportFormat = useEditorTestExportStore((state) => state.exportFormat);

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

  const hiddenLegendFeatureIds = useEditorTestExportStore(
    (state) => state.hiddenLegendFeatureIds,
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
  const setScaleBarEnabled = useEditorTestExportStore(
    (state) => state.setScaleBarEnabled,
  );
  const setScaleBarStyle = useEditorTestExportStore(
    (state) => state.setScaleBarStyle,
  );
  const setLegendGroupLabel = useEditorTestExportStore(
    (state) => state.setLegendGroupLabel,
  );
  const setLegendGroupSection = useEditorTestExportStore(
    (state) => state.setLegendGroupSection,
  );
  const setLegendGroupOrder = useEditorTestExportStore(
    (state) => state.setLegendGroupOrder,
  );
  const setLegendFeatureOrder = useEditorTestExportStore(
    (state) => state.setLegendFeatureOrder,
  );
  const toggleLegendFeatureVisibility = useEditorTestExportStore(
    (state) => state.toggleLegendFeatureVisibility,
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
      }),
    [
      legendBackgroundColor,
      legendSideWidth,
      legendBottomHeight,
      legendTitleFontSize,
      legendItemFontSize,
      legendSectionTitleFontSize,
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
    [
      allLegendFeatures,
      geoJsonLayers,
      legendGroupLabels,
      legendGroupSections,
      legendGroupOrder,
      workspaceBounds,
    ],
  );

  const hiddenLegendEntries = useMemo(
    () =>
      allLegendEntries.filter((entry) =>
        entry.featureIds.every((featureId) =>
          hiddenLegendFeatureIds.includes(featureId),
        ),
      ),
    [allLegendEntries, hiddenLegendFeatureIds],
  );

  const visibleLegendFeatures = useMemo(
    () =>
      getVisibleLegendFeatures({
        features,
        hiddenLegendFeatureIds,
        legendFeatureOrder,
      }),
    [features, hiddenLegendFeatureIds, legendFeatureOrder],
  );

  const visibleLegendEntries = useMemo(
    () =>
      mergeLegendEntriesWithGeoJsonLayers(
        getLegendEntries(visibleLegendFeatures, {
          legendGroupLabels,
          legendGroupSections,
          legendGroupOrder,
        }),
        geoJsonLayers,
        {
          legendGroupLabels,
          legendGroupSections,
          legendGroupOrder,
          hiddenLegendFeatureIds,
          workspaceBounds,
        },
      ),
    [
      visibleLegendFeatures,
      geoJsonLayers,
      hiddenLegendFeatureIds,
      legendGroupLabels,
      legendGroupSections,
      legendGroupOrder,
      workspaceBounds,
    ],
  );

  const visibleLegendDisplayItems = useMemo(
    () =>
      createExportLegendDisplayItems(visibleLegendEntries, {
        legendSectionOrder,
        includeEmptySections: true,
      }),
    [visibleLegendEntries, legendSectionOrder],
  );

  const layout = useMemo(() => {
    if (!workspaceBounds) {
      return null;
    }

    return createExportLayout({
      workspaceBounds,
      legendPosition,
      exportFormat,
      legendFeaturesCount: visibleLegendDisplayItems.length,
      appearance,
    });
  }, [
    workspaceBounds,
    legendPosition,
    exportFormat,
    visibleLegendDisplayItems.length,
    appearance,
  ]);

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
    const signedDelta = legendPosition === "right" ? deltaX : -deltaX;
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

    const nextEntries = visibleLegendEntries.filter(
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
    setLegendGroupOrder(nextEntries.map((entry) => entry.dedupeKey));
    setLegendFeatureOrder(nextEntries.flatMap((entry) => entry.featureIds));
  }

  function handleLegendGroupLabelChange(groupKey: string, label: string) {
    setLegendGroupLabel(groupKey, label);

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
    const hiddenFeatureIds = new Set(hiddenLegendFeatureIds);

    for (const featureId of entry.featureIds) {
      if (!hiddenFeatureIds.has(featureId)) {
        toggleLegendFeatureVisibility(featureId);
      }
    }
  }

  function handleLegendEntryShow(entry: LegendEntry) {
    const hiddenFeatureIds = new Set(hiddenLegendFeatureIds);

    for (const featureId of entry.featureIds) {
      if (hiddenFeatureIds.has(featureId)) {
        toggleLegendFeatureVisibility(featureId);
      }
    }
  }

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

  const safeLegendTitle = getSafeLegendTitle(legendTitle);
  const hiddenEntriesCount = hiddenLegendEntries.length;

  if (!layout || !workspaceBounds) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Aucune zone de travail à prévisualiser.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="relative z-[1600] flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">
              Prévisualisation WYSIWYG
            </div>

            <div className="text-xs text-slate-500">
              {layout.canvasWidth} × {layout.canvasHeight}px · aperçu{" "}
              {Math.round(scale * 100)}% · objets taille éditeur
            </div>
          </div>

          <div className="relative flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                addLegendSection();
              }}
              className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100"
              title="Ajouter une sous-légende directement dans la légende"
            >
              + Sous-légende
            </button>

            {hiddenEntriesCount > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsHiddenListOpen((isOpen) => !isOpen);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  title="Réafficher des groupes masqués"
                >
                  Masqués ({hiddenEntriesCount})
                </button>

                {isHiddenListOpen ? (
                  <div
                    className="absolute left-0 top-full z-[1700] mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-xl"
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
                onClick={(event) => {
                  event.stopPropagation();
                  setLegendTitle("Légende");
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                title="Ajouter un titre de légende"
              >
                + Titre
              </button>
            ) : null}
          </div>
        </div>

        {canAdjustBasemapDetail ? (
          <div
            className="flex min-w-[260px] max-w-sm flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm"
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
                className="mt-1 w-full accent-indigo-600"
                title="Change la quantité de détails du fond OpenFreeMap sans modifier la zone de travail"
              />

              <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] leading-tight text-slate-500">
                <span>-{PREVIEW_BASEMAP_DETAIL_DELTA}</span>
                <span>
                  base z{formatBasemapDetailZoom(baseBasemapDetailZoom)}
                </span>
                <span>+{PREVIEW_BASEMAP_DETAIL_DELTA}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div
          className="flex shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm"
          onClick={(event) => event.stopPropagation()}
        >
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={scaleBarEnabled}
              onChange={(event) =>
                setScaleBarEnabled(event.currentTarget.checked)
              }
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Échelle
          </label>

          <select
            value={scaleBarStyle}
            onChange={(event) =>
              setScaleBarStyle(event.currentTarget.value as ExportScaleBarStyle)
            }
            disabled={!scaleBarEnabled}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            title="Choisir le style d’échelle affiché dans la preview et dans l’export"
          >
            {EXPORT_SCALE_BAR_STYLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="shrink-0 text-right text-xs text-slate-500">
          <div>Format : {getExportFormatLabel(exportFormat)}</div>
          <div>
            Légende :{" "}
            {legendPosition === "right"
              ? "à droite"
              : legendPosition === "left"
                ? "à gauche"
                : "en bas"}
          </div>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-auto bg-slate-200 p-4"
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
                workspaceBounds={workspaceBounds}
                mapRect={layout.mapRect}
              />
            </div>

            <ExportLegendPreview
              title={legendTitle}
              entries={visibleLegendEntries}
              displayItems={visibleLegendDisplayItems}
              rect={layout.legendRect}
              legendPosition={legendPosition}
              backgroundColor={appearance.backgroundColor}
              titleFontSize={appearance.titleFontSize}
              sectionTitleFontSize={appearance.sectionTitleFontSize}
              itemFontSize={appearance.itemFontSize}
              hiddenLegendFeatureIds={hiddenLegendFeatureIds}
              onTitleChange={setLegendTitle}
              onRenameSection={renameLegendSection}
              onEntryLabelChange={handleLegendGroupLabelChange}
              onEntryHide={handleLegendEntryHide}
              onEntryMove={handleLegendEntryMove}
              onRemoveSection={removeLegendSection}
            />

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
          </div>
        </div>
      </div>
    </div>
  );
}
