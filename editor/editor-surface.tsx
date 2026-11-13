"use client";

import dynamic from "next/dynamic";
import { DROMAP_BETA } from "@/lib/dromap/release-mode";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { ActiveToolOutsideWorkspaceClickGuard } from "./active-tool-outside-workspace-click-guard";
import { BasemapControls } from "./basemap-controls";
import { EditorKeyboardShortcuts } from "./editor-keyboard-shortcuts";
import { ExportControls } from "./export-controls";
import { MapDockButton } from "./map-dock-button";
import { bringFloatingPanelToFront } from "./floating-panel-z-index";
import { CustomMarkersBootstrap } from "./custom-markers-bootstrap";
import { useEditorExportStore } from "@/stores/editor-export";
import GraphicZoomViewport from "./graphic-zoom-viewport";
import { LayersPanel } from "./layers-panel";
import { LegendPanel } from "./legend-panel";
import ModeToolbar from "./mode-toolbar";
import { PlaceSearchControl } from "./place-search-control";
import { PlaceSearchNavigationContext, type PlaceSearchNavigation } from "./place-search-navigation";
import { RoadImportController } from "./road-import-controller";
import { WorkspaceActions } from "./workspace-actions";
import { RestrictedAiTrigger } from "@/components/dromap-product/restricted-ai-trigger";
import { useDromapProductRuntime } from "@/components/dromap-product/product-runtime";
import { DromapEditorInspector } from "@/components/dromap-product/editor-inspector";
import mobileStyles from "@/components/dromap-product/mobile-workspace.module.css";

const EditorMap = dynamic<{ onPresentationReady?: () => void }>(
  () => import("./editor-map"),
  {
  ssr: false,
  loading: () => (
    <p className="flex h-full items-center justify-center text-sm text-neutral-600">
      Chargement de la carte…
    </p>
  ),
  },
);

const ExportSetupPanel = dynamic(() => import("./export-setup-panel").then((module) => module.ExportSetupPanel), { ssr: false });

function EditorExportPanels() {
  const open = useEditorExportStore((state) => state.isExportPanelOpen || state.isImportPanelOpen);
  const [visited, setVisited] = useState(false);
  useEffect(() => {
    if (open) setVisited(true);
  }, [open]);
  return open || visited ? <ExportSetupPanel /> : null;
}

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
  return (
    <>
      <EditorKeyboardShortcuts />
      <CustomMarkersBootstrap />
      <ActiveToolOutsideWorkspaceClickGuard />

      <GraphicZoomViewport>
        <EditorMap onPresentationReady={onMapPresentationReady} />
      </GraphicZoomViewport>

      {!product ? (
        <>
          <div className="pointer-events-none absolute left-4 top-[4.5rem] z-[1300] lg:left-[43rem] lg:top-4">
            <SearchAndAssistantControls />
          </div>
          <BasemapControls />
          <ExportControls />
        </>
      ) : null}
      <EditorExportPanels />
      <RoadImportController />
    </>
  );
}

const DroMapAiPanel = dynamic(() => import("./dromap-ai-panel").then((module) => module.DroMapAiPanel), { ssr: false });

function AssistantLauncher() {
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [startOpen, setStartOpen] = useState(false);

  useEffect(() => {
    const close = () => setStartOpen(false);
    window.addEventListener("dromap:open-place-search", close);
    return () => window.removeEventListener("dromap:open-place-search", close);
  }, []);

  if (openedAt !== null) {
    return <DroMapAiPanel docked initiallyOpen={startOpen} initialZIndex={openedAt} />;
  }
  return (
    <div className="pointer-events-none text-sm relative z-[1300]">
      <MapDockButton
        icon={<span className="text-lg font-black leading-none">IA</span>}
        onClick={() => {
          window.dispatchEvent(new Event("dromap:open-ai-assistant"));
          setOpenedAt(bringFloatingPanelToFront());
          setStartOpen(true);
        }}
        title="Ouvrir l’assistant IA DroMap"
        className="border-teal-200 text-teal-800 hover:border-teal-400"
        aria-label="Ouvrir l’assistant IA DroMap"
      >
        Assistant IA
      </MapDockButton>
    </div>
  );
}

function SearchAndAssistantControls({ product = false }: { product?: boolean } = {}) {
  const runtime = useDromapProductRuntime();

  return (
    <div className="flex items-start gap-2">
      <PlaceSearchControl product={product} />
      {DROMAP_BETA || (runtime.enabled && !runtime.capabilities.canUseAi) ? (
        <RestrictedAiTrigger docked />
      ) : (
        <AssistantLauncher />
      )}
    </div>
  );
}

