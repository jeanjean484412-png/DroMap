"use client";

import dynamic from "next/dynamic";

import FeaturesDebug from "./features-debug";
import GraphicZoomControls from "./graphic-zoom-controls";
import GraphicZoomViewport from "./graphic-zoom-viewport";
import ModeToolbar from "./mode-toolbar";
import WorkspaceDebug from "./workspace-debug";

const TestMap = dynamic(() => import("./test-map"), {
  ssr: false,
  loading: () => (
    <p className="flex h-full items-center justify-center text-sm text-neutral-600">
      Chargement de la carte…
    </p>
  ),
});

export default function EditorTestPage() {
  return (
    <main className="relative h-screen w-full overflow-hidden">
      <GraphicZoomViewport>
        <TestMap />
      </GraphicZoomViewport>
      <FeaturesDebug />
      <WorkspaceDebug />
      <GraphicZoomControls />
      <ModeToolbar />
    </main>
  );
}
