"use client";

import { useEffect, useRef } from "react";

import { useEditorExportStore } from "@/stores/editor-export";
import { useEditorMapLabelsStore } from "@/stores/editor-map-labels";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";

const MAX_RENDER_HISTORY = 80;
const RENDER_ACTION_GROUP_DELAY_MS = 240;

type SerializableState = Record<string, unknown>;

type RenderHistorySnapshot = {
  exportState: SerializableState;
  mapLabelsState: SerializableState;
  workspaceBasemapZoom: number | null;
};

function cloneSerializableValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function captureSerializableStoreState(
  state: Record<string, unknown>,
  excludedKeys: Set<string>,
): SerializableState {
  const result: SerializableState = {};

  for (const [key, value] of Object.entries(state)) {
    if (excludedKeys.has(key) || typeof value === "function") {
      continue;
    }

    result[key] = cloneSerializableValue(value);
  }

  return result;
}

function captureRenderSnapshot(): RenderHistorySnapshot {
  const exportState = useEditorExportStore.getState() as unknown as Record<
    string,
    unknown
  >;
  const mapLabelsState = useEditorMapLabelsStore.getState();

  return {
    exportState: captureSerializableStoreState(
      exportState,
      new Set([
        "isExportPanelOpen",
        "isImportPanelOpen",
        "advancedLegendEditorRequestId",
      ]),
    ),
    mapLabelsState: {
      showAllFeatureLabels: mapLabelsState.showAllFeatureLabels,
      showAllGeoJsonFeatureLabels: mapLabelsState.showAllGeoJsonFeatureLabels,
      featureMapLabelScale: mapLabelsState.featureMapLabelScale,
      featureMapLabelOutlineWidth: mapLabelsState.featureMapLabelOutlineWidth,
    },
    workspaceBasemapZoom:
      useEditorWorkspaceStore.getState().workspaceBasemapZoom,
  };
}

function snapshotSignature(snapshot: RenderHistorySnapshot) {
  return JSON.stringify(snapshot);
}

function restoreRenderSnapshot(snapshot: RenderHistorySnapshot) {
  (
    useEditorExportStore.setState as unknown as (
      partial: SerializableState,
    ) => void
  )(cloneSerializableValue(snapshot.exportState) as SerializableState);

  (
    useEditorMapLabelsStore.setState as unknown as (
      partial: SerializableState,
    ) => void
  )(cloneSerializableValue(snapshot.mapLabelsState) as SerializableState);

  useEditorWorkspaceStore
    .getState()
    .setWorkspaceBasemapZoom(snapshot.workspaceBasemapZoom);
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable ||
    Boolean(
      target.closest(
        "input, textarea, select, [contenteditable='true'], [data-dromap-native-text-history='true']",
      ),
    )
  );
}

/**
 * Historique autonome de « Légende & Rendu final ».
 *
 * L'éditeur reste monté derrière l'écran de rendu, mais Ctrl+Z / Ctrl+Y ne
 * doivent jamais remonter l'historique des objets pendant que cet écran est
 * actif. On mémorise donc seulement les stores réellement modifiés depuis le
 * rendu : configuration export/légende, réglages d'étiquettes et niveau de
 * détail du fond.
 *
 * Les changements continus (drag, slider) sont regroupés en une seule action
 * tant qu'ils se suivent à moins de quelques centaines de millisecondes.
 */
export function RenderKeyboardHistory() {
  const pastRef = useRef<RenderHistorySnapshot[]>([]);
  const futureRef = useRef<RenderHistorySnapshot[]>([]);
  const currentRef = useRef<RenderHistorySnapshot | null>(null);
  const currentSignatureRef = useRef("");
  const applyingRef = useRef(false);
  const groupActiveRef = useRef(false);
  const groupTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const initialSnapshot = captureRenderSnapshot();
    currentRef.current = initialSnapshot;
    currentSignatureRef.current = snapshotSignature(initialSnapshot);
    pastRef.current = [];
    futureRef.current = [];
    applyingRef.current = false;
    groupActiveRef.current = false;

    const finishCurrentGroupSoon = () => {
      if (groupTimerRef.current !== null) {
        window.clearTimeout(groupTimerRef.current);
      }

      groupTimerRef.current = window.setTimeout(() => {
        groupActiveRef.current = false;
        groupTimerRef.current = null;
      }, RENDER_ACTION_GROUP_DELAY_MS);
    };

    const handleStoreChange = () => {
      if (applyingRef.current) {
        return;
      }

      const nextSnapshot = captureRenderSnapshot();
      const nextSignature = snapshotSignature(nextSnapshot);

      if (nextSignature === currentSignatureRef.current) {
        return;
      }

      if (!groupActiveRef.current && currentRef.current) {
        pastRef.current = [
          ...pastRef.current,
          currentRef.current,
        ].slice(-MAX_RENDER_HISTORY);
        futureRef.current = [];
        groupActiveRef.current = true;
      }

      currentRef.current = nextSnapshot;
      currentSignatureRef.current = nextSignature;
      finishCurrentGroupSoon();
    };

    const unsubscribeExport = useEditorExportStore.subscribe(handleStoreChange);
    const unsubscribeLabels = useEditorMapLabelsStore.subscribe(handleStoreChange);
    const unsubscribeWorkspace = useEditorWorkspaceStore.subscribe(
      handleStoreChange,
    );

    const undoRender = () => {
      const previous = pastRef.current[pastRef.current.length - 1];

      if (!previous) {
        return;
      }

      if (groupTimerRef.current !== null) {
        window.clearTimeout(groupTimerRef.current);
        groupTimerRef.current = null;
      }
      groupActiveRef.current = false;

      const current = captureRenderSnapshot();
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [current, ...futureRef.current].slice(
        0,
        MAX_RENDER_HISTORY,
      );

      applyingRef.current = true;
      restoreRenderSnapshot(previous);
      currentRef.current = previous;
      currentSignatureRef.current = snapshotSignature(previous);
      applyingRef.current = false;
    };

    const redoRender = () => {
      const next = futureRef.current[0];

      if (!next) {
        return;
      }

      if (groupTimerRef.current !== null) {
        window.clearTimeout(groupTimerRef.current);
        groupTimerRef.current = null;
      }
      groupActiveRef.current = false;

      const current = captureRenderSnapshot();
      futureRef.current = futureRef.current.slice(1);
      pastRef.current = [...pastRef.current, current].slice(
        -MAX_RENDER_HISTORY,
      );

      applyingRef.current = true;
      restoreRenderSnapshot(next);
      currentRef.current = next;
      currentSignatureRef.current = snapshotSignature(next);
      applyingRef.current = false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const usesCommandKey = event.ctrlKey || event.metaKey;
      if (!usesCommandKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") {
        return;
      }

      // Dans un champ texte, le navigateur garde son historique de saisie
      // natif. L'historique de l'éditeur reste malgré tout neutralisé derrière.
      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (key === "y" || (key === "z" && event.shiftKey)) {
        redoRender();
      } else {
        undoRender();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      if (groupTimerRef.current !== null) {
        window.clearTimeout(groupTimerRef.current);
      }
      unsubscribeExport();
      unsubscribeLabels();
      unsubscribeWorkspace();
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return null;
}
