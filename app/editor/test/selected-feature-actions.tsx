"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DroMapFeature } from "@/lib/dromap/feature";
import {
  getFeatureLockOverride,
  isFeatureGeometryLocked,
} from "@/lib/dromap/feature";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestLayerCommandsStore } from "@/stores/editor-test-layer-commands";
import { useEditorTestMapLabelsStore } from "@/stores/editor-test-map-labels";
import { useEditorTestTextEditStore } from "@/stores/editor-test-text-edit";
import {
  getLayerForFeature,
  isFeatureEffectivelyLocked,
  isFeatureLayerLocked,
  isFeatureLayerVisible,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";

import { duplicateSelectedFeature } from "./feature-duplication";
import {
  getNextFeatureMapLabelVisibility,
  shouldShowFeatureMapLabel,
} from "./feature-map-labels";

function getFeatureTypeLabel(feature: DroMapFeature) {
  const type = feature.properties?.type;
  const geometryType = feature.geometry?.type;

  if (type === "text") return "texte";
  if (type === "marker" || geometryType === "Point") return "marqueur";
  if (type === "line" || geometryType === "LineString") return "ligne";
  if (type === "zone" || geometryType === "Polygon") return "zone";

  return "objet";
}

function getFeatureLabel(feature: DroMapFeature) {
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


type FloatingActionBarPosition = {
  x: number;
  y: number;
};


const ACTION_BAR_TOP_SAFE_AREA = 92;
const ACTION_BAR_BOTTOM_MARGIN = 18;
const ACTION_BAR_LEFT_SAFE_AREA = 148;
const ACTION_BAR_RIGHT_SAFE_AREA = 410;
const ACTION_BAR_OBJECT_GAP = 18;

function getSafeFeaturePaneSelector(featureId: string) {
  const safeFeatureId = featureId.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `.leaflet-dromap-feature-pane-${safeFeatureId}-pane`;
}

function getSelectedObjectScreenRect(featureIds: string[]) {
  const rects: DOMRect[] = [];

  for (const featureId of featureIds) {
    const pane = document.querySelector(getSafeFeaturePaneSelector(featureId));
    if (!pane) continue;

    pane
      .querySelectorAll<Element>(
        ".leaflet-marker-icon, .leaflet-interactive, .dromap-text-icon",
      )
      .forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) rects.push(rect);
      });
  }

  document
    .querySelectorAll<Element>(".dromap-feature-map-label-icon--draggable")
    .forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) rects.push(rect);
    });

  if (!rects.length) return null;

  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return { left, top, right, bottom };
}

function rectanglesOverlap(
  first: { left: number; top: number; right: number; bottom: number },
  second: { left: number; top: number; right: number; bottom: number },
  gap = 0,
) {
  return !(
    first.right + gap <= second.left ||
    first.left - gap >= second.right ||
    first.bottom + gap <= second.top ||
    first.top - gap >= second.bottom
  );
}

function clampActionBarPosition(
  position: FloatingActionBarPosition,
  width: number,
  height: number,
) {
  const minX = ACTION_BAR_LEFT_SAFE_AREA;
  const maxX = Math.max(
    minX,
    window.innerWidth - ACTION_BAR_RIGHT_SAFE_AREA - width,
  );
  const minY = ACTION_BAR_TOP_SAFE_AREA;
  const maxY = Math.max(
    minY,
    window.innerHeight - ACTION_BAR_BOTTOM_MARGIN - height,
  );

  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY),
  };
}

function chooseActionBarPosition(
  width: number,
  height: number,
  objectRect: { left: number; top: number; right: number; bottom: number } | null,
) {
  const minX = ACTION_BAR_LEFT_SAFE_AREA;
  const maxX = Math.max(
    minX,
    window.innerWidth - ACTION_BAR_RIGHT_SAFE_AREA - width,
  );
  const minY = ACTION_BAR_TOP_SAFE_AREA;
  const maxY = Math.max(
    minY,
    window.innerHeight - ACTION_BAR_BOTTOM_MARGIN - height,
  );
  const centerX = minX + (maxX - minX) / 2;
  const centerY = minY + (maxY - minY) / 2;
  const candidates: FloatingActionBarPosition[] = [
    { x: centerX, y: maxY },
    { x: centerX, y: minY },
    { x: minX, y: centerY },
    { x: maxX, y: centerY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY },
    { x: minX, y: minY },
    { x: maxX, y: minY },
  ].map((position) => clampActionBarPosition(position, width, height));

  if (!objectRect) return candidates[0];

  const objectCenterX = (objectRect.left + objectRect.right) / 2;
  const objectCenterY = (objectRect.top + objectRect.bottom) / 2;

  const ranked = candidates
    .map((position) => {
      const rect = {
        left: position.x,
        top: position.y,
        right: position.x + width,
        bottom: position.y + height,
      };
      const barCenterX = position.x + width / 2;
      const barCenterY = position.y + height / 2;
      const distance = Math.hypot(
        barCenterX - objectCenterX,
        barCenterY - objectCenterY,
      );
      const overlaps = rectanglesOverlap(rect, objectRect, ACTION_BAR_OBJECT_GAP);
      return { position, distance, overlaps };
    })
    .sort((first, second) => {
      if (first.overlaps !== second.overlaps) return first.overlaps ? 1 : -1;
      return second.distance - first.distance;
    });

  return ranked[0]?.position ?? candidates[0];
}

