-- DroMap P0 — comptes, profils et projets privés
-- À exécuter une fois dans le SQL Editor du projet Supabase.

create table if not exists public.dromap_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Utilisateur DroMap',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dromap_profiles enable row level security;

grant select, insert, update, delete on public.dromap_profiles to authenticated;

create policy "dromap_profiles_select_own"
on public.dromap_profiles for select
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy "dromap_profiles_insert_own"
on public.dromap_profiles for insert
to authenticated
with check ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy "dromap_profiles_update_own"
on public.dromap_profiles for update
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()))
with check ((select auth.uid()) is not null and user_id = (select auth.uid()));

create policy "dromap_profiles_delete_own"
on public.dromap_profiles for delete
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

create or replace function public.dromap_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.dromap_profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Utilisateur DroMap')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_dromap_auth_user_created on auth.users;
create trigger on_dromap_auth_user_created
after insert on auth.users
for each row execute procedure public.dromap_handle_new_user();

-- Le manifeste reste léger. Le contenu complet est découpé en morceaux afin
-- d'éviter de faire transiter un gros Projet DroMap dans une seule requête web.
create table if not exists public.dromap_projects (
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  current_revision text not null,
  chunk_count integer not null check (chunk_count > 0 and chunk_count <= 10001),
  encoding text not null check (encoding in ('gzip-base64', 'base64')),
  payload_size_bytes bigint not null default 0 check (payload_size_bytes >= 0),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  primary key (owner_id, project_id)
);

create index if not exists dromap_projects_owner_updated_idx
  on public.dromap_projects (owner_id, updated_at desc);
create index if not exists dromap_projects_owner_deleted_idx
  on public.dromap_projects (owner_id, deleted_at);

alter table public.dromap_projects enable row level security;

grant select, insert, update, delete on public.dromap_projects to authenticated;

create policy "dromap_projects_select_own"
on public.dromap_projects for select
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy "dromap_projects_insert_own"
on public.dromap_projects for insert
to authenticated
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy "dromap_projects_update_own"
on public.dromap_projects for update
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy "dromap_projects_delete_own"
on public.dromap_projects for delete
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create table if not exists public.dromap_project_chunks (
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  revision text not null,
  chunk_index integer not null check (chunk_index >= 0 and chunk_index <= 10000),
  chunk_data text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, project_id, revision, chunk_index)
);

alter table public.dromap_project_chunks enable row level security;

grant select, insert, update, delete on public.dromap_project_chunks to authenticated;

create policy "dromap_project_chunks_select_own"
on public.dromap_project_chunks for select
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy "dromap_project_chunks_insert_own"
on public.dromap_project_chunks for insert
to authenticated
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy "dromap_project_chunks_update_own"
on public.dromap_project_chunks for update
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create policy "dromap_project_chunks_delete_own"
on public.dromap_project_chunks for delete
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()));

-- Garantit un profil pour les comptes déjà présents avant l'installation de la P0.
insert into public.dromap_profiles (user_id, display_name)
select
  id,
  coalesce(nullif(trim(raw_user_meta_data ->> 'display_name'), ''), 'Utilisateur DroMap')
from auth.users
on conflict (user_id) do nothing;
