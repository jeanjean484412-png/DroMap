import assert from "node:assert/strict";
import { test } from "node:test";
import { IDBFactory, IDBKeyRange, IDBObjectStore } from "fake-indexeddb";
import { loadSource } from "./security/load-source.mjs";

test("saving does not delete another revision, including after an ambiguous server failure", async () => {
  let row = {
    project_id: "carte",
    current_revision: "revision-0",
    chunk_count: 1,
    encoding: "base64",
    updated_at: "2026-11-20T10:00:00Z",
  };
  const available = new Set(["revision-A", "revision-B"]);
  const deletes = [];
  let failAfterCommit = false;
  const api = loadSource("app/api/dromap/projects/[projectId]/route.ts", {
    "@/lib/dromap/release-mode": { DROMAP_BETA: true },
    "@/lib/dromap/server/request-security": { withRequestSecurity: handler => handler },
    "@/lib/dromap/server/stored-payload": {
      measureStoredPayload: async path => {
        const revision = new URLSearchParams(path.split("?")[1]).get("revision").slice(3);
        assert.ok(available.has(revision));
        return 10;
      },
    },
    "@/lib/dromap/server/beta-projects": {
      saveBetaProject: async (_owner, _id, expected, _date, updates) => {
        if (row.current_revision !== expected) return Response.json([]);
        row = { ...row, ...updates };
        if (failAfterCommit) throw new Error("Response lost after commit");
        return Response.json([row]);
      },
    },
    "@/lib/dromap/server/supabase-rest": {
      getSupabaseConfig: () => true,
      getAuthenticatedRequestUser: async () => ({ user: { id: "test-owner" }, accessToken: "fake" }),
      parseJsonResponse: response => response.json(),
      supabaseRestFetch: async (path, _token, init) => {
        if (init.method === "DELETE") {
          deletes.push(path);
          return new Response(null, { status: 204 });
        }
        return Response.json([row]);
      },
    },
  });
  const save = (revision, expectedRevision) => api.PUT(
    new Request("http://localhost/projects/carte", {
      method: "PUT",
      body: JSON.stringify({ revision, expectedRevision, expectedUpdatedAt: row.updated_at, chunkCount: 1, encoding: "base64" }),
    }),
    { params: Promise.resolve({ projectId: "carte" }) },
  );
  assert.equal((await save("revision-A", "revision-0")).status, 200);
  failAfterCommit = true;
  assert.equal((await save("revision-B", "revision-A")).status, 503);
  assert.equal((await save("revision-B", "revision-A")).status, 200);
  assert.equal(row.current_revision, "revision-B");
  assert.deepEqual(deletes, []);
});

