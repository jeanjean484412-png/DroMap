"use client";

import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestLayerCommandsStore } from "@/stores/editor-test-layer-commands";
import { getFeatureLockOverride } from "@/lib/dromap/feature";
import {
  getLayerForFeature,
  isFeatureEffectivelyLocked,
  isFeatureLayerLocked,
  isFeatureLayerVisible,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";

import { duplicateSelectedFeature } from "./feature-duplication";

type FeatureLike = {
  id?: string;
  geometry?: {
    type?: string;
  };
  properties?: {
    type?: string;
    label?: string;
    locked?: boolean;
    lockOverride?: "locked" | "unlocked";
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

function getLockStatusLabel(options: {
  objectLocked: boolean;
  layerLocked: boolean;
}) {
  if (options.layerLocked && options.objectLocked) {
    return "Calque + objet verrouillés";
  }

  if (options.layerLocked) {
    return "Calque verrouillé";
  }

  return options.objectLocked ? "Objet verrouillé" : "Modifiable";
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

  const reorderFeatureWithHistory = useEditorTestFeaturesStore(
    (state) => state.reorderFeatureWithHistory,
  );

  const updateFeatureWithHistory = useEditorTestFeaturesStore(
    (state) => state.updateFeatureWithHistory,
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
  const layers = useEditorTestLayersStore((state) => state.layers);

  if (!selectedFeatureId || !selectedFeature) {
    return null;
  }

  if (!isFeatureLayerVisible(selectedFeature as any, layers)) {
    return null;
  }

  const featureLayer = getLayerForFeature(selectedFeature as any, layers);
  const layerLocked = isFeatureLayerLocked(selectedFeature as any, layers);
  const lockOverride = getFeatureLockOverride(selectedFeature as any);
  const objectLocked = selectedFeature.properties?.locked === true || lockOverride === "locked";
  const locked = isFeatureEffectivelyLocked(selectedFeature as any, layers);
  const canChangeDrawOrder = !locked && selectedFeature.properties?.type !== "zone";
  const lockStatusLabel = getLockStatusLabel({ objectLocked, layerLocked });
  const lockButtonLabel = objectLocked ? "Déverrouiller l’objet" : "Verrouiller l’objet";

  function toggleLocked() {
    if (!selectedFeatureId) return;

    updateFeatureWithHistory(selectedFeatureId, (currentFeature) => {
      const currentLockOverride = getFeatureLockOverride(currentFeature as any);
      const currentObjectLocked =
        currentFeature.properties?.locked === true || currentLockOverride === "locked";
      const nextObjectLocked = !currentObjectLocked;
      const { lockOverride: _lockOverride, ...nextProperties } = currentFeature.properties;

      return {
        ...currentFeature,
        properties: {
          ...nextProperties,
          locked: nextObjectLocked,
          ...(nextObjectLocked ? { lockOverride: "locked" as const } : {}),
        },
      };
    });
  }

  function duplicateFeature() {
    if (locked) return;
    duplicateSelectedFeature();
  }

  function bringToFront() {
    if (!selectedFeatureId || locked) return;
    reorderFeatureWithHistory(selectedFeatureId, "bring-to-front");
  }

  function sendToBack() {
    if (!selectedFeatureId || locked) return;
    reorderFeatureWithHistory(selectedFeatureId, "send-to-back");
  }

  function deleteSelectedFeature() {
    if (!selectedFeatureId || locked) return;

    const shouldDelete = window.confirm("Supprimer cet objet ?");

    if (!shouldDelete) return;

    requestDeleteFeatureLayer(selectedFeatureId);
    removeFeatureWithHistory(selectedFeatureId);
    clearSelectedFeatureId();
  }

  return (
    <div className="pointer-events-auto absolute bottom-4 left-[8.5rem] z-[1000] flex max-w-[calc(100vw-11rem)] items-center gap-2 rounded-2xl border border-black/10 bg-white/95 p-2 shadow-xl backdrop-blur">
      <div className="min-w-0 px-2">
        <div className="max-w-48 truncate text-xs font-semibold text-neutral-900">
          {getFeatureLabel(selectedFeature)}
        </div>
        <div className="text-[10px] text-neutral-500">
          {getFeatureTypeLabel(selectedFeature)} · {featureLayer.name} · {lockStatusLabel}
        </div>
      </div>

      {!locked && canChangeDrawOrder ? (
        <div className="flex items-center gap-1 rounded-xl bg-slate-50 p-1">
          <button
            type="button"
            onClick={sendToBack}
            title="Mettre en arrière-plan"
            aria-label="Mettre en arrière-plan"
            className="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
          >
            Arrière-plan
          </button>

          <button
            type="button"
            onClick={bringToFront}
            title="Mettre au premier plan"
            aria-label="Mettre au premier plan"
            className="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
          >
            Premier plan
          </button>
        </div>
      ) : selectedFeature.properties?.type === "zone" ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
          Arrière-plan fixe
        </div>
      ) : locked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
          {lockStatusLabel}
        </div>
      ) : null}

      <button
        type="button"
        onClick={toggleLocked}
        title={lockButtonLabel}
        aria-label={lockButtonLabel}
        className={[
          "flex h-10 items-center justify-center rounded-xl border px-3 text-xs font-bold shadow-sm transition",
          locked
            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        ].join(" ")}
      >
        {lockButtonLabel}
      </button>

      <button
        type="button"
        onClick={duplicateFeature}
        title="Dupliquer"
        aria-label="Dupliquer"
        aria-disabled={locked}
        className={[
          "flex h-10 w-10 items-center justify-center rounded-xl border text-base font-bold shadow-sm transition",
          locked
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            : "border-blue-200 bg-white text-blue-700 hover:bg-blue-50",
        ].join(" ")}
      >
        ⧉
      </button>

      <button
        type="button"
        onClick={deleteSelectedFeature}
        title="Supprimer"
        aria-label="Supprimer"
        aria-disabled={locked}
        className={[
          "flex h-10 w-10 items-center justify-center rounded-xl border text-lg font-bold shadow-sm transition",
          locked
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            : "border-red-200 bg-white text-red-700 hover:bg-red-50",
        ].join(" ")}
      >
        ×
      </button>
    </div>
  );
}
