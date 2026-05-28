"use client";

import { useState } from "react";

import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

type DebugTab = "summary" | "features" | "workspace";

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DebugTab>("summary");

  const features = useEditorTestFeaturesStore((state) => state.features);
  const clearFeatures = useEditorTestFeaturesStore(
    (state) => state.clearFeatures,
  );
  const pastCount = useEditorTestFeaturesStore((state) => state.past.length);
  const futureCount = useEditorTestFeaturesStore((state) => state.future.length);

  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const pendingFitToWorkspace = useEditorTestWorkspaceStore(
    (state) => state.pendingFitToWorkspace,
  );
  const clearWorkspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.clearWorkspaceBounds,
  );

  function handleClearFeatures() {
    const confirmed = window.confirm(
      "Vider toutes les features du prototype ? Cette action est réservée au debug.",
    );

    if (!confirmed) {
      return;
    }

    clearFeatures();
  }

  function handleClearWorkspace() {
    const confirmed = window.confirm(
      "Effacer la zone de travail ? Les objets dessinés ne seront pas supprimés.",
    );

    if (!confirmed) {
      return;
    }

    clearWorkspaceBounds();
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="absolute right-1 top z-[1000] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-700 shadow-lg backdrop-blur-sm hover:bg-slate-50"
      >
        Debug
      </button>
    );
  }

  return (
    <aside className="absolute right-4 top z-[1000] flex max-h-[70vh] w-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 text-xs shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
        <div>
          <div className="font-semibold text-slate-900">Debug prototype</div>
          <div className="text-[10px] text-slate-500">
            Infos techniques /editor/test
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-100"
        >
          Fermer
        </button>
      </div>

      <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={() => setActiveTab("summary")}
          className={[
            "px-2 py-2 text-[11px] font-medium",
            activeTab === "summary"
              ? "bg-white text-slate-950"
              : "text-slate-500 hover:bg-slate-100",
          ].join(" ")}
        >
          Résumé
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("features")}
          className={[
            "px-2 py-2 text-[11px] font-medium",
            activeTab === "features"
              ? "bg-white text-slate-950"
              : "text-slate-500 hover:bg-slate-100",
          ].join(" ")}
        >
          Features
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("workspace")}
          className={[
            "px-2 py-2 text-[11px] font-medium",
            activeTab === "workspace"
              ? "bg-white text-slate-950"
              : "text-slate-500 hover:bg-slate-100",
          ].join(" ")}
        >
          Zone
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {activeTab === "summary" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-100 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Features
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {features.length}
                </div>
              </div>

              <div className="rounded-xl bg-slate-100 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Zone
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-950">
                  {workspaceBounds ? "Définie" : "Non définie"}
                </div>
              </div>

              <div className="rounded-xl bg-slate-100 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Undo
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {pastCount}
                </div>
              </div>

              <div className="rounded-xl bg-slate-100 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Redo
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-950">
                  {futureCount}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 font-medium text-slate-900">
                Actions debug
              </div>

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={handleClearFeatures}
                  disabled={features.length === 0}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Vider les features
                </button>

                <button
                  type="button"
                  onClick={handleClearWorkspace}
                  disabled={!workspaceBounds}
                  className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-left text-xs text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Effacer la zone de travail
                </button>
              </div>

              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                Ces actions sont réservées au prototype. Elles seront retirées
                ou déplacées plus tard.
              </p>
            </div>
          </div>
        ) : null}

        {activeTab === "features" ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <strong className="text-slate-800">
                Features ({features.length})
              </strong>

              <button
                type="button"
                onClick={handleClearFeatures}
                disabled={features.length === 0}
                className="rounded border border-red-200 px-2 py-0.5 text-[10px] text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Vider
              </button>
            </div>

            <pre className="max-h-[48vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 font-mono text-[10px] leading-relaxed text-slate-100">
              {features.length === 0
                ? "Aucune feature"
                : formatJson(features)}
            </pre>
          </div>
        ) : null}

        {activeTab === "workspace" ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <strong className="text-slate-800">Zone de travail</strong>

              <button
                type="button"
                onClick={handleClearWorkspace}
                disabled={!workspaceBounds}
                className="rounded border border-orange-200 px-2 py-0.5 text-[10px] text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Effacer
              </button>
            </div>

            <div className="mb-2 rounded-xl bg-slate-100 p-3 text-slate-700">
              <div>
                État :{" "}
                <span className="font-medium">
                  {workspaceBounds ? "Définie" : "Non définie"}
                </span>
              </div>

              <div>
                Fit en attente :{" "}
                <span className="font-medium">
                  {pendingFitToWorkspace ? "Oui" : "Non"}
                </span>
              </div>
            </div>

            <pre className="max-h-[44vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 font-mono text-[10px] leading-relaxed text-slate-100">
              {workspaceBounds
                ? formatJson(workspaceBounds)
                : "Aucune zone de travail"}
            </pre>
          </div>
        ) : null}
      </div>
    </aside>
  );
}