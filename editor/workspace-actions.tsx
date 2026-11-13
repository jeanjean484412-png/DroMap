"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { DROMAP_FULL_WORLD_WORKSPACE_BOUNDS } from "@/lib/dromap/workspace-bounds";
import { validateWorkspaceBoundsRatio } from "@/lib/dromap/workspace-validation";
import { useEditorBasemapStore } from "@/stores/editor-basemap";
import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorSelectionStore } from "@/stores/editor-selection";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { useDromapProductRuntime } from "@/components/dromap-product/product-runtime";

import { getFeatureIdsOutsideWorkspace } from "./workspace-feature-intersection";
import { MapDockButton } from "./map-dock-button";

type OutsideWorkspaceDecision = {
  featureIds: string[];
};

type WorkspaceMenuPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

const WORKSPACE_MENU_WIDTH = 260;
const WORKSPACE_MENU_ESTIMATED_HEIGHT = 148;
const WORKSPACE_MENU_GAP = 10;
const WORKSPACE_MENU_VIEWPORT_MARGIN = 12;

function YellowLockBadge({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-full border border-amber-400 bg-amber-100 text-amber-800 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="block h-[55%] w-[55%]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14v2" />
      </svg>
    </span>
  );
}

export function WorkspaceActions() {
  const [hasMounted, setHasMounted] = useState(false);
  const [outsideWorkspaceDecision, setOutsideWorkspaceDecision] =
    useState<OutsideWorkspaceDecision | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [zoneLockedMessageOpen, setZoneLockedMessageOpen] = useState(false);
  const [workspaceMenuPosition, setWorkspaceMenuPosition] =
    useState<WorkspaceMenuPosition | null>(null);

  const productRuntime = useDromapProductRuntime();

  const workspaceMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);

  const currentMode = useEditorModeStore((state) => state.currentMode);
  const basemapId = useEditorBasemapStore((state) => state.basemapId);

  const workspaceBounds = useEditorWorkspaceStore(
    (state) => state.workspaceBounds,
  );

  const setWorkspaceBounds = useEditorWorkspaceStore(
    (state) => state.setWorkspaceBounds,
  );

  const validateWorkspaceZone = useEditorWorkspaceStore(
    (state) => state.validateWorkspaceZone,
  );

  const modifyWorkspaceZone = useEditorWorkspaceStore(
    (state) => state.modifyWorkspaceZone,
  );
  const previousWorkspace = useEditorWorkspaceStore((state) => state.workspaceBeforeModification);
  const cancelWorkspaceZoneModification = useEditorWorkspaceStore((state) => state.cancelWorkspaceZoneModification);

  const workspaceZoneEditLocked = useEditorWorkspaceStore(
    (state) => state.workspaceZoneEditLocked,
  );

  const workspaceNavigationUnlocked = useEditorWorkspaceStore(
    (state) => state.workspaceNavigationUnlocked,
  );
  const toggleWorkspaceNavigationUnlocked = useEditorWorkspaceStore(
    (state) => state.toggleWorkspaceNavigationUnlocked,
  );

  const features = useEditorFeaturesStore((state) => state.features);
  const removeFeaturesWithHistory = useEditorFeaturesStore(
    (state) => state.removeFeaturesWithHistory,
  );

  const selectedFeatureId = useEditorSelectionStore(
    (state) => state.selectedFeatureId,
  );
  const clearSelectedFeatureId = useEditorSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!workspaceMenuOpen) {
      return;
    }

    function closeWorkspaceMenuFromOutside(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        workspaceMenuRef.current?.contains(target) ||
        workspaceMenuTriggerRef.current?.contains(target)
      ) {
        return;
      }

      setWorkspaceMenuOpen(false);
      setWorkspaceMenuPosition(null);
    }

    function closeWorkspaceMenuFromKeyboard(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setWorkspaceMenuOpen(false);
      setWorkspaceMenuPosition(null);
      workspaceMenuTriggerRef.current?.focus();
    }

    function closeWorkspaceMenuAfterViewportChange(event: Event) {
      if (event.target instanceof Node && workspaceMenuRef.current?.contains(event.target)) return;
      setWorkspaceMenuOpen(false);
      setWorkspaceMenuPosition(null);
    }

    document.addEventListener("mousedown", closeWorkspaceMenuFromOutside, true);
    document.addEventListener("keydown", closeWorkspaceMenuFromKeyboard, true);
    window.addEventListener("resize", closeWorkspaceMenuAfterViewportChange);
    window.addEventListener("scroll", closeWorkspaceMenuAfterViewportChange, true);

    return () => {
      document.removeEventListener(
        "mousedown",
        closeWorkspaceMenuFromOutside,
        true,
      );
      document.removeEventListener(
        "keydown",
        closeWorkspaceMenuFromKeyboard,
        true,
      );
      window.removeEventListener(
        "resize",
        closeWorkspaceMenuAfterViewportChange,
      );
      window.removeEventListener(
        "scroll",
        closeWorkspaceMenuAfterViewportChange,
        true,
      );
    };
  }, [workspaceMenuOpen]);

  if (!hasMounted) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          title="Zone"
          aria-label="Zone"
          aria-disabled="true"
          tabIndex={-1}
          className="flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-lg font-bold text-neutral-400 shadow-sm"
        >
          ✓
        </button>
      </div>
    );
  }

  const validation = validateWorkspaceBoundsRatio(workspaceBounds);
  const canValidateWorkspace = workspaceBounds !== null && validation.isValid;
  const selecting = currentMode === "workspace-select";
  const canCancelDraft = selecting && Boolean(workspaceBounds || previousWorkspace);
  const basemap = getDromapBasemapConfig(basemapId);
  const canSelectFullWorld = basemap.kind !== "solid";

  function closeWorkspaceMenu() {
    setWorkspaceMenuOpen(false);
    setWorkspaceMenuPosition(null);
  }

  function toggleWorkspaceMenu() {
    if (workspaceZoneEditLocked && currentMode === "edit") {
      closeWorkspaceMenu();
      setZoneLockedMessageOpen(true);
      return;
    }

    if (workspaceMenuOpen) {
      closeWorkspaceMenu();
      return;
    }

    const trigger = workspaceMenuTriggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(WORKSPACE_MENU_WIDTH, window.innerWidth - WORKSPACE_MENU_VIEWPORT_MARGIN * 2);
    const maxLeft = window.innerWidth - width - WORKSPACE_MENU_VIEWPORT_MARGIN;
    const preferredLeft = rect.right + WORKSPACE_MENU_GAP;
    const fallbackLeft = rect.left - width - WORKSPACE_MENU_GAP;
    const left = preferredLeft <= maxLeft
      ? preferredLeft
      : Math.max(WORKSPACE_MENU_VIEWPORT_MARGIN, Math.min(fallbackLeft, maxLeft));
    const top = Math.min(
      Math.max(WORKSPACE_MENU_VIEWPORT_MARGIN, rect.top),
      Math.max(
        WORKSPACE_MENU_VIEWPORT_MARGIN,
        window.innerHeight -
          WORKSPACE_MENU_ESTIMATED_HEIGHT -
          WORKSPACE_MENU_VIEWPORT_MARGIN,
      ),
    );

    setWorkspaceMenuPosition({
      left,
      top,
      width,
      maxHeight: window.innerHeight - top - WORKSPACE_MENU_VIEWPORT_MARGIN,
    });
    setWorkspaceMenuOpen(true);
  }

  function completeWorkspaceValidation() {
    closeWorkspaceMenu();
    validateWorkspaceZone();
    setOutsideWorkspaceDecision(null);
  }

  function handleValidateWorkspace() {
    if (!workspaceBounds || !validation.isValid) {
      return;
    }

    if (!previousWorkspace) {
      completeWorkspaceValidation();
      return;
    }

    const featureIdsOutsideWorkspace = getFeatureIdsOutsideWorkspace(
      features,
      workspaceBounds,
    );

    if (featureIdsOutsideWorkspace.length === 0) {
      completeWorkspaceValidation();
      return;
    }

    setOutsideWorkspaceDecision({
      featureIds: featureIdsOutsideWorkspace,
    });
  }

  function handleModifyWorkspace() {
    closeWorkspaceMenu();
    if (workspaceZoneEditLocked) {
      setZoneLockedMessageOpen(true);
      return;
    }

    setOutsideWorkspaceDecision(null);
    modifyWorkspaceZone();
  }

  function handleCancelWorkspace() {
    closeWorkspaceMenu();
    setOutsideWorkspaceDecision(null);
    cancelWorkspaceZoneModification();
  }

  function handleSelectFullWorld() {
    closeWorkspaceMenu();
    if (workspaceZoneEditLocked) {
      setZoneLockedMessageOpen(true);
      return;
    }

    setOutsideWorkspaceDecision(null);
    modifyWorkspaceZone();
    setWorkspaceBounds(structuredClone(DROMAP_FULL_WORLD_WORKSPACE_BOUNDS));
  }

  function clearSelectionIfOutside(featureIds: string[]) {
    if (selectedFeatureId && new Set(featureIds).has(selectedFeatureId)) {
      clearSelectedFeatureId();
    }
  }

  function keepOutsideFeatures() {
    if (outsideWorkspaceDecision) {
      clearSelectionIfOutside(outsideWorkspaceDecision.featureIds);
    }

    completeWorkspaceValidation();
  }

  function deleteOutsideFeatures() {
    if (!outsideWorkspaceDecision) {
      return;
    }

    clearSelectionIfOutside(outsideWorkspaceDecision.featureIds);
    removeFeaturesWithHistory(outsideWorkspaceDecision.featureIds);
    completeWorkspaceValidation();
  }

  const outsideFeatureCount = outsideWorkspaceDecision?.featureIds.length ?? 0;

  const zoneLockedModal = zoneLockedMessageOpen
    ? createPortal(
        <div className="fixed inset-0 z-[4300] flex items-center justify-center bg-black/35 px-4">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-amber-200 bg-white p-5 shadow-lg" role="dialog" aria-modal="true">
            <div className="flex items-start gap-3">
              <YellowLockBadge className="h-9 w-9 shrink-0" />
              <div>
                <h2 className="text-base font-black text-slate-950">Zone de travail verrouillée</h2>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Cette carte a déjà été téléchargée après l’achat à l’unité. Pour changer sa zone, tu peux racheter cette carte pour 3 € ou passer à Plus / Pro. Un nouvel achat réouvre la zone jusqu’au prochain premier téléchargement.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setZoneLockedMessageOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoneLockedMessageOpen(false);
                  window.location.assign("/pricing?plan=plus");
                }}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-500"
              >
                Voir Plus / Pro
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoneLockedMessageOpen(false);
                  if (!productRuntime.projectId) return;
                  window.location.assign(
                    `/pricing?purchase=single-map&projectId=${encodeURIComponent(productRuntime.projectId)}&repurchase=1`,
                  );
                }}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-amber-400"
              >
                Racheter cette carte — 3 €
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  const decisionModal = outsideWorkspaceDecision
    ? createPortal(
        <div
          className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/35 px-4"
          role="presentation"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-outside-objects-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-5 shadow-lg"
          >
            <h2
              id="workspace-outside-objects-title"
              className="text-base font-semibold text-neutral-950"
            >
              Objets hors de la nouvelle zone
            </h2>

            <p className="mt-3 text-sm leading-relaxed text-neutral-700">
              {outsideFeatureCount} objet
              {outsideFeatureCount > 1 ? "s sont" : " est"} entièrement hors de
              la nouvelle zone de travail. Souhaites-tu
              {outsideFeatureCount > 1 ? " les" : " le"} supprimer&nbsp;?
            </p>

            <p className="mt-2 text-xs leading-relaxed text-neutral-500">
              En les conservant, ils restent enregistrés dans le projet mais
              peuvent ne plus être affichés tant qu’ils sont hors de la zone
              chargée.
            </p>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setOutsideWorkspaceDecision(null)}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Revoir la zone
              </button>

              <button
                type="button"
                onClick={keepOutsideFeatures}
                className="rounded-xl border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-200"
              >
                Conserver
              </button>

              <button
                type="button"
                onClick={deleteOutsideFeatures}
                className="rounded-xl border border-red-700 bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  const workspaceMenu =
    workspaceMenuOpen && workspaceMenuPosition
      ? createPortal(
          <div
            ref={workspaceMenuRef}
            role="menu"
            aria-label="Zone de travail"
            className="fixed z-[4200] overflow-y-auto overscroll-contain rounded-2xl border border-neutral-200 bg-white p-2 shadow-lg"
            style={workspaceMenuPosition}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="px-2 pb-2 pt-1">
              <strong className="block text-sm text-neutral-950">
                Zone de travail
              </strong>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={handleModifyWorkspace}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-neutral-100"
            >
              <span className="mt-0.5 shrink-0 text-blue-700" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <rect x="4" y="5" width="16" height="14" rx="1" />
                  <rect x="2.5" y="3.5" width="3" height="3" rx="0.5" fill="white" />
                  <rect x="18.5" y="3.5" width="3" height="3" rx="0.5" fill="white" />
                  <rect x="2.5" y="17.5" width="3" height="3" rx="0.5" fill="white" />
                  <rect x="18.5" y="17.5" width="3" height="3" rx="0.5" fill="white" />
                  <path d="M12 3.5v3M12 17.5v3M2.5 12h3M18.5 12h3" />
                </svg>
              </span>
              <strong className="self-center text-xs text-neutral-900">Tracer ou modifier manuellement</strong>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={canSelectFullWorld ? handleSelectFullWorld : undefined}
              aria-disabled={!canSelectFullWorld}
              className={[
                "mt-1 flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition",
                canSelectFullWorld
                  ? "hover:bg-sky-50"
                  : "cursor-not-allowed opacity-45",
              ].join(" ")}
            >
              <span className="mt-0.5 shrink-0 text-sky-700" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3c-3 2.5-4.5 5.5-4.5 9s1.5 6.5 4.5 9M12 3c3 2.5 4.5 5.5 4.5 9S15 18.5 12 21" />
                </svg>
              </span>
              <strong className="self-center text-xs text-neutral-900">Sélectionner le monde</strong>
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {selecting && workspaceBounds && !validation.isValid ? (
        <p role="status" className="mb-1 max-w-64 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          {validation.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {canCancelDraft ? (
          <button
            type="button"
            onClick={handleCancelWorkspace}
            aria-label="Annuler la modification de la zone"
            className="h-11 w-28 rounded-xl border border-orange-300 bg-orange-50 px-2 text-xs font-bold text-orange-900 transition hover:bg-orange-100"
          >
            Annuler
          </button>
        ) : (
          <button
            ref={workspaceMenuTriggerRef}
            type="button"
            onClick={toggleWorkspaceMenu}
            aria-haspopup="menu"
            aria-expanded={workspaceMenuOpen}
            className="relative flex h-11 w-28 items-center justify-center rounded-xl bg-orange-500 px-2 text-xs font-bold text-white shadow-sm transition hover:bg-orange-400"
          >
            <span className={workspaceZoneEditLocked ? "pr-4" : ""}>Zone de travail</span>
            {workspaceZoneEditLocked ? (
              <YellowLockBadge className="absolute right-1 top-1/2 h-4 w-4 -translate-y-1/2" />
            ) : null}
          </button>
        )}

        {selecting ? (
          <>
            <button
              type="button"
              onClick={handleValidateWorkspace}
              disabled={!canValidateWorkspace}
              aria-label="Valider la zone"
              className="h-11 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:bg-neutral-100 disabled:text-neutral-400"
            >
              Valider
            </button>
            {canCancelDraft ? (
              <button
                ref={workspaceMenuTriggerRef}
                type="button"
                onClick={toggleWorkspaceMenu}
                aria-label="Options de la zone de travail"
                aria-haspopup="menu"
                aria-expanded={workspaceMenuOpen}
                className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            ) : null}
          </>
        ) : (
          <MapDockButton
            icon={(
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="m9 9-5-5m0 5V4h5m6 5 5-5m-5 0h5v5M9 15l-5 5m0-5v5h5m6-5 5 5m-5 0h5v-5" />
              </svg>
            )}
            onClick={toggleWorkspaceNavigationUnlocked}
            disabled={!workspaceBounds}
            aria-label="Navigation libre"
            aria-pressed={workspaceNavigationUnlocked}
            className="border-sky-300 text-sky-800 hover:border-sky-500 hover:bg-sky-50 aria-pressed:border-sky-600 aria-pressed:bg-sky-600 aria-pressed:text-white"
          >
            Navigation libre
          </MapDockButton>
        )}
      </div>
      {workspaceMenu}
      {zoneLockedModal}
      {decisionModal}
    </>
  );
}
