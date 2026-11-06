-- Preserve beta quotas and retention; exempt only the server-stored tester plan.
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
     not exists (select 1 from public.dromap_billing_accounts where user_id=p_owner and plan='tester') and
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

notify pgrst, 'reload schema';
