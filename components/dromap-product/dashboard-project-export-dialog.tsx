"use client";

import { useEffect, useMemo, useState } from "react";

import { DromapButton } from "@/components/dromap-ui/button";
import { DromapDialog } from "@/components/dromap-ui/dialog";
import {
  getDromapBillingStatus,
  markDromapSingleMapDownloaded,
  type DromapBillingStatus,
} from "@/lib/dromap/billing";
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
  type ExportVisualQuality,
} from "@/editor/export-download";
import { getDromapCapabilities, type DromapProject } from "@/lib/dromap/product";
import {
  getRenderableFeaturesForLayers,
} from "@/stores/editor-layers";
import {
  getGeoJsonLayerLoadedFeatureCount,
  getRenderableGeoJsonLayers,
} from "@/stores/editor-geojson-layers";
import { useEditorExportStore } from "@/stores/editor-export";
import { setTransientCustomMarkers } from "@/stores/editor-custom-markers";
import { useDromapProductStore } from "@/stores/dromap-product";
import { resolveDromapPreferences, type DromapScaleUnitsPreference } from "@/lib/dromap/preferences";

export function createDashboardExportInput(
  project: DromapProject,
  options: {
    includeHiddenLayers?: boolean;
    scaleUnits?: DromapScaleUnitsPreference;
  } = {},
): DownloadCanvasExportInput | null {
  const snapshot = project.editorSnapshot;
  const workspaceBounds = snapshot?.workspaceBounds ?? project.setup.workspaceBounds;
  if (!snapshot || !workspaceBounds) return null;

  const defaults = useEditorExportStore.getState();
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
    guestWatermarkMapPosition:
      settings?.guestWatermarkMapPosition ??
      defaults.guestWatermarkMapPosition,
    showCountryNeighborContext: snapshot.showCountryNeighborContext !== false,
    showAllFeatureLabels: snapshot.showAllFeatureLabels === true,
    showAllGeoJsonFeatureLabels: snapshot.showAllGeoJsonFeatureLabels === true,
    featureMapLabelScale: snapshot.featureMapLabelScale ?? 1,
    featureMapLabelOutlineWidth: snapshot.featureMapLabelOutlineWidth ?? 1.5,
    featureMapLabelRenderScale: snapshot.featureMapLabelScale ?? 1,
    featureMapLabelEditorVisualZoom:
      snapshot.workspaceBasemapZoom ?? snapshot.workspaceBasemapBaseZoom ?? null,
    creatorAttribution:
      project.sourceAttribution &&
      project.sourceAttribution.kind === "public-map" &&
      !(project.sourceAttribution.allowRemoval && project.sourceAttribution.hidden)
        ? {
            label: project.sourceAttribution.creatorName,
            position: project.sourceAttribution.position,
            mapPosition: project.sourceAttribution.mapPosition ?? null,
          }
        : null,
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
    scaleUnits: options.scaleUnits,
    scaleBarStyle: settings?.scaleBarStyle ?? defaults.scaleBarStyle,
    scaleBarPosition: settings?.scaleBarPosition ?? defaults.scaleBarPosition,
    scaleBarMapPosition:
      settings?.scaleBarMapPosition ?? defaults.scaleBarMapPosition,
    scaleBarSize: settings?.scaleBarSize ?? defaults.scaleBarSize,
    northArrowEnabled: settings?.northArrowEnabled ?? defaults.northArrowEnabled,
    northArrowStyle: settings?.northArrowStyle ?? defaults.northArrowStyle,
    northArrowPosition:
      settings?.northArrowPosition ?? defaults.northArrowPosition,
    northArrowMapPosition:
      settings?.northArrowMapPosition ?? defaults.northArrowMapPosition,
    northArrowSize: settings?.northArrowSize ?? defaults.northArrowSize,
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
  const accountPreferences = useDromapProductStore((state) => state.accountPreferences);
  const resolvedPreferences = useMemo(
    () => resolveDromapPreferences(accountPreferences),
    [accountPreferences],
  );
  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [visualQuality, setVisualQuality] = useState<ExportVisualQuality>("standard");
  const [billingStatus, setBillingStatus] = useState<DromapBillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [firstDownloadWarningOpen, setFirstDownloadWarningOpen] = useState(false);
  const [pendingFirstDownloadFormat, setPendingFirstDownloadFormat] = useState<VisualFormat | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!open || userMode !== "authenticated") {
      setBillingStatus(null);
      setBillingLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setBillingLoading(true);
    void getDromapBillingStatus()
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.data) {
          setBillingStatus(result.data);
        } else {
          setBillingStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) setBillingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, userMode]);

  const singleMapPurchased =
    billingStatus?.singleMapMaxExportProjectIds.includes(projectId) === true;
  const singleMapZoneLocked =
    billingStatus?.singleMapZoneLockedProjectIds.includes(projectId) === true;
  const publicMapExportPurchased =
    billingStatus?.publicMapExportProjectIds.includes(projectId) === true;
  const premiumPlan =
    billingStatus?.plan === "plus" ||
    billingStatus?.plan === "pro" ||
    billingStatus?.plan === "tester";
  const singleMapPurchaseRequiresZoneLock = singleMapPurchased && !premiumPlan;
  const capabilities = useMemo(
    () =>
      getDromapCapabilities(
        userMode,
        userMode === "authenticated" ? billingStatus?.plan ?? "free" : "free",
        { singleMapMaxExport: singleMapPurchased, publicMapExport: publicMapExportPurchased },
      ),
    [billingStatus?.plan, publicMapExportPurchased, singleMapPurchased, userMode],
  );

  useEffect(() => {
    if (!open) return;
    setVisualQuality("standard");
  }, [open]);

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

  async function persistSingleMapDownloadLock() {
    if (userMode !== "authenticated" || !singleMapPurchaseRequiresZoneLock || singleMapZoneLocked) {
      return { locked: singleMapZoneLocked, error: null as string | null };
    }

    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await markDromapSingleMapDownloaded(projectId);
      if (result.ok) {
        setBillingStatus((current) =>
          current
            ? {
                ...current,
                singleMapZoneLockedProjectIds: Array.from(
                  new Set([...current.singleMapZoneLockedProjectIds, projectId]),
                ),
              }
            : current,
        );
        return { locked: true, error: null as string | null };
      }
      lastError = result.error ?? "Synchronisation du verrouillage impossible.";
      if (attempt < 2) {
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    return { locked: false, error: lastError };
  }

  async function executeVisualExport(format: VisualFormat) {
    if (busyFormat) return;

    setBusyFormat(format);
    setStatus("Préparation du téléchargement…");
    try {
      const project = await getLoadedProject();
      const input = createDashboardExportInput(project, {
        scaleUnits: resolvedPreferences.scaleUnits,
      });
      if (!input) throw new Error("Une zone de travail validée est nécessaire.");
      const clearTransientMarkers = setTransientCustomMarkers(
        project.editorSnapshot?.customMarkers ?? [],
      );
      try {
        const options = {
          quality: visualQuality,
          showDromapGuestWatermark: userMode === "guest",
        };
        if (format === "png") await downloadCanvasExportAsPng(input, options);
        if (format === "jpeg") await downloadCanvasExportAsJpeg(input, options);
        if (format === "webp") await downloadCanvasExportAsWebp(input, options);
        if (format === "pdf") await downloadCanvasExportAsPdf(input, options);
        if (format === "svg") await downloadCanvasExportAsSvg(input, options);
      } finally {
        clearTransientMarkers();
      }

      const zoneLockResult = await persistSingleMapDownloadLock();
      if (zoneLockResult.error) {
        setStatus(
          `Téléchargement lancé. ${zoneLockResult.error} Ne modifie pas la zone avant d’avoir réessayé la synchronisation.`,
        );
      } else if (zoneLockResult.locked) {
        setStatus("Téléchargement lancé. La zone de travail de cette carte est désormais verrouillée.");
      } else {
        setStatus("Téléchargement lancé.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Téléchargement impossible.");
    } finally {
      setBusyFormat(null);
    }
  }

  async function runVisualExport(format: VisualFormat) {
    if (busyFormat || billingLoading) return;
    if (format !== "png" && !capabilities.canExportOtherVisualFormats) {
      setStatus("Ce format nécessite Plus, Pro ou l’Export Max acheté pour cette carte.");
      return;
    }
    if (visualQuality !== "standard" && !capabilities.canExportHighQuality) {
      setStatus("La qualité Haute ou Très haute nécessite Plus, Pro ou l’Export Max acheté pour cette carte.");
      return;
    }
    if (singleMapPurchaseRequiresZoneLock && !singleMapZoneLocked) {
      setPendingFirstDownloadFormat(format);
      setFirstDownloadWarningOpen(true);
      return;
    }
    await executeVisualExport(format);
  }

  async function runDataExport(format: DataFormat) {
    if (busyFormat) return;
    if (!capabilities.canExportProjectData) {
      setStatus("L’export de données est réservé aux formules Plus et Pro.");
      return;
    }

    setBusyFormat(format);
    setStatus("Préparation de l’export…");
    try {
      const project = await getLoadedProject();
      const input = createDashboardExportInput(project, {
        includeHiddenLayers: format === "project",
        scaleUnits: resolvedPreferences.scaleUnits,
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

  const visualQualityOptions: Array<[ExportVisualQuality, string]> = [
    ["standard", "Standard"],
    ["high", "Haute"],
    ["very-high", "Très haute"],
  ];

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
      onClose={() => {
        if (!busyFormat) onClose();
      }}
      maxWidthClassName="max-w-xl"
      footer={<DromapButton onClick={onClose} disabled={Boolean(busyFormat)}>Fermer</DromapButton>}
    >
      <div className="space-y-5">
        <section>
          <div className="text-sm font-black text-slate-950">Télécharger la carte</div>
          <div className="mt-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Qualité</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {visualQualityOptions.map(([quality, label]) => {
                const locked = quality !== "standard" && !capabilities.canExportHighQuality;
                const selected = visualQuality === quality;
                return (
                  <button
                    key={quality}
                    type="button"
                    disabled={Boolean(busyFormat) || billingLoading || locked}
                    onClick={() => {
                      setVisualQuality(quality);
                      setStatus(null);
                    }}
                    aria-pressed={selected}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      selected
                        ? "border-teal-500 bg-teal-50 text-teal-800 shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50"
                    }`}
                  >
                    {label}{locked ? " 🔒" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {visualFormats.map(([format, label]) => {
              const locked = format !== "png" && !capabilities.canExportOtherVisualFormats;
              return (
                <button
                  key={format}
                  type="button"
                  disabled={Boolean(busyFormat)}
                  onClick={() => void runVisualExport(format)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 disabled:cursor-wait disabled:opacity-50"
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-800 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 disabled:cursor-wait disabled:opacity-50"
              >
                {busyFormat === format ? "…" : label}{!capabilities.canExportProjectData ? " 🔒" : ""}
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

      <DromapDialog
        open={firstDownloadWarningOpen}
        title="Premier téléchargement de cette carte"
        description="Après ce premier téléchargement, la zone de travail de ce projet sera définitivement verrouillée. Les objets, la légende et le rendu resteront modifiables et la carte pourra être retéléchargée."
        onClose={() => {
          setFirstDownloadWarningOpen(false);
          setPendingFirstDownloadFormat(null);
        }}
        footer={
          <>
            <DromapButton
              onClick={() => {
                setFirstDownloadWarningOpen(false);
                setPendingFirstDownloadFormat(null);
              }}
            >
              Annuler
            </DromapButton>
            <DromapButton
              variant="primary"
              onClick={() => {
                const format = pendingFirstDownloadFormat;
                setFirstDownloadWarningOpen(false);
                setPendingFirstDownloadFormat(null);
                if (format) void executeVisualExport(format);
              }}
            >
              Télécharger et verrouiller la zone
            </DromapButton>
          </>
        }
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          Le verrouillage ne sera enregistré qu’après la réussite du téléchargement. Si tu annules maintenant, la zone reste modifiable.
        </div>
      </DromapDialog>
    </DromapDialog>
  );
}
