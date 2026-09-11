import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { gzipSync, gunzipSync } from "node:zlib";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import { IDBFactory } from "fake-indexeddb";
import { loadSource } from "./load-source.mjs";

const userId = "user-a";
const now = Math.floor(Date.now() / 1000);
function token(method = "otp", timestamp = now, sub = userId) {
  return `header.${Buffer.from(JSON.stringify({ sub, exp: now + 3600, amr: [{ method, timestamp }] })).toString("base64url")}.signature`;
}
const proof = loadSource("lib/dromap/server/recovery-session.ts");

test("récupération : seule une preuve récente du JWT vérifié autorise le changement", () => {
  for (const method of ["otp", "recovery"]) assert.equal(proof.hasRecentRecoveryProof(token(method), userId), true);
  for (const value of ["1", token("password"), token("otp", now - 601), token("otp", now + 30), token("otp", now, "other")]) {
    assert.equal(proof.hasRecentRecoveryProof(value, userId), false);
  }
});

test("adopt : purpose=recovery avec session mot de passe rejeté avant émission des cookies", async () => {
  const route = loadSource("app/api/dromap/auth/adopt/route.ts", {
    "@/lib/dromap/server/supabase-rest": {
      getSupabaseConfig: () => ({}), fetchSupabaseUser: async () => ({ response: { ok: true }, user: { id: userId } }),
      setAuthCookies: () => { throw new Error("Ne doit pas émettre de cookies"); },
    },
  });
  const response = await route.POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: token("password"), refreshToken: "r", purpose: "recovery" }) }));
  assert.equal(response.status, 401);
});

test("mot de passe : cookie falsifié, ancien mot de passe et récupération vérifiée", async () => {
  for (const [cookie, access, currentPassword, verified, expected] of [
    ["1", token("password"), "", true, 400],
    [token("password"), token("password"), "", true, 400],
    [token(), token(), "", false, 400],
    [token(), token(), "", true, 200],
    [undefined, token("password"), "old-password", true, 200],
  ]) {
    let writes = 0;
    const route = loadSource("app/api/dromap/account/password/route.ts", {
      "next/headers": { cookies: async () => ({ get: () => ({ value: cookie }) }) },
      "@/lib/dromap/server/supabase-rest": {
        DROMAP_RECOVERY_COOKIE: "recovery", getSupabaseConfig: () => ({}),
        getAuthenticatedRequestUser: async () => ({ accessToken: access, user: { id: userId, email: "test@example.invalid" } }),
        fetchSupabaseUser: async () => ({ response: { ok: verified }, user: verified ? { id: userId } : null }),
        verifySupabasePassword: async (_email, password) => password === "old-password",
        supabaseAuthFetch: async () => { writes++; return new Response(null, { status: 200 }); },
      },
    });
    const response = await route.POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "new-password", currentPassword }) }));
    assert.equal(response.status, expected);
    assert.equal(writes, expected === 200 ? 1 : 0);
  }
});

test("SVG : événements, scripts, HTML et références externes retirés ; formes et hachures conservées", () => {
  const window = new JSDOM("").window;
  const { sanitizeMarkerSvg } = loadSource("lib/dromap/safe-marker-svg.ts", { dompurify: createDOMPurify(window) });
  const clean = sanitizeMarkerSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" onload="evil()"><defs><pattern id="hatch-1" width="4" height="4"><path d="M0 0L4 4" stroke="#000"/></pattern></defs><rect width="100" height="100" fill="url(#hatch-1)"/><script>evil()</script><foreignObject><img src="x" onerror="evil()"/></foreignObject><image href="https://example.invalid/secret"/><style>@import 'https://example.invalid';</style><path stroke="url(https://example.invalid)" d="M1 1L2 2"/><text style="background:url(https://example.invalid)">Carte</text></svg>`);
  const root = new window.DOMParser().parseFromString(clean, "image/svg+xml");
  assert.equal(root.querySelectorAll("script,foreignObject,image,style").length, 0);
  assert.equal(root.querySelectorAll("[onload],[onerror],[style],[href]").length, 0);
  assert.equal(root.querySelector("rect").getAttribute("fill"), "url(#hatch-1)");
  assert.equal(root.querySelectorAll("path").length, 2);
  assert.equal(root.querySelector("text").textContent, "Carte");
  assert.equal(clean.includes("example.invalid"), false);
  window.close();
});

test("IA : anonyme, plan gratuit, quota dépassé et stockage indisponible échouent sans accès IA", async () => {
  for (const [authenticated, plan, allowed, expected] of [[false, "plus", true, 401], [true, "free", true, 403], [true, "plus", false, 429], [true, "pro", "error", 503], [true, "plus", true, null], [true, "tester", true, null]]) {
    let calls = 0;
    const { checkAiAccess } = loadSource("lib/dromap/server/ai-access.ts", {
      "./supabase-rest": { getAuthenticatedRequestUser: async () => authenticated ? { accessToken: "verified", user: { id: userId } } : null },
      "./billing": { getDromapBillingAccessForSession: async () => ({ plan }) },
      "./security-rpc": { securityRpc: async (_name, parameters) => { calls++; assert.equal(parameters.p_user_id, userId); if (allowed === "error") throw new Error(); return allowed; } },
    });
    assert.equal((await checkAiAccess())?.status ?? null, expected);
    if (!authenticated || plan === "free") assert.equal(calls, 0);
  }
});

