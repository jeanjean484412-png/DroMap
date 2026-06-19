"use client";

import { useEffect } from "react";

import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestLayerCommandsStore } from "@/stores/editor-test-layer-commands";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { isFeatureLocked } from "@/lib/dromap/feature";
import {
  isFeatureEffectivelyLocked,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";

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

function deleteSelectedFeature() {
  const selectedFeatureId =
    useEditorTestSelectionStore.getState().selectedFeatureId;

  if (!selectedFeatureId) {
    return false;
  }

  const selectedFeature = useEditorTestFeaturesStore
    .getState()
    .features.find((feature) => feature.id === selectedFeatureId);

  if (!selectedFeature) {
    useEditorTestSelectionStore.getState().clearSelectedFeatureId();
    return false;
  }

  if (
    isFeatureLocked(selectedFeature) ||
    isFeatureEffectivelyLocked(selectedFeature, useEditorTestLayersStore.getState().layers)
  ) {
    return false;
  }

  useEditorTestLayerCommandsStore
    .getState()
    .requestDeleteFeatureLayer(selectedFeatureId);

  useEditorTestFeaturesStore
    .getState()
    .removeFeatureWithHistory(selectedFeatureId);

  useEditorTestSelectionStore.getState().clearSelectedFeatureId();

  return true;
}

export function EditorKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
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
          useEditorTestFeaturesStore.getState().redo();
          replayMapPointerSoon();
          return;
        }

        useEditorTestFeaturesStore.getState().undo();
        replayMapPointerSoon();
        return;
      }

      if (isUndoRedoShortcut && key === "y") {
        event.preventDefault();
        useEditorTestFeaturesStore.getState().redo();
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

      if (
        event.key === "Delete" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const didDelete = deleteSelectedFeature();

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
