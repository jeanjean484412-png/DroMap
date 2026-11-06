import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSource } from "./load-source.mjs";

const { extractTokens } = loadSource("lib/dromap/server/supabase-rest.ts");
const fields = { email: "person@example.invalid", password: "test-password", firstName: "Test" };

function fixture({ exists = false, payload = { id: "new-user", identities: [{}] }, status = 200, blocked = false } = {}) {
  const calls = { signup: 0, cookies: 0, limits: [] };
  const route = loadSource("app/api/dromap/auth/sign-up/route.ts", {
    "@/lib/dromap/server/abuse-limit": {
      checkAbuseLimit: async (_request, scope, identity) => {
        calls.limits.push([scope, identity]);
        return blocked ? Response.json({}, { status: 429 }) : null;
      },
    },
    "@/lib/dromap/server/security-rpc": { securityRpc: async () => exists },
    "@/lib/dromap/server/supabase-rest": {
      getSupabaseConfig: () => ({}),
      extractTokens,
      parseJsonResponse: response => response.json(),
      supabaseAuthFetch: async () => {
        calls.signup++;
        return Response.json(payload, { status });
      },
      setAuthCookies: response => { calls.cookies++; return response; },
    },
  });
  return {
    calls,
    post: (body = fields) => route.POST(new Request("http://localhost/api/dromap/auth/sign-up", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    })),
  };
}

test("inscription : même réponse publique pour adresse nouvelle, existante et doublon concurrent", async () => {
  let expected;
  for (const options of [
    {},
    { exists: true },
    { payload: { code: "user_already_exists" }, status: 422 },
    { payload: { id: "obfuscated", identities: [] } },
  ]) {
    const route = fixture(options);
    const response = await route.post();
    assert.equal(response.status, 200);
    const body = await response.json();
    expected ??= body;
    assert.deepEqual(body, expected);
    assert.equal(body.authenticated, false);
    assert.equal(body.requiresEmailConfirmation, true);
    assert.equal(body.code, undefined);
    assert.equal(body.account, undefined);
    assert.equal(route.calls.cookies, 0);
    assert.equal(route.calls.signup, options.exists ? 0 : 1, "un compte existant ne doit jamais être réécrit");
    assert.deepEqual(route.calls.limits, [["sign-up", undefined], ["sign-up", fields.email]]);
  }
});

test("inscription : la connexion immédiate avec une session valide reste disponible", async () => {
  const route = fixture({ payload: {
    access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600,
    user: { id: "new-user", email: fields.email, identities: [{}] },
  } });
  const response = await route.post();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.account.userId, "new-user");
  assert.equal(route.calls.cookies, 1);
});

test("inscription : validation, limites et erreur du contrôle d'existence restent bloquantes", async () => {
  for (const [options, body, status] of [
    [{}, { ...fields, password: "short" }, 400],
    [{ blocked: true }, fields, 429],
    [{ exists: null }, fields, 503],
    [{ status: 429, payload: {} }, fields, 429],
    [{ status: 503, payload: {} }, fields, 503],
  ]) {
    const route = fixture(options);
    assert.equal((await route.post(body)).status, status);
    assert.equal(route.calls.cookies, 0);
    if (status === 400 || options.blocked || options.exists === null) assert.equal(route.calls.signup, 0);
  }
});
