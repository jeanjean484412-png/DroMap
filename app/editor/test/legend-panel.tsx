"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  getFeatureLockOverride,
  isFeatureGeometryLocked,
  isFeatureLocked,
  isFreehandLineFeature,
  isTracedLineFeature,
  isFreehandZoneFeature,
  isQuickShapeZoneFeature,
  type DroMapFeature,
  type DroMapFeatureMapLabelVisibility,
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
  getMarkerSymbolLabel,
  markerSymbolSupportsFill,
  markerSymbolSupportsStrokeWeight,
  type DroMapMarkerSymbolCategoryId,
} from "./marker-symbol";
import { featureHasArrowEnd, featureHasArrowStart } from "./line-arrow";
import {
  getTextBackgroundColor,
  getTextBackgroundEnabled,
  getTextBackgroundOpacity,
  getTextBorderColor,
  getTextBorderEnabled,
  getTextBorderWidth,
  getTextFeatureBold,
  getTextFeatureItalic,
  getTextOutlineEnabled,
  getTextOutlineWidth,
  MAX_TEXT_BORDER_WIDTH,
  MIN_TEXT_BORDER_WIDTH,
  MAX_TEXT_OUTLINE_WIDTH,
  MIN_TEXT_OUTLINE_WIDTH,
} from "./text-rendering";
import { getLegendDedupeKey } from "./legend-entry";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestLayerCommandsStore } from "@/stores/editor-test-layer-commands";
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
import { useEditorTestCustomMarkersStore } from "@/stores/editor-test-custom-markers";
import {
  MAX_FEATURE_MAP_LABEL_SCALE,
  MIN_FEATURE_MAP_LABEL_SCALE,
  MAX_FEATURE_MAP_LABEL_OUTLINE_WIDTH,
  MIN_FEATURE_MAP_LABEL_OUTLINE_WIDTH,
  useEditorTestMapLabelsStore,
} from "@/stores/editor-test-map-labels";
import { bringFloatingPanelToFront, getInitialFloatingPanelZIndex } from "./floating-panel-z-index";
import { duplicateSelectedFeature } from "./feature-duplication";
import { ColorPicker } from "./color-picker";
import { CustomMarkerLibrary } from "./custom-marker-library";
import {
  getFeatureMapLabelVisibility,
  shouldShowFeatureMapLabel,
} from "./feature-map-labels";
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

const MIN_TEXT_FONT_SIZE = 1;
const MAX_TEXT_FONT_SIZE = 72;
const DEFAULT_TEXT_FONT_SIZE = 22;
const TEXT_FONT_SIZE_OPTIONS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 42, 48, 56, 64, 72,
] as const;
const MIN_MARKER_STROKE_WIDTH = 3;
const MAX_MARKER_STROKE_WIDTH = 13;
const DEFAULT_MARKER_STROKE_WIDTH = 7;
const OBJECTS_PANEL_PAGE_SIZE = 40;

function normalizeMarkerLibrarySearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

function getMarkerCategoryLabel(categoryId: DroMapMarkerSymbolCategoryId) {
  return (
    DROMAP_MARKER_SYMBOL_CATEGORIES.find(
      (category) => category.id === categoryId,
    )?.label ?? categoryId
  );
}

type MarkerVisualPreviewProps = {
  feature: LegendFeature;
  symbol: DroMapMarkerSymbol;
  size?: number;
};

