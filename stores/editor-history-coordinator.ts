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

type EditorHistoryParticipantAccessors = {
  capture: () => unknown;
  restore: (snapshot: unknown) => void;
};

export type EditorHistoryParticipantsSnapshot = Record<string, unknown>;

let workspaceAccessors: WorkspaceHistoryAccessors | null = null;
let commitEditorHistoryCallback: (() => void) | null = null;
let isRestoringHistory = false;
let historySuspensionDepth = 0;
let activeHistorySessionKey: string | null = null;
let historyRecordingEnabled = false;
const historyParticipants = new Map<string, EditorHistoryParticipantAccessors>();


export function beginEditorHistorySession(sessionKey: string) {
  activeHistorySessionKey = sessionKey;
  historyRecordingEnabled = false;
}

export function completeEditorHistorySession(sessionKey: string) {
  if (activeHistorySessionKey === sessionKey) {
    historyRecordingEnabled = true;
  }
}

export function endEditorHistorySession(sessionKey?: string) {
  if (sessionKey && activeHistorySessionKey !== sessionKey) {
    return;
  }
  activeHistorySessionKey = null;
  historyRecordingEnabled = false;
}

export function isEditorHistoryRecordingEnabled() {
  // L’éditeur autonome, y compris via son ancienne URL compatible, n’a pas de cycle de projet produit :
  // hors session explicite, l’historique doit donc rester utilisable comme avant.
  // Dans un projet produit, beginEditorHistorySession() suspend seulement le
  // chargement initial puis completeEditorHistorySession() réactive l’enregistrement.
  return activeHistorySessionKey === null ? true : historyRecordingEnabled;
}

export function registerWorkspaceHistoryAccessors(
  accessors: WorkspaceHistoryAccessors,
) {
  workspaceAccessors = accessors;
}

export function registerEditorHistoryCommit(callback: () => void) {
  commitEditorHistoryCallback = callback;
}

export function registerEditorHistoryParticipant(
  key: string,
  accessors: EditorHistoryParticipantAccessors,
) {
  historyParticipants.set(key, accessors);
}

export function captureWorkspaceHistorySnapshot(): EditorWorkspaceHistorySnapshot | null {
  return workspaceAccessors?.capture() ?? null;
}

export function captureEditorHistoryParticipants(): EditorHistoryParticipantsSnapshot {
  const snapshot: EditorHistoryParticipantsSnapshot = {};
  historyParticipants.forEach((accessors, key) => {
    snapshot[key] = accessors.capture();
  });
  return snapshot;
}

export function runWithoutEditorHistory<T>(callback: () => T): T {
  historySuspensionDepth += 1;
  try {
    return callback();
  } finally {
    historySuspensionDepth = Math.max(0, historySuspensionDepth - 1);
  }
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

export function restoreEditorHistoryParticipants(
  snapshot: EditorHistoryParticipantsSnapshot | null | undefined,
) {
  if (!snapshot) {
    return;
  }

  isRestoringHistory = true;
  try {
    for (const [key, value] of Object.entries(snapshot)) {
      historyParticipants.get(key)?.restore(value);
    }
  } finally {
    isRestoringHistory = false;
  }
}

export function commitEditorHistoryBeforeWorkspaceChange() {
  if (
    !isEditorHistoryRecordingEnabled() ||
    isRestoringHistory ||
    historySuspensionDepth > 0
  ) {
    return;
  }

  commitEditorHistoryCallback?.();
}
