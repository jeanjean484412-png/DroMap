"use client";

import { useEffect, useState } from "react";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";

const GEOMAN_CURSOR_REPLAY_EVENT = "dromap:replay-map-pointer";

function replayMapPointerSoon() {
  window.setTimeout(() => {
    window.dispatchEvent(new Event(GEOMAN_CURSOR_REPLAY_EVENT));
  }, 0);
  window.setTimeout(() => {
    window.dispatchEvent(new Event(GEOMAN_CURSOR_REPLAY_EVENT));
  }, 120);
}

export function UndoRedoControls() {
  const [hasMounted, setHasMounted] = useState(false);

  const past = useEditorTestFeaturesStore((state) => state.past);
  const future = useEditorTestFeaturesStore((state) => state.future);
  const undo = useEditorTestFeaturesStore((state) => state.undo);
  const redo = useEditorTestFeaturesStore((state) => state.redo);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const handleUndo = () => {
    undo();
    replayMapPointerSoon();
  };

  const handleRedo = () => {
    redo();
    replayMapPointerSoon();
  };

  return (
    <div className="flex justify-center gap-2">
      <button
        type="button"
        data-dromap-tool-control="true"
        onClick={handleUndo}
        disabled={!canUndo}
        title="Annuler"
        aria-label="Annuler"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-lg font-bold text-neutral-800 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-35"
      >
        ↶
      </button>

      <button
        type="button"
        data-dromap-tool-control="true"
        onClick={handleRedo}
        disabled={!canRedo}
        title="Rétablir"
        aria-label="Rétablir"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-lg font-bold text-neutral-800 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-35"
      >
        ↷
      </button>
    </div>
  );
}