"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";

type DroMapLeafletLayer = L.Layer & {
  dromapFeatureId?: string;
};

function getLayerFeatureId(layer: L.Layer): string | undefined {
  return (layer as DroMapLeafletLayer).dromapFeatureId;
}

export function SelectedFeatureMapInteractions() {
  const map = useMap();

  const currentMode = useEditorTestModeStore((state) => state.currentMode);

  const features = useEditorTestFeaturesStore((state) => state.features);

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId
  );

  const setSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.setSelectedFeatureId
  );

  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId
  );

  useEffect(() => {
    if (currentMode !== "edit") return;

    let ignoreNextMapClick = false;

    const layerClickHandlers: Array<{
      layer: L.Layer;
      handler: L.LeafletEventHandlerFn;
    }> = [];

    const handleMapClick = () => {
      if (ignoreNextMapClick) {
        ignoreNextMapClick = false;
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

      const handleLayerClick: L.LeafletEventHandlerFn = (event) => {
        ignoreNextMapClick = true;

        const mouseEvent = event as L.LeafletMouseEvent;

        if (mouseEvent.originalEvent) {
          L.DomEvent.stop(mouseEvent.originalEvent);
        }

        if (selectedFeatureId === featureId) {
          clearSelectedFeatureId();
          return;
        }

        setSelectedFeatureId(featureId);
      };

      layer.on("click", handleLayerClick);

      layerClickHandlers.push({
        layer,
        handler: handleLayerClick,
      });
    });

    return () => {
      map.off("click", handleMapClick);

      layerClickHandlers.forEach(({ layer, handler }) => {
        layer.off("click", handler);
      });
    };
  }, [
    map,
    currentMode,
    features,
    selectedFeatureId,
    setSelectedFeatureId,
    clearSelectedFeatureId,
  ]);

  return null;
}