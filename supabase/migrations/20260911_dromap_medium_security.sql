begin;

-- No raw email/IP is persisted. Keys are server-side HMACs, retained only for
-- the technical limiting window. Only the backend can call this function.
create table if not exists public.dromap_abuse_windows (
  key text primary key check (key ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  requests integer not null check (requests > 0)
);
create index if not exists dromap_abuse_expiry on public.dromap_abuse_windows(expires_at);
alter table public.dromap_abuse_windows enable row level security;
revoke all on public.dromap_abuse_windows from public, anon, authenticated;

create or replace function public.dromap_take_abuse_request(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare accepted boolean;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_limit is null or p_limit not between 1 and 120
     or p_window_seconds is null or p_window_seconds not between 60 and 3600 then return false; end if;
  insert into public.dromap_abuse_windows as w(key, expires_at, requests)
  values (p_key, now() + make_interval(secs => p_window_seconds), 1)
  on conflict (key) do update set
    expires_at = case when w.expires_at <= now() then excluded.expires_at else w.expires_at end,
    requests = case when w.expires_at <= now() then 1 else w.requests + 1 end
  where w.expires_at <= now() or w.requests < p_limit;
  accepted := found;
  -- Bounded cleanup avoids both permanent growth and large per-request deletes.
  delete from public.dromap_abuse_windows where key in (
    select key from public.dromap_abuse_windows where expires_at < now() order by expires_at limit 100
  );
  return accepted;
end;
$$;
revoke all on function public.dromap_take_abuse_request(text, integer, integer) from public, anon, authenticated;
grant execute on function public.dromap_take_abuse_request(text, integer, integer) to service_role;

-- Technical capacity guard, not a commercial plan. Administrators can raise
-- the per-owner ceiling without changing an account's subscription.
create table if not exists public.dromap_storage_usage (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  project_bytes bigint not null default 0,
  library_bytes bigint not null default 0,
  chunks bigint not null default 0,
  manifests bigint not null default 0,
  byte_limit bigint not null default 2147483648 check (byte_limit > 0),
  chunk_limit bigint not null default 10000 check (chunk_limit > 0)
);
alter table public.dromap_storage_usage enable row level security;
revoke all on public.dromap_storage_usage from public, anon, authenticated;
grant select on public.dromap_storage_usage to authenticated;
drop policy if exists dromap_storage_usage_own on public.dromap_storage_usage;
create policy dromap_storage_usage_own on public.dromap_storage_usage for select to authenticated
using (owner_id = (select auth.uid()));

-- Prevent writes while counters are initially reconciled. Existing content is
-- preserved, even above the ceiling; shrinking/deleting remains possible.
lock table public.dromap_project_chunks, public.dromap_personal_library_chunks, public.dromap_projects in share row exclusive mode;
insert into public.dromap_storage_usage(owner_id, project_bytes, library_bytes, chunks, manifests)
select u.id, coalesce(p.bytes,0)+coalesce(m.bytes,0), coalesce(l.bytes,0), coalesce(p.count,0)+coalesce(l.count,0), coalesce(m.count,0)
from auth.users u
left join (select owner_id, sum(octet_length(chunk_data)) bytes, count(*) count from public.dromap_project_chunks group by owner_id) p on p.owner_id=u.id
left join (select owner_id, sum(octet_length(chunk_data)) bytes, count(*) count from public.dromap_personal_library_chunks group by owner_id) l on l.owner_id=u.id
left join (select owner_id, sum(octet_length(to_jsonb(dromap_projects)::text)) bytes, count(*) count from public.dromap_projects group by owner_id) m on m.owner_id=u.id
on conflict (owner_id) do update set project_bytes=excluded.project_bytes, library_bytes=excluded.library_bytes, chunks=excluded.chunks, manifests=excluded.manifests;

create or replace function public.dromap_account_chunk_storage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare who uuid; delta bigint; row_delta bigint; usage public.dromap_storage_usage;
begin
  if TG_OP = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'Owner cannot change' using errcode='23514';
  end if;
  if TG_OP <> 'DELETE' and (octet_length(new.chunk_data) > 2700000 or new.chunk_data !~ '^[A-Za-z0-9+/=[:space:]]+$') then
    raise exception 'Invalid project chunk' using errcode='23514';
  end if;
  if TG_OP <> 'DELETE' and (length(new.revision) > 120 or length(to_jsonb(new)->>'project_id') > 200) then
    raise exception 'Invalid chunk identifier' using errcode='23514';
  end if;
  who := case when TG_OP = 'DELETE' then old.owner_id else new.owner_id end;
  delta := case when TG_OP = 'DELETE' then 0 else octet_length(new.chunk_data) end
         - case when TG_OP = 'INSERT' then 0 else octet_length(old.chunk_data) end;
  row_delta := case when TG_OP='INSERT' then 1 when TG_OP='DELETE' then -1 else 0 end;
  -- Account cascades may already have removed the counter/user.
  if not exists(select 1 from auth.users where id=who) then return null; end if;
  insert into public.dromap_storage_usage(owner_id) values(who) on conflict do nothing;
  update public.dromap_storage_usage set
    project_bytes=project_bytes+case when TG_TABLE_NAME='dromap_project_chunks' then delta else 0 end,
    library_bytes=library_bytes+case when TG_TABLE_NAME='dromap_personal_library_chunks' then delta else 0 end,
    chunks=chunks+row_delta
  where owner_id=who returning * into usage;
  if (delta > 0 and usage.project_bytes+usage.library_bytes > usage.byte_limit)
     or (row_delta > 0 and usage.chunks > usage.chunk_limit) then
    raise exception 'DROMAP_STORAGE_LIMIT' using errcode='P0001';
  end if;
  return null;
end;
$$;
revoke all on function public.dromap_account_chunk_storage() from public, anon, authenticated;
drop trigger if exists dromap_project_storage_guard on public.dromap_project_chunks;
create trigger dromap_project_storage_guard after insert or update or delete on public.dromap_project_chunks
for each row execute function public.dromap_account_chunk_storage();
drop trigger if exists dromap_library_storage_guard on public.dromap_personal_library_chunks;
create trigger dromap_library_storage_guard after insert or update or delete on public.dromap_personal_library_chunks
for each row execute function public.dromap_account_chunk_storage();

create or replace function public.dromap_account_manifest_storage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare who uuid; delta bigint; row_delta bigint; usage public.dromap_storage_usage;
begin
  if TG_OP='UPDATE' and new.owner_id is distinct from old.owner_id then raise exception 'Owner cannot change' using errcode='23514'; end if;
  if TG_OP <> 'DELETE' and (octet_length(to_jsonb(new)::text) > 262144 or length(new.project_id) > 200) then
    raise exception 'Project metadata too large' using errcode='23514';
  end if;
  who := case when TG_OP='DELETE' then old.owner_id else new.owner_id end;
  delta := case when TG_OP='DELETE' then 0 else octet_length(to_jsonb(new)::text) end
         - case when TG_OP='INSERT' then 0 else octet_length(to_jsonb(old)::text) end;
  row_delta := case when TG_OP='INSERT' then 1 when TG_OP='DELETE' then -1 else 0 end;
  if not exists(select 1 from auth.users where id=who) then return null; end if;
  insert into public.dromap_storage_usage(owner_id) values(who) on conflict do nothing;
  update public.dromap_storage_usage set project_bytes=project_bytes+delta, manifests=manifests+row_delta
  where owner_id=who returning * into usage;
  if (delta>0 and usage.project_bytes+usage.library_bytes>usage.byte_limit)
     or (row_delta>0 and usage.manifests>usage.chunk_limit) then
    raise exception 'DROMAP_STORAGE_LIMIT' using errcode='P0001';
  end if;
  return null;
end;
$$;
revoke all on function public.dromap_account_manifest_storage() from public, anon, authenticated;
drop trigger if exists dromap_manifest_storage_guard on public.dromap_projects;
create trigger dromap_manifest_storage_guard after insert or update or delete on public.dromap_projects
for each row execute function public.dromap_account_manifest_storage();

commit;
