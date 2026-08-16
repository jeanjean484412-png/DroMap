-- DroMap P0 — dashboard léger, cache multi-appareil, conflits, bibliothèques et profil complet
-- À exécuter APRÈS 20260815_dromap_p0_accounts_projects.sql.

alter table public.dromap_projects
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.dromap_profiles
  add column if not exists first_name text null,
  add column if not exists last_name text null,
  add column if not exists preferences jsonb not null default '{}'::jsonb;

-- Le profil garde display_name pour la compatibilité, mais les champs prénom/nom
-- sont désormais persistants et pourront accueillir d'autres préférences plus tard.
create or replace function public.dromap_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  first_name_value text;
  last_name_value text;
  display_name_value text;
begin
  first_name_value := nullif(trim(new.raw_user_meta_data ->> 'first_name'), '');
  last_name_value := nullif(trim(new.raw_user_meta_data ->> 'last_name'), '');
  display_name_value := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(concat_ws(' ', first_name_value, last_name_value)), ''),
    'Utilisateur DroMap'
  );

  insert into public.dromap_profiles (
    user_id,
    display_name,
    first_name,
    last_name,
    preferences
  )
  values (
    new.id,
    display_name_value,
    first_name_value,
    last_name_value,
    '{}'::jsonb
  )
  on conflict (user_id) do update set
    first_name = coalesce(public.dromap_profiles.first_name, excluded.first_name),
    last_name = coalesce(public.dromap_profiles.last_name, excluded.last_name),
    updated_at = now();

  return new;
end;
$$;

-- Bibliothèque personnelle unique et découpée en morceaux. Elle contient
-- Mes marqueurs + Mes calques DroMap + Mes calques GeoJSON enregistrés.
create table if not exists public.dromap_personal_library (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  current_revision text not null,
  chunk_count integer not null check (chunk_count > 0 and chunk_count <= 10001),
  encoding text not null check (encoding in ('gzip-base64', 'base64')),
  payload_size_bytes bigint not null default 0 check (payload_size_bytes >= 0),
  updated_at timestamptz not null default now()
);

alter table public.dromap_personal_library enable row level security;
grant select, insert, update, delete on public.dromap_personal_library to authenticated;

drop policy if exists "dromap_personal_library_select_own" on public.dromap_personal_library;
create policy "dromap_personal_library_select_own"
on public.dromap_personal_library for select
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()));

drop policy if exists "dromap_personal_library_insert_own" on public.dromap_personal_library;
create policy "dromap_personal_library_insert_own"
on public.dromap_personal_library for insert
to authenticated
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

drop policy if exists "dromap_personal_library_update_own" on public.dromap_personal_library;
create policy "dromap_personal_library_update_own"
on public.dromap_personal_library for update
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

drop policy if exists "dromap_personal_library_delete_own" on public.dromap_personal_library;
create policy "dromap_personal_library_delete_own"
on public.dromap_personal_library for delete
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()));

create table if not exists public.dromap_personal_library_chunks (
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision text not null,
  chunk_index integer not null check (chunk_index >= 0 and chunk_index <= 10000),
  chunk_data text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, revision, chunk_index)
);

alter table public.dromap_personal_library_chunks enable row level security;
grant select, insert, update, delete on public.dromap_personal_library_chunks to authenticated;

drop policy if exists "dromap_personal_library_chunks_select_own" on public.dromap_personal_library_chunks;
create policy "dromap_personal_library_chunks_select_own"
on public.dromap_personal_library_chunks for select
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()));

drop policy if exists "dromap_personal_library_chunks_insert_own" on public.dromap_personal_library_chunks;
create policy "dromap_personal_library_chunks_insert_own"
on public.dromap_personal_library_chunks for insert
to authenticated
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

drop policy if exists "dromap_personal_library_chunks_update_own" on public.dromap_personal_library_chunks;
create policy "dromap_personal_library_chunks_update_own"
on public.dromap_personal_library_chunks for update
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));

drop policy if exists "dromap_personal_library_chunks_delete_own" on public.dromap_personal_library_chunks;
create policy "dromap_personal_library_chunks_delete_own"
on public.dromap_personal_library_chunks for delete
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()));

-- Rafraîchir immédiatement le schéma exposé par l'API Supabase.
notify pgrst, 'reload schema';