export function SelectedFeatureActions() {
  const requestDeleteFeatureLayer = useEditorTestLayerCommandsStore(
    (state) => state.requestDeleteFeatureLayer,
  );
  const features = useEditorTestFeaturesStore((state) => state.features);
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
  const selectedFeatureIds = useEditorTestSelectionStore(
    (state) => state.selectedFeatureIds,
  );
  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );
  const requestOpenFeatureInObjectsPanel = useEditorTestSelectionStore(
    (state) => state.requestOpenFeatureInObjectsPanel,
  );
  const showAllGeoJsonFeatureLabels = useEditorTestMapLabelsStore(
    (state) => state.showAllGeoJsonFeatureLabels,
  );
  const layers = useEditorTestLayersStore((state) => state.layers);
  const editingTextFeatureId = useEditorTestTextEditStore(
    (state) => state.editingTextFeatureId,
  );
  const [isDraggingSelectedObject, setIsDraggingSelectedObject] =
    useState(false);
  const [actionBarPosition, setActionBarPosition] =
    useState<FloatingActionBarPosition | null>(null);
  const actionBarPositionRef = useRef<FloatingActionBarPosition | null>(null);
  const actionBarRef = useRef<HTMLDivElement | null>(null);

  const featuresById = useMemo(
    () => new Map(features.map((feature) => [feature.id, feature])),
    [features],
  );
  const selectedFeature = selectedFeatureId
    ? featuresById.get(selectedFeatureId)
    : undefined;
  const selectedFeatures = selectedFeatureIds.flatMap((featureId) => {
    const feature = featuresById.get(featureId);
    return feature ? [feature] : [];
  });
  const effectiveSelectedFeatureIds = selectedFeatureIds.length
    ? selectedFeatureIds
    : selectedFeatureId
      ? [selectedFeatureId]
      : [];
  const selectedFeatureIdsSignature = effectiveSelectedFeatureIds.join("|");

  function commitActionBarPosition(position: FloatingActionBarPosition | null) {
    actionBarPositionRef.current = position;
    setActionBarPosition(position);
  }

  function repositionActionBar(force = false) {
    const bar = actionBarRef.current;
    if (!bar || typeof window === "undefined") return;

    const barRect = bar.getBoundingClientRect();
    const objectRect = getSelectedObjectScreenRect(effectiveSelectedFeatureIds);
    const currentPosition = actionBarPositionRef.current;
    const currentRect = currentPosition
      ? {
          left: currentPosition.x,
          top: currentPosition.y,
          right: currentPosition.x + barRect.width,
          bottom: currentPosition.y + barRect.height,
        }
      : null;

    if (
      !force &&
      currentPosition &&
      (!objectRect ||
        !rectanglesOverlap(
          currentRect!,
          objectRect,
          ACTION_BAR_OBJECT_GAP,
        ))
    ) {
      return;
    }

    const next = chooseActionBarPosition(
      barRect.width,
      barRect.height,
      objectRect,
    );
    if (
      !currentPosition ||
      Math.abs(currentPosition.x - next.x) > 1 ||
      Math.abs(currentPosition.y - next.y) > 1
    ) {
      commitActionBarPosition(next);
    }
  }

  useEffect(() => {
    if (
      typeof document === "undefined" ||
      !selectedFeature ||
      !effectiveSelectedFeatureIds.length
    ) {
      setIsDraggingSelectedObject(false);
      commitActionBarPosition(null);
      return;
    }

    commitActionBarPosition(null);
    let animationFrameId = 0;
    let placementFrameId = window.requestAnimationFrame(() =>
      repositionActionBar(true),
    );

    const pointerTargetsSelectedObject = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      if (target.closest("[data-dromap-action-bar='true']")) return false;
      if (target.closest(".dromap-feature-map-label-icon--draggable")) {
        return true;
      }

      return effectiveSelectedFeatureIds.some((featureId) =>
        Boolean(target.closest(getSafeFeaturePaneSelector(featureId))),
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !pointerTargetsSelectedObject(event.target)) {
        return;
      }
      setIsDraggingSelectedObject(true);
    };

    const onFeatureDragStart = (event: Event) => {
      const featureId =
        event instanceof CustomEvent &&
        typeof event.detail?.featureId === "string"
          ? event.detail.featureId
          : null;

      if (!featureId || effectiveSelectedFeatureIds.includes(featureId)) {
        setIsDraggingSelectedObject(true);
      }
    };

    const finishObjectDrag = () => {
      setIsDraggingSelectedObject(false);
      window.cancelAnimationFrame(placementFrameId);
      placementFrameId = window.requestAnimationFrame(() =>
        repositionActionBar(true),
      );
    };

    const monitorPlacement = () => {
      repositionActionBar(false);
      animationFrameId = window.requestAnimationFrame(monitorPlacement);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("dromap:feature-drag-start", onFeatureDragStart);
    window.addEventListener("dromap:feature-drag-end", finishObjectDrag);
    document.addEventListener("pointerup", finishObjectDrag, true);
    document.addEventListener("pointercancel", finishObjectDrag, true);
    window.addEventListener("blur", finishObjectDrag);
    window.addEventListener("resize", finishObjectDrag);
    animationFrameId = window.requestAnimationFrame(monitorPlacement);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.cancelAnimationFrame(placementFrameId);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("dromap:feature-drag-start", onFeatureDragStart);
      window.removeEventListener("dromap:feature-drag-end", finishObjectDrag);
      document.removeEventListener("pointerup", finishObjectDrag, true);
      document.removeEventListener("pointercancel", finishObjectDrag, true);
      window.removeEventListener("blur", finishObjectDrag);
      window.removeEventListener("resize", finishObjectDrag);
    };
  }, [selectedFeature?.id, selectedFeatureIdsSignature]);

  const floatingBarStyle = actionBarPosition
    ? { left: actionBarPosition.x, top: actionBarPosition.y }
    : {
        left: "50%",
        bottom: ACTION_BAR_BOTTOM_MARGIN,
        transform: "translateX(-50%)",
      };


  if (!selectedFeatureId || !selectedFeature) {
    return null;
  }

  // La barre disparaît pendant le déplacement réel de n’importe quel objet
  // (événement Geoman + détection directe du pointeur), puis réapparaît après
  // relâchement à un endroit qui ne recouvre pas l’objet sélectionné.
  if (
    isDraggingSelectedObject ||
    (selectedFeature.properties.type === "text" &&
      editingTextFeatureId === selectedFeature.id)
  ) {
    return null;
  }

  if (!isFeatureLayerVisible(selectedFeature, layers)) {
    return null;
  }

  if (selectedFeatures.length > 1) {
    return (
      <div
        className="pointer-events-none fixed z-[1600]"
        style={floatingBarStyle}
      >
        <div
          ref={actionBarRef}
          data-dromap-action-bar="true"
          className="pointer-events-auto flex max-w-[calc(100vw-36rem)] origin-center scale-[0.9] items-center gap-2 rounded-2xl border-2 border-violet-300 bg-white p-2 shadow-[0_16px_45px_rgba(15,23,42,0.32)] ring-1 ring-black/5"
        >
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-600">
              Sélection multiple
            </div>
            <div className="text-xs font-extrabold text-violet-950">
              {selectedFeatures.length} objets sélectionnés
            </div>
          </div>
          <button
            type="button"
            onClick={() => requestOpenFeatureInObjectsPanel(selectedFeatureId)}
            className="flex h-10 items-center justify-center whitespace-nowrap rounded-xl border border-violet-700 bg-violet-600 px-4 text-[11px] font-extrabold text-white shadow-sm transition hover:bg-violet-700"
          >
            Modifier ensemble
          </button>
          <button
            type="button"
            onClick={clearSelectedFeatureId}
            className="flex h-10 items-center justify-center whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Désélectionner
          </button>
        </div>
      </div>
    );
  }

  const selectedId = selectedFeature.id;
  const featureLayer = getLayerForFeature(selectedFeature, layers);
  const layerLocked = isFeatureLayerLocked(selectedFeature, layers);
  const lockOverride = getFeatureLockOverride(selectedFeature);
  const objectLocked =
    selectedFeature.properties?.locked === true || lockOverride === "locked";
  const locked = isFeatureEffectivelyLocked(selectedFeature, layers);
  const geometryLocked = isFeatureGeometryLocked(selectedFeature);
  const canChangeDrawOrder =
    !locked && selectedFeature.properties?.type !== "zone";
  const lockStatusLabel = getLockStatusLabel({ objectLocked, layerLocked });
  const lockButtonLabel = objectLocked
    ? "Déverrouiller l’objet"
    : "Verrouiller l’objet";
  const mapLabelShown = shouldShowFeatureMapLabel(
    selectedFeature,
    showAllGeoJsonFeatureLabels,
  );

  function toggleLocked() {
    updateFeatureWithHistory(selectedId, (currentFeature) => {
      const currentLockOverride = getFeatureLockOverride(currentFeature);
      const currentObjectLocked =
        currentFeature.properties?.locked === true ||
        currentLockOverride === "locked";
      const nextObjectLocked = !currentObjectLocked;
      const { lockOverride: _lockOverride, ...nextProperties } =
        currentFeature.properties;

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

  function toggleMapLabel() {
    updateFeatureWithHistory(selectedId, (currentFeature) => ({
      ...currentFeature,
      properties: {
        ...currentFeature.properties,
        mapLabelVisibility: getNextFeatureMapLabelVisibility(
          currentFeature,
          showAllGeoJsonFeatureLabels,
        ),
      },
    }));
  }

  function duplicateFeature() {
    if (locked || geometryLocked) return;
    duplicateSelectedFeature();
  }

  function bringToFront() {
    if (locked) return;
    reorderFeatureWithHistory(selectedId, "bring-to-front");
  }

  function sendToBack() {
    if (locked) return;
    reorderFeatureWithHistory(selectedId, "send-to-back");
  }

  function deleteSelectedFeature() {
    if (locked) return;

    requestDeleteFeatureLayer(selectedId);
    removeFeatureWithHistory(selectedId);
    clearSelectedFeatureId();
  }



  return (
    <div
      className="pointer-events-none fixed z-[1600]"
      style={floatingBarStyle}
    >
      <div
        ref={actionBarRef}
        data-dromap-action-bar="true"
        className="pointer-events-auto flex max-w-[calc(100vw-36rem)] origin-center scale-[0.9] flex-nowrap items-center gap-1 rounded-2xl border-2 border-slate-300 bg-white p-1.5 shadow-[0_16px_45px_rgba(15,23,42,0.32)] ring-1 ring-black/5"
      >
        <div className="min-w-[8.5rem] max-w-[10rem] shrink rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1.5">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-600">
            Objet sélectionné
          </div>
          <div className="truncate text-xs font-bold text-slate-950">
            {getFeatureLabel(selectedFeature)}
          </div>
          <div className="truncate text-[9px] font-medium text-slate-600">
            {getFeatureTypeLabel(selectedFeature)} · {featureLayer.name} ·{" "}
            {lockStatusLabel}
            {geometryLocked ? " · géométrie fixe" : ""}
          </div>
        </div>

        <button
          type="button"
          onClick={() => requestOpenFeatureInObjectsPanel(selectedFeatureId)}
          className="flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-violet-300 bg-violet-50 px-3 text-[11px] font-extrabold text-violet-800 shadow-sm transition hover:bg-violet-100"
        >
          Modifier
        </button>

        {selectedFeature.properties.type !== "text" ? (
          <button
            type="button"
            onClick={toggleMapLabel}
            disabled={locked}
            className={[
              "flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border px-3 text-[11px] font-bold shadow-sm transition",
              locked
                ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                : mapLabelShown
                  ? "border-emerald-400 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Étiquette {mapLabelShown ? "visible" : "masquée"}
          </button>
        ) : null}

        {!locked && canChangeDrawOrder ? (
          <div className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={sendToBack}
              title="Mettre en arrière-plan"
              className="flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-2 text-[10px] font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              Arrière
            </button>
            <button
              type="button"
              onClick={bringToFront}
              title="Mettre au premier plan"
              className="flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-slate-300 bg-white px-2 text-[10px] font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              Avant
            </button>
          </div>
        ) : selectedFeature.properties?.type === "zone" ? (
          <div className="shrink-0 whitespace-nowrap rounded-xl border border-slate-300 bg-slate-100 px-2 py-2 text-[10px] font-bold text-slate-600">
            Arrière-plan fixe
          </div>
        ) : null}

        <button
          type="button"
          onClick={toggleLocked}
          title={lockButtonLabel}
          className={[
            "flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border px-2.5 text-[11px] font-bold shadow-sm transition",
            locked
              ? "border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200"
              : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
          ].join(" ")}
        >
          {objectLocked ? "Déverrouiller" : "Verrouiller"}
        </button>

        <button
          type="button"
          onClick={duplicateFeature}
          disabled={locked || geometryLocked}
          title={
            geometryLocked
              ? "Un bâtiment importé conserve sa forme et sa position réelles."
              : "Dupliquer l’objet"
          }
          className={[
            "flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border px-3 text-[11px] font-extrabold shadow-sm transition",
            locked || geometryLocked
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              : "border-blue-700 bg-blue-600 text-white hover:bg-blue-700",
          ].join(" ")}
        >
          Dupliquer
        </button>

        <button
          type="button"
          onClick={deleteSelectedFeature}
          disabled={locked}
          className={[
            "flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border px-3 text-[11px] font-extrabold shadow-sm transition",
            locked
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              : "border-red-700 bg-red-600 text-white hover:bg-red-700",
          ].join(" ")}
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}
