"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { normalizeFeatureDrawOrdersForPersistence } from "@/lib/dromap/feature-order";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import type { DromapBasemapId } from "@/lib/dromap/basemap";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useDromapProductRuntime } from "@/components/dromap-product/product-runtime";
import {
  type DroMapLayer,
  useEditorLayersStore,
} from "@/stores/editor-layers";
import {
  type DromapGeoJsonLayer,
  useEditorGeoJsonLayersStore,
} from "@/stores/editor-geojson-layers";
import { useEditorSelectionStore } from "@/stores/editor-selection";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { useEditorBasemapStore } from "@/stores/editor-basemap";
import { useEditorMapLabelsStore } from "@/stores/editor-map-labels";
import {
  type DroMapCustomMarkerDefinition,
  useEditorCustomMarkersStore,
} from "@/stores/editor-custom-markers";
import {
  type ExportFormat,
  type ExportLegendCustomEntry,
  type ExportLegendMapPosition,
  type ExportLegendPosition,
  type ExportLegendSymbolStyle,
  type ExportMapElementPosition,
  type ExportNorthArrowStyle,
  type ExportScaleBarStyle,
  useEditorExportStore,
} from "@/stores/editor-export";
import { normalizeLegendSymbolStyle } from "./export-custom-legend";
import {
  bringFloatingPanelToFront,
  getInitialFloatingPanelZIndex,
} from "./floating-panel-z-index";

const LOCAL_SAVE_KEY = "dromap-editor-test-save-v1";

type LocalExportSettings = {
  legendTitle: string;
  legendPosition: ExportLegendPosition;
  legendMapPosition: ExportLegendMapPosition;
  legendMapTitlePosition: ExportLegendMapPosition;
  exportFormat: ExportFormat;
  showBasemapLabels: boolean;
  mapTitle: string;
  mapTitlePosition: ExportLegendMapPosition;
  mapTitleFontSize: number;
  mapTitleColor: string;
  legendBackgroundColor: string;
  legendSideWidth: number;
  legendBottomHeight: number;
  legendTitleFontSize: number;
  legendItemFontSize: number;
  legendSectionTitleFontSize: number;
  legendSymbolSize: number;
  legendItemGap: number;
  legendLabelGap: number;
  legendLabelLineHeight: number;
  legendSectionGap: number;
  legendMapBorderEnabled: boolean;
  legendMapBorderColor: string;
  legendMapBorderWidth: number;
  legendMapBorderRadius: number;
  legendMapPadding: number;
  customLegendEntries: ExportLegendCustomEntry[];
  legendSymbolOverrides: Record<string, ExportLegendSymbolStyle>;
  scaleBarEnabled: boolean;
  scaleBarStyle: ExportScaleBarStyle;
  scaleBarPosition: ExportMapElementPosition;
  scaleBarMapPosition: ExportLegendMapPosition | null;
  scaleBarSize: number;
  northArrowEnabled: boolean;
  northArrowStyle: ExportNorthArrowStyle;
  northArrowPosition: ExportMapElementPosition;
  northArrowMapPosition: ExportLegendMapPosition | null;
  northArrowSize: number;
  hiddenLegendFeatureIds: string[];
  hiddenLegendGroupKeys: string[];
  legendFeatureOrder: string[];
  legendGroupOrder: string[];
  legendSectionOrder: string[];
  legendGroupLabels: Record<string, string>;
  legendGroupSections: Record<string, string>;
};

type LocalSavePayload = {
  schemaVersion: 1;
  savedAt: string;
  features: DroMapFeature[];
  workspaceBounds: WorkspaceBounds | null;
  workspaceBasemapZoom?: number | null;
  workspaceBasemapBaseZoom?: number | null;
  basemapId?: DromapBasemapId;
  showBasemapLabels?: boolean;
  showCountryNeighborContext?: boolean;
  showAllFeatureLabels?: boolean;
  showAllGeoJsonFeatureLabels?: boolean;
  featureMapLabelScale?: number;
  featureMapLabelOutlineWidth?: number;
  layers?: DroMapLayer[];
  activeLayerId?: string;
  geoJsonLayers?: DromapGeoJsonLayer[];
  customMarkers?: DroMapCustomMarkerDefinition[];
  exportSettings?: LocalExportSettings;
};