function MarkerVisualPreview({
  feature,
  symbol,
  size = 32,
}: MarkerVisualPreviewProps) {
  const style = feature.properties?.style ?? {};
  const html = useMemo(
    () =>
      getMarkerSymbolHtml(
        {
          properties: {
            style: {
              ...style,
              markerSize: size,
              markerFilled:
                symbol.type === "builtin" &&
                markerSymbolSupportsFill(symbol.id) &&
                style.markerFilled !== false,
            },
            symbol,
          },
        },
        { size },
      ),
    [size, style, symbol],
  );

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none inline-flex shrink-0 items-center justify-center leading-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

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
  const [panelMode, setPanelMode] = useState<"selected" | "all" | "labels">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [editSameMarkerTypeInLayer, setEditSameMarkerTypeInLayer] =
    useState(false);
  const [openMarkerLibraryFeatureId, setOpenMarkerLibraryFeatureId] =
    useState<string | null>(null);
  const [markerLibrarySearch, setMarkerLibrarySearch] = useState("");
  const [markerLibraryCategoryId, setMarkerLibraryCategoryId] =
    useState<DroMapMarkerSymbolCategoryId>("basic");

  const fieldEditHistoryKeysRef = useRef(new Set<string>());

  const rawFeatures = useEditorTestFeaturesStore(
    (state) => state.features,
  ) as LegendFeature[];
  useEditorTestCustomMarkersStore((state) => state.customMarkers);
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
  const updateFeatures = useEditorTestFeaturesStore(
    (state) => state.updateFeatures,
  );

  const commitFeaturesHistory = useEditorTestFeaturesStore(
    (state) => state.commitFeaturesHistory,
  );

  const updateFeatureWithHistory = useEditorTestFeaturesStore(
    (state) => state.updateFeatureWithHistory,
  );
  const updateFeaturesWithHistory = useEditorTestFeaturesStore(
    (state) => state.updateFeaturesWithHistory,
  );

  const removeFeatureWithHistory = useEditorTestFeaturesStore(
    (state) => state.removeFeatureWithHistory,
  );

  const requestDeleteFeatureLayer = useEditorTestLayerCommandsStore(
    (state) => state.requestDeleteFeatureLayer,
  );

  const setLegendGroupLabel = useEditorTestExportStore(
    (state) => state.setLegendGroupLabel,
  );

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );
  const selectedFeatureIds = useEditorTestSelectionStore(
    (state) => state.selectedFeatureIds,
  );
  const multiSelectionEnabled = useEditorTestSelectionStore(
    (state) => state.multiSelectionEnabled,
  );

  const setSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.setSelectedFeatureId,
  );
  const toggleFeatureSelection = useEditorTestSelectionStore(
    (state) => state.toggleFeatureSelection,
  );
  const setSelectedFeatureIds = useEditorTestSelectionStore(
    (state) => state.setSelectedFeatureIds,
  );
  const setMultiSelectionEnabled = useEditorTestSelectionStore(
    (state) => state.setMultiSelectionEnabled,
  );

  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );

  const objectsPanelRequest = useEditorTestSelectionStore(
    (state) => state.objectsPanelRequest,
  );

  const showAllFeatureLabels = useEditorTestMapLabelsStore(
    (state) => state.showAllFeatureLabels,
  );
  const setShowAllFeatureLabels = useEditorTestMapLabelsStore(
    (state) => state.setShowAllFeatureLabels,
  );
  const showAllGeoJsonFeatureLabels = useEditorTestMapLabelsStore(
    (state) => state.showAllGeoJsonFeatureLabels,
  );
  const setShowAllGeoJsonFeatureLabels = useEditorTestMapLabelsStore(
    (state) => state.setShowAllGeoJsonFeatureLabels,
  );
  const featureMapLabelScale = useEditorTestMapLabelsStore(
    (state) => state.featureMapLabelScale,
  );
  const setFeatureMapLabelScale = useEditorTestMapLabelsStore(
    (state) => state.setFeatureMapLabelScale,
  );
  const featureMapLabelOutlineWidth = useEditorTestMapLabelsStore(
    (state) => state.featureMapLabelOutlineWidth,
  );
  const setFeatureMapLabelOutlineWidth = useEditorTestMapLabelsStore(
    (state) => state.setFeatureMapLabelOutlineWidth,
  );

  const featuresById = useMemo(
    () => new Map(features.map((feature) => [feature.id, feature])),
    [features],
  );
  const selectedFeature = selectedFeatureId
    ? featuresById.get(selectedFeatureId)
    : undefined;
  const selectedFeatures = selectedFeatureIds.flatMap((featureId) => {
    const feature = featuresById.get(featureId);
    return feature ? [feature] : [];
  });
  const normalizedMarkerLibrarySearch = normalizeMarkerLibrarySearch(
    markerLibrarySearch,
  );
  const markerLibraryOptions = useMemo(() => {
    return DROMAP_BUILTIN_MARKER_SYMBOLS.filter((option) => {
      if (!normalizedMarkerLibrarySearch) {
        return option.categoryId === markerLibraryCategoryId;
      }

      const searchableText = normalizeMarkerLibrarySearch(
        [
          option.label,
          getMarkerCategoryLabel(option.categoryId),
          ...option.keywords,
        ].join(" "),
      );

      return searchableText.includes(normalizedMarkerLibrarySearch);
    });
  }, [markerLibraryCategoryId, normalizedMarkerLibrarySearch]);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase("fr");
  const filteredFeatures = useMemo(() => {
    if (!normalizedSearchQuery) {
      return features;
    }

    return features.filter((feature) => {
      const searchableText = [
        feature.properties.label,
        feature.properties.legendLabel,
        getFeatureTypeLabel(feature),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("fr");

      return searchableText.includes(normalizedSearchQuery);
    });
  }, [features, normalizedSearchQuery]);
  const pageCount = Math.max(
    1,
    Math.ceil(filteredFeatures.length / OBJECTS_PANEL_PAGE_SIZE),
  );
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const paginatedFeatures = filteredFeatures.slice(
    safePageIndex * OBJECTS_PANEL_PAGE_SIZE,
    (safePageIndex + 1) * OBJECTS_PANEL_PAGE_SIZE,
  );
  const displayedFeatures =
    panelMode === "selected"
      ? selectedFeatures
      : panelMode === "all"
        ? paginatedFeatures
        : [];

  const modifiableSelectedFeatures = selectedFeatures.filter(
    (feature) => !isFeatureEffectivelyLocked(feature, layers),
  );
  const selectedMarkers = modifiableSelectedFeatures.filter(isMarker);
  const selectedLines = modifiableSelectedFeatures.filter(isLine);
  const selectedZones = modifiableSelectedFeatures.filter(isZone);
  const selectedTexts = modifiableSelectedFeatures.filter(isText);
  const selectedColorFeatures = modifiableSelectedFeatures;
  const selectedNonTextFeatures = modifiableSelectedFeatures.filter(
    (feature) => !isText(feature),
  );

  function updateSelectedFeaturesDuringDrag(
    selected: LegendFeature[],
    updater: (currentFeature: DroMapFeature) => DroMapFeature,
  ) {
    updateFeatures(selected.map((feature) => feature.id), updater);
  }

  function updateSelectedFeaturesWithHistory(
    selected: LegendFeature[],
    updater: (currentFeature: DroMapFeature) => DroMapFeature,
  ) {
    updateFeaturesWithHistory(selected.map((feature) => feature.id), updater);
  }

  function getMarkerTypeKey(feature: LegendFeature) {
    const symbol = getFeatureMarkerSymbol(feature);
    return `${symbol.type}:${symbol.id}`;
  }

  function getScopedMarkerFeatureIds(feature: LegendFeature) {
    if (!editSameMarkerTypeInLayer || !isMarker(feature)) {
      return [feature.id];
    }

    const markerTypeKey = getMarkerTypeKey(feature);
    const layerId = feature.properties.layerId ?? null;

    return features
      .filter(
        (candidate) =>
          isMarker(candidate) &&
          (candidate.properties.layerId ?? null) === layerId &&
          getMarkerTypeKey(candidate) === markerTypeKey &&
          !isFeatureEffectivelyLocked(candidate, layers),
      )
      .map((candidate) => candidate.id);
  }

  function updateFeatureStyleWithScope(
    feature: LegendFeature,
    updater: (currentFeature: DroMapFeature) => DroMapFeature,
  ) {
    updateFeaturesWithHistory(getScopedMarkerFeatureIds(feature), updater);
  }

  function updateFeatureStyleDuringDrag(
    feature: LegendFeature,
    updater: (currentFeature: DroMapFeature) => DroMapFeature,
  ) {
    updateFeatures(getScopedMarkerFeatureIds(feature), updater);
  }

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

  function duplicateFeatureFromObjectsPanel(feature: LegendFeature) {
    if (
      isFeatureEffectivelyLocked(feature, layers) ||
      isFeatureGeometryLocked(feature)
    ) {
      return;
    }

    setSelectedFeatureId(feature.id);
    duplicateSelectedFeature();
  }

  function deleteFeatureFromObjectsPanel(feature: LegendFeature) {
    if (isFeatureEffectivelyLocked(feature, layers)) {
      return;
    }

    requestDeleteFeatureLayer(feature.id);
    removeFeatureWithHistory(feature.id);

    if (selectedFeatureIds.includes(feature.id)) {
      setSelectedFeatureIds(
        selectedFeatureIds.filter((featureId) => featureId !== feature.id),
      );
    }
  }

  useEffect(() => {
    if (!objectsPanelRequest) {
      return;
    }

    setPanelZIndex(bringFloatingPanelToFront());
    setPanelMode("selected");
    setIsOpen(true);
  }, [objectsPanelRequest]);

  useEffect(() => {
    if (selectedFeatureIds.length === 0) {
      return;
    }

    // Petit delai pour laisser un double-clic se terminer avant que le panneau
    // n'apparaisse eventuellement sous le pointeur. L'ouverture reste
    // automatique et la fiche legere ne rend qu'un seul objet.
    const timeoutId = window.setTimeout(() => {
      setPanelZIndex(bringFloatingPanelToFront());
      if (!multiSelectionEnabled) {
        setPanelMode("selected");
      }
      setIsOpen(true);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [multiSelectionEnabled, selectedFeatureIds]);

  useEffect(() => {
    if (
      openMarkerLibraryFeatureId &&
      !featuresById.has(openMarkerLibraryFeatureId)
    ) {
      setOpenMarkerLibraryFeatureId(null);
    }
  }, [featuresById, openMarkerLibraryFeatureId]);

  useEffect(() => {
    if (pageIndex > pageCount - 1) {
      setPageIndex(Math.max(0, pageCount - 1));
    }
  }, [pageCount, pageIndex]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setPanelZIndex(bringFloatingPanelToFront());
          setPanelMode("all");
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
      className="absolute bottom-4 right-4 top-[8.75rem] flex w-96 flex-col overflow-hidden rounded-xl border border-black/10 bg-white/95 text-sm shadow-lg backdrop-blur"
      style={{ zIndex: panelZIndex }}
      onMouseDown={(event) => {
        event.stopPropagation();
        setPanelZIndex(bringFloatingPanelToFront());
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onFocusCapture={() => setPanelZIndex(bringFloatingPanelToFront())}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
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

      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setPanelMode("selected")}
            className={[
              "rounded-lg border px-2 py-2 text-[11px] font-bold transition",
              panelMode === "selected"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Sélection ({selectedFeatures.length})
          </button>
          <button
            type="button"
            onClick={() => setPanelMode("all")}
            className={[
              "rounded-lg border px-2 py-2 text-[11px] font-bold transition",
              panelMode === "all"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Tous les objets
          </button>
          <button
            type="button"
            onClick={() => setPanelMode("labels")}
            className={[
              "rounded-lg border px-2 py-2 text-[11px] font-bold transition",
              panelMode === "labels"
                ? "border-emerald-500 bg-emerald-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Étiquettes
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {panelMode === "labels" ? (
          <section className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <h3 className="text-sm font-extrabold text-emerald-950">
                Réglages des étiquettes
              </h3>
              <p className="mt-1 text-[10px] leading-snug text-emerald-800">
                Ces réglages sont séparés des objets pour laisser toute la hauteur de l’onglet aux propriétés modifiables.
              </p>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-3 text-xs font-semibold text-violet-950">
              <span>Afficher toutes les étiquettes</span>
              <input
                type="checkbox"
                checked={showAllFeatureLabels}
                onChange={(event) =>
                  setShowAllFeatureLabels(event.target.checked)
                }
                className="h-4 w-4 cursor-pointer accent-violet-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-semibold text-emerald-900">
              <span>Afficher toutes les étiquettes GeoJSON</span>
              <input
                type="checkbox"
                checked={showAllGeoJsonFeatureLabels}
                onChange={(event) =>
                  setShowAllGeoJsonFeatureLabels(event.target.checked)
                }
                disabled={showAllFeatureLabels}
                className="h-4 w-4 cursor-pointer accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>

            <label className="block rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-xs text-sky-950">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-semibold">Taille de toutes les étiquettes</span>
                <span className="tabular-nums font-bold">
                  {Math.round(featureMapLabelScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={MIN_FEATURE_MAP_LABEL_SCALE}
                max={MAX_FEATURE_MAP_LABEL_SCALE}
                step="0.05"
                value={featureMapLabelScale}
                onChange={(event) =>
                  setFeatureMapLabelScale(Number(event.target.value))
                }
                className="w-full"
              />
            </label>

            <label className="block rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-800">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-semibold">Contour blanc des étiquettes</span>
                <span className="tabular-nums font-bold">
                  {featureMapLabelOutlineWidth === 0
                    ? "Aucun"
                    : `${featureMapLabelOutlineWidth}px`}
                </span>
              </div>
              <input
                type="range"
                min={MIN_FEATURE_MAP_LABEL_OUTLINE_WIDTH}
                max={MAX_FEATURE_MAP_LABEL_OUTLINE_WIDTH}
                step="0.25"
                value={featureMapLabelOutlineWidth}
                onChange={(event) =>
                  setFeatureMapLabelOutlineWidth(Number(event.target.value))
                }
                className="w-full"
              />
              <div className="mt-1 text-[10px] text-slate-500">
                0 px retire complètement le contour.
              </div>
            </label>
          </section>
        ) : (
          <>
            {panelMode === "selected" ? (
              <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-violet-950">
                      Sélection multiple personnalisée
                    </div>
                    <div className="mt-0.5 text-[10px] leading-snug text-violet-700">
                      Active-la puis clique sur chaque objet de la carte ou de la liste.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMultiSelectionEnabled(!multiSelectionEnabled)}
                    className={[
                      "shrink-0 rounded-lg border px-3 py-2 text-[11px] font-extrabold transition",
                      multiSelectionEnabled
                        ? "border-violet-700 bg-violet-600 text-white hover:bg-violet-700"
                        : "border-violet-300 bg-white text-violet-800 hover:bg-violet-100",
                    ].join(" ")}
                  >
                    {multiSelectionEnabled ? "Terminer" : "Activer"}
                  </button>
                </div>
                {selectedFeatures.length > 0 ? (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-violet-200 pt-2 text-[10px] font-semibold text-violet-800">
                    <span>{selectedFeatures.length} objet(s) sélectionné(s)</span>
                    <button
                      type="button"
                      onClick={clearSelectedFeatureId}
                      className="rounded-md border border-violet-300 bg-white px-2 py-1 font-bold hover:bg-violet-100"
                    >
                      Tout désélectionner
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {panelMode === "all" ? (
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Rechercher un nom ou un type…"
                className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            ) : null}

            {displayedFeatures.length === 0 ? (
              <p className="text-xs leading-relaxed text-slate-500">
                {panelMode === "selected"
                  ? "Aucun objet sélectionné. Active la sélection multiple ou clique sur un objet de la carte."
                  : "Aucun élément pour le moment. Passe en mode édition puis dessine un marqueur, une ligne, une zone ou un texte."}
              </p>
            ) : (
              <>
            {panelMode === "selected" && selectedFeatures.length > 1 ? (
              <section className="mb-4 rounded-xl border-2 border-violet-300 bg-violet-50 p-3 shadow-sm">
                <div className="mb-3">
                  <div className="text-sm font-extrabold text-violet-950">
                    Modification groupée · {selectedFeatures.length} objets
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-violet-700">
                    Les réglages ci-dessous s'appliquent en une fois à tous les objets compatibles et non verrouillés de la sélection.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {selectedColorFeatures.length > 0 ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-white px-2 py-2">
                      <span className="font-semibold text-slate-700">Couleur</span>
                      <ColorPicker
                        value={getFeatureColor(selectedColorFeatures[0])}
                        onChange={(color) =>
                          updateSelectedFeaturesWithHistory(
                            selectedColorFeatures,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties.style ?? {}),
                                  color,
                                },
                              },
                            }),
                          )
                        }
                        ariaLabel="Couleur des objets sélectionnés"
                      />
                    </div>
                  ) : null}

                  {selectedZones.length > 0 ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-white px-2 py-2">
                      <span className="font-semibold text-slate-700">Fond zones</span>
                      <ColorPicker
                        value={getFeatureFillColor(selectedZones[0])}
                        onChange={(fillColor) =>
                          updateSelectedFeaturesWithHistory(
                            selectedZones,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties.style ?? {}),
                                  fillColor,
                                  zoneFillEnabled: true,
                                },
                              },
                            }),
                          )
                        }
                        ariaLabel="Couleur de fond des zones sélectionnées"
                      />
                    </div>
                  ) : null}

                  {selectedColorFeatures.length > 0 ? (
                    <label className="col-span-2 rounded-lg border border-violet-200 bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Opacité</span>
                        <span className="tabular-nums text-slate-500">
                          {Math.round(getFeatureOpacity(selectedColorFeatures[0]) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="1"
                        step="0.05"
                        value={getFeatureOpacity(selectedColorFeatures[0])}
                        onPointerDown={commitFeaturesHistory}
                        onChange={(event) => {
                          const opacity = Number(event.target.value);
                          updateSelectedFeaturesDuringDrag(
                            selectedColorFeatures,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties.style ?? {}),
                                  opacity,
                                },
                              },
                            }),
                          );
                        }}
                        className="w-full"
                      />
                    </label>
                  ) : null}

                  {selectedMarkers.length > 0 ? (
                    <label className="col-span-2 rounded-lg border border-violet-200 bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Taille des marqueurs</span>
                        <span className="tabular-nums text-slate-500">
                          {getFeatureMarkerSize(selectedMarkers[0])} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={MIN_MARKER_SIZE}
                        max={MAX_MARKER_SIZE}
                        step="0.5"
                        value={getFeatureMarkerSize(selectedMarkers[0])}
                        onPointerDown={commitFeaturesHistory}
                        onChange={(event) => {
                          const markerSize = Number(event.target.value);
                          updateSelectedFeaturesDuringDrag(
                            selectedMarkers,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties.style ?? {}),
                                  markerSize,
                                },
                              },
                            }),
                          );
                        }}
                        className="w-full"
                      />
                    </label>
                  ) : null}

                  {selectedTexts.length > 0 ? (
                    <div className="col-span-2 rounded-lg border border-violet-200 bg-white px-2 py-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Police des textes</span>
                        <span className="tabular-nums text-slate-500">
                          {getFeatureFontSize(selectedTexts[0])} px
                        </span>
                      </div>
                      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                        <select
                          value={getFeatureFontSize(selectedTexts[0])}
                          onChange={(event) => {
                            const fontSize = clamp(
                              Number(event.target.value),
                              MIN_TEXT_FONT_SIZE,
                              MAX_TEXT_FONT_SIZE,
                            );
                            updateSelectedFeaturesWithHistory(
                              selectedTexts,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties.style ?? {}),
                                    fontSize,
                                  },
                                },
                              }),
                            );
                          }}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                          aria-label="Taille prédéfinie des textes sélectionnés"
                        >
                          {!(TEXT_FONT_SIZE_OPTIONS as readonly number[]).includes(
                            getFeatureFontSize(selectedTexts[0]),
                          ) ? (
                            <option value={getFeatureFontSize(selectedTexts[0])}>
                              {getFeatureFontSize(selectedTexts[0])} px
                            </option>
                          ) : null}
                          {TEXT_FONT_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>{size} px</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={MIN_TEXT_FONT_SIZE}
                          max={MAX_TEXT_FONT_SIZE}
                          step="0.5"
                          value={getFeatureFontSize(selectedTexts[0])}
                          onChange={(event) => {
                            const raw = Number(event.target.value);
                            if (!Number.isFinite(raw)) return;
                            const fontSize = clamp(raw, MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE);
                            updateSelectedFeaturesWithHistory(
                              selectedTexts,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties.style ?? {}),
                                    fontSize,
                                  },
                                },
                              }),
                            );
                          }}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold tabular-nums text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                          aria-label="Taille exacte des textes sélectionnés"
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const textBold = !getTextFeatureBold(selectedTexts[0]);
                            updateSelectedFeaturesWithHistory(
                              selectedTexts,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties.style ?? {}),
                                    textBold,
                                  },
                                },
                              }),
                            );
                          }}
                          className={[
                            "rounded-md border px-2 py-1.5 text-xs font-extrabold transition",
                            getTextFeatureBold(selectedTexts[0])
                              ? "border-slate-800 bg-slate-800 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          Gras
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const textItalic = !getTextFeatureItalic(selectedTexts[0]);
                            updateSelectedFeaturesWithHistory(
                              selectedTexts,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties.style ?? {}),
                                    textItalic,
                                  },
                                },
                              }),
                            );
                          }}
                          className={[
                            "rounded-md border px-2 py-1.5 text-xs font-semibold italic transition",
                            getTextFeatureItalic(selectedTexts[0])
                              ? "border-slate-800 bg-slate-800 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          Italique
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {selectedLines.length + selectedZones.length > 0 ? (
                    <label className="col-span-2 rounded-lg border border-violet-200 bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">Épaisseur traits et contours</span>
                        <span className="tabular-nums text-slate-500">
                          {getFeatureWeight((selectedLines[0] ?? selectedZones[0]) as LegendFeature)} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="18"
                        step="0.5"
                        value={getFeatureWeight((selectedLines[0] ?? selectedZones[0]) as LegendFeature)}
                        onPointerDown={commitFeaturesHistory}
                        onChange={(event) => {
                          const weight = Number(event.target.value);
                          updateSelectedFeaturesDuringDrag(
                            [...selectedLines, ...selectedZones],
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties.style ?? {}),
                                  weight,
                                },
                              },
                            }),
                          );
                        }}
                        className="w-full"
                      />
                    </label>
                  ) : null}

                  {selectedNonTextFeatures.length > 0 ? (
                    <div className="col-span-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedFeaturesWithHistory(
                            selectedNonTextFeatures,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                mapLabelVisibility: "show",
                              },
                            }),
                          )
                        }
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-2 text-[11px] font-extrabold text-emerald-800 hover:bg-emerald-100"
                      >
                        Afficher les étiquettes
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedFeaturesWithHistory(
                            selectedNonTextFeatures,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                mapLabelVisibility: "hide",
                              },
                            }),
                          )
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-[11px] font-extrabold text-slate-700 hover:bg-slate-50"
                      >
                        Masquer les étiquettes
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <ul className="space-y-3">
            {displayedFeatures.map((feature, index) => (
              <li
                key={feature.id}
                onClick={(event) => {
                  const target = event.target as HTMLElement;

                  if (target.closest("input, button, select, textarea")) {
                    return;
                  }

                  // Dans la fiche « Sélection », un clic dans la zone blanche
                  // ne doit jamais fermer la fiche ni désélectionner l'objet.
                  if (panelMode === "selected") {
                    return;
                  }

                  if (multiSelectionEnabled) {
                    toggleFeatureSelection(feature.id, { focusOnMap: true });
                    return;
                  }

                  setSelectedFeatureId(feature.id, { focusOnMap: true });
                }}
                className={[
                  "cursor-pointer rounded-lg border p-3 transition",
                  selectedFeatureIds.includes(feature.id)
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
                          : "Nom sur l’étiquette"}
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

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={
                          isFeatureEffectivelyLocked(feature, layers) ||
                          isFeatureGeometryLocked(feature)
                        }
                        title={
                          isFeatureGeometryLocked(feature)
                            ? "Un bâtiment importé conserve sa forme et sa position réelles."
                            : "Dupliquer l’objet"
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          duplicateFeatureFromObjectsPanel(feature);
                        }}
                        className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Dupliquer
                      </button>

                      <button
                        type="button"
                        disabled={isFeatureEffectivelyLocked(feature, layers)}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          deleteFeatureFromObjectsPanel(feature);
                        }}
                        className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>

                <fieldset
                  disabled={isFeatureEffectivelyLocked(feature, layers)}
                  className="grid grid-cols-2 gap-3 text-xs disabled:opacity-60"
                >
                  {!isText(feature) ? (
                    <label className="col-span-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-semibold text-emerald-900">Étiquette du nom sur la carte</span>
                        <span className="text-[10px] font-medium text-emerald-700">
                          {shouldShowFeatureMapLabel(
                            feature,
                            showAllGeoJsonFeatureLabels,
                            showAllFeatureLabels,
                          )
                            ? "visible"
                            : "masquée"}
                        </span>
                      </div>
                      <select
                        value={getFeatureMapLabelVisibility(feature)}
                        onChange={(event) => {
                          const mapLabelVisibility = event.target
                            .value as DroMapFeatureMapLabelVisibility;

                          updateFeatureWithHistory(
                            feature.id,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                mapLabelVisibility,
                              },
                            }),
                          );
                        }}
                        className="w-full rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      >
                        <option value="inherit">Selon le réglage global</option>
                        <option value="show">Toujours afficher</option>
                        <option value="hide">Toujours masquer</option>
                      </select>
                    </label>
                  ) : null}

                  {!isText(feature) ? (
                    <div className="col-span-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-2 text-[11px] text-sky-900">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">Placement de l’étiquette</span>
                        <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-bold text-sky-700">
                          {feature.properties.mapLabelOffset
                            ? "Manuel"
                            : "Automatique"}
                        </span>
                      </div>
                      <p className="mt-1 leading-snug text-sky-800">
                        Sélectionne l’objet, puis glisse directement son étiquette sur la carte pour la placer librement.
                      </p>
                      {feature.properties.mapLabelOffset ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            updateFeatureWithHistory(
                              feature.id,
                              (currentFeature) => {
                                const nextProperties = {
                                  ...currentFeature.properties,
                                };
                                delete nextProperties.mapLabelOffset;

                                return {
                                  ...currentFeature,
                                  properties: nextProperties,
                                };
                              },
                            );
                          }}
                          className="mt-2 rounded-md border border-sky-300 bg-white px-2 py-1 text-[10px] font-bold text-sky-800 transition hover:bg-sky-100"
                        >
                          Revenir au placement automatique
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {isMarker(feature) ? (
                    <label className="col-span-2 flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50 px-2 py-2 text-violet-900">
                      <input
                        type="checkbox"
                        checked={editSameMarkerTypeInLayer}
                        onChange={(event) =>
                          setEditSameMarkerTypeInLayer(event.target.checked)
                        }
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-violet-600"
                      />
                      <span>
                        <span className="block font-semibold">
                          Modifier tous les marqueurs du même type dans ce calque
                        </span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-violet-700">
                          {getScopedMarkerFeatureIds(feature).length} marqueur(s) modifiable(s) concerné(s).
                        </span>
                      </span>
                    </label>
                  ) : null}
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
                    <div className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                      <span className="text-slate-600">
                        {isZone(feature) ? "Contour" : "Couleur"}
                      </span>
                      <ColorPicker
                        value={getFeatureColor(feature)}
                        onInteractionStart={commitFeaturesHistory}
                        onChange={(nextColor) => {
                          updateFeatureStyleDuringDrag(
                            feature,
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
                        ariaLabel={isZone(feature) ? "Couleur du contour" : "Couleur de l’objet"}
                      />
                    </div>
                  )}

                  {isZone(feature) && getZoneFillEnabled(feature) && (
                    <div className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                      <span className="text-slate-600">Fond</span>
                      <ColorPicker
                        value={getFeatureFillColor(feature)}
                        onInteractionStart={commitFeaturesHistory}
                        onChange={(nextFillColor) => {
                          updateFeatures(
                            [feature.id],
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
                        ariaLabel="Couleur du fond"
                      />
                    </div>
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

                          updateFeatureStyleDuringDrag(
                            feature,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties?.style ?? {}),
                                  opacity: nextOpacity,
                                },
                              },
                            }),
                          );
                        }}
                        className="w-full"
                      />
                    </label>
                  )}

                  {isText(feature) && (
                    <>
                      <div className="col-span-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="font-semibold">Police du texte</span>
                          <span className="tabular-nums font-bold">
                            {getFeatureFontSize(feature)} px
                          </span>
                        </div>
                        <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                          <select
                            value={getFeatureFontSize(feature)}
                            onChange={(event) => {
                              const fontSize = clamp(
                                Number(event.target.value),
                                MIN_TEXT_FONT_SIZE,
                                MAX_TEXT_FONT_SIZE,
                              );
                              updateFeatureWithHistory(
                                feature.id,
                                (currentFeature) => ({
                                  ...currentFeature,
                                  properties: {
                                    ...currentFeature.properties,
                                    style: {
                                      ...(currentFeature.properties.style ?? {}),
                                      fontSize,
                                    },
                                  },
                                }),
                              );
                            }}
                            className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            aria-label="Taille prédéfinie du texte"
                          >
                            {!(TEXT_FONT_SIZE_OPTIONS as readonly number[]).includes(
                              getFeatureFontSize(feature),
                            ) ? (
                              <option value={getFeatureFontSize(feature)}>
                                {getFeatureFontSize(feature)} px
                              </option>
                            ) : null}
                            {TEXT_FONT_SIZE_OPTIONS.map((size) => (
                              <option key={size} value={size}>{size} px</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={MIN_TEXT_FONT_SIZE}
                            max={MAX_TEXT_FONT_SIZE}
                            step="0.5"
                            value={getFeatureFontSize(feature)}
                            onChange={(event) => {
                              const raw = Number(event.target.value);
                              if (!Number.isFinite(raw)) return;
                              const fontSize = clamp(raw, MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE);
                              updateFeatureWithHistory(
                                feature.id,
                                (currentFeature) => ({
                                  ...currentFeature,
                                  properties: {
                                    ...currentFeature.properties,
                                    style: {
                                      ...(currentFeature.properties.style ?? {}),
                                      fontSize,
                                    },
                                  },
                                }),
                              );
                            }}
                            className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs font-semibold tabular-nums text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            aria-label="Taille exacte du texte"
                          />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateFeatureWithHistory(
                                feature.id,
                                (currentFeature) => ({
                                  ...currentFeature,
                                  properties: {
                                    ...currentFeature.properties,
                                    style: {
                                      ...(currentFeature.properties.style ?? {}),
                                      textBold: !getTextFeatureBold(currentFeature),
                                    },
                                  },
                                }),
                              )
                            }
                            className={[
                              "rounded-md border px-2 py-1.5 text-xs font-extrabold transition",
                              getTextFeatureBold(feature)
                                ? "border-blue-700 bg-blue-700 text-white"
                                : "border-blue-200 bg-white text-blue-900 hover:bg-blue-100",
                            ].join(" ")}
                          >
                            Gras
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateFeatureWithHistory(
                                feature.id,
                                (currentFeature) => ({
                                  ...currentFeature,
                                  properties: {
                                    ...currentFeature.properties,
                                    style: {
                                      ...(currentFeature.properties.style ?? {}),
                                      textItalic: !getTextFeatureItalic(currentFeature),
                                    },
                                  },
                                }),
                              )
                            }
                            className={[
                              "rounded-md border px-2 py-1.5 text-xs font-semibold italic transition",
                              getTextFeatureItalic(feature)
                                ? "border-blue-700 bg-blue-700 text-white"
                                : "border-blue-200 bg-white text-blue-900 hover:bg-blue-100",
                            ].join(" ")}
                          >
                            Italique
                          </button>
                        </div>
                        <p className="mt-2 text-[10px] leading-snug text-blue-700">
                          Choisis une taille courante ou saisis directement la taille exacte en pixels.
                        </p>
                      </div>

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

                        <label className="col-span-2 flex items-center justify-between gap-2">
                          <span className="text-slate-600">Contour blanc des lettres</span>
                          <input
                            type="checkbox"
                            checked={getTextOutlineEnabled(feature)}
                            onChange={(event) => {
                              const textOutlineEnabled = event.target.checked;

                              updateFeatureWithHistory(
                                feature.id,
                                (currentFeature) => ({
                                  ...currentFeature,
                                  properties: {
                                    ...currentFeature.properties,
                                    style: {
                                      ...(currentFeature.properties?.style ?? {}),
                                      textOutlineEnabled,
                                      textOutlineColor: "#ffffff",
                                    },
                                  },
                                }),
                              );
                            }}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300"
                          />
                        </label>
                      </div>

                      {getTextOutlineEnabled(feature) && (
                        <label className="rounded-md bg-white px-2 py-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-slate-600">Épaisseur contour blanc</span>
                            <span className="tabular-nums text-slate-500">
                              {getTextOutlineWidth(feature)} px
                            </span>
                          </div>
                          <input
                            type="range"
                            min={MIN_TEXT_OUTLINE_WIDTH}
                            max={MAX_TEXT_OUTLINE_WIDTH}
                            step="0.25"
                            value={getTextOutlineWidth(feature)}
                            onPointerDown={() => {
                              commitFeaturesHistory();
                            }}
                            onChange={(event) => {
                              const textOutlineWidth = Number(event.target.value);

                              updateFeature(feature.id, {
                                ...feature,
                                properties: {
                                  ...feature.properties,
                                  style: {
                                    ...(feature.properties?.style ?? {}),
                                    textOutlineEnabled: true,
                                    textOutlineColor: "#ffffff",
                                    textOutlineWidth,
                                  },
                                },
                              });
                            }}
                            className="w-full"
                          />
                        </label>
                      )}

                      {getTextBackgroundEnabled(feature) && (
                        <>
                          <div className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                            <span className="text-slate-600">Couleur fond</span>
                            <ColorPicker
                              value={getTextBackgroundColor(feature)}
                              onInteractionStart={commitFeaturesHistory}
                              onChange={(textBackgroundColor) => {
                                updateFeatures(
                                  [feature.id],
                                  (currentFeature) => ({
                                    ...currentFeature,
                                    properties: {
                                      ...currentFeature.properties,
                                      style: {
                                        ...(currentFeature.properties?.style ?? {}),
                                        textBackgroundColor,
                                      },
                                    },
                                  }),
                                );
                              }}
                              ariaLabel="Couleur du fond du texte"
                            />
                          </div>

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
                          <div className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                            <span className="text-slate-600">Couleur cadre</span>
                            <ColorPicker
                              value={getTextBorderColor(feature)}
                              onInteractionStart={commitFeaturesHistory}
                              onChange={(textBorderColor) => {
                                updateFeatures(
                                  [feature.id],
                                  (currentFeature) => ({
                                    ...currentFeature,
                                    properties: {
                                      ...currentFeature.properties,
                                      style: {
                                        ...(currentFeature.properties?.style ?? {}),
                                        textBorderColor,
                                      },
                                    },
                                  }),
                                );
                              }}
                              ariaLabel="Couleur du cadre du texte"
                            />
                          </div>

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
                              step="0.5"
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
                    <div className="col-span-2 rounded-lg bg-white px-2 py-2">
                      <div className="mb-2 text-slate-600">
                        Pictogramme du marqueur
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const nextFeatureId =
                            openMarkerLibraryFeatureId === feature.id
                              ? null
                              : feature.id;

                          setOpenMarkerLibraryFeatureId(nextFeatureId);
                          setMarkerLibrarySearch("");

                          const currentSymbol = getFeatureMarkerSymbol(feature);
                          const selectedOption =
                            currentSymbol.type === "builtin"
                              ? DROMAP_BUILTIN_MARKER_SYMBOLS.find(
                                  (option) => option.id === currentSymbol.id,
                                )
                              : undefined;

                          setMarkerLibraryCategoryId(
                            selectedOption?.categoryId ?? "basic",
                          );
                        }}
                        className={[
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition",
                          openMarkerLibraryFeatureId === feature.id
                            ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
                            : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50",
                        ].join(" ")}
                        aria-expanded={openMarkerLibraryFeatureId === feature.id}
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                          <MarkerVisualPreview
                            feature={feature}
                            symbol={getFeatureMarkerSymbol(feature)}
                            size={34}
                          />
                        </span>

                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-xs text-slate-800">
                            {getMarkerSymbolLabel(feature)}
                          </strong>
                          <span className="mt-0.5 block text-[10px] text-slate-500">
                            Cliquer pour ouvrir la bibliothèque visuelle
                          </span>
                        </span>

                        <span
                          aria-hidden="true"
                          className="shrink-0 text-base font-bold text-blue-600"
                        >
                          {openMarkerLibraryFeatureId === feature.id ? "−" : "+"}
                        </span>
                      </button>

                      {openMarkerLibraryFeatureId === feature.id ? (
                        <div className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <strong className="block text-xs text-slate-900">
                                Bibliothèque de marqueurs
                              </strong>
                              <span className="text-[10px] text-slate-500">
                                Choisis directement le pictogramme en regardant son apparence.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setOpenMarkerLibraryFeatureId(null)}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              Fermer
                            </button>
                          </div>

                          <CustomMarkerLibrary
                            selectedSymbol={getFeatureMarkerSymbol(feature)}
                            onSelect={(symbol) => {
                              updateFeatureStyleWithScope(
                                feature,
                                (currentFeature) => ({
                                  ...currentFeature,
                                  properties: {
                                    ...currentFeature.properties,
                                    symbol,
                                  },
                                }),
                              );
                            }}
                          />

                          <div className="border-t border-slate-200 pt-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
                            Bibliothèque DroMap
                          </div>

                          <input
                            type="search"
                            value={markerLibrarySearch}
                            onChange={(event) =>
                              setMarkerLibrarySearch(event.target.value)
                            }
                            placeholder="Rechercher un symbole…"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />

                          <div className="flex gap-1.5 overflow-x-auto pb-1">
                            {DROMAP_MARKER_SYMBOL_CATEGORIES.map((category) => (
                              <button
                                key={category.id}
                                type="button"
                                onClick={() => {
                                  setMarkerLibraryCategoryId(category.id);
                                  setMarkerLibrarySearch("");
                                }}
                                className={[
                                  "shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold transition",
                                  markerLibraryCategoryId === category.id &&
                                  !normalizedMarkerLibrarySearch
                                    ? "border-blue-500 bg-blue-600 text-white"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700",
                                ].join(" ")}
                              >
                                {category.label}
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>
                              {markerLibraryOptions.length} résultat
                              {markerLibraryOptions.length > 1 ? "s" : ""}
                            </span>
                            <span className="font-medium text-slate-600">
                              {normalizedMarkerLibrarySearch
                                ? "Toutes les catégories"
                                : getMarkerCategoryLabel(
                                    markerLibraryCategoryId,
                                  )}
                            </span>
                          </div>

                          {markerLibraryOptions.length > 0 ? (
                            <div className="max-h-[22rem] overflow-y-auto pr-1">
                              <div className="grid grid-cols-4 gap-2">
                                {markerLibraryOptions.map((option) => {
                                  const currentSymbol =
                                    getFeatureMarkerSymbol(feature);
                                  const isSelected =
                                    currentSymbol.type === "builtin" &&
                                    currentSymbol.id === option.id;

                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      onClick={() => {
                                        const symbol: DroMapMarkerSymbol = {
                                          type: "builtin",
                                          id: option.id,
                                        };

                                        updateFeatureStyleWithScope(
                                          feature,
                                          (currentFeature) => ({
                                            ...currentFeature,
                                            properties: {
                                              ...currentFeature.properties,
                                              symbol,
                                              style: {
                                                ...(currentFeature.properties
                                                  ?.style ?? {}),
                                                ...(markerSymbolSupportsFill(
                                                  option.id,
                                                )
                                                  ? { markerFilled: true }
                                                  : {}),
                                              },
                                            },
                                          }),
                                        );
                                      }}
                                      title={option.label}
                                      aria-pressed={isSelected}
                                      className={[
                                        "flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition",
                                        isSelected
                                          ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100"
                                          : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/60",
                                      ].join(" ")}
                                    >
                                      <MarkerVisualPreview
                                        feature={feature}
                                        symbol={{ type: "builtin", id: option.id }}
                                        size={30}
                                      />
                                      <span className="line-clamp-2 text-[9px] font-medium leading-tight">
                                        {option.label}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-500">
                              Aucun marqueur ne correspond à cette recherche.
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
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
                        step="0.5"
                        value={getFeatureMarkerSize(feature)}
                        onPointerDown={() => {
                          commitFeaturesHistory();
                        }}
                        onChange={(event) => {
                          const markerSize = Number(event.target.value);

                          updateFeatureStyleDuringDrag(
                            feature,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties?.style ?? {}),
                                  markerSize,
                                },
                              },
                            }),
                          );
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
                          updateFeatureStyleDuringDrag(
                            feature,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties?.style ?? {}),
                                  markerFilled: event.target.checked,
                                },
                              },
                            }),
                          );
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
                        step="0.5"
                        value={getMarkerStrokeWeight(feature)}
                        onPointerDown={() => {
                          commitFeaturesHistory();
                        }}
                        onChange={(event) => {
                          const weight = Number(event.target.value);

                          updateFeatureStyleDuringDrag(
                            feature,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties?.style ?? {}),
                                  weight,
                                },
                              },
                            }),
                          );
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
                        step="0.5"
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
                      <div className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                        <span className="text-slate-600">Couleur hachures</span>
                        <ColorPicker
                          value={getZoneHatchingColor(feature)}
                          onInteractionStart={commitFeaturesHistory}
                          onChange={(zoneHatchingColor) => {
                            updateFeatures(
                              [feature.id],
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
                          ariaLabel="Couleur des hachures"
                        />
                      </div>

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
                          step="0.5"
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
                          step="0.5"
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
                      <div className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                        <span className="text-slate-600">Couleur points</span>
                        <ColorPicker
                          value={getZoneDotsColor(feature)}
                          onInteractionStart={commitFeaturesHistory}
                          onChange={(zoneDotsColor) => {
                            updateFeatures(
                              [feature.id],
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
                          ariaLabel="Couleur des points"
                        />
                      </div>

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
                          step="0.5"
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

            {panelMode === "all" && filteredFeatures.length > OBJECTS_PANEL_PAGE_SIZE ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] text-slate-600">
                <button
                  type="button"
                  disabled={safePageIndex === 0}
                  onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 font-bold transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Précédent
                </button>
                <span className="font-semibold tabular-nums">
                  Page {safePageIndex + 1}/{pageCount} · {filteredFeatures.length} objet(s)
                </span>
                <button
                  type="button"
                  disabled={safePageIndex >= pageCount - 1}
                  onClick={() =>
                    setPageIndex((current) => Math.min(pageCount - 1, current + 1))
                  }
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 font-bold transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Suivant
                </button>
              </div>
            ) : null}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
