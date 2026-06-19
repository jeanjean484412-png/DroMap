"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  getFeatureLockOverride,
  isFeatureLocked,
  isFreehandLineFeature,
  isTracedLineFeature,
  isFreehandZoneFeature,
  isQuickShapeZoneFeature,
  type DroMapFeature,
  type DroMapMarkerBuiltinSymbol,
  type DroMapMarkerSymbol,
  type DroMapZoneHatchingStyle,
  type DroMapZoneShapeKind,
} from "@/lib/dromap/feature";
import {
  DROMAP_DASH_STYLES,
  getFeatureDashStyle,
  getFeatureMarkerSize,
  MAX_MARKER_SIZE,
  MIN_MARKER_SIZE,
  type DroMapDashStyle,
} from "./feature-style";
import {
  DROMAP_BUILTIN_MARKER_SYMBOLS,
  DROMAP_MARKER_SYMBOL_CATEGORIES,
  getFeatureMarkerSymbol,
  getMarkerSymbolHtml,
  markerSymbolSupportsFill,
  markerSymbolSupportsStrokeWeight,
} from "./marker-symbol";
import { featureHasArrowEnd, featureHasArrowStart } from "./line-arrow";
import {
  getTextBackgroundColor,
  getTextBackgroundEnabled,
  getTextBackgroundOpacity,
  getTextBorderColor,
  getTextBorderEnabled,
  getTextBorderWidth,
  MAX_TEXT_BORDER_WIDTH,
  MIN_TEXT_BORDER_WIDTH,
} from "./text-rendering";
import { getLegendDedupeKey } from "./legend-entry";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import {
  getRenderableFeaturesForLayers,
  isFeatureEffectivelyLocked,
  isFeatureLayerLocked,
  type DroMapLayer,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { bringFloatingPanelToFront, getInitialFloatingPanelZIndex } from "./floating-panel-z-index";
import {
  DROMAP_ZONE_HATCHING_STYLES,
  MAX_ZONE_DOTS_RADIUS,
  MAX_ZONE_DOTS_SPACING,
  MAX_ZONE_HATCHING_SPACING,
  MAX_ZONE_HATCHING_WEIGHT,
  MIN_ZONE_DOTS_RADIUS,
  MIN_ZONE_DOTS_SPACING,
  MIN_ZONE_HATCHING_SPACING,
  MIN_ZONE_HATCHING_WEIGHT,
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
  getZoneFillEnabled,
  getZoneVisibleFillOpacity,
  getZoneVisibleStrokeOpacity,
} from "./zone-style";
import {
  changeQuickShapeKind,
  DROMAP_QUICK_SHAPES,
  getQuickShapeKind,
  getQuickShapeRotation,
} from "./quick-shape";
import {
  createAlignedZoneOutlineSvgParts,
  shouldUseAlignedZoneOutline,
} from "./zone-outline";

type LegendFeature = DroMapFeature;

const MIN_TEXT_FONT_SIZE = 10;
const MAX_TEXT_FONT_SIZE = 72;
const DEFAULT_TEXT_FONT_SIZE = 22;
const MIN_MARKER_STROKE_WIDTH = 3;
const MAX_MARKER_STROKE_WIDTH = 13;
const DEFAULT_MARKER_STROKE_WIDTH = 7;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getFeatureTypeLabel(feature: LegendFeature) {
  const type = feature.properties?.type;
  const geometryType = feature.geometry?.type;

  if (type === "text") return "Texte";
  if (type === "marker" || geometryType === "Point") return "Marqueur";
  if (type === "line" || geometryType === "LineString") {
    return isTracedLineFeature(feature) ? "Trait suivi" : "Ligne";
  }
  if (type === "zone" || geometryType === "Polygon") {
    if (isQuickShapeZoneFeature(feature)) return "Forme rapide";
    return isFreehandZoneFeature(feature) ? "Zone libre" : "Zone";
  }

  return "Élément";
}

function getFeatureLockStatusLabel(
  feature: LegendFeature,
  layers: DroMapLayer[],
) {
  const layerLocked = isFeatureLayerLocked(feature, layers);
  const objectLocked = isFeatureLocked(feature);

  if (layerLocked && objectLocked) return " · calque + objet verrouillés";
  if (layerLocked) return " · calque verrouillé";
  if (objectLocked) return " · objet verrouillé";

  return "";
}

function getFeatureLockButtonLabel(feature: LegendFeature) {
  return isFeatureLocked(feature) ? "Déverrouiller" : "Verrouiller";
}

function getDefaultFeatureLabel(feature: LegendFeature, index: number) {
  if (feature.properties?.type === "text") {
    return "Texte";
  }

  return `${getFeatureTypeLabel(feature)} ${index + 1}`;
}

function getFeatureLegendLabelFallback(feature: LegendFeature) {
  const type = feature.properties?.type;

  if (type === "text") return "Texte";
  if (type === "marker") return "Marqueur";
  if (type === "line")
    return isTracedLineFeature(feature)
      ? "Trait suivi"
      : isFreehandLineFeature(feature)
        ? "Ligne libre"
        : "Ligne";
  if (type === "zone") {
    if (isQuickShapeZoneFeature(feature)) return "Forme";
    return isFreehandZoneFeature(feature) ? "Zone libre" : "Zone";
  }

  return "Objet";
}

function getFeatureLegendLabelValue(feature: LegendFeature) {
  return feature.properties?.legendLabel ?? "";
}

function getFeatureColor(feature: LegendFeature) {
  return (
    feature.properties?.style?.color ||
    feature.properties?.style?.fillColor ||
    "#e63946"
  );
}

function getFeatureFillColor(feature: LegendFeature) {
  return (
    feature.properties?.style?.fillColor ||
    feature.properties?.style?.color ||
    "#e63946"
  );
}

function getFeatureOpacity(feature: LegendFeature) {
  if (isZone(feature)) {
    return getZoneVisibleStrokeOpacity(feature);
  }

  return feature.properties?.style?.opacity ?? 1;
}

function getFeatureFillOpacity(feature: LegendFeature) {
  if (isZone(feature)) {
    return getZoneVisibleFillOpacity(feature);
  }

  return feature.properties?.style?.fillOpacity ?? 0.3;
}

function getFeatureWeight(feature: LegendFeature) {
  return feature.properties?.style?.weight ?? 3;
}

function getMarkerStrokeWeight(feature: LegendFeature) {
  const rawValue = Number(feature.properties?.style?.weight);

  if (!Number.isFinite(rawValue)) {
    return DEFAULT_MARKER_STROKE_WIDTH;
  }

  return clamp(rawValue, MIN_MARKER_STROKE_WIDTH, MAX_MARKER_STROKE_WIDTH);
}

function markerFeatureSupportsStrokeWeight(feature: LegendFeature) {
  const symbol = getFeatureMarkerSymbol(feature);

  return symbol.type === "builtin" && markerSymbolSupportsStrokeWeight(symbol.id);
}

function markerFeatureSupportsFill(feature: LegendFeature) {
  const symbol = getFeatureMarkerSymbol(feature);

  return symbol.type === "builtin" && markerSymbolSupportsFill(symbol.id);
}

function getMarkerFilled(feature: LegendFeature) {
  return markerFeatureSupportsFill(feature) && feature.properties?.style?.markerFilled === true;
}

function getFeatureFontSize(feature: LegendFeature) {
  const rawValue = Number(feature.properties?.style?.fontSize);

  if (!Number.isFinite(rawValue)) {
    return DEFAULT_TEXT_FONT_SIZE;
  }

  return clamp(rawValue, MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE);
}

function getQuickShapeRotationLabel(feature: LegendFeature) {
  return `${getQuickShapeRotation(feature)}°`;
}

function getSelectedBuiltinMarkerSymbolId(
  feature: LegendFeature,
): DroMapMarkerBuiltinSymbol {
  const symbol = getFeatureMarkerSymbol(feature);

  if (symbol.type === "builtin") {
    return symbol.id;
  }

  return "circle";
}

function isText(feature: LegendFeature) {
  return feature.properties?.type === "text";
}

function isMarker(feature: LegendFeature) {
  return (
    feature.properties?.type === "marker" ||
    (feature.geometry?.type === "Point" && !isText(feature))
  );
}

function isLine(feature: LegendFeature) {
  return (
    feature.properties?.type === "line" ||
    feature.geometry?.type === "LineString"
  );
}

function isZone(feature: LegendFeature) {
  return (
    feature.properties?.type === "zone" || feature.geometry?.type === "Polygon"
  );
}

function LegendSymbol({ feature }: { feature: LegendFeature }) {
  const color = getFeatureColor(feature);
  const fillColor = getFeatureFillColor(feature);

  if (isText(feature)) {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold"
        style={{
          color,
          opacity: getFeatureOpacity(feature),
        }}
        aria-hidden="true"
      >
        T
      </span>
    );
  }

  if (isMarker(feature)) {
    const displaySize = Math.max(
      10,
      Math.min(getFeatureMarkerSize(feature), 22),
    );

    return (
      <span
        className="inline-block leading-none"
        aria-hidden="true"
        dangerouslySetInnerHTML={{
          __html: getMarkerSymbolHtml(feature, { size: displaySize }),
        }}
      />
    );
  }

  if (isLine(feature)) {
    const symbolWeight = Math.max(2, Math.min(getFeatureWeight(feature), 6));
    const hasArrowStart = featureHasArrowStart(feature);
    const hasArrowEnd = featureHasArrowEnd(feature);
    const symbolWidth = 42;
    const symbolHeight = 18;
    const centerY = symbolHeight / 2;
    const startX = 1;
    const endX = symbolWidth - 1;
    const arrowWidth = Math.max(9, symbolWeight * 2.4);
    const arrowHalfHeight = Math.max(5, symbolWeight * 1.6);
    const startArrowBaseX = startX + arrowWidth;
    const endArrowBaseX = endX - arrowWidth;
    const lineStartX = hasArrowStart
      ? startArrowBaseX - Math.max(1, symbolWeight * 0.4)
      : startX;
    const lineEndX = hasArrowEnd
      ? endArrowBaseX + Math.max(1, symbolWeight * 0.4)
      : endX;
    const dashArray =
      getFeatureDashStyle(feature) === "solid"
        ? undefined
        : getFeatureDashStyle(feature) === "dashed"
          ? `${Math.max(8, symbolWeight * 3)} ${Math.max(5, symbolWeight * 1.7)}`
          : `0.001 ${Math.max(6, symbolWeight * 2.2)}`;
    const freehandControlOffset = Math.max(4, symbolHeight * 0.24);
    const freehandPath = `M ${lineStartX} ${centerY} C ${lineStartX + (lineEndX - lineStartX) * 0.24} ${centerY - freehandControlOffset}, ${lineStartX + (lineEndX - lineStartX) * 0.44} ${centerY + freehandControlOffset}, ${lineStartX + (lineEndX - lineStartX) * 0.62} ${centerY} C ${lineStartX + (lineEndX - lineStartX) * 0.76} ${centerY - freehandControlOffset}, ${lineStartX + (lineEndX - lineStartX) * 0.9} ${centerY + freehandControlOffset}, ${lineEndX} ${centerY}`;

    return (
      <svg
        width={symbolWidth}
        height={symbolHeight}
        viewBox={`0 0 ${symbolWidth} ${symbolHeight}`}
        aria-hidden="true"
        focusable="false"
        style={{
          display: "block",
          overflow: "visible",
          opacity: getFeatureOpacity(feature),
        }}
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

  if (isZone(feature)) {
    const hatchStyle = getZoneHatchingStyle(feature);
    const hatchLines = [];
    const hatchSpacing = Math.max(
      4,
      Math.min(getZoneHatchingSpacing(feature), 10),
    );
    const zoneSymbolStrokeWidth = Math.max(1, Math.min(getFeatureWeight(feature), 4));
    const zoneSymbolDashArray =
      getFeatureDashStyle(feature) === "solid"
        ? undefined
        : getFeatureDashStyle(feature) === "dashed"
          ? "4 3"
          : "1 4";
    const alignedOutlineParts = shouldUseAlignedZoneOutline(feature)
      ? createAlignedZoneOutlineSvgParts(
          feature,
          [
            { x: 2, y: 2 },
            { x: 18, y: 2 },
            { x: 18, y: 18 },
            { x: 2, y: 18 },
          ],
          zoneSymbolStrokeWidth,
        )
      : null;

    if (getZoneHatchingEnabled(feature)) {
      for (let offset = -16; offset <= 32; offset += hatchSpacing) {
        if (hatchStyle === "horizontal") {
          hatchLines.push(
            <line key={offset} x1="0" y1={offset} x2="18" y2={offset} />,
          );
        } else if (hatchStyle === "vertical") {
          hatchLines.push(
            <line key={offset} x1={offset} y1="0" x2={offset} y2="18" />,
          );
        } else if (hatchStyle === "diagonal-left") {
          hatchLines.push(
            <line key={offset} x1={offset} y1="0" x2={offset + 18} y2="18" />,
          );
        } else {
          hatchLines.push(
            <line key={offset} x1={offset} y1="18" x2={offset + 18} y2="0" />,
          );
        }
      }
    }

    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        aria-hidden="true"
        focusable="false"
        className="block"
      >
        <defs>
          <clipPath id={`dromap-zone-object-symbol-${feature.id}`}>
            <rect x="2" y="2" width="16" height="16" rx="1" />
          </clipPath>
        </defs>
        {getZoneVisibleFillOpacity(feature) > 0 ? (
          <rect
            x="2"
            y="2"
            width="16"
            height="16"
            rx="1"
            fill={fillColor}
            fillOpacity={Math.max(0.12, getZoneVisibleFillOpacity(feature))}
          />
        ) : null}
        {hatchLines.length > 0 ? (
          <g
            clipPath={`url(#dromap-zone-object-symbol-${feature.id})`}
            stroke={getZoneHatchingColor(feature)}
            strokeWidth={Math.max(
              1,
              Math.min(getZoneHatchingWeight(feature), 3),
            )}
            strokeLinecap="butt"
          >
            {hatchLines}
          </g>
        ) : null}
        {getZoneStrokeEnabled(feature) &&
        getZoneVisibleStrokeOpacity(feature) > 0 &&
        alignedOutlineParts ? (
          <g
            stroke={color}
            fill={color}
            opacity={getZoneVisibleStrokeOpacity(feature)}
            strokeWidth={zoneSymbolStrokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {alignedOutlineParts.segments.map(([start, end], index) => (
              <line
                key={`dash-${index}-${start.x}-${start.y}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
              />
            ))}
            {alignedOutlineParts.dots.map((dot, index) => (
              <circle
                key={`dot-${index}-${dot.x}-${dot.y}`}
                cx={dot.x}
                cy={dot.y}
                r={Math.max(1.2, zoneSymbolStrokeWidth / 2)}
                stroke="none"
              />
            ))}
          </g>
        ) : getZoneStrokeEnabled(feature) &&
          getZoneVisibleStrokeOpacity(feature) > 0 ? (
          <rect
            x="2"
            y="2"
            width="16"
            height="16"
            rx="1"
            fill="none"
            stroke={color}
            strokeOpacity={getZoneVisibleStrokeOpacity(feature)}
            strokeWidth={zoneSymbolStrokeWidth}
            strokeDasharray={zoneSymbolDashArray}
          />
        ) : null}
      </svg>
    );
  }

  return (
    <span
      className="inline-block h-3 w-3 rounded-sm border border-black/20"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

export function LegendPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [panelZIndex, setPanelZIndex] = useState(
    getInitialFloatingPanelZIndex(),
  );

  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const fieldEditHistoryKeysRef = useRef(new Set<string>());

  const rawFeatures = useEditorTestFeaturesStore(
    (state) => state.features,
  ) as LegendFeature[];
  const layers = useEditorTestLayersStore((state) => state.layers);
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const features = useMemo(
    () =>
      getRenderableFeaturesForLayers(rawFeatures, layers, {
        applyOpacity: false,
        workspaceBounds,
      }) as LegendFeature[],
    [rawFeatures, layers, workspaceBounds],
  );

  const updateFeature = useEditorTestFeaturesStore(
    (state) => state.updateFeature,
  );

  const commitFeaturesHistory = useEditorTestFeaturesStore(
    (state) => state.commitFeaturesHistory,
  );

  const updateFeatureWithHistory = useEditorTestFeaturesStore(
    (state) => state.updateFeatureWithHistory,
  );

  const setLegendGroupLabel = useEditorTestExportStore(
    (state) => state.setLegendGroupLabel,
  );

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );

  const setSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.setSelectedFeatureId,
  );

  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );

  function commitHistoryOnceForField(editKey: string) {
    if (fieldEditHistoryKeysRef.current.has(editKey)) {
      return;
    }

    fieldEditHistoryKeysRef.current.add(editKey);
    commitFeaturesHistory();
  }

  function finishFieldEdit(editKey: string) {
    fieldEditHistoryKeysRef.current.delete(editKey);
  }

  function getFeatureLabelEditKey(featureId: string) {
    return `feature-label:${featureId}`;
  }

  function getLegendLabelEditKey(feature: LegendFeature) {
    return `legend-label:${getLegendDedupeKey(feature)}`;
  }

  function updateFeatureLabelDuringEdit(
    feature: LegendFeature,
    nextLabel: string,
  ) {
    commitHistoryOnceForField(getFeatureLabelEditKey(feature.id));

    updateFeature(feature.id, {
      ...feature,
      properties: {
        ...feature.properties,
        label: nextLabel,
      },
    });
  }

  function updateLegendLabelForVisualGroup(
    sourceFeature: LegendFeature,
    nextLegendLabel: string,
  ) {
    const sourceGroupKey = getLegendDedupeKey(sourceFeature);
    const groupFeatures = features.filter(
      (candidate) => getLegendDedupeKey(candidate) === sourceGroupKey,
    );

    setLegendGroupLabel(sourceGroupKey, nextLegendLabel);

    for (const groupFeature of groupFeatures) {
      updateFeature(groupFeature.id, {
        ...groupFeature,
        properties: {
          ...groupFeature.properties,
          legendLabel: nextLegendLabel,
        },
      });
    }
  }

  function updateLegendLabelDuringEdit(
    feature: LegendFeature,
    nextLegendLabel: string,
  ) {
    commitHistoryOnceForField(getLegendLabelEditKey(feature));
    updateLegendLabelForVisualGroup(feature, nextLegendLabel);
  }

  function toggleFeatureLocked(feature: LegendFeature) {
    updateFeatureWithHistory(feature.id, (currentFeature) => {
      const currentLockOverride = getFeatureLockOverride(currentFeature);
      const currentObjectLocked =
        currentFeature.properties?.locked === true || currentLockOverride === "locked";
      const nextObjectLocked = !currentObjectLocked;
      const { lockOverride: _lockOverride, ...nextProperties } = currentFeature.properties;

      return {
        ...currentFeature,
        properties: {
          ...nextProperties,
          locked: nextObjectLocked,
          ...(nextObjectLocked ? { lockOverride: "locked" as const } : {}),
        },
      };
    });
  }

  useEffect(() => {
    if (selectedFeatureId) {
      setPanelZIndex(bringFloatingPanelToFront());
      setIsOpen(true);
    }
  }, [selectedFeatureId]);

  useEffect(() => {
    if (!selectedFeatureId || !isOpen) {
      return;
    }

    window.setTimeout(() => {
      itemRefs.current.get(selectedFeatureId)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 0);
  }, [selectedFeatureId, isOpen, features.length]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setPanelZIndex(bringFloatingPanelToFront());
          setIsOpen(true);
        }}
        className="absolute bottom-4 right-4 z-[1000] rounded-xl border border-black/10 bg-white/95 px-4 py-2 text-sm font-medium text-slate-800 shadow-lg backdrop-blur transition hover:bg-slate-50"
      >
        Objets
        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {features.length}
        </span>
      </button>
    );
  }

  return (
    <aside
      className="absolute bottom-4 right-4 max-h-[65vh] w-96 overflow-hidden rounded-xl border border-black/10 bg-white/95 text-sm shadow-lg backdrop-blur"
      style={{ zIndex: panelZIndex }}
      onMouseDown={() => setPanelZIndex(bringFloatingPanelToFront())}
      onFocusCapture={() => setPanelZIndex(bringFloatingPanelToFront())}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-900">Objets</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {features.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          Replier
        </button>
      </div>

      <div className="max-h-[55vh] overflow-y-auto p-4">
        {features.length === 0 ? (
          <p className="text-xs leading-relaxed text-slate-500">
            Aucun élément pour le moment. Passe en mode édition puis dessine un
            marqueur, une ligne, une zone ou un texte.
          </p>
        ) : (
          <ul className="space-y-3">
            {features.map((feature, index) => (
              <li
                key={feature.id}
                ref={(node) => {
                  if (node) {
                    itemRefs.current.set(feature.id, node);
                  } else {
                    itemRefs.current.delete(feature.id);
                  }
                }}
                onClick={(event) => {
                  const target = event.target as HTMLElement;

                  if (target.closest("input, button, select, textarea")) {
                    return;
                  }

                  if (selectedFeatureId === feature.id) {
                    clearSelectedFeatureId();
                    return;
                  }

                  setSelectedFeatureId(feature.id, { focusOnMap: true });
                }}
                className={[
                  "cursor-pointer rounded-lg border p-3 transition",
                  selectedFeatureId === feature.id
                    ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
                    : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white",
                ].join(" ")}
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex w-10 shrink-0 items-center justify-center">
                    <LegendSymbol feature={feature} />
                  </span>

                  <div className="min-w-0 flex-1 space-y-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        {isText(feature)
                          ? "Texte affiché sur la carte"
                          : "Nom indicatif pour l’utilisateur"}
                      </span>

                      {isText(feature) ? (
                        <textarea
                          disabled={isFeatureEffectivelyLocked(feature, layers)}
                          className="min-h-24 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-medium leading-relaxed text-slate-800 outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          value={feature.properties?.label ?? ""}
                          onChange={(event) => {
                            updateFeatureLabelDuringEdit(
                              feature,
                              event.target.value,
                            );
                          }}
                          onBlur={() => {
                            finishFieldEdit(getFeatureLabelEditKey(feature.id));
                          }}
                          placeholder={"Texte affiché\nsur plusieurs lignes"}
                          rows={3}
                        />
                      ) : (
                        <input
                          disabled={isFeatureEffectivelyLocked(feature, layers)}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          value={feature.properties?.label ?? ""}
                          onChange={(event) => {
                            updateFeatureLabelDuringEdit(
                              feature,
                              event.target.value,
                            );
                          }}
                          onBlur={() => {
                            finishFieldEdit(getFeatureLabelEditKey(feature.id));
                          }}
                          placeholder={getDefaultFeatureLabel(feature, index)}
                        />
                      )}
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        Nom dans la légende
                      </span>
                      <input
                        disabled={isFeatureEffectivelyLocked(feature, layers)}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        value={getFeatureLegendLabelValue(feature)}
                        onChange={(event) => {
                          updateLegendLabelDuringEdit(
                            feature,
                            event.target.value,
                          );
                        }}
                        onBlur={() => {
                          finishFieldEdit(getLegendLabelEditKey(feature));
                        }}
                        placeholder={getFeatureLegendLabelFallback(feature)}
                      />
                    </label>

                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        {getFeatureTypeLabel(feature)}
                        {getFeatureLockStatusLabel(feature, layers)}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleFeatureLocked(feature);
                        }}
                        className={[
                          "shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold transition",
                          isFeatureEffectivelyLocked(feature, layers)
                            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
                        ].join(" ")}
                      >
                        {getFeatureLockButtonLabel(feature)}
                      </button>
                    </div>
                  </div>
                </div>

                <fieldset
                  disabled={isFeatureEffectivelyLocked(feature, layers)}
                  className="grid grid-cols-2 gap-3 text-xs disabled:opacity-60"
                >
                  {isZone(feature) && (
                    <div className="col-span-2 grid grid-cols-2 gap-2 rounded-md bg-white px-2 py-2">
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-slate-600">Contour</span>
                        <input
                          type="checkbox"
                          checked={getZoneStrokeEnabled(feature)}
                          onChange={(event) => {
                            const zoneStrokeEnabled = event.target.checked;

                            updateFeatureWithHistory(
                              feature.id,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties?.style ?? {}),
                                    zoneStrokeEnabled,
                                  },
                                },
                              }),
                            );
                          }}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-2">
                        <span className="text-slate-600">Fond</span>
                        <input
                          type="checkbox"
                          checked={getZoneFillEnabled(feature)}
                          onChange={(event) => {
                            const zoneFillEnabled = event.target.checked;

                            updateFeatureWithHistory(
                              feature.id,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties?.style ?? {}),
                                    zoneFillEnabled,
                                  },
                                },
                              }),
                            );
                          }}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300"
                        />
                      </label>
                    </div>
                  )}

                  {isZone(feature) && isQuickShapeZoneFeature(feature) && (
                    <>
                      <label className="col-span-2 rounded-md bg-white px-2 py-2">
                        <div className="mb-1 text-slate-600">Forme</div>
                        <select
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          value={getQuickShapeKind(feature)}
                          onChange={(event) => {
                            const zoneShapeKind = event.target
                              .value as DroMapZoneShapeKind;

                            updateFeatureWithHistory(
                              feature.id,
                              (currentFeature) =>
                                changeQuickShapeKind(
                                  currentFeature,
                                  zoneShapeKind,
                                ),
                            );
                          }}
                        >
                          {DROMAP_QUICK_SHAPES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="col-span-2 rounded-md bg-blue-50 px-2 py-2 text-[11px] leading-snug text-blue-700">
                        {getQuickShapeKind(feature) === "circle"
                          ? "Le cercle se redimensionne avec sa poignée sur le contour. Il n’a pas de rotation."
                          : `Rotation actuelle : ${getQuickShapeRotationLabel(feature)}. Utilise les poignées bleues sur la carte pour modifier la taille ou tourner la forme.`}
                      </div>
                    </>
                  )}

                  {(!isZone(feature) || getZoneStrokeEnabled(feature)) && (
                    <label className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                      <span className="text-slate-600">
                        {isZone(feature) ? "Contour" : "Couleur"}
                      </span>
                      <input
                        type="color"
                        value={getFeatureColor(feature)}
                        onChange={(event) => {
                          const nextColor = event.target.value;

                          updateFeatureWithHistory(
                            feature.id,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties?.style ?? {}),
                                  color: nextColor,
                                },
                              },
                            }),
                          );
                        }}
                        className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                      />
                    </label>
                  )}

                  {isZone(feature) && getZoneFillEnabled(feature) && (
                    <label className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                      <span className="text-slate-600">Fond</span>
                      <input
                        type="color"
                        value={getFeatureFillColor(feature)}
                        onChange={(event) => {
                          const nextFillColor = event.target.value;

                          updateFeatureWithHistory(
                            feature.id,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties?.style ?? {}),
                                  fillColor: nextFillColor,
                                },
                              },
                            }),
                          );
                        }}
                        className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                      />
                    </label>
                  )}

                  {(!isZone(feature) || getZoneStrokeEnabled(feature)) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-slate-600">
                          {isZone(feature) ? "Opacité du contour" : "Opacité"}
                        </span>
                        <span className="tabular-nums text-slate-500">
                          {Math.round(getFeatureOpacity(feature) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={isZone(feature) ? "0" : "0.1"}
                        max="1"
                        step="0.05"
                        value={getFeatureOpacity(feature)}
                        onPointerDown={() => {
                          commitFeaturesHistory();
                        }}
                        onChange={(event) => {
                          const nextOpacity = Number(event.target.value);

                          updateFeature(feature.id, {
                            ...feature,
                            properties: {
                              ...feature.properties,
                              style: {
                                ...(feature.properties?.style ?? {}),
                                opacity: nextOpacity,
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                    </label>
                  )}

                  {isText(feature) && (
                    <>
                      <label className="col-span-2 rounded-md bg-white px-2 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-slate-600">
                            Taille du texte
                          </span>
                          <span className="tabular-nums text-slate-500">
                            {getFeatureFontSize(feature)} px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={MIN_TEXT_FONT_SIZE}
                          max={MAX_TEXT_FONT_SIZE}
                          step="1"
                          value={getFeatureFontSize(feature)}
                          onPointerDown={() => {
                            commitFeaturesHistory();
                          }}
                          onChange={(event) => {
                            const fontSize = Number(event.target.value);

                            updateFeature(feature.id, {
                              ...feature,
                              properties: {
                                ...feature.properties,
                                style: {
                                  ...(feature.properties?.style ?? {}),
                                  fontSize,
                                },
                              },
                            });
                          }}
                          className="w-full"
                        />
                      </label>

                      <div className="col-span-2 grid grid-cols-2 gap-2 rounded-md bg-white px-2 py-2">
                        <label className="flex items-center justify-between gap-2">
                          <span className="text-slate-600">Fond</span>
                          <input
                            type="checkbox"
                            checked={getTextBackgroundEnabled(feature)}
                            onChange={(event) => {
                              const textBackgroundEnabled =
                                event.target.checked;

                              updateFeatureWithHistory(
                                feature.id,
                                (currentFeature) => ({
                                  ...currentFeature,
                                  properties: {
                                    ...currentFeature.properties,
                                    style: {
                                      ...(currentFeature.properties?.style ??
                                        {}),
                                      textBackgroundEnabled,
                                    },
                                  },
                                }),
                              );
                            }}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300"
                          />
                        </label>

                        <label className="flex items-center justify-between gap-2">
                          <span className="text-slate-600">Encadré</span>
                          <input
                            type="checkbox"
                            checked={getTextBorderEnabled(feature)}
                            onChange={(event) => {
                              const textBorderEnabled = event.target.checked;

                              updateFeatureWithHistory(
                                feature.id,
                                (currentFeature) => ({
                                  ...currentFeature,
                                  properties: {
                                    ...currentFeature.properties,
                                    style: {
                                      ...(currentFeature.properties?.style ??
                                        {}),
                                      textBorderEnabled,
                                    },
                                  },
                                }),
                              );
                            }}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300"
                          />
                        </label>
                      </div>

                      {getTextBackgroundEnabled(feature) && (
                        <>
                          <label className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                            <span className="text-slate-600">Couleur fond</span>
                            <input
                              type="color"
                              value={getTextBackgroundColor(feature)}
                              onChange={(event) => {
                                const textBackgroundColor = event.target.value;

                                updateFeatureWithHistory(
                                  feature.id,
                                  (currentFeature) => ({
                                    ...currentFeature,
                                    properties: {
                                      ...currentFeature.properties,
                                      style: {
                                        ...(currentFeature.properties?.style ??
                                          {}),
                                        textBackgroundColor,
                                      },
                                    },
                                  }),
                                );
                              }}
                              className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                            />
                          </label>

                          <label className="rounded-md bg-white px-2 py-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-slate-600">
                                Opacité fond
                              </span>
                              <span className="tabular-nums text-slate-500">
                                {Math.round(
                                  getTextBackgroundOpacity(feature) * 100,
                                )}
                                %
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={getTextBackgroundOpacity(feature)}
                              onPointerDown={() => {
                                commitFeaturesHistory();
                              }}
                              onChange={(event) => {
                                const textBackgroundOpacity = Number(
                                  event.target.value,
                                );

                                updateFeature(feature.id, {
                                  ...feature,
                                  properties: {
                                    ...feature.properties,
                                    style: {
                                      ...(feature.properties?.style ?? {}),
                                      textBackgroundOpacity,
                                    },
                                  },
                                });
                              }}
                              className="w-full"
                            />
                          </label>
                        </>
                      )}

                      {getTextBorderEnabled(feature) && (
                        <>
                          <label className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                            <span className="text-slate-600">
                              Couleur cadre
                            </span>
                            <input
                              type="color"
                              value={getTextBorderColor(feature)}
                              onChange={(event) => {
                                const textBorderColor = event.target.value;

                                updateFeatureWithHistory(
                                  feature.id,
                                  (currentFeature) => ({
                                    ...currentFeature,
                                    properties: {
                                      ...currentFeature.properties,
                                      style: {
                                        ...(currentFeature.properties?.style ??
                                          {}),
                                        textBorderColor,
                                      },
                                    },
                                  }),
                                );
                              }}
                              className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                            />
                          </label>

                          <label className="rounded-md bg-white px-2 py-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-slate-600">
                                Épaisseur cadre
                              </span>
                              <span className="tabular-nums text-slate-500">
                                {getTextBorderWidth(feature)} px
                              </span>
                            </div>
                            <input
                              type="range"
                              min={MIN_TEXT_BORDER_WIDTH}
                              max={MAX_TEXT_BORDER_WIDTH}
                              step="1"
                              value={getTextBorderWidth(feature)}
                              onPointerDown={() => {
                                commitFeaturesHistory();
                              }}
                              onChange={(event) => {
                                const textBorderWidth = Number(
                                  event.target.value,
                                );

                                updateFeature(feature.id, {
                                  ...feature,
                                  properties: {
                                    ...feature.properties,
                                    style: {
                                      ...(feature.properties?.style ?? {}),
                                      textBorderWidth,
                                    },
                                  },
                                });
                              }}
                              className="w-full"
                            />
                          </label>
                        </>
                      )}
                    </>
                  )}

                  {isMarker(feature) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 text-slate-600">
                        Forme du marqueur
                      </div>
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        value={getSelectedBuiltinMarkerSymbolId(feature)}
                        onChange={(event) => {
                          const symbolId = event.target
                            .value as DroMapMarkerBuiltinSymbol;

                          const symbol: DroMapMarkerSymbol = {
                            type: "builtin",
                            id: symbolId,
                          };

                          updateFeatureWithHistory(
                            feature.id,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                symbol,
                                style: {
                                  ...(currentFeature.properties?.style ?? {}),
                                  ...(markerSymbolSupportsFill(symbolId)
                                    ? { markerFilled: true }
                                    : {}),
                                },
                              },
                            }),
                          );
                        }}
                      >
                        {DROMAP_MARKER_SYMBOL_CATEGORIES.map((category) => {
                          const options = DROMAP_BUILTIN_MARKER_SYMBOLS.filter(
                            (option) => option.categoryId === category.id,
                          );

                          if (options.length === 0) {
                            return null;
                          }

                          return (
                            <optgroup key={category.id} label={category.label}>
                              {options.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                    </label>
                  )}

                  {isMarker(feature) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-slate-600">
                          Taille du marqueur
                        </span>
                        <span className="tabular-nums text-slate-500">
                          {getFeatureMarkerSize(feature)} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={MIN_MARKER_SIZE}
                        max={MAX_MARKER_SIZE}
                        step="1"
                        value={getFeatureMarkerSize(feature)}
                        onPointerDown={() => {
                          commitFeaturesHistory();
                        }}
                        onChange={(event) => {
                          const markerSize = Number(event.target.value);

                          updateFeature(feature.id, {
                            ...feature,
                            properties: {
                              ...feature.properties,
                              style: {
                                ...(feature.properties?.style ?? {}),
                                markerSize,
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                    </label>
                  )}

                  {isMarker(feature) && markerFeatureSupportsFill(feature) && (
                    <label className="col-span-2 flex items-center justify-between gap-3 rounded-md bg-white px-2 py-2">
                      <span className="text-slate-600">Remplissage</span>
                      <input
                        type="checkbox"
                        checked={getMarkerFilled(feature)}
                        onPointerDown={() => {
                          commitFeaturesHistory();
                        }}
                        onChange={(event) => {
                          updateFeature(feature.id, {
                            ...feature,
                            properties: {
                              ...feature.properties,
                              style: {
                                ...(feature.properties?.style ?? {}),
                                markerFilled: event.target.checked,
                              },
                            },
                          });
                        }}
                        className="h-4 w-4 cursor-pointer accent-blue-600"
                      />
                    </label>
                  )}

                  {isMarker(feature) && markerFeatureSupportsStrokeWeight(feature) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-slate-600">
                          Épaisseur du trait
                        </span>
                        <span className="tabular-nums text-slate-500">
                          {getMarkerStrokeWeight(feature)} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={MIN_MARKER_STROKE_WIDTH}
                        max={MAX_MARKER_STROKE_WIDTH}
                        step="1"
                        value={getMarkerStrokeWeight(feature)}
                        onPointerDown={() => {
                          commitFeaturesHistory();
                        }}
                        onChange={(event) => {
                          const weight = Number(event.target.value);

                          updateFeature(feature.id, {
                            ...feature,
                            properties: {
                              ...feature.properties,
                              style: {
                                ...(feature.properties?.style ?? {}),
                                weight,
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                      <p className="mt-1 text-[10px] leading-snug text-slate-500">
                        S’applique aux pictogrammes dessinés au trait.
                      </p>
                    </label>
                  )}

                  {(isLine(feature) ||
                    (isZone(feature) && getZoneStrokeEnabled(feature))) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 text-slate-600">Trait</div>
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        value={getFeatureDashStyle(feature)}
                        onChange={(event) => {
                          const dashStyle = event.target
                            .value as DroMapDashStyle;

                          updateFeatureWithHistory(
                            feature.id,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties?.style ?? {}),
                                  dashStyle,
                                },
                              },
                            }),
                          );
                        }}
                      >
                        {DROMAP_DASH_STYLES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {isLine(feature) && (
                    <div className="col-span-2 grid grid-cols-2 gap-2 rounded-md bg-white px-2 py-2">
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-slate-600">Flèche début</span>
                        <input
                          type="checkbox"
                          checked={
                            feature.properties?.style?.arrowStart === true
                          }
                          onChange={(event) => {
                            const arrowStart = event.target.checked;

                            updateFeatureWithHistory(
                              feature.id,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties?.style ?? {}),
                                    arrowStart,
                                  },
                                },
                              }),
                            );
                          }}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-2">
                        <span className="text-slate-600">Flèche fin</span>
                        <input
                          type="checkbox"
                          checked={feature.properties?.style?.arrowEnd === true}
                          onChange={(event) => {
                            const arrowEnd = event.target.checked;

                            updateFeatureWithHistory(
                              feature.id,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties?.style ?? {}),
                                    arrowEnd,
                                  },
                                },
                              }),
                            );
                          }}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300"
                        />
                      </label>
                    </div>
                  )}

                  {(isLine(feature) ||
                    (isZone(feature) && getZoneStrokeEnabled(feature))) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-slate-600">
                          {isZone(feature) ? "Épaisseur contour" : "Épaisseur"}
                        </span>
                        <span className="tabular-nums text-slate-500">
                          {getFeatureWeight(feature)} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="12"
                        step="1"
                        value={getFeatureWeight(feature)}
                        onPointerDown={() => {
                          commitFeaturesHistory();
                        }}
                        onChange={(event) => {
                          const nextWeight = Number(event.target.value);

                          updateFeature(feature.id, {
                            ...feature,
                            properties: {
                              ...feature.properties,
                              style: {
                                ...(feature.properties?.style ?? {}),
                                weight: nextWeight,
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                    </label>
                  )}

                  {isZone(feature) && getZoneFillEnabled(feature) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-slate-600">Opacité du fond</span>
                        <span className="tabular-nums text-slate-500">
                          {Math.round(getFeatureFillOpacity(feature) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={getFeatureFillOpacity(feature)}
                        onPointerDown={() => {
                          commitFeaturesHistory();
                        }}
                        onChange={(event) => {
                          const nextFillOpacity = Number(event.target.value);

                          updateFeature(feature.id, {
                            ...feature,
                            properties: {
                              ...feature.properties,
                              style: {
                                ...(feature.properties?.style ?? {}),
                                fillOpacity: nextFillOpacity,
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                    </label>
                  )}

                  {isZone(feature) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 text-slate-600">Hachures</div>
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        value={getZoneHatchingStyle(feature)}
                        onChange={(event) => {
                          const zoneHatchingStyle = event.target
                            .value as DroMapZoneHatchingStyle;

                          updateFeatureWithHistory(
                            feature.id,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties?.style ?? {}),
                                  zoneHatchingStyle,
                                },
                              },
                            }),
                          );
                        }}
                      >
                        {DROMAP_ZONE_HATCHING_STYLES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {isZone(feature) && getZoneHatchingEnabled(feature) && (
                    <>
                      <label className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                        <span className="text-slate-600">Couleur hachures</span>
                        <input
                          type="color"
                          value={getZoneHatchingColor(feature)}
                          onChange={(event) => {
                            const zoneHatchingColor = event.target.value;

                            updateFeatureWithHistory(
                              feature.id,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties?.style ?? {}),
                                    zoneHatchingColor,
                                  },
                                },
                              }),
                            );
                          }}
                          className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                        />
                      </label>

                      <label className="col-span-2 rounded-md bg-white px-2 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-slate-600">
                            Épaisseur hachures
                          </span>
                          <span className="tabular-nums text-slate-500">
                            {getZoneHatchingWeight(feature)} px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={MIN_ZONE_HATCHING_WEIGHT}
                          max={MAX_ZONE_HATCHING_WEIGHT}
                          step="1"
                          value={getZoneHatchingWeight(feature)}
                          onPointerDown={() => {
                            commitFeaturesHistory();
                          }}
                          onChange={(event) => {
                            const zoneHatchingWeight = Number(
                              event.target.value,
                            );

                            updateFeature(feature.id, {
                              ...feature,
                              properties: {
                                ...feature.properties,
                                style: {
                                  ...(feature.properties?.style ?? {}),
                                  zoneHatchingWeight,
                                },
                              },
                            });
                          }}
                          className="w-full"
                        />
                      </label>

                      <label className="col-span-2 rounded-md bg-white px-2 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-slate-600">Resserrement</span>
                          <span className="tabular-nums text-slate-500">
                            {getZoneHatchingSpacing(feature)} px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={MIN_ZONE_HATCHING_SPACING}
                          max={MAX_ZONE_HATCHING_SPACING}
                          step="1"
                          value={getZoneHatchingSpacing(feature)}
                          onPointerDown={() => {
                            commitFeaturesHistory();
                          }}
                          onChange={(event) => {
                            const zoneHatchingSpacing = Number(
                              event.target.value,
                            );

                            updateFeature(feature.id, {
                              ...feature,
                              properties: {
                                ...feature.properties,
                                style: {
                                  ...(feature.properties?.style ?? {}),
                                  zoneHatchingSpacing,
                                },
                              },
                            });
                          }}
                          className="w-full"
                        />
                      </label>
                    </>
                  )}

                  {isZone(feature) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-600">Points</span>
                        <input
                          type="checkbox"
                          checked={getZoneDotsEnabled(feature)}
                          onChange={(event) => {
                            const zoneDotsEnabled = event.target.checked;

                            updateFeatureWithHistory(
                              feature.id,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties?.style ?? {}),
                                    zoneDotsEnabled,
                                  },
                                },
                              }),
                            );
                          }}
                        />
                      </div>
                    </label>
                  )}

                  {isZone(feature) && getZoneDotsEnabled(feature) && (
                    <>
                      <label className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                        <span className="text-slate-600">Couleur points</span>
                        <input
                          type="color"
                          value={getZoneDotsColor(feature)}
                          onChange={(event) => {
                            const zoneDotsColor = event.target.value;

                            updateFeatureWithHistory(
                              feature.id,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties?.style ?? {}),
                                    zoneDotsColor,
                                  },
                                },
                              }),
                            );
                          }}
                          className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                        />
                      </label>

                      <label className="col-span-2 rounded-md bg-white px-2 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-slate-600">Rayon points</span>
                          <span className="tabular-nums text-slate-500">
                            {getZoneDotsRadius(feature)} px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={MIN_ZONE_DOTS_RADIUS}
                          max={MAX_ZONE_DOTS_RADIUS}
                          step="0.5"
                          value={getZoneDotsRadius(feature)}
                          onPointerDown={() => {
                            commitFeaturesHistory();
                          }}
                          onChange={(event) => {
                            const zoneDotsRadius = Number(event.target.value);

                            updateFeature(feature.id, {
                              ...feature,
                              properties: {
                                ...feature.properties,
                                style: {
                                  ...(feature.properties?.style ?? {}),
                                  zoneDotsRadius,
                                },
                              },
                            });
                          }}
                          className="w-full"
                        />
                      </label>

                      <label className="col-span-2 rounded-md bg-white px-2 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-slate-600">Espacement points</span>
                          <span className="tabular-nums text-slate-500">
                            {getZoneDotsSpacing(feature)} px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={MIN_ZONE_DOTS_SPACING}
                          max={MAX_ZONE_DOTS_SPACING}
                          step="1"
                          value={getZoneDotsSpacing(feature)}
                          onPointerDown={() => {
                            commitFeaturesHistory();
                          }}
                          onChange={(event) => {
                            const zoneDotsSpacing = Number(event.target.value);

                            updateFeature(feature.id, {
                              ...feature,
                              properties: {
                                ...feature.properties,
                                style: {
                                  ...(feature.properties?.style ?? {}),
                                  zoneDotsSpacing,
                                },
                              },
                            });
                          }}
                          className="w-full"
                        />
                      </label>
                    </>
                  )}
                </fieldset>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
