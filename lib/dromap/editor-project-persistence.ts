"use client";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { normalizeFeatureDrawOrdersForPersistence } from "@/lib/dromap/feature-order";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { normalizeDromapMapView, type DromapMapView } from "@/lib/dromap/map-view";
import {
  DEFAULT_DROMAP_BASEMAP_ID,
  type DromapBasemapId,
} from "@/lib/dromap/basemap";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import {
  createDefaultDromapLayer,
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
import { useEditorToolStore } from "@/stores/editor-tool";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorMapViewStore } from "@/stores/editor-map-view";
import type { ImportedDromapProject } from "@/editor/export-download";
import { normalizeLegendSymbolStyle } from "@/editor/export-custom-legend";

export type DromapEditorExportSettings = {
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
  guestWatermarkMapPosition: ExportLegendMapPosition;
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

export type DromapEditorProjectSnapshot = {
  schemaVersion: 1;
  savedAt: string;
  features: DroMapFeature[];
  workspaceBounds: WorkspaceBounds | null;
  mapView?: DromapMapView | null;
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
  exportSettings?: DromapEditorExportSettings;
};

export type RestoreEditorProjectResult = {
  featureCount: number;
  geoJsonLayerCount: number;
  hasWorkspace: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
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
    ? Array.from(
        new Set(value.filter((item): item is string => typeof item === "string")),
      )
    : [];
}

function parseStringRecord(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function parseLegendSymbolOverrides(
  value: unknown,
): Record<string, ExportLegendSymbolStyle> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([groupKey, style]) => {
      if (!isRecord(style)) return [];
      return [[groupKey, normalizeLegendSymbolStyle(style)]];
    }),
  );
}

