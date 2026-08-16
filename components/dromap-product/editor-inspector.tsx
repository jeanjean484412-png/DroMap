"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  LegendPanel,
  type LegendPanelMode,
} from "@/app/editor/test/legend-panel";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";

type InspectorTab = "selected" | "all" | "labels";

const TABS: Array<{ id: InspectorTab; label: string; compact: string }> = [
  { id: "selected", label: "Sélection", compact: "Sélection" },
  { id: "all", label: "Objets", compact: "Objets" },
  { id: "labels", label: "Étiquettes", compact: "Étiquettes" },
];

type DromapEditorInspectorProps = {
  onCollapsedChange?: (collapsed: boolean) => void;
};

export function DromapEditorInspector({
  onCollapsedChange,
}: DromapEditorInspectorProps = {}) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("selected");
  const [collapsed, setCollapsedState] = useState(false);

  function setCollapsed(nextCollapsed: boolean) {
    setCollapsedState(nextCollapsed);
    onCollapsedChange?.(nextCollapsed);
  }
  const features = useEditorTestFeaturesStore((state) => state.features);
  const selectedFeatureIds = useEditorTestSelectionStore(
    (state) => state.selectedFeatureIds,
  );
  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );
  const selectedFromObjectsPanel = useEditorTestSelectionStore(
    (state) => state.selectedFromObjectsPanel,
  );
  const mapSelectionRequestId = useEditorTestSelectionStore(
    (state) => state.mapSelectionRequestId,
  );
  const lastHandledMapSelectionRequestId = useRef(mapSelectionRequestId);

  useEffect(() => {
    if (mapSelectionRequestId <= lastHandledMapSelectionRequestId.current) {
      return;
    }

    lastHandledMapSelectionRequestId.current = mapSelectionRequestId;

    if (selectedFromObjectsPanel) {
      return;
    }

    const hasSelection =
      Boolean(selectedFeatureId) || selectedFeatureIds.length > 0;

    if (!hasSelection) {
      return;
    }

    setActiveTab("selected");
    if (collapsed) {
      setCollapsed(false);
    }
  }, [
    collapsed,
    mapSelectionRequestId,
    selectedFeatureId,
    selectedFeatureIds.length,
    selectedFromObjectsPanel,
  ]);

  const selectedCount = useMemo(() => {
    if (selectedFeatureIds.length > 0) return selectedFeatureIds.length;
    return selectedFeatureId ? 1 : 0;
  }, [selectedFeatureId, selectedFeatureIds]);

  if (collapsed) {
    return (
      <aside data-dromap-product-inspector="true" data-collapsed="true" className="relative z-30 flex h-full w-12 shrink-0 flex-col border-l border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="m-1 flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-700 transition hover:bg-slate-50"
          title="Déployer l’inspecteur"
          aria-label="Déployer l’inspecteur"
        >
          ‹
        </button>
        <div className="mt-2 flex flex-1 flex-col items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setCollapsed(false);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[10px] font-black text-slate-600 transition hover:bg-slate-100"
              title={tab.label}
            >
              {tab.id === "selected"
                ? "◉"
                : tab.id === "all"
                  ? "◆"
                  : "Aa"}
            </button>
          ))}
        </div>
      </aside>
    );
  }

  const legendMode: LegendPanelMode =
    activeTab === "selected"
      ? "selected"
      : activeTab === "labels"
        ? "labels"
        : "all";

  return (
    <aside
      data-dromap-tour="inspector"
      data-dromap-product-inspector="true"
      data-collapsed="false"
      className="relative z-30 flex h-full w-[25rem] min-w-[22rem] max-w-[31vw] shrink-0 flex-col border-l border-slate-200 bg-white"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-2">
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1" role="tablist" aria-label="Inspecteur de la carte">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            const badge =
              tab.id === "selected"
                ? selectedCount
                : tab.id === "all"
                  ? features.length
                  : null;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "min-w-0 rounded-lg px-2 py-2 text-[11px] font-black transition",
                  active
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white hover:text-slate-950",
                ].join(" ")}
              >
                <span className="block whitespace-nowrap">{tab.compact}</span>
                {badge !== null ? (
                  <span
                    className={[
                      "mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[9px]",
                      active ? "bg-white/15 text-white" : "bg-slate-200 text-slate-600",
                    ].join(" ")}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg font-black text-slate-500 transition hover:bg-white hover:text-slate-950"
          title="Replier l’inspecteur"
          aria-label="Replier l’inspecteur"
        >
          ›
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
<LegendPanel variant="embedded" mode={legendMode} />
      </div>
    </aside>
  );
}
