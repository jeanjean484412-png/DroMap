"use client";

import { useEffect, useState } from "react";

import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

export function ExportControls() {
  const [hasMounted, setHasMounted] = useState(false);

  const openExportPanel = useEditorTestExportStore(
    (state) => state.openExportPanel,
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
    <section className="absolute right-4 top-[235px] z-[1000] w-64 rounded-xl border border-slate-200 bg-white/95 p-3 text-sm shadow-lg">
      <div className="mb-2 font-semibold text-slate-900">Export</div>

      <button
        type="button"
        onClick={openExportPanel}
        disabled={!canExport}
        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Exporter la carte
      </button>

      {!canExport ? (
        <p className="mt-2 text-xs text-slate-500">
          Sélectionne et valide d’abord une zone de travail.
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          Prépare un export propre de la zone de travail.
        </p>
      )}
    </section>
  );
}