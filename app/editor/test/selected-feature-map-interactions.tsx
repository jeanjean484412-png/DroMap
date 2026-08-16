"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import {
  isFeatureEffectivelyLocked,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";
import { useEditorTestTextEditStore } from "@/stores/editor-test-text-edit";

type DroMapLeafletLayer = L.Layer & {
  dromapFeatureId?: string;
  dromapHitboxOwnerId?: string;
  dromapSuppressNextClick?: boolean;
};

type PointerDownState = {
  x: number;
  y: number;
};

type LayerHandlers = {
  clickHandler: L.LeafletEventHandlerFn;
  doubleClickHandler: L.LeafletEventHandlerFn;
  mouseDownHandler: L.LeafletEventHandlerFn;
  mouseUpHandler: L.LeafletEventHandlerFn;
};

const CLICK_DRAG_DISTANCE_THRESHOLD = 5;

function shouldSuppressGlobalMapClick() {
  const win = window as Window & { dromapSuppressNextClick?: boolean };

  if (!win.dromapSuppressNextClick) {
    return false;
  }

  win.dromapSuppressNextClick = false;
  return true;
}

function getLayerFeatureId(layer: L.Layer): string | undefined {
  const dromapLayer = layer as DroMapLeafletLayer;
  return dromapLayer.dromapFeatureId ?? dromapLayer.dromapHitboxOwnerId;
}

function pointerMoved(
  pointerDownState: PointerDownState | undefined,
  event: L.LeafletMouseEvent,
) {
  if (!pointerDownState || !event.originalEvent) {
    return false;
  }

  const deltaX = event.originalEvent.clientX - pointerDownState.x;
  const deltaY = event.originalEvent.clientY - pointerDownState.y;
  return Math.hypot(deltaX, deltaY) >= CLICK_DRAG_DISTANCE_THRESHOLD;
}

