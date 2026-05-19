"use client";

import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

export default function WorkspaceDebug() {
  const workspaceBounds = useEditorTestWorkspaceStore((s) => s.workspaceBounds);
  const clearWorkspaceBounds = useEditorTestWorkspaceStore(
    (s) => s.clearWorkspaceBounds,
  );

  return (
    <aside className="pointer-events-auto absolute right-3 top-[calc(40vh+1.5rem)] z-[1000] w-72 rounded-md border border-neutral-200 bg-white/95 p-3 text-xs shadow-md backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong className="text-neutral-800">Zone de travail</strong>
        {workspaceBounds && (
          <button
            type="button"
            onClick={clearWorkspaceBounds}
            className="rounded border border-neutral-300 px-2 py-0.5 text-[10px] text-neutral-600 hover:bg-neutral-50"
          >
            Effacer
          </button>
        )}
      </div>
      <div className="text-neutral-700">
        {workspaceBounds ? (
          <>
            <span className="font-medium text-emerald-700">Définie</span>
            <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-neutral-600">
              {JSON.stringify(workspaceBounds, null, 2)}
            </pre>
          </>
        ) : (
          <span className="text-neutral-500">Non définie</span>
        )}
      </div>
    </aside>
  );
}
