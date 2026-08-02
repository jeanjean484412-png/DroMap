"use client";

import { useEffect } from "react";
import type L from "leaflet";
import { useMap } from "react-leaflet";

import { deactivateGeomanModes } from "@/lib/dromap/geoman-toolbar";
import {
  isFullWorldWorkspaceBounds,
  type WorkspaceBounds,
} from "@/lib/dromap/workspace-bounds";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import {
  getFullWorldScreenFrame,
  isContainerPointInsideFullWorldFrame,
} from "./full-world-screen-frame";

const MAP_CONTROL_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "[role='button']",
  ".leaflet-control-container",
  ".leaflet-popup",
].join(",");

function getEventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }

  if (target instanceof Node) {
    return target.parentElement;
  }

  return null;
}

function longitudeIsInsideWorkspace(
  longitude: number,
  west: number,
  east: number,
) {
  const longitudeCandidates = [longitude, longitude - 360, longitude + 360];

  return longitudeCandidates.some(
    (candidate) => candidate >= west && candidate <= east,
  );
}

function latLngIsInsideWorkspace(
  latLng: L.LatLng,
  workspaceBounds: WorkspaceBounds,
) {
  const south = Math.min(
    workspaceBounds.southWest.lat,
    workspaceBounds.northEast.lat,
  );
  const north = Math.max(
    workspaceBounds.southWest.lat,
    workspaceBounds.northEast.lat,
  );
  const west = Math.min(
    workspaceBounds.southWest.lng,
    workspaceBounds.northEast.lng,
  );
  const east = Math.max(
    workspaceBounds.southWest.lng,
    workspaceBounds.northEast.lng,
  );

  return (
    latLng.lat >= south &&
    latLng.lat <= north &&
    longitudeIsInsideWorkspace(latLng.lng, west, east)
  );
}

function stopMapPlacementEvent(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

/**
 * Empêche les outils DroMap de poser ou de commencer un objet hors de la zone
 * de travail validée.
 *
 * Un clic sur la partie grisée de la carte revient à Sélection et retire la
 * sélection d'objet courante. Les boutons et contrôles affichés au-dessus de la
 * carte restent utilisables normalement.
 */
export function WorkspaceInteractionGuard() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();

    const isOutsideWorkspace = (event: MouseEvent) => {
      if (useEditorTestModeStore.getState().currentMode !== "edit") {
        return false;
      }

      const workspaceBounds =
        useEditorTestWorkspaceStore.getState().workspaceBounds;

      if (!workspaceBounds) {
        return false;
      }

      const targetElement = getEventTargetElement(event.target);

      if (targetElement?.closest(MAP_CONTROL_SELECTOR)) {
        return false;
      }

      if (isFullWorldWorkspaceBounds(workspaceBounds)) {
        const containerRect = container.getBoundingClientRect();
        const frame = getFullWorldScreenFrame(
          map,
          {
            south: Math.min(
              workspaceBounds.southWest.lat,
              workspaceBounds.northEast.lat,
            ),
            west: Math.min(
              workspaceBounds.southWest.lng,
              workspaceBounds.northEast.lng,
            ),
            north: Math.max(
              workspaceBounds.southWest.lat,
              workspaceBounds.northEast.lat,
            ),
            east: Math.max(
              workspaceBounds.southWest.lng,
              workspaceBounds.northEast.lng,
            ),
          },
        );

        return !isContainerPointInsideFullWorldFrame(
          {
            x: event.clientX - containerRect.left,
            y: event.clientY - containerRect.top,
          },
          frame,
        );
      }

      const latLng = map.mouseEventToLatLng(event);

      return !latLngIsInsideWorkspace(latLng, workspaceBounds);
    };

    const resetInteraction = () => {
      useEditorTestSelectionStore.getState().clearSelectedFeatureId();

      const toolStore = useEditorTestToolStore.getState();

      if (toolStore.activeTool !== "select") {
        toolStore.resetActiveTool();
      }

      deactivateGeomanModes(map);
    };

    const handleMouseDownCapture = (event: MouseEvent) => {
      if (event.button !== 0 || !isOutsideWorkspace(event)) {
        return;
      }

      const activeTool = useEditorTestToolStore.getState().activeTool;
      const toolCanStartPlacementOnMouseDown =
        activeTool !== "select" && activeTool !== "edit";

      if (!toolCanStartPlacementOnMouseDown) {
        return;
      }

      resetInteraction();
      stopMapPlacementEvent(event);
    };

    const handleClickCapture = (event: MouseEvent) => {
      if (event.button !== 0 || !isOutsideWorkspace(event)) {
        return;
      }

      resetInteraction();
      stopMapPlacementEvent(event);
    };

    container.addEventListener("mousedown", handleMouseDownCapture, true);
    container.addEventListener("click", handleClickCapture, true);

    return () => {
      container.removeEventListener("mousedown", handleMouseDownCapture, true);
      container.removeEventListener("click", handleClickCapture, true);
    };
  }, [map]);

  return null;
}