type FloatingPanelPosition = {
  top: number;
  left: number;
};

function isLocalSavePayload(value: unknown): value is LocalSavePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LocalSavePayload>;

  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.savedAt === "string" &&
    Array.isArray(candidate.features) &&
    "workspaceBounds" in candidate
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const numberValue =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  return Math.min(Math.max(numberValue, min), max);
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseStringRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function parseLegendSymbolOverrides(
  value: unknown,
): Record<string, ExportLegendSymbolStyle> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([groupKey, style]) => {
      if (!isRecord(style)) {
        return [];
      }

      return [[groupKey, normalizeLegendSymbolStyle(style)]];
    }),
  );
}

function parseCustomLegendEntries(value: unknown): ExportLegendCustomEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (!isRecord(item)) {
      return [];
    }

    const symbol =
      item.symbol === "line" ||
      item.symbol === "arrow" ||
      item.symbol === "zone" ||
      item.symbol === "text"
        ? item.symbol
        : "marker";
    const dashStyle =
      item.dashStyle === "dashed" || item.dashStyle === "dotted"
        ? item.dashStyle
        : "solid";

    return [
      {
        id:
          typeof item.id === "string" && item.id.trim().length > 0
            ? item.id
            : `legend-import-${index}`,
        label: typeof item.label === "string" ? item.label : "Nouvel élément",
        section: typeof item.section === "string" ? item.section : "Général",
        symbol,
        color: typeof item.color === "string" ? item.color : "#111827",
        fillColor:
          typeof item.fillColor === "string" ? item.fillColor : "#ffffff",
        dashStyle,
        symbolStyle: isRecord(item.symbolStyle)
          ? normalizeLegendSymbolStyle(item.symbolStyle, symbol)
          : undefined,
      },
    ];
  });
}

function parseLegendPosition(value: unknown): ExportLegendPosition {
  return value === "left" ||
    value === "top" ||
    value === "bottom" ||
    value === "right" ||
    value === "map"
    ? value
    : "right";
}

function parseLegendMapPosition(
  value: unknown,
  fallback: ExportLegendMapPosition = { x: 0, y: 0.84 },
): ExportLegendMapPosition {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  return {
    x: clampNumber(value.x, fallback.x, 0, 1),
    y: clampNumber(value.y, fallback.y, 0, 1),
  };
}

function parseOptionalMapElementPosition(
  value: unknown,
): ExportLegendMapPosition | null {
  if (!isRecord(value)) return null;
  return parseLegendMapPosition(value, { x: 0.5, y: 0.5 });
}

function parseExportFormat(value: unknown): ExportFormat {
  return value === "16-9" ||
    value === "4-3" ||
    value === "a4-landscape" ||
    value === "a4-portrait" ||
    value === "square" ||
    value === "auto"
    ? value
    : "auto";
}

function parseScaleBarStyle(value: unknown): ExportScaleBarStyle {
  return value === "bar" ||
    value === "line" ||
    value === "boxed" ||
    value === "alternating"
    ? value
    : "alternating";
}

function parseNorthArrowStyle(value: unknown): ExportNorthArrowStyle {
  return value === "classic" ||
    value === "simple" ||
    value === "compass" ||
    value === "needle"
    ? value
    : "classic";
}

function parseMapElementPosition(
  value: unknown,
  fallback: ExportMapElementPosition,
): ExportMapElementPosition {
  return value === "top-left" ||
    value === "top-right" ||
    value === "bottom-left" ||
    value === "bottom-right"
    ? value
    : fallback;
}

