-- DroMap V18.12 — migration consolidée / réparation de la publication publique.
-- Idempotente : peut être exécutée même si V18.9 et V18.10 ont déjà été appliquées.
-- Elle crée les tables manquantes, ajoute les colonnes de droits et force le
-- rechargement du schéma PostgREST à la fin.

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
  access_mode text not null default 'read-only',
  allow_creator_credit_removal boolean not null default false,
  creator_credit_name text,
  source_revision text,
  source_chunk_count integer,
  source_encoding text,
  source_payload_size_bytes bigint,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, project_id),
  foreign key (owner_id, project_id)
    references public.dromap_projects(owner_id, project_id)
    on delete cascade
);

alter table if exists public.dromap_publications
  add column if not exists access_mode text not null default 'read-only',
  add column if not exists allow_creator_credit_removal boolean not null default false,
  add column if not exists creator_credit_name text,
  add column if not exists source_revision text,
  add column if not exists source_chunk_count integer,
  add column if not exists source_encoding text,
  add column if not exists source_payload_size_bytes bigint;

alter table if exists public.dromap_publications
  drop constraint if exists dromap_publications_access_mode_check;
alter table if exists public.dromap_publications
  add constraint dromap_publications_access_mode_check
  check (access_mode in ('read-only', 'export', 'edit-export'));

alter table if exists public.dromap_publications
  drop constraint if exists dromap_publications_creator_credit_name_check;
alter table if exists public.dromap_publications
  add constraint dromap_publications_creator_credit_name_check
  check (
    creator_credit_name is null
    or char_length(creator_credit_name) between 1 and 100
  );

alter table if exists public.dromap_publications
  drop constraint if exists dromap_publications_export_credit_check;
alter table if exists public.dromap_publications
  add constraint dromap_publications_export_credit_check
  check (
    access_mode = 'read-only'
    or (creator_credit_name is not null and char_length(creator_credit_name) between 1 and 100)
  );

alter table if exists public.dromap_publications
  drop constraint if exists dromap_publications_source_manifest_check;
alter table if exists public.dromap_publications
  add constraint dromap_publications_source_manifest_check
  check (
    (
      source_revision is null
      and source_chunk_count is null
      and source_encoding is null
      and source_payload_size_bytes is null
    )
    or (
      source_revision is not null
      and source_chunk_count is not null and source_chunk_count >= 1
      and source_encoding in ('gzip-base64', 'base64')
      and source_payload_size_bytes is not null and source_payload_size_bytes >= 0
    )
  );

create index if not exists dromap_publications_published_idx
  on public.dromap_publications (published_at desc);
create index if not exists dromap_publications_owner_idx
  on public.dromap_publications (owner_id, updated_at desc);

alter table public.dromap_publications enable row level security;
revoke all on public.dromap_publications from anon;
revoke all on public.dromap_publications from authenticated;

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

create table if not exists public.dromap_publication_source_chunks (
  publication_slug text not null
    references public.dromap_publications(slug) on delete cascade,
  revision text not null,
  chunk_index integer not null check (chunk_index >= 0),
  chunk text not null,
  primary key (publication_slug, revision, chunk_index)
);

create index if not exists dromap_publication_source_chunks_slug_idx
  on public.dromap_publication_source_chunks (publication_slug, revision, chunk_index);

alter table public.dromap_publication_source_chunks enable row level security;
revoke all on public.dromap_publication_source_chunks from anon;
revoke all on public.dromap_publication_source_chunks from authenticated;

create table if not exists public.dromap_publication_entitlements (
  buyer_id uuid not null references auth.users(id) on delete cascade,
  publication_slug text not null
    references public.dromap_publications(slug) on delete cascade,
  access_mode text not null check (access_mode in ('export', 'edit-export')),
  allow_creator_credit_removal boolean not null default false,
  creator_credit_name text null check (
    creator_credit_name is null or char_length(creator_credit_name) between 1 and 100
  ),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount_total bigint,
  currency text,
  purchased_at timestamptz not null default now(),
  primary key (buyer_id, publication_slug)
);

create index if not exists dromap_publication_entitlements_buyer_idx
  on public.dromap_publication_entitlements (buyer_id, purchased_at desc);
create index if not exists dromap_publication_entitlements_slug_idx
  on public.dromap_publication_entitlements (publication_slug, purchased_at desc);

alter table public.dromap_publication_entitlements enable row level security;
revoke all on public.dromap_publication_entitlements from anon;
revoke all on public.dromap_publication_entitlements from authenticated;

alter table if exists public.dromap_project_entitlements
  drop constraint if exists dromap_project_entitlements_entitlement_check;
alter table if exists public.dromap_project_entitlements
  add constraint dromap_project_entitlements_entitlement_check
  check (entitlement in ('max-export', 'public-map-export'));

-- Important après l'ajout de colonnes : Supabase/PostgREST recharge immédiatement
-- son cache de schéma, ce qui évite les erreurs PGRST204 juste après migration.
notify pgrst, 'reload schema';
