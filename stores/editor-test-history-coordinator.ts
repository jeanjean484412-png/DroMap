import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";

export type EditorWorkspaceHistorySnapshot = {
  workspaceBounds: WorkspaceBounds | null;
  pendingFitToWorkspace: boolean;
  workspaceBasemapZoom: number | null;
  workspaceBasemapBaseZoom: number | null;
  currentMode: "workspace-select" | "edit";
};

type WorkspaceHistoryAccessors = {
  capture: () => EditorWorkspaceHistorySnapshot;
  restore: (snapshot: EditorWorkspaceHistorySnapshot) => void;
};

let workspaceAccessors: WorkspaceHistoryAccessors | null = null;
let commitEditorHistoryCallback: (() => void) | null = null;
let isRestoringHistory = false;

export function registerWorkspaceHistoryAccessors(
  accessors: WorkspaceHistoryAccessors,
) {
  workspaceAccessors = accessors;
}

export function registerEditorHistoryCommit(callback: () => void) {
  commitEditorHistoryCallback = callback;
}

export function captureWorkspaceHistorySnapshot(): EditorWorkspaceHistorySnapshot | null {
  return workspaceAccessors?.capture() ?? null;
}

export function restoreWorkspaceHistorySnapshot(
  snapshot: EditorWorkspaceHistorySnapshot | null,
) {
  if (!snapshot || !workspaceAccessors) {
    return;
  }

  isRestoringHistory = true;
  try {
    workspaceAccessors.restore(snapshot);
  } finally {
    isRestoringHistory = false;
  }
}

export function commitEditorHistoryBeforeWorkspaceChange() {
  if (isRestoringHistory) {
    return;
  }

  commitEditorHistoryCallback?.();
}
