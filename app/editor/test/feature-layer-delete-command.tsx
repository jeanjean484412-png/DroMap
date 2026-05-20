"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { useEditorTestLayerCommandsStore } from "@/stores/editor-test-layer-commands";

type DroMapLeafletLayer = L.Layer & {
  dromapFeatureId?: string;
};

function getLayerFeatureId(layer: L.Layer): string | undefined {
  return (layer as DroMapLeafletLayer).dromapFeatureId;
}

export function FeatureLayerDeleteCommand() {
  const map = useMap();

  const deleteFeatureLayerCommand = useEditorTestLayerCommandsStore(
    (state) => state.deleteFeatureLayerCommand
  );

  const clearDeleteFeatureLayerCommand = useEditorTestLayerCommandsStore(
    (state) => state.clearDeleteFeatureLayerCommand
  );

  useEffect(() => {
    if (!deleteFeatureLayerCommand) return;

    const { featureId } = deleteFeatureLayerCommand;

    const layersToRemove: L.Layer[] = [];

    map.eachLayer((layer) => {
      if (getLayerFeatureId(layer) === featureId) {
        layersToRemove.push(layer);
      }
    });

    layersToRemove.forEach((layer) => {
      map.removeLayer(layer);
    });

    clearDeleteFeatureLayerCommand();
  }, [map, deleteFeatureLayerCommand, clearDeleteFeatureLayerCommand]);

  return null;
}