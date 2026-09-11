import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("migration moyenne : compteurs partagés, stockage atomique et droits SQL", async t => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create table auth.users(id uuid primary key);
      create table public.dromap_projects(owner_id uuid references auth.users(id) on delete cascade, project_id text, metadata jsonb not null default '{}', primary key(owner_id,project_id));
      create table public.dromap_project_chunks(owner_id uuid references auth.users(id) on delete cascade, project_id text, revision text, chunk_index integer, chunk_data text not null, primary key(owner_id,project_id,revision,chunk_index));
      create table public.dromap_personal_library_chunks(owner_id uuid references auth.users(id) on delete cascade, revision text, chunk_index integer, chunk_data text not null, primary key(owner_id,revision,chunk_index));
      insert into auth.users values ('${owner}'), ('${other}');
      insert into public.dromap_project_chunks values ('${owner}','legacy','revision',0,'eA==');
      alter table public.dromap_project_chunks enable row level security;
      create policy own on public.dromap_project_chunks to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
      grant select,insert,update,delete on public.dromap_project_chunks to authenticated;
    `);
    const migration = readFileSync(new URL("../../supabase/migrations/20260911_dromap_medium_security.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const usage = async () => (await db.query("select * from public.dromap_storage_usage where owner_id=$1", [owner])).rows[0];
    const insert = async (index, value="eA==") => db.query("insert into public.dromap_project_chunks values ($1,'map','revision',$2,$3)", [owner,index,value]);

    await t.test("limite d'authentification partagée, expiration, paramètres invalides et isolation des clés", async () => {
      const take = key => db.query("select public.dromap_take_abuse_request($1,3,600) allowed", [key]).then(x=>x.rows[0].allowed);
      assert.equal((await Promise.all(Array.from({length:8},()=>take("a".repeat(64))))).filter(Boolean).length,3);
      assert.equal(await take("b".repeat(64)),true);
      assert.equal(await take("fake"),false);
      await db.exec("update public.dromap_abuse_windows set expires_at=now()-interval '1 second'");
      assert.equal(await take("a".repeat(64)),true);
    });
    await t.test("données existantes comptées ; quota concurrent impossible à dépasser", async () => {
      assert.equal(Number((await usage()).project_bytes),4);
      await db.query("update public.dromap_storage_usage set byte_limit=16 where owner_id=$1",[owner]);
      const results=await Promise.allSettled(Array.from({length:8},(_,i)=>insert(i)));
      assert.equal(results.filter(x=>x.status==="fulfilled").length,3);
      assert.equal(Number((await usage()).project_bytes),16);
      assert.equal(Number((await usage()).chunks),4);
    });
    await t.test("upsert idempotent et bibliothèque partagent le même quota ; erreur annulée", async () => {
      await db.query("insert into public.dromap_project_chunks values ($1,'map','revision',0,'eA==') on conflict(owner_id,project_id,revision,chunk_index) do update set chunk_data=excluded.chunk_data",[owner]);
      assert.equal(Number((await usage()).project_bytes),16);
      await assert.rejects(db.query("insert into public.dromap_personal_library_chunks values ($1,'revision',0,'eA==')",[owner]),/DROMAP_STORAGE_LIMIT/);
      assert.equal(Number((await usage()).library_bytes),0);
      await db.query("delete from public.dromap_project_chunks where owner_id=$1 and project_id='map' and chunk_index=0",[owner]);
      await db.query("insert into public.dromap_personal_library_chunks values ($1,'revision',0,'eA==')",[owner]);
      assert.equal(Number((await usage()).library_bytes),4);
      assert.equal(Number((await usage()).project_bytes),12);
    });
    await t.test("accès direct : compteur non falsifiable, RPC interdite et autre propriétaire invisible", async () => {
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`);
      assert.equal((await db.query("select * from public.dromap_storage_usage")).rows.length,1);
      await assert.rejects(db.query("update public.dromap_storage_usage set byte_limit=999999"));
      await assert.rejects(db.query("select public.dromap_take_abuse_request($1,3,600)",["c".repeat(64)]));
      await assert.rejects(insert(42),/DROMAP_STORAGE_LIMIT/);
      await assert.rejects(db.query("update public.dromap_project_chunks set owner_id=$1",[other]));
      await db.exec("reset role");
    });
    await t.test("réapplication conserve plafond et compteurs ; réduction et suppression autorisées au-dessus du plafond", async () => {
      await db.query("update public.dromap_storage_usage set byte_limit=8 where owner_id=$1",[owner]);
      await db.exec(migration);
      assert.equal(Number((await usage()).byte_limit),8);
      assert.equal(Number((await usage()).project_bytes),12);
      await db.query("update public.dromap_project_chunks set chunk_data='eA' where owner_id=$1",[owner]);
      assert.equal(Number((await usage()).project_bytes),6);
      await db.query("delete from public.dromap_personal_library_chunks where owner_id=$1",[owner]);
      assert.equal(Number((await usage()).library_bytes),0);
    });
    await t.test("métadonnées et manifestes comptés : impossible de contourner le quota sans fragments", async () => {
      await db.query("update public.dromap_storage_usage set byte_limit=1000000 where owner_id=$1",[owner]);
      await db.query("insert into public.dromap_projects(owner_id,project_id,metadata) values($1,'project',$2)",[owner,JSON.stringify({name:"carte"})]);
      const before = Number((await usage()).project_bytes);
      assert.ok(before > 6);
      await db.query("update public.dromap_storage_usage set byte_limit=$2 where owner_id=$1",[owner,before]);
      await assert.rejects(db.query("insert into public.dromap_projects(owner_id,project_id) values($1,'another')",[owner]),/DROMAP_STORAGE_LIMIT/);
      assert.equal(Number((await usage()).manifests),1);
      await assert.rejects(db.query("update public.dromap_projects set metadata=jsonb_build_object('large',repeat('x',270000)) where owner_id=$1",[owner]),/metadata too large/);
      await db.exec(migration);
      assert.equal(Number((await usage()).project_bytes),before);
      await db.query("delete from public.dromap_projects where owner_id=$1",[owner]);
      assert.equal(Number((await usage()).project_bytes),6);
    });
    await t.test("suppression du compte : cascade et nettoyage sans recréer le compteur", async () => {
      await db.query("delete from auth.users where id=$1",[owner]);
      assert.equal((await db.query("select * from public.dromap_storage_usage where owner_id=$1",[owner])).rows.length,0);
    });
  } finally { await db.close(); }
});
