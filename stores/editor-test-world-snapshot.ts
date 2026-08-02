import { create } from "zustand";

export type EditorTestWorldSnapshotStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

type EditorTestWorldSnapshotState = {
  basemapId: string | null;
  status: EditorTestWorldSnapshotStatus;
  errorMessage: string | null;
  setWorldSnapshotStatus: (input: {
    basemapId: string;
    status: EditorTestWorldSnapshotStatus;
    errorMessage?: string | null;
  }) => void;
  resetWorldSnapshotStatus: () => void;
};

export const useEditorTestWorldSnapshotStore =
  create<EditorTestWorldSnapshotState>((set) => ({
    basemapId: null,
    status: "idle",
    errorMessage: null,

    setWorldSnapshotStatus: ({ basemapId, status, errorMessage = null }) =>
      set({
        basemapId,
        status,
        errorMessage,
      }),

    resetWorldSnapshotStatus: () =>
      set({
        basemapId: null,
        status: "idle",
        errorMessage: null,
      }),
  }));