export function SelectedFeatureMapInteractions() {
  const map = useMap();
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const activeTool = useEditorTestToolStore((state) => state.activeTool);
  const layersSignature = useEditorTestLayersStore((state) =>
    state.layers
      .map(
        (layer) =>
          `${layer.id}:${layer.visible ? "visible" : "hidden"}:${layer.order}`,
      )
      .join("|"),
  );
  const multiSelectionEnabled = useEditorTestSelectionStore(
    (state) => state.multiSelectionEnabled,
  );
  const setSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.setSelectedFeatureId,
  );
  const toggleFeatureSelection = useEditorTestSelectionStore(
    (state) => state.toggleFeatureSelection,
  );
  const setMultiSelectionEnabled = useEditorTestSelectionStore(
    (state) => state.setMultiSelectionEnabled,
  );
  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );

  useEffect(() => {
    const canSelectFromMap =
      currentMode === "edit" &&
      (activeTool === "select" || activeTool === "edit");

    if (!canSelectFromMap) {
      return;
    }

    let ignoreNextMapClick = false;
    let mapIsDragging = false;
    const pointerDownByFeatureId = new Map<string, PointerDownState>();
    const boundLayers = new Map<L.Layer, LayerHandlers>();
    const pendingFrames = new Set<number>();
    const pendingTimers = new Set<number>();

    const resetPointerState = () => {
      pointerDownByFeatureId.clear();
      // Une navigation ne doit jamais laisser un drapeau de clic bloqué qui
      // rendrait une hitbox de trait inerte jusqu'à la sélection suivante.
      ignoreNextMapClick = false;
      (window as Window & { dromapSuppressNextClick?: boolean }).dromapSuppressNextClick = false;
      boundLayers.forEach((_handlers, layer) => {
        (layer as DroMapLeafletLayer).dromapSuppressNextClick = false;
      });
    };

    const handleMapDragStart = () => {
      mapIsDragging = true;
      resetPointerState();
    };

    const handleMapDragEnd = () => {
      mapIsDragging = false;
      resetPointerState();
    };

    const handleMapClick = () => {
      if (ignoreNextMapClick) {
        ignoreNextMapClick = false;
        return;
      }

      if (shouldSuppressGlobalMapClick()) {
        return;
      }

      if (!useEditorTestSelectionStore.getState().multiSelectionEnabled) {
        clearSelectedFeatureId();
      }
    };

    const bindLayer = (layer: L.Layer) => {
      if (boundLayers.has(layer)) {
        return;
      }

      const featureId = getLayerFeatureId(layer);
      if (!featureId) {
        return;
      }

      if (layer instanceof L.Path) {
        layer.options.interactive = true;
        layer.options.bubblingMouseEvents = false;
      }

      const handleLayerMouseDown: L.LeafletEventHandlerFn = (event) => {
        const mouseEvent = event as L.LeafletMouseEvent;
        if (!mouseEvent.originalEvent) {
          return;
        }

        pointerDownByFeatureId.set(featureId, {
          x: mouseEvent.originalEvent.clientX,
          y: mouseEvent.originalEvent.clientY,
        });
      };

      const handleLayerMouseUp: L.LeafletEventHandlerFn = (event) => {
        const mouseEvent = event as L.LeafletMouseEvent;
        const down = pointerDownByFeatureId.get(featureId);
        if (down && pointerMoved(down, mouseEvent)) {
          pointerDownByFeatureId.delete(featureId);
        }
      };

      const handleLayerClick: L.LeafletEventHandlerFn = (event) => {
        const mouseEvent = event as L.LeafletMouseEvent;
        const dromapLayer = layer as DroMapLeafletLayer;
        const down = pointerDownByFeatureId.get(featureId);
        pointerDownByFeatureId.delete(featureId);

        if (mouseEvent.originalEvent) {
          L.DomEvent.stop(mouseEvent.originalEvent);
        }

        // Un clic généré à la fin d'un vrai déplacement ne sélectionne pas,
        // mais l'état est immédiatement nettoyé : le clic suivant fonctionne.
        if (
          mapIsDragging ||
          pointerMoved(down, mouseEvent) ||
          dromapLayer.dromapSuppressNextClick
        ) {
          dromapLayer.dromapSuppressNextClick = false;
          ignoreNextMapClick = false;
          return;
        }

        ignoreNextMapClick = true;

        if (
          mouseEvent.originalEvent?.detail &&
          mouseEvent.originalEvent.detail >= 2
        ) {
          return;
        }

        const selectionState = useEditorTestSelectionStore.getState();
        if (selectionState.multiSelectionEnabled) {
          selectionState.toggleFeatureSelection(featureId);
          return;
        }

        // Réémettre explicitement la sélection même si l'objet était déjà
        // sélectionné : l'inspecteur peut ainsi revenir sur « Sélection ».
        selectionState.setSelectedFeatureId(featureId);
      };

      const handleLayerDoubleClick: L.LeafletEventHandlerFn = (event) => {
        const mouseEvent = event as L.LeafletMouseEvent;
        const feature = useEditorTestFeaturesStore
          .getState()
          .features.find((candidate) => candidate.id === featureId);

        if (mouseEvent.originalEvent) {
          L.DomEvent.stop(mouseEvent.originalEvent);
        }

        ignoreNextMapClick = true;

        if (
          !feature ||
          feature.properties.type !== "text" ||
          feature.geometry.type !== "Point" ||
          isFeatureEffectivelyLocked(
            feature,
            useEditorTestLayersStore.getState().layers,
          )
        ) {
          return;
        }

        setMultiSelectionEnabled(false);
        setSelectedFeatureId(featureId);
        useEditorTestTextEditStore
          .getState()
          .startEditingTextFeature(featureId);
      };

      layer.on("mousedown", handleLayerMouseDown);
      layer.on("mouseup", handleLayerMouseUp);
      layer.on("click", handleLayerClick);
      layer.on("dblclick", handleLayerDoubleClick);
      boundLayers.set(layer, {
        clickHandler: handleLayerClick,
        doubleClickHandler: handleLayerDoubleClick,
        mouseDownHandler: handleLayerMouseDown,
        mouseUpHandler: handleLayerMouseUp,
      });
    };

    const bindAllLayers = () => {
      map.eachLayer(bindLayer);
    };

    const scheduleLayerBinding = (layer: L.Layer, remainingFrames = 8) => {
      bindLayer(layer);
      if (boundLayers.has(layer) || remainingFrames <= 0) return;
      const frame = window.requestAnimationFrame(() => {
        pendingFrames.delete(frame);
        scheduleLayerBinding(layer, remainingFrames - 1);
      });
      pendingFrames.add(frame);
    };

    const handleLayerAdd = (event: L.LayerEvent) => {
      // Après restauration, certaines hitboxes ne reçoivent leur identifiant
      // DroMap qu'après leur ajout à Leaflet. Plusieurs frames sont donc
      // volontairement retentées au lieu de dépendre d'un unique timing.
      scheduleLayerBinding(event.layer);
    };

    map.on("click", handleMapClick);
    map.on("dragstart", handleMapDragStart);
    map.on("dragend", handleMapDragEnd);
    map.on("moveend", resetPointerState);
    map.on("layeradd", handleLayerAdd);

    bindAllLayers();
    const initialFrame = window.requestAnimationFrame(bindAllLayers);
    pendingFrames.add(initialFrame);
    // Filet de sécurité pour les couches restaurées/recréées de manière
    // asynchrone (notamment les hitboxes transparentes des traits).
    for (const delay of [40, 120, 350, 800]) {
      const timer = window.setTimeout(() => {
        pendingTimers.delete(timer);
        bindAllLayers();
      }, delay);
      pendingTimers.add(timer);
    }

    return () => {
      pendingFrames.forEach((frame) => window.cancelAnimationFrame(frame));
      pendingTimers.forEach((timer) => window.clearTimeout(timer));
      map.off("click", handleMapClick);
      map.off("dragstart", handleMapDragStart);
      map.off("dragend", handleMapDragEnd);
      map.off("moveend", resetPointerState);
      map.off("layeradd", handleLayerAdd);
      resetPointerState();

      boundLayers.forEach(
        (
          {
            clickHandler,
            doubleClickHandler,
            mouseDownHandler,
            mouseUpHandler,
          },
          layer,
        ) => {
          layer.off("click", clickHandler);
          layer.off("dblclick", doubleClickHandler);
          layer.off("mousedown", mouseDownHandler);
          layer.off("mouseup", mouseUpHandler);
        },
      );
      boundLayers.clear();
    };
  }, [
    map,
    currentMode,
    activeTool,
    layersSignature,
    multiSelectionEnabled,
    setSelectedFeatureId,
    setMultiSelectionEnabled,
    clearSelectedFeatureId,
    toggleFeatureSelection,
  ]);

  return null;
}
