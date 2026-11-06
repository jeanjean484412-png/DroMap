import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSource } from "./security/load-source.mjs";

function store(beta, plan, userMode = "authenticated") {
  const { useDromapProductStore } = loadSource("stores/dromap-product.ts", {
    "@/lib/dromap/release-mode": { DROMAP_BETA: beta, DROMAP_BETA_PROJECT_LIMIT: 3 },
  });
  useDromapProductStore.setState({ userMode, accountPlan: plan });
  return useDromapProductStore;
}

test("beta: tester can create a fourth map without changing existing maps", () => {
  const s = store(true, "tester");
  for (let i = 0; i < 3; i++) assert.ok(s.getState().createProject());
  const original = s.getState().projects.slice();
  const id = s.getState().createProject();
  assert.ok(id);
  assert.deepEqual(s.getState().projects.slice(0, 3), original);
  assert.equal(s.getState().activeProjectId, id);
  assert.equal(s.getState().lastSyncError, null);
});

test("beta: other plans retain the three active map limit", () => {
  for (const plan of ["free", "plus", "pro"]) {
    const s = store(true, plan);
    for (let i = 0; i < 3; i++) assert.ok(s.getState().createProject());
    assert.equal(s.getState().createProject(), null);
    assert.equal(s.getState().projects.length, 3);
    s.setState({ projects: s.getState().projects.map((p, i) => i === 0 ? { ...p, status: "trashed" } : p) });
    assert.ok(s.getState().createProject());
  }
});

test("complete mode remains unlimited and guest replacement remains explicit", () => {
  const s = store(false, "free");
  for (let i = 0; i < 5; i++) assert.ok(s.getState().createProject());
  const guest = store(true, "tester", "guest");
  const old = guest.getState().createProject();
  assert.ok(old);
  assert.equal(guest.getState().createProject(), null);
  assert.ok(guest.getState().createProject({ replaceGuestProject: true }));
  assert.equal(guest.getState().projects.length, 1);
  assert.notEqual(guest.getState().projects[0].id, old);
});

test("beta: tester duplication and restoration preserve expiration checks", async () => {
  const s = store(true, "tester");
  const id = s.getState().createProject();
  s.getState().createProject();
  s.getState().createProject();
  const copy = await s.getState().duplicateProject(id);
  assert.ok(copy);
  s.setState({ projects: s.getState().projects.map(p => p.id === copy ? {
    ...p, status: "trashed", deletedAt: new Date().toISOString(),
    trashExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  } : p) });
  s.getState().restoreProject(copy);
  assert.equal(s.getState().projects.find(p => p.id === copy).status, "setup-incomplete");
  s.setState({ projects: s.getState().projects.map(p => p.id === copy ? {
    ...p, status: "trashed", deletedAt: new Date(Date.now() - 7200000).toISOString(),
    trashExpiresAt: new Date(Date.now() - 1000).toISOString(),
  } : p) });
  s.getState().restoreProject(copy);
  assert.equal(s.getState().projects.find(p => p.id === copy).status, "trashed");
});