function getDefaultLocalExportSettings(): LocalExportSettings {
  return {
    legendTitle: "Légende",
    legendPosition: "right",
    legendMapPosition: { x: 0, y: 0.84 },
    legendMapTitlePosition: { x: 0.5, y: 0 },
    exportFormat: "auto",
    showBasemapLabels: true,
    mapTitle: "",
    mapTitlePosition: { x: 0.5, y: 0.08 },
    mapTitleFontSize: 44,
    mapTitleColor: "#0f172a",
    legendBackgroundColor: "#ffffff",
    legendSideWidth: 420,
    legendBottomHeight: 0,
    legendTitleFontSize: 32,
    legendItemFontSize: 24,
    legendSectionTitleFontSize: 20,
    legendSymbolSize: 48,
    legendItemGap: 16,
    legendLabelGap: 18,
    legendLabelLineHeight: 1.2,
    legendSectionGap: 16,
    legendMapBorderEnabled: true,
    legendMapBorderColor: "#ffffff",
    legendMapBorderWidth: 1,
    legendMapBorderRadius: 12,
    legendMapPadding: 10,
    customLegendEntries: [],
    legendSymbolOverrides: {},
    scaleBarEnabled: true,
    scaleBarStyle: "alternating",
    scaleBarPosition: "bottom-left",
    scaleBarMapPosition: null,
    scaleBarSize: 1,
    northArrowEnabled: true,
    northArrowStyle: "classic",
    northArrowPosition: "top-right",
    northArrowMapPosition: null,
    northArrowSize: 1,
    hiddenLegendFeatureIds: [],
    hiddenLegendGroupKeys: [],
    legendFeatureOrder: [],
    legendGroupOrder: [],
    legendSectionOrder: [],
    legendGroupLabels: {},
    legendGroupSections: {},
  };
}

function createLocalExportSettingsSnapshot(): LocalExportSettings {
  const exportState = useEditorExportStore.getState();

  return {
    legendTitle: exportState.legendTitle,
    legendPosition: exportState.legendPosition,
    legendMapPosition: { ...exportState.legendMapPosition },
    legendMapTitlePosition: { ...exportState.legendMapTitlePosition },
    exportFormat: exportState.exportFormat,
    showBasemapLabels: exportState.showBasemapLabels,
    mapTitle: exportState.mapTitle,
    mapTitlePosition: { ...exportState.mapTitlePosition },
    mapTitleFontSize: exportState.mapTitleFontSize,
    mapTitleColor: exportState.mapTitleColor,
    legendBackgroundColor: exportState.legendBackgroundColor,
    legendSideWidth: exportState.legendSideWidth,
    legendBottomHeight: exportState.legendBottomHeight,
    legendTitleFontSize: exportState.legendTitleFontSize,
    legendItemFontSize: exportState.legendItemFontSize,
    legendSectionTitleFontSize: exportState.legendSectionTitleFontSize,
    legendSymbolSize: exportState.legendSymbolSize,
    legendItemGap: exportState.legendItemGap,
    legendLabelGap: exportState.legendLabelGap,
    legendLabelLineHeight: exportState.legendLabelLineHeight,
    legendSectionGap: exportState.legendSectionGap,
    legendMapBorderEnabled: exportState.legendMapBorderEnabled,
    legendMapBorderColor: exportState.legendMapBorderColor,
    legendMapBorderWidth: exportState.legendMapBorderWidth,
    legendMapBorderRadius: exportState.legendMapBorderRadius,
    legendMapPadding: exportState.legendMapPadding,
    customLegendEntries: exportState.customLegendEntries.map((entry) => ({
      ...entry,
      symbolStyle: entry.symbolStyle ? { ...entry.symbolStyle } : undefined,
    })),
    legendSymbolOverrides: Object.fromEntries(
      Object.entries(exportState.legendSymbolOverrides).map(([key, style]) => [
        key,
        { ...style },
      ]),
    ),
    scaleBarEnabled: exportState.scaleBarEnabled,
    scaleBarStyle: exportState.scaleBarStyle,
    scaleBarPosition: exportState.scaleBarPosition,
    scaleBarMapPosition: exportState.scaleBarMapPosition
      ? { ...exportState.scaleBarMapPosition }
      : null,
    scaleBarSize: exportState.scaleBarSize,
    northArrowEnabled: exportState.northArrowEnabled,
    northArrowStyle: exportState.northArrowStyle,
    northArrowPosition: exportState.northArrowPosition,
    northArrowMapPosition: exportState.northArrowMapPosition
      ? { ...exportState.northArrowMapPosition }
      : null,
    northArrowSize: exportState.northArrowSize,
    hiddenLegendFeatureIds: [...exportState.hiddenLegendFeatureIds],
    hiddenLegendGroupKeys: [...exportState.hiddenLegendGroupKeys],
    legendFeatureOrder: [...exportState.legendFeatureOrder],
    legendGroupOrder: [...exportState.legendGroupOrder],
    legendSectionOrder: [...exportState.legendSectionOrder],
    legendGroupLabels: { ...exportState.legendGroupLabels },
    legendGroupSections: { ...exportState.legendGroupSections },
  };
}

