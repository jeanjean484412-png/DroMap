"use client";

import { useEffect, useState } from "react";

import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

export function ExportControls() {
  const [hasMounted, setHasMounted] = useState(false);

  const openExportPanel = useEditorTestExportStore(
    (state) => state.openExportPanel,
  );
  const openImportPanel = useEditorTestExportStore(
    (state) => state.openImportPanel,
  );

  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  const canExport = workspaceBounds !== null;

  return (
    <section className="absolute left-[8.5rem] top-4 z-[1000] flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-2 py-2 text-sm shadow-lg backdrop-blur">
      <div className="hidden min-w-0 sm:block">
        <div className="text-xs font-semibold leading-none text-slate-900">
          Fichiers
        </div>
        <div className="mt-0.5 max-w-40 truncate text-[10px] leading-none text-slate-500">
          {canExport ? "Export disponible" : "Import disponible"}
        </div>
      </div>

      <button
        type="button"
        onClick={openExportPanel}
        disabled={!canExport}
        title={
          canExport
            ? "Exporter la carte"
            : "Sélectionne et valide d’abord une zone de travail."
        }
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Exporter
      </button>

      <button
        type="button"
        onClick={openImportPanel}
        title="Importer un projet DroMap JSON ou un calque GeoJSON"
        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100"
      >
        Importer
      </button>
    </section>
  );
}
