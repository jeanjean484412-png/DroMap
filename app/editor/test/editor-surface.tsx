"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { ActiveToolOutsideWorkspaceClickGuard } from "./active-tool-outside-workspace-click-guard";
import { BasemapControls } from "./basemap-controls";
import { EditorKeyboardShortcuts } from "./editor-keyboard-shortcuts";
import { ExportControls } from "./export-controls";
import { CreditsPanel } from "./credits-panel";
import { DroMapAiPanel } from "./dromap-ai-panel";
import { CustomMarkersBootstrap } from "./custom-markers-bootstrap";
import { ExportSetupPanel } from "./export-setup-panel";
import GraphicZoomViewport from "./graphic-zoom-viewport";
import { LayersPanel } from "./layers-panel";
import { LegendPanel } from "./legend-panel";
import ModeToolbar from "./mode-toolbar";
import { PlaceSearchControl } from "./place-search-control";
import { WorkspaceActions } from "./workspace-actions";
import { RestrictedAiTrigger } from "@/components/dromap-product/restricted-ai-trigger";
import { useDromapProductRuntime } from "@/components/dromap-product/product-runtime";
import { DromapEditorInspector } from "@/components/dromap-product/editor-inspector";

const TestMap = dynamic<{ onPresentationReady?: () => void }>(
  () => import("./test-map"),
  {
  ssr: false,
  loading: () => (
    <p className="flex h-full items-center justify-center text-sm text-neutral-600">
      Chargement de la carte…
    </p>
  ),
  },
);

type EditorSurfaceProps = {
  variant?: "legacy" | "product";
  onMapPresentationReady?: () => void;
};

function EditorMapCore({
  product = false,
  onMapPresentationReady,
}: {
  product?: boolean;
  onMapPresentationReady?: () => void;
} = {}) {
  const runtime = useDromapProductRuntime();

  return (
    <>
      <EditorKeyboardShortcuts />
      <CustomMarkersBootstrap />
      <ActiveToolOutsideWorkspaceClickGuard />

      <GraphicZoomViewport>
        <TestMap onPresentationReady={onMapPresentationReady} />
      </GraphicZoomViewport>

      <PlaceSearchControl />
      {runtime.enabled && !runtime.capabilities.canUseAi ? (
        <RestrictedAiTrigger />
      ) : (
        <DroMapAiPanel />
      )}
      {!product ? <BasemapControls /> : null}
      <ExportControls showExportButton={!product} showImportButton={!product} />
      {!product ? <CreditsPanel /> : null}
      <ExportSetupPanel />
    </>
  );
}

function SharedEditorStyles() {
  return (
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

      [data-dromap-product-map="true"] .dromap-export-page {
        z-index: 4000 !important;
      }

      [data-dromap-product-right-controls="true"] > * {
        pointer-events: auto;
      }
    `}</style>
  );
}

export function EditorSurface({
  variant = "legacy",
  onMapPresentationReady,
}: EditorSurfaceProps = {}) {
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);

  if (variant === "product") {
    const inspectorWidth = inspectorCollapsed
      ? "3rem"
      : "clamp(22rem, 31vw, 25rem)";

    return (
      <div className="relative flex h-full w-full min-w-0 overflow-hidden bg-slate-100">
        <SharedEditorStyles />

        <ModeToolbar variant="embedded" showUtilityControls={false} />

        <section
          data-dromap-product-map="true"
          data-dromap-tour="map"
          data-dromap-inspector-collapsed={inspectorCollapsed ? "true" : "false"}
          className="relative min-w-0 flex-1 overflow-hidden bg-slate-200"
        >
          <EditorMapCore
            product
            onMapPresentationReady={onMapPresentationReady}
          />

          {/*
            La carte garde toujours 100 % de la largeur disponible. L'inspecteur
            se superpose par-dessus au lieu de retirer une bande au conteneur
            Leaflet. Ainsi les tuiles sont chargées jusque sous l'inspecteur et
            sont déjà présentes dès qu'il est replié.

            Les contrôles flottants de droite restent, eux, placés dans la zone
            visible de la carte : leur conteneur s'arrête juste avant
            l'inspecteur, qu'il soit ouvert ou replié.
          */}
          <div
            data-dromap-product-right-controls="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-[1000]"
            style={{ right: inspectorWidth }}
          >
            <BasemapControls />
            <LayersPanel />
            <CreditsPanel />
          </div>

          <div className="absolute bottom-4 left-4 z-[1050] rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur">
            <WorkspaceActions />
          </div>
        </section>

        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-[2400]"
          style={{ width: inspectorWidth }}
        >
          <div className="pointer-events-auto h-full w-full">
            <DromapEditorInspector onCollapsedChange={setInspectorCollapsed} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <SharedEditorStyles />
      <EditorMapCore />
      <ModeToolbar />
      <LegendPanel />
      <LayersPanel />
    </div>
  );
}
