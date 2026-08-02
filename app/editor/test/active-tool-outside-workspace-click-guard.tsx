"use client";

import { useEffect } from "react";

import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";

const WORKSPACE_SURFACE_SELECTOR = ".dromap-editor-map";
const TOOL_CONTROL_SELECTOR =
  'button[aria-pressed], [data-dromap-tool-control="true"], [data-dromap-tool-settings-panel="true"]';
const PLACEMENT_CURSOR_CLASSES = [
  "dromap-placement-mode-active",
  "dromap-placement-pointer-on-map",
] as const;

function getEventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }

  if (target instanceof Node) {
    return target.parentElement;
  }

  return null;
}

function restoreMapCursorIfSelectionToolIsActive() {
  const mode = useEditorTestModeStore.getState().currentMode;
  const activeTool = useEditorTestToolStore.getState().activeTool;

  if (mode !== "edit" || activeTool !== "select") {
    return;
  }

  document
    .querySelectorAll<HTMLElement>(WORKSPACE_SURFACE_SELECTOR)
    .forEach((container) => {
      container.classList.remove(...PLACEMENT_CURSOR_CLASSES);
      container.style.removeProperty("cursor");
    });
}

/**
 * Revient automatiquement à l'outil de sélection lorsqu'un clic principal est
 * effectué hors de la surface de travail cartographique.
 *
 * Les clics sur les boutons principaux et sur les flèches de réglage des outils
 * sont volontairement laissés au ModeToolbar. Le bouton concerné peut ainsi
 * activer l'outil et ouvrir ses paramètres dans une seule interaction.
 *
 * Le listener ne bloque jamais l'évènement. Le bouton, l'onglet, le champ ou
 * toute autre action visée par le clic continue donc à recevoir ce même clic.
 *
 * Lorsqu'un outil de pose est coupé, plusieurs couches peuvent encore restaurer
 * temporairement `cursor: none` pendant leur nettoyage React ou dans une frame
 * déjà programmée. La restauration est donc répétée sur deux frames, uniquement
 * si l'outil actif est toujours Sélection. Cela évite de supprimer le curseur
 * personnalisé d'un nouvel outil qui aurait été activé entre-temps.
 */
export function ActiveToolOutsideWorkspaceClickGuard() {
  useEffect(() => {
    let firstFrameId: number | null = null;
    let secondFrameId: number | null = null;

    const cancelScheduledCursorRestoration = () => {
      if (firstFrameId !== null) {
        window.cancelAnimationFrame(firstFrameId);
        firstFrameId = null;
      }

      if (secondFrameId !== null) {
        window.cancelAnimationFrame(secondFrameId);
        secondFrameId = null;
      }
    };

    const scheduleCursorRestoration = () => {
      cancelScheduledCursorRestoration();
      restoreMapCursorIfSelectionToolIsActive();

      firstFrameId = window.requestAnimationFrame(() => {
        firstFrameId = null;
        restoreMapCursorIfSelectionToolIsActive();

        secondFrameId = window.requestAnimationFrame(() => {
          secondFrameId = null;
          restoreMapCursorIfSelectionToolIsActive();
        });
      });
    };

    const unsubscribeToolStore = useEditorTestToolStore.subscribe(
      (state, previousState) => {
        if (
          state.activeTool === "select" &&
          previousState.activeTool !== "select"
        ) {
          scheduleCursorRestoration();
        }
      },
    );

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      const targetElement = getEventTargetElement(event.target);

      if (targetElement?.closest(WORKSPACE_SURFACE_SELECTOR)) {
        return;
      }

      // Les contrôles de la toolbar gèrent eux-mêmes l'activation ou la
      // désactivation de l'outil. On ne réinitialise donc pas l'outil avant leur
      // onClick, notamment pour les flèches qui ouvrent les paramètres.
      if (targetElement?.closest(TOOL_CONTROL_SELECTOR)) {
        return;
      }

      if (useEditorTestModeStore.getState().currentMode !== "edit") {
        return;
      }

      const toolStore = useEditorTestToolStore.getState();

      if (toolStore.activeTool === "select") {
        return;
      }

      toolStore.resetActiveTool();
    };

    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      unsubscribeToolStore();
      cancelScheduledCursorRestoration();
    };
  }, []);

  return null;
}
