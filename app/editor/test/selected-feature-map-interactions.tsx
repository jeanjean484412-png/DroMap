"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestLayersStore } from "@/stores/editor-test-layers";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";

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
      .map((layer) => `${layer.id}:${layer.visible ? "visible" : "hidden"}:${layer.order}`)
      .join("|"),
  );

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );

  const setSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.setSelectedFeatureId,
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

    const layerHandlers: Array<{
      layer: L.Layer;
      clickHandler: L.LeafletEventHandlerFn;
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

      clearSelectedFeatureId();
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

        if (selectedFeatureId === featureId) {
          clearSelectedFeatureId();
          return;
        }

        setSelectedFeatureId(featureId);
      };

      layer.on("mousedown", handleLayerMouseDown);
      layer.on("click", handleLayerClick);

      layerHandlers.push({
        layer,
        clickHandler: handleLayerClick,
        mouseDownHandler: handleLayerMouseDown,
      });
    });

    return () => {
      map.off("click", handleMapClick);
      pointerDownByFeatureId.clear();

      layerHandlers.forEach(({ layer, clickHandler, mouseDownHandler }) => {
        layer.off("click", clickHandler);
        layer.off("mousedown", mouseDownHandler);
      });
    };
  }, [
    map,
    currentMode,
    activeTool,
    features,
    layersSignature,
    selectedFeatureId,
    setSelectedFeatureId,
    clearSelectedFeatureId,
  ]);

  return null;
}
