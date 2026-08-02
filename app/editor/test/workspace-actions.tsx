"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import {
  DROMAP_FULL_WORLD_WORKSPACE_BOUNDS,
  type WorkspaceBounds,
} from "@/lib/dromap/workspace-bounds";
import { validateWorkspaceBoundsRatio } from "@/lib/dromap/workspace-validation";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

import { getFeatureIdsOutsideWorkspace } from "./workspace-feature-intersection";

type OutsideWorkspaceDecision = {
  featureIds: string[];
};

type WorkspaceMenuPosition = {
  left: number;
  top: number;
};

const WORKSPACE_MENU_WIDTH = 260;
const WORKSPACE_MENU_ESTIMATED_HEIGHT = 205;
const WORKSPACE_MENU_GAP = 10;
const WORKSPACE_MENU_VIEWPORT_MARGIN = 12;

export function WorkspaceActions() {
  const [hasMounted, setHasMounted] = useState(false);
  const [outsideWorkspaceDecision, setOutsideWorkspaceDecision] =
    useState<OutsideWorkspaceDecision | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceMenuPosition, setWorkspaceMenuPosition] =
    useState<WorkspaceMenuPosition | null>(null);

  const workspaceBoundsBeforeModificationRef = useRef<WorkspaceBounds | null>(
    null,
  );
  const workspaceMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);

  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);

  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );

  const setWorkspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.setWorkspaceBounds,
  );

  const validateWorkspaceZone = useEditorTestWorkspaceStore(
    (state) => state.validateWorkspaceZone,
  );

  const modifyWorkspaceZone = useEditorTestWorkspaceStore(
    (state) => state.modifyWorkspaceZone,
  );

  const features = useEditorTestFeaturesStore((state) => state.features);
  const removeFeaturesWithHistory = useEditorTestFeaturesStore(
    (state) => state.removeFeaturesWithHistory,
  );

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );
  const clearSelectedFeatureId = useEditorTestSelectionStore(
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

    function closeWorkspaceMenuAfterViewportChange() {
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
  const basemap = getDromapBasemapConfig(basemapId);
  const canSelectFullWorld = basemap.kind !== "solid";

  function closeWorkspaceMenu() {
    setWorkspaceMenuOpen(false);
    setWorkspaceMenuPosition(null);
  }

  function toggleWorkspaceMenu() {
    if (workspaceMenuOpen) {
      closeWorkspaceMenu();
      return;
    }

    const trigger = workspaceMenuTriggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const preferredLeft = rect.right + WORKSPACE_MENU_GAP;
    const fallbackLeft = rect.left - WORKSPACE_MENU_WIDTH - WORKSPACE_MENU_GAP;
    const left =
      preferredLeft + WORKSPACE_MENU_WIDTH <=
      window.innerWidth - WORKSPACE_MENU_VIEWPORT_MARGIN
        ? preferredLeft
        : Math.max(WORKSPACE_MENU_VIEWPORT_MARGIN, fallbackLeft);
    const top = Math.min(
      Math.max(WORKSPACE_MENU_VIEWPORT_MARGIN, rect.top),
      Math.max(
        WORKSPACE_MENU_VIEWPORT_MARGIN,
        window.innerHeight -
          WORKSPACE_MENU_ESTIMATED_HEIGHT -
          WORKSPACE_MENU_VIEWPORT_MARGIN,
      ),
    );

    setWorkspaceMenuPosition({ left, top });
    setWorkspaceMenuOpen(true);
  }

  function completeWorkspaceValidation() {
    validateWorkspaceZone();
    workspaceBoundsBeforeModificationRef.current = null;
    setOutsideWorkspaceDecision(null);
  }

  function handleValidateWorkspace() {
    if (!workspaceBounds || !validation.isValid) {
      return;
    }

    const isExistingWorkspaceModification =
      workspaceBoundsBeforeModificationRef.current !== null;

    if (!isExistingWorkspaceModification) {
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

    if (currentMode === "workspace-select") {
      return;
    }

    if (!workspaceBounds) {
      return;
    }

    workspaceBoundsBeforeModificationRef.current =
      structuredClone(workspaceBounds);
    setOutsideWorkspaceDecision(null);
    modifyWorkspaceZone();
  }

  function handleSelectFullWorld() {
    closeWorkspaceMenu();

    const wasAlreadyModifyingWorkspace =
      workspaceBoundsBeforeModificationRef.current !== null;
    const startsFromEditMode = currentMode === "edit" && workspaceBounds !== null;

    if (startsFromEditMode && workspaceBounds) {
      workspaceBoundsBeforeModificationRef.current =
        structuredClone(workspaceBounds);
      setOutsideWorkspaceDecision(null);
      modifyWorkspaceZone();
    }

    const nextWorkspaceBounds = structuredClone(DROMAP_FULL_WORLD_WORKSPACE_BOUNDS);
    setWorkspaceBounds(nextWorkspaceBounds);

    const isExistingWorkspaceModification =
      startsFromEditMode || wasAlreadyModifyingWorkspace;

    if (isExistingWorkspaceModification) {
      const featureIdsOutsideWorkspace = getFeatureIdsOutsideWorkspace(
        features,
        nextWorkspaceBounds,
      );

      if (featureIdsOutsideWorkspace.length > 0) {
        setOutsideWorkspaceDecision({
          featureIds: featureIdsOutsideWorkspace,
        });
        return;
      }
    }

    completeWorkspaceValidation();
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
            className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl"
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
            className="fixed z-[4200] w-[260px] rounded-2xl border border-neutral-200 bg-white p-2 shadow-2xl"
            style={{
              left: workspaceMenuPosition.left,
              top: workspaceMenuPosition.top,
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="px-2 pb-2 pt-1">
              <strong className="block text-sm text-neutral-950">
                Zone de travail
              </strong>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-neutral-500">
                Trace librement ta zone ou utilise un cadrage automatique.
              </span>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={handleModifyWorkspace}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-neutral-100"
            >
              <span className="mt-0.5 text-base" aria-hidden="true">
                ▣
              </span>
              <span>
                <strong className="block text-xs text-neutral-900">
                  {currentMode === "edit"
                    ? "Tracer ou modifier manuellement"
                    : "Continuer la sélection manuelle"}
                </strong>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-neutral-500">
                  Dessine directement le rectangle sur la carte.
                </span>
              </span>
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
              <span className="mt-0.5 text-base" aria-hidden="true">
                ◉
              </span>
              <span>
                <strong className="block text-xs text-neutral-900">
                  Sélectionner le monde
                </strong>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-neutral-500">
                  {canSelectFullWorld
                    ? "Crée et valide automatiquement une zone propre couvrant le monde entier."
                    : "Disponible uniquement avec un fond de carte classique."}
                </span>
              </span>
            </button>
          </div>,
          document.body,
        )
      : null;

  if (currentMode === "workspace-select") {
    return (
      <>
        <div className="relative flex justify-center gap-1">
          <button
            type="button"
            onClick={canValidateWorkspace ? handleValidateWorkspace : undefined}
            title="Valider la zone"
            aria-label="Valider la zone"
            aria-disabled={!canValidateWorkspace}
            className={[
              "flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-bold shadow-sm transition",
              canValidateWorkspace
                ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500"
                : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400",
            ].join(" ")}
          >
            ✓
          </button>

          <button
            ref={workspaceMenuTriggerRef}
            type="button"
            onClick={toggleWorkspaceMenu}
            title="Options de la zone de travail"
            aria-label="Options de la zone de travail"
            aria-haspopup="menu"
            aria-expanded={workspaceMenuOpen}
            className="flex h-11 w-7 items-center justify-center rounded-xl border border-blue-300 bg-blue-50 text-sm font-bold text-blue-700 shadow-sm transition hover:border-blue-400 hover:bg-blue-100"
          >
            ▾
          </button>

          {workspaceBounds && !validation.isValid ? (
            <div className="absolute left-full top-0 z-[1100] ml-3 w-64 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 shadow-xl">
              {validation.message}
            </div>
          ) : null}
        </div>

        {workspaceMenu}
        {decisionModal}
      </>
    );
  }

  if (currentMode === "edit" && workspaceBounds) {
    return (
      <>
        <div className="flex justify-center">
          <button
            ref={workspaceMenuTriggerRef}
            type="button"
            onClick={toggleWorkspaceMenu}
            title="Zone de travail"
            aria-label="Zone de travail"
            aria-haspopup="menu"
            aria-expanded={workspaceMenuOpen}
            className="flex h-10 w-full items-center justify-center whitespace-nowrap rounded-xl border border-orange-500 bg-orange-500 px-1 text-[9px] font-bold text-white shadow-sm transition hover:bg-orange-400"
          >
            Zone de travail
          </button>
        </div>

        {workspaceMenu}
        {decisionModal}
      </>
    );
  }

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
