"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import type {
  ExportFormat,
  ExportLegendPosition,
} from "@/stores/editor-test-export";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import {
  getRenderableFeaturesForLayers,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import {
  getGeoJsonLayerLoadedFeatureCount,
  getRenderableGeoJsonLayers,
  parseGeoJsonTextToDromapGeoJsonLayer,
  type DromapGeoJsonPrecisionMode,
  useEditorTestGeoJsonLayersStore,
} from "@/stores/editor-test-geojson-layers";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
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
} from "./export-download";
import { ExportPreviewScene } from "./export-preview-scene";
import { bringFloatingPanelToFront, getInitialFloatingPanelZIndex } from "./floating-panel-z-index";
import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import {
  MAX_LEGEND_ITEM_FONT_SIZE,
  MAX_LEGEND_TITLE_FONT_SIZE,
  MIN_LEGEND_ITEM_FONT_SIZE,
  MIN_LEGEND_TITLE_FONT_SIZE,
  MAX_LEGEND_SECTION_TITLE_FONT_SIZE,
  MIN_LEGEND_SECTION_TITLE_FONT_SIZE,
  clampExportNumber,
} from "./export-layout";

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
    value: "bottom",
    label: "En bas",
    description: "Carte au-dessus, légende en dessous.",
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
    description: "Conserve exactement toutes les coordonnées du fichier importé.",
  },
  {
    value: "intermediate",
    label: "Intermédiaire",
    description: "Réduit environ un tiers des coordonnées pour un rendu plus fluide.",
  },
  {
    value: "light",
    label: "Légère",
    description: "Réduit environ trois quarts des coordonnées pour les fichiers lourds.",
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
    description: "Rendu normal et fiable sur tous les fonds de carte.",
  },
  {
    value: "high",
    label: "Haute qualité",
    description: "Rendu plus fin, disponible pour les fonds OpenFreeMap vectoriels.",
  },
  {
    value: "very-high",
    label: "Très haute qualité",
    description: "Rendu maximal, plus lent, réservé aux fonds OpenFreeMap vectoriels.",
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

export function ExportSetupPanel() {
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
  const [geoJsonImportPrecision, setGeoJsonImportPrecision] =
    useState<DromapGeoJsonPrecisionMode>("original");
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [renderPreviewUrl, setRenderPreviewUrl] = useState<string | null>(null);
  const [pendingVisualExportFormat, setPendingVisualExportFormat] =
    useState<VisualExportFormat | null>(null);
  const [panelZIndex, setPanelZIndex] = useState(
    getInitialFloatingPanelZIndex(),
  );
  const importProjectInputRef = useRef<HTMLInputElement | null>(null);
  const importGeoJsonInputRef = useRef<HTMLInputElement | null>(null);

  const isExportPanelOpen = useEditorTestExportStore(
    (state) => state.isExportPanelOpen,
  );
  const isImportPanelOpen = useEditorTestExportStore(
    (state) => state.isImportPanelOpen,
  );

  const legendTitle = useEditorTestExportStore((state) => state.legendTitle);
  const setLegendTitle = useEditorTestExportStore(
    (state) => state.setLegendTitle,
  );

  const legendPosition = useEditorTestExportStore(
    (state) => state.legendPosition,
  );
  const setLegendPosition = useEditorTestExportStore(
    (state) => state.setLegendPosition,
  );

  const exportFormat = useEditorTestExportStore((state) => state.exportFormat);
  const setExportFormat = useEditorTestExportStore(
    (state) => state.setExportFormat,
  );

  const legendBackgroundColor = useEditorTestExportStore(
    (state) => state.legendBackgroundColor,
  );
  const setLegendBackgroundColor = useEditorTestExportStore(
    (state) => state.setLegendBackgroundColor,
  );

  const legendSideWidth = useEditorTestExportStore(
    (state) => state.legendSideWidth,
  );

  const legendBottomHeight = useEditorTestExportStore(
    (state) => state.legendBottomHeight,
  );

  const legendTitleFontSize = useEditorTestExportStore(
    (state) => state.legendTitleFontSize,
  );
  const setLegendTitleFontSize = useEditorTestExportStore(
    (state) => state.setLegendTitleFontSize,
  );

  const legendItemFontSize = useEditorTestExportStore(
    (state) => state.legendItemFontSize,
  );
  const setLegendItemFontSize = useEditorTestExportStore(
    (state) => state.setLegendItemFontSize,
  );
  const legendSectionTitleFontSize = useEditorTestExportStore(
    (state) => state.legendSectionTitleFontSize,
  );
  const setLegendSectionTitleFontSize = useEditorTestExportStore(
    (state) => state.setLegendSectionTitleFontSize,
  );

  const closeExportPanel = useEditorTestExportStore(
    (state) => state.closeExportPanel,
  );
  const closeImportPanel = useEditorTestExportStore(
    (state) => state.closeImportPanel,
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
  const resetExportLegendConfig = useEditorTestExportStore(
    (state) => state.resetExportLegendConfig,
  );

  const features = useEditorTestFeaturesStore((state) => state.features);
  const replaceFeatures = useEditorTestFeaturesStore((state) => state.replaceFeatures);
  const layers = useEditorTestLayersStore((state) => state.layers);
  const setLayers = useEditorTestLayersStore((state) => state.setLayers);
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const renderableFeatures = useMemo(
    () => getRenderableFeaturesForLayers(features, layers, { workspaceBounds }),
    [features, layers, workspaceBounds],
  );
  const geoJsonLayers = useEditorTestGeoJsonLayersStore((state) => state.geoJsonLayers);
  const addGeoJsonLayer = useEditorTestGeoJsonLayersStore(
    (state) => state.addGeoJsonLayer,
  );
  const setGeoJsonLayers = useEditorTestGeoJsonLayersStore(
    (state) => state.setGeoJsonLayers,
  );
  const renderableGeoJsonLayers = useMemo(
    () =>
      getRenderableGeoJsonLayers(geoJsonLayers).filter(
        (layer) => getGeoJsonLayerLoadedFeatureCount(layer, workspaceBounds) > 0,
      ),
    [geoJsonLayers, workspaceBounds],
  );
  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );
  const requestMapFitToBounds = useEditorTestSelectionStore(
    (state) => state.requestMapFitToBounds,
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

  const setWorkspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.setWorkspaceBounds,
  );
  const clearWorkspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.clearWorkspaceBounds,
  );
  const validateWorkspaceZone = useEditorTestWorkspaceStore(
    (state) => state.validateWorkspaceZone,
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
  const setWorkspaceBasemapBaseZoom = useEditorTestWorkspaceStore(
    (state) => state.setWorkspaceBasemapBaseZoom,
  );
  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);
  const setBasemapId = useEditorTestBasemapStore((state) => state.setBasemapId);
  const basemap = getDromapBasemapConfig(basemapId);
  const supportsHighQualityBasemapExport = basemap.kind === "maplibre";
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
      geoJsonLayers: options.includeHiddenLayers ? geoJsonLayers : renderableGeoJsonLayers,
      workspaceBounds,
      workspaceBasemapZoom,
      workspaceBasemapBaseZoom,
      basemapId,
      legendTitle,
      legendPosition,
      exportFormat,
      legendBackgroundColor,
      legendSideWidth,
      legendBottomHeight,
      legendTitleFontSize,
      legendItemFontSize,
      legendSectionTitleFontSize,
      scaleBarEnabled,
      scaleBarStyle,
      hiddenLegendFeatureIds,
      legendFeatureOrder,
      legendGroupLabels,
      legendGroupSections,
      legendGroupOrder,
      legendSectionOrder,
    };
  }

  function requestVisualExport(format: VisualExportFormat) {
    if (!workspaceBounds || isVisualExportBusy) {
      return;
    }

    setPendingVisualExportFormat(format);
  }

  async function handleConfirmVisualExportQuality(quality: ExportVisualQuality) {
    if (!pendingVisualExportFormat || isVisualExportBusy) {
      return;
    }

    if (quality !== "standard" && !supportsHighQualityBasemapExport) {
      setDownloadStatus(
        "Les qualités supérieures sont réservées aux fonds OpenFreeMap. Les anciens fonds classiques restent en Standard.",
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

      await downloadCanvasExportAsPng(exportInput, { quality });

      setDownloadStatus("PNG téléchargé.");
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

      await downloadCanvasExportAsPdf(exportInput, { quality });

      setDownloadStatus("PDF téléchargé.");
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

      await downloadCanvasExportAsJpeg(exportInput, { quality });

      setDownloadStatus("JPEG téléchargé.");
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

      await downloadCanvasExportAsWebp(exportInput, { quality });

      setDownloadStatus("WebP téléchargé.");
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

      await downloadCanvasExportAsSvg(exportInput, { quality });

      setDownloadStatus("SVG téléchargé.");
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

  async function handleImportProjectFile(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file || isImportingProject) {
      return;
    }

    try {
      setIsImportingProject(true);
      setDownloadStatus("Lecture du projet DroMap...");

      const text = await file.text();
      const importedProject = parseDromapProjectJson(text);

      clearSelectedFeatureId();
      setRenderPreviewUrl(null);
      setBasemapId(importedProject.basemapId, { fit: false });
      setLayers(importedProject.layers, importedProject.layers[0]?.id ?? null);
      setGeoJsonLayers(importedProject.geoJsonLayers);
      replaceFeatures(importedProject.features);
      setWorkspaceBounds(importedProject.workspaceBounds);
      validateWorkspaceZone();
      setWorkspaceBasemapBaseZoom(
        importedProject.workspaceBasemapBaseZoom ?? importedProject.workspaceBasemapZoom,
      );
      setWorkspaceBasemapZoom(importedProject.workspaceBasemapZoom);

      useEditorTestExportStore.setState({
        legendTitle: importedProject.legendTitle,
        legendPosition: importedProject.legendPosition,
        exportFormat: importedProject.exportFormat,
        legendBackgroundColor: importedProject.legendBackgroundColor,
        legendSideWidth: importedProject.legendSideWidth,
        legendBottomHeight: importedProject.legendBottomHeight,
        legendTitleFontSize: importedProject.legendTitleFontSize,
        legendItemFontSize: importedProject.legendItemFontSize,
        legendSectionTitleFontSize: importedProject.legendSectionTitleFontSize,
        scaleBarEnabled: importedProject.scaleBarEnabled,
        scaleBarStyle: importedProject.scaleBarStyle,
        hiddenLegendFeatureIds: importedProject.hiddenLegendFeatureIds,
        legendFeatureOrder: importedProject.legendFeatureOrder,
        legendGroupOrder: importedProject.legendGroupOrder,
        legendSectionOrder: importedProject.legendSectionOrder,
        legendGroupLabels: importedProject.legendGroupLabels,
        legendGroupSections: importedProject.legendGroupSections,
      });

      setDownloadStatus(
        `Projet DroMap importé : ${importedProject.features.length} objet${
          importedProject.features.length > 1 ? "s" : ""
        }.`,
      );
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        error instanceof Error
          ? error.message
          : "Import impossible : le fichier ne correspond pas à un projet DroMap JSON valide.",
      );
    } finally {
      setIsImportingProject(false);
    }
  }

  function handleImportGeoJsonClick() {
    if (isImportingGeoJson) {
      return;
    }

    importGeoJsonInputRef.current?.click();
  }

  async function handleImportGeoJsonFile(
    event: ChangeEvent<HTMLInputElement>,
  ) {
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

      clearSelectedFeatureId();
      setRenderPreviewUrl(null);
      addGeoJsonLayer(importedLayer);
      clearWorkspaceBounds();

      if (importedLayer.bounds) {
        requestMapFitToBounds(importedLayer.bounds);
      }

      const skippedMessage =
        importedLayer.skippedGeometries > 0
          ? ` ${importedLayer.skippedGeometries} géométrie${
              importedLayer.skippedGeometries > 1 ? "s" : ""
            } ignorée${importedLayer.skippedGeometries > 1 ? "s" : ""}.`
          : "";

      const fitMessage = importedLayer.bounds
        ? " Zone de travail supprimée ; vue recentrée sur le calque GeoJSON."
        : " Zone de travail supprimée ; aucun recadrage automatique disponible.";

      setDownloadStatus(
        `GeoJSON importé comme calque léger (${GEOJSON_PRECISION_IMPORT_OPTIONS.find((option) => option.value === importedLayer.precisionMode)?.label ?? "Originale"}) : ${importedLayer.featureCount} entité${
          importedLayer.featureCount > 1 ? "s" : ""
        }, ${importedLayer.coordinateCount.toLocaleString()} coordonnée${
          importedLayer.coordinateCount > 1 ? "s" : ""
        }.${skippedMessage}${fitMessage}`,
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

  if (isImportPanelOpen) {
    return (
      <div
        className="absolute inset-0 bg-slate-950/60 p-3"
        style={{ zIndex: panelZIndex }}
        onMouseDown={() => setPanelZIndex(bringFloatingPanelToFront())}
      >
        <section className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Importer
              </h2>

              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Importe un Projet JSON DroMap complet ou ajoute un calque GeoJSON léger.
                L’import est séparé de l’export pour éviter de mélanger deux actions différentes.
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
              <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">
                      Projet JSON DroMap
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Remplace la carte actuelle par un projet complet : fond, zone de travail, objets, calques, GeoJSON, export, légende et échelle.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleImportProjectClick}
                    disabled={isImportingProject}
                    className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    title="Importer un fichier JSON généré par DroMap"
                  >
                    {isImportingProject ? "Import..." : "Importer projet"}
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
                      Ajoute un GeoJSON comme calque léger : points, lignes, routes, frontières, polygones ou zones.
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
                    className="shrink-0 rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    title="Importer un GeoJSON standard"
                  >
                    {isImportingGeoJson ? "Import Geo..." : "Importer GeoJSON"}
                  </button>
                </div>
              </div>

              {downloadStatus ? (
                <div className="rounded-xl bg-white p-3 text-xs text-slate-700 shadow-sm">
                  {downloadStatus}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 bg-slate-950/60 p-3"
      style={{ zIndex: panelZIndex }}
      onMouseDown={() => setPanelZIndex(bringFloatingPanelToFront())}
    >
      <section className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Préparer l’export
            </h2>

            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Les exports visuels réutilisent le même rendu canvas. Les exports
              Projet JSON et GeoJSON gardent les objets DroMap structurés.
            </p>
          </div>

          <button
            type="button"
            onClick={closeExportPanel}
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

        {pendingVisualExportFormat ? (
          <div className="absolute inset-0 z-[2200] flex items-center justify-center bg-slate-950/55 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">
                    Qualité de l’export {getVisualExportFormatLabel(pendingVisualExportFormat)}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Les qualités supérieures gardent les mêmes proportions et le même niveau de détail. Elles sont disponibles uniquement avec les fonds OpenFreeMap vectoriels.
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
                Fond actuel : <span className="font-semibold text-slate-900">{basemap.label}</span>.
                {supportsHighQualityBasemapExport
                  ? " Les qualités supérieures amélioreront aussi le fond OpenFreeMap."
                  : " Ce fond classique raster est limité à Standard pour éviter une fausse amélioration du fond."}
              </div>

              <div className="mt-4 grid gap-2">
                {VISUAL_EXPORT_QUALITY_OPTIONS.map((option) => {
                  const isDisabled =
                    isVisualExportBusy ||
                    (option.value !== "standard" && !supportsHighQualityBasemapExport);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleConfirmVisualExportQuality(option.value)}
                      disabled={isDisabled}
                      className={[
                        "rounded-xl border p-3 text-left transition",
                        isDisabled
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                          : option.value === "standard"
                            ? "border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
                            : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{option.label}</div>
                          <div className="mt-0.5 text-xs leading-relaxed">
                            {option.description}
                            {option.value !== "standard" && !supportsHighQualityBasemapExport
                              ? " Bloqué pour les anciens fonds classiques."
                              : ""}
                          </div>
                        </div>
                        {option.value !== "standard" && !supportsHighQualityBasemapExport ? (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                            OpenFreeMap
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

        <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] overflow-hidden">
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
                  <span className="font-medium">{renderableFeatures.length}</span>
                </div>

                <div>
                  Calques GeoJSON visibles :{" "}
                  <span className="font-medium">{renderableGeoJsonLayers.length}</span>
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

              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3">
                  <div className="text-sm font-semibold text-slate-950">
                    Télécharger / exporter
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">
                    Les formats visuels exportent la carte finale. Les formats données gardent les objets pour réutilisation ou échange.
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Aperçu
                    </div>
                    <button
                      type="button"
                      onClick={handleShowRenderedPreview}
                      disabled={!workspaceBounds || isGeneratingPreview}
                      className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      title="Générer un aperçu du rendu final sans téléchargement"
                    >
                      {isGeneratingPreview ? "Aperçu..." : "Voir le rendu"}
                    </button>
                  </div>

                  <div>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Image
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => requestVisualExport("png")}
                        disabled={!workspaceBounds || isVisualExportBusy}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                        title="Image de qualité maximale, fond transparent non utilisé"
                      >
                        {isDownloadingPng ? "PNG..." : "PNG"}
                      </button>

                      <button
                        type="button"
                        onClick={() => requestVisualExport("jpeg")}
                        disabled={!workspaceBounds || isVisualExportBusy}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                        title="Image plus légère que le PNG"
                      >
                        {isDownloadingJpeg ? "JPEG..." : "JPEG"}
                      </button>

                      <button
                        type="button"
                        onClick={() => requestVisualExport("webp")}
                        disabled={!workspaceBounds || isVisualExportBusy}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                        title="Image moderne et légère"
                      >
                        {isDownloadingWebp ? "WebP..." : "WebP"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Document
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => requestVisualExport("pdf")}
                        disabled={!workspaceBounds || isVisualExportBusy}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                        title="Document imprimable basé sur le même rendu que le PNG"
                      >
                        {isDownloadingPdf ? "PDF..." : "PDF"}
                      </button>

                      <button
                        type="button"
                        onClick={() => requestVisualExport("svg")}
                        disabled={!workspaceBounds || isVisualExportBusy}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                        title="SVG visuel contenant le rendu final"
                      >
                        {isDownloadingSvg ? "SVG..." : "SVG"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Données exportées
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadJson}
                        disabled={!workspaceBounds || isDownloadingJson}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        title="Exporter le projet complet pour le réimporter plus tard"
                      >
                        {isDownloadingJson ? "Projet..." : "Projet JSON"}
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadCsv}
                        disabled={renderableFeatures.length === 0 || isDownloadingCsv}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        title="Exporter la liste des objets DroMap et leurs styles en CSV"
                      >
                        {isDownloadingCsv ? "CSV..." : "CSV"}
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadGeoJson}
                        disabled={!workspaceBounds || (renderableFeatures.length === 0 && renderableGeoJsonLayers.length === 0) || isDownloadingGeoJson}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        title="Exporter les géométries en GeoJSON standard enrichi DroMap"
                      >
                        {isDownloadingGeoJson ? "GeoJSON..." : "GeoJSON"}
                      </button>
                    </div>

                    <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-500">
                      Le Projet JSON garde toute la carte complète, y compris les calques masqués, la légende, les sous-légendes, l’ordre des figurés et l’échelle. CSV et GeoJSON exportent les données visibles utiles à l’échange.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 text-sm font-medium text-slate-900">
                  Format d’export
                </div>

                <div className="grid gap-2">
                  {EXPORT_FORMAT_OPTIONS.map((option) => {
                    const isSelected = exportFormat === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setExportFormat(option.value)}
                        className={[
                          "rounded-xl border p-3 text-left transition",
                          isSelected
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-slate-200 bg-white hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-950">
                              {option.label}
                            </div>

                            <div className="text-xs text-slate-500">
                              {option.description}
                            </div>
                          </div>

                          <div
                            className={[
                              "h-4 w-4 rounded-full border",
                              isSelected
                                ? "border-indigo-600 bg-indigo-600"
                                : "border-slate-300 bg-white",
                            ].join(" ")}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <label
                  htmlFor="export-legend-title"
                  className="mb-2 block text-sm font-medium text-slate-900"
                >
                  Titre de la légende <span className="font-normal text-slate-400">(optionnel)</span>
                </label>

                <input
                  id="export-legend-title"
                  type="text"
                  value={legendTitle}
                  onChange={(event) => setLegendTitle(event.target.value)}
                  placeholder="Laisser vide pour ne pas afficher de titre"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 text-sm font-medium text-slate-900">
                  Position de la légende
                </div>

                <div className="grid gap-2">
                  {LEGEND_POSITION_OPTIONS.map((option) => {
                    const isSelected = legendPosition === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setLegendPosition(option.value)}
                        className={[
                          "rounded-xl border p-3 text-left transition",
                          isSelected
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-slate-200 bg-white hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-950">
                              {option.label}
                            </div>

                            <div className="text-xs text-slate-500">
                              {option.description}
                            </div>
                          </div>

                          <div
                            className={[
                              "h-4 w-4 rounded-full border",
                              isSelected
                                ? "border-indigo-600 bg-indigo-600"
                                : "border-slate-300 bg-white",
                            ].join(" ")}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 text-sm font-medium text-slate-900">
                  Apparence de la légende
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="export-legend-bg-color"
                      className="mb-1 block text-xs font-medium text-slate-700"
                    >
                      Couleur de fond
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        id="export-legend-bg-color"
                        type="color"
                        value={legendBackgroundColor}
                        onChange={(event) =>
                          setLegendBackgroundColor(event.target.value)
                        }
                        className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1"
                      />

                      <input
                        type="text"
                        value={legendBackgroundColor}
                        onChange={(event) =>
                          setLegendBackgroundColor(event.target.value)
                        }
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-2 text-xs text-indigo-900">
                    Largeur / hauteur : tire directement la séparation entre la
                    carte et la légende dans la prévisualisation.
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
                        Taille des titres de sous-légendes
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

              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-relaxed text-indigo-900 shadow-sm">
                <div>
                  Organisation de la légende : ajoute les sous-légendes, renomme les groupes, masque des entrées et glisse les éléments directement dans la prévisualisation.
                </div>

                <button
                  type="button"
                  onClick={resetExportLegendConfig}
                  className="mt-2 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-50"
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

          <main className="min-h-0 min-w-0 bg-slate-100 p-4">
            <ExportPreviewScene />
          </main>
        </div>

        {renderPreviewUrl ? (
          <div className="absolute inset-0 z-[2200] flex items-center justify-center bg-slate-950/70 p-6">
            <div className="flex h-full max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">
                    Aperçu du rendu PNG
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Aperçu généré en qualité légère pour vérifier l’agencement final avant téléchargement PNG ou PDF.
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
                <img
                  src={renderPreviewUrl}
                  alt="Aperçu du rendu PNG DroMap"
                  className="block max-h-full max-w-full rounded border border-slate-300 bg-white object-contain shadow-lg"
                  draggable={false}
                />
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}