"use client";

import { create } from "zustand";

import {
  normalizeDromapMapView,
  type DromapMapView,
} from "@/lib/dromap/map-view";

type EditorTestMapViewState = {
  currentView: DromapMapView | null;
  pendingRestoreView: DromapMapView | null;
  setCurrentView: (view: DromapMapView | null) => void;
  requestRestoreView: (view: DromapMapView | null) => void;
  consumePendingRestoreView: () => DromapMapView | null;
  clear: () => void;
};

export const useEditorTestMapViewStore = create<EditorTestMapViewState>(
  (set, get) => ({
    currentView: null,
    pendingRestoreView: null,

    setCurrentView: (view) => {
      set({ currentView: normalizeDromapMapView(view) });
    },

    requestRestoreView: (view) => {
      set({ pendingRestoreView: normalizeDromapMapView(view) });
    },

    consumePendingRestoreView: () => {
      const pending = get().pendingRestoreView;
      set({ pendingRestoreView: null });
      return pending;
    },

    clear: () => {
      set({ currentView: null, pendingRestoreView: null });
    },
  }),
);
