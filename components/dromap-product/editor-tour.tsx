"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { DEFAULT_DROMAP_LAYER_ID, useEditorLayersStore } from "@/stores/editor-layers";
import { useEditorExportStore } from "@/stores/editor-export";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useEditorSelectionStore } from "@/stores/editor-selection";
import {
  type EditorActiveTool,
  useEditorToolStore,
} from "@/stores/editor-tool";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";

const TOUR_STORAGE_KEY = "dromap-p1-editor-tour-completed-v1";
const TOUR_AUTO_PRESENTED_KEY = "dromap-p1-editor-tour-auto-presented-v1";
let autoTourPresentedInMemory = false;

type TourTargetQuery = {
  selector?: string;
  text?: string;
  ariaLabel?: string;
  title?: string;
};

type TourToolSettings = "marker" | "line" | "zone" | "text";
type TourImportExplanationStage = "panel" | "choice" | "selection" | "name-proposals";

type TourDetail = {
  label: string;
  explanation: string;
  target: TourTargetQuery;
  additionalTargets?: TourTargetQuery[];
  ghost?:
    | "render"
    | "add-data-demo"
    | "inspector"
    | "cartographic-imports"
    | "buildings-import-demo"
    | "routes-import-demo";
  openToolSettings?: TourToolSettings;
  explanationDetails?: TourDetail[];
  importExplanationStage?: TourImportExplanationStage;
};

type TourStep = {
  selector: string;
  fallbackSelector?: string;
  title: string;
  titleContent?: ReactNode;
  description: string;
  details: TourDetail[];
};

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-dromap-tour="tools"]',
    title: "Choisir un outil",
    description:
      "Ouvre Marqueur, Traits, Zones ou Texte, puis choisis un symbole ou un type dans la bibliothèque. Ses paramètres s’ouvrent et l’outil apparaît dans les raccourcis au-dessus.",
    details: [],
  },
  {
    selector: '[data-dromap-tool-shortcuts="true"]',
    fallbackSelector: '[data-dromap-tour="tools"]',
    title: "Retrouver ses raccourcis",
    description:
      "Clique sur un raccourci pour activer ou désactiver l’outil ; ses réglages sont juste à côté. Le projet en garde jusqu’à quatre après fermeture. Une fois les places remplies, le moins récemment utilisé est remplacé. Ctrl + Z ne les efface pas.",
    details: [],
  },
  {
    selector: '[data-dromap-tour="map-visible-area"]',
    title: "Créer sur la carte",
    description:
      "Clique sur la carte pour placer l’outil choisi. Fond de carte et Calque permettent de préparer l’affichage.",
    details: [],
  },
  {
    selector: '[data-dromap-tour="inspector"]',
    title: "Modifier un objet",
    description:
      "Clique sur un objet déjà posé : l’inspecteur permet de changer son nom, son style et ses étiquettes.",
    details: [],
  },
  {
    selector: '[data-dromap-tour="render"]',
    title: "Finaliser la carte",
    description:
      "Ouvre Légende & Rendu final pour vérifier la carte, ajuster sa légende et la télécharger. Le bouton ? permet de relancer ce tutoriel.",
    details: [],
  },
];

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: string;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

function isElementVisible(element: HTMLElement) {
  // Les contrôles de l’interface réelle situés sous le voile du tutoriel ne doivent
  // pas être pris pour cible. En revanche, les copies visuelles utilisées par les
  // explications détaillées vivent volontairement dans l’overlay : elles doivent
  // rester mesurables afin que le cadre et la bulle suivent exactement le bouton
  // expliqué.
  const tourOverlay = element.closest('[data-dromap-editor-tour-overlay="true"]');
  const tutorialGhost = element.closest('[data-dromap-tour-ghost="true"]');
  if (tourOverlay && !tutorialGhost) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function findTourTarget(query: TourTargetQuery): HTMLElement | null {
  if (query.selector) {
    const direct = document.querySelector<HTMLElement>(query.selector);
    return direct && isElementVisible(direct) ? direct : null;
  }

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      "button, input, select, textarea, summary, [role='button'], [role='tab']",
    ),
  ).filter(isElementVisible);

  const wantedText = normalizeText(query.text);
  const wantedAria = normalizeText(query.ariaLabel);
  const wantedTitle = normalizeText(query.title);

  return (
    candidates.find((element) => {
      const text = normalizeText(element.textContent);
      const aria = normalizeText(element.getAttribute("aria-label"));
      const title = normalizeText(element.getAttribute("title"));

      if (wantedText && !text.includes(wantedText)) return false;
      if (wantedAria && !aria.includes(wantedAria)) return false;
      if (wantedTitle && !title.includes(wantedTitle)) return false;
      return true;
    }) ?? null
  );
}

/**
 * Les fenêtres factices du tutoriel peuvent être plus hautes que l’espace visible.
 * Lorsqu’une sous-explication cible un contrôle situé plus bas, on fait défiler
 * uniquement la zone interne de cette fenêtre afin que le contrôle soit visible
 * avant de calculer son encadrement. Le reste de la page ne bouge pas.
 */
function revealTargetInsideTourGhost(target: HTMLElement) {
  const scroller = target.closest<HTMLElement>(
    '[data-dromap-tour-ghost-scroll="true"]',
  );
  if (!scroller) return false;

  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const padding = 18;
  let delta = 0;

  if (targetRect.top < scrollerRect.top + padding) {
    delta = targetRect.top - (scrollerRect.top + padding);
  } else if (targetRect.bottom > scrollerRect.bottom - padding) {
    delta = targetRect.bottom - (scrollerRect.bottom - padding);
  }

  if (Math.abs(delta) < 1) return false;

  scroller.scrollTop += delta;
  return true;
}

/** Le cadre d’un élément reprend exactement les dimensions renvoyées par le navigateur.
 * Pour un groupe de commandes, le cadre englobe uniquement leurs bornes réelles. */
function measureTargets(targets: HTMLElement[]): TargetRect {
  const rects = targets.map((target) => target.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    borderRadius:
      targets.length === 1
        ? window.getComputedStyle(targets[0]).borderRadius || "0px"
        : "12px",
  };
}

function getOpenToolSettingsType(): TourToolSettings | null {
  const panel = document.querySelector<HTMLElement>(
    '[data-dromap-tool-settings-panel="true"]:not([data-dromap-imports-panel="true"])',
  );
  if (!panel || !isElementVisible(panel)) return null;

  const heading = normalizeText(panel.querySelector("strong")?.textContent);
  if (heading.includes("marqueur")) return "marker";
  if (heading.includes("traits")) return "line";
  if (heading.includes("zones")) return "zone";
  if (heading.includes("texte")) return "text";
  return null;
}

function getToolSettingsButtonQuery(tool: TourToolSettings): TourTargetQuery {
  return { selector: `[data-dromap-tool-picker="${tool}"]` };
}

function closeVisibleToolSettingsPanel() {
  const panel = document.querySelector<HTMLElement>(
    '[data-dromap-tool-settings-panel="true"]:not([data-dromap-imports-panel="true"])',
  );
  if (!panel || !isElementVisible(panel)) return;

  const closeButton = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => normalizeText(button.textContent) === "fermer",
  );
  closeButton?.click();
}

type SelectionSimulationSnapshot = {
  selectedFeatureId: string | null;
  selectedFeatureIds: string[];
  multiSelectionEnabled: boolean;
  selectedFromObjectsPanel: boolean;
  mapSelectionRequestId: number;
};

type ExportSimulationSnapshot = {
  legendTitle: string;
  legendPosition: ReturnType<typeof useEditorExportStore.getState>["legendPosition"];
  hiddenLegendFeatureIds: string[];
};

type InspectorUiSnapshot = {
  collapsed: boolean;
  activeTabLabel: string | null;
};

function setTourSimulationFlag(active: boolean) {
  if (typeof document === "undefined") return;

  if (active) {
    document.documentElement.dataset.dromapTourSimulation = "true";
  } else {
    delete document.documentElement.dataset.dromapTourSimulation;
  }
}