function parseCustomLegendEntries(value: unknown): ExportLegendCustomEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
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
          typeof item.id === "string" && item.id.trim()
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
  fallback: ExportLegendMapPosition,
): ExportLegendMapPosition {
  if (!isRecord(value)) return { ...fallback };
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

export function getDefaultDromapEditorExportSettings(): DromapEditorExportSettings {
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
    guestWatermarkMapPosition: { x: 0.5, y: 0.95 },
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

export function createDromapEditorExportSettingsSnapshot(): DromapEditorExportSettings {
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
    guestWatermarkMapPosition: {
      ...exportState.guestWatermarkMapPosition,
    },
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

export function normalizeDromapEditorExportSettings(
  value: unknown,
): DromapEditorExportSettings {
  const defaults = getDefaultDromapEditorExportSettings();
  if (!isRecord(value)) return defaults;

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
      typeof value.mapTitle === "string" ? value.mapTitle.slice(0, 240) : defaults.mapTitle,
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
    guestWatermarkMapPosition: parseLegendMapPosition(
      value.guestWatermarkMapPosition,
      defaults.guestWatermarkMapPosition,
    ),
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
      4096,
    ),
    legendItemGap: clampNumber(
      value.legendItemGap,
      defaults.legendItemGap,
      0,
      80,
    ),
    legendLabelGap: clampNumber(
      value.legendLabelGap,
      defaults.legendLabelGap,
      0,
      80,
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
      80,
    ),
    legendMapBorderEnabled: value.legendMapBorderEnabled !== false,
    legendMapBorderColor:
      typeof value.legendMapBorderColor === "string"
        ? value.legendMapBorderColor
        : defaults.legendMapBorderColor,
    legendMapBorderWidth: clampNumber(
      value.legendMapBorderWidth,
      defaults.legendMapBorderWidth,
      0,
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

export function isDromapEditorProjectSnapshot(
  value: unknown,
): value is DromapEditorProjectSnapshot {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.savedAt === "string" &&
    Array.isArray(value.features) &&
    "workspaceBounds" in value
  );
}

export function createDromapEditorProjectSnapshot(): DromapEditorProjectSnapshot {
  const featuresState = useEditorFeaturesStore.getState();
  const layersState = useEditorLayersStore.getState();
  const geoJsonState = useEditorGeoJsonLayersStore.getState();
  const workspaceState = useEditorWorkspaceStore.getState();
  const basemapState = useEditorBasemapStore.getState();
  const labelsState = useEditorMapLabelsStore.getState();
  const customMarkersState = useEditorCustomMarkersStore.getState();
  const exportSettings = createDromapEditorExportSettingsSnapshot();
  const currentMapView = useEditorMapViewStore.getState().currentView;

  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    features: normalizeFeatureDrawOrdersForPersistence(
      cloneValue(featuresState.features),
    ),
    workspaceBounds: workspaceState.workspaceBounds
      ? cloneValue(workspaceState.workspaceBounds)
      : null,
    mapView: currentMapView ? cloneValue(currentMapView) : null,
    workspaceBasemapZoom: workspaceState.workspaceBasemapZoom,
    workspaceBasemapBaseZoom: workspaceState.workspaceBasemapBaseZoom,
    basemapId: basemapState.basemapId,
    showBasemapLabels: exportSettings.showBasemapLabels,
    showCountryNeighborContext: basemapState.showCountryNeighborContext,
    showAllFeatureLabels: labelsState.showAllFeatureLabels,
    showAllGeoJsonFeatureLabels: labelsState.showAllGeoJsonFeatureLabels,
    featureMapLabelScale: labelsState.featureMapLabelScale,
    featureMapLabelOutlineWidth: labelsState.featureMapLabelOutlineWidth,
    layers: cloneValue(layersState.layers),
    activeLayerId: layersState.activeLayerId,
    geoJsonLayers: cloneValue(geoJsonState.geoJsonLayers),
    customMarkers: cloneValue(customMarkersState.customMarkers),
    exportSettings,
  };
}

export function createBlankDromapEditorProjectSnapshot(
  basemapId: DromapBasemapId = DEFAULT_DROMAP_BASEMAP_ID,
): DromapEditorProjectSnapshot {
  const layer = createDefaultDromapLayer();
  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    features: [],
    workspaceBounds: null,
    mapView: null,
    workspaceBasemapZoom: null,
    workspaceBasemapBaseZoom: null,
    basemapId,
    showBasemapLabels: true,
    showCountryNeighborContext: true,
    showAllFeatureLabels: false,
    showAllGeoJsonFeatureLabels: false,
    featureMapLabelScale: 1,
    featureMapLabelOutlineWidth: 1.5,
    layers: [layer],
    activeLayerId: layer.id,
    geoJsonLayers: [],
    customMarkers: [],
    exportSettings: getDefaultDromapEditorExportSettings(),
  };
}

export function createDromapEditorSnapshotFromImportedProject(
  imported: ImportedDromapProject,
): DromapEditorProjectSnapshot {
  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    features: cloneValue(imported.features),
    workspaceBounds: cloneValue(imported.workspaceBounds),
    mapView: null,
    workspaceBasemapZoom: imported.workspaceBasemapZoom,
    workspaceBasemapBaseZoom: imported.workspaceBasemapBaseZoom,
    basemapId: imported.basemapId,
    showBasemapLabels: imported.showBasemapLabels,
    showCountryNeighborContext: imported.showCountryNeighborContext,
    showAllFeatureLabels: imported.showAllFeatureLabels,
    showAllGeoJsonFeatureLabels: imported.showAllGeoJsonFeatureLabels,
    featureMapLabelScale: imported.featureMapLabelScale,
    featureMapLabelOutlineWidth: imported.featureMapLabelOutlineWidth,
    layers: cloneValue(imported.layers),
    activeLayerId: imported.layers[0]?.id ?? "",
    geoJsonLayers: cloneValue(imported.geoJsonLayers),
    customMarkers: cloneValue(imported.customMarkers),
    exportSettings: {
      legendTitle: imported.legendTitle,
      legendPosition: imported.legendPosition,
      legendMapPosition: cloneValue(imported.legendMapPosition),
      legendMapTitlePosition: cloneValue(imported.legendMapTitlePosition),
      exportFormat: imported.exportFormat,
      showBasemapLabels: imported.showBasemapLabels,
      mapTitle: imported.mapTitle,
      mapTitlePosition: cloneValue(imported.mapTitlePosition),
      mapTitleFontSize: imported.mapTitleFontSize,
      mapTitleColor: imported.mapTitleColor,
      guestWatermarkMapPosition: cloneValue(
        imported.guestWatermarkMapPosition,
      ),
      legendBackgroundColor: imported.legendBackgroundColor,
      legendSideWidth: imported.legendSideWidth,
      legendBottomHeight: imported.legendBottomHeight,
      legendTitleFontSize: imported.legendTitleFontSize,
      legendItemFontSize: imported.legendItemFontSize,
      legendSectionTitleFontSize: imported.legendSectionTitleFontSize,
      legendSymbolSize: imported.legendSymbolSize,
      legendItemGap: imported.legendItemGap,
      legendLabelGap: imported.legendLabelGap,
      legendLabelLineHeight: imported.legendLabelLineHeight,
      legendSectionGap: imported.legendSectionGap,
      legendMapBorderEnabled: imported.legendMapBorderEnabled,
      legendMapBorderColor: imported.legendMapBorderColor,
      legendMapBorderWidth: imported.legendMapBorderWidth,
      legendMapBorderRadius: imported.legendMapBorderRadius,
      legendMapPadding: imported.legendMapPadding,
      customLegendEntries: cloneValue(imported.customLegendEntries),
      legendSymbolOverrides: cloneValue(imported.legendSymbolOverrides),
      scaleBarEnabled: imported.scaleBarEnabled,
      scaleBarStyle: imported.scaleBarStyle,
      scaleBarPosition: imported.scaleBarPosition,
      scaleBarMapPosition: imported.scaleBarMapPosition
        ? cloneValue(imported.scaleBarMapPosition)
        : null,
      scaleBarSize: imported.scaleBarSize,
      northArrowEnabled: imported.northArrowEnabled,
      northArrowStyle: imported.northArrowStyle,
      northArrowPosition: imported.northArrowPosition,
      northArrowMapPosition: imported.northArrowMapPosition
        ? cloneValue(imported.northArrowMapPosition)
        : null,
      northArrowSize: imported.northArrowSize,
      hiddenLegendFeatureIds: cloneValue(imported.hiddenLegendFeatureIds),
      hiddenLegendGroupKeys: cloneValue(imported.hiddenLegendGroupKeys),
      legendFeatureOrder: cloneValue(imported.legendFeatureOrder),
      legendGroupOrder: cloneValue(imported.legendGroupOrder),
      legendSectionOrder: cloneValue(imported.legendSectionOrder),
      legendGroupLabels: cloneValue(imported.legendGroupLabels),
      legendGroupSections: cloneValue(imported.legendGroupSections),
    },
  };
}

