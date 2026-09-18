import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("conservation : seules les données techniques expirées sont purgées ; revue privée des comptes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema cron;
      create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
      create table auth.users(id uuid primary key, created_at timestamptz, last_sign_in_at timestamptz);
      create table public.dromap_abuse_windows(key text, expires_at timestamptz);
      create table public.dromap_request_windows(started_at timestamptz);
      create table public.dromap_personal_library(owner_id uuid, current_revision text, updated_at timestamptz);
      create table public.dromap_personal_library_chunks(owner_id uuid, revision text, created_at timestamptz);
      create table public.dromap_projects(owner_id uuid, updated_at timestamptz);
      create table public.dromap_account_device_leases(owner_id uuid, last_seen_at timestamptz);
      create table public.dromap_billing_accounts(user_id uuid, stripe_customer_id text, plan text);
      create table public.dromap_project_entitlements(owner_id uuid);
      create table public.dromap_publication_entitlements(buyer_id uuid, publication_slug text);
      create table public.dromap_publications(owner_id uuid, slug text);
      insert into auth.users values ('11111111-1111-4111-8111-111111111111',now()-interval '4 years',null);
      insert into public.dromap_personal_library values ('11111111-1111-4111-8111-111111111111','current',now()-interval '4 years');
      insert into public.dromap_personal_library_chunks values
        ('11111111-1111-4111-8111-111111111111','current',now()-interval '4 years'),
        ('11111111-1111-4111-8111-111111111111','old',now()-interval '2 days'),
        ('11111111-1111-4111-8111-111111111111','upload',now());
      insert into public.dromap_abuse_windows values ('old',now()-interval '1 second'),('active',now()+interval '1 hour');
      insert into public.dromap_request_windows values (now()-interval '2 days'),(now());
    `);
    const sql = readFileSync(new URL("../../supabase/migrations/20260917_dromap_retention.sql", import.meta.url), "utf8")
      .replace("create extension if not exists pg_cron;", "");
    await db.exec(sql);
    await db.exec(sql);
    await db.exec("select public.dromap_purge_expired_technical_data()");
    assert.deepEqual((await db.query("select revision from public.dromap_personal_library_chunks order by revision")).rows.map(x=>x.revision), ["current", "upload"]);
    assert.deepEqual((await db.query("select key from public.dromap_abuse_windows")).rows, [{key:"active"}]);
    assert.equal((await db.query("select * from public.dromap_request_windows")).rows.length,1);
    assert.equal((await db.query("select * from public.dromap_inactive_accounts_review")).rows.length,1);
    await db.exec("insert into public.dromap_account_device_leases select id,now() from auth.users");
    assert.equal((await db.query("select * from public.dromap_inactive_accounts_review")).rows.length,0);
    assert.equal((await db.query("select * from auth.users")).rows.length,1);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from public.dromap_inactive_accounts_review"), /permission denied/);
    await assert.rejects(db.query("select public.dromap_purge_expired_technical_data()"), /permission denied/);
  } finally { await db.close(); }
});
