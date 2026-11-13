"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import {
  LegendPanel,
  type LegendPanelMode,
} from "@/editor/legend-panel";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useEditorSelectionStore } from "@/stores/editor-selection";

type InspectorTab = "selected" | "all" | "labels";

const TABS: Array<{ id: InspectorTab; label: string; compact: string }> = [
  { id: "selected", label: "Sélection", compact: "Sélection" },
  { id: "all", label: "Objets", compact: "Objets" },
  { id: "labels", label: "Étiquettes", compact: "Étiquettes" },
];

const INSPECTOR_ICONS = {
  selected: <path d="M9 4H5a1 1 0 0 0-1 1v4m11-5h4a1 1 0 0 1 1 1v4M4 15v4a1 1 0 0 0 1 1h4m3-8 3.5 8 1.3-3.2 3.2-1.3Z" />,
  all: <><rect x="4" y="5" width="4" height="4" rx="1" /><circle cx="6" cy="16" r="2" /><path d="M12 7h8m-8 9h8" /></>,
  labels: <><path d="M20 12.4 12.4 20a1.5 1.5 0 0 1-2.1 0l-6.9-6.9A1.5 1.5 0 0 1 3 12V5a2 2 0 0 1 2-2h7c.4 0 .8.2 1.1.5l6.9 6.8a1.5 1.5 0 0 1 0 2.1Z" /><circle cx="8" cy="8" r="1.3" /></>,
  expand: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16m-4-11-3 3 3 3" /></>,
  collapse: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16m-7-11 3 3-3 3" /></>,
};

function InspectorIcon({ name }: { name: keyof typeof INSPECTOR_ICONS }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {INSPECTOR_ICONS[name]}
    </svg>
  );
}

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

  const setCollapsedFromEffect = useEffectEvent(setCollapsed);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 1023px), (max-height: 600px) and (max-width: 1366px)");
    if (mobileQuery.matches) setCollapsedFromEffect(true);

    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) setCollapsedFromEffect(true);
    };
    mobileQuery.addEventListener("change", handleViewportChange);
    return () => mobileQuery.removeEventListener("change", handleViewportChange);
  }, []);
  const features = useEditorFeaturesStore((state) => state.features);
  const selectedFeatureIds = useEditorSelectionStore(
    (state) => state.selectedFeatureIds,
  );
  const selectedFeatureId = useEditorSelectionStore(
    (state) => state.selectedFeatureId,
  );
  const selectedFromObjectsPanel = useEditorSelectionStore(
    (state) => state.selectedFromObjectsPanel,
  );
  const mapSelectionRequestId = useEditorSelectionStore(
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
      setCollapsedFromEffect(false);
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
          <InspectorIcon name="expand" />
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
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${activeTab === tab.id ? "bg-teal-50 text-teal-700 hover:bg-teal-100" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
              title={tab.label}
              aria-label={tab.label}
            >
              <InspectorIcon name={tab.id} />
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
      className="relative z-30 flex h-full w-[min(25rem,calc(100vw-5rem))] min-w-0 max-w-none shrink-0 flex-col border-l border-slate-200 bg-white sm:w-[25rem] sm:min-w-[22rem] sm:max-w-[31vw]"
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
          <InspectorIcon name="collapse" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
<LegendPanel variant="embedded" mode={legendMode} />
      </div>
    </aside>
  );
}