export function restoreDromapEditorProjectSnapshot(
  value: unknown,
): RestoreEditorProjectResult {
  if (!isDromapEditorProjectSnapshot(value)) {
    throw new Error("La sauvegarde du projet DroMap est invalide.");
  }

  const snapshot = value;
  const layers = snapshot.layers ?? [];
  const activeLayerId = snapshot.activeLayerId ?? null;

  useEditorToolStore.getState().resetActiveTool();
  useEditorSelectionStore.getState().clearSelectedFeatureId();
  useEditorLayersStore.getState().setLayers(cloneValue(layers), activeLayerId);
  useEditorGeoJsonLayersStore
    .getState()
    .setGeoJsonLayers(cloneValue(snapshot.geoJsonLayers ?? []));
  const customMarkersStore = useEditorCustomMarkersStore.getState();
  if (customMarkersStore.libraryPersistenceEnabled) {
    customMarkersStore.mergeCustomMarkers(
      cloneValue(snapshot.customMarkers ?? []),
    );
  } else {
    customMarkersStore.replaceCustomMarkers(
      cloneValue(snapshot.customMarkers ?? []),
    );
  }
  useEditorFeaturesStore.getState().replaceFeatures(
    normalizeFeatureDrawOrdersForPersistence(cloneValue(snapshot.features)),
  );
  useEditorBasemapStore
    .getState()
    .setBasemapIdFromUnknown(snapshot.basemapId ?? DEFAULT_DROMAP_BASEMAP_ID);
  useEditorBasemapStore
    .getState()
    .setShowCountryNeighborContext(snapshot.showCountryNeighborContext !== false);
  useEditorMapLabelsStore
    .getState()
    .setShowAllFeatureLabels(snapshot.showAllFeatureLabels === true);
  useEditorMapLabelsStore
    .getState()
    .setShowAllGeoJsonFeatureLabels(
      snapshot.showAllGeoJsonFeatureLabels === true,
    );
  useEditorMapLabelsStore
    .getState()
    .setFeatureMapLabelScale(snapshot.featureMapLabelScale ?? 1);
  useEditorMapLabelsStore
    .getState()
    .setFeatureMapLabelOutlineWidth(
      snapshot.featureMapLabelOutlineWidth ?? 1.5,
    );

  const exportSettings = normalizeDromapEditorExportSettings(
    snapshot.exportSettings,
  );
  useEditorExportStore.setState(exportSettings);
  useEditorExportStore.getState().setShowBasemapLabels(
    snapshot.showBasemapLabels ?? exportSettings.showBasemapLabels,
  );

  const workspaceStore = useEditorWorkspaceStore.getState();
  if (snapshot.workspaceBounds) {
    workspaceStore.setWorkspaceBounds(cloneValue(snapshot.workspaceBounds));
    workspaceStore.validateWorkspaceZone();

    const savedBaseZoom =
      typeof snapshot.workspaceBasemapBaseZoom === "number" &&
      Number.isFinite(snapshot.workspaceBasemapBaseZoom)
        ? snapshot.workspaceBasemapBaseZoom
        : null;
    const savedDetailZoom =
      typeof snapshot.workspaceBasemapZoom === "number" &&
      Number.isFinite(snapshot.workspaceBasemapZoom)
        ? snapshot.workspaceBasemapZoom
        : null;

    if (savedBaseZoom !== null || savedDetailZoom !== null) {
      useEditorWorkspaceStore
        .getState()
        .setWorkspaceBasemapBaseZoom(savedBaseZoom ?? savedDetailZoom);
      useEditorWorkspaceStore
        .getState()
        .setWorkspaceBasemapZoom(savedDetailZoom ?? savedBaseZoom);
    }
  } else {
    workspaceStore.clearWorkspaceBounds();
    useEditorModeStore.getState().setCurrentMode("workspace-select");
  }

  const normalizedMapView = normalizeDromapMapView(snapshot.mapView);

  // Lorsqu'une vue exacte a été enregistrée, elle doit remplacer le cadrage
  // automatique de validation. Sans cela, l'éditeur exécute d'abord fitBounds
  // puis tente de restaurer le zoom, ce qui peut changer le zoom graphique et
  // le niveau de détail du fond entre le parcours de création et l'édition.
  if (normalizedMapView && snapshot.workspaceBounds) {
    useEditorWorkspaceStore.getState().consumePendingWorkspaceFit();
  }

  useEditorMapViewStore.getState().setCurrentView(normalizedMapView);
  useEditorMapViewStore
    .getState()
    .requestRestoreView(normalizedMapView);

  return {
    featureCount: snapshot.features.length,
    geoJsonLayerCount: snapshot.geoJsonLayers?.length ?? 0,
    hasWorkspace: snapshot.workspaceBounds !== null,
  };
}
