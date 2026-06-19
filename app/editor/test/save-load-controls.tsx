"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { normalizeFeatureDrawOrdersForPersistence } from "@/lib/dromap/feature-order";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import type { DromapBasemapId } from "@/lib/dromap/basemap";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import {
  type DroMapLayer,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import {
  type DromapGeoJsonLayer,
  useEditorTestGeoJsonLayersStore,
} from "@/stores/editor-test-geojson-layers";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import {
  type ExportFormat,
  type ExportLegendPosition,
  type ExportScaleBarStyle,
  useEditorTestExportStore,
} from "@/stores/editor-test-export";
import { bringFloatingPanelToFront, getInitialFloatingPanelZIndex } from "./floating-panel-z-index";

const LOCAL_SAVE_KEY = "dromap-editor-test-save-v1";

type LocalExportSettings = {
  legendTitle: string;
  legendPosition: ExportLegendPosition;
  exportFormat: ExportFormat;
  legendBackgroundColor: string;
  legendSideWidth: number;
  legendBottomHeight: number;
  legendTitleFontSize: number;
  legendItemFontSize: number;
  legendSectionTitleFontSize: number;
  scaleBarEnabled: boolean;
  scaleBarStyle: ExportScaleBarStyle;
  hiddenLegendFeatureIds: string[];
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
  basemapId?: DromapBasemapId;
  layers?: DroMapLayer[];
  activeLayerId?: string;
  geoJsonLayers?: DromapGeoJsonLayer[];
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

function parseLegendPosition(value: unknown): ExportLegendPosition {
  return value === "left" || value === "bottom" || value === "right"
    ? value
    : "right";
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

function getDefaultLocalExportSettings(): LocalExportSettings {
  return {
    legendTitle: "Légende",
    legendPosition: "right",
    exportFormat: "auto",
    legendBackgroundColor: "#ffffff",
    legendSideWidth: 420,
    legendBottomHeight: 0,
    legendTitleFontSize: 32,
    legendItemFontSize: 24,
    legendSectionTitleFontSize: 20,
    scaleBarEnabled: false,
    scaleBarStyle: "alternating",
    hiddenLegendFeatureIds: [],
    legendFeatureOrder: [],
    legendGroupOrder: [],
    legendSectionOrder: [],
    legendGroupLabels: {},
    legendGroupSections: {},
  };
}

function createLocalExportSettingsSnapshot(): LocalExportSettings {
  const exportState = useEditorTestExportStore.getState();

  return {
    legendTitle: exportState.legendTitle,
    legendPosition: exportState.legendPosition,
    exportFormat: exportState.exportFormat,
    legendBackgroundColor: exportState.legendBackgroundColor,
    legendSideWidth: exportState.legendSideWidth,
    legendBottomHeight: exportState.legendBottomHeight,
    legendTitleFontSize: exportState.legendTitleFontSize,
    legendItemFontSize: exportState.legendItemFontSize,
    legendSectionTitleFontSize: exportState.legendSectionTitleFontSize,
    scaleBarEnabled: exportState.scaleBarEnabled,
    scaleBarStyle: exportState.scaleBarStyle,
    hiddenLegendFeatureIds: [...exportState.hiddenLegendFeatureIds],
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
    exportFormat: parseExportFormat(value.exportFormat),
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
    scaleBarEnabled: value.scaleBarEnabled === true,
    scaleBarStyle: parseScaleBarStyle(value.scaleBarStyle),
    hiddenLegendFeatureIds: parseStringArray(value.hiddenLegendFeatureIds),
    legendFeatureOrder: parseStringArray(value.legendFeatureOrder),
    legendGroupOrder: parseStringArray(value.legendGroupOrder),
    legendSectionOrder: parseStringArray(value.legendSectionOrder),
    legendGroupLabels: parseStringRecord(value.legendGroupLabels),
    legendGroupSections: parseStringRecord(value.legendGroupSections),
  };
}

function restoreLocalExportSettings(value: unknown) {
  useEditorTestExportStore.setState(normalizeLocalExportSettings(value));
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

export function SaveLoadControls() {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  const features = useEditorTestFeaturesStore((state) => state.features);
  const layers = useEditorTestLayersStore((state) => state.layers);
  const activeLayerId = useEditorTestLayersStore(
    (state) => state.activeLayerId,
  );
  const setLayers = useEditorTestLayersStore((state) => state.setLayers);
  const geoJsonLayers = useEditorTestGeoJsonLayersStore(
    (state) => state.geoJsonLayers,
  );
  const setGeoJsonLayers = useEditorTestGeoJsonLayersStore(
    (state) => state.setGeoJsonLayers,
  );
  const replaceFeatures = useEditorTestFeaturesStore(
    (state) => state.replaceFeatures,
  );

  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const setWorkspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.setWorkspaceBounds,
  );
  const clearWorkspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.clearWorkspaceBounds,
  );
  const validateWorkspaceZone = useEditorTestWorkspaceStore(
    (state) => state.validateWorkspaceZone,
  );

  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );

  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);
  const setBasemapIdFromUnknown = useEditorTestBasemapStore(
    (state) => state.setBasemapIdFromUnknown,
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
    const basemapIdSnapshot = basemapId;
    const layersSnapshot = layers;
    const activeLayerIdSnapshot = activeLayerId;
    const geoJsonLayersSnapshot = geoJsonLayers;
    const exportSettingsSnapshot = createLocalExportSettingsSnapshot();

    saveTimeoutRef.current = window.setTimeout(() => {
      const featuresToSave =
        normalizeFeatureDrawOrdersForPersistence(featuresSnapshot);

      const payload: LocalSavePayload = {
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        features: featuresToSave,
        workspaceBounds: workspaceBoundsSnapshot,
        basemapId: basemapIdSnapshot,
        layers: layersSnapshot,
        activeLayerId: activeLayerIdSnapshot,
        geoJsonLayers: geoJsonLayersSnapshot,
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
      replaceFeatures(
        normalizeFeatureDrawOrdersForPersistence(parsedSave.features),
      );
      setBasemapIdFromUnknown(parsedSave.basemapId);
      restoreLocalExportSettings(parsedSave.exportSettings);
      clearSelectedFeatureId();

      if (parsedSave.workspaceBounds) {
        setWorkspaceBounds(parsedSave.workspaceBounds);
        validateWorkspaceZone();
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
            className="fixed w-64 rounded-2xl border border-black/10 bg-white/95 p-3 text-xs shadow-2xl backdrop-blur"
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
