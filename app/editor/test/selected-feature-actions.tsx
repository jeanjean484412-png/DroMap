"use client";

import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestLayerCommandsStore } from "@/stores/editor-test-layer-commands";

type FeatureLike = {
  id?: string;
  geometry?: {
    type?: string;
  };
  properties?: {
    type?: string;
    label?: string;
  };
};

function getFeatureTypeLabel(feature: FeatureLike) {
  const type = feature.properties?.type;
  const geometryType = feature.geometry?.type;

  if (type === "marker" || geometryType === "Point") return "marqueur";
  if (type === "line" || geometryType === "LineString") return "ligne";
  if (type === "zone" || geometryType === "Polygon") return "zone";

  return "objet";
}

function getFeatureLabel(feature: FeatureLike) {
  return feature.properties?.label?.trim() || getFeatureTypeLabel(feature);
}

export function SelectedFeatureActions() {
  const requestDeleteFeatureLayer = useEditorTestLayerCommandsStore(
    (state) => state.requestDeleteFeatureLayer
  );

  const features = useEditorTestFeaturesStore(
    (state) => state.features
  ) as FeatureLike[];

  const removeFeature = useEditorTestFeaturesStore(
    (state) => state.removeFeature
  );

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId
  );

  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId
  );

  const selectedFeature = features.find(
    (feature) => feature.id === selectedFeatureId
  );

  if (!selectedFeatureId || !selectedFeature) {
    return null;
  }

  function deleteSelectedFeature() {
    if (!selectedFeatureId) return;

    const shouldDelete = window.confirm(
      "Supprimer cet objet ? Cette action ne peut pas encore être annulée."
    );

    if (!shouldDelete) return;

    requestDeleteFeatureLayer(selectedFeatureId);
    removeFeature(selectedFeatureId);
    clearSelectedFeatureId();
  }

  return (
    <div className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-xl border border-black/10 bg-white/95 px-4 py-3 text-sm shadow-lg backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <div className="max-w-64 truncate font-medium text-slate-900">
            Objet sélectionné : {getFeatureLabel(selectedFeature)}
          </div>
          <div className="text-xs text-slate-500">
            Type : {getFeatureTypeLabel(selectedFeature)}
          </div>
        </div>

        <button
          type="button"
          onClick={deleteSelectedFeature}
          className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-red-700"
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}