test("routes IA et import : la garde est appelée avant lecture du prompt ou de l'URL", async () => {
  for (const [file, method] of [["app/api/dromap/ai/route.ts", "POST"], ["app/api/dromap/ai/fetch-geojson/route.ts", "GET"]]) {
    const route = loadSource(file, { "@/lib/dromap/server/ai-access": { checkAiAccess: async () => new Response(null, { status: 401 }) } });
    const request = new Request("http://localhost/api/dromap/ai", { method, ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: "not-json" } : {}) });
    assert.equal((await route[method](request)).status, 401);
  }
});

test("SSRF : IPv4 privées, IPv6 mappées, multicast et réseaux réservés refusés", () => {
  const { isPublicAddress } = loadSource("lib/dromap/server/public-url.ts");
  for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "fd00::1", "fe80::1", "2001:db8::1", "224.0.0.1"]) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(ip), true, ip);
});

function publicUrlFixture({ addresses = [{ address: "8.8.8.8", family: 4 }], status = 200, headers = {}, chunks = [Buffer.from('{}')] } = {}) {
  let lookups = 0, connections = 0;
  function request(url, options, callback) {
    connections++;
    assert.equal(url.hostname, "source.example.invalid");
    options.lookup(url.hostname, { all: true }, (error, result) => { assert.equal(error, null); assert.deepEqual(result, addresses); });
    const req = new EventEmitter();
    req.end = () => { const res = Readable.from(chunks); res.statusCode = status; res.headers = headers; callback(res); };
    return req;
  }
  const api = loadSource("lib/dromap/server/public-url.ts", {
    "node:dns/promises": { lookup: async () => { lookups++; return lookups === 1 ? addresses : [{ address: "127.0.0.1", family: 4 }]; } },
    "node:http": { request }, "node:https": { request },
  });
  return { ...api, counts: () => ({ lookups, connections }) };
}

test("SSRF : connexion épinglée à la résolution contrôlée, sans second DNS", async () => {
  const api = publicUrlFixture();
  assert.equal(await api.readPublicUrl(new URL("https://source.example.invalid/map"), 100, 5000), '{}');
  assert.deepEqual(api.counts(), { lookups: 1, connections: 1 });
  const denied = publicUrlFixture({ addresses: [{ address: "127.0.0.1", family: 4 }] });
  await assert.rejects(denied.readPublicUrl(new URL("https://source.example.invalid/map"), 100, 5000));
  assert.equal(denied.counts().connections, 0);
});

test("import : redirection refusée, taille bornée en streaming et gzip valide conservé", async () => {
  const url = new URL("https://source.example.invalid/map");
  await assert.rejects(publicUrlFixture({ status: 302 }).readPublicUrl(url, 100, 5000));
  await assert.rejects(publicUrlFixture({ chunks: [Buffer.alloc(60), Buffer.alloc(60)] }).readPublicUrl(url, 100, 5000));
  const json = JSON.stringify({ type: "FeatureCollection", features: [] });
  assert.equal(await publicUrlFixture({ headers: { "content-encoding": "gzip" }, chunks: [gzipSync(json)] }).readPublicUrl(url, 1000, 5000), json);
  await assert.rejects(publicUrlFixture({ headers: { "content-encoding": "gzip" }, chunks: [gzipSync('a'.repeat(5000))] }).readPublicUrl(url, 100, 5000));
});

test("publication : les champs privés sont retirés des sources base64 et gzip", async () => {
  const { sanitizePublicationChunks } = loadSource("lib/dromap/server/publication-content.ts");
  const project = { name: "Nom privé", owner_id: "secret", aiConversation: [{ text: "conversation privée" }], editorSnapshot: { schemaVersion: 1, features: [{ id: "feature", geometry: { type: "Point", coordinates: [1,2] } }], layers: [{ id: "layer" }], customMarkers: [], aiConversation: "secret" }, setup: { basemapId: "osm", privateField: "secret" } };
  for (const encoding of ["base64", "gzip-base64"]) {
    const json = Buffer.from(JSON.stringify(project));
    const encoded = (encoding === "base64" ? json : gzipSync(json)).toString("base64");
    const result = await sanitizePublicationChunks([encoded.slice(0, 17), encoded.slice(17)], encoding);
    const content = JSON.parse(gunzipSync(Buffer.from(result.chunks.join(""), "base64")));
    assert.deepEqual(content.editorSnapshot.features, project.editorSnapshot.features);
    assert.deepEqual(content.editorSnapshot.layers, project.editorSnapshot.layers);
    assert.equal(JSON.stringify(content).includes("secret"), false);
    assert.equal(content.aiConversation, undefined);
    assert.equal(content.name, undefined);
  }
});

test("copie : preuve serveur liée au compte, au slug et à un nouveau projet", () => {
  const api = loadSource("lib/dromap/server/publication-copy-proof.ts", { "./supabase-rest": { getSupabaseAdminKey: () => "cle-de-test-sans-acces-reel" } });
  const copy = api.createPublicationCopyProof(userId, "carte");
  assert.equal(api.verifyPublicationCopyProof(copy.token, userId, "carte", copy.projectId), true);
  for (const [user, slug, id] of [["autre", "carte", copy.projectId], [userId, "autre", copy.projectId], [userId, "carte", "projet-existant"]]) assert.equal(api.verifyPublicationCopyProof(copy.token, user, slug, id), false);
  assert.equal(api.verifyPublicationCopyProof(copy.token.slice(0, -4) + "AAAA", userId, "carte", copy.projectId), false);
  assert.equal(api.verifyPublicationCopyProof(undefined, userId, "carte", copy.projectId), false);
});

test("cache : isolation des comptes, migration attribuée et purge du seul propriétaire", async () => {
  const { createScopedProjectCache } = loadSource("lib/dromap/scoped-project-cache.ts");
  const indexedDB = new IDBFactory();
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open("cache", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  let scope = "user:a";
  const legacyOwners = new Map([["legacy", scope]]);
  const cache = createScopedProjectCache(open, "projects", () => scope, legacyOwners);
  await cache.write("same-id", { project: { private: "A" } });
  scope = "user:b";
  assert.equal(await cache.read("same-id"), null);
  await cache.write("same-id", { project: { private: "B" } });
  scope = "user:a";
  assert.equal((await cache.read("same-id")).project.private, "A");
  const db = await open();
  await new Promise(resolve => { const tx = db.transaction("projects", "readwrite"); tx.objectStore("projects").put({ project: { private: "legacy A" } }, "legacy"); tx.oncomplete = resolve; });
  db.close();
  assert.equal((await cache.read("legacy")).project.private, "legacy A");
  scope = "user:b";
  assert.equal(await cache.read("legacy"), null);
  await cache.clearOwner("user:a");
  assert.equal((await cache.read("same-id")).project.private, "B");
  scope = "user:a";
  assert.equal(await cache.read("same-id"), null);
  assert.equal(await cache.read("legacy"), null);
});

test("cache : une écriture retardée ne traverse pas un changement de compte", async () => {
  const { createScopedProjectCache } = loadSource("lib/dromap/scoped-project-cache.ts");
  const indexedDB = new IDBFactory();
  const open = () => new Promise(resolve => {
    const request = indexedDB.open("delayed", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
  });
  let scope = "a", release;
  const delayed = createScopedProjectCache(() => new Promise(resolve => { release = resolve; }), "projects", () => scope, new Map());
  const writing = delayed.write("private", { project: "contenu A" });
  scope = "b";
  release(await open());
  await writing;
  const cache = createScopedProjectCache(open, "projects", () => scope, new Map());
  assert.equal(await cache.read("private"), null);
  scope = "a";
  assert.equal(await cache.read("private"), null);
});

test("session serveur : un transfert du compte A est refusé sous les cookies du compte B", async t => {
  const values = { NEXT_PUBLIC_SUPABASE_URL: "https://auth.example.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test" };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const key of Object.keys(values)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  t.mock.method(globalThis, "fetch", async () => Response.json({ id: "b" }));
  const auth = loadSource("lib/dromap/server/supabase-rest.ts", {
    "next/headers": { cookies: async () => ({ get: () => ({ value: "token-b" }) }) },
  });
  assert.equal(await auth.getAuthenticatedRequestUser("a"), null);
  assert.equal((await auth.getAuthenticatedRequestUser("b")).user.id, "b");
  // Même contrôle lorsque /auth/v1/user est servi par le cache d'authentification.
  assert.equal(await auth.getAuthenticatedRequestUser("a"), null);
});

test("register-copy : impossible d'accorder l'export à un autre projet avec une preuve valide", async () => {
  const proofModule = loadSource("lib/dromap/server/publication-copy-proof.ts", { "./supabase-rest": { getSupabaseAdminKey: () => "secret-test" } });
  const copy = proofModule.createPublicationCopyProof(userId, "carte");
  let grants = 0;
  const route = loadSource("app/api/dromap/publications/[slug]/register-copy/route.ts", {
    "@/lib/dromap/server/publication-copy-proof": proofModule,
    "@/lib/dromap/server/supabase-rest": { getAuthenticatedRequestUser: async () => ({ user: { id: userId }, accessToken: "verified" }) },
    "@/lib/dromap/server/billing": {
      getDromapBillingAccessForSession: async () => ({ plan: "free" }),
      userOwnsDromapProject: async () => true,
      grantDromapPublicMapProjectExport: async () => { grants++; return true; },
    },
    "@/lib/dromap/server/publications": { readPublicationBySlug: async () => ({}), getPublicationViewerAccess: async () => ({ canEdit: true, purchased: true }) },
  });
  const call = projectId => route.POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, copyToken: copy.token }) }), { params: Promise.resolve({ slug: "carte" }) });
  assert.equal((await call("projet-sans-rapport")).status, 403);
  assert.equal(grants, 0);
  assert.equal((await call(copy.projectId)).status, 200);
  assert.equal(grants, 1);
});
