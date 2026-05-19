"use client";

import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

export default function WorkspaceActions() {
  const currentMode = useEditorTestModeStore((s) => s.currentMode);
  const workspaceBounds = useEditorTestWorkspaceStore((s) => s.workspaceBounds);
  const validateWorkspaceZone = useEditorTestWorkspaceStore(
    (s) => s.validateWorkspaceZone,
  );
  const modifyWorkspaceZone = useEditorTestWorkspaceStore(
    (s) => s.modifyWorkspaceZone,
  );

  if (currentMode === "workspace-select") {
    return (
      <button
        type="button"
        disabled={!workspaceBounds}
        onClick={validateWorkspaceZone}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-md transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
      >
        Valider la zone
      </button>
    );
  }

  if (currentMode === "edit" && workspaceBounds) {
    return (
      <button
        type="button"
        onClick={modifyWorkspaceZone}
        className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-md transition-colors hover:bg-neutral-50"
      >
        Modifier la zone
      </button>
    );
  }

  return null;
}
