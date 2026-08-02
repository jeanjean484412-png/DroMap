"use client";

import { useMemo, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";

import {
  DEFAULT_LEGEND_SECTION,
  useEditorTestExportStore,
} from "@/stores/editor-test-export";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { getOrderedLegendFeatures } from "./export-layout";
import { getLegendEntries, type LegendEntry } from "./legend-entry";

function normalizeSection(section: string) {
  const trimmedSection = section.trim();

  return trimmedSection.length > 0 ? trimmedSection : DEFAULT_LEGEND_SECTION;
}

function sectionKey(section: string) {
  return normalizeSection(section).toLowerCase();
}

function getEntryVisibilityState(
  entry: LegendEntry,
  hiddenLegendFeatureIds: string[],
) {
  const hiddenFeatureIds = new Set(hiddenLegendFeatureIds);
  const hiddenCount = entry.featureIds.filter((featureId) =>
    hiddenFeatureIds.has(featureId),
  ).length;

  if (hiddenCount === 0) {
    return "visible" as const;
  }

  if (hiddenCount === entry.featureIds.length) {
    return "hidden" as const;
  }

  return "partial" as const;
}

function getEntryVisibilityLabel(state: "visible" | "hidden" | "partial") {
  if (state === "hidden") return "Masqué";
  if (state === "partial") return "Partiel";

  return "Visible";
}

function getSectionList(entries: LegendEntry[], legendSectionOrder: string[]) {
  const sections: string[] = [];
  const seen = new Set<string>();

  const push = (section: string) => {
    const normalizedSection = normalizeSection(section);
    const key = sectionKey(normalizedSection);

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    sections.push(normalizedSection);
  };

  push(DEFAULT_LEGEND_SECTION);

  for (const section of legendSectionOrder) {
    push(section);
  }

  for (const entry of entries) {
    push(entry.section);
  }

  return sections;
}

function getEntriesBySection(entries: LegendEntry[]) {
  const entriesBySection = new Map<string, LegendEntry[]>();

  for (const entry of entries) {
    const key = sectionKey(entry.section);
    const sectionEntries = entriesBySection.get(key) ?? [];

    sectionEntries.push(entry);
    entriesBySection.set(key, sectionEntries);
  }

  return entriesBySection;
}

export function ExportLegendControls() {
  const [draggedGroupKey, setDraggedGroupKey] = useState<string | null>(null);

  const features = useEditorTestFeaturesStore((state) => state.features);

  const hiddenLegendFeatureIds = useEditorTestExportStore(
    (state) => state.hiddenLegendFeatureIds,
  );
  const legendFeatureOrder = useEditorTestExportStore(
    (state) => state.legendFeatureOrder,
  );
  const legendGroupOrder = useEditorTestExportStore(
    (state) => state.legendGroupOrder,
  );
  const setLegendGroupOrder = useEditorTestExportStore(
    (state) => state.setLegendGroupOrder,
  );
  const legendSectionOrder = useEditorTestExportStore(
    (state) => state.legendSectionOrder,
  );
  const legendGroupLabels = useEditorTestExportStore(
    (state) => state.legendGroupLabels,
  );
  const legendGroupSections = useEditorTestExportStore(
    (state) => state.legendGroupSections,
  );
  const setLegendGroupLabel = useEditorTestExportStore(
    (state) => state.setLegendGroupLabel,
  );
  const setLegendGroupSection = useEditorTestExportStore(
    (state) => state.setLegendGroupSection,
  );
  const addLegendSection = useEditorTestExportStore(
    (state) => state.addLegendSection,
  );
  const renameLegendSection = useEditorTestExportStore(
    (state) => state.renameLegendSection,
  );
  const removeLegendSection = useEditorTestExportStore(
    (state) => state.removeLegendSection,
  );
  const toggleLegendFeatureVisibility = useEditorTestExportStore(
    (state) => state.toggleLegendFeatureVisibility,
  );
  const resetExportLegendConfig = useEditorTestExportStore(
    (state) => state.resetExportLegendConfig,
  );

  const orderedFeatures = useMemo(
    () => getOrderedLegendFeatures(features, legendFeatureOrder),
    [features, legendFeatureOrder],
  );

  const legendEntries = useMemo(
    () =>
      getLegendEntries(orderedFeatures, {
        legendGroupLabels,
        legendGroupSections,
        legendGroupOrder,
      }),
    [orderedFeatures, legendGroupLabels, legendGroupSections, legendGroupOrder],
  );

  const sections = useMemo(
    () => getSectionList(legendEntries, legendSectionOrder),
    [legendEntries, legendSectionOrder],
  );

  const entriesBySection = useMemo(
    () => getEntriesBySection(legendEntries),
    [legendEntries],
  );

  function syncOrder(nextEntries: LegendEntry[]) {
    // L’ordre des groupes dans la légende ne doit jamais réordonner les
    // features qui servent à calculer les nuances de zones superposées.
    setLegendGroupOrder(nextEntries.map((entry) => entry.dedupeKey));
  }

  function toggleEntryVisibility(entry: LegendEntry) {
    const visibilityState = getEntryVisibilityState(
      entry,
      hiddenLegendFeatureIds,
    );
    const shouldShow = visibilityState === "hidden";
    const hiddenFeatureIds = new Set(hiddenLegendFeatureIds);

    for (const featureId of entry.featureIds) {
      const isHidden = hiddenFeatureIds.has(featureId);

      if (shouldShow && isHidden) {
        toggleLegendFeatureVisibility(featureId);
      }

      if (!shouldShow && !isHidden) {
        toggleLegendFeatureVisibility(featureId);
      }
    }
  }

  function moveDraggedGroup(targetSection: string, beforeGroupKey?: string) {
    if (!draggedGroupKey) {
      return;
    }

    const draggedEntry = legendEntries.find(
      (entry) => entry.dedupeKey === draggedGroupKey,
    );

    if (!draggedEntry) {
      return;
    }

    const nextEntries = legendEntries.filter(
      (entry) => entry.dedupeKey !== draggedGroupKey,
    );
    const targetIndex = beforeGroupKey
      ? nextEntries.findIndex((entry) => entry.dedupeKey === beforeGroupKey)
      : -1;

    if (targetIndex === -1) {
      nextEntries.push(draggedEntry);
    } else {
      nextEntries.splice(targetIndex, 0, draggedEntry);
    }

    setLegendGroupSection(draggedEntry.dedupeKey, targetSection);
    syncOrder(nextEntries);
  }

  function handleGroupDragStart(
    event: ReactDragEvent<HTMLDivElement>,
    entry: LegendEntry,
  ) {
    setDraggedGroupKey(entry.dedupeKey);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", entry.dedupeKey);
  }

  function handleDragOver(event: ReactDragEvent<HTMLElement>) {
    if (!draggedGroupKey) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDropOnSection(
    event: ReactDragEvent<HTMLDivElement>,
    section: string,
  ) {
    event.preventDefault();
    moveDraggedGroup(section);
    setDraggedGroupKey(null);
  }

  function handleDropOnGroup(
    event: ReactDragEvent<HTMLDivElement>,
    targetEntry: LegendEntry,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!draggedGroupKey || draggedGroupKey === targetEntry.dedupeKey) {
      setDraggedGroupKey(null);
      return;
    }

    moveDraggedGroup(targetEntry.section, targetEntry.dedupeKey);
    setDraggedGroupKey(null);
  }

  function moveEntry(entry: LegendEntry, direction: "up" | "down") {
    const currentIndex = legendEntries.findIndex(
      (candidate) => candidate.dedupeKey === entry.dedupeKey,
    );

    if (currentIndex === -1) {
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= legendEntries.length) {
      return;
    }

    const nextEntries = [...legendEntries];
    const temporaryEntry = nextEntries[currentIndex];
    nextEntries[currentIndex] = nextEntries[targetIndex];
    nextEntries[targetIndex] = temporaryEntry;

    syncOrder(nextEntries);
  }

  if (features.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
        Aucun objet à configurer dans la légende.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-slate-900">
            Groupes et sous-légendes
          </div>
          <div className="text-[10px] text-slate-500">
            Glisse un groupe pour changer son ordre ou le déposer dans une sous-légende.
          </div>
        </div>

        <button
          type="button"
          onClick={resetExportLegendConfig}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          Réinitialiser
        </button>
      </div>

      <button
        type="button"
        onClick={addLegendSection}
        className="mb-3 w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
      >
        + Ajouter une sous-légende
      </button>

      <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {sections.map((section) => {
          const sectionEntries =
            entriesBySection.get(sectionKey(section)) ?? [];
          const isDefaultSection =
            sectionKey(section) === sectionKey(DEFAULT_LEGEND_SECTION);

          return (
            <div
              key={sectionKey(section)}
              onDragOver={handleDragOver}
              onDrop={(event) => handleDropOnSection(event, section)}
              className="rounded-xl border border-slate-200 bg-slate-50 p-2"
            >
              <div className="mb-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-slate-300" />
                <input
                  type="text"
                  value={section}
                  disabled={isDefaultSection}
                  onChange={(event) =>
                    renameLegendSection(section, event.target.value)
                  }
                  className="min-w-0 max-w-[170px] rounded-md border border-transparent bg-transparent px-2 py-1 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700 outline-none disabled:cursor-default hover:border-slate-200 hover:bg-white focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  title={
                    isDefaultSection
                      ? "Section par défaut"
                      : "Renommer cette sous-légende"
                  }
                />
                <div className="h-px flex-1 bg-slate-300" />

                {!isDefaultSection ? (
                  <button
                    type="button"
                    onClick={() => removeLegendSection(section)}
                    className="rounded-md px-1.5 py-1 text-[10px] text-slate-400 hover:bg-white hover:text-rose-600"
                    title="Supprimer cette sous-légende"
                  >
                    ×
                  </button>
                ) : null}
              </div>

              {sectionEntries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-4 text-center text-[11px] text-slate-400">
                  Dépose un groupe ici.
                </div>
              ) : (
                <div className="space-y-2">
                  {sectionEntries.map((entry) => {
                    const visibilityState = getEntryVisibilityState(
                      entry,
                      hiddenLegendFeatureIds,
                    );
                    const isHidden = visibilityState === "hidden";
                    const isPartial = visibilityState === "partial";

                    return (
                      <div
                        key={entry.dedupeKey}
                        draggable
                        onDragStart={(event) => handleGroupDragStart(event, entry)}
                        onDragEnd={() => setDraggedGroupKey(null)}
                        onDragOver={handleDragOver}
                        onDrop={(event) => handleDropOnGroup(event, entry)}
                        className={[
                          "cursor-grab rounded-lg border p-2 active:cursor-grabbing",
                          draggedGroupKey === entry.dedupeKey
                            ? "border-indigo-300 bg-indigo-50 opacity-70"
                            : isHidden
                              ? "border-slate-200 bg-white opacity-60"
                              : isPartial
                                ? "border-amber-200 bg-amber-50"
                                : "border-slate-200 bg-white",
                        ].join(" ")}
                      >
                        <div className="mb-2 grid gap-1">
                          <label className="grid gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                            Nom affiché dans la légende
                            <input
                              type="text"
                              value={entry.label}
                              onChange={(event) =>
                                setLegendGroupLabel(
                                  entry.dedupeKey,
                                  event.target.value,
                                )
                              }
                              onPointerDown={(event) => event.stopPropagation()}
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium normal-case tracking-normal text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                              title="Renommer ce groupe de légende"
                            />
                          </label>

                          {entry.count > 1 ? (
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                                {entry.count} objets regroupés
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleEntryVisibility(entry)}
                            className={[
                              "rounded-md border px-2 py-1 text-xs",
                              isHidden
                                ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                                : isPartial
                                  ? "border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                            ].join(" ")}
                          >
                            {getEntryVisibilityLabel(visibilityState)}
                          </button>

                          <button
                            type="button"
                            onClick={() => moveEntry(entry, "up")}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                            aria-label="Monter dans la légende"
                          >
                            ↑
                          </button>

                          <button
                            type="button"
                            onClick={() => moveEntry(entry, "down")}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                            aria-label="Descendre dans la légende"
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] text-slate-500">
        Masquer ici retire seulement l’entrée de la légende d’export. Les objets restent visibles sur la carte.
      </p>
    </div>
  );
}
