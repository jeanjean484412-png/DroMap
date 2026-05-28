"use client";

import { useState } from "react";

import type {
  ExportFormat,
  ExportLegendPosition,
} from "@/stores/editor-test-export";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { downloadCanvasExportAsPng } from "./export-download";
import { ExportPreviewScene } from "./export-preview-scene";
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

export function ExportSetupPanel() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  const isExportPanelOpen = useEditorTestExportStore(
    (state) => state.isExportPanelOpen,
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
  const resetExportLegendConfig = useEditorTestExportStore(
    (state) => state.resetExportLegendConfig,
  );

  const features = useEditorTestFeaturesStore((state) => state.features);

  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const workspaceBasemapZoom = useEditorTestWorkspaceStore(
    (state) => state.workspaceBasemapZoom,
  );

  if (!isExportPanelOpen) {
    return null;
  }

  async function handleDownloadPng() {
    if (!workspaceBounds || isDownloading) {
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadStatus("Préparation du PNG...");

      await downloadCanvasExportAsPng({
        features,
        workspaceBounds,
        workspaceBasemapZoom,
        legendTitle,
        legendPosition,
        exportFormat,
        legendBackgroundColor,
        legendSideWidth,
        legendBottomHeight,
        legendTitleFontSize,
        legendItemFontSize,
        legendSectionTitleFontSize,
        hiddenLegendFeatureIds,
        legendFeatureOrder,
        legendGroupLabels,
        legendGroupSections,
        legendGroupOrder,
        legendSectionOrder,
      });

      setDownloadStatus("PNG téléchargé.");
    } catch (error) {
      console.error(error);
      setDownloadStatus(
        "Export impossible pour l’instant. Le rendu canvas n’a pas pu générer l’image.",
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="absolute inset-0 z-[2000] bg-slate-950/60 p-3">
      <section className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Préparer l’export
            </h2>

            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              La prévisualisation utilise le même calcul de mise en page que le
              PNG. Le niveau de détail du fond suit maintenant le zoom réel de
              la carte d’édition.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={!workspaceBounds || isDownloading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isDownloading ? "Export..." : "Télécharger PNG"}
            </button>

            <button
              type="button"
              onClick={closeExportPanel}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-100"
            >
              Fermer
            </button>
          </div>
        </header>

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
                  Objets à exporter :{" "}
                  <span className="font-medium">{features.length}</span>
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
      </section>
    </div>
  );
}