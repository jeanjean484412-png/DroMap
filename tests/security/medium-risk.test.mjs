import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import sharp from "sharp";
import { loadSource } from "./load-source.mjs";

const { withRequestSecurity, checkRequestOrigin } = loadSource("lib/dromap/server/request-security.ts");
const jsonRequest = (path, body, headers = {}) => new Request(`https://dromap.fr/api/dromap/${path}`, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});

test("CSRF : origines externes, sous-domaines, null et navigations refusés ; même origine acceptée", async () => {
  for (const headers of [{ origin: "https://evil.invalid" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { referer: "https://evil.invalid/" }]) {
    assert.equal(checkRequestOrigin(jsonRequest("auth/adopt", {}, headers)), false);
    const response = await withRequestSecurity(async () => { throw new Error("Handler atteint"); })(jsonRequest("auth/adopt", {}, headers));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  for (const headers of [{}, { origin: "https://dromap.fr", "sec-fetch-site": "same-origin" }, { referer: "https://dromap.fr/login" }]) {
    assert.equal(checkRequestOrigin(jsonRequest("auth/adopt", {}, headers)), true);
  }
  assert.equal(checkRequestOrigin(new Request("http://localhost:3010/api/dromap/auth/adopt", { headers: { host: "127.0.0.1:3010", origin: "http://127.0.0.1:3010" } })), true);
  assert.equal(checkRequestOrigin(jsonRequest("auth/adopt", {}, { host: "dromap.fr", origin: "https://evil.invalid", "x-forwarded-host": "evil.invalid" })), false);
  const session = withRequestSecurity(async () => { throw new Error("Session rafraîchie"); });
  assert.equal((await session(new Request("https://dromap.fr/api/dromap/auth/session", { headers: { "sec-fetch-site": "cross-site" } }))).status, 403);
});

test("requêtes : type JSON exigé, taille réelle contrôlée sans Content-Length et avant parsing", async () => {
  let calls = 0;
  const handler = withRequestSecurity(async request => { calls++; return Response.json(await request.json()); });
  assert.equal((await handler(jsonRequest("auth/adopt", {}, { "content-type": "text/plain" }))).status, 415);
  let cancelled = false;
  const body = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(20_000)); }, cancel() { cancelled = true; } });
  const request = new Request("https://dromap.fr/api/dromap/auth/adopt", { method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half" });
  assert.equal((await handler(request)).status, 413);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
  const response = await handler(jsonRequest("auth/adopt", { valid: true }));
  assert.deepEqual(await response.json(), { valid: true });
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("requêtes : une mutation réellement vide reste valide sans Content-Type", async () => {
  const handler = withRequestSecurity(async request => {
    assert.equal(await request.text(), "");
    return Response.json({ ok: true });
  });
  const emptyBody = new ReadableStream({ start(controller) { controller.close(); } });
  const response = await handler(new Request("https://dromap.fr/api/dromap/auth/sign-out", {
    method: "POST",
    body: emptyBody,
    duplex: "half",
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("appareil : un changement de compte ne devient jamais un faux conflit d’appareil", async () => {
  let restCalls = 0;
  const route = loadSource("app/api/dromap/account/device-session/route.ts", {
    "@/lib/dromap/server/supabase-rest": {
      getSupabaseConfig: () => ({}),
      getAuthenticatedRequestUser: async () => ({ accessToken: "token-b", user: { id: "account-b" } }),
      parseJsonResponse: async () => null,
      supabaseRestFetch: async () => { restCalls++; throw new Error("Ne doit pas être appelé"); },
    },
  });
  const response = await route.POST(jsonRequest("account/device-session", {
    deviceId: "device:12345678",
    accountUserId: "account-a",
  }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "ACCOUNT_SESSION_CHANGED");
  assert.equal(restCalls, 0);
});

test("requêtes Next : une requête GET est transmise sans reconstruction incompatible", async () => {
  const request = new Request("http://localhost:3000/api/dromap/publications", {
    headers: { host: "localhost:3000", "sec-fetch-site": "same-origin" },
  });
  let received = null;
  const response = await withRequestSecurity(async securedRequest => {
    received = securedRequest;
    return Response.json({ ok: true });
  })(request);
  assert.equal(response.status, 200);
  assert.equal(received, request);
});

test("webhook : le corps signé reste identique et ne dépend pas d'un Origin navigateur", async () => {
  const raw = '{ "event": "test", "spacing":  1 }\n';
  const handler = withRequestSecurity(async request => {
    assert.equal(await request.text(), raw);
    assert.equal(request.headers.get("stripe-signature"), "test-signature");
    return Response.json({ ok: true });
  });
  assert.equal((await handler(new Request("https://dromap.fr/api/dromap/billing/webhook", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://stripe.invalid", "stripe-signature": "test-signature" }, body: raw,
  }))).status, 200);
});

test("couverture : chaque route API utilise la garde commune", () => {
  for (const path of readdirSync(new URL("../../app/api/dromap/", import.meta.url), { recursive: true })) {
    if (!path.endsWith("route.ts")) continue;
    const code = readFileSync(new URL(`../../app/api/dromap/${path.replaceAll("\\", "/")}`, import.meta.url), "utf8");
    assert.doesNotMatch(code, /export async function (GET|POST|PUT|PATCH|DELETE)/, path);
    assert.match(code, /export const (GET|POST|PUT|PATCH|DELETE) = withRequestSecurity\(/, path);
  }
});

test("connexion : limite réseau puis identité, refus avant appel Supabase, stockage indisponible bloquant", async () => {
  for (const path of ["sign-in", "sign-up", "request-reset"]) {
    const route = loadSource(`app/api/dromap/auth/${path}/route.ts`, {
      "@/lib/dromap/server/abuse-limit": { checkAbuseLimit: async () => Response.json({}, { status: 429 }) },
      "@/lib/dromap/server/supabase-rest": { getSupabaseConfig: () => { throw new Error("Auth appelée"); } },
    });
    assert.equal((await route.POST(jsonRequest(`auth/${path}`, { email: "a@example.invalid" }))).status, 429);
  }
  for (const outcome of [true, false, "error"]) {
    const keys = [];
    const limiter = loadSource("lib/dromap/server/abuse-limit.ts", {
      "@/lib/dromap/server/supabase-rest": { getSupabaseAdminKey: () => "test-secret" },
      "@/lib/dromap/server/security-rpc": { securityRpc: async (_name, params) => { keys.push(params.p_key); if (outcome === "error") throw Error(); return outcome; } },
    });
    const result = await limiter.checkAbuseLimit(jsonRequest("auth/sign-in", {}), "sign-in", "email@example.invalid");
    assert.equal(result?.status ?? null, outcome === true ? null : outcome === false ? 429 : 503);
    assert.match(keys[0], /^[a-f0-9]{64}$/);
    assert.ok(!keys[0].includes("email"));
  }
});

test("IP : seuls les en-têtes réécrits par Vercel sont utilisés sur Vercel", t => {
  const original = process.env.VERCEL;
  t.after(() => { if (original === undefined) delete process.env.VERCEL; else process.env.VERCEL = original; });
  const { trustedNetwork } = loadSource("lib/dromap/server/abuse-limit.ts");
  delete process.env.VERCEL;
  assert.equal(trustedNetwork(jsonRequest("contact", {}, { "x-forwarded-for": "8.8.8.8", "x-vercel-forwarded-for": "9.9.9.9" })), "unattributed");
  process.env.VERCEL = "1";
  assert.equal(trustedNetwork(jsonRequest("contact", {}, { "x-forwarded-for": "8.8.8.8", "x-vercel-forwarded-for": "9.9.9.9" })), "9.9.9.9");
  assert.equal(trustedNetwork(jsonRequest("contact", {}, { "x-vercel-forwarded-for": "fake, other" })), "unattributed");
});

test("pièces jointes : image réelle conservée, image déguisée/corrompue et faux PDF refusés", async () => {
  const { validateContactAttachment: validate } = loadSource("lib/dromap/server/contact-attachment.ts");
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer();
  const actual = await validate(new File([png], "photo.png", { type: "text/html" }));
  assert.equal(actual.contentType, "image/png");
  assert.deepEqual(actual.content, png);
  for (const file of [new File(["<script>bad()</script>"], "photo.jpg"), new File([png.subarray(0, 25)], "photo.png"), new File(["executable"], "document.pdf"), new File([new Uint8Array([0,1,2])], "message.txt"), new File(["not-json"], "data.json")]) {
    await assert.rejects(validate(file));
  }
  assert.equal((await validate(new File(["diagnostic"], "trace.log", { type: "text/html" }))).contentType, "text/plain");
  assert.equal((await validate(new File(['{"a":1}'], "data.json"))).contentType, "application/json");
});

test("flux : plafond appliqué aux octets décompressés, source arrêtée dès dépassement", async () => {
  const { readBoundedBytes } = loadSource("lib/dromap/bounded-stream.ts");
  const compressed = gzipSync(Buffer.alloc(1024 * 1024, 65));
  await assert.rejects(readBoundedBytes(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip")), 1024), /BODY_TOO_LARGE/);
  const valid = new Blob([gzipSync(Buffer.from("hello"))]).stream().pipeThrough(new DecompressionStream("gzip"));
  assert.equal(new TextDecoder().decode(await readBoundedBytes(valid, 5)), "hello");
});

test("taille sauvegardée : calcul sur les fragments réels et UTF-8, gzip et morceaux manquants", async () => {
  const source = Buffer.from(JSON.stringify({ name: "Été ☀", features: [] }));
  for (const encoding of ["base64", "gzip-base64"]) {
    const encoded = (encoding === "base64" ? source : gzipSync(source)).toString("base64");
    const pieces = [encoded.slice(0, 7), encoded.slice(7)];
    const helper = loadSource("lib/dromap/server/stored-payload.ts", {
      "@/lib/dromap/server/supabase-rest": { supabaseRestFetch: async path => {
        assert.match(path, /owner_id=eq.owner/);
        return Response.json(pieces.map((chunk_data, chunk_index) => ({ chunk_data, chunk_index })));
      } },
    });
    assert.equal(await helper.measureStoredPayload("/chunks?owner_id=eq.owner", "jwt", 2, encoding), source.length);
    await assert.rejects(helper.measureStoredPayload("/chunks?owner_id=eq.owner", "jwt", 3, encoding), /INCOMPLETE_PAYLOAD/);
  }
});

test("redirections : chemins locaux conservés, URLs externes et antislashs refusés", () => {
  const { safeReturnTo } = loadSource("lib/dromap/safe-return-to.ts");
  for (const value of ["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/\n/evil.invalid", "javascript:alert(1)"]) assert.equal(safeReturnTo(value), "/dashboard");
  assert.equal(safeReturnTo("/projects/new?map=1#section"), "/projects/new?map=1#section");
});

test("flux lent : l'annulation interrompt la lecture et ferme la source", async () => {
  const { readBoundedBytes } = loadSource("lib/dromap/bounded-stream.ts");
  const controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const pending = readBoundedBytes(stream, 100, controller.signal);
  controller.abort();
  await assert.rejects(pending);
  assert.equal(cancelled, true);
});

test("geoBoundaries : téléchargement et filtrage conservés ; redirection hors liste bloquée", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  t.mock.method(console, "error", () => {});
  let forbidden = false;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.redirect, "manual");
    assert.ok(options.signal instanceof AbortSignal);
    if (url.endsWith("/FRA/")) return new Response("ADM0");
    if (url.endsWith("/FRA/ADM0/")) return Response.json({ boundaryName: "France", boundaryType: "ADM0", gjDownloadURL: "https://raw.githubusercontent.com/map.geojson" });
    assert.equal(url, "https://raw.githubusercontent.com/map.geojson");
    if (forbidden) return new Response(null, { status: 302, headers: { location: "https://evil.invalid/private" } });
    return Response.json({ type: "FeatureCollection", features: [] });
  };
  const route = loadSource("app/api/dromap/geojson-library/geoboundaries/route.ts");
  for (const bbox of ["", "&bbox=-1,-1,1,1"]) {
    const response = await route.GET(new Request(`https://dromap.fr/api/dromap/geojson-library/geoboundaries?action=download&iso=FRA&adm=ADM0&geometry=original${bbox}`));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).features, []);
  }
  forbidden = true;
  assert.equal((await route.GET(new Request("https://dromap.fr/api/dromap/geojson-library/geoboundaries?action=download&iso=FRA&adm=ADM0&geometry=original"))).status, 502);
});

test("en-têtes : protections exécutoires compatibles avec les ressources cartographiques", async () => {
  const config = loadSource("next.config.ts").default;
  const headers = Object.fromEntries((await config.headers())[0].headers.map(x => [x.key.toLowerCase(), x.value]));
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.match(headers["content-security-policy"], /frame-ancestors 'self'/);
  assert.match(headers["content-security-policy"], /object-src 'none'/);
  assert.equal(config.poweredByHeader, false);
});
