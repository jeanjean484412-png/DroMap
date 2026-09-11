import { create } from "zustand";

export type EditorWorldSnapshotStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

type EditorWorldSnapshotState = {
  basemapId: string | null;
  status: EditorWorldSnapshotStatus;
  errorMessage: string | null;
  setWorldSnapshotStatus: (input: {
    basemapId: string;
    status: EditorWorldSnapshotStatus;
    errorMessage?: string | null;
  }) => void;
  resetWorldSnapshotStatus: () => void;
};

export const useEditorWorldSnapshotStore =
  create<EditorWorldSnapshotState>((set) => ({
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
