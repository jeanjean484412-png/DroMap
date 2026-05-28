"use client";

import dynamic from "next/dynamic";

import { DebugPanel } from "./debug-panel";
import { ExportControls } from "./export-controls";
import { ExportSetupPanel } from "./export-setup-panel";
import GraphicZoomViewport from "./graphic-zoom-viewport";
import { LegendPanel } from "./legend-panel";
import ModeToolbar from "./mode-toolbar";
import { SelectedFeatureActions } from "./selected-feature-actions";

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
      <style>{`
        .leaflet-control-zoom,
        .leaflet-pm-toolbar,
        .leaflet-pm-draw,
        .leaflet-pm-edit,
        .leaflet-pm-options {
          display: none !important;
        }
      `}</style>

      <GraphicZoomViewport>
        <TestMap />
      </GraphicZoomViewport>

      <ModeToolbar />
      <SelectedFeatureActions />
      <ExportControls />
      <LegendPanel />
      <ExportSetupPanel />
      <DebugPanel />
    </main>
  );
}