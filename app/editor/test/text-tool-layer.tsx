"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import { deactivateGeomanModes } from "@/lib/dromap/geoman-toolbar";
import type { DroMapFeature } from "@/lib/dromap/feature";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestTextEditStore } from "@/stores/editor-test-text-edit";
import { useEditorTestToolStore } from "@/stores/editor-test-tool";
import { applyDrawingPresetToFeature } from "@/stores/editor-test-drawing-options";

function createTextFeature(
  latLng: L.LatLng,
  textReferenceZoom: number,
): DroMapFeature {
  const feature: DroMapFeature = {
    type: "Feature",
    id: crypto.randomUUID(),
    geometry: {
      type: "Point",
      coordinates: [latLng.lng, latLng.lat],
    },
    properties: {
      type: "text",
      label: "Texte",
      style: {
        color: "#111827",
        opacity: 1,
        fontSize: 22,
        textBold: false,
        textItalic: false,
        textReferenceZoom,
        textRotation: 0,
        textBackgroundEnabled: false,
        textBackgroundColor: "#ffffff",
        textBackgroundOpacity: 0.85,
        textBorderEnabled: false,
        textBorderColor: "#111827",
        textBorderWidth: 2,
        textOutlineEnabled: true,
        textOutlineColor: "#ffffff",
        textOutlineWidth: 1.5,
      },
      meta: { version: 1 },
    },
  };

  return applyDrawingPresetToFeature(feature);
}

export function TextToolLayer() {
  const map = useMap();

  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const activeTool = useEditorTestToolStore((state) => state.activeTool);
  const addFeatureWithHistory = useEditorTestFeaturesStore(
    (state) => state.addFeatureWithHistory,
  );
  const setSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.setSelectedFeatureId,
  );
  const startEditingTextFeature = useEditorTestTextEditStore(
    (state) => state.startEditingTextFeature,
  );
  const resetActiveTool = useEditorTestToolStore(
    (state) => state.resetActiveTool,
  );

  useEffect(() => {
    if (currentMode !== "edit" || activeTool !== "text") {
      return;
    }

    deactivateGeomanModes(map);

    const container = map.getContainer();
    const previousCursor = container.style.cursor;

    container.style.cursor = "text";

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      const feature = createTextFeature(event.latlng, map.getZoom());

      addFeatureWithHistory(feature);
      setSelectedFeatureId(feature.id);
      resetActiveTool();
      startEditingTextFeature(feature.id);
    };

    map.on("click", handleMapClick);

    return () => {
      map.off("click", handleMapClick);
      container.style.cursor = previousCursor;
    };
  }, [
    map,
    currentMode,
    activeTool,
    addFeatureWithHistory,
    resetActiveTool,
    setSelectedFeatureId,
    startEditingTextFeature,
  ]);

  return null;
}
