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

  if (type === "text") return "texte";
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
    (state) => state.requestDeleteFeatureLayer,
  );

  const features = useEditorTestFeaturesStore(
    (state) => state.features,
  ) as FeatureLike[];

  const removeFeatureWithHistory = useEditorTestFeaturesStore(
    (state) => state.removeFeatureWithHistory,
  );

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );

  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );

  const selectedFeature = features.find(
    (feature) => feature.id === selectedFeatureId,
  );

  if (!selectedFeatureId || !selectedFeature) {
    return null;
  }

  function deleteSelectedFeature() {
    if (!selectedFeatureId) return;

    const shouldDelete = window.confirm("Supprimer cet objet ?");

    if (!shouldDelete) return;

    requestDeleteFeatureLayer(selectedFeatureId);
    removeFeatureWithHistory(selectedFeatureId);
    clearSelectedFeatureId();
  }

  return (
    <div className="pointer-events-auto absolute left-[6.5rem] top-[5rem] z-[1000] flex items-center gap-2 rounded-2xl border border-black/10 bg-white/95 p-2 shadow-xl backdrop-blur">
      <div className="min-w-0 px-2">
        <div className="max-w-48 truncate text-xs font-semibold text-neutral-900">
          {getFeatureLabel(selectedFeature)}
        </div>
        <div className="text-[10px] text-neutral-500">
          {getFeatureTypeLabel(selectedFeature)}
        </div>
      </div>

      <button
        type="button"
        onClick={deleteSelectedFeature}
        title="Supprimer"
        aria-label="Supprimer"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-white text-lg font-bold text-red-700 shadow-sm transition hover:bg-red-50"
      >
        ×
      </button>
    </div>
  );
}