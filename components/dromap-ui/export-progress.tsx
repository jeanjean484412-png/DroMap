import type { VisualExportProgress } from "@/editor/export-download";

export function ExportProgress({ percent, label }: VisualExportProgress) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-950">Export de la carte</h3>
      <div className="my-2 flex items-center justify-between gap-3 text-xs text-slate-600">
        <span role="status">{label}</span>
        <span className="shrink-0 tabular-nums" aria-hidden="true">{percent} %</span>
      </div>
      <progress
        className="block h-2 w-full accent-teal-600"
        aria-label="Progression de l’export"
        value={percent}
        max={100}
      />
    </div>
  );
}
