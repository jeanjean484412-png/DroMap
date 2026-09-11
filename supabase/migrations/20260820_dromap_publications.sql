-- DroMap P2 — publication publique et bibliothèque de cartes en lecture seule.
-- À exécuter une seule fois dans le SQL Editor Supabase.

create table if not exists public.dromap_publications (
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  slug text primary key,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 800),
  author_name text null check (author_name is null or char_length(author_name) <= 100),
  tags text[] not null default array[]::text[],
  thumbnail_data_url text not null check (char_length(thumbnail_data_url) <= 500000),
  preview_data_url text not null check (char_length(preview_data_url) <= 1200000),
  image_data_url text not null check (char_length(image_data_url) <= 2100000),
  image_mime_type text not null default 'image/jpeg' check (image_mime_type = 'image/jpeg'),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, project_id),
  foreign key (owner_id, project_id)
    references public.dromap_projects(owner_id, project_id)
    on delete cascade
);

create index if not exists dromap_publications_published_idx
  on public.dromap_publications (published_at desc);
create index if not exists dromap_publications_owner_idx
  on public.dromap_publications (owner_id, updated_at desc);

alter table public.dromap_publications enable row level security;

-- Aucun accès direct anon/authenticated : la bibliothèque publique passe par les
-- routes serveur DroMap, qui ne renvoient que les champs explicitement prévus.
revoke all on public.dromap_publications from anon;
revoke all on public.dromap_publications from authenticated;

-- Mettre un projet à la corbeille retire automatiquement sa publication.
create or replace function public.dromap_unpublish_trashed_project()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.dromap_publications
    where owner_id = new.owner_id and project_id = new.project_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_dromap_project_trashed_unpublish on public.dromap_projects;
create trigger on_dromap_project_trashed_unpublish
after update of deleted_at on public.dromap_projects
for each row execute procedure public.dromap_unpublish_trashed_project();

revoke all on function public.dromap_unpublish_trashed_project() from public;
revoke all on function public.dromap_unpublish_trashed_project() from anon;
revoke all on function public.dromap_unpublish_trashed_project() from authenticated;

-- Une publication est un avantage d’abonnement : si le compte repasse sur
-- la formule gratuite, ses cartes publiques sont automatiquement retirées.
-- Pendant une résiliation planifiée, le plan reste Plus/Pro jusqu’à la fin
-- de la période, donc les cartes restent publiques jusqu’à cette échéance.
create or replace function public.dromap_unpublish_non_subscriber()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  if old.plan in ('plus', 'pro', 'tester') and new.plan = 'free' then
    delete from public.dromap_publications
    where owner_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_dromap_billing_plan_unpublish on public.dromap_billing_accounts;
create trigger on_dromap_billing_plan_unpublish
after update of plan on public.dromap_billing_accounts
for each row execute procedure public.dromap_unpublish_non_subscriber();

revoke all on function public.dromap_unpublish_non_subscriber() from public;
revoke all on function public.dromap_unpublish_non_subscriber() from anon;
revoke all on function public.dromap_unpublish_non_subscriber() from authenticated;
