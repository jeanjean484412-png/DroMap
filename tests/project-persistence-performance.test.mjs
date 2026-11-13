import assert from "node:assert/strict";
import { test } from "node:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { loadSource } from "./security/load-source.mjs";

test("un checkpoint conserve le contenu après rechargement sans réécrire les autres projets", async (t) => {
  const descriptors = Object.fromEntries(["window", "indexedDB"].map((key) => [
    key, Object.getOwnPropertyDescriptor(globalThis, key),
  ]));
  const storage = new Map();
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
      queueMicrotask,
      setTimeout,
      clearTimeout,
    },
  });
  t.after(() => {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  const projectWrites = [];
  const originalPut = IDBObjectStore.prototype.put;
  t.mock.method(IDBObjectStore.prototype, "put", function (value, key) {
    if (this.name === "project-cache") projectWrites.push(key[1]);
    return originalPut.call(this, value, key);
  });

  const loadStore = () => loadSource("stores/dromap-product.ts", {
    "@/lib/dromap/account": {
      getDromapSession: async () => ({ configured: true, authenticated: false, account: null }),
    },
  }).useDromapProductStore;
  const { createBlankDromapEditorProjectSnapshot } = loadSource("lib/dromap/editor-project-persistence.ts");
  const store = loadStore();
  const id = store.getState().createProject({ snapshot: createBlankDromapEditorProjectSnapshot(), setupComplete: true });
  assert.ok(id);
  const other = { ...store.getState().projects[0], id: "another-loaded-project" };
  store.setState((state) => ({ projects: [...state.projects, other] }));
  await store.getState().flushPersistence();
  projectWrites.length = 0;

  const snapshot = createBlankDromapEditorProjectSnapshot();
  snapshot.exportSettings.mapTitle = "Dernier geste enregistré";
  store.getState().markProjectDirty(id);
  await store.getState().checkpointProjectSnapshot(id, snapshot);
  await store.getState().flushPersistence();
  assert.deepEqual(projectWrites, [id]);

  const reopened = loadStore();
  await reopened.getState().bootstrap();
  assert.equal((await reopened.getState().loadProject(id)).ok, true);
  const project = reopened.getState().projects.find((candidate) => candidate.id === id);
  assert.equal(project.editorSnapshot.exportSettings.mapTitle, "Dernier geste enregistré");
  assert.equal(project.pendingChanges, 1);
});

test("le codec garde les anciens formats gzip et base64 et les caractères UTF-8", async () => {
  const { encodeProject, decodeProject } = loadSource("lib/dromap/project-payload-codec.ts");
  const project = { id: "carte", name: "École de l’été", remoteRevision: "revision", contentLoaded: true };
  const serialized = { id: project.id, name: project.name };
  const result = await encodeProject(project);
  assert.deepEqual(await decodeProject(result.encoded, result.encoding), serialized);
  const oldBase64 = Buffer.from(JSON.stringify(serialized)).toString("base64");
  assert.deepEqual(await decodeProject(oldBase64, "base64"), serialized);
  assert.equal(result.payloadSizeBytes, Buffer.byteLength(JSON.stringify(serialized)));
});
