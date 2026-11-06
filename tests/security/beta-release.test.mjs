import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadSource } from './load-source.mjs';

test('beta release: atomic quota, legacy retention, restoration, and restricted RPC', async () => {
  const db=new PGlite(); const owner='11111111-1111-4111-8111-111111111111';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema cron; create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
      create table dromap_projects(owner_id uuid,project_id text,current_revision text,chunk_count integer,encoding text,payload_size_bytes bigint,updated_at timestamptz,deleted_at timestamptz,metadata jsonb,primary key(owner_id,project_id));
      create table dromap_project_chunks(owner_id uuid,project_id text);
      create table dromap_billing_accounts(user_id uuid primary key,plan text);
    `);
    const sql=readFileSync(new URL('../../supabase/migrations/20261102203608_dromap_beta_release.sql',import.meta.url),'utf8');
    await db.exec(sql);
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261106171831_dromap_tester_project_quota.sql',import.meta.url),'utf8'));
    const save=async(id,revision=null,patch={})=>(await db.query('select dromap_beta_save_project($1,$2,$3,null,$4::jsonb) r',[owner,id,revision,JSON.stringify({current_revision:'revision1',chunk_count:1,encoding:'base64',payload_size_bytes:4,metadata:{},deleted_at:null,...patch})])).rows[0].r;
    const results=await Promise.all(['a','b','c','d'].map(id=>save(id)));
    assert.equal(results.filter(r=>r.row).length,3);
    assert.equal(results.filter(r=>r.error==='LIMIT').length,1);
    assert.ok((await save('a','revision1')).row,'editing an existing map at the quota is allowed');
    assert.equal((await save('a','wrong')).error,'CONFLICT');
    const trashed=await save('a','revision1',{deleted_at:new Date().toISOString()});
    assert.ok(trashed.row.trash_expires_at);
    assert.ok(Math.abs(Date.parse(trashed.row.trash_expires_at)-Date.parse(trashed.row.deleted_at)-3600000)<1000);
    assert.ok((await save('d')).row);
    assert.equal((await save('a','revision1')).error,'LIMIT');
    await db.exec(`insert into dromap_projects(owner_id,project_id,deleted_at,metadata) values('${owner}','legacy',now()-interval '2 hours','{}');`);
    assert.equal((await db.query("select trash_expires_at from dromap_projects where project_id='legacy'")).rows[0].trash_expires_at,null);
    await db.exec("alter table dromap_projects disable trigger dromap_project_release_guard; update dromap_projects set trash_expires_at=now()-interval '1 second' where project_id='a'; alter table dromap_projects enable trigger dromap_project_release_guard;");
    assert.equal((await save('a','revision1')).error,'EXPIRED');
    await db.exec('select dromap_purge_beta_trash()');
    assert.equal((await db.query("select count(*)::int n from dromap_projects where project_id='legacy'")).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from dromap_projects where project_id='a'")).rows[0].n,0);
    assert.equal((await save('forged',null,{metadata:{plan:'tester'}})).error,'LIMIT','client metadata cannot grant tester access');
    await db.query('insert into dromap_billing_accounts values ($1,$2)',[owner,'tester']);
    assert.ok((await save('tester-fourth')).row,'server-stored tester plan bypasses quota');
    assert.ok((await save('tester-fifth')).row);
    const testerTrash=await save('tester-fifth','revision1',{deleted_at:new Date().toISOString()});
    assert.ok(testerTrash.row.trash_expires_at,'tester beta trash retains its existing lifetime');
    assert.ok((await save('tester-fifth','revision1')).row,'tester restoration bypasses quota');
    await db.query('update dromap_billing_accounts set plan=$1 where user_id=$2',['free',owner]);
    assert.equal((await save('downgraded')).error,'LIMIT','removing tester access restores quota');
    assert.ok((await save('tester-fourth','revision1')).row,'existing maps remain editable above quota');
    await db.exec('set role authenticated');
    await assert.rejects(save('x'),/permission denied/);
    await assert.rejects(db.query('select dromap_purge_beta_trash()'),/permission denied/);
  } finally {await db.close();}
});

test('default mode stays complete; beta AI is denied before billing or provider calls', async()=>{
  const previous=process.env.NEXT_PUBLIC_DROMAP_RELEASE_MODE;
  try {
    delete process.env.NEXT_PUBLIC_DROMAP_RELEASE_MODE;
    assert.equal(loadSource('lib/dromap/release-mode.ts').DROMAP_BETA,false);
    process.env.NEXT_PUBLIC_DROMAP_RELEASE_MODE='beta';
    const {checkAiAccess}=loadSource('lib/dromap/server/ai-access.ts',{
      './supabase-rest':{getAuthenticatedRequestUser:()=>{throw Error('must not authenticate');}},
      './billing':{},'./security-rpc':{},
    });
    assert.equal((await checkAiAccess()).status,403);
  } finally {if(previous===undefined)delete process.env.NEXT_PUBLIC_DROMAP_RELEASE_MODE;else process.env.NEXT_PUBLIC_DROMAP_RELEASE_MODE=previous;}
});

test('beta grants every non-AI capability to signed-in free accounts; complete mode and guests retain their rights',()=>{
  const previous=process.env.NEXT_PUBLIC_DROMAP_RELEASE_MODE;
  try {
    for(const beta of [false,true]) {
      process.env.NEXT_PUBLIC_DROMAP_RELEASE_MODE=beta?'beta':'full';
      const {getDromapCapabilities}=loadSource('lib/dromap/product.ts');
      const capabilities=getDromapCapabilities('authenticated','free');
      assert.equal(capabilities.canUseAi,false);
      for(const key of ['canImportBuildings','canUseAdvancedLegend','canExportHighQuality','canExportOtherVisualFormats','canCustomizeBasemapRender','canExportProjectData','canSaveLayersToLibrary','canCreateCustomMarkers','canSaveCustomMarkersToLibrary','canPublishPublicMaps','canDownloadPublicMaps']) assert.equal(capabilities[key],beta,key);
      assert.equal(getDromapCapabilities('guest','free').canExportHighQuality,false);
      const {isDromapSubscriberPlan}=loadSource('lib/dromap/publications.ts');
      assert.equal(isDromapSubscriberPlan('free'),beta);
      assert.equal(isDromapSubscriberPlan('pro'),true);
      assert.equal(isDromapSubscriberPlan(undefined),false);
      assert.equal(getDromapCapabilities('authenticated','pro').canUseAi,!beta);
    }
  } finally {if(previous===undefined)delete process.env.NEXT_PUBLIC_DROMAP_RELEASE_MODE;else process.env.NEXT_PUBLIC_DROMAP_RELEASE_MODE=previous;}
});
