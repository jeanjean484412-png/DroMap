"use client";

import dynamic from "next/dynamic";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  ExportFormat,
  ExportLegendPosition,
} from "@/stores/editor-export";
import { useEditorExportStore } from "@/stores/editor-export";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import {
  getRenderableFeaturesForLayers,
  useEditorLayersStore,
} from "@/stores/editor-layers";
import {
  getGeoJsonLayerLoadedFeatureCount,
  getRenderableGeoJsonLayers,
  parseGeoJsonTextToDromapGeoJsonLayer,
  type DromapGeoJsonLayer,
  type DromapGeoJsonPrecisionMode,
  useEditorGeoJsonLayersStore,
} from "@/stores/editor-geojson-layers";
import { useEditorSelectionStore } from "@/stores/editor-selection";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { useEditorBasemapStore } from "@/stores/editor-basemap";
import { useEditorMapLabelsStore } from "@/stores/editor-map-labels";
import { useEditorCustomMarkersStore } from "@/stores/editor-custom-markers";
import {
  createCanvasExportPreviewDataUrl,
  type ExportVisualQuality,
  downloadCanvasExportAsJpeg,
  downloadCanvasExportAsPdf,
  downloadCanvasExportAsPng,
  downloadCanvasExportAsSvg,
  downloadCanvasExportAsWebp,
  downloadFeaturesAsCsv,
  downloadFeaturesAsGeoJson,
  downloadProjectAsJson,
  parseDromapProjectJson,
  type ImportedDromapProject,
} from "./export-download";
import { ExportPreviewScene } from "./export-preview-scene";
import {
  convertGeoJsonLayerToDromapFeatures,
  GEOJSON_TO_DROMAP_HEAVY_FEATURE_THRESHOLD,
} from "./geojson-layer-conversion";
import { ColorPicker } from "./color-picker";
import {
  bringFloatingPanelToFront,
  getInitialFloatingPanelZIndex,
} from "./floating-panel-z-index";
import {
  getDromapBasemapConfig,
  getDromapBasemapExportQualityMode,
  supportsDromapHighQualityExport,
} from "@/lib/dromap/basemap";
import { useDromapProductRuntime } from "@/components/dromap-product/product-runtime";
import { useDromapProductStore } from "@/stores/dromap-product";
import { resolveDromapPreferences } from "@/lib/dromap/preferences";
import { useDromapProjectSave } from "@/components/dromap-product/project-autosave";
import { DromapDialog } from "@/components/dromap-ui/dialog";
import { DromapButton } from "@/components/dromap-ui/button";
import { DashboardProjectPublicationDialog } from "@/components/dromap-product/dashboard-project-publication-dialog";
import { markDromapSingleMapDownloaded } from "@/lib/dromap/billing";
import {
  MAX_LEGEND_ITEM_FONT_SIZE,
  MAX_LEGEND_TITLE_FONT_SIZE,
  MIN_LEGEND_ITEM_FONT_SIZE,
  MIN_LEGEND_TITLE_FONT_SIZE,
  MAX_LEGEND_SECTION_TITLE_FONT_SIZE,
  MIN_LEGEND_SECTION_TITLE_FONT_SIZE,
  clampExportNumber,
} from "./export-layout";
import { getExportLegendGlobalSymbolScale } from "./export-legend-layout";
import { RenderKeyboardHistory } from "./render-keyboard-history";
import { getFeatureIdsOutsideWorkspace } from "./workspace-feature-intersection";

const GeoJsonLibraryBrowser = dynamic(
  () =>
    import("./geojson-library-browser").then(
      (module) => module.GeoJsonLibraryBrowser,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-teal-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        Chargement de la bibliothèque GeoJSON...
      </div>
    ),
  },
);

const LEGEND_POSITION_OPTIONS: Array<{
  value: ExportLegendPosition;
  label: string;
  description: string;
}> = [
  {
    value: "right",
    label: "À droite",
    description: "Carte à gauche, légende à droite.",
  },
  {
    value: "left",
    label: "À gauche",
    description: "Légende à gauche, carte à droite.",
  },
  {
    value: "top",
    label: "En haut",
    description: "Légende au-dessus, carte en dessous.",
  },
  {
    value: "bottom",
    label: "En bas",
    description: "Carte au-dessus, légende en dessous.",
  },
  {
    value: "map",
    label: "Sur la carte",
    description:
      "La légende est superposée à la carte et se déplace par clic prolongé puis glissement.",
  },
];

const EXPORT_FORMAT_OPTIONS: Array<{
  value: ExportFormat;
  label: string;
  description: string;
}> = [
  {
    value: "auto",
    label: "Automatique",
    description: "Garde le comportement actuel selon la zone et la légende.",
  },
  {
    value: "16-9",
    label: "16:9 paysage",
    description: "Format large pour présentation ou vidéo.",
  },
  {
    value: "4-3",
    label: "4:3 paysage",
    description: "Format classique de diapositive ou document.",
  },
  {
    value: "a4-landscape",
    label: "A4 paysage",
    description: "Ratio A4 horizontal, pratique pour impression.",
  },
  {
    value: "a4-portrait",
    label: "A4 portrait",
    description: "Ratio A4 vertical, utile pour fiche ou devoir.",
  },
  {
    value: "square",
    label: "Carré",
    description: "Format 1:1 pour support compact ou réseau social.",
  },
];

const GEOJSON_PRECISION_IMPORT_OPTIONS: Array<{
  value: DromapGeoJsonPrecisionMode;
  label: string;
  description: string;
}> = [
  {
    value: "original",
    label: "Originale",
    description:
      "Conserve exactement toutes les coordonnées du fichier importé.",
  },
  {
    value: "intermediate",
    label: "Intermédiaire",
    description:
      "Réduit environ un tiers des coordonnées pour un rendu plus fluide.",
  },
  {
    value: "light",
    label: "Légère",
    description:
      "Réduit environ trois quarts des coordonnées pour les fichiers lourds.",
  },
];

type VisualExportFormat = "png" | "jpeg" | "webp" | "pdf" | "svg";

const VISUAL_EXPORT_QUALITY_OPTIONS: Array<{
  value: ExportVisualQuality;
  label: string;
  description: string;
}> = [
  {
    value: "standard",
    label: "Standard",
    description: "Définition volontairement très allégée pour les usages rapides.",
  },
  {
    value: "high",
    label: "Haute qualité",
    description:
      "Définition fine, légèrement allégée par rapport au rendu maximal.",
  },
  {
    value: "very-high",
    label: "Très haute qualité",
    description:
      "Rendu maximal, plus lent, pour les fonds vectoriels et la vue satellite IGN.",
  },
];

function getVisualExportFormatLabel(format: VisualExportFormat) {
  switch (format) {
    case "png":
      return "PNG";
    case "jpeg":
      return "JPEG";
    case "webp":
      return "WebP";
    case "pdf":
      return "PDF";
    case "svg":
      return "SVG";
    default:
      return "export";
  }
}


type PendingDromapProjectImport = {
  fileName: string;
  fileSizeBytes: number;
  warnings: string[];
  project: ImportedDromapProject;
};

function formatImportFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: value >= 10 ? 1 : 2 }).format(value)} ${units[unit]}`;
}

function buildProjectImportWarnings(project: ImportedDromapProject, fileSizeBytes: number) {
  const warnings: string[] = [];
  const geoJsonFeatureCount = project.geoJsonLayers.reduce((sum, layer) => sum + Math.max(0, layer.featureCount ?? 0), 0);
  if (fileSizeBytes >= 25 * 1024 * 1024) {
    warnings.push("Ce Projet DroMap est volumineux. L’ajout peut prendre quelques secondes.");
  }
  if (project.features.length >= 5_000) {
    warnings.push(`${project.features.length.toLocaleString("fr-FR")} objets DroMap vont être ajoutés. La carte peut être plus lourde à manipuler.`);
  }
  if (geoJsonFeatureCount >= 50_000) {
    warnings.push(`Les calques GeoJSON contiennent environ ${geoJsonFeatureCount.toLocaleString("fr-FR")} entités. Ils resteront regroupés pour préserver les performances.`);
  }
  return warnings;
}

function createImportId(prefix: string, originalId: string, usedIds: Set<string>) {
  if (originalId && !usedIds.has(originalId)) {
    usedIds.add(originalId);
    return originalId;
  }
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let candidate = `${prefix}-${suffix}`;
  while (usedIds.has(candidate)) candidate = `${prefix}-${suffix}-${Math.random().toString(36).slice(2, 7)}`;
  usedIds.add(candidate);
  return candidate;
}

function createImportName(name: string, usedNames: Set<string>) {
  const base = name.trim() || "Élément importé";
  if (!usedNames.has(base.toLocaleLowerCase("fr-FR"))) {
    usedNames.add(base.toLocaleLowerCase("fr-FR"));
    return base;
  }
  let index = 2;
  let candidate = `${base} (${index})`;
  while (usedNames.has(candidate.toLocaleLowerCase("fr-FR"))) {
    index += 1;
    candidate = `${base} (${index})`;
  }
  usedNames.add(candidate.toLocaleLowerCase("fr-FR"));
  return candidate;
}

function customMarkerDefinitionsMatch(a: { kind: string; dataUrl: string; elements?: unknown }, b: { kind: string; dataUrl: string; elements?: unknown }) {
  return a.kind === b.kind && a.dataUrl === b.dataUrl && JSON.stringify(a.elements ?? null) === JSON.stringify(b.elements ?? null);
}

export function ExportSetupPanel() {
  const router = useRouter();
  const {
    enabled: productRuntimeEnabled,
    projectId: productProjectId,
    capabilities,
    singleMapMaxExportPurchased,
    singleMapPurchaseRequiresZoneLock,
    singleMapZoneLocked,
    markSingleMapZoneLockedLocally,
    requestRestriction,
  } = useDromapProductRuntime();
  const showDromapGuestWatermark =
    productRuntimeEnabled && !capabilities.canSaveOnline;
  const accountPreferences = useDromapProductStore((state) => state.accountPreferences);
  const productProjectName = useDromapProductStore((state) =>
    productProjectId
      ? state.projects.find((project) => project.id === productProjectId)?.name ?? "Projet sans titre"
      : "Projet sans titre",
  );
  const sourceAttribution = useDromapProductStore((state) =>
    productProjectId
      ? state.projects.find((project) => project.id === productProjectId)?.sourceAttribution ?? null
      : null,
  );
  const setProjectSourceAttribution = useDromapProductStore(
    (state) => state.setProjectSourceAttribution,
  );
  const resolvedProductPreferences = useMemo(
    () => resolveDromapPreferences(accountPreferences),
    [accountPreferences],
  );
  const { saveNow } = useDromapProjectSave();
  const [isDownloadingPng, setIsDownloadingPng] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingJpeg, setIsDownloadingJpeg] = useState(false);
  const [isDownloadingWebp, setIsDownloadingWebp] = useState(false);
  const [isDownloadingSvg, setIsDownloadingSvg] = useState(false);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [isDownloadingJson, setIsDownloadingJson] = useState(false);
  const [isDownloadingGeoJson, setIsDownloadingGeoJson] = useState(false);
  const [isImportingProject, setIsImportingProject] = useState(false);
  const [isImportingGeoJson, setIsImportingGeoJson] = useState(false);
  const [pendingGeoJsonImport, setPendingGeoJsonImport] =
    useState<DromapGeoJsonLayer | null>(null);
  const [pendingProjectImport, setPendingProjectImport] =
    useState<PendingDromapProjectImport | null>(null);
  const [useImportedBasemap, setUseImportedBasemap] = useState(false);
  const [useImportedWorkspace, setUseImportedWorkspace] = useState(false);
  const [geoJsonImportPrecision, setGeoJsonImportPrecision] =
    useState<DromapGeoJsonPrecisionMode>("original");
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [renderPreviewUrl, setRenderPreviewUrl] = useState<string | null>(null);
  const [guestWatermarkOfferOpen, setGuestWatermarkOfferOpen] = useState(false);
  const [publicationDialogOpen, setPublicationDialogOpen] = useState(false);
  const [publicationPreparing, setPublicationPreparing] = useState(false);
  const [pendingVisualExportFormat, setPendingVisualExportFormat] =
    useState<VisualExportFormat | null>(null);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [firstDownloadWarningOpen, setFirstDownloadWarningOpen] = useState(false);
  const [firstDownloadWarningAccepted, setFirstDownloadWarningAccepted] = useState(false);
  const [isDataExportMenuOpen, setIsDataExportMenuOpen] = useState(false);
  const [panelZIndex, setPanelZIndex] = useState(
    getInitialFloatingPanelZIndex(),
  );
  const importProjectInputRef = useRef<HTMLInputElement | null>(null);
  const importGeoJsonInputRef = useRef<HTMLInputElement | null>(null);

  const isExportPanelOpen = useEditorExportStore(
    (state) => state.isExportPanelOpen,
  );
  const isImportPanelOpen = useEditorExportStore(
    (state) => state.isImportPanelOpen,
  );

  const legendTitle = useEditorExportStore((state) => state.legendTitle);

  const legendPosition = useEditorExportStore(
    (state) => state.legendPosition,
  );
  const setLegendPosition = useEditorExportStore(
    (state) => state.setLegendPosition,
  );
  const legendMapPosition = useEditorExportStore(
    (state) => state.legendMapPosition,
  );
  const legendMapTitlePosition = useEditorExportStore(
    (state) => state.legendMapTitlePosition,
  );

  const exportFormat = useEditorExportStore((state) => state.exportFormat);
  const showBasemapLabels = useEditorExportStore(
    (state) => state.showBasemapLabels,
  );
  const mapTitle = useEditorExportStore((state) => state.mapTitle);
  const mapTitlePosition = useEditorExportStore(
    (state) => state.mapTitlePosition,
  );
  const mapTitleFontSize = useEditorExportStore(
    (state) => state.mapTitleFontSize,
  );
  const mapTitleColor = useEditorExportStore(
    (state) => state.mapTitleColor,
  );
  const setExportFormat = useEditorExportStore(
    (state) => state.setExportFormat,
  );

  const legendBackgroundColor = useEditorExportStore(
    (state) => state.legendBackgroundColor,
  );
  const setLegendBackgroundColor = useEditorExportStore(
    (state) => state.setLegendBackgroundColor,
  );

  const legendSideWidth = useEditorExportStore(
    (state) => state.legendSideWidth,
  );

  const legendBottomHeight = useEditorExportStore(
    (state) => state.legendBottomHeight,
  );

  const legendTitleFontSize = useEditorExportStore(
    (state) => state.legendTitleFontSize,
  );
  const setLegendTitleFontSize = useEditorExportStore(
    (state) => state.setLegendTitleFontSize,
  );

  const legendItemFontSize = useEditorExportStore(
    (state) => state.legendItemFontSize,
  );
  const setLegendItemFontSize = useEditorExportStore(
    (state) => state.setLegendItemFontSize,
  );
  const legendSectionTitleFontSize = useEditorExportStore(
    (state) => state.legendSectionTitleFontSize,
  );
  const setLegendSectionTitleFontSize = useEditorExportStore(
    (state) => state.setLegendSectionTitleFontSize,
  );
  const legendSymbolSize = useEditorExportStore(
    (state) => state.legendSymbolSize,
  );
  const requestOpenAdvancedLegendEditor = useEditorExportStore(
    (state) => state.requestOpenAdvancedLegendEditor,
  );
  const setLegendSymbolSize = useEditorExportStore(
    (state) => state.setLegendSymbolSize,
  );
  const legendItemGap = useEditorExportStore(
    (state) => state.legendItemGap,
  );
  const legendLabelGap = useEditorExportStore(
    (state) => state.legendLabelGap,
  );
  const legendLabelLineHeight = useEditorExportStore(
    (state) => state.legendLabelLineHeight,
  );
  const legendSectionGap = useEditorExportStore(
    (state) => state.legendSectionGap,
  );
  const legendMapBorderEnabled = useEditorExportStore(
    (state) => state.legendMapBorderEnabled,
  );
  const legendMapBorderColor = useEditorExportStore(
    (state) => state.legendMapBorderColor,
  );
  const legendMapBorderWidth = useEditorExportStore(
    (state) => state.legendMapBorderWidth,
  );
  const legendMapBorderRadius = useEditorExportStore(
    (state) => state.legendMapBorderRadius,
  );
  const legendMapPadding = useEditorExportStore(
    (state) => state.legendMapPadding,
  );
  const customLegendEntries = useEditorExportStore(
    (state) => state.customLegendEntries,
  );
  const legendSymbolOverrides = useEditorExportStore(
    (state) => state.legendSymbolOverrides,
  );

  const closeExportPanel = useEditorExportStore(
    (state) => state.closeExportPanel,
  );
  const closeImportPanel = useEditorExportStore(
    (state) => state.closeImportPanel,
  );

  const handleCloseExportPanel = () => {
    // Dans le produit, « Légende & Rendu final » est un écran plein écran
    // superposé à l'éditeur déjà monté. Le fermer doit donc seulement retirer
    // cet écran : aucune navigation Next.js, aucun remontage Leaflet/MapLibre
    // et aucun recalcul de zone.
    closeExportPanel();

    if (productRuntimeEnabled && productProjectId) {
      // Sauvegarder les réglages de rendu en arrière-plan sans bloquer le
      // retour visuel et sans générer la miniature lourde d'une navigation.
      void saveNow("automatic");

      // Compatibilité avec les anciens favoris/liens directs vers /render :
      // on corrige simplement l'URL sans déclencher une navigation React.
      if (typeof window !== "undefined") {
        const legacyRenderPath = `/projects/${productProjectId}/render`;
        if (window.location.pathname === legacyRenderPath) {
          window.history.replaceState(
            window.history.state,
            "",
            `/projects/${productProjectId}/editor`,
          );
        }
      }
    }
  };

  const handleOpenPublicationDialog = async () => {
    if (!productRuntimeEnabled || !productProjectId || publicationPreparing) return;
    setPublicationPreparing(true);
    try {
      // La publication doit reprendre exactement l’état courant de « Légende & Rendu final ».
      // On capture donc les réglages de rendu avant d’ouvrir la fenêtre de publication.
      await saveNow("manual");
      setPublicationDialogOpen(true);
    } finally {
      setPublicationPreparing(false);
    }
  };

  const hiddenLegendFeatureIds = useEditorExportStore(
    (state) => state.hiddenLegendFeatureIds,
  );
  const hiddenLegendGroupKeys = useEditorExportStore(
    (state) => state.hiddenLegendGroupKeys,
  );
  const legendFeatureOrder = useEditorExportStore(
    (state) => state.legendFeatureOrder,
  );
  const legendGroupLabels = useEditorExportStore(
    (state) => state.legendGroupLabels,
  );
  const legendGroupSections = useEditorExportStore(
    (state) => state.legendGroupSections,
  );
  const legendGroupOrder = useEditorExportStore(
    (state) => state.legendGroupOrder,
  );
  const legendSectionOrder = useEditorExportStore(
    (state) => state.legendSectionOrder,
  );
  const scaleBarEnabled = useEditorExportStore(
    (state) => state.scaleBarEnabled,
  );
  const scaleBarStyle = useEditorExportStore(
    (state) => state.scaleBarStyle,
  );
  const scaleBarPosition = useEditorExportStore(
    (state) => state.scaleBarPosition,
  );
  const scaleBarMapPosition = useEditorExportStore(
    (state) => state.scaleBarMapPosition,
  );
  const scaleBarSize = useEditorExportStore((state) => state.scaleBarSize);
  const northArrowEnabled = useEditorExportStore(
    (state) => state.northArrowEnabled,
  );
  const northArrowStyle = useEditorExportStore(
    (state) => state.northArrowStyle,
  );
  const northArrowPosition = useEditorExportStore(
    (state) => state.northArrowPosition,
  );
  const northArrowMapPosition = useEditorExportStore(
    (state) => state.northArrowMapPosition,
  );
  const northArrowSize = useEditorExportStore((state) => state.northArrowSize);
  const resetExportLegendConfig = useEditorExportStore(
    (state) => state.resetExportLegendConfig,
  );

  const features = useEditorFeaturesStore((state) => state.features);
  const addFeaturesWithHistory = useEditorFeaturesStore(
    (state) => state.addFeaturesWithHistory,
  );
  const customMarkers = useEditorCustomMarkersStore((state) => state.customMarkers);
  const mergeCustomMarkers = useEditorCustomMarkersStore(
    (state) => state.mergeCustomMarkers,
  );
  const layers = useEditorLayersStore((state) => state.layers);
  const activeLayerId = useEditorLayersStore((state) => state.activeLayerId);
  const setLayers = useEditorLayersStore((state) => state.setLayers);
  const createLayer = useEditorLayersStore((state) => state.createLayer);
  const deleteLayer = useEditorLayersStore((state) => state.deleteLayer);
  const workspaceBounds = useEditorWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const renderableFeatures = useMemo(
    () => getRenderableFeaturesForLayers(features, layers, { workspaceBounds }),
    [features, layers, workspaceBounds],
  );
  const geoJsonLayers = useEditorGeoJsonLayersStore(
    (state) => state.geoJsonLayers,
  );
  const addGeoJsonLayer = useEditorGeoJsonLayersStore(
    (state) => state.addGeoJsonLayer,
  );
  const setGeoJsonLayers = useEditorGeoJsonLayersStore(
    (state) => state.setGeoJsonLayers,
  );
  const renderableGeoJsonLayers = useMemo(
    () =>
      getRenderableGeoJsonLayers(geoJsonLayers).filter(
        (layer) =>
          getGeoJsonLayerLoadedFeatureCount(layer, workspaceBounds) > 0,
      ),
    [geoJsonLayers, workspaceBounds],
  );
  const clearSelectedFeatureId = useEditorSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );
  useEffect(() => {
    if (isExportPanelOpen || isImportPanelOpen) {
      setPanelZIndex(bringFloatingPanelToFront());
    }
  }, [isExportPanelOpen, isImportPanelOpen]);

  useEffect(() => {
    if (isExportPanelOpen) {
      clearSelectedFeatureId();
    }
  }, [clearSelectedFeatureId, isExportPanelOpen]);

  const setWorkspaceBounds = useEditorWorkspaceStore(
    (state) => state.setWorkspaceBounds,
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
  const basemapId = useEditorBasemapStore((state) => state.basemapId);
  const setBasemapId = useEditorBasemapStore((state) => state.setBasemapId);
  const showCountryNeighborContext = useEditorBasemapStore(
    (state) => state.showCountryNeighborContext,
  );
  const setShowCountryNeighborContext = useEditorBasemapStore(
    (state) => state.setShowCountryNeighborContext,
  );
  const showAllFeatureLabels = useEditorMapLabelsStore(
    (state) => state.showAllFeatureLabels,
  );
  const showAllGeoJsonFeatureLabels = useEditorMapLabelsStore(
    (state) => state.showAllGeoJsonFeatureLabels,
  );
  const featureMapLabelScale = useEditorMapLabelsStore(
    (state) => state.featureMapLabelScale,
  );
  const featureMapLabelOutlineWidth = useEditorMapLabelsStore(
    (state) => state.featureMapLabelOutlineWidth,
  );
  const editorFeatureMapLabelRenderScale = useEditorMapLabelsStore(
    (state) => state.editorFeatureMapLabelRenderScale,
  );
  const editorFeatureMapLabelVisualZoom = useEditorMapLabelsStore(
    (state) => state.editorFeatureMapLabelVisualZoom,
  );
  const editorFeatureMapLabelOffsets = useEditorMapLabelsStore(
    (state) => state.editorFeatureMapLabelOffsets,
  );
  const basemap = getDromapBasemapConfig(basemapId);
  const basemapExportQualityMode = getDromapBasemapExportQualityMode(basemap);
  const supportsHighQualityBasemapExport =
    supportsDromapHighQualityExport(basemap);
  const highQualityBasemapExplanation =
    basemapExportQualityMode === "vector"
      ? "Les qualités supérieures rerendent ce fond vectoriel directement à la résolution de sortie."
      : basemapExportQualityMode === "raster-native-detail"
        ? "Les qualités supérieures chargent des orthophotographies IGN plus précises, sans modifier l’emprise ni la position des objets."
        : "Ce fond ne possède pas de source plus détaillée utilisable sans modifier son contenu cartographique.";
  const isVisualExportBusy =
    isDownloadingPng ||
    isDownloadingJpeg ||
    isDownloadingWebp ||
    isDownloadingPdf ||
    isDownloadingSvg;

  if (!isExportPanelOpen && !isImportPanelOpen) {
    return null;
  }

  function createExportInput(options: { includeHiddenLayers?: boolean } = {}) {
    if (!workspaceBounds) {
      return null;
    }

    return {
      features: options.includeHiddenLayers ? features : renderableFeatures,
      layers,
      geoJsonLayers: options.includeHiddenLayers
        ? geoJsonLayers
        : renderableGeoJsonLayers,
      customMarkers,
      workspaceBounds,
      workspaceBasemapZoom,
      workspaceBasemapBaseZoom,
      basemapId,
      showBasemapLabels,
      mapTitle,
      mapTitlePosition,
      mapTitleFontSize,
      mapTitleColor,
      showCountryNeighborContext,
      showAllFeatureLabels,
      showAllGeoJsonFeatureLabels,
      featureMapLabelScale,
      featureMapLabelOutlineWidth,
      featureMapLabelRenderScale:
        editorFeatureMapLabelRenderScale ?? featureMapLabelScale,
      featureMapLabelEditorVisualZoom: editorFeatureMapLabelVisualZoom,
      featureMapLabelEditorOffsets: editorFeatureMapLabelOffsets,
      creatorAttribution:
        sourceAttribution &&
        sourceAttribution.kind === "public-map" &&
        !(sourceAttribution.allowRemoval && sourceAttribution.hidden)
          ? {
              label: sourceAttribution.creatorName,
              position: sourceAttribution.position,
              mapPosition: sourceAttribution.mapPosition ?? null,
            }
          : null,
      legendTitle,
      legendPosition,
      legendMapPosition,
      legendMapTitlePosition,
      exportFormat,
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
      customLegendEntries,
      legendSymbolOverrides,
      scaleBarEnabled,
      scaleUnits: resolvedProductPreferences.scaleUnits,
      scaleBarStyle,
      scaleBarPosition,
      scaleBarMapPosition,
      scaleBarSize,
      northArrowEnabled,
      northArrowStyle,
      northArrowPosition,
      northArrowMapPosition,
      northArrowSize,
      hiddenLegendFeatureIds,
      hiddenLegendGroupKeys,
      legendFeatureOrder,
      legendGroupLabels,
      legendGroupSections,
      legendGroupOrder,
      legendSectionOrder,
    };
  }

  async function lockSingleMapZoneAfterSuccessfulDownload() {
    if (!productRuntimeEnabled || !productProjectId || !singleMapPurchaseRequiresZoneLock || singleMapZoneLocked) {
      return { locked: singleMapZoneLocked, error: null as string | null };
    }

    // Le fichier est déjà généré à ce stade : verrouille immédiatement la zone
    // dans la session, puis persiste ce droit côté serveur. Cela empêche qu'un
    // clic rapide sur « Zone de travail » contourne la règle après le premier
    // téléchargement.
    markSingleMapZoneLockedLocally();
    setFirstDownloadWarningAccepted(false);

    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await markDromapSingleMapDownloaded(productProjectId);
      if (result.ok) {
        return { locked: true, error: null as string | null };
      }
      lastError = result.error ?? "Synchronisation du verrouillage impossible.";
      if (attempt < 2) {
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
    }

    return {
      locked: true,
      error:
        lastError ??
        "La zone est verrouillée dans cette session, mais DroMap n’a pas pu synchroniser ce verrouillage avec le serveur.",
    };
  }

  function openDownloadMenuWithSingleMapWarning() {
    setIsDataExportMenuOpen(false);
    if (isDownloadMenuOpen) {
      setIsDownloadMenuOpen(false);
      setFirstDownloadWarningAccepted(false);
      return;
    }
    if (productRuntimeEnabled && singleMapPurchaseRequiresZoneLock && !singleMapZoneLocked && !firstDownloadWarningAccepted) {
      setFirstDownloadWarningOpen(true);
      return;
    }
    setIsDownloadMenuOpen(true);
  }

  function requestVisualExport(format: VisualExportFormat) {
    if (!workspaceBounds || isVisualExportBusy) {
      return;
    }

    if (format !== "png" && !capabilities.canExportOtherVisualFormats) {
      requestRestriction({
        title: `Export ${getVisualExportFormatLabel(format)} réservé aux formules Plus et Pro`,
        description:
          "Les formats autres que PNG sont inclus dans les abonnements Plus et Pro. Le projet actuel reste inchangé.",
      });
      return;
    }

    setPendingVisualExportFormat(format);
  }

  async function handleConfirmVisualExportQuality(
    quality: ExportVisualQuality,
  ) {
    if (!pendingVisualExportFormat || isVisualExportBusy) {
      return;
    }

    if (quality !== "standard" && !capabilities.canExportHighQuality) {
      requestRestriction({
        title: "Qualité supérieure",
        description:
          "Choisis Plus ou Pro, ou débloque l’Export Max uniquement pour cette carte. La qualité modifie la définition, jamais les proportions de la carte.",
        pricingPath: productProjectId
          ? `/pricing?purchase=single-map&projectId=${encodeURIComponent(productProjectId)}`
          : "/pricing",
      });
      return;
    }

    if (quality !== "standard" && !supportsHighQualityBasemapExport) {
      setDownloadStatus(
        "Les qualités supérieures ne sont pas disponibles pour ce fond de carte.",
      );
      return;
    }

    const format = pendingVisualExportFormat;
    setPendingVisualExportFormat(null);

    switch (format) {
      case "png":
        await handleDownloadPng(quality);
        return;
      case "jpeg":
        await handleDownloadJpeg(quality);
        return;
      case "webp":
        await handleDownloadWebp(quality);
        return;
      case "pdf":
        await handleDownloadPdf(quality);
        return;
      case "svg":
        await handleDownloadSvg(quality);
        return;
      default:
        return;
    }
  }

  async function handleDownloadPng(quality: ExportVisualQuality = "standard") {
    const exportInput = createExportInput();

    if (!exportInput || isDownloadingPng) {
      return;
    }

    try {
      clearSelectedFeatureId();
      setIsDownloadingPng(true);
      setDownloadStatus("Préparation du PNG...");

      await downloadCanvasExportAsPng(exportInput, {
        quality,
        showDromapGuestWatermark,
      });

      const zoneLockResult = await lockSingleMapZoneAfterSuccessfulDownload();
      setDownloadStatus(
        zoneLockResult.error
          ? `PNG téléchargé. ${zoneLockResult.error}`
          : zoneLockResult.locked
            ? "PNG téléchargé. La zone de travail de cette carte est désormais verrouillée."
            : "PNG téléchargé.",
      );
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        "Export PNG impossible pour l’instant. Le rendu canvas n’a pas pu générer l’image.",
      );
    } finally {
      setIsDownloadingPng(false);
    }
  }

  async function handleDownloadPdf(quality: ExportVisualQuality = "standard") {
    const exportInput = createExportInput();

    if (!exportInput || isDownloadingPdf) {
      return;
    }

    try {
      clearSelectedFeatureId();
      setIsDownloadingPdf(true);
      setDownloadStatus("Préparation du PDF...");

      await downloadCanvasExportAsPdf(exportInput, {
        quality,
        showDromapGuestWatermark,
      });

      const zoneLockResult = await lockSingleMapZoneAfterSuccessfulDownload();
      setDownloadStatus(
        zoneLockResult.error
          ? `PDF téléchargé. ${zoneLockResult.error}`
          : zoneLockResult.locked
            ? "PDF téléchargé. La zone de travail de cette carte est désormais verrouillée."
            : "PDF téléchargé.",
      );
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        "Export PDF impossible pour l’instant. Le rendu canvas n’a pas pu générer le document.",
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  async function handleDownloadJpeg(quality: ExportVisualQuality = "standard") {
    const exportInput = createExportInput();

    if (!exportInput || isDownloadingJpeg) {
      return;
    }

    try {
      clearSelectedFeatureId();
      setIsDownloadingJpeg(true);
      setDownloadStatus("Préparation du JPEG...");

      await downloadCanvasExportAsJpeg(exportInput, {
        quality,
        showDromapGuestWatermark,
      });

      const zoneLockResult = await lockSingleMapZoneAfterSuccessfulDownload();
      setDownloadStatus(
        zoneLockResult.error
          ? `JPEG téléchargé. ${zoneLockResult.error}`
          : zoneLockResult.locked
            ? "JPEG téléchargé. La zone de travail de cette carte est désormais verrouillée."
            : "JPEG téléchargé.",
      );
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        "Export JPEG impossible pour l’instant. Le rendu canvas n’a pas pu générer l’image.",
      );
    } finally {
      setIsDownloadingJpeg(false);
    }
  }

  async function handleDownloadWebp(quality: ExportVisualQuality = "standard") {
    const exportInput = createExportInput();

    if (!exportInput || isDownloadingWebp) {
      return;
    }

    try {
      clearSelectedFeatureId();
      setIsDownloadingWebp(true);
      setDownloadStatus("Préparation du WebP...");

      await downloadCanvasExportAsWebp(exportInput, {
        quality,
        showDromapGuestWatermark,
      });

      const zoneLockResult = await lockSingleMapZoneAfterSuccessfulDownload();
      setDownloadStatus(
        zoneLockResult.error
          ? `WebP téléchargé. ${zoneLockResult.error}`
          : zoneLockResult.locked
            ? "WebP téléchargé. La zone de travail de cette carte est désormais verrouillée."
            : "WebP téléchargé.",
      );
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        "Export WebP impossible pour l’instant. Le navigateur n’a pas pu générer l’image.",
      );
    } finally {
      setIsDownloadingWebp(false);
    }
  }

  async function handleDownloadSvg(quality: ExportVisualQuality = "standard") {
    const exportInput = createExportInput();

    if (!exportInput || isDownloadingSvg) {
      return;
    }

    try {
      clearSelectedFeatureId();
      setIsDownloadingSvg(true);
      setDownloadStatus("Préparation du SVG...");

      await downloadCanvasExportAsSvg(exportInput, {
        quality,
        showDromapGuestWatermark,
      });

      const zoneLockResult = await lockSingleMapZoneAfterSuccessfulDownload();
      setDownloadStatus(
        zoneLockResult.error
          ? `SVG téléchargé. ${zoneLockResult.error}`
          : zoneLockResult.locked
            ? "SVG téléchargé. La zone de travail de cette carte est désormais verrouillée."
            : "SVG téléchargé.",
      );
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        "Export SVG impossible pour l’instant. Le rendu canvas n’a pas pu générer le fichier SVG.",
      );
    } finally {
      setIsDownloadingSvg(false);
    }
  }

  function handleDownloadCsv() {
    if (!capabilities.canExportProjectData) {
      requestRestriction({
        title: "Export de données réservé aux utilisateurs connectés",
        description:
          "Les exports Projet DroMap, GeoJSON et CSV nécessitent un compte. Le projet courant reste enregistré sur cet appareil.",
      });
      return;
    }
    if (isDownloadingCsv) {
      return;
    }

    try {
      setIsDownloadingCsv(true);
      setDownloadStatus("Préparation du CSV...");

      downloadFeaturesAsCsv(renderableFeatures);

      setDownloadStatus("CSV téléchargé.");
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        "Export CSV impossible pour l’instant. Les objets n’ont pas pu être convertis en tableau.",
      );
    } finally {
      setIsDownloadingCsv(false);
    }
  }

  function handleDownloadJson() {
    if (!capabilities.canExportProjectData) {
      requestRestriction({
        title: "Export de données réservé aux utilisateurs connectés",
        description:
          "Les exports Projet DroMap, GeoJSON et CSV nécessitent un compte. Le projet courant reste enregistré sur cet appareil.",
      });
      return;
    }
    const exportInput = createExportInput({ includeHiddenLayers: true });

    if (!exportInput || isDownloadingJson) {
      return;
    }

    try {
      setIsDownloadingJson(true);
      setDownloadStatus("Préparation du JSON...");

      downloadProjectAsJson(exportInput);

      setDownloadStatus("JSON téléchargé.");
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        "Export JSON impossible pour l’instant. Le projet n’a pas pu être converti.",
      );
    } finally {
      setIsDownloadingJson(false);
    }
  }

  function handleDownloadGeoJson() {
    if (!capabilities.canExportProjectData) {
      requestRestriction({
        title: "Export de données réservé aux utilisateurs connectés",
        description:
          "Les exports Projet DroMap, GeoJSON et CSV nécessitent un compte. Le projet courant reste enregistré sur cet appareil.",
      });
      return;
    }
    const exportInput = createExportInput();

    if (!exportInput || isDownloadingGeoJson) {
      return;
    }

    try {
      setIsDownloadingGeoJson(true);
      setDownloadStatus("Préparation du GeoJSON...");

      downloadFeaturesAsGeoJson(exportInput);

      setDownloadStatus("GeoJSON téléchargé.");
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        "Export GeoJSON impossible pour l’instant. Les objets n’ont pas pu être convertis.",
      );
    } finally {
      setIsDownloadingGeoJson(false);
    }
  }

  function handleImportProjectClick() {
    if (isImportingProject) {
      return;
    }

    importProjectInputRef.current?.click();
  }

  async function handleImportProjectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file || isImportingProject) return;

    try {
      setIsImportingProject(true);
      setDownloadStatus("Analyse du Projet DroMap…");
      const importedProject = parseDromapProjectJson(await file.text());
      setPendingProjectImport({
        fileName: file.name,
        fileSizeBytes: file.size,
        warnings: buildProjectImportWarnings(importedProject, file.size),
        project: importedProject,
      });
      setUseImportedBasemap(false);
      setUseImportedWorkspace(false);
      setDownloadStatus(
        `Projet analysé (${formatImportFileSize(file.size)}) : ${importedProject.features.length.toLocaleString("fr-FR")} objet${importedProject.features.length > 1 ? "s" : ""}, ${importedProject.layers.length.toLocaleString("fr-FR")} calque${importedProject.layers.length > 1 ? "s" : ""} DroMap et ${importedProject.geoJsonLayers.length.toLocaleString("fr-FR")} calque${importedProject.geoJsonLayers.length > 1 ? "s" : ""} GeoJSON.`,
      );
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        error instanceof Error
          ? error.message
          : "Import impossible : le fichier ne correspond pas à un Projet DroMap valide.",
      );
    } finally {
      setIsImportingProject(false);
    }
  }

  function confirmPendingProjectImport() {
    const pending = pendingProjectImport;
    if (!pending) return;
    const importedProject = pending.project;
    const now = new Date().toISOString();

    clearSelectedFeatureId();
    setRenderPreviewUrl(null);

    const usedLayerIds = new Set(layers.map((layer) => layer.id));
    const usedLayerNames = new Set(layers.map((layer) => layer.name.toLocaleLowerCase("fr-FR")));
    const layerIdMap = new Map<string, string>();
    const maxLayerOrder = layers.reduce((max, layer) => Math.max(max, layer.order), 0);
    const importedLayers = importedProject.layers.map((layer, index) => {
      const id = createImportId("dromap-layer-import", layer.id, usedLayerIds);
      layerIdMap.set(layer.id, id);
      return {
        ...layer,
        id,
        name: createImportName(layer.name, usedLayerNames),
        order: maxLayerOrder + (index + 1) * 1000,
        createdAt: now,
        updatedAt: now,
        sourceSavedLayerId: undefined,
      };
    });

    const usedMarkerIds = new Set(customMarkers.map((marker) => marker.id));
    const existingMarkerMap = new Map(customMarkers.map((marker) => [marker.id, marker] as const));
    const markerIdMap = new Map<string, string>();
    const markersToMerge = importedProject.customMarkers.flatMap((marker) => {
      const existing = existingMarkerMap.get(marker.id);
      if (existing && customMarkerDefinitionsMatch(existing, marker)) {
        markerIdMap.set(marker.id, existing.id);
        return [];
      }
      const id = createImportId("custom-marker-import", marker.id, usedMarkerIds);
      markerIdMap.set(marker.id, id);
      return [{ ...marker, id, updatedAt: now }];
    });

    const usedFeatureIds = new Set(features.map((feature) => feature.id));
    const featureIdMap = new Map<string, string>();
    const importedFeatures = importedProject.features.map((feature) => {
      const id = createImportId("feature-import", feature.id, usedFeatureIds);
      featureIdMap.set(feature.id, id);
      const symbol = feature.properties.symbol;
      const mappedSymbol = symbol && symbol.type !== "builtin" && markerIdMap.has(symbol.id)
        ? { ...symbol, id: markerIdMap.get(symbol.id)! }
        : symbol;
      return {
        ...feature,
        id,
        properties: {
          ...feature.properties,
          layerId: feature.properties.layerId
            ? layerIdMap.get(feature.properties.layerId) ?? feature.properties.layerId
            : undefined,
          symbol: mappedSymbol,
        },
      };
    });

    const usedGeoJsonIds = new Set(geoJsonLayers.map((layer) => layer.id));
    const usedGeoJsonNames = new Set(geoJsonLayers.map((layer) => layer.name.toLocaleLowerCase("fr-FR")));
    const maxGeoJsonOrder = geoJsonLayers.reduce((max, layer) => Math.max(max, layer.order), 0);
    const importedGeoJsonLayers = importedProject.geoJsonLayers.map((layer, index) => ({
      ...layer,
      id: createImportId("geojson-layer-import", layer.id, usedGeoJsonIds),
      name: createImportName(layer.name, usedGeoJsonNames),
      order: maxGeoJsonOrder + (index + 1) * 1000,
      createdAt: now,
      updatedAt: now,
      sourceSavedLayerId: undefined,
    }));

    if (markersToMerge.length) mergeCustomMarkers(markersToMerge);
    if (importedLayers.length) setLayers([...layers, ...importedLayers], activeLayerId);
    if (importedGeoJsonLayers.length) setGeoJsonLayers([...geoJsonLayers, ...importedGeoJsonLayers]);
    if (importedFeatures.length) addFeaturesWithHistory(importedFeatures);

    const exportState = useEditorExportStore.getState();
    const customEntryIds = new Set(exportState.customLegendEntries.map((entry) => entry.id));
    const importedCustomEntries = importedProject.customLegendEntries.map((entry) => ({
      ...entry,
      id: createImportId("legend-entry-import", entry.id, customEntryIds),
    }));
    const uniqueStrings = (values: string[]) => Array.from(new Set(values));
    useEditorExportStore.setState({
      customLegendEntries: [...exportState.customLegendEntries, ...importedCustomEntries],
      hiddenLegendFeatureIds: uniqueStrings([
        ...exportState.hiddenLegendFeatureIds,
        ...importedProject.hiddenLegendFeatureIds.map((id) => featureIdMap.get(id) ?? id),
      ]),
      hiddenLegendGroupKeys: uniqueStrings([
        ...exportState.hiddenLegendGroupKeys,
        ...importedProject.hiddenLegendGroupKeys,
      ]),
      legendFeatureOrder: uniqueStrings([
        ...exportState.legendFeatureOrder,
        ...importedProject.legendFeatureOrder.map((id) => featureIdMap.get(id) ?? id),
      ]),
      legendGroupOrder: uniqueStrings([
        ...exportState.legendGroupOrder,
        ...importedProject.legendGroupOrder,
      ]),
      legendSectionOrder: uniqueStrings([
        ...exportState.legendSectionOrder,
        ...importedProject.legendSectionOrder,
      ]),
      // En cas de groupe déjà présent dans la carte courante, sa personnalisation
      // actuelle reste prioritaire. Les nouveaux groupes récupèrent celle du fichier.
      legendGroupLabels: {
        ...importedProject.legendGroupLabels,
        ...exportState.legendGroupLabels,
      },
      legendGroupSections: {
        ...importedProject.legendGroupSections,
        ...exportState.legendGroupSections,
      },
      legendSymbolOverrides: {
        ...importedProject.legendSymbolOverrides,
        ...exportState.legendSymbolOverrides,
      },
    });

    if (useImportedBasemap) {
      setBasemapId(importedProject.basemapId, { fit: false });
      setShowCountryNeighborContext(importedProject.showCountryNeighborContext);
    }
    if (useImportedWorkspace) {
      setWorkspaceBounds(importedProject.workspaceBounds);
      validateWorkspaceZone();
      setWorkspaceBasemapBaseZoom(
        importedProject.workspaceBasemapBaseZoom ?? importedProject.workspaceBasemapZoom,
      );
      setWorkspaceBasemapZoom(importedProject.workspaceBasemapZoom);
    }

    const outsideCount = !useImportedWorkspace && workspaceBounds
      ? getFeatureIdsOutsideWorkspace(importedFeatures, workspaceBounds).length
      : 0;
    setPendingProjectImport(null);
    setDownloadStatus(
      `${importedFeatures.length.toLocaleString("fr-FR")} objet${importedFeatures.length > 1 ? "s" : ""}, ${importedLayers.length.toLocaleString("fr-FR")} calque${importedLayers.length > 1 ? "s" : ""} DroMap et ${importedGeoJsonLayers.length.toLocaleString("fr-FR")} calque${importedGeoJsonLayers.length > 1 ? "s" : ""} GeoJSON ajoutés au projet courant.${outsideCount > 0 ? ` ${outsideCount.toLocaleString("fr-FR")} objet${outsideCount > 1 ? "s sont" : " est"} hors de la zone actuelle et reste${outsideCount > 1 ? "nt" : ""} conservé${outsideCount > 1 ? "s" : ""}.` : ""}`,
    );
  }

  function handleImportGeoJsonClick() {
    if (isImportingGeoJson) {
      return;
    }

    importGeoJsonInputRef.current?.click();
  }

  async function handleImportGeoJsonFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file || isImportingGeoJson) {
      return;
    }

    try {
      setIsImportingGeoJson(true);
      setDownloadStatus("Lecture du GeoJSON...");

      const text = await file.text();
      const importedLayer = parseGeoJsonTextToDromapGeoJsonLayer(text, {
        sourceName: file.name,
        existingLayerCount: geoJsonLayers.length,
        precisionMode: geoJsonImportPrecision,
      });

      setPendingGeoJsonImport(importedLayer);
      setDownloadStatus(
        `GeoJSON analysé (${formatImportFileSize(file.size)}) : ${importedLayer.featureCount.toLocaleString("fr-FR")} entité${
          importedLayer.featureCount > 1 ? "s" : ""
        } et ${importedLayer.coordinateCount.toLocaleString("fr-FR")} coordonnée${
          importedLayer.coordinateCount > 1 ? "s" : ""
        }. Choisis maintenant le mode d’import.`,
      );
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        error instanceof Error
          ? error.message
          : "Import GeoJSON impossible : le fichier est invalide ou vide.",
      );
    } finally {
      setIsImportingGeoJson(false);
    }
  }

  function confirmPendingGeoJsonImport(
    mode: "geojson" | "dromap",
  ) {
    const importedLayer = pendingGeoJsonImport;
    if (!importedLayer) return;

    clearSelectedFeatureId();
    setRenderPreviewUrl(null);

    if (mode === "geojson") {
      addGeoJsonLayer(importedLayer);

      setDownloadStatus(
        `GeoJSON ajouté comme calque léger (${GEOJSON_PRECISION_IMPORT_OPTIONS.find(
          (option) => option.value === importedLayer.precisionMode,
        )?.label ?? "Originale"}) : ${importedLayer.featureCount.toLocaleString(
          "fr-FR",
        )} entité${importedLayer.featureCount > 1 ? "s" : ""}.`,
      );
      setPendingGeoJsonImport(null);
      return;
    }

    const layerId = createLayer(importedLayer.name);
    try {
      const convertedFeatures = convertGeoJsonLayerToDromapFeatures(
        importedLayer,
        layerId,
      ).map((feature) => {
        const { lockOverride: _lockOverride, ...nextProperties } =
          feature.properties;

        return {
          ...feature,
          properties: {
            ...nextProperties,
            locked: false,
          },
        };
      });

      useEditorLayersStore.setState((state) => ({
        layers: state.layers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                name: importedLayer.name,
                visible: importedLayer.visible,
                opacity: importedLayer.opacity,
                locked: false,
                sourceGeoJsonLayerId: importedLayer.id,
                sourceGeoJsonLayerName: importedLayer.name,
                sourceGeoJsonSourceName: importedLayer.sourceName ?? null,
                updatedAt: new Date().toISOString(),
              }
            : layer,
        ),
        activeLayerId: layerId,
      }));

      addFeaturesWithHistory(convertedFeatures);

      setDownloadStatus(
        `${convertedFeatures.length.toLocaleString(
          "fr-FR",
        )} objet${convertedFeatures.length > 1 ? "s" : ""} DroMap créé${
          convertedFeatures.length > 1 ? "s" : ""
        } à partir du GeoJSON.`,
      );
      setPendingGeoJsonImport(null);
    } catch (error) {
      deleteLayer(layerId);
      setDownloadStatus(
        error instanceof Error
          ? error.message
          : "La transformation en objets DroMap a échoué.",
      );
    }
  }

  async function handleShowRenderedPreview() {
    const exportInput = createExportInput();

    if (!exportInput || isGeneratingPreview) {
      return;
    }

    try {
      clearSelectedFeatureId();
      setIsGeneratingPreview(true);
      setDownloadStatus("Préparation de l’aperçu PNG...");

      const dataUrl = await createCanvasExportPreviewDataUrl(exportInput);

      setRenderPreviewUrl(dataUrl);
      setDownloadStatus("Aperçu PNG généré.");
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        "Aperçu impossible pour l’instant. Le rendu canvas n’a pas pu générer l’image.",
      );
    } finally {
      setIsGeneratingPreview(false);
    }
  }

  function goToGuestOffer(intent: "single-map" | "subscription") {
    setGuestWatermarkOfferOpen(false);

    const pricingParams = new URLSearchParams();
    if (productProjectId) pricingParams.set("projectId", productProjectId);
    if (intent === "single-map") {
      pricingParams.set("purchase", "single-map");
    } else {
      pricingParams.set("plan", "plus");
    }

    const pricingPath = `/pricing?${pricingParams.toString()}`;
    router.push(`/signup?returnTo=${encodeURIComponent(pricingPath)}`);
  }

  if (isImportPanelOpen) {
    return (
      <div
        className="absolute inset-0 bg-slate-950/60 p-3"
        style={{ zIndex: panelZIndex }}
        onMouseDown={() => setPanelZIndex(bringFloatingPanelToFront())}
      >
        <section className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Ajouter / Importer</h2>

              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Ajoute des données au projet courant sans modifier silencieusement son fond ni sa zone de travail. Choisis la source, vérifie le contenu, puis confirme l’ajout.
              </p>
            </div>

            <button
              type="button"
              onClick={closeImportPanel}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-100"
            >
              Fermer
            </button>
          </header>

          <input
            ref={importProjectInputRef}
            type="file"
            accept=".json,.dromap,application/json"
            onChange={handleImportProjectFile}
            className="hidden"
          />

          <input
            ref={importGeoJsonInputRef}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            onChange={handleImportGeoJsonFile}
            className="hidden"
          />

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-5">
            <div className="grid gap-4">
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                {[
                  ["1", "Choisir la source"],
                  ["2", "Vérifier le contenu"],
                  ["3", "Ajouter à la carte"],
                ].map(([number, label]) => (
                  <div key={number} className="rounded-xl bg-slate-50 px-2 py-2">
                    <div className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[11px] font-black text-white">
                      {number}
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-slate-700">
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">
                      Ajouter un Projet DroMap
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Analyse un fichier DroMap puis ajoute ses objets, calques, GeoJSON, marqueurs et éléments de légende. Le fond et la zone actuels sont conservés par défaut.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleImportProjectClick}
                    disabled={isImportingProject}
                    className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    title="Importer un fichier JSON généré par DroMap"
                  >
                    {isImportingProject ? "Analyse…" : "Choisir un Projet DroMap"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-950">
                      Calque GeoJSON
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Sélectionne un fichier, vérifie son volume, puis choisis
                      entre un calque GeoJSON léger ou des objets DroMap
                      modifiables individuellement.
                    </p>

                    <label className="mt-3 block text-xs font-semibold text-sky-900">
                      Précision à l’import
                      <select
                        value={geoJsonImportPrecision}
                        onChange={(event) =>
                          setGeoJsonImportPrecision(
                            event.target.value as DromapGeoJsonPrecisionMode,
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-2 py-2 text-xs font-medium text-slate-900"
                      >
                        {GEOJSON_PRECISION_IMPORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="mt-1 text-[11px] leading-relaxed text-sky-700">
                      {
                        GEOJSON_PRECISION_IMPORT_OPTIONS.find(
                          (option) => option.value === geoJsonImportPrecision,
                        )?.description
                      }
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleImportGeoJsonClick}
                    disabled={isImportingGeoJson}
                    className="max-w-56 shrink-0 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-center text-sm font-bold leading-tight text-sky-800 shadow-sm transition hover:border-sky-400 hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    title="Importer un fichier GeoJSON depuis mes fichiers"
                  >
                    {isImportingGeoJson ? "Import GeoJSON…" : "Importer GeoJSON depuis mes fichiers"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">Mes calques enregistrés</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Réutilise un calque DroMap ou GeoJSON de ta bibliothèque personnelle sans quitter l’éditeur.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      closeImportPanel();
                      window.dispatchEvent(new CustomEvent("dromap:open-saved-layers-library"));
                    }}
                    className="shrink-0 rounded-xl border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-bold text-teal-800 transition hover:bg-teal-100"
                  >
                    Ouvrir mes calques
                  </button>
                </div>
              </div>

              <GeoJsonLibraryBrowser
                precisionMode={geoJsonImportPrecision}
                onPrecisionModeChange={setGeoJsonImportPrecision}
              />

              {downloadStatus ? (
                <div className="rounded-xl bg-white p-3 text-xs text-slate-700 shadow-sm">
                  {downloadStatus}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {pendingProjectImport ? (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <section role="dialog" aria-modal="true" aria-labelledby="dromap-project-import-title" className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Projet DroMap analysé</div>
                  <h3 id="dromap-project-import-title" className="mt-1 text-lg font-black text-slate-950">Ajouter ce contenu au projet courant ?</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">Le projet actuel reste la base. Aucun fond ni aucune zone n’est remplacé sans ton choix explicite.</p>
                </div>
                <button type="button" onClick={() => setPendingProjectImport(null)} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-lg text-slate-500 hover:bg-slate-100" aria-label="Annuler l’import">×</button>
              </header>
              <div className="p-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Fichier</div><div className="mt-1 text-lg font-black text-slate-950">{formatImportFileSize(pendingProjectImport.fileSizeBytes)}</div></div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Objets</div><div className="mt-1 text-lg font-black text-slate-950">{pendingProjectImport.project.features.length.toLocaleString("fr-FR")}</div></div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Calques DroMap</div><div className="mt-1 text-lg font-black text-slate-950">{pendingProjectImport.project.layers.length.toLocaleString("fr-FR")}</div></div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Calques GeoJSON</div><div className="mt-1 text-lg font-black text-slate-950">{pendingProjectImport.project.geoJsonLayers.length.toLocaleString("fr-FR")}</div></div>
                </div>
                {pendingProjectImport.warnings.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="font-black">À savoir avant l’ajout</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {pendingProjectImport.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-4 rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-black text-slate-950">Conserver ou reprendre le contexte du fichier</div>
                  <label className="mt-3 flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={useImportedBasemap} onChange={(event) => setUseImportedBasemap(event.target.checked)} className="mt-0.5 h-4 w-4" /><span><strong>Utiliser le fond du projet importé</strong><br/><span className="text-xs text-slate-500">Sinon le fond actuel est conservé.</span></span></label>
                  <label className="mt-3 flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={useImportedWorkspace} onChange={(event) => setUseImportedWorkspace(event.target.checked)} className="mt-0.5 h-4 w-4" /><span><strong>Utiliser la zone de travail du projet importé</strong><br/><span className="text-xs text-slate-500">Sinon les éléments hors de la zone actuelle sont conservés mais peuvent rester masqués.</span></span></label>
                </div>
              </div>
              <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
                <button type="button" onClick={() => setPendingProjectImport(null)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">Annuler</button>
                <button type="button" onClick={confirmPendingProjectImport} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-500">Ajouter au projet</button>
              </footer>
            </section>
          </div>
        ) : null}

        {pendingGeoJsonImport ? (
          <div className="absolute inset-0 z-[50] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="dromap-geojson-import-choice-title"
              className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
            >
              <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-sky-700">
                    GeoJSON analysé
                  </div>
                  <h3
                    id="dromap-geojson-import-choice-title"
                    className="mt-1 text-lg font-black text-slate-950"
                  >
                    Comment veux-tu l’ajouter ?
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Le choix pourra être modifié plus tard depuis l’onglet
                    Calques lorsque le calque provient d’un GeoJSON.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingGeoJsonImport(null)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                  aria-label="Annuler l’import"
                >
                  ×
                </button>
              </header>

              <div className="p-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Entités</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{pendingGeoJsonImport.featureCount.toLocaleString("fr-FR")}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Coordonnées</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{pendingGeoJsonImport.coordinateCount.toLocaleString("fr-FR")}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Précision</div>
                    <div className="mt-1 text-sm font-black text-slate-950">{GEOJSON_PRECISION_IMPORT_OPTIONS.find((option) => option.value === pendingGeoJsonImport.precisionMode)?.label ?? "Originale"}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Ignorées</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{pendingGeoJsonImport.skippedGeometries.toLocaleString("fr-FR")}</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => confirmPendingGeoJsonImport("geojson")}
                    className="rounded-2xl border-2 border-sky-300 bg-sky-50 p-4 text-left transition hover:border-sky-500 hover:bg-sky-100"
                  >
                    <div className="text-sm font-black text-sky-950">
                      Conserver comme calque GeoJSON
                    </div>
                    <p className="mt-2 text-xs leading-5 text-sky-800">
                      Recommandé pour les fichiers volumineux. Les données
                      restent regroupées, rapides, stylisables et exportables.
                    </p>
                    <span className="mt-3 inline-flex rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-black text-white">
                      Ajouter le calque léger
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => confirmPendingGeoJsonImport("dromap")}
                    className={[
                      "rounded-2xl border-2 p-4 text-left transition",
                      pendingGeoJsonImport.featureCount >=
                      GEOJSON_TO_DROMAP_HEAVY_FEATURE_THRESHOLD
                        ? "border-amber-300 bg-amber-50 hover:border-amber-500 hover:bg-amber-100"
                        : "border-teal-300 bg-teal-50 hover:border-teal-500 hover:bg-teal-100",
                    ].join(" ")}
                  >
                    <div className="text-sm font-black text-slate-950">
                      Transformer en objets DroMap
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-700">
                      Chaque entité devient modifiable individuellement. Ce
                      mode est plus puissant, mais plus lourd.
                    </p>
                    {pendingGeoJsonImport.featureCount >=
                    GEOJSON_TO_DROMAP_HEAVY_FEATURE_THRESHOLD ? (
                      <div className="mt-2 rounded-lg bg-amber-100 px-2 py-1.5 text-[11px] font-bold text-amber-900">
                        Fichier lourd : cette conversion peut ralentir le
                        navigateur.
                      </div>
                    ) : null}
                    <span className="mt-3 inline-flex rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-black text-white">
                      Créer les objets
                    </span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="dromap-export-page fixed inset-0 bg-slate-100"
      style={{ zIndex: Math.max(panelZIndex, 4000) }}
      onMouseDown={() => setPanelZIndex(bringFloatingPanelToFront())}
      role="dialog"
      aria-modal="true"
    >
      <RenderKeyboardHistory />
      <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            Légende &amp; Rendu final
          </h2>

          <div className="flex shrink-0 items-center gap-2">
            {productRuntimeEnabled && productProjectId ? (
              <button
                type="button"
                onClick={() => void handleOpenPublicationDialog()}
                disabled={publicationPreparing}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
              >
                {publicationPreparing ? "Préparation…" : "Publier"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleCloseExportPanel}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-100"
            >
              {productRuntimeEnabled ? "Retour à l’éditeur" : "Fermer"}
            </button>
          </div>
        </header>

        <input
          ref={importProjectInputRef}
          type="file"
          accept=".json,.dromap,application/json"
          onChange={handleImportProjectFile}
          className="hidden"
        />

        <input
          ref={importGeoJsonInputRef}
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          onChange={handleImportGeoJsonFile}
          className="hidden"
        />

        {pendingVisualExportFormat ? (
          <div className="absolute inset-0 z-[2200] flex items-center justify-center bg-slate-950/55 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">
                    Qualité de l’export{" "}
                    {getVisualExportFormatLabel(pendingVisualExportFormat)}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Les qualités supérieures gardent exactement la même emprise,
                    les mêmes proportions et la même position des objets. Le
                    fond est amélioré seulement lorsque sa source le permet.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setPendingVisualExportFormat(null)}
                  disabled={isVisualExportBusy}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Annuler
                </button>
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                Fond actuel :{" "}
                <span className="font-semibold text-slate-900">
                  {basemap.label}
                </span>
                . {highQualityBasemapExplanation}
              </div>

              <div className="mt-3 grid gap-2">
                {VISUAL_EXPORT_QUALITY_OPTIONS.map((option) => {
                  const isDisabled =
                    isVisualExportBusy ||
                    (option.value !== "standard" &&
                      !supportsHighQualityBasemapExport);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        handleConfirmVisualExportQuality(option.value)
                      }
                      disabled={isDisabled}
                      className={[
                        "rounded-xl border p-3 text-left transition",
                        isDisabled
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                          : option.value === "standard"
                            ? "border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100"
                            : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{option.label}</div>
                          <div className="mt-0.5 text-xs leading-relaxed">
                            {option.description}
                            {option.value !== "standard" &&
                            !supportsHighQualityBasemapExport
                              ? " Bloqué pour ce fond."
                              : option.value !== "standard" &&
                                  !capabilities.canExportHighQuality
                                ? " Plus, Pro ou Export Max requis."
                                : ""}
                          </div>
                        </div>
                        {option.value !== "standard" &&
                        !supportsHighQualityBasemapExport ? (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                            Indisponible
                          </span>
                        ) : option.value !== "standard" &&
                          !capabilities.canExportHighQuality ? (
                          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                            Plus / Export Max
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
          <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
            <div className="space-y-4">
              <div className="rounded-xl bg-white p-3 text-sm text-slate-700 shadow-sm">
                <div>
                  Zone de travail :{" "}
                  <span className="font-medium">
                    {workspaceBounds ? "définie" : "non définie"}
                  </span>
                </div>

                <div>
                  Objets DroMap à exporter :{" "}
                  <span className="font-medium">
                    {renderableFeatures.length}
                  </span>
                </div>

                <div>
                  Calques GeoJSON visibles :{" "}
                  <span className="font-medium">
                    {renderableGeoJsonLayers.length}
                  </span>
                </div>

                <div>
                  Fond de carte :{" "}
                  <span className="font-medium">{basemap.label}</span>
                </div>

                <div>
                  Zoom fond mémorisé :{" "}
                  <span className="font-medium">
                    {workspaceBasemapZoom === null
                      ? "auto"
                      : workspaceBasemapZoom}
                  </span>
                </div>
              </div>

              {sourceAttribution?.kind === "public-map" ? (
                <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950 shadow-sm">
                  <div className="font-black">Crédit du créateur</div>
                  <p className="mt-1 text-xs leading-5 text-teal-800">
                    Cette carte provient de « {sourceAttribution.creatorName} ».
                    {sourceAttribution.allowRemoval
                      ? " Le créateur autorise le déplacement ou la suppression de cette mention."
                      : " La mention doit rester visible, mais tu peux la déplacer."}
                  </p>
                  <div className="mt-3 rounded-lg border border-teal-200 bg-white/80 px-2.5 py-2 text-[11px] font-semibold leading-5 text-teal-900">
                    Le nom apparaît directement sur le rendu final. Glisse « {sourceAttribution.creatorName} » sur la carte pour le placer exactement où tu veux.
                  </div>
                  {sourceAttribution.allowRemoval ? (
                    <label className="mt-3 flex items-start gap-2 text-xs font-semibold text-teal-900">
                      <input
                        type="checkbox"
                        checked={!sourceAttribution.hidden}
                        onChange={(event) => {
                          if (!productProjectId) return;
                          setProjectSourceAttribution(productProjectId, { hidden: !event.target.checked });
                          setRenderPreviewUrl(null);
                        }}
                        className="mt-0.5 h-4 w-4 accent-teal-600"
                      />
                      Afficher « {sourceAttribution.creatorName} » sur le rendu final et les exports
                    </label>
                  ) : (
                    <div className="mt-3 rounded-lg border border-teal-200 bg-white/80 px-2.5 py-2 text-[11px] font-bold leading-5 text-teal-900">
                      Mention obligatoire sur le rendu final et les exports visuels.
                    </div>
                  )}
                </div>
              ) : null}

              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <button
                  type="button"
                  onClick={handleShowRenderedPreview}
                  disabled={!workspaceBounds || isGeneratingPreview}
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                  title="Générer un aperçu du rendu final sans téléchargement"
                >
                  {isGeneratingPreview
                    ? "Génération du rendu..."
                    : "Voir le rendu"}
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={openDownloadMenuWithSingleMapWarning}
                    disabled={!workspaceBounds}
                    className="flex w-full items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-bold text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    aria-expanded={isDownloadMenuOpen}
                  >
                    <span>Télécharger</span>
                    <span aria-hidden="true">
                      {isDownloadMenuOpen ? "▴" : "▾"}
                    </span>
                  </button>

                  {isDownloadMenuOpen ? (
                    <div className="mt-2 rounded-xl border border-teal-100 bg-teal-50/60 p-2 shadow-inner">
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => requestVisualExport("png")}
                          disabled={isVisualExportBusy}
                          className="rounded-lg bg-teal-600 px-2 py-2 text-xs font-semibold text-white hover:bg-teal-500 disabled:bg-slate-300"
                        >
                          {isDownloadingPng ? "PNG..." : "PNG"}
                        </button>
                        <button
                          type="button"
                          onClick={() => requestVisualExport("jpeg")}
                          disabled={isVisualExportBusy}
                          className="rounded-lg bg-teal-600 px-2 py-2 text-xs font-semibold text-white hover:bg-teal-500 disabled:bg-slate-300"
                        >
                          {isDownloadingJpeg ? "JPEG..." : `JPEG${capabilities.canExportOtherVisualFormats ? "" : " 🔒"}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => requestVisualExport("webp")}
                          disabled={isVisualExportBusy}
                          className="rounded-lg bg-teal-600 px-2 py-2 text-xs font-semibold text-white hover:bg-teal-500 disabled:bg-slate-300"
                        >
                          {isDownloadingWebp ? "WebP..." : `WebP${capabilities.canExportOtherVisualFormats ? "" : " 🔒"}`}
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => requestVisualExport("pdf")}
                          disabled={isVisualExportBusy}
                          className="rounded-lg border border-teal-200 bg-white px-2 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {isDownloadingPdf ? "PDF..." : `PDF${capabilities.canExportOtherVisualFormats ? "" : " 🔒"}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => requestVisualExport("svg")}
                          disabled={isVisualExportBusy}
                          className="rounded-lg border border-teal-200 bg-white px-2 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          {isDownloadingSvg ? "SVG..." : `SVG${capabilities.canExportOtherVisualFormats ? "" : " 🔒"}`}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDataExportMenuOpen((isOpen) => !isOpen);
                      setIsDownloadMenuOpen(false);
                      setFirstDownloadWarningAccepted(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
                    aria-expanded={isDataExportMenuOpen}
                  >
                    <span>Exporter les données</span>
                    <span aria-hidden="true">
                      {isDataExportMenuOpen ? "▴" : "▾"}
                    </span>
                  </button>

                  {isDataExportMenuOpen ? (
                    <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-inner">
                      <button
                        type="button"
                        onClick={handleDownloadJson}
                        disabled={!workspaceBounds || isDownloadingJson}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {isDownloadingJson ? "Projet..." : `Projet JSON${capabilities.canExportProjectData ? "" : " 🔒"}`}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadCsv}
                        disabled={
                          renderableFeatures.length === 0 || isDownloadingCsv
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {isDownloadingCsv ? "CSV..." : `CSV${capabilities.canExportProjectData ? "" : " 🔒"}`}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadGeoJson}
                        disabled={
                          !workspaceBounds ||
                          (renderableFeatures.length === 0 &&
                            renderableGeoJsonLayers.length === 0) ||
                          isDownloadingGeoJson
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {isDownloadingGeoJson ? "GeoJSON..." : `GeoJSON${capabilities.canExportProjectData ? "" : " 🔒"}`}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <label
                  htmlFor="export-format"
                  className="mb-1.5 block text-sm font-medium text-slate-900"
                >
                  Format d’export
                </label>
                <select
                  id="export-format"
                  value={exportFormat}
                  onChange={(event) =>
                    setExportFormat(event.target.value as ExportFormat)
                  }
                  className="w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  {EXPORT_FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <label
                  htmlFor="export-legend-position"
                  className="mb-1.5 block text-sm font-medium text-slate-900"
                >
                  Position de la légende
                </label>
                <select
                  id="export-legend-position"
                  value={legendPosition}
                  onChange={(event) =>
                    setLegendPosition(
                      event.target.value as ExportLegendPosition,
                    )
                  }
                  className="w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  {LEGEND_POSITION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 text-sm font-medium text-slate-900">
                  Apparence de la légende
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!capabilities.canUseAdvancedLegend) {
                      requestRestriction({
                        title: "Édition avancée de la légende réservée",
                        description:
                          "Créez un compte pour modifier chaque figuré, régler les espacements et organiser des sous-titres avancés. Votre projet actuel sera conservé.",
                      });
                      return;
                    }

                    requestOpenAdvancedLegendEditor();
                  }}
                  className="mb-4 flex w-full items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-left text-sm font-bold text-teal-800 transition hover:bg-teal-100"
                  title={
                    capabilities.canUseAdvancedLegend
                      ? "Ouvrir l’édition avancée de la légende"
                      : "Compte requis pour l’édition avancée de la légende"
                  }
                >
                  <span>Édition avancée</span>
                  <span aria-hidden="true">
                    {capabilities.canUseAdvancedLegend ? "→" : "🔒"}
                  </span>
                </button>

                <div className="space-y-4">
                  {legendPosition !== "map" ? (
                    <>
                      <div>
                        <div className="mb-1 block text-xs font-medium text-slate-700">
                          Couleur de fond
                        </div>

                        <div className="flex items-center gap-2">
                          <ColorPicker
                            value={legendBackgroundColor}
                            onChange={setLegendBackgroundColor}
                            ariaLabel="Couleur de fond de la légende"
                            className="h-9 w-12"
                          />

                          <input
                            type="text"
                            value={legendBackgroundColor}
                            onChange={(event) =>
                              setLegendBackgroundColor(event.target.value)
                            }
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                          />
                        </div>
                      </div>

                      <div className="rounded-lg border border-teal-100 bg-teal-50 p-2 text-xs text-teal-900">
                        Largeur / hauteur : tire directement la séparation entre
                        la carte et la légende dans la prévisualisation.
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-teal-100 bg-teal-50 p-2 text-xs leading-relaxed text-teal-900">
                      Sur la carte, le cadre s’adapte automatiquement aux
                      labels, même longs. Maintiens le clic sur le titre ou la
                      légende puis glisse pour les déplacer. Les réglages
                      avancés permettent d’ajouter un cadre et des éléments
                      manuels.
                    </div>
                  )}

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <label
                        htmlFor="export-legend-symbol-size"
                        className="font-medium text-slate-700"
                      >
                        Taille des figurés
                      </label>

                      <span className="font-semibold tabular-nums text-slate-500">
                        {Math.round(
                          getExportLegendGlobalSymbolScale(legendSymbolSize) * 100,
                        )}
                        %
                      </span>
                    </div>

                    <input
                      id="export-legend-symbol-size"
                      type="range"
                      min={24}
                      max={144}
                      step={2}
                      value={legendSymbolSize}
                      onChange={(event) =>
                        setLegendSymbolSize(Number(event.currentTarget.value))
                      }
                      className="w-full accent-teal-600"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <label
                        htmlFor="export-legend-title-font-size"
                        className="font-medium text-slate-700"
                      >
                        Taille du titre
                      </label>

                      <span className="text-slate-500">
                        {legendTitleFontSize}px
                      </span>
                    </div>

                    <input
                      id="export-legend-title-font-size"
                      type="range"
                      min={MIN_LEGEND_TITLE_FONT_SIZE}
                      max={MAX_LEGEND_TITLE_FONT_SIZE}
                      step={1}
                      value={legendTitleFontSize}
                      onChange={(event) =>
                        setLegendTitleFontSize(
                          clampExportNumber(
                            Number(event.target.value),
                            MIN_LEGEND_TITLE_FONT_SIZE,
                            MAX_LEGEND_TITLE_FONT_SIZE,
                          ),
                        )
                      }
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <label
                        htmlFor="export-legend-item-font-size"
                        className="font-medium text-slate-700"
                      >
                        Taille des entrées
                      </label>

                      <span className="text-slate-500">
                        {legendItemFontSize}px
                      </span>
                    </div>

                    <input
                      id="export-legend-item-font-size"
                      type="range"
                      min={MIN_LEGEND_ITEM_FONT_SIZE}
                      max={MAX_LEGEND_ITEM_FONT_SIZE}
                      step={1}
                      value={legendItemFontSize}
                      onChange={(event) =>
                        setLegendItemFontSize(
                          clampExportNumber(
                            Number(event.target.value),
                            MIN_LEGEND_ITEM_FONT_SIZE,
                            MAX_LEGEND_ITEM_FONT_SIZE,
                          ),
                        )
                      }
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <label
                        htmlFor="export-legend-section-title-font-size"
                        className="font-medium text-slate-700"
                      >
                        Taille des sous-titres
                      </label>

                      <span className="text-slate-500">
                        {legendSectionTitleFontSize}px
                      </span>
                    </div>

                    <input
                      id="export-legend-section-title-font-size"
                      type="range"
                      min={MIN_LEGEND_SECTION_TITLE_FONT_SIZE}
                      max={MAX_LEGEND_SECTION_TITLE_FONT_SIZE}
                      step={1}
                      value={legendSectionTitleFontSize}
                      onChange={(event) =>
                        setLegendSectionTitleFontSize(
                          clampExportNumber(
                            Number(event.target.value),
                            MIN_LEGEND_SECTION_TITLE_FONT_SIZE,
                            MAX_LEGEND_SECTION_TITLE_FONT_SIZE,
                          ),
                        )
                      }
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-xs leading-relaxed text-teal-900 shadow-sm">
                <div>
                  Organisation de la légende : ajoute les sous-titres, renomme
                  les groupes, masque des entrées et glisse les éléments
                  directement dans la prévisualisation.
                </div>

                <button
                  type="button"
                  onClick={resetExportLegendConfig}
                  className="mt-2 rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-50"
                >
                  Réinitialiser la légende
                </button>
              </div>

              {downloadStatus ? (
                <div className="rounded-xl bg-white p-3 text-xs text-slate-700 shadow-sm">
                  {downloadStatus}
                </div>
              ) : null}
            </div>
          </aside>

          <main className="min-h-0 min-w-0 bg-slate-100 p-2">
            <ExportPreviewScene
              showDromapGuestWatermark={showDromapGuestWatermark}
              onGuestWatermarkClick={() => setGuestWatermarkOfferOpen(true)}
            />
          </main>
        </div>

        {renderPreviewUrl ? (
          <div className="absolute inset-0 z-[2200] flex items-center justify-center bg-slate-950/70 p-6">
            <div className="flex h-full max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">
                    Aperçu du rendu PNG
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Aperçu généré en qualité légère pour vérifier l’agencement
                    final avant téléchargement PNG ou PDF.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setRenderPreviewUrl(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-100"
                >
                  Fermer
                </button>
              </header>

              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-slate-100 p-4">
                <div className="relative inline-block max-w-full">
                  <img
                    src={renderPreviewUrl}
                    alt="Aperçu du rendu PNG DroMap"
                    className="block max-h-[calc(100dvh-10rem)] max-w-full rounded border border-slate-300 bg-white object-contain shadow-lg"
                    draggable={false}
                  />

                  {showDromapGuestWatermark ? (
                    <button
                      type="button"
                      onClick={() => setGuestWatermarkOfferOpen(true)}
                      className="absolute bottom-[3%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-sm font-black text-slate-900/60 transition hover:bg-white/55 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200"
                      style={{
                        textShadow:
                          "-1px -1px 0 rgba(255,255,255,.72), 1px -1px 0 rgba(255,255,255,.72), -1px 1px 0 rgba(255,255,255,.72), 1px 1px 0 rgba(255,255,255,.72)",
                      }}
                      title="Retirer la mention DroMap"
                    >
                      Créé avec DroMap
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {productRuntimeEnabled && productProjectId ? (
          <DashboardProjectPublicationDialog
            open={publicationDialogOpen}
            projectId={productProjectId}
            projectName={productProjectName}
            onClose={() => setPublicationDialogOpen(false)}
          />
        ) : null}

        <DromapDialog
          open={firstDownloadWarningOpen}
          title="Premier téléchargement de cette carte"
          description="Après le premier téléchargement de l’Export Max acheté à l’unité, la zone de travail de ce projet sera définitivement verrouillée. Tu pourras toujours modifier les objets, la légende et le rendu, puis retélécharger la carte."
          onClose={() => setFirstDownloadWarningOpen(false)}
          footer={
            <>
              <DromapButton onClick={() => setFirstDownloadWarningOpen(false)}>Annuler</DromapButton>
              <DromapButton
                variant="primary"
                onClick={() => {
                  setFirstDownloadWarningOpen(false);
                  setFirstDownloadWarningAccepted(true);
                  setIsDataExportMenuOpen(false);
                  setIsDownloadMenuOpen(true);
                }}
              >
                Continuer
              </DromapButton>
            </>
          }
        >
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            <strong>Important :</strong> le verrouillage n’est appliqué qu’après la réussite du premier téléchargement. Si tu annules maintenant, la zone reste modifiable.
          </div>
        </DromapDialog>

        <DromapDialog
          open={guestWatermarkOfferOpen}
          title="Retirer la mention DroMap"
          description="Choisis l’option qui correspond à ton usage. Ton projet actuel reste conservé pendant la création du compte."
          onClose={() => setGuestWatermarkOfferOpen(false)}
          maxWidthClassName="max-w-xl"
          footer={
            <>
              <DromapButton onClick={() => setGuestWatermarkOfferOpen(false)}>
                Continuer avec la mention
              </DromapButton>
              <DromapButton
                variant="secondary"
                onClick={() => goToGuestOffer("single-map")}
              >
                Acheter cette carte — 3 €
              </DromapButton>
              <DromapButton
                variant="primary"
                onClick={() => goToGuestOffer("subscription")}
              >
                Voir les abonnements
              </DromapButton>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-black text-slate-950">Export Max à l’unité</div>
              <div className="mt-1 text-2xl font-black text-slate-950">3 €</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Débloque les formats visuels, la qualité maximale, le détail du fond et les écritures du fond pour cette carte, sans abonnement.
              </p>
            </div>
            <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
              <div className="text-sm font-black text-teal-950">Plus ou Pro</div>
              <div className="mt-1 text-2xl font-black text-teal-950">À partir de 7 €/mois</div>
              <p className="mt-2 text-sm leading-6 text-teal-900/80">
                Débloque les exports supérieurs et les fonctions premium prévues par la formule choisie.
              </p>
            </div>
          </div>
        </DromapDialog>
      </section>
    </div>
  );
}
