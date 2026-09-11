import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("migration PostgreSQL : anti-abus atomique, rejeu Stripe, rollback et privilèges", async t => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.dromap_project_entitlements(
        owner_id uuid references auth.users(id), project_id text, entitlement text,
        stripe_checkout_session_id text unique, stripe_payment_intent_id text,
        amount_total bigint, currency text, purchased_at timestamptz not null default now(),
        first_downloaded_at timestamptz, primary key(owner_id,project_id,entitlement)
      );
      create table public.dromap_publication_source_chunks(chunk text);
      insert into auth.users(id) values ('${owner}'), ('${other}');
      insert into public.dromap_project_entitlements(owner_id, project_id, entitlement, stripe_checkout_session_id, purchased_at, first_downloaded_at)
      values ('${owner}', 'legacy', 'max-export', 'cs_legacy', '2026-01-01', '2026-01-02');
    `);
    const migration = readFileSync(new URL("../../supabase/migrations/20260910_dromap_security_hardening.sql", import.meta.url), "utf8");
    await db.exec(migration);
    // Relancer le fichier ne doit ni déverrouiller un achat ni effacer un compteur.
    await db.exec(migration);
    const take = (user = owner, scope = "ai") => db.query("select public.dromap_take_ai_request($1, $2, 3) as allowed", [user, scope]).then(result => result.rows[0].allowed);
    const grant = (checkout, purchasedAt, project = "map", user = owner) => db.query(
      "select public.dromap_grant_single_map_checkout($1,$2,$3,$4,$5,$6,$7) as granted",
      [user, project, checkout, "pi-test", 300, "eur", purchasedAt],
    );
    const lock = project => db.query("update public.dromap_project_entitlements set first_downloaded_at='2026-09-10' where project_id=$1", [project]);
    const entitlement = project => db.query("select * from public.dromap_project_entitlements where project_id=$1", [project]).then(result => result.rows[0]);

    await t.test("requêtes simultanées limitées, fenêtres indépendantes par compte et service", async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => take()));
      assert.equal(results.filter(Boolean).length, 3);
      assert.equal(await take(other), true);
      assert.equal(await take(owner, "geojson"), true);
      await db.query("update public.dromap_request_windows set started_at=now()-interval '2 minutes' where user_id=$1", [owner]);
      assert.equal(await take(), true);
    });
    await t.test("un nouveau paiement ouvre un cycle ; le même paiement ne le rouvre jamais", async () => {
      await grant("cs_first", "2026-02-01");
      assert.equal((await entitlement("map")).first_downloaded_at, null);
      await lock("map");
      await Promise.all(Array.from({ length: 5 }, () => grant("cs_first", "2026-02-01")));
      assert.notEqual((await entitlement("map")).first_downloaded_at, null);
      await grant("cs_second", "2026-03-01");
      assert.equal((await entitlement("map")).first_downloaded_at, null);
      await lock("map");
      await grant("cs_first", "2026-02-01");
      assert.notEqual((await entitlement("map")).first_downloaded_at, null);
    });
    await t.test("un ancien événement arrivé tard ne remplace pas un achat plus récent", async () => {
      await grant("cs_old_late", "2026-01-01");
      const row = await entitlement("map");
      assert.equal(row.stripe_checkout_session_id, "cs_second");
      assert.notEqual(row.first_downloaded_at, null);
    });
    await t.test("les achats présents avant migration restent verrouillés", async () => {
      await grant("cs_legacy", "2026-01-01", "legacy");
      assert.notEqual((await entitlement("legacy")).first_downloaded_at, null);
    });
    await t.test("une erreur annule aussi le reçu : Stripe peut réessayer", async () => {
      await assert.rejects(grant("cs_retry", "2026-03-01", "retry", "33333333-3333-4333-8333-333333333333"));
      assert.equal((await db.query("select * from public.dromap_processed_map_checkouts where checkout_id='cs_retry'")).rows.length, 0);
      await grant("cs_retry", "2026-03-01", "retry");
      assert.ok(await entitlement("retry"));
    });
    await t.test("les rôles navigateur ne peuvent ni appeler les RPC ni lire les sources brutes", async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        await assert.rejects(take());
        await assert.rejects(grant("cs_forbidden", "2026-03-01"));
        await assert.rejects(db.query("select * from public.dromap_publication_source_chunks"));
        await db.exec("reset role");
      }
      await db.exec("set role service_role");
      assert.equal(await take(other), true);
      await db.exec("reset role");
    });
  } finally { await db.close(); }
});
