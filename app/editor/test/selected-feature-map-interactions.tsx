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

function shouldSuppressLayerClick(
  layer: L.Layer,
  pointerDownState: PointerDownState | undefined,
  event: L.LeafletMouseEvent,
) {
  const dromapLayer = layer as DroMapLeafletLayer;

  if (dromapLayer.dromapSuppressNextClick) {
    dromapLayer.dromapSuppressNextClick = false;
    return true;
  }

  if (!pointerDownState) {
    return false;
  }

  const mouseEvent = event.originalEvent;
  const deltaX = mouseEvent.clientX - pointerDownState.x;
  const deltaY = mouseEvent.clientY - pointerDownState.y;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  return distance >= CLICK_DRAG_DISTANCE_THRESHOLD;
}

export function SelectedFeatureMapInteractions() {
  const map = useMap();

  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const activeTool = useEditorTestToolStore((state) => state.activeTool);

  const features = useEditorTestFeaturesStore((state) => state.features);
  const layersSignature = useEditorTestLayersStore((state) =>
    state.layers
      .map(
        (layer) =>
          `${layer.id}:${layer.visible ? "visible" : "hidden"}:${layer.order}`,
      )
      .join("|"),
  );

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
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

    if (!canSelectFromMap) return;

    let ignoreNextMapClick = false;

    const pointerDownByFeatureId = new Map<string, PointerDownState>();
    const featuresById = new Map(
      features.map((feature) => [feature.id, feature]),
    );

    const layerHandlers: Array<{
      layer: L.Layer;
      clickHandler: L.LeafletEventHandlerFn;
      doubleClickHandler: L.LeafletEventHandlerFn;
      mouseDownHandler: L.LeafletEventHandlerFn;
    }> = [];

    const handleMapClick = () => {
      if (ignoreNextMapClick) {
        ignoreNextMapClick = false;
        return;
      }

      if (shouldSuppressGlobalMapClick()) {
        return;
      }

      // En sélection multiple, un clic dans le vide sert à continuer à viser
      // d'autres objets : la sélection reste volontairement intacte.
      if (!multiSelectionEnabled) {
        clearSelectedFeatureId();
      }
    };

    map.on("click", handleMapClick);

    map.eachLayer((layer) => {
      const featureId = getLayerFeatureId(layer);

      if (!featureId) return;

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

      const handleLayerClick: L.LeafletEventHandlerFn = (event) => {
        ignoreNextMapClick = true;

        const mouseEvent = event as L.LeafletMouseEvent;

        if (mouseEvent.originalEvent) {
          L.DomEvent.stop(mouseEvent.originalEvent);
        }

        const pointerDownState = pointerDownByFeatureId.get(featureId);
        pointerDownByFeatureId.delete(featureId);

        if (shouldSuppressLayerClick(layer, pointerDownState, mouseEvent)) {
          return;
        }

        // Le second clic d'un double-clic ne doit pas modifier la sélection
        // juste avant l'ouverture de l'éditeur direct du texte.
        if (
          mouseEvent.originalEvent?.detail &&
          mouseEvent.originalEvent.detail >= 2
        ) {
          return;
        }

        if (multiSelectionEnabled) {
          toggleFeatureSelection(featureId);
          return;
        }

        // Un second clic sur le même objet le garde sélectionné. Pour
        // désélectionner en mode simple, il suffit de cliquer sur la carte.
        if (selectedFeatureId !== featureId) {
          setSelectedFeatureId(featureId);
        }
      };

      const handleLayerDoubleClick: L.LeafletEventHandlerFn = (event) => {
        const mouseEvent = event as L.LeafletMouseEvent;
        const feature = featuresById.get(featureId);

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
      layer.on("click", handleLayerClick);
      layer.on("dblclick", handleLayerDoubleClick);

      layerHandlers.push({
        layer,
        clickHandler: handleLayerClick,
        doubleClickHandler: handleLayerDoubleClick,
        mouseDownHandler: handleLayerMouseDown,
      });
    });

    return () => {
      map.off("click", handleMapClick);
      pointerDownByFeatureId.clear();

      layerHandlers.forEach(
        ({ layer, clickHandler, doubleClickHandler, mouseDownHandler }) => {
          layer.off("click", clickHandler);
          layer.off("dblclick", doubleClickHandler);
          layer.off("mousedown", mouseDownHandler);
        },
      );
    };
  }, [
    map,
    currentMode,
    activeTool,
    features,
    layersSignature,
    selectedFeatureId,
    multiSelectionEnabled,
    setSelectedFeatureId,
    toggleFeatureSelection,
    setMultiSelectionEnabled,
    clearSelectedFeatureId,
  ]);

  return null;
}
