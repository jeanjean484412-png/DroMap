-- Additive release policy: existing projects keep their ten-day retention.
alter table public.dromap_projects add column if not exists trash_expires_at timestamptz;

create or replace function public.dromap_project_release_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if TG_OP='UPDATE' and old.deleted_at is not null and old.trash_expires_at <= now() then
    raise exception 'BETA_TRASH_EXPIRED';
  end if;
  -- Only the server-only RPC may assign the short lifetime. Never trust metadata.
  if new.deleted_at is null then
    new.trash_expires_at := null;
  elsif TG_OP='UPDATE' and old.deleted_at is not null then
    new.deleted_at := old.deleted_at;
    new.trash_expires_at := old.trash_expires_at;
  elsif current_setting('dromap.beta_write',true)='on' then
    new.deleted_at := now();
    new.trash_expires_at := now()+interval '1 hour';
  else
    new.trash_expires_at := null;
  end if;
  new.metadata := (coalesce(new.metadata,'{}'::jsonb)-'trashExpiresAt') ||
    jsonb_build_object('trashExpiresAt',new.trash_expires_at);
  return new;
end $$;
revoke all on function public.dromap_project_release_guard() from public,anon,authenticated;
drop trigger if exists dromap_project_release_guard on public.dromap_projects;
create trigger dromap_project_release_guard before insert or update on public.dromap_projects
for each row execute function public.dromap_project_release_guard();

create or replace function public.dromap_beta_save_project(
  p_owner uuid, p_project text, p_expected_revision text, p_expected_updated_at timestamptz,
  p_patch jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare oldrow public.dromap_projects; saved public.dromap_projects; exists_row boolean;
begin
  if p_owner is null or coalesce(p_project,'')='' then raise exception 'INVALID_PROJECT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 8471));
  select * into oldrow from public.dromap_projects where owner_id=p_owner and project_id=p_project for update;
  exists_row := found;
  if (p_expected_revision is null and exists_row) or
     (p_expected_revision is not null and (not exists_row or oldrow.current_revision<>p_expected_revision or
       (p_expected_updated_at is not null and oldrow.updated_at<>p_expected_updated_at))) then
    return jsonb_build_object('error','CONFLICT');
  end if;
  if exists_row and oldrow.deleted_at is not null and coalesce(oldrow.trash_expires_at,oldrow.deleted_at+interval '10 days')<=now() then
    return jsonb_build_object('error','EXPIRED');
  end if;
  if p_patch->>'deleted_at' is null and (not exists_row or oldrow.deleted_at is not null) and
     (select count(*) from public.dromap_projects where owner_id=p_owner and deleted_at is null)>=3 then
    return jsonb_build_object('error','LIMIT');
  end if;
  saved := jsonb_populate_record(oldrow,p_patch || jsonb_build_object('owner_id',p_owner,'project_id',p_project));
  perform set_config('dromap.beta_write','on',true);
  if not exists_row then
    insert into public.dromap_projects(owner_id,project_id,current_revision,chunk_count,encoding,payload_size_bytes,updated_at,deleted_at,metadata)
    values(p_owner,p_project,saved.current_revision,saved.chunk_count,saved.encoding,saved.payload_size_bytes,now(),saved.deleted_at,saved.metadata)
    returning * into saved;
  else
    update public.dromap_projects set current_revision=saved.current_revision,chunk_count=saved.chunk_count,
      encoding=saved.encoding,payload_size_bytes=saved.payload_size_bytes,updated_at=now(),deleted_at=saved.deleted_at,metadata=saved.metadata
      where owner_id=p_owner and project_id=p_project returning * into saved;
  end if;
  perform set_config('dromap.beta_write','off',true);
  return jsonb_build_object('row',to_jsonb(saved));
end $$;
revoke all on function public.dromap_beta_save_project(uuid,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.dromap_beta_save_project(uuid,text,text,timestamptz,jsonb) to service_role;

create or replace function public.dromap_purge_beta_trash() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare removed integer;
begin
  -- Lock expired manifests before deleting any associated chunks.
  perform 1 from public.dromap_projects where deleted_at is not null and trash_expires_at<=now() for update;
  delete from public.dromap_project_chunks c using public.dromap_projects p
    where c.owner_id=p.owner_id and c.project_id=p.project_id and p.deleted_at is not null and p.trash_expires_at<=now();
  delete from public.dromap_projects where deleted_at is not null and trash_expires_at<=now();
  get diagnostics removed=row_count;
  return removed;
end $$;
revoke all on function public.dromap_purge_beta_trash() from public,anon,authenticated;
grant execute on function public.dromap_purge_beta_trash() to service_role;
select cron.schedule('dromap-purge-beta-trash','* * * * *','select public.dromap_purge_beta_trash();');
notify pgrst, 'reload schema';
