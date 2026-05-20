"use client";

import { graphicZoomToPercent } from "@/lib/dromap/graphic-zoom";
import { useEditorTestGraphicZoomStore } from "@/stores/editor-test-graphic-zoom";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";

export default function GraphicZoomControls() {
  const currentMode = useEditorTestModeStore((s) => s.currentMode);
  const graphicZoomLevel = useEditorTestGraphicZoomStore(
    (s) => s.graphicZoomLevel,
  );
  const graphicZoomEnabled = useEditorTestGraphicZoomStore(
    (s) => s.graphicZoomEnabled,
  );
  const zoomInGraphic = useEditorTestGraphicZoomStore((s) => s.zoomInGraphic);
  const zoomOutGraphic = useEditorTestGraphicZoomStore((s) => s.zoomOutGraphic);
  const resetGraphicZoom = useEditorTestGraphicZoomStore(
    (s) => s.resetGraphicZoom,
  );
  const setGraphicZoomEnabled = useEditorTestGraphicZoomStore(
    (s) => s.setGraphicZoomEnabled,
  );

  if (currentMode !== "edit") {
    return null;
  }

  const percent = graphicZoomToPercent(graphicZoomLevel);

  return (
    <aside
      className="pointer-events-auto absolute bottom-28 left-3 z-[1000] flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50/95 p-3 text-xs shadow-md backdrop-blur-sm"
      aria-label="Zoom graphique (prototype)"
    >
      <label className="flex cursor-pointer items-center gap-2 text-neutral-800">
        <input
          type="checkbox"
          checked={graphicZoomEnabled}
          onChange={(e) => setGraphicZoomEnabled(e.target.checked)}
          className="rounded border-neutral-300"
        />
        <span className="font-medium">Zoom graphique (prototype)</span>
      </label>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={zoomOutGraphic}
          disabled={!graphicZoomEnabled}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Zoom arrière"
        >
          Zoom −
        </button>
        <span
          className="min-w-[3.5rem] text-center font-mono text-sm font-semibold text-neutral-900"
          aria-live="polite"
        >
          {percent}%
        </span>
        <button
          type="button"
          onClick={zoomInGraphic}
          disabled={!graphicZoomEnabled}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Zoom avant"
        >
          Zoom +
        </button>
        <button
          type="button"
          onClick={resetGraphicZoom}
          disabled={!graphicZoomEnabled}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Réinitialiser
        </button>
      </div>

      {graphicZoomEnabled && (
        <p className="text-[10px] leading-snug text-amber-900/80">
          Prototype CSS : peut décaler les clics Geoman. Désactiver en cas de
          problème.
        </p>
      )}
    </aside>
  );
}
