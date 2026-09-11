"use client";

import { useEffect } from "react";

import { useEditorFeaturesStore } from "@/stores/editor-features";
import { useEditorLayerCommandsStore } from "@/stores/editor-layer-commands";
import { useEditorSelectionStore } from "@/stores/editor-selection";
import { useEditorExportStore } from "@/stores/editor-export";
import { isFeatureLocked } from "@/lib/dromap/feature";
import {
  isFeatureEffectivelyLocked,
  useEditorLayersStore,
} from "@/stores/editor-layers";

import { duplicateSelectedFeature } from "./feature-duplication";

const GEOMAN_CURSOR_REPLAY_EVENT = "dromap:replay-map-pointer";

function replayMapPointerSoon() {
  window.setTimeout(() => {
    window.dispatchEvent(new Event(GEOMAN_CURSOR_REPLAY_EVENT));
  }, 0);
  window.setTimeout(() => {
    window.dispatchEvent(new Event(GEOMAN_CURSOR_REPLAY_EVENT));
  }, 120);
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  ) {
    return true;
  }

  if (
    target.closest("input") ||
    target.closest("textarea") ||
    target.closest("select") ||
    target.closest("[contenteditable='true']") ||
    target.closest("[data-dromap-ignore-shortcuts='true']")
  ) {
    return true;
  }

  return false;
}

function deleteSelectedFeatures() {
  const selectionState = useEditorSelectionStore.getState();
  const selectedFeatureIds = selectionState.selectedFeatureIds.length
    ? selectionState.selectedFeatureIds
    : selectionState.selectedFeatureId
      ? [selectionState.selectedFeatureId]
      : [];

  if (selectedFeatureIds.length === 0) {
    return false;
  }

  const layers = useEditorLayersStore.getState().layers;
  const selectedIdSet = new Set(selectedFeatureIds);
  const deletableFeatures = useEditorFeaturesStore
    .getState()
    .features.filter(
      (feature) =>
        selectedIdSet.has(feature.id) &&
        !isFeatureLocked(feature) &&
        !isFeatureEffectivelyLocked(feature, layers),
    );

  if (deletableFeatures.length === 0) {
    return false;
  }

  for (const feature of deletableFeatures) {
    useEditorLayerCommandsStore
      .getState()
      .requestDeleteFeatureLayer(feature.id);
  }

  useEditorFeaturesStore
    .getState()
    .removeFeaturesWithHistory(deletableFeatures.map((feature) => feature.id));

  selectionState.clearSelectedFeatureId();

  return true;
}

export function EditorKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }

      // « Légende & Rendu final » reste monté au-dessus de l'éditeur. Tant
      // qu'il est ouvert, aucun raccourci ne doit modifier l'historique ou la
      // sélection de l'éditeur caché derrière. Son propre contrôleur gère
      // Ctrl+Z/Ctrl+Y dans ce contexte.
      const exportState = useEditorExportStore.getState();
      if (exportState.isExportPanelOpen || exportState.isImportPanelOpen) {
        return;
      }

      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const isUndoRedoShortcut = event.ctrlKey || event.metaKey;

      if (isUndoRedoShortcut && key === "z") {
        event.preventDefault();

        if (event.shiftKey) {
          useEditorFeaturesStore.getState().redo();
          replayMapPointerSoon();
          return;
        }

        useEditorFeaturesStore.getState().undo();
        replayMapPointerSoon();
        return;
      }

      if (isUndoRedoShortcut && key === "y") {
        event.preventDefault();
        useEditorFeaturesStore.getState().redo();
        replayMapPointerSoon();
        return;
      }

      if (isUndoRedoShortcut && key === "d" && !event.shiftKey && !event.altKey) {
        const didDuplicate = duplicateSelectedFeature();

        if (didDuplicate) {
          event.preventDefault();
          replayMapPointerSoon();
        }

        return;
      }

      if (event.key === "Escape") {
        const hasSelection =
          useEditorSelectionStore.getState().selectedFeatureIds.length > 0;

        if (hasSelection) {
          event.preventDefault();
          useEditorSelectionStore.getState().clearSelectedFeatureId();
          return;
        }
      }

      if (
        event.key === "Delete" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const didDelete = deleteSelectedFeatures();

        if (didDelete) {
          event.preventDefault();
          replayMapPointerSoon();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return null;
}
