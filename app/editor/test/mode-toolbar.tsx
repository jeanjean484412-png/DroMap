"use client";

import {
  EDITOR_MODE_LABELS,
  type EditorMode,
} from "@/lib/dromap/editor-mode";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";

const MODES: EditorMode[] = ["navigation", "workspace-select", "edit"];

export default function ModeToolbar() {
  const currentMode = useEditorTestModeStore((s) => s.currentMode);
  const setCurrentMode = useEditorTestModeStore((s) => s.setCurrentMode);

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 flex-col items-center gap-2">
      <div
        className="flex rounded-lg border border-neutral-200 bg-white/95 p-1 shadow-md backdrop-blur-sm"
        role="toolbar"
        aria-label="Modes de l’éditeur"
      >
        {MODES.map((mode) => {
          const isActive = currentMode === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={isActive}
              onClick={() => setCurrentMode(mode)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-700 hover:bg-neutral-100"
              }`}
            >
              {EDITOR_MODE_LABELS[mode]}
            </button>
          );
        })}
      </div>
      <p className="rounded-md border border-neutral-200 bg-white/95 px-3 py-1 text-xs text-neutral-700 shadow-sm backdrop-blur-sm">
        Mode actif :{" "}
        <strong className="font-semibold text-neutral-900">
          {EDITOR_MODE_LABELS[currentMode]}
        </strong>
        {currentMode === "workspace-select" && (
          <span className="text-neutral-500"> — sélection de zone à venir</span>
        )}
        {currentMode === "edit" && (
          <span className="text-neutral-500"> — édition des entités à venir</span>
        )}
      </p>
    </div>
  );
}