function ProductTopDock() {
  return (
    <>
      <ExportControls
        showExportButton={false}
        showImportButton={false}
        showBuildingsButton={false}
        docked
      />
      <SearchAndAssistantControls product />
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

      .leaflet-container.dromap-editor-map .dromap-text-icon .dromap-text-frame {
        cursor: pointer !important;
        pointer-events: auto !important;
      }


      .leaflet-container.dromap-editor-map.leaflet-dragging,
      .leaflet-container.dromap-editor-map.leaflet-dragging * {
        cursor: grabbing !important;
      }

      .leaflet-container.dromap-editor-map .dromap-workspace-handle--north-west,
      .leaflet-container.dromap-editor-map .dromap-workspace-handle--south-east,
      .leaflet-container.dromap-editor-map.leaflet-dragging .dromap-workspace-handle--north-west,
      .leaflet-container.dromap-editor-map.leaflet-dragging .dromap-workspace-handle--south-east {
        cursor: nwse-resize !important;
      }
      .leaflet-container.dromap-editor-map .dromap-workspace-handle--north-east,
      .leaflet-container.dromap-editor-map .dromap-workspace-handle--south-west,
      .leaflet-container.dromap-editor-map.leaflet-dragging .dromap-workspace-handle--north-east,
      .leaflet-container.dromap-editor-map.leaflet-dragging .dromap-workspace-handle--south-west {
        cursor: nesw-resize !important;
      }
      .leaflet-container.dromap-editor-map .dromap-workspace-handle--north,
      .leaflet-container.dromap-editor-map .dromap-workspace-handle--south,
      .leaflet-container.dromap-editor-map.leaflet-dragging .dromap-workspace-handle--north,
      .leaflet-container.dromap-editor-map.leaflet-dragging .dromap-workspace-handle--south {
        cursor: ns-resize !important;
      }
      .leaflet-container.dromap-editor-map .dromap-workspace-handle--east,
      .leaflet-container.dromap-editor-map .dromap-workspace-handle--west,
      .leaflet-container.dromap-editor-map.leaflet-dragging .dromap-workspace-handle--east,
      .leaflet-container.dromap-editor-map.leaflet-dragging .dromap-workspace-handle--west {
        cursor: ew-resize !important;
      }

      .leaflet-container.dromap-editor-map [data-dromap-resize-handle] {
        cursor: var(--dromap-resize-cursor) !important;
      }

      [data-dromap-product-map="true"] .dromap-export-page {
        z-index: 4000 !important;
      }

      [data-dromap-product-right-controls="true"] > * {
        pointer-events: auto;
      }

      /*
       * Leaflet place son attribution contre le bord droit de la carte.
       * Dans le shell produit, l'inspecteur se superpose à la carte : on
       * décale donc uniquement les contrôles Leaflet bas-droite de la largeur
       * réelle de l'inspecteur, ouvert ou replié. La carte et ses tuiles
       * conservent, elles, 100 % de leur largeur.
       */
      [data-dromap-product-map="true"] .leaflet-bottom.leaflet-right {
        right: calc(var(--dromap-inspector-width, 0px) + 0.5rem) !important;
        transition: right 160ms ease;
      }

      [data-dromap-product-map="true"] .leaflet-control-attribution {
        max-width: min(70vw, 56rem);
        white-space: normal;
        line-height: 1.2;
        text-align: right;
      }
    `}</style>
  );
}

export function EditorSurface(props: EditorSurfaceProps = {}) {
  const navigation = useRef<PlaceSearchNavigation | null>(null);

  return (
    <PlaceSearchNavigationContext.Provider value={navigation}>
      <EditorSurfaceContent {...props} />
    </PlaceSearchNavigationContext.Provider>
  );
}

function EditorSurfaceContent({
  variant = "legacy",
  onMapPresentationReady,
}: EditorSurfaceProps = {}) {
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);

  if (variant === "product") {
    const inspectorWidth = inspectorCollapsed
      ? "3rem"
      : "clamp(22rem, 31vw, 25rem)";

    return (
      <div className={`${mobileStyles.editor} relative flex h-full w-full min-w-0 overflow-hidden bg-slate-100`}>
        <SharedEditorStyles />

        <ModeToolbar variant="embedded" showUtilityControls={false} />

        <section
          data-dromap-product-map="true"
          data-dromap-tour="map"
          data-dromap-inspector-collapsed={inspectorCollapsed ? "true" : "false"}
          className={`${mobileStyles.editorMap} relative min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-200`}
          style={{ "--dromap-inspector-width": inspectorWidth } as CSSProperties}
        >
          <div
            data-dromap-tour="map-visible-area"
            className="pointer-events-none absolute inset-y-0 left-0"
            style={{ right: inspectorWidth }}
            aria-hidden="true"
          />

          <EditorMapCore
            product
            onMapPresentationReady={onMapPresentationReady}
          />

          <div
            data-dromap-product-top-dock="true"
            className="pointer-events-none absolute left-4 top-4 z-[1000] flex flex-wrap items-start gap-2 pr-4"
            style={{ right: inspectorWidth }}
          >
            <ProductTopDock />
          </div>

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
          </div>

          <div className={`${mobileStyles.workspaceActions} absolute bottom-4 left-4 z-[1050] max-w-[calc(100%-2rem)] rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur`}>
            <WorkspaceActions />
          </div>
        </section>

        <div
          data-dromap-inspector-overlay
          data-collapsed={inspectorCollapsed}
          className={`${mobileStyles.inspector} pointer-events-none absolute inset-y-0 right-0 z-[2400]`}
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
      <EditorMapCore onMapPresentationReady={onMapPresentationReady} />
      <ModeToolbar />
      <div className="absolute bottom-4 left-4 z-[1050] max-w-[calc(100%-2rem)] rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
        <WorkspaceActions />
      </div>
      <LegendPanel />
      <LayersPanel />
    </div>
  );
}