function normalizeLocalExportSettings(value: unknown): LocalExportSettings {
  const defaults = getDefaultLocalExportSettings();

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    legendTitle:
      typeof value.legendTitle === "string"
        ? value.legendTitle
        : defaults.legendTitle,
    legendPosition: parseLegendPosition(value.legendPosition),
    legendMapPosition: parseLegendMapPosition(
      value.legendMapPosition,
      defaults.legendMapPosition,
    ),
    legendMapTitlePosition: parseLegendMapPosition(
      value.legendMapTitlePosition,
      defaults.legendMapTitlePosition,
    ),
    exportFormat: parseExportFormat(value.exportFormat),
    showBasemapLabels:
      value.showBasemapLabels === undefined
        ? defaults.showBasemapLabels
        : value.showBasemapLabels !== false,
    mapTitle:
      typeof value.mapTitle === "string"
        ? value.mapTitle.slice(0, 240)
        : defaults.mapTitle,
    mapTitlePosition: parseLegendMapPosition(
      value.mapTitlePosition,
      defaults.mapTitlePosition,
    ),
    mapTitleFontSize: clampNumber(
      value.mapTitleFontSize,
      defaults.mapTitleFontSize,
      12,
      120,
    ),
    mapTitleColor:
      typeof value.mapTitleColor === "string"
        ? value.mapTitleColor
        : defaults.mapTitleColor,
    legendBackgroundColor:
      typeof value.legendBackgroundColor === "string"
        ? value.legendBackgroundColor
        : defaults.legendBackgroundColor,
    legendSideWidth: clampNumber(
      value.legendSideWidth,
      defaults.legendSideWidth,
      240,
      900,
    ),
    legendBottomHeight: clampNumber(
      value.legendBottomHeight,
      defaults.legendBottomHeight,
      0,
      900,
    ),
    legendTitleFontSize: clampNumber(
      value.legendTitleFontSize,
      defaults.legendTitleFontSize,
      12,
      72,
    ),
    legendItemFontSize: clampNumber(
      value.legendItemFontSize,
      defaults.legendItemFontSize,
      10,
      56,
    ),
    legendSectionTitleFontSize: clampNumber(
      value.legendSectionTitleFontSize,
      defaults.legendSectionTitleFontSize,
      10,
      56,
    ),
    legendSymbolSize: clampNumber(
      value.legendSymbolSize,
      defaults.legendSymbolSize,
      24,
      144,
    ),
    legendItemGap: clampNumber(
      value.legendItemGap,
      defaults.legendItemGap,
      0,
      40,
    ),
    legendLabelGap: clampNumber(
      value.legendLabelGap,
      defaults.legendLabelGap,
      0,
      48,
    ),
    legendLabelLineHeight: clampNumber(
      value.legendLabelLineHeight,
      defaults.legendLabelLineHeight,
      0.8,
      1.8,
    ),
    legendSectionGap: clampNumber(
      value.legendSectionGap,
      defaults.legendSectionGap,
      0,
      48,
    ),
    legendMapBorderEnabled: value.legendMapBorderEnabled !== false,
    legendMapBorderColor:
      typeof value.legendMapBorderColor === "string"
        ? value.legendMapBorderColor
        : defaults.legendMapBorderColor,
    legendMapBorderWidth: clampNumber(
      value.legendMapBorderWidth,
      defaults.legendMapBorderWidth,
      1,
      12,
    ),
    legendMapBorderRadius: clampNumber(
      value.legendMapBorderRadius,
      defaults.legendMapBorderRadius,
      0,
      40,
    ),
    legendMapPadding: clampNumber(
      value.legendMapPadding,
      defaults.legendMapPadding,
      0,
      48,
    ),
    customLegendEntries: parseCustomLegendEntries(value.customLegendEntries),
    legendSymbolOverrides: parseLegendSymbolOverrides(
      value.legendSymbolOverrides,
    ),
    scaleBarEnabled:
      value.scaleBarEnabled === undefined
        ? defaults.scaleBarEnabled
        : value.scaleBarEnabled !== false,
    scaleBarStyle: parseScaleBarStyle(value.scaleBarStyle),
    scaleBarPosition: parseMapElementPosition(
      value.scaleBarPosition,
      defaults.scaleBarPosition,
    ),
    scaleBarMapPosition: parseOptionalMapElementPosition(
      value.scaleBarMapPosition,
    ),
    scaleBarSize: clampNumber(value.scaleBarSize, defaults.scaleBarSize, 0.5, 2),
    northArrowEnabled:
      value.northArrowEnabled === undefined
        ? defaults.northArrowEnabled
        : value.northArrowEnabled !== false,
    northArrowStyle: parseNorthArrowStyle(value.northArrowStyle),
    northArrowPosition: parseMapElementPosition(
      value.northArrowPosition,
      defaults.northArrowPosition,
    ),
    northArrowMapPosition: parseOptionalMapElementPosition(
      value.northArrowMapPosition,
    ),
    northArrowSize: clampNumber(value.northArrowSize, defaults.northArrowSize, 0.5, 2),
    hiddenLegendFeatureIds: parseStringArray(value.hiddenLegendFeatureIds),
    hiddenLegendGroupKeys: parseStringArray(value.hiddenLegendGroupKeys),
    legendFeatureOrder: parseStringArray(value.legendFeatureOrder),
    legendGroupOrder: parseStringArray(value.legendGroupOrder),
    legendSectionOrder: parseStringArray(value.legendSectionOrder),
    legendGroupLabels: parseStringRecord(value.legendGroupLabels),
    legendGroupSections: parseStringRecord(value.legendGroupSections),
  };
}