function createStoreHarness(t, remote = {}) {
  const values = new Map();
  const globals = {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    window: {
      localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
      queueMicrotask,
      setTimeout,
      clearTimeout,
    },
    navigator: { onLine: false },
  };
  for (const [key, value] of Object.entries(globals)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  const load = () => loadSource("stores/dromap-product.ts", {
    "@/lib/dromap/account": { getDromapSession: async () => ({ configured: true, authenticated: false }) },
    "@/lib/dromap/remote-projects": { fetchRemoteProjectSummaries: async () => [], ...remote },
  }).useDromapProductStore;
  const { createBlankDromapEditorProjectSnapshot: blank } = loadSource("lib/dromap/editor-project-persistence.ts");
  const store = load();
  const id = store.getState().createProject({ snapshot: blank(), setupComplete: true });
  const project = () => store.getState().projects.find(item => item.id === id);
  return { store, load, id, blank, project };
}

test("a conflict keeps local content and requires an explicit choice", async t => {
  class Conflict extends Error {
    constructor(current) { super("Conflict"); this.current = current; }
  }
  const current = { revision: "revision-2", updatedAt: "2026-11-20T10:02:00Z" };
  let remoteProject;
  let uploads = 0;
  let allowExplicitUpload = false;
  const { store, id, project, blank } = createStoreHarness(t, {
    RemoteProjectConflictError: Conflict,
    putRemoteProject: async (project, baseRevision) => {
      uploads += 1;
      if (!allowExplicitUpload) throw new Conflict(current);
      assert.equal(baseRevision, "revision-2");
      assert.equal(project.editorSnapshot.exportSettings.mapTitle, "Modifications locales");
      return { ...current, revision: "revision-local" };
    },
    fetchRemoteProject: async () => remoteProject,
    fetchRemoteProjectSummaries: async () => [remoteProject],
    createRemoteProjectMetadata: () => ({}),
  });
  const original = project();
  const snapshot = blank();
  snapshot.exportSettings.mapTitle = "Modifications locales";
  current.projectId = id;
  remoteProject = {
    ...original, remoteRevision: current.revision, remoteUpdatedAt: current.updatedAt,
    updatedAt: current.updatedAt, status: "saved",
  };
  store.setState({ userMode: "authenticated", accountUserId: "owner", projects: [{
    ...original, editorSnapshot: snapshot, updatedAt: "2026-11-20T10:01:00Z",
    remoteRevision: "revision-1", pendingChanges: 1, status: "sync-pending",
  }] });
  assert.equal(await store.getState().syncProjectNow(id), false);
  assert.equal(await store.getState().refreshRemoteProjects(), true);
  assert.equal(await store.getState().syncProjectNow(id), false);
  assert.equal(uploads, 1);
  assert.equal(project().editorSnapshot.exportSettings.mapTitle, "Modifications locales");
  assert.equal(store.getState().projectConflicts[id].remote.revision, current.revision);
  allowExplicitUpload = true;
  assert.equal(await store.getState().resolveProjectConflict(id, "local"), true);
  assert.equal(project().remoteRevision, "revision-local");
  assert.equal(project().editorSnapshot.exportSettings.mapTitle, "Modifications locales");
  assert.equal(store.getState().projectConflicts[id], undefined);

  store.setState({ projects: [{ ...project(), pendingChanges: 1, status: "sync-pending" }] });
  assert.equal(await store.getState().refreshRemoteProjects(), true);
  assert.equal(await store.getState().resolveProjectConflict(id, "remote"), true);
  assert.equal(project().remoteRevision, current.revision);
  assert.equal(store.getState().projectConflicts[id], undefined);
});

test("a local write failure keeps the editor dirty and is recoverable on retry", async t => {
  const { store, id, blank, project, load } = createStoreHarness(t);
  await store.getState().flushPersistence();
  const put = IDBObjectStore.prototype.put;
  let overQuota = true;
  t.mock.method(IDBObjectStore.prototype, "put", function (value, key) {
    if (overQuota && this.name === "project-cache") throw new DOMException("Storage full", "QuotaExceededError");
    return put.call(this, value, key);
  });
  t.mock.method(console, "warn", () => {});
  const snapshot = blank();
  snapshot.exportSettings.mapTitle = "Derniers changements";
  store.getState().markProjectSaving(id);
  assert.equal(await store.getState().saveProjectSnapshot(id, snapshot), false);
  assert.equal(project().status, "unsaved");
  assert.ok(store.getState().localSaveErrors[id]);
  assert.equal(project().editorSnapshot.exportSettings.mapTitle, "Derniers changements");
  overQuota = false;
  assert.equal(await store.getState().saveProjectSnapshot(id, snapshot), true);
  assert.equal(store.getState().localSaveErrors[id], undefined);
  const reopened = load();
  await reopened.getState().bootstrap();
  assert.equal((await reopened.getState().loadProject(id)).ok, true);
  assert.equal(reopened.getState().projects[0].editorSnapshot.exportSettings.mapTitle, "Derniers changements");
});

test("an expired session leaves the pending copy private and recovers it for the original account", async t => {
  const { store, id, project, load, blank } = createStoreHarness(t);
  const snapshot = blank();
  snapshot.exportSettings.mapTitle = "Travail en attente";
  store.setState({ userMode: "authenticated", accountUserId: "owner", projects: [{
    ...project(), editorSnapshot: snapshot, remoteRevision: "revision-1", pendingChanges: 1, status: "sync-pending",
  }] });
  await store.getState().flushPersistence();
  const reopened = load();
  await reopened.getState().bootstrap();
  assert.equal(reopened.getState().userMode, "guest");
  assert.equal((await reopened.getState().loadProject(id)).ok, false);
  await reopened.getState().activateAuthenticatedAccount({ userId: "another-owner", displayName: "Autre compte" });
  assert.equal((await reopened.getState().loadProject(id)).ok, false);
  await reopened.getState().activateAuthenticatedAccount({ userId: "owner", displayName: "Compte initial" });
  assert.equal((await reopened.getState().loadProject(id)).ok, true);
  assert.equal(reopened.getState().projects.find(item => item.id === id).editorSnapshot.exportSettings.mapTitle, "Travail en attente");
});
