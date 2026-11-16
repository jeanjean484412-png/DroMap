import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const readMigration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const permissions = readMigration("20261116082531_restrict_automatic_function_execution.sql");
function triggerDefinition(file, name) {
  const sql = readMigration(file);
  const start = sql.indexOf(`create or replace function public.${name}()`);
  assert.ok(start >= 0);
  return sql.slice(start, sql.indexOf("$$;", start) + 3);
}

test("permissions: internal signup and automatic RLS survive public EXECUTE revocation", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create role supabase_auth_admin; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
      create table public.dromap_profiles(user_id uuid primary key, display_name text,
        first_name text, last_name text, preferences jsonb, updated_at timestamptz default now());
      create table public.dromap_billing_accounts(user_id uuid primary key, plan text);
      grant usage on schema auth to supabase_auth_admin;
      grant insert on auth.users to supabase_auth_admin;
    `);
    await db.exec(triggerDefinition("20260816_dromap_p0_cloud_foundation.sql", "dromap_handle_new_user"));
    await db.exec(triggerDefinition("20260818_dromap_billing_stripe.sql", "dromap_handle_new_billing_account"));
    await db.exec(`
      create trigger profile_created after insert on auth.users for each row execute function public.dromap_handle_new_user();
      create trigger billing_created after insert on auth.users for each row execute function public.dromap_handle_new_billing_account();
      grant execute on function public.dromap_handle_new_user(), public.dromap_handle_new_billing_account() to anon, authenticated;
    `);
    await db.exec(permissions); // Local installations without the platform helper.
    await db.exec(`
      create function public.rls_auto_enable() returns event_trigger language plpgsql security definer
      set search_path=pg_catalog as $$ declare cmd record; begin
        for cmd in select * from pg_event_trigger_ddl_commands() where object_type='table' loop
          if cmd.schema_name='public' then
            execute format('alter table %s enable row level security', cmd.object_identity);
          end if;
        end loop;
      end $$;
      create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE') execute function public.rls_auto_enable();
      grant execute on function public.rls_auto_enable() to anon, authenticated;
    `);
    await db.exec(permissions);
    await db.exec(permissions); // Safe to reapply.
    for (const fn of ["dromap_handle_new_user", "dromap_handle_new_billing_account", "rls_auto_enable"]) {
      const { rows: [rights] } = await db.query(`select
        has_function_privilege('anon', $1, 'EXECUTE') as anon,
        has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated,
        has_function_privilege('supabase_auth_admin', $1, 'EXECUTE') as auth_admin,
        has_function_privilege('service_role', $1, 'EXECUTE') as service`, [`public.${fn}()`]);
      assert.deepEqual(rights, { anon: false, authenticated: false, auth_admin: true, service: true });
    }
    await db.exec(`set role supabase_auth_admin;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111', '{"first_name":"Test","last_name":"Local"}');
      reset role;`);
    assert.deepEqual((await db.query("select display_name,first_name,last_name,preferences from dromap_profiles")).rows,
      [{ display_name: "Test Local", first_name: "Test", last_name: "Local", preferences: {} }]);
    assert.equal((await db.query("select plan from dromap_billing_accounts")).rows[0].plan, "free");
    await db.exec("create table public.test_rls(id integer)");
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.test_rls'::regclass")).rows[0].relrowsecurity, true);
  } finally { await db.close(); }
});
