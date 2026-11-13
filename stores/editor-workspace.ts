import { create } from "zustand";

import type { DromapMapView } from "@/lib/dromap/map-view";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import {
  commitEditorHistoryBeforeWorkspaceChange,
  registerWorkspaceHistoryAccessors,
} from "@/stores/editor-history-coordinator";
import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorMapViewStore } from "@/stores/editor-map-view";

const WORKSPACE_BASEMAP_DETAIL_DELTA = 1;

type ValidatedWorkspace = {
  workspaceBounds: WorkspaceBounds | null;
  workspaceBasemapZoom: number | null;
  workspaceBasemapBaseZoom: number | null;
  mapView: DromapMapView | null;
};

type EditorWorkspaceState = {
  workspaceBounds: WorkspaceBounds | null;
  workspaceBeforeModification: (ValidatedWorkspace & { workspaceNavigationUnlocked: boolean }) | null;
  pendingFitToWorkspace: boolean;
  /** Niveau de détail actuellement utilisé par le fond figé. */
  workspaceBasemapZoom: number | null;
  /** Niveau de détail vu par l'utilisateur au moment de la validation de zone. */
  workspaceBasemapBaseZoom: number | null;
  /**
   * Mode d'exploration temporaire de l'éditeur. Quand il est actif, l'utilisateur
   * peut zoomer plus loin dans la zone et le fond reprend son niveau de détail
   * natif au zoom courant. Cet état est volontairement éphémère : il ne modifie
   * ni la zone, ni le niveau de détail enregistré pour le rendu/export.
   */
  workspaceNavigationUnlocked: boolean;
  /** Verrou métier après le premier téléchargement d’un Export Max acheté à l’unité. */
  workspaceZoneEditLocked: boolean;

  setWorkspaceBounds: (bounds: WorkspaceBounds) => void;
  clearWorkspaceBounds: () => void;
  validateWorkspaceZone: () => void;
  modifyWorkspaceZone: () => void;
  cancelWorkspaceZoneModification: () => void;
  consumePendingWorkspaceFit: () => boolean;
  setWorkspaceBasemapZoom: (zoom: number | null) => void;
  setWorkspaceBasemapBaseZoom: (zoom: number | null) => void;
  setWorkspaceNavigationUnlocked: (unlocked: boolean) => void;
  setWorkspaceZoneEditLocked: (locked: boolean) => void;
  toggleWorkspaceNavigationUnlocked: () => void;
};

function normalizeBasemapZoom(zoom: number | null) {
  if (zoom === null || !Number.isFinite(zoom)) {
    return null;
  }

  const clampedZoom = Math.max(0, Math.min(20, zoom));

  // Le zoom de détail doit pouvoir rester fractionnaire : pendant la sélection
  // de zone, Leaflet/MapLibre peuvent être à 6.25, 6.5, etc. Arrondir à
  // l’entier changerait déjà les labels/détails du fond.
  return Math.round(clampedZoom * 4) / 4;
}

function workspaceBoundsEqual(
  first: WorkspaceBounds | null,
  second: WorkspaceBounds | null,
) {
  if (first === second) {
    return true;
  }

  if (!first || !second) {
    return false;
  }

  return (
    first.southWest.lat === second.southWest.lat &&
    first.southWest.lng === second.southWest.lng &&
    first.northEast.lat === second.northEast.lat &&
    first.northEast.lng === second.northEast.lng
  );
}