function getInspectorActiveTabLabel() {
  const activeTab = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-dromap-product-inspector="true"] [role="tab"][aria-selected="true"]',
    ),
  ).find(isElementVisible);

  return activeTab ? normalizeText(activeTab.textContent) : null;
}

function clickInspectorTab(label: "sélection" | "objets" | "étiquettes") {
  const tab = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-dromap-product-inspector="true"] [role="tab"]',
    ),
  ).find(
    (element) =>
      isElementVisible(element) &&
      normalizeText(element.textContent).includes(label),
  );

  if (tab instanceof HTMLButtonElement) {
    tab.click();
  }
}

function createTutorialMarkerFeature(id: string): DroMapFeature {
  const workspaceState = useEditorWorkspaceStore.getState();
  const layersState = useEditorLayersStore.getState();
  const bounds = workspaceState.workspaceBounds;
  const lat = bounds
    ? (bounds.southWest.lat + bounds.northEast.lat) / 2
    : 48.8566;
  const lng = bounds
    ? (bounds.southWest.lng + bounds.northEast.lng) / 2
    : 2.3522;
  const referenceZoom =
    workspaceState.workspaceBasemapBaseZoom ??
    workspaceState.workspaceBasemapZoom ??
    7;
  const visibleLayer =
    layersState.layers.find((layer) => layer.visible && layer.opacity > 0) ??
    layersState.layers.find((layer) => layer.id === layersState.activeLayerId) ??
    layersState.layers[0];
  const layerId = visibleLayer?.id ?? layersState.activeLayerId ?? DEFAULT_DROMAP_LAYER_ID;

  return {
    type: "Feature",
    id,
    geometry: {
      type: "Point",
      coordinates: [lng, lat],
    },
    properties: {
      type: "marker",
      label: "Marqueur d’exemple",
      legendLabel: "Marqueur d’exemple",
      symbol: { type: "builtin", id: "circle" },
      style: {
        color: "#111827",
        weight: 7,
        opacity: 1,
        markerSize: 30,
        markerFilled: true,
        visualReferenceZoom: referenceZoom,
      },
      ...(layerId ? { layerId } : {}),
      meta: { version: 1 },
    },
  };
}


