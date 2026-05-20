"use client";

import { useEffect, type ReactNode } from "react";

import { useEditorTestGraphicZoomStore } from "@/stores/editor-test-graphic-zoom";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";

type GraphicZoomViewportProps = {
  children: ReactNode;
};

export default function GraphicZoomViewport({ children }: GraphicZoomViewportProps) {
  const currentMode = useEditorTestModeStore((s) => s.currentMode);
  const graphicZoomEnabled = useEditorTestGraphicZoomStore(
    (s) => s.graphicZoomEnabled,
  );
  const graphicZoomLevel = useEditorTestGraphicZoomStore(
    (s) => s.graphicZoomLevel,
  );

  useEffect(() => {
    if (currentMode !== "edit") {
      const store = useEditorTestGraphicZoomStore.getState();
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