export const useEditorWorkspaceStore = create<EditorWorkspaceState>(
  (set, get) => ({
    workspaceBounds: null,
    workspaceBeforeModification: null,
    pendingFitToWorkspace: false,
    workspaceBasemapZoom: null,
    workspaceBasemapBaseZoom: null,
    workspaceNavigationUnlocked: false,
    workspaceZoneEditLocked: false,

    setWorkspaceBounds: (bounds) => {
      const state = get();
      if (state.workspaceZoneEditLocked && state.workspaceBounds !== null && !workspaceBoundsEqual(state.workspaceBounds, bounds)) {
        return;
      }
      if (workspaceBoundsEqual(state.workspaceBounds, bounds)) {
        return;
      }

      // En mode sélection, seul le cadrage validé entre dans l'historique.
      if (useEditorModeStore.getState().currentMode === "edit") {
        commitEditorHistoryBeforeWorkspaceChange();
      }
      set({
        workspaceBounds: bounds,
        workspaceBasemapZoom: null,
        workspaceBasemapBaseZoom: null,
        workspaceNavigationUnlocked: false,
      });
    },

    clearWorkspaceBounds: () => {
      const state = get();
      if (state.workspaceZoneEditLocked && state.workspaceBounds !== null) {
        return;
      }
      if (
        state.workspaceBounds === null &&
        !state.workspaceBeforeModification &&
        useEditorModeStore.getState().currentMode === "workspace-select"
      ) {
        return;
      }

      commitEditorHistoryBeforeWorkspaceChange();
      set({
        workspaceBounds: null,
        workspaceBeforeModification: null,
        pendingFitToWorkspace: false,
        workspaceBasemapZoom: null,
        workspaceBasemapBaseZoom: null,
        workspaceNavigationUnlocked: false,
      });

      useEditorModeStore.getState().setCurrentMode("workspace-select");
    },

    validateWorkspaceZone: () => {
      const state = get();
      if (!state.workspaceBounds) {
        return;
      }

      if (
        useEditorModeStore.getState().currentMode === "workspace-select" &&
        !workspaceBoundsEqual(state.workspaceBounds, state.workspaceBeforeModification?.workspaceBounds ?? null)
      ) {
        commitEditorHistoryBeforeWorkspaceChange();
      }
      set({
        workspaceBeforeModification: null,
        pendingFitToWorkspace: true,
        workspaceBasemapZoom: null,
        workspaceBasemapBaseZoom: null,
        workspaceNavigationUnlocked: false,
      });

      useEditorModeStore.getState().setCurrentMode("edit");
    },

    modifyWorkspaceZone: () => {
      const state = get();
      if (state.workspaceZoneEditLocked || useEditorModeStore.getState().currentMode === "workspace-select") {
        return;
      }
      set({
        workspaceBeforeModification: state.workspaceBounds
          ? { ...getValidatedWorkspace(), workspaceNavigationUnlocked: state.workspaceNavigationUnlocked }
          : null,
        pendingFitToWorkspace: false,
        workspaceBasemapZoom: null,
        workspaceBasemapBaseZoom: null,
        workspaceNavigationUnlocked: false,
      });

      useEditorModeStore.getState().setCurrentMode("workspace-select");
    },

    cancelWorkspaceZoneModification: () => {
      if (useEditorModeStore.getState().currentMode !== "workspace-select") return;

      const { workspaceBounds, workspaceBeforeModification: previous } = get();
      if (!workspaceBounds && !previous) return;

      if (previous) {
        const mapViewStore = useEditorMapViewStore.getState();
        mapViewStore.setCurrentView(previous.mapView);
        mapViewStore.requestRestoreView(previous.mapView);
      }

      set({
        workspaceBounds: previous?.workspaceBounds ?? null,
        workspaceBeforeModification: null,
        pendingFitToWorkspace: Boolean(previous?.workspaceBounds && !previous.mapView),
        workspaceBasemapZoom: previous?.workspaceBasemapZoom ?? null,
        workspaceBasemapBaseZoom: previous?.workspaceBasemapBaseZoom ?? null,
        workspaceNavigationUnlocked: previous?.workspaceNavigationUnlocked ?? false,
      });
      useEditorModeStore.getState().setCurrentMode(previous?.workspaceBounds ? "edit" : "workspace-select");
    },

    consumePendingWorkspaceFit: () => {
      const pending = get().pendingFitToWorkspace;

      if (pending) {
        set({ pendingFitToWorkspace: false });
      }

      return pending;
    },

    setWorkspaceBasemapZoom: (zoom) => {
      const normalizedZoom = normalizeBasemapZoom(zoom);

      set((state) => {
        const baseZoom = state.workspaceBasemapBaseZoom;

        if (
          normalizedZoom === null ||
          baseZoom === null ||
          !Number.isFinite(baseZoom)
        ) {
          return { workspaceBasemapZoom: normalizedZoom };
        }

        return {
          workspaceBasemapZoom: Math.min(
            Math.max(normalizedZoom, baseZoom - WORKSPACE_BASEMAP_DETAIL_DELTA),
            baseZoom + WORKSPACE_BASEMAP_DETAIL_DELTA,
          ),
        };
      });
    },

    setWorkspaceBasemapBaseZoom: (zoom) => {
      const normalizedZoom = normalizeBasemapZoom(zoom);

      set({
        workspaceBasemapBaseZoom: normalizedZoom,
        workspaceBasemapZoom: normalizedZoom,
      });
    },

    setWorkspaceZoneEditLocked: (locked) => {
      set({ workspaceZoneEditLocked: locked });
      if (locked) get().cancelWorkspaceZoneModification();
    },

    setWorkspaceNavigationUnlocked: (unlocked) => {
      if (
        unlocked &&
        (!get().workspaceBounds ||
          useEditorModeStore.getState().currentMode !== "edit")
      ) {
        return;
      }

      set({ workspaceNavigationUnlocked: unlocked });
    },

    toggleWorkspaceNavigationUnlocked: () => {
      const state = get();

      if (
        !state.workspaceBounds ||
        useEditorModeStore.getState().currentMode !== "edit"
      ) {
        return;
      }

      set({
        workspaceNavigationUnlocked: !state.workspaceNavigationUnlocked,
      });
    },
  }),
);