function restoreLocalExportSettings(value: unknown) {
  useEditorExportStore.setState(normalizeLocalExportSettings(value));
}

function getPanelPosition(button: HTMLButtonElement): FloatingPanelPosition {
  const rect = button.getBoundingClientRect();
  const panelWidth = 260;
  const panelHeight = 210;
  const preferredLeft = rect.right + 12;

  return {
    top: Math.max(
      16,
      Math.min(rect.top, window.innerHeight - panelHeight - 16),
    ),
    left: Math.max(
      16,
      Math.min(preferredLeft, window.innerWidth - panelWidth - 16),
    ),
  };
}

function LegacySaveLoadControls() {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  const features = useEditorFeaturesStore((state) => state.features);
  const layers = useEditorLayersStore((state) => state.layers);
  const activeLayerId = useEditorLayersStore(
    (state) => state.activeLayerId,
  );
  const setLayers = useEditorLayersStore((state) => state.setLayers);
  const geoJsonLayers = useEditorGeoJsonLayersStore(
    (state) => state.geoJsonLayers,
  );
  const setGeoJsonLayers = useEditorGeoJsonLayersStore(
    (state) => state.setGeoJsonLayers,
  );
  const customMarkers = useEditorCustomMarkersStore(
    (state) => state.customMarkers,
  );
  const mergeCustomMarkers = useEditorCustomMarkersStore(
    (state) => state.mergeCustomMarkers,
  );
  const replaceFeatures = useEditorFeaturesStore(
    (state) => state.replaceFeatures,
  );

  const workspaceBounds = useEditorWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const setWorkspaceBounds = useEditorWorkspaceStore(
    (state) => state.setWorkspaceBounds,
  );
  const clearWorkspaceBounds = useEditorWorkspaceStore(
    (state) => state.clearWorkspaceBounds,
  );
  const validateWorkspaceZone = useEditorWorkspaceStore(
    (state) => state.validateWorkspaceZone,
  );
  const workspaceBasemapZoom = useEditorWorkspaceStore(
    (state) => state.workspaceBasemapZoom,
  );
  const workspaceBasemapBaseZoom = useEditorWorkspaceStore(
    (state) => state.workspaceBasemapBaseZoom,
  );
  const setWorkspaceBasemapZoom = useEditorWorkspaceStore(
    (state) => state.setWorkspaceBasemapZoom,
  );
  const setWorkspaceBasemapBaseZoom = useEditorWorkspaceStore(
    (state) => state.setWorkspaceBasemapBaseZoom,
  );

  const clearSelectedFeatureId = useEditorSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );

  const basemapId = useEditorBasemapStore((state) => state.basemapId);
  const showCountryNeighborContext = useEditorBasemapStore(
    (state) => state.showCountryNeighborContext,
  );
  const setShowCountryNeighborContext = useEditorBasemapStore(
    (state) => state.setShowCountryNeighborContext,
  );
  const setBasemapIdFromUnknown = useEditorBasemapStore(
    (state) => state.setBasemapIdFromUnknown,
  );
  const showBasemapLabels = useEditorExportStore(
    (state) => state.showBasemapLabels,
  );
  const setShowBasemapLabels = useEditorExportStore(
    (state) => state.setShowBasemapLabels,
  );
  const showAllFeatureLabels = useEditorMapLabelsStore(
    (state) => state.showAllFeatureLabels,
  );
  const setShowAllFeatureLabels = useEditorMapLabelsStore(
    (state) => state.setShowAllFeatureLabels,
  );
  const showAllGeoJsonFeatureLabels = useEditorMapLabelsStore(
    (state) => state.showAllGeoJsonFeatureLabels,
  );
  const setShowAllGeoJsonFeatureLabels = useEditorMapLabelsStore(
    (state) => state.setShowAllGeoJsonFeatureLabels,
  );
  const featureMapLabelScale = useEditorMapLabelsStore(
    (state) => state.featureMapLabelScale,
  );
  const setFeatureMapLabelScale = useEditorMapLabelsStore(
    (state) => state.setFeatureMapLabelScale,
  );
  const featureMapLabelOutlineWidth = useEditorMapLabelsStore(
    (state) => state.featureMapLabelOutlineWidth,
  );
  const setFeatureMapLabelOutlineWidth = useEditorMapLabelsStore(
    (state) => state.setFeatureMapLabelOutlineWidth,
  );

  const [hasMounted, setHasMounted] = useState(false);
  const [hasLocalSave, setHasLocalSave] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] =
    useState<FloatingPanelPosition | null>(null);
  const [panelZIndex, setPanelZIndex] = useState(
    getInitialFloatingPanelZIndex(),
  );

  useEffect(() => {
    setHasMounted(true);
    setHasLocalSave(localStorage.getItem(LOCAL_SAVE_KEY) !== null);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }

      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => {
      if (!buttonRef.current) {
        return;
      }

      setPanelPosition(getPanelPosition(buttonRef.current));
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  if (!hasMounted) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          aria-label="Sauvegarde locale"
          aria-disabled="true"
          tabIndex={-1}
          className="flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-lg font-bold text-neutral-400 shadow-sm"
        >
          💾
        </button>
      </div>
    );
  }

  function handleSave() {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setPanelZIndex(bringFloatingPanelToFront());
    setIsSaving(true);
    setStatus("Sauvegarde locale en attente...");

    const featuresSnapshot = features;
    const workspaceBoundsSnapshot = workspaceBounds;
    const workspaceBasemapZoomSnapshot = workspaceBasemapZoom;
    const workspaceBasemapBaseZoomSnapshot = workspaceBasemapBaseZoom;
    const basemapIdSnapshot = basemapId;
    const showBasemapLabelsSnapshot = showBasemapLabels;
    const showCountryNeighborContextSnapshot = showCountryNeighborContext;
    const showAllFeatureLabelsSnapshot = showAllFeatureLabels;
    const showAllGeoJsonFeatureLabelsSnapshot = showAllGeoJsonFeatureLabels;
    const featureMapLabelScaleSnapshot = featureMapLabelScale;
    const featureMapLabelOutlineWidthSnapshot = featureMapLabelOutlineWidth;
    const layersSnapshot = layers;
    const activeLayerIdSnapshot = activeLayerId;
    const geoJsonLayersSnapshot = geoJsonLayers;
    const customMarkersSnapshot = customMarkers;
    const exportSettingsSnapshot = createLocalExportSettingsSnapshot();

    saveTimeoutRef.current = window.setTimeout(() => {
      const featuresToSave =
        normalizeFeatureDrawOrdersForPersistence(featuresSnapshot);

      const payload: LocalSavePayload = {
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        features: featuresToSave,
        workspaceBounds: workspaceBoundsSnapshot,
        workspaceBasemapZoom: workspaceBasemapZoomSnapshot,
        workspaceBasemapBaseZoom: workspaceBasemapBaseZoomSnapshot,
        basemapId: basemapIdSnapshot,
        showBasemapLabels: showBasemapLabelsSnapshot,
        showCountryNeighborContext: showCountryNeighborContextSnapshot,
        showAllFeatureLabels: showAllFeatureLabelsSnapshot,
        showAllGeoJsonFeatureLabels: showAllGeoJsonFeatureLabelsSnapshot,
        featureMapLabelScale: featureMapLabelScaleSnapshot,
        featureMapLabelOutlineWidth: featureMapLabelOutlineWidthSnapshot,
        layers: layersSnapshot,
        activeLayerId: activeLayerIdSnapshot,
        geoJsonLayers: geoJsonLayersSnapshot,
        customMarkers: customMarkersSnapshot,
        exportSettings: exportSettingsSnapshot,
      };

      localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(payload));
      saveTimeoutRef.current = null;
      setIsSaving(false);
      setHasLocalSave(true);
      setStatus("Enregistré avec succès.");
      closeTimeoutRef.current = window.setTimeout(() => {
        setIsOpen(false);
        closeTimeoutRef.current = null;
      }, 900);
    }, 250);
  }

  function handleLoad() {
    const rawSave = localStorage.getItem(LOCAL_SAVE_KEY);

    if (!rawSave) {
      setStatus("Aucune sauvegarde.");
      return;
    }

    try {
      const parsedSave: unknown = JSON.parse(rawSave);

      if (!isLocalSavePayload(parsedSave)) {
        setStatus("Sauvegarde invalide.");
        return;
      }

      setLayers(parsedSave.layers ?? [], parsedSave.activeLayerId ?? null);
      setGeoJsonLayers(parsedSave.geoJsonLayers ?? []);
      mergeCustomMarkers(parsedSave.customMarkers ?? []);
      replaceFeatures(
        normalizeFeatureDrawOrdersForPersistence(parsedSave.features),
      );
      setBasemapIdFromUnknown(parsedSave.basemapId);
      setShowCountryNeighborContext(
        parsedSave.showCountryNeighborContext !== false,
      );
      setShowAllFeatureLabels(parsedSave.showAllFeatureLabels === true);
      setShowAllGeoJsonFeatureLabels(
        parsedSave.showAllGeoJsonFeatureLabels === true,
      );
      setFeatureMapLabelScale(parsedSave.featureMapLabelScale ?? 1);
      setFeatureMapLabelOutlineWidth(
        parsedSave.featureMapLabelOutlineWidth ?? 1.5,
      );
      restoreLocalExportSettings(parsedSave.exportSettings);
      setShowBasemapLabels(
        parsedSave.showBasemapLabels ??
          parsedSave.exportSettings?.showBasemapLabels ??
          true,
      );
      clearSelectedFeatureId();

      if (parsedSave.workspaceBounds) {
        setWorkspaceBounds(parsedSave.workspaceBounds);
        validateWorkspaceZone();

        const savedBaseZoom =
          typeof parsedSave.workspaceBasemapBaseZoom === "number" &&
          Number.isFinite(parsedSave.workspaceBasemapBaseZoom)
            ? parsedSave.workspaceBasemapBaseZoom
            : null;
        const savedDetailZoom =
          typeof parsedSave.workspaceBasemapZoom === "number" &&
          Number.isFinite(parsedSave.workspaceBasemapZoom)
            ? parsedSave.workspaceBasemapZoom
            : null;

        if (savedBaseZoom !== null || savedDetailZoom !== null) {
          setWorkspaceBasemapBaseZoom(savedBaseZoom ?? savedDetailZoom);
          setWorkspaceBasemapZoom(savedDetailZoom ?? savedBaseZoom);
        }
      } else {
        clearWorkspaceBounds();
      }

      setStatus(
        `${parsedSave.features.length} objet(s) et ${(parsedSave.geoJsonLayers ?? []).length} calque(s) GeoJSON chargé(s).`,
      );
      setIsOpen(false);
    } catch {
      setStatus("Lecture impossible.");
    }
  }

  function handleClearSave() {
    const confirmed = window.confirm("Effacer la sauvegarde locale ?");

    if (!confirmed) {
      return;
    }

    localStorage.removeItem(LOCAL_SAVE_KEY);
    setHasLocalSave(false);
    setStatus("Sauvegarde effacée.");
  }

  const panel =
    isOpen && panelPosition
      ? createPortal(
          <section
            className="fixed w-64 rounded-2xl border border-black/10 bg-white/95 p-3 text-xs shadow-lg backdrop-blur"
            style={{
              top: panelPosition.top,
              left: panelPosition.left,
              zIndex: panelZIndex,
            }}
            onMouseDown={() => setPanelZIndex(bringFloatingPanelToFront())}
            onFocusCapture={() => setPanelZIndex(bringFloatingPanelToFront())}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-neutral-900">
                  Sauvegarde locale
                </div>
                <div className="text-[10px] text-neutral-500">
                  Navigateur uniquement
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-2 py-1 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
              >
                Fermer
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-xl bg-neutral-900 px-3 py-2 font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
              >
                {isSaving ? "Sauvegarde..." : "Enregistrer"}
              </button>

              <button
                type="button"
                onClick={handleLoad}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2 font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Charger
              </button>

              <button
                type="button"
                onClick={handleClearSave}
                aria-disabled={!hasLocalSave}
                className={[
                  "col-span-2 rounded-xl border px-3 py-2 font-medium transition",
                  hasLocalSave
                    ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
                    : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400",
                ].join(" ")}
              >
                Effacer sauvegarde
              </button>
            </div>

            {status ? (
              <p className="mt-2 rounded-xl bg-neutral-100 px-2 py-1 text-[11px] text-neutral-700">
                {status}
              </p>
            ) : null}
          </section>,
          document.body,
        )
      : null;

  return (
    <div className="flex justify-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (buttonRef.current) {
            setPanelPosition(getPanelPosition(buttonRef.current));
          }

          setPanelZIndex(bringFloatingPanelToFront());
          setIsOpen((current) => !current);
        }}
        title="Sauvegarde locale"
        aria-label="Sauvegarde locale"
        className={[
          "flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-bold shadow-sm transition",
          isOpen
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50",
        ].join(" ")}
      >
        💾
      </button>

      {panel}
    </div>
  );
}

export function SaveLoadControls() {
  const runtime = useDromapProductRuntime();
  return runtime.enabled ? null : <LegacySaveLoadControls />;
}
