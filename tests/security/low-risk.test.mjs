import assert from "node:assert/strict";
import { test } from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { loadSource } from "./load-source.mjs";
import { NextResponse } from "next/server.js";

test("session : cookie de renouvellement limité à 30 jours, HttpOnly, Secure et SameSite conservés", t => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  t.after(() => { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; });
  const auth = loadSource("lib/dromap/server/supabase-rest.ts");
  const response = auth.setAuthCookies(NextResponse.json({ ok: true }), "access-test", "refresh-test", 3600);
  const refresh = response.cookies.get(auth.DROMAP_REFRESH_COOKIE);
  assert.equal(refresh.maxAge, 30 * 86400);
  assert.equal(refresh.httpOnly, true);
  assert.equal(refresh.secure, true);
  assert.equal(refresh.sameSite, "lax");
  assert.equal(response.cookies.get(auth.DROMAP_ACCESS_COOKIE).maxAge, 3600);
  auth.clearAuthCookies(response);
  assert.equal(response.cookies.get(auth.DROMAP_REFRESH_COOKIE).maxAge, 0);
});

test("confidentialité : une ouverture IndexedDB retardée ne restaure pas le compte après déconnexion", async () => {
  const indexedDB = new IDBFactory();
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open("privacy", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  let release;
  let first = true;
  const delayedOpen = async () => {
    if (first) { first = false; await new Promise(resolve => { release = resolve; }); }
    return open();
  };
  const { createLatestIndexedWriter } = loadSource("lib/dromap/latest-indexed-writer.ts");
  const write = createLatestIndexedWriter(delayedOpen, "state", "account");
  const oldWrite = write({ accountEmail: "private@example.invalid", projects: ["private-map"] });
  assert.equal(await write({ accountEmail: null, projects: [] }), true);
  release();
  assert.equal(await oldWrite, false);
  const db = await open();
  const value = await new Promise((resolve, reject) => {
    const request = db.transaction("state").objectStore("state").get("account");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.deepEqual(value, { accountEmail: null, projects: [] });
  db.close();
});