export function getValidatedWorkspace(): ValidatedWorkspace {
  const state = useEditorWorkspaceStore.getState();
  if (state.workspaceBeforeModification) return state.workspaceBeforeModification;

  const validated = useEditorModeStore.getState().currentMode === "edit" || state.pendingFitToWorkspace;
  return {
    workspaceBounds: validated ? state.workspaceBounds : null,
    workspaceBasemapZoom: validated ? state.workspaceBasemapZoom : null,
    workspaceBasemapBaseZoom: validated ? state.workspaceBasemapBaseZoom : null,
    mapView: validated && state.workspaceBounds ? useEditorMapViewStore.getState().currentView : null,
  };
}

registerWorkspaceHistoryAccessors({
  capture: () => {
    const state = useEditorWorkspaceStore.getState();
    const workspace = getValidatedWorkspace();
    return {
      workspaceBounds: workspace.workspaceBounds
        ? structuredClone(workspace.workspaceBounds)
        : null,
      pendingFitToWorkspace: state.workspaceBeforeModification ? true : state.pendingFitToWorkspace,
      workspaceBasemapZoom: workspace.workspaceBasemapZoom,
      workspaceBasemapBaseZoom: workspace.workspaceBasemapBaseZoom,
      currentMode: workspace.workspaceBounds ? "edit" : "workspace-select",
    };
  },
  restore: (snapshot) => {
    const current = useEditorWorkspaceStore.getState();
    const preserveLockedZone = current.workspaceZoneEditLocked && current.workspaceBounds !== null;
    useEditorWorkspaceStore.setState({
      workspaceBeforeModification: null,
      workspaceBounds: preserveLockedZone
        ? structuredClone(current.workspaceBounds)
        : snapshot.workspaceBounds
          ? structuredClone(snapshot.workspaceBounds)
          : null,
      pendingFitToWorkspace: preserveLockedZone ? false : snapshot.pendingFitToWorkspace,
      workspaceBasemapZoom: snapshot.workspaceBasemapZoom,
      workspaceBasemapBaseZoom: snapshot.workspaceBasemapBaseZoom,
      workspaceNavigationUnlocked: false,
    });
    useEditorModeStore
      .getState()
      .setCurrentMode(preserveLockedZone ? "edit" : snapshot.currentMode);
  },
});
