import { create } from "zustand";

import {
  DEFAULT_DROMAP_BASEMAP_ID,
  isDromapBasemapId,
  type DromapBasemapBounds,
  type DromapBasemapId,
} from "@/lib/dromap/basemap";

type SetBasemapOptions = {
  fit?: boolean;
};

type EditorTestBasemapState = {
  basemapId: DromapBasemapId;
  basemapFitRequestId: number;
  activeBasemapBounds: DromapBasemapBounds | null;
  showCountryNeighborContext: boolean;
  setBasemapId: (
    basemapId: DromapBasemapId,
    options?: SetBasemapOptions,
  ) => void;
  setBasemapIdFromUnknown: (basemapId: unknown) => void;
  resetBasemapId: () => void;
  setActiveBasemapBounds: (bounds: DromapBasemapBounds | null) => void;
  setShowCountryNeighborContext: (show: boolean) => void;
};

export const useEditorTestBasemapStore = create<EditorTestBasemapState>(
  (set) => ({
    basemapId: DEFAULT_DROMAP_BASEMAP_ID,
    basemapFitRequestId: 0,
    activeBasemapBounds: null,
    showCountryNeighborContext: true,

    setBasemapId: (basemapId, options) => {
      set((state) => ({
        basemapId,
        activeBasemapBounds: null,
        basemapFitRequestId: options?.fit
          ? state.basemapFitRequestId + 1
          : state.basemapFitRequestId,
      }));
    },

    setBasemapIdFromUnknown: (basemapId) => {
      if (!isDromapBasemapId(basemapId)) {
        return;
      }

      set({ basemapId, activeBasemapBounds: null });
    },

    resetBasemapId: () => {
      set({
        basemapId: DEFAULT_DROMAP_BASEMAP_ID,
        activeBasemapBounds: null,
        showCountryNeighborContext: true,
      });
    },

    setActiveBasemapBounds: (bounds) => {
      set({ activeBasemapBounds: bounds });
    },

    setShowCountryNeighborContext: (show) => {
      set({ showCountryNeighborContext: show });
    },
  }),
);
