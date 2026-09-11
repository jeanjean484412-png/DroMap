"use client";

import { useEffect, type ReactNode } from "react";

import { useEditorGraphicZoomStore } from "@/stores/editor-graphic-zoom";
import { useEditorModeStore } from "@/stores/editor-mode";

type GraphicZoomViewportProps = {
  children: ReactNode;
};

export default function GraphicZoomViewport({ children }: GraphicZoomViewportProps) {
  const currentMode = useEditorModeStore((s) => s.currentMode);
  const graphicZoomEnabled = useEditorGraphicZoomStore(
    (s) => s.graphicZoomEnabled,
  );
  const graphicZoomLevel = useEditorGraphicZoomStore(
    (s) => s.graphicZoomLevel,
  );

  useEffect(() => {
    if (currentMode !== "edit") {
      const store = useEditorGraphicZoomStore.getState();
      store.resetGraphicZoom();
      store.setGraphicZoomEnabled(false);
    }
  }, [currentMode]);

  const applyTransform = currentMode === "edit" && graphicZoomEnabled;

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="h-full w-full"
        style={
          applyTransform
            ? {
                transform: `scale(${graphicZoomLevel})`,
                transformOrigin: "50% 50%",
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