function AddDataTourGhost() {
  return (
    <div
      data-dromap-tour="add-data-dialog"
      data-dromap-tour-ghost="true"
      className="pointer-events-none fixed left-1/2 top-[8%] z-[1] w-[min(48rem,calc(100vw-4rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg"
      aria-hidden="true"
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h3 className="text-lg font-black text-slate-950">Ajouter / Importer</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Ajoute des données au projet courant sans modifier son fond ni sa zone de travail.
          </p>
        </div>
        <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          Fermer
        </div>
      </header>

      <div
        data-dromap-tour-ghost-scroll="true"
        className="max-h-[66vh] overflow-y-auto bg-slate-100 p-5"
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
            {[
              ["1", "Choisir la source"],
              ["2", "Vérifier le contenu"],
              ["3", "Ajouter à la carte"],
            ].map(([number, label]) => (
              <div key={number} className="rounded-xl bg-slate-50 px-2 py-2">
                <div className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[11px] font-black text-white">
                  {number}
                </div>
                <div className="mt-1 text-[11px] font-bold text-slate-700">{label}</div>
              </div>
            ))}
          </div>

          <div
            data-dromap-tour="add-data-project"
            className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-slate-950">Ajouter un Projet DroMap</h4>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Ajoute le contenu d’un autre projet à la carte actuelle après vérification.
                </p>
              </div>
              <div data-dromap-tour="add-data-project-button" className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
                Choisir un Projet DroMap
              </div>
            </div>
          </div>

          <div
            data-dromap-tour="add-data-geojson"
            className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-black text-slate-950">Calque GeoJSON</h4>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Importe un fichier GeoJSON et choisis la précision adaptée à son volume.
                </p>
                <div className="mt-3 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                  Précision à l’import : Originale
                </div>
              </div>
              <div data-dromap-tour="add-data-geojson-button" className="max-w-56 shrink-0 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-center text-sm font-bold leading-tight text-sky-800">
                Importer GeoJSON depuis mes fichiers
              </div>
            </div>
          </div>

          <div
            data-dromap-tour="add-data-saved-layers"
            className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-slate-950">Mes calques enregistrés</h4>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Réutilise un calque DroMap ou GeoJSON déjà enregistré.
                </p>
              </div>
              <div data-dromap-tour="add-data-saved-layers-button" className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-bold text-teal-800">
                Ouvrir mes calques
              </div>
            </div>
          </div>

          <div
            data-dromap-tour="add-data-library"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-slate-950">Bibliothèque GeoJSON DroMap</h4>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Recherche des données prêtes à ajouter à la carte.
                </p>
              </div>
              <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">Rechercher…</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BuildingsImportTourGhost({
  stage,
}: {
  stage: TourImportExplanationStage;
}) {
  if (stage === "choice") {
    return (
      <div data-dromap-tour-ghost="true" className="pointer-events-none fixed left-1/2 top-1/2 z-[1] w-[min(49rem,calc(100vw-4rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg">
        <header className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold text-slate-600">152 bâtiments trouvés dans la zone de travail.</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Quels bâtiments veux-tu ajouter ?</h3>
          <p className="mt-2 text-xs font-bold text-teal-700">Source : Overture Maps — Bâtiments</p>
        </header>
        <div className="grid grid-cols-2 gap-5 p-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h4 className="text-base font-black text-slate-950">Tous les bâtiments</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ajoute l’ensemble dans un seul calque GeoJSON léger. C’est le choix le plus fluide pour afficher et styliser toute la zone.
            </p>
            <button
              type="button"
              data-dromap-tour="buildings-import-choice-all"
              className="mt-4 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-black text-white"
            >
              Ajouter le calque complet
            </button>
          </div>
          <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5">
            <h4 className="text-base font-black text-slate-950">Sélectionner certains bâtiments</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ouvre la zone en plein écran et conserve uniquement les bâtiments utiles comme objets DroMap éditables individuellement.
            </p>
            <button
              type="button"
              data-dromap-tour="buildings-import-choice-select"
              className="mt-4 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-slate-950"
            >
              Ouvrir la sélection
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "selection" || stage === "name-proposals") {
    const showNameProposals = stage === "name-proposals";
    return (
      <div data-dromap-tour-ghost="true" className="pointer-events-none fixed inset-0 z-[1] flex flex-col bg-slate-100">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-950">Sélectionner les bâtiments à importer</h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Clique sur les bâtiments utiles. Les éléments orange seront ajoutés comme objets DroMap éditables individuellement.
            </p>
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-lg text-slate-500">×</div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-100">
          <div
            data-dromap-tour="buildings-import-selection-count"
            className="absolute left-4 top-4 z-[2] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-lg"
          >
            <div className="font-black text-slate-950">Zone de travail</div>
            <div className="mt-0.5">152 bâtiments disponibles</div>
          </div>

          <div
            data-dromap-tour="buildings-import-selection-map"
            className="absolute inset-0"
          >
            <svg viewBox="0 0 1200 620" className="h-full w-full" aria-hidden="true">
              <defs>
                <pattern id="tour-building-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#dbe3ec" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="1200" height="620" fill="#f8fafc" />
              <rect width="1200" height="620" fill="url(#tour-building-grid)" />
              <rect x="245" y="50" width="720" height="500" fill="rgba(255,255,255,.2)" stroke="#0f172a" strokeWidth="4" />
              <g fill="#f8fafc" stroke="#64748b" strokeWidth="2">
                <rect x="330" y="145" width="52" height="28" transform="rotate(-12 356 159)" />
                <rect x="410" y="182" width="24" height="42" transform="rotate(8 422 203)" />
                <rect x="510" y="112" width="63" height="26" transform="rotate(10 541 125)" />
                <rect x="612" y="194" width="37" height="31" />
                <rect x="720" y="130" width="66" height="26" transform="rotate(12 753 143)" />
                <rect x="820" y="230" width="30" height="54" />
                <rect x="365" y="340" width="55" height="24" transform="rotate(-8 392 352)" />
                <rect x="550" y="375" width="37" height="64" />
                <rect x="760" y="395" width="76" height="30" transform="rotate(-4 798 410)" />
              </g>
              <g fill="#fdba74" stroke="#c2410c" strokeWidth="3">
                <rect x="455" y="255" width="72" height="36" transform="rotate(-5 491 273)" />
                <rect x="590" y="285" width="48" height="65" />
                <rect x="680" y="250" width="88" height="42" transform="rotate(7 724 271)" />
                <rect x="470" y="440" width="60" height="34" transform="rotate(12 500 457)" />
              </g>
            </svg>
          </div>

          {showNameProposals ? (
            <div
              data-dromap-tour="buildings-import-name-proposals"
              className="absolute right-4 top-4 z-[3] w-[26rem] rounded-2xl border border-teal-200 bg-white p-4 text-xs shadow-lg"
            >
              <p className="font-black text-slate-950">Propositions obtenues par coordonnées</p>
              <p className="mt-1 leading-5 text-slate-600">Vérifie les noms avant de les appliquer.</p>
              <div className="mt-3 space-y-2">
                {[
                  ["Lycée Jean-Moulin", "forte", "18 m", true],
                  ["Gymnase municipal", "moyenne", "31 m", true],
                  ["Maison des associations", "prudente", "54 m", false],
                ].map(([name, confidence, distance, checked]) => (
                  <div key={String(name)} className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <span className={`mt-0.5 grid h-4 w-4 place-items-center rounded border text-[10px] ${checked ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white"}`}>
                      {checked ? "✓" : ""}
                    </span>
                    <span>
                      <span className="block font-black text-slate-900">{name}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">Confiance {confidence} · objet trouvé à {distance}</span>
                    </span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                data-dromap-tour="buildings-import-name-apply"
                className="mt-3 w-full rounded-lg bg-teal-600 px-3 py-2 font-black text-white"
              >
                Appliquer 2 propositions
              </button>
            </div>
          ) : null}

          <div className="absolute bottom-3 right-3 rounded-md bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow">© IGN · Géoplateforme</div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center gap-2">
            <div
              data-dromap-tour="buildings-import-selected-count"
              className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-black text-amber-900"
            >
              4 sélectionnés
            </div>
            <button
              type="button"
              data-dromap-tour="buildings-import-selection-clear"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
            >
              Tout désélectionner
            </button>
            <button
              type="button"
              data-dromap-tour="buildings-import-name-search"
              className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-black text-teal-800"
            >
              Chercher les noms par coordonnées (3)
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-dromap-tour="buildings-import-selection-back"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700"
            >
              Retour
            </button>
            <button
              type="button"
              data-dromap-tour="buildings-import-selection-validate"
              className="rounded-lg bg-amber-500 px-5 py-2 text-xs font-black text-slate-950"
            >
              Valider 4 bâtiments
            </button>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div
      data-dromap-tour="buildings-import-dialog"
      data-dromap-tour-ghost="true"
      className="pointer-events-none fixed left-1/2 top-1/2 z-[1] w-[min(43rem,calc(100vw-4rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg"
      aria-hidden="true"
    >
      <header className="border-b border-slate-200 px-6 py-5">
        <h3 className="text-xl font-black text-slate-950">Bâtiments de la zone</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Source choisie automatiquement selon la zone de travail. Après l’analyse, tu choisis entre un calque complet léger ou une sélection de bâtiments éditables.
        </p>
      </header>
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 p-4">
          <div><span className="block text-xs font-bold uppercase text-slate-500">Largeur</span><strong className="mt-1 block text-lg text-slate-950">224 km</strong></div>
          <div><span className="block text-xs font-bold uppercase text-slate-500">Hauteur</span><strong className="mt-1 block text-lg text-slate-950">179 km</strong></div>
          <div><span className="block text-xs font-bold uppercase text-slate-500">Zone approximative</span><strong className="mt-1 block text-lg text-slate-950">40 021 km²</strong></div>
        </div>
        <div
          data-dromap-tour="buildings-import-limit"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
        >
          <strong>Jusqu’à 15 000 bâtiments par analyse.</strong> Une zone trop vaste ou trop dense est refusée avant le téléchargement pour éviter de ralentir l’éditeur.
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
          En France, DroMap utilise les données bâtiment adaptées au territoire ; ailleurs, l’import s’appuie sur Overture Maps lorsque disponible.
        </div>
      </div>
      <footer className="flex justify-end border-t border-slate-200 px-6 py-4">
        <button
          type="button"
          data-dromap-tour="buildings-import-analyze"
          className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-black text-slate-950"
        >
          Analyser les bâtiments
        </button>
      </footer>
    </div>
  );
}

function RoutesImportTourGhost({
  stage,
}: {
  stage: TourImportExplanationStage;
}) {
  if (stage === "choice") {
    return (
      <div data-dromap-tour-ghost="true" className="pointer-events-none fixed left-1/2 top-1/2 z-[1] w-[min(49rem,calc(100vw-4rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg">
        <header className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold text-slate-600">Les routes correspondant aux catégories choisies ont été trouvées.</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Quelles routes veux-tu ajouter ?</h3>
          <p className="mt-2 text-xs font-bold text-teal-700">Données © OpenStreetMap contributors</p>
        </header>
        <div className="grid grid-cols-2 gap-5 p-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h4 className="text-base font-black text-slate-950">Toutes les routes</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ajoute tous les axes trouvés dans un seul calque GeoJSON, prêt à être affiché et stylisé.
            </p>
            <button
              type="button"
              data-dromap-tour="routes-import-choice-all"
              className="mt-4 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-black text-white"
            >
              Ajouter le calque complet
            </button>
          </div>
          <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-5">
            <h4 className="text-base font-black text-slate-950">Sélectionner certaines routes</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Ouvre la carte de sélection pour ne conserver que les axes utiles. Le résultat reste un seul calque GeoJSON.
            </p>
            <button
              type="button"
              data-dromap-tour="routes-import-choice-select"
              className="mt-4 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-slate-950"
            >
              Ouvrir la sélection
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "selection") {
    return (
      <div data-dromap-tour-ghost="true" className="pointer-events-none fixed inset-0 z-[1] flex flex-col bg-slate-100">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-950">Sélectionner les routes à importer</h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Clique sur une route pour la sélectionner. Les axes orange seront conservés dans le calque GeoJSON.
            </p>
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-lg text-slate-500">×</div>
        </header>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-100">
          <div
            data-dromap-tour="routes-import-selection-count"
            className="absolute left-4 top-4 z-[2] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-lg"
          >
            <div className="font-black text-slate-950">Zone de travail</div>
            <div className="mt-0.5">37 routes disponibles</div>
          </div>
          <div data-dromap-tour="routes-import-selection-map" className="absolute inset-0">
            <svg viewBox="0 0 1200 620" className="h-full w-full" aria-hidden="true">
              <defs>
                <pattern id="tour-route-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#dbe3ec" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="1200" height="620" fill="#f8fafc" />
              <rect width="1200" height="620" fill="url(#tour-route-grid)" />
              <rect x="180" y="58" width="840" height="500" fill="rgba(255,255,255,.15)" stroke="#0f172a" strokeWidth="4" />
              <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M120 505 C270 470 385 350 520 320 S790 285 1080 120" stroke="#cbd5e1" strokeWidth="14" />
                <path d="M120 505 C270 470 385 350 520 320 S790 285 1080 120" stroke="#f59e0b" strokeWidth="7" />
                <path d="M250 90 C340 170 410 245 525 322 S710 450 905 560" stroke="#f59e0b" strokeWidth="6" />
                <path d="M215 540 C350 420 480 410 610 402 S830 405 1030 500" stroke="#475569" strokeWidth="5" />
                <path d="M760 70 C742 180 700 282 628 392 S520 505 460 590" stroke="#475569" strokeWidth="5" />
                <path d="M320 205 C410 205 470 180 548 150" stroke="#64748b" strokeWidth="4" />
              </g>
            </svg>
          </div>
          <div className="absolute bottom-3 right-3 rounded-md bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow">Données © OpenStreetMap contributors · fond © IGN</div>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center gap-2">
            <div
              data-dromap-tour="routes-import-selected-count"
              className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-black text-amber-900"
            >
              12 sélectionnées
            </div>
            <button
              type="button"
              data-dromap-tour="routes-import-selection-all"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
            >
              Tout sélectionner
            </button>
            <button
              type="button"
              data-dromap-tour="routes-import-selection-clear"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
            >
              Tout désélectionner
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-dromap-tour="routes-import-selection-back"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700"
            >
              Retour
            </button>
            <button
              type="button"
              data-dromap-tour="routes-import-selection-validate"
              className="rounded-lg bg-amber-500 px-5 py-2 text-xs font-black text-slate-950"
            >
              Valider 12 routes
            </button>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div
      data-dromap-tour="routes-import-dialog"
      data-dromap-tour-ghost="true"
      className="pointer-events-none fixed left-1/2 top-1/2 z-[1] w-[min(46rem,calc(100vw-4rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg"
      aria-hidden="true"
    >
      <header className="border-b border-slate-200 px-6 py-5">
        <h3 className="text-xl font-black text-slate-950">Routes de la zone</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Choisis les niveaux de routes à rechercher. La taille maximale de la zone s’adapte automatiquement au niveau de détail demandé.
        </p>
      </header>
      <div className="space-y-4 p-6">
        <div
          data-dromap-tour="routes-import-categories"
          className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 p-4"
        >
          {[
            ["Autoroutes", true],
            ["Nationales / principales", true],
            ["Départementales / secondaires", false],
            ["Petites routes", false],
          ].map(([label, checked]) => (
            <div key={String(label)} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
              <span className={`grid h-4 w-4 place-items-center rounded border text-[10px] ${checked ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white"}`}>
                {checked ? "✓" : ""}
              </span>
              {label}
            </div>
          ))}
          <div className="col-span-2 mt-1 text-xs font-black text-teal-700">Tout sélectionner</div>
        </div>
        <div
          data-dromap-tour="routes-import-limit"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
        >
          Zone actuelle : <strong>551 000 km²</strong> · Limite avec Autoroutes + Nationales / principales : <strong>750 000 km²</strong>.
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
          Plus tu ajoutes de routes secondaires et locales, plus la limite de zone diminue afin d’éviter un volume de données trop important.
        </div>
      </div>
      <footer className="flex justify-end border-t border-slate-200 px-6 py-4">
        <button
          type="button"
          data-dromap-tour="routes-import-analyze"
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-black text-white"
        >
          Analyser les routes
        </button>
      </footer>
    </div>
  );
}

export function DromapEditorTour() {
  const [stepIndex, setStepIndex] = useState(-1);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [explanationParentDetailIndex, setExplanationParentDetailIndex] = useState<number | null>(null);
  const [explanationReturnMode, setExplanationReturnMode] = useState<"step" | "detail" | "sequence" | null>(null);
  const [explanationIndex, setExplanationIndex] = useState<number | null>(null);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const ghostOpenedExportRef = useRef(false);
  const ghostOpenedCartographicImportsRef = useRef(false);
  const inspectorUiSnapshotRef = useRef<InspectorUiSnapshot | null>(null);
  const selectionSimulationSnapshotRef =
    useRef<SelectionSimulationSnapshot | null>(null);
  const exportSimulationSnapshotRef = useRef<ExportSimulationSnapshot | null>(null);
  const tutorialFeatureIdRef = useRef<string | null>(null);
  const tutorialFeatureInjectedRef = useRef(false);
  const toolSettingsOriginalRef = useRef<{
    activeTool: EditorActiveTool;
    openPanel: TourToolSettings | null;
  } | null>(null);

  const openTour = useCallback(() => {
    setExplanationIndex(null);
    setExplanationParentDetailIndex(null);
    setExplanationReturnMode(null);
    setDetailIndex(null);
    setStepIndex(0);
  }, []);

  useEffect(() => {
    function handleStartTour() {
      openTour();
    }

    window.addEventListener("dromap:start-editor-tour", handleStartTour);

    const timeoutId = window.setTimeout(() => {
      let shouldOpenAutomatically = false;

      try {
        const alreadyCompleted =
          window.localStorage.getItem(TOUR_STORAGE_KEY) === "done";
        const alreadyPresented =
          window.localStorage.getItem(TOUR_AUTO_PRESENTED_KEY) === "done";

        if (!alreadyCompleted && !alreadyPresented) {
          // On marque l’affichage AVANT d’ouvrir la visite : même si l’utilisateur
          // quitte la page en plein tutoriel, une seconde création de projet ne
          // relancera jamais automatiquement la visite. Le bouton ? reste disponible.
          window.localStorage.setItem(TOUR_AUTO_PRESENTED_KEY, "done");
          shouldOpenAutomatically = true;
        }
      } catch {
        if (!autoTourPresentedInMemory) {
          autoTourPresentedInMemory = true;
          shouldOpenAutomatically = true;
        }
      }

      if (shouldOpenAutomatically) {
        autoTourPresentedInMemory = true;
        openTour();
      }
    }, 650);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("dromap:start-editor-tour", handleStartTour);
    };
  }, [openTour]);

  const currentStep = stepIndex >= 0 ? TOUR_STEPS[stepIndex] : null;
  const currentDetail =
    currentStep && detailIndex !== null
      ? currentStep.details[detailIndex] ?? null
      : null;
  const effectiveExplanationParentDetailIndex =
    explanationIndex !== null
      ? explanationParentDetailIndex ?? detailIndex
      : explanationParentDetailIndex;
  const explanationParentDetail =
    currentStep && effectiveExplanationParentDetailIndex !== null
      ? currentStep.details[effectiveExplanationParentDetailIndex] ?? null
      : null;
  const currentExplanation =
    explanationParentDetail && explanationIndex !== null
      ? explanationParentDetail.explanationDetails?.[explanationIndex] ?? null
      : null;
  const activeDetail = currentExplanation ?? currentDetail;
  const detailedMode = Boolean(currentStep && currentDetail && !currentExplanation);
  const explanationMode = Boolean(currentExplanation);
  const importGhostStage = activeDetail?.importExplanationStage ?? "panel";
  const showAddDataImportGhost = activeDetail?.ghost === "add-data-demo";
  const showBuildingsImportGhost = activeDetail?.ghost === "buildings-import-demo";
  const showRoutesImportGhost = activeDetail?.ghost === "routes-import-demo";

  // Pendant la visite, l’éditeur placé dessous est entièrement inerte.
  // Seuls les boutons de navigation du tutoriel et les boutons « Explications »
  // restent utilisables. Les clics programmatiques du tutoriel (isTrusted=false)
  // continuent toutefois à pouvoir ouvrir temporairement les vrais panneaux utiles.
  useEffect(() => {
    if (!currentStep) return;

    const allowedSelector = '[data-dromap-tour-action="true"]';

    const blockPointerEvent = (event: Event) => {
      if (!(event instanceof MouseEvent || event instanceof PointerEvent || event instanceof WheelEvent)) {
        return;
      }
      if (!event.isTrusted) return;

      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(allowedSelector)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const blockKeyboardEvent = (event: KeyboardEvent) => {
      if (!event.isTrusted) return;

      const actions = Array.from(
        document.querySelectorAll<HTMLButtonElement>(`${allowedSelector}:not([disabled])`),
      ).filter((button) => isElementVisible(button));

      if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (actions.length === 0) return;
        const activeIndex = actions.indexOf(document.activeElement as HTMLButtonElement);
        const direction = event.shiftKey ? -1 : 1;
        const nextIndex =
          activeIndex < 0
            ? event.shiftKey
              ? actions.length - 1
              : 0
            : (activeIndex + direction + actions.length) % actions.length;
        actions[nextIndex]?.focus();
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const allowedAction = target?.closest(allowedSelector);
      if (allowedAction && (event.key === "Enter" || event.key === " ")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const pointerEvents = [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "contextmenu",
      "wheel",
    ] as const;

    pointerEvents.forEach((eventName) =>
      document.addEventListener(eventName, blockPointerEvent, { capture: true, passive: false }),
    );
    document.addEventListener("keydown", blockKeyboardEvent, true);

    return () => {
      pointerEvents.forEach((eventName) =>
        document.removeEventListener(eventName, blockPointerEvent, true),
      );
      document.removeEventListener("keydown", blockKeyboardEvent, true);
    };
  }, [currentStep]);

  const restoreToolSettingsAfterTour = useCallback(() => {
    const original = toolSettingsOriginalRef.current;
    if (!original) return;

    closeVisibleToolSettingsPanel();
    toolSettingsOriginalRef.current = null;

    window.setTimeout(() => {
      if (original.openPanel) {
        const originalButton = findTourTarget(
          getToolSettingsButtonQuery(original.openPanel),
        );
        if (originalButton instanceof HTMLButtonElement) {
          originalButton.click();
          return;
        }
      }

      useEditorToolStore.getState().setActiveTool(original.activeTool);
    }, 0);
  }, []);

  const captureSelectionSimulation = useCallback(() => {
    if (selectionSimulationSnapshotRef.current) return;

    const state = useEditorSelectionStore.getState();
    selectionSimulationSnapshotRef.current = {
      selectedFeatureId: state.selectedFeatureId,
      selectedFeatureIds: [...state.selectedFeatureIds],
      multiSelectionEnabled: state.multiSelectionEnabled,
      selectedFromObjectsPanel: state.selectedFromObjectsPanel,
      mapSelectionRequestId: state.mapSelectionRequestId,
    };
  }, []);

  const ensureTutorialMarker = useCallback(
    (options: { forceSynthetic?: boolean } = {}) => {
      const existingId = tutorialFeatureIdRef.current;
      if (existingId) {
        useEditorSelectionStore.setState({
          selectedFeatureId: existingId,
          selectedFeatureIds: [existingId],
          selectedFromObjectsPanel: false,
        });
        return existingId;
      }

      captureSelectionSimulation();

      const featureState = useEditorFeaturesStore.getState();
      const reusableMarker = options.forceSynthetic
        ? undefined
        : featureState.features.find(
            (feature) => feature.properties.type === "marker",
          );

      if (reusableMarker) {
        tutorialFeatureIdRef.current = reusableMarker.id;
        tutorialFeatureInjectedRef.current = false;
        useEditorSelectionStore.setState({
          selectedFeatureId: reusableMarker.id,
          selectedFeatureIds: [reusableMarker.id],
          selectedFromObjectsPanel: false,
        });
        return reusableMarker.id;
      }

      setTourSimulationFlag(true);
      const id = `__dromap_tour_demo_marker__${
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }`;
      const demoFeature = createTutorialMarkerFeature(id);

      useEditorFeaturesStore.setState((state) => ({
        features: [...state.features, demoFeature],
      }));
      useEditorSelectionStore.setState({
        selectedFeatureId: id,
        selectedFeatureIds: [id],
        selectedFromObjectsPanel: false,
      });

      tutorialFeatureIdRef.current = id;
      tutorialFeatureInjectedRef.current = true;
      return id;
    },
    [captureSelectionSimulation],
  );

  const captureExportSimulation = useCallback(() => {
    if (exportSimulationSnapshotRef.current) return;

    const state = useEditorExportStore.getState();
    exportSimulationSnapshotRef.current = {
      legendTitle: state.legendTitle,
      legendPosition: state.legendPosition,
      hiddenLegendFeatureIds: [...state.hiddenLegendFeatureIds],
    };
  }, []);

  const restoreSimulatedEditorState = useCallback(() => {
    const exportSnapshot = exportSimulationSnapshotRef.current;
    if (exportSnapshot) {
      useEditorExportStore.setState({
        legendTitle: exportSnapshot.legendTitle,
        legendPosition: exportSnapshot.legendPosition,
        hiddenLegendFeatureIds: [...exportSnapshot.hiddenLegendFeatureIds],
      });
      exportSimulationSnapshotRef.current = null;
    }

    const tutorialFeatureId = tutorialFeatureIdRef.current;
    if (tutorialFeatureId && tutorialFeatureInjectedRef.current) {
      useEditorFeaturesStore.setState((state) => ({
        features: state.features.filter(
          (feature) => feature.id !== tutorialFeatureId,
        ),
      }));
    }

    tutorialFeatureIdRef.current = null;
    tutorialFeatureInjectedRef.current = false;

    const selectionSnapshot = selectionSimulationSnapshotRef.current;
    if (selectionSnapshot) {
      useEditorSelectionStore.setState({
        selectedFeatureId: selectionSnapshot.selectedFeatureId,
        selectedFeatureIds: [...selectionSnapshot.selectedFeatureIds],
        multiSelectionEnabled: selectionSnapshot.multiSelectionEnabled,
        selectedFromObjectsPanel: selectionSnapshot.selectedFromObjectsPanel,
        mapSelectionRequestId: selectionSnapshot.mapSelectionRequestId,
      });
      selectionSimulationSnapshotRef.current = null;
    }

    setTourSimulationFlag(false);
  }, []);

  const captureInspectorUi = useCallback(() => {
    if (inspectorUiSnapshotRef.current) return;

    const inspector = document.querySelector<HTMLElement>(
      '[data-dromap-product-inspector="true"]',
    );
    inspectorUiSnapshotRef.current = {
      collapsed: inspector?.dataset.collapsed === "true",
      activeTabLabel: getInspectorActiveTabLabel(),
    };
  }, []);

  const restoreInspectorUi = useCallback(() => {
    const original = inspectorUiSnapshotRef.current;
    if (!original) return;
    inspectorUiSnapshotRef.current = null;

    const restore = () => {
      const inspector = document.querySelector<HTMLElement>(
        '[data-dromap-product-inspector="true"]',
      );
      const isCollapsed = inspector?.dataset.collapsed === "true";

      if (!original.collapsed && isCollapsed) {
        const expandButton = findTourTarget({
          ariaLabel: "Déployer l’inspecteur",
        });
        if (expandButton instanceof HTMLButtonElement) expandButton.click();
      }

      if (original.collapsed && !isCollapsed) {
        const collapseButton = findTourTarget({
          ariaLabel: "Replier l’inspecteur",
        });
        if (collapseButton instanceof HTMLButtonElement) collapseButton.click();
        return;
      }

      if (original.activeTabLabel && !original.collapsed) {
        window.setTimeout(() => {
          if (original.activeTabLabel?.includes("objets")) {
            clickInspectorTab("objets");
          } else if (original.activeTabLabel?.includes("étiquettes")) {
            clickInspectorTab("étiquettes");
          } else {
            clickInspectorTab("sélection");
          }
        }, 0);
      }
    };

    window.setTimeout(restore, 0);
  }, []);

  const closeGhostPanels = useCallback(() => {
    restoreToolSettingsAfterTour();
    restoreSimulatedEditorState();

    const exportState = useEditorExportStore.getState();

    if (ghostOpenedExportRef.current && exportState.isExportPanelOpen) {
      exportState.closeExportPanel();
    }

    if (ghostOpenedCartographicImportsRef.current) {
      const closeButton = document.querySelector<HTMLButtonElement>(
        '[data-dromap-tour="imports-panel"] [aria-label="Fermer les imports cartographiques"]',
      );
      closeButton?.click();
    }

    restoreInspectorUi();

    ghostOpenedExportRef.current = false;
    ghostOpenedCartographicImportsRef.current = false;
  }, [
    restoreInspectorUi,
    restoreSimulatedEditorState,
    restoreToolSettingsAfterTour,
  ]);

  useEffect(() => {
    const handleRestoreSimulation = () => {
      restoreSimulatedEditorState();
    };

    window.addEventListener(
      "dromap:tour-restore-simulation",
      handleRestoreSimulation,
    );

    return () => {
      window.removeEventListener(
        "dromap:tour-restore-simulation",
        handleRestoreSimulation,
      );
      restoreSimulatedEditorState();
    };
  }, [restoreSimulatedEditorState]);

  useEffect(() => {
    if (!currentStep) {
      return;
    }

    // En visite normale, seul l’inspecteur est ouvert temporairement.
    // Les explications d’import utilisent des représentations non interactives :
    // elles ne déclenchent jamais une vraie analyse ni un vrai sélecteur.
    const baseGhost: TourDetail["ghost"] =
      !activeDetail &&
      currentStep.selector === '[data-dromap-tour="inspector"]'
        ? "inspector"
        : undefined;

    const ghostContext = activeDetail?.ghost ?? baseGhost;
    const exportState = useEditorExportStore.getState();

    if (
      !activeDetail &&
      currentStep.selector === '[data-dromap-tour="render"]' &&
      ghostOpenedExportRef.current &&
      exportState.isExportPanelOpen
    ) {
      restoreSimulatedEditorState();
      exportState.closeExportPanel();
      ghostOpenedExportRef.current = false;
    }

    const cartographicImportsPanel = document.querySelector<HTMLElement>(
      '[data-dromap-tour="imports-panel"]',
    );
    const cartographicImportsOpen = Boolean(
      cartographicImportsPanel && isElementVisible(cartographicImportsPanel),
    );

    const keepsCartographicImportsOpen =
      ghostContext === "cartographic-imports";

    const forceCartographicImportsClosed =
      activeDetail?.label === "Imports";

    const importExplanationOwnsScreen =
      ghostContext === "buildings-import-demo" ||
      ghostContext === "routes-import-demo";

    if (
      !keepsCartographicImportsOpen &&
      cartographicImportsOpen &&
      (
        forceCartographicImportsClosed ||
        ghostOpenedCartographicImportsRef.current ||
        importExplanationOwnsScreen
      )
    ) {
      const closeButton = cartographicImportsPanel?.querySelector<HTMLButtonElement>(
        '[aria-label="Fermer les imports cartographiques"]',
      );
      closeButton?.click();
      // On garde la propriété logique du panneau pendant une sous-explication :
      // en revenant à l’étape Bâtiments/Routes, le panneau se rouvre exactement
      // comme avant le clic sur « Explications ».
      ghostOpenedCartographicImportsRef.current = importExplanationOwnsScreen;
    }

    if (keepsCartographicImportsOpen && !cartographicImportsOpen) {
      const launcher = document.querySelector<HTMLElement>(
        '[data-dromap-tour="imports-launcher"]',
      );
      const launcherButton = launcher?.querySelector<HTMLButtonElement>("button");
      launcherButton?.click();
      ghostOpenedCartographicImportsRef.current = true;
    }

    if (ghostContext === "render" && !exportState.isExportPanelOpen) {
      exportState.openExportPanel();
      ghostOpenedExportRef.current = true;
    }

    if (ghostContext === "inspector") {
      captureInspectorUi();

      const collapsedInspector = document.querySelector<HTMLElement>(
        '[data-dromap-product-inspector="true"][data-collapsed="true"]',
      );

      if (collapsedInspector) {
        const expandButton = findTourTarget({
          ariaLabel: "Déployer l’inspecteur",
        });
        if (expandButton instanceof HTMLButtonElement) {
          expandButton.click();
        }
      }

      if (activeDetail) {
        // Pour les détails de l’inspecteur, on met temporairement l’interface
        // dans un état réaliste : s’il n’y a pas de marqueur, un marqueur
        // d’exemple est posé au centre de la zone. Les vrais contrôles de
        // Sélection / Objets / Étiquettes apparaissent alors à leur vraie place.
        ensureTutorialMarker();

        window.setTimeout(() => {
          if (activeDetail.label === "Objets") {
            clickInspectorTab("objets");
          } else if (activeDetail.label === "Étiquettes") {
            clickInspectorTab("étiquettes");
          } else {
            clickInspectorTab("sélection");
          }
        }, 0);
      }
    }

    if (ghostContext === "render" && activeDetail) {
      window.setTimeout(() => {
        if (activeDetail.label === "+ Titre") {
          captureExportSimulation();
          setTourSimulationFlag(true);
          useEditorExportStore.setState({ legendTitle: "" });
          return;
        }

        if (activeDetail.label === "Masqués") {
          captureExportSimulation();
          const demoId = ensureTutorialMarker({ forceSynthetic: true });
          setTourSimulationFlag(true);
          useEditorExportStore.setState((state) => ({
            hiddenLegendFeatureIds: state.hiddenLegendFeatureIds.includes(demoId)
              ? state.hiddenLegendFeatureIds
              : [...state.hiddenLegendFeatureIds, demoId],
          }));
          return;
        }

        if (activeDetail.label === "Déplacer un élément de légende") {
          captureExportSimulation();
          const demoId = ensureTutorialMarker({ forceSynthetic: true });
          setTourSimulationFlag(true);
          useEditorExportStore.setState((state) => ({
            legendPosition: "map",
            hiddenLegendFeatureIds: state.hiddenLegendFeatureIds.filter(
              (featureId) => featureId !== demoId,
            ),
          }));
        }
      }, 40);
    }
  }, [
    captureExportSimulation,
    captureInspectorUi,
    activeDetail,
    currentStep,
    ensureTutorialMarker,
    restoreSimulatedEditorState,
  ]);

  useEffect(() => {
    const requestedToolSettings = activeDetail?.openToolSettings;

    if (!requestedToolSettings) {
      if (toolSettingsOriginalRef.current) {
        restoreToolSettingsAfterTour();
      }
      return;
    }

    if (!toolSettingsOriginalRef.current) {
      toolSettingsOriginalRef.current = {
        activeTool: useEditorToolStore.getState().activeTool,
        openPanel: getOpenToolSettingsType(),
      };
    }

    const openRequestedPanel = () => {
      if (getOpenToolSettingsType() === requestedToolSettings) return;

      const button = findTourTarget(
        getToolSettingsButtonQuery(requestedToolSettings),
      );
      if (button instanceof HTMLButtonElement) {
        button.click();
      }
    };

    const currentOpenPanel = getOpenToolSettingsType();
    if (currentOpenPanel && currentOpenPanel !== requestedToolSettings) {
      closeVisibleToolSettingsPanel();
      const timeoutId = window.setTimeout(openRequestedPanel, 0);
      return () => window.clearTimeout(timeoutId);
    }

    openRequestedPanel();
  }, [activeDetail, restoreToolSettingsAfterTour]);

  const activeTargetQueries = useMemo<TourTargetQuery[]>(() => {
    if (!currentStep) return [];
    if (activeDetail) {
      return [activeDetail.target, ...(activeDetail.additionalTargets ?? [])];
    }
    const selector =
      typeof document !== "undefined" && document.querySelector(currentStep.selector)
        ? currentStep.selector
        : currentStep.fallbackSelector ?? currentStep.selector;
    return [{ selector }];
  }, [activeDetail, currentStep]);

  useEffect(() => {
    if (activeTargetQueries.length === 0) {
      setTargetRect(null);
      return;
    }

    let frameId = 0;

    const updateTargetRect = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const targets = activeTargetQueries
          .map((query) => findTourTarget(query))
          .filter((target): target is HTMLElement => target !== null);
        const allTargetsFound = targets.length === activeTargetQueries.length;

        if (allTargetsFound && targets.length > 0 && activeDetail) {
          // Une cible située dans une grande fenêtre factice doit être rendue
          // visible en faisant défiler cette fenêtre, pas la page entière.
          // C’est notamment nécessaire pour la dernière explication de
          // « Ajouter / Importer » (Bibliothèque GeoJSON).
          const movedInsideGhost = targets.some((target) =>
            revealTargetInsideTourGhost(target),
          );

          const groupRect = measureTargets(targets);
          const viewportHeight =
            window.visualViewport?.height ?? window.innerHeight;
          const viewportWidth =
            window.visualViewport?.width ?? window.innerWidth;
          const isOutsideViewport =
            groupRect.top < 8 ||
            groupRect.left < 8 ||
            groupRect.top + groupRect.height > viewportHeight - 8 ||
            groupRect.left + groupRect.width > viewportWidth - 8;

          if (isOutsideViewport && !movedInsideGhost) {
            targets[0].scrollIntoView({
              block: "center",
              inline: "nearest",
              behavior: "auto",
            });
          }
        }

        if (allTargetsFound && targets.length > 0) {
          setTargetRect(measureTargets(targets));
          return;
        }

        // Pour les contrôles simulés de l’inspecteur, on attend que le vrai
        // contrôle soit réellement présent à sa place. On n’encadre surtout pas
        // tout l’inspecteur pendant ce délai, sinon le tutoriel donne l’impression
        // que la cible est le panneau entier.
        const requiresExactInspectorTarget =
          activeDetail?.label ===
            "Modifier tous les marqueurs du même type dans ce calque" ||
          activeDetail?.label === "Sélection multiple";

        if (requiresExactInspectorTarget) {
          setTargetRect(null);
          return;
        }

        // Pour les autres commandes, si la cible met quelques millisecondes à
        // apparaître après la mise en scène du tutoriel, on peut encadrer
        // temporairement la vraie zone de l’interface qui la contient.
        if (currentStep) {
          const host = document.querySelector<HTMLElement>(currentStep.selector);
          if (host && isElementVisible(host)) {
            setTargetRect(measureTargets([host]));
            return;
          }
        }

        setTargetRect(null);
      });
    };

    updateTargetRect();

    const mutationObserver = new MutationObserver(updateTargetRect);
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-expanded", "aria-selected"],
    });

    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);
    window.visualViewport?.addEventListener("resize", updateTargetRect);
    window.visualViewport?.addEventListener("scroll", updateTargetRect);

    const intervalId = window.setInterval(updateTargetRect, 180);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
      mutationObserver.disconnect();
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
      window.visualViewport?.removeEventListener("resize", updateTargetRect);
      window.visualViewport?.removeEventListener("scroll", updateTargetRect);
    };
  }, [activeTargetQueries, activeDetail, currentStep]);

  const calloutStyle = useMemo(() => {
    const viewportWidth =
      typeof window === "undefined"
        ? 1280
        : window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight =
      typeof window === "undefined"
        ? 800
        : window.visualViewport?.height ?? window.innerHeight;

    const width = Math.min(explanationMode ? 380 : 440, viewportWidth - 32);
    const sameTypeInspectorDetail =
      activeDetail?.label === "Modifier tous les marqueurs du même type dans ce calque";
    const estimatedHeight = sameTypeInspectorDetail
      ? 390
      : explanationMode
        ? 220
        : detailedMode
          ? 300
          : 285;
    const fixedNavigationReserve = sameTypeInspectorDetail ? 132 : 92;
    const edge = 16;
    const gap = 16;
    const usableBottom = viewportHeight - fixedNavigationReserve;
    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), Math.max(min, max));

    if (!targetRect) {
      return {
        left: Math.max(edge, viewportWidth / 2 - width / 2),
        top: Math.max(80, viewportHeight / 2 - estimatedHeight / 2),
      };
    }

    const centeredTop = clamp(
      targetRect.top + targetRect.height / 2 - estimatedHeight / 2,
      edge,
      usableBottom - estimatedHeight,
    );
    const centeredLeft = clamp(
      targetRect.left + targetRect.width / 2 - width / 2,
      edge,
      viewportWidth - width - edge,
    );

    // On place d’abord la bulle à côté du contrôle encadré. Si un côté manque
    // de place, on essaie l’autre, puis dessous/dessus. La bulle ne recouvre
    // donc plus le bouton qu’elle est en train d’expliquer.
    if (targetRect.left + targetRect.width + gap + width <= viewportWidth - edge) {
      return { left: targetRect.left + targetRect.width + gap, top: centeredTop };
    }
    if (targetRect.left - gap - width >= edge) {
      return { left: targetRect.left - gap - width, top: centeredTop };
    }
    if (targetRect.top + targetRect.height + gap + estimatedHeight <= usableBottom) {
      return { left: centeredLeft, top: targetRect.top + targetRect.height + gap };
    }
    if (targetRect.top - gap - estimatedHeight >= edge) {
      return { left: centeredLeft, top: targetRect.top - gap - estimatedHeight };
    }

    // Pour les très grandes cibles (par exemple une carte de sélection), aucun
    // emplacement entièrement extérieur n’existe. On privilégie alors le coin
    // le plus éloigné du centre de la cible et on conserve une marge visible.
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const left = targetCenterX < viewportWidth / 2 ? viewportWidth - width - edge : edge;
    const top = targetCenterY < usableBottom / 2 ? usableBottom - estimatedHeight - edge : edge;
    return { left, top };
  }, [activeDetail?.label, detailedMode, explanationMode, targetRect]);

  if (!currentStep) return null;

  function closeTour(markCompleted: boolean) {
    if (markCompleted) {
      try {
        window.localStorage.setItem(TOUR_STORAGE_KEY, "done");
      } catch {
        // Le projet reste utilisable lorsque le stockage est indisponible.
      }
    }

    closeGhostPanels();
    setExplanationIndex(null);
    setExplanationParentDetailIndex(null);
    setExplanationReturnMode(null);
    setDetailIndex(null);
    setStepIndex(-1);
  }

  function nextStep() {
    closeGhostPanels();

    if (stepIndex >= TOUR_STEPS.length - 1) {
      closeTour(true);
      return;
    }

    setExplanationIndex(null);
    setExplanationParentDetailIndex(null);
    setExplanationReturnMode(null);
    setDetailIndex(null);
    setStepIndex((current) => current + 1);
  }

  function previousStep() {
    closeGhostPanels();
    setExplanationIndex(null);
    setExplanationParentDetailIndex(null);
    setExplanationReturnMode(null);
    setDetailIndex(null);
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function enterDetailedTour() {
    const onlyDetail = currentStep?.details.length === 1 ? currentStep.details[0] : null;

    // Lorsqu’une étape ne contient qu’un seul élément dont le vrai contenu est
    // une sous-explication (notamment Ajouter / Importer), le premier clic sur
    // « Explications détaillées » démarre directement l’explication. On évite
    // ainsi un écran intermédiaire qui répète le même bouton.
    if (onlyDetail?.explanationDetails?.length) {
      setTargetRect(null);
      // Même mécanique que les autres « Explications détaillées » : la fiche
      // intermédiaire disparaît immédiatement et la première cible détaillée
      // devient le contenu actif du tutoriel. Le parent est mémorisé séparément
      // uniquement pour permettre le retour, jamais pour être rendu à l'écran.
      setDetailIndex(null);
      setExplanationParentDetailIndex(0);
      setExplanationReturnMode("step");
      setExplanationIndex(0);
      return;
    }

    setExplanationIndex(null);
    setExplanationParentDetailIndex(null);
    setExplanationReturnMode(null);
    setDetailIndex(0);
  }

  function leaveDetailedTour() {
    restoreSimulatedEditorState();
    setExplanationIndex(null);
    setExplanationParentDetailIndex(null);
    setExplanationReturnMode(null);
    setDetailIndex(null);
  }

  function openDetailAtIndex(index: number) {
    if (!currentStep) return;

    if (index < 0) {
      setExplanationIndex(null);
      setExplanationParentDetailIndex(null);
      setExplanationReturnMode(null);
      setDetailIndex(0);
      return;
    }

    if (index >= currentStep.details.length) {
      leaveDetailedTour();
      return;
    }

    // Les explications Bâtiments font désormais partie de la suite normale
    // des détails de la barre gauche : après la fiche Bâtiments, Suivant ouvre
    // directement la première fenêtre à expliquer. Ajouter / Importer conserve
    // son parcours détaillé dédié géré par enterDetailedTour().
    setExplanationIndex(null);
    setExplanationParentDetailIndex(null);
    setExplanationReturnMode(null);
    setDetailIndex(index);
  }

  function nextDetail() {
    if (detailIndex === null || currentStep === null) return;
    openDetailAtIndex(detailIndex + 1);
  }

  function previousDetail() {
    if (detailIndex === null) return;
    openDetailAtIndex(detailIndex - 1);
  }

  function enterExplanation() {
    if (detailIndex === null || !currentDetail?.explanationDetails?.length) return;

    // Même fonctionnement que « Explications détaillées » : au premier clic,
    // on quitte immédiatement la fiche Bâtiments/Routes et on affiche la
    // première explication de la fenêtre concernée. L'index du parent est
    // conservé séparément uniquement pour revenir à cette fiche à la fin.
    const parentIndex = detailIndex;
    setTargetRect(null);
    setDetailIndex(null);
    setExplanationParentDetailIndex(parentIndex);
    setExplanationReturnMode("detail");
    setExplanationIndex(0);
  }

  function leaveExplanation() {
    const parentIndex = explanationParentDetailIndex;
    const returnMode = explanationReturnMode;
    setExplanationIndex(null);
    setExplanationParentDetailIndex(null);
    setExplanationReturnMode(null);

    if (returnMode === "sequence" && parentIndex !== null) {
      // Le parcours Bâtiments / Routes fait partie de la suite des détails de
      // la barre gauche : une fois terminé, on continue directement à
      // l'élément suivant sans réafficher la fiche parent supprimée.
      window.setTimeout(() => openDetailAtIndex(parentIndex + 1), 0);
      return;
    }

    if (returnMode === "detail" && parentIndex !== null) {
      // À la fin seulement, on revient à l'unique fiche Bâtiments/Routes
      // depuis laquelle l'utilisateur avait ouvert les explications.
      setDetailIndex(parentIndex);
    } else {
      setDetailIndex(null);
    }
  }

  function nextExplanation() {
    if (
      explanationIndex === null ||
      !explanationParentDetail?.explanationDetails?.length
    ) return;

    const nextIndex = explanationIndex + 1;
    if (nextIndex >= explanationParentDetail.explanationDetails.length) {
      leaveExplanation();
      return;
    }
    setExplanationIndex(nextIndex);
  }

  function previousExplanation() {
    if (explanationIndex === null) return;

    if (explanationIndex > 0) {
      setExplanationIndex(explanationIndex - 1);
      return;
    }

    // Depuis la première sous-explication intégrée à la séquence, Précédent
    // revient au détail précédent, sans ressusciter la fiche parent.
    if (explanationReturnMode === "sequence" && explanationParentDetailIndex !== null) {
      const previousIndex = explanationParentDetailIndex - 1;
      setExplanationIndex(null);
      setExplanationParentDetailIndex(null);
      setExplanationReturnMode(null);
      window.setTimeout(() => openDetailAtIndex(previousIndex), 0);
      return;
    }

    setExplanationIndex(0);
  }

  return (
    <div
      data-dromap-editor-tour-overlay="true"
      className="fixed inset-0 z-[7000]"
      role="dialog"
      aria-modal="true"
      aria-label={
        explanationMode
          ? "Explication d’un outil de l’éditeur"
          : detailedMode
            ? "Explications détaillées de l’éditeur"
            : "Visite guidée de l’éditeur"
      }
    >
      <div className="absolute inset-0 bg-slate-950/55" />

      {showAddDataImportGhost ? <AddDataTourGhost /> : null}
      {showBuildingsImportGhost ? (
        <BuildingsImportTourGhost stage={importGhostStage} />
      ) : null}
      {showRoutesImportGhost ? (
        <RoutesImportTourGhost stage={importGhostStage} />
      ) : null}

      {targetRect ? (
        <div
          className="pointer-events-none fixed z-[2] box-border"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            borderRadius: targetRect.borderRadius,
            border: "3px solid white",
            boxShadow: "inset 0 0 0 2px rgba(79,70,229,1)",
          }}
          aria-hidden="true"
        />
      ) : null}

      <section
        className="fixed z-[3] w-[min(27.5rem,calc(100vw-2rem))] rounded-2xl border border-white/30 bg-white p-5 text-slate-950 shadow-lg"
        style={calloutStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-black text-teal-700">
            {explanationMode && explanationIndex !== null && explanationParentDetail?.explanationDetails
              ? `Explication ${explanationIndex + 1} sur ${explanationParentDetail.explanationDetails.length}`
              : detailedMode && detailIndex !== null
                ? `Détail ${detailIndex + 1} sur ${currentStep.details.length}`
                : `Étape ${stepIndex + 1} sur ${TOUR_STEPS.length}`}
          </span>
        </div>

        <h2 className="mt-4 text-lg font-black leading-8 text-slate-950">
          {activeDetail?.label ?? currentStep.titleContent ?? currentStep.title}
        </h2>
        {activeDetail?.explanation || currentStep.description ? (
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {activeDetail?.explanation ?? currentStep.description}
          </p>
        ) : null}


        {explanationMode || detailedMode || currentStep.details.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {explanationMode ? (
            explanationReturnMode === "detail" ? (
              <button
                type="button"
                data-dromap-tour-action="true"
                onClick={leaveExplanation}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Revenir à {explanationParentDetail?.label ?? "l’outil"}
              </button>
            ) : null
          ) : detailedMode ? (
            <>
              <button
                type="button"
                data-dromap-tour-action="true"
                onClick={leaveDetailedTour}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Revenir à l’étape
              </button>
              {currentDetail?.explanationDetails?.length ? (
                <button
                  type="button"
                  data-dromap-tour-action="true"
                  onClick={enterExplanation}
                  className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-black text-teal-800 transition hover:bg-teal-100"
                >
                  Explications
                </button>
              ) : null}
            </>
          ) : currentStep.details.length > 0 ? (
            <button
              type="button"
              data-dromap-tour-action="true"
              onClick={enterDetailedTour}
              className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-bold text-teal-800 transition hover:bg-teal-100"
            >
              Explications détaillées
            </button>
          ) : null}
          </div>
        ) : null}
      </section>

      <nav
        className="fixed bottom-5 left-1/2 z-[4] flex w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/30 bg-white p-2 shadow-lg sm:w-auto"
        aria-label="Navigation du tutoriel"
      >
        <button
          type="button"
          data-dromap-tour-action="true"
          onClick={explanationMode ? previousExplanation : detailedMode ? previousDetail : previousStep}
          disabled={explanationMode ? explanationIndex === 0 : detailedMode ? detailIndex === 0 : stepIndex === 0}
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[7.5rem] sm:flex-none sm:px-4"
        >
          Précédent
        </button>
        <button
          type="button"
          data-dromap-tour-action="true"
          onClick={() => closeTour(true)}
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 sm:min-w-[7.5rem] sm:flex-none sm:px-4"
        >
          Quitter
        </button>
        <button
          type="button"
          data-dromap-tour-action="true"
          onClick={explanationMode ? nextExplanation : detailedMode ? nextDetail : nextStep}
          className="min-w-0 flex-1 rounded-xl bg-teal-600 px-2 py-2 text-sm font-black text-white transition hover:bg-teal-500 sm:min-w-[7.5rem] sm:flex-none sm:px-4"
        >
          {explanationMode
            ? explanationIndex !== null &&
              explanationParentDetail?.explanationDetails &&
              explanationIndex >= explanationParentDetail.explanationDetails.length - 1
              ? "Terminer"
              : "Suivant"
            : detailedMode
              ? detailIndex !== null && detailIndex >= currentStep.details.length - 1
                ? "Terminer les détails"
                : "Suivant"
              : stepIndex >= TOUR_STEPS.length - 1
                ? "Terminer"
                : "Suivant"}
        </button>
      </nav>
    </div>
  );
}
