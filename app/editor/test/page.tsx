"use client";

import dynamic from "next/dynamic";

import { BasemapControls } from "./basemap-controls";
import { DebugPanel } from "./debug-panel";
import { EditorKeyboardShortcuts } from "./editor-keyboard-shortcuts";
import { ExportControls } from "./export-controls";
import { CreditsPanel } from "./credits-panel";
import { ExportSetupPanel } from "./export-setup-panel";
import GraphicZoomViewport from "./graphic-zoom-viewport";
import { LayersPanel } from "./layers-panel";
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

        button:not(:disabled),
        [role="button"],
        input[type="button"]:not(:disabled),
        input[type="submit"]:not(:disabled),
        input[type="reset"]:not(:disabled),
        input[type="checkbox"]:not(:disabled),
        input[type="radio"]:not(:disabled),
        input[type="color"]:not(:disabled),
        select:not(:disabled),
        summary,
        a[href] {
          cursor: pointer;
        }

        button:disabled,
        input:disabled,
        select:disabled,
        textarea:disabled,
        [aria-disabled="true"] {
          cursor: not-allowed;
        }

        input[type="text"],
        input[type="number"],
        input[type="search"],
        input[type="email"],
        input[type="url"],
        textarea,
        [contenteditable="true"] {
          cursor: text;
        }

        .leaflet-container.dromap-editor-map,
        .leaflet-container.dromap-editor-map.leaflet-grab,
        .leaflet-container.dromap-editor-map .leaflet-pane,
        .leaflet-container.dromap-editor-map .leaflet-tile-container,
        .leaflet-container.dromap-editor-map .leaflet-tile,
        .leaflet-container.dromap-editor-map .leaflet-overlay-pane,
        .leaflet-container.dromap-editor-map .leaflet-marker-pane,
        .leaflet-container.dromap-editor-map .leaflet-shadow-pane,
        .leaflet-container.dromap-editor-map .leaflet-tooltip-pane,
        .leaflet-container.dromap-editor-map .leaflet-popup-pane,
        .leaflet-container.dromap-editor-map .leaflet-interactive {
          cursor: default !important;
        }

        .leaflet-container.dromap-editor-map .dromap-selectable-layer,
        .leaflet-container.dromap-editor-map .dromap-line-selection-hitbox,
        .leaflet-container.dromap-editor-map .dromap-marker-icon {
          cursor: pointer !important;
        }

        .leaflet-container.dromap-editor-map .dromap-text-icon {
          cursor: default !important;
          pointer-events: none !important;
        }

        .leaflet-container.dromap-editor-map .dromap-text-icon [data-dromap-text-click-target="true"] {
          cursor: pointer !important;
          pointer-events: auto !important;
        }

        .leaflet-container.dromap-editor-map.leaflet-dragging,
        .leaflet-container.dromap-editor-map.leaflet-dragging * {
          cursor: grabbing !important;
        }
      `}</style>

      <EditorKeyboardShortcuts />

      <GraphicZoomViewport>
        <TestMap />
      </GraphicZoomViewport>

      <ModeToolbar />
      <BasemapControls />
      <SelectedFeatureActions />
      <ExportControls />
      <CreditsPanel />
      <LegendPanel />
      <LayersPanel />
      <ExportSetupPanel />
      <DebugPanel />
    </main>
  );
}
