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
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
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
import { getFeatureDashStyle, getFeatureMarkerSize } from "./feature-style";

import { getMarkerSymbolHtml } from "./marker-symbol";
import {
  featureHasArrowEnd,
  featureHasArrowStart,
  featureHasLineArrow,
} from "./line-arrow";

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

function getFeatureOpacity(feature: DroMapFeature) {
  const opacity = feature.properties?.style?.opacity ?? 1;

  return featureHasLineArrow(feature) && opacity <= 0.05 ? 1 : opacity;
}

function getFeatureFillOpacity(feature: DroMapFeature) {
  return feature.properties?.style?.fillOpacity ?? 0.3;
}

function getFeatureWeight(feature: DroMapFeature) {
  return feature.properties?.style?.weight ?? 3;
}

function getLegendLineDashArray(feature: DroMapFeature, lineWidth: number) {
  const dashStyle = getFeatureDashStyle(feature);

  if (dashStyle === "solid") {
    return undefined;
  }

  if (dashStyle === "dashed") {
    return `${Math.max(10, lineWidth * 2.5)} ${Math.max(6, lineWidth * 1.5)}`;
  }

  return `0.001 ${Math.max(7, lineWidth * 2)}`;
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
    return (
      <span
        className="inline-flex items-center justify-center rounded border bg-white font-bold"
        style={{
          width: 34,
          height: 34,
          borderColor: "#cbd5e1",
          color,
          opacity,
          fontSize: 20,
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
    const symbolWeight = Math.max(3, Math.min(weight * 1.6, 9));
    const symbolWidth = 62;
    const symbolHeight = 28;
    const centerY = symbolHeight / 2;
    const startX = 2;
    const endX = symbolWidth - 2;
    const hasArrowStart = featureHasArrowStart(feature);
    const hasArrowEnd = featureHasArrowEnd(feature);
    const arrowLength = Math.max(13, Math.min(24, symbolWeight * 2.1));
    const arrowHalfHeight = Math.max(8, symbolWeight * 1.4);
    const startArrowBaseX = startX + arrowLength;
    const endArrowBaseX = endX - arrowLength;
    const lineStartX = hasArrowStart
      ? startArrowBaseX - Math.max(1.5, symbolWeight * 0.45)
      : startX;
    const lineEndX = hasArrowEnd
      ? endArrowBaseX + Math.max(1.5, symbolWeight * 0.45)
      : endX;
    const dashArray = getLegendLineDashArray(feature, symbolWeight);
    const freehandControlOffset = Math.max(7, symbolHeight * 0.26);
    const freehandPath = `M ${lineStartX} ${centerY} C ${lineStartX + (lineEndX - lineStartX) * 0.22} ${centerY - freehandControlOffset}, ${lineStartX + (lineEndX - lineStartX) * 0.44} ${centerY + freehandControlOffset}, ${lineStartX + (lineEndX - lineStartX) * 0.62} ${centerY} C ${lineStartX + (lineEndX - lineStartX) * 0.76} ${centerY - freehandControlOffset}, ${lineStartX + (lineEndX - lineStartX) * 0.9} ${centerY + freehandControlOffset}, ${lineEndX} ${centerY}`;

    return (
      <svg
        width={symbolWidth}
        height={symbolHeight}
        viewBox={`0 0 ${symbolWidth} ${symbolHeight}`}
        aria-hidden="true"
        focusable="false"
        style={{ display: "block", overflow: "visible", opacity }}
      >
        {isFreehandLineFeature(feature) ? (
          <path
            d={freehandPath}
            fill="none"
            stroke={color}
            strokeWidth={symbolWeight}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashArray}
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
            strokeDasharray={dashArray}
          />
        )}

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

  const zoneStrokeWidth = Math.max(3, Math.min(weight * 1.2, 7));
  const zoneDashArray = getLegendLineDashArray(feature, zoneStrokeWidth);

  return (
    <svg
      width={42}
      height={34}
      viewBox="0 0 42 34"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", overflow: "visible" }}
    >
      <rect
        x={7}
        y={6}
        width={28}
        height={22}
        rx={1.5}
        fill={getFeatureFillColor(feature)}
        fillOpacity={Math.max(0.12, getFeatureFillOpacity(feature))}
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={zoneStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={zoneDashArray}
      />
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
    onPointerDown: (event: ReactPointerEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      event.stopPropagation();
    },
    onClick: (event: ReactMouseEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      event.stopPropagation();
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
    ? entries.find((entry) => entry.dedupeKey === pointerDrag.groupKey) ?? null
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

  function getMoveTargetFromPointer(
    clientX: number,
    clientY: number,
  ): LegendMoveTarget | null {
    const localPoint = getLocalPoint(clientX, clientY);

    if (!localPoint) {
      return null;
    }

    for (const [visibleItemIndex, item] of legendLayout.visibleItems.entries()) {
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

  function stopPointerDrag(event?: ReactPointerEvent<HTMLElement>) {
    const currentDragState = dragStateRef.current;

    if (event && currentDragState?.pointerId === event.pointerId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // La capture peut déjà être libérée si le navigateur a annulé le pointeur.
      }
    }

    dragStateRef.current = null;
    lastPointerMoveSignatureRef.current = null;
    setPointerDrag(null);
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
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Certains navigateurs peuvent refuser la capture si le pointeur a déjà changé d'état.
    }
  }

  function handleEntryPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const currentDragState = dragStateRef.current;

    if (!currentDragState || currentDragState.pointerId !== event.pointerId) {
      return;
    }

    const localPoint = getLocalPoint(event.clientX, event.clientY);

    if (!localPoint) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const distance = Math.hypot(
      event.clientX - currentDragState.startClientX,
      event.clientY - currentDragState.startClientY,
    );
    const hasMoved = currentDragState.hasMoved || distance >= 5;
    const nextDragState: LegendPointerDragState = {
      ...currentDragState,
      clientX: event.clientX,
      clientY: event.clientY,
      localX: localPoint.x,
      localY: localPoint.y,
      hasMoved,
    };

    dragStateRef.current = nextDragState;
    setPointerDrag(nextDragState);

    if (hasMoved) {
      moveDraggedEntry(getMoveTargetFromPointer(event.clientX, event.clientY));
    }
  }

  function handleEntryPointerUp(event: ReactPointerEvent<HTMLElement>) {
    stopPointerDrag(event);
  }

  function handleEntryPointerCancel(event: ReactPointerEvent<HTMLElement>) {
    stopPointerDrag(event);
  }

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
                const isDefaultSection = isDefaultLegendSection(displayItem.section);

                if (isDefaultSection) {
                  return null;
                }

                return (
                  <li
                    key={displayItem.id}
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    className="absolute flex min-w-0 items-center overflow-hidden rounded-lg border border-transparent px-1 hover:border-indigo-200 hover:bg-indigo-50/60"
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
                    <span
                      className="h-[3px] flex-1 rounded-full shadow-sm"
                      style={{ backgroundColor: separatorColor }}
                    />
                    <EditableLegendText
                      value={displayItem.label}
                      onCommit={(nextValue) => {
                        const trimmedValue = nextValue.trim();
                        if (trimmedValue.length === 0) return;
                        onRenameSection(displayItem.section, trimmedValue);
                      }}
                      placeholder="Sous-légende"
                      className="mx-2 min-w-0 max-w-[74%] rounded border border-transparent bg-transparent px-2 py-1 text-center font-bold uppercase tracking-[0.12em] outline-none hover:border-slate-300 hover:bg-white/70 focus:border-indigo-400 focus:bg-white/95 focus:ring-2 focus:ring-indigo-200"
                      style={{ color: colors.titleColor }}
                    />
                    <span
                      className="h-[3px] flex-1 rounded-full shadow-sm"
                      style={{ backgroundColor: separatorColor }}
                    />
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
                item.width - legendLayout.symbolBoxWidth - legendLayout.textGap - 38,
              );
              const isHidden = entry.featureIds.every((featureId) =>
                hiddenLegendFeatureIds.includes(featureId),
              );

              return (
                <li
                  key={displayItem.id}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  onPointerDown={(event) => handleEntryPointerDown(event, entry)}
                  onPointerMove={handleEntryPointerMove}
                  onPointerUp={handleEntryPointerUp}
                  onPointerCancel={handleEntryPointerCancel}
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
                        Math.round((legendLayout.itemHeight - itemFontSize) / 2),
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
                    className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-500 opacity-0 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100"
                    title="Masquer ce groupe dans la légende"
                    aria-label="Masquer ce groupe dans la légende"
                  >
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
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
            left: Math.min(Math.max(pointerDrag.localX + 12, 8), rect.width - 20),
            top: Math.min(Math.max(pointerDrag.localY + 12, 8), rect.height - 20),
            transform: "translateY(-50%)",
          }}
        >
          <LegendSymbol feature={draggedEntry.representativeFeature} />
          <span className="min-w-0 truncate">{draggedEntry.label || "Sans nom"}</span>
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
  const setLegendTitle = useEditorTestExportStore((state) => state.setLegendTitle);
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

  const features = useEditorTestFeaturesStore((state) => state.features);
  const updateFeature = useEditorTestFeaturesStore((state) => state.updateFeature);
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
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
      getLegendEntries(allLegendFeatures, {
        legendGroupLabels,
        legendGroupSections,
        legendGroupOrder,
      }),
    [
      allLegendFeatures,
      legendGroupLabels,
      legendGroupSections,
      legendGroupOrder,
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
      getLegendEntries(visibleLegendFeatures, {
        legendGroupLabels,
        legendGroupSections,
        legendGroupOrder,
      }),
    [
      visibleLegendFeatures,
      legendGroupLabels,
      legendGroupSections,
      legendGroupOrder,
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
