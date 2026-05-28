"use client";

import { useEffect, useState } from "react";

import { validateWorkspaceBoundsRatio } from "@/lib/dromap/workspace-validation";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

export function WorkspaceActions() {
  const [hasMounted, setHasMounted] = useState(false);

  const currentMode = useEditorTestModeStore((state) => state.currentMode);

  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );

  const validateWorkspaceZone = useEditorTestWorkspaceStore(
    (state) => state.validateWorkspaceZone,
  );

  const modifyWorkspaceZone = useEditorTestWorkspaceStore(
    (state) => state.modifyWorkspaceZone,
  );

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          title="Zone"
          aria-label="Zone"
          aria-disabled="true"
          tabIndex={-1}
          className="flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-lg font-bold text-neutral-400 shadow-sm"
        >
          ✓
        </button>
      </div>
    );
  }

  const validation = validateWorkspaceBoundsRatio(workspaceBounds);
  const canValidateWorkspace = workspaceBounds !== null && validation.isValid;

  if (currentMode === "workspace-select") {
    return (
      <div className="relative flex justify-center">
        <button
          type="button"
          onClick={canValidateWorkspace ? validateWorkspaceZone : undefined}
          title="Valider la zone"
          aria-label="Valider la zone"
          aria-disabled={!canValidateWorkspace}
          className={[
            "flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-bold shadow-sm transition",
            canValidateWorkspace
              ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500"
              : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400",
          ].join(" ")}
        >
          ✓
        </button>

        {workspaceBounds && !validation.isValid ? (
          <div className="absolute left-full top-0 z-[1100] ml-3 w-64 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 shadow-xl">
            {validation.message}
          </div>
        ) : null}
      </div>
    );
  }

  if (currentMode === "edit" && workspaceBounds) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          onClick={modifyWorkspaceZone}
          title="Modifier la zone"
          aria-label="Modifier la zone"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-500 bg-orange-500 text-lg font-bold text-white shadow-sm transition hover:bg-orange-400"
        >
          ▣
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <button
        type="button"
        title="Zone"
        aria-label="Zone"
        aria-disabled="true"
        tabIndex={-1}
        className="flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-lg font-bold text-neutral-400 shadow-sm"
      >
        ✓
      </button>
    </div>
  );
}