import { create } from "zustand";

import {
  clampGraphicZoomLevel,
  GRAPHIC_ZOOM_DEFAULT,
  GRAPHIC_ZOOM_STEP,
} from "@/lib/dromap/graphic-zoom";

type EditorTestGraphicZoomState = {
  graphicZoomLevel: number;
  graphicZoomEnabled: boolean;
  setGraphicZoomLevel: (level: number) => void;
  zoomInGraphic: () => void;
  zoomOutGraphic: () => void;
  resetGraphicZoom: () => void;
  setGraphicZoomEnabled: (enabled: boolean) => void;
};

export const useEditorTestGraphicZoomStore = create<EditorTestGraphicZoomState>(
  (set) => ({
    graphicZoomLevel: GRAPHIC_ZOOM_DEFAULT,
    graphicZoomEnabled: false,

    setGraphicZoomLevel: (level) =>
      set({ graphicZoomLevel: clampGraphicZoomLevel(level) }),

    zoomInGraphic: () =>
      set((state) => ({
        graphicZoomLevel: clampGraphicZoomLevel(
          state.graphicZoomLevel + GRAPHIC_ZOOM_STEP,
        ),
      })),

    zoomOutGraphic: () =>
      set((state) => ({
        graphicZoomLevel: clampGraphicZoomLevel(
          state.graphicZoomLevel - GRAPHIC_ZOOM_STEP,
        ),
      })),

    resetGraphicZoom: () => set({ graphicZoomLevel: GRAPHIC_ZOOM_DEFAULT }),

    setGraphicZoomEnabled: (enabled) => set({ graphicZoomEnabled: enabled }),
  }),
);
