"use client";

import { useState } from "react";

import { DromapButton } from "@/components/dromap-ui/button";
import { DromapDialog } from "@/components/dromap-ui/dialog";
import {
  downloadCanvasExportAsJpeg,
  downloadCanvasExportAsPdf,
  downloadCanvasExportAsPng,
  downloadCanvasExportAsSvg,
  downloadCanvasExportAsWebp,
  downloadFeaturesAsCsv,
  downloadFeaturesAsGeoJson,
  downloadProjectAsJson,
  type DownloadCanvasExportInput,
} from "@/app/editor/test/export-download";
import type { DromapProject } from "@/lib/dromap/product";
import {
  getRenderableFeaturesForLayers,
} from "@/stores/editor-test-layers";
import {
  getGeoJsonLayerLoadedFeatureCount,
  getRenderableGeoJsonLayers,
} from "@/stores/editor-test-geojson-layers";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { setTransientCustomMarkers } from "@/stores/editor-test-custom-markers";
import { useDromapProductStore } from "@/stores/dromap-product";

function createDashboardExportInput(
  project: DromapProject,
  options: { includeHiddenLayers?: boolean } = {},
): DownloadCanvasExportInput | null {
  const snapshot = project.editorSnapshot;
  const workspaceBounds = snapshot?.workspaceBounds ?? project.setup.workspaceBounds;
  if (!snapshot || !workspaceBounds) return null;

  const defaults = useEditorTestExportStore.getState();
  const settings = snapshot.exportSettings;
  const layers = snapshot.layers ?? [];
  const geoJsonLayers = snapshot.geoJsonLayers ?? [];
  const features = options.includeHiddenLayers
    ? snapshot.features
    : getRenderableFeaturesForLayers(snapshot.features, layers, { workspaceBounds });
  const visibleGeoJsonLayers = options.includeHiddenLayers
    ? geoJsonLayers
    : getRenderableGeoJsonLayers(geoJsonLayers).filter(
        (layer) => getGeoJsonLayerLoadedFeatureCount(layer, workspaceBounds) > 0,
      );

  return {
    features,
    layers,
    geoJsonLayers: visibleGeoJsonLayers,
    customMarkers: snapshot.customMarkers ?? [],
    workspaceBounds,
    workspaceBasemapZoom:
      snapshot.workspaceBasemapZoom ?? snapshot.workspaceBasemapBaseZoom ?? null,
    workspaceBasemapBaseZoom:
      snapshot.workspaceBasemapBaseZoom ?? snapshot.workspaceBasemapZoom ?? null,
    basemapId: snapshot.basemapId ?? project.setup.basemapId,
    showBasemapLabels:
      settings?.showBasemapLabels ?? snapshot.showBasemapLabels ?? true,
    mapTitle: settings?.mapTitle ?? defaults.mapTitle,
    mapTitlePosition: settings?.mapTitlePosition ?? defaults.mapTitlePosition,
    mapTitleFontSize: settings?.mapTitleFontSize ?? defaults.mapTitleFontSize,
    mapTitleColor: settings?.mapTitleColor ?? defaults.mapTitleColor,
    showCountryNeighborContext: snapshot.showCountryNeighborContext !== false,
    showAllFeatureLabels: snapshot.showAllFeatureLabels === true,
    showAllGeoJsonFeatureLabels: snapshot.showAllGeoJsonFeatureLabels === true,
    featureMapLabelScale: snapshot.featureMapLabelScale ?? 1,
    featureMapLabelOutlineWidth: snapshot.featureMapLabelOutlineWidth ?? 1.5,
    featureMapLabelRenderScale: snapshot.featureMapLabelScale ?? 1,
    featureMapLabelEditorVisualZoom:
      snapshot.workspaceBasemapZoom ?? snapshot.workspaceBasemapBaseZoom ?? null,
    legendTitle: settings?.legendTitle ?? defaults.legendTitle,
    legendPosition: settings?.legendPosition ?? defaults.legendPosition,
    legendMapPosition: settings?.legendMapPosition ?? defaults.legendMapPosition,
    legendMapTitlePosition:
      settings?.legendMapTitlePosition ?? defaults.legendMapTitlePosition,
    exportFormat: settings?.exportFormat ?? defaults.exportFormat,
    legendBackgroundColor:
      settings?.legendBackgroundColor ?? defaults.legendBackgroundColor,
    legendSideWidth: settings?.legendSideWidth ?? defaults.legendSideWidth,
    legendBottomHeight:
      settings?.legendBottomHeight ?? defaults.legendBottomHeight,
    legendTitleFontSize:
      settings?.legendTitleFontSize ?? defaults.legendTitleFontSize,
    legendItemFontSize:
      settings?.legendItemFontSize ?? defaults.legendItemFontSize,
    legendSectionTitleFontSize:
      settings?.legendSectionTitleFontSize ?? defaults.legendSectionTitleFontSize,
    legendSymbolSize: settings?.legendSymbolSize ?? defaults.legendSymbolSize,
    legendItemGap: settings?.legendItemGap ?? defaults.legendItemGap,
    legendLabelGap: settings?.legendLabelGap ?? defaults.legendLabelGap,
    legendLabelLineHeight:
      settings?.legendLabelLineHeight ?? defaults.legendLabelLineHeight,
    legendSectionGap: settings?.legendSectionGap ?? defaults.legendSectionGap,
    legendMapBorderEnabled:
      settings?.legendMapBorderEnabled ?? defaults.legendMapBorderEnabled,
    legendMapBorderColor:
      settings?.legendMapBorderColor ?? defaults.legendMapBorderColor,
    legendMapBorderWidth:
      settings?.legendMapBorderWidth ?? defaults.legendMapBorderWidth,
    legendMapBorderRadius:
      settings?.legendMapBorderRadius ?? defaults.legendMapBorderRadius,
    legendMapPadding: settings?.legendMapPadding ?? defaults.legendMapPadding,
    customLegendEntries:
      settings?.customLegendEntries ?? defaults.customLegendEntries,
    legendSymbolOverrides:
      settings?.legendSymbolOverrides ?? defaults.legendSymbolOverrides,
    scaleBarEnabled: settings?.scaleBarEnabled ?? defaults.scaleBarEnabled,
    scaleBarStyle: settings?.scaleBarStyle ?? defaults.scaleBarStyle,
    scaleBarPosition: settings?.scaleBarPosition ?? defaults.scaleBarPosition,
    scaleBarMapPosition:
      settings?.scaleBarMapPosition ?? defaults.scaleBarMapPosition,
    northArrowEnabled: settings?.northArrowEnabled ?? defaults.northArrowEnabled,
    northArrowStyle: settings?.northArrowStyle ?? defaults.northArrowStyle,
    northArrowPosition:
      settings?.northArrowPosition ?? defaults.northArrowPosition,
    northArrowMapPosition:
      settings?.northArrowMapPosition ?? defaults.northArrowMapPosition,
    hiddenLegendFeatureIds:
      settings?.hiddenLegendFeatureIds ?? defaults.hiddenLegendFeatureIds,
    hiddenLegendGroupKeys:
      settings?.hiddenLegendGroupKeys ?? defaults.hiddenLegendGroupKeys,
    legendFeatureOrder:
      settings?.legendFeatureOrder ?? defaults.legendFeatureOrder,
    legendGroupOrder: settings?.legendGroupOrder ?? defaults.legendGroupOrder,
    legendSectionOrder:
      settings?.legendSectionOrder ?? defaults.legendSectionOrder,
    legendGroupLabels:
      settings?.legendGroupLabels ?? defaults.legendGroupLabels,
    legendGroupSections:
      settings?.legendGroupSections ?? defaults.legendGroupSections,
  };
}

