import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSource } from "./security/load-source.mjs";

const original = { southWest: { lat: 45, lng: 2 }, northEast: { lat: 47, lng: 4 } };
const replacement = { southWest: { lat: 46, lng: 3 }, northEast: { lat: 49, lng: 6 } };

function loadEditor() {
  const mode = loadSource("stores/editor-mode.ts");
  const map = loadSource("stores/editor-map-view.ts");
  const history = loadSource("stores/editor-history-coordinator.ts");
  const mocks = {
    "@/stores/editor-mode": mode,
    "@/stores/editor-map-view": map,
    "@/stores/editor-history-coordinator": history,
  };
  const workspace = loadSource("stores/editor-workspace.ts", mocks);
  const { createDromapEditorProjectSnapshot } = loadSource("lib/dromap/editor-project-persistence.ts", {
    ...mocks,
    "@/stores/editor-workspace": workspace,
  });
  return {
    mode: mode.useEditorModeStore,
    map: map.useEditorMapViewStore,
    workspace: workspace.useEditorWorkspaceStore,
    save: createDromapEditorProjectSnapshot,
  };
}

test("un premier tracé reste un brouillon jusqu’à sa validation", () => {
  const { mode, map, workspace, save } = loadEditor();
  workspace.getState().setWorkspaceBounds(original);
  map.getState().setCurrentView({ center: { lat: 46, lng: 3 }, zoom: 8 });

  const saved = save();
  assert.equal(saved.workspaceBounds, null);
  assert.equal(saved.mapView, null);

  workspace.getState().cancelWorkspaceZoneModification();
  assert.equal(workspace.getState().workspaceBounds, null);
  assert.equal(mode.getState().currentMode, "workspace-select");
});

test("la sauvegarde et l’annulation retrouvent la dernière zone validée et son cadrage", () => {
  const { mode, map, workspace, save } = loadEditor();
  const actions = workspace.getState();
  const originalView = { center: { lat: 46, lng: 3 }, zoom: 8 };
  actions.setWorkspaceBounds(original);
  actions.validateWorkspaceZone();
  actions.consumePendingWorkspaceFit();
  actions.setWorkspaceBasemapBaseZoom(8);
  map.getState().setCurrentView(originalView);

  actions.modifyWorkspaceZone();
  actions.setWorkspaceBounds(replacement);
  map.getState().setCurrentView({ center: { lat: 47, lng: 4 }, zoom: 9 });
  const saved = save();
  assert.deepEqual(saved.workspaceBounds, original);
  assert.deepEqual(saved.mapView, originalView);
  assert.equal(saved.workspaceBasemapZoom, 8);

  actions.cancelWorkspaceZoneModification();
  assert.equal(mode.getState().currentMode, "edit");
  assert.deepEqual(workspace.getState().workspaceBounds, original);
  assert.deepEqual(map.getState().pendingRestoreView, originalView);

  actions.modifyWorkspaceZone();
  actions.setWorkspaceBounds(replacement);
  actions.validateWorkspaceZone();
  assert.deepEqual(save().workspaceBounds, replacement);
});
