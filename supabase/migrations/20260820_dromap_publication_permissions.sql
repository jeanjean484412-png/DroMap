-- DroMap P2 — droits des cartes publiques, achat à l'unité et copies modifiables.
-- À exécuter après 20260820_dromap_publications.sql.
-- Migration additive/idempotente : elle ne modifie pas le contenu des cartes existantes.

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

-- Copie figée du projet source utilisée uniquement lorsque le créateur autorise
-- « modification + export ». Aucun accès direct anon/authenticated : le serveur
-- DroMap revérifie les droits avant de délivrer chaque morceau.
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

-- Droit acheté sur une carte publique. Les règles importantes sont figées au
-- moment du paiement : type d'accès et possibilité de retirer le crédit du
-- créateur. Cela évite qu'un acheteur perde rétroactivement un droit déjà payé
-- simplement parce que le créateur modifie ensuite les options de publication.
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
-- Les droits sont volontairement lus/écrits uniquement par les routes serveur.
-- Les clients n'ont aucun droit SQL direct permettant de s'auto-attribuer un achat.
revoke all on public.dromap_publication_entitlements from anon;
revoke all on public.dromap_publication_entitlements from authenticated;

-- Une copie personnelle issue d'une carte publique achetée doit conserver
-- l'export visuel débloqué sans devenir un Export Max classique et sans créer
-- le verrouillage de zone du premier téléchargement.
alter table if exists public.dromap_project_entitlements
  drop constraint if exists dromap_project_entitlements_entitlement_check;
alter table if exists public.dromap_project_entitlements
  add constraint dromap_project_entitlements_entitlement_check
  check (entitlement in ('max-export', 'public-map-export'));