type VisualFormat = "png" | "jpeg" | "webp" | "pdf" | "svg";
type DataFormat = "project" | "geojson" | "csv";

export function DashboardProjectExportDialog({
  open,
  projectId,
  projectName,
  userMode,
  onClose,
}: {
  open: boolean;
  projectId: string;
  projectName: string;
  userMode: "guest" | "authenticated";
  onClose: () => void;
}) {
  const loadProject = useDromapProductStore((state) => state.loadProject);
  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function getLoadedProject() {
    const result = await loadProject(projectId);
    if (!result.ok) throw new Error(result.error);
    const project = useDromapProductStore
      .getState()
      .projects.find((candidate) => candidate.id === projectId);
    if (!project?.editorSnapshot || project.contentLoaded === false) {
      throw new Error("Le contenu du projet n’est pas disponible.");
    }
    return project;
  }

  async function runVisualExport(format: VisualFormat) {
    if (busyFormat) return;
    if (userMode === "guest" && format !== "png") {
      setStatus("En mode invité, seul le PNG Standard est disponible.");
      return;
    }

    setBusyFormat(format);
    setStatus("Préparation du téléchargement…");
    try {
      const project = await getLoadedProject();
      const input = createDashboardExportInput(project);
      if (!input) throw new Error("Une zone de travail validée est nécessaire.");
      const clearTransientMarkers = setTransientCustomMarkers(
        project.editorSnapshot?.customMarkers ?? [],
      );
      try {
        if (format === "png") await downloadCanvasExportAsPng(input, { quality: "standard" });
        if (format === "jpeg") await downloadCanvasExportAsJpeg(input, { quality: "standard" });
        if (format === "webp") await downloadCanvasExportAsWebp(input, { quality: "standard" });
        if (format === "pdf") await downloadCanvasExportAsPdf(input, { quality: "standard" });
        if (format === "svg") await downloadCanvasExportAsSvg(input, { quality: "standard" });
      } finally {
        clearTransientMarkers();
      }
      setStatus("Téléchargement lancé.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Téléchargement impossible.");
    } finally {
      setBusyFormat(null);
    }
  }

  async function runDataExport(format: DataFormat) {
    if (busyFormat) return;
    if (userMode === "guest") {
      setStatus("L’export de données nécessite un compte.");
      return;
    }

    setBusyFormat(format);
    setStatus("Préparation de l’export…");
    try {
      const project = await getLoadedProject();
      const input = createDashboardExportInput(project, {
        includeHiddenLayers: format === "project",
      });
      if (!input) throw new Error("Le projet ne contient pas encore de zone de travail validée.");

      const clearTransientMarkers = setTransientCustomMarkers(
        project.editorSnapshot?.customMarkers ?? [],
      );
      try {
        if (format === "project") downloadProjectAsJson(input);
        if (format === "geojson") downloadFeaturesAsGeoJson(input);
        if (format === "csv") downloadFeaturesAsCsv(input.features);
      } finally {
        clearTransientMarkers();
      }
      setStatus("Export lancé.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export impossible.");
    } finally {
      setBusyFormat(null);
    }
  }

  const visualFormats: Array<[VisualFormat, string]> = [
    ["png", "PNG"],
    ["jpeg", "JPEG"],
    ["webp", "WebP"],
    ["pdf", "PDF"],
    ["svg", "SVG"],
  ];

  return (
    <DromapDialog
      open={open}
      title={`Télécharger / exporter — ${projectName}`}
      description="Choisis simplement un format. Le projet est chargé en arrière-plan, sans ouvrir l’éditeur ni le rendu final."
      onClose={() => {
        if (!busyFormat) onClose();
      }}
      maxWidthClassName="max-w-xl"
      footer={<DromapButton onClick={onClose} disabled={Boolean(busyFormat)}>Fermer</DromapButton>}
    >
      <div className="space-y-5">
        <section>
          <div className="text-sm font-black text-slate-950">Télécharger la carte</div>
          <p className="mt-1 text-xs text-slate-500">Téléchargement rapide en qualité standard, sans aperçu supplémentaire.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {visualFormats.map(([format, label]) => {
              const locked = userMode === "guest" && format !== "png";
              return (
                <button
                  key={format}
                  type="button"
                  disabled={Boolean(busyFormat)}
                  onClick={() => void runVisualExport(format)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-50"
                >
                  {busyFormat === format ? "…" : label}{locked ? " 🔒" : ""}
                </button>
              );
            })}
          </div>
        </section>

        <section className="border-t border-slate-200 pt-5">
          <div className="text-sm font-black text-slate-950">Exporter les données</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([
              ["project", "Projet DroMap"],
              ["geojson", "GeoJSON"],
              ["csv", "CSV"],
            ] as Array<[DataFormat, string]>).map(([format, label]) => (
              <button
                key={format}
                type="button"
                disabled={Boolean(busyFormat)}
                onClick={() => void runDataExport(format)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-50"
              >
                {busyFormat === format ? "…" : label}{userMode === "guest" ? " 🔒" : ""}
              </button>
            ))}
          </div>
        </section>

        {status ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
            {status}
          </div>
        ) : null}
      </div>
    </DromapDialog>
  );
}
