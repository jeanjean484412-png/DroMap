begin;

-- Limite technique partagée par toutes les instances, indépendante des quotas commerciaux.
create table if not exists public.dromap_request_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('ai', 'geojson')),
  started_at timestamptz not null,
  requests integer not null check (requests > 0),
  primary key (user_id, scope)
);
alter table public.dromap_request_windows enable row level security;
revoke all on public.dromap_request_windows from public, anon, authenticated;

create or replace function public.dromap_take_ai_request(p_user_id uuid, p_scope text, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_limit < 1 or p_limit > 120 or p_scope not in ('ai', 'geojson') then return false; end if;
  insert into public.dromap_request_windows as current_window(user_id, scope, started_at, requests)
  values (p_user_id, p_scope, now(), 1)
  on conflict (user_id, scope) do update set
    started_at = case when current_window.started_at <= now() - interval '1 minute' then now() else current_window.started_at end,
    requests = case when current_window.started_at <= now() - interval '1 minute' then 1 else current_window.requests + 1 end
  where current_window.started_at <= now() - interval '1 minute' or current_window.requests < p_limit;
  return found;
end;
$$;
revoke all on function public.dromap_take_ai_request(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.dromap_take_ai_request(uuid, text, integer) to service_role;

-- Les reçus restent présents même si un projet est supprimé/recréé : un paiement
-- déjà traité ne doit jamais rouvrir un cycle de travail lors d'un rejeu Stripe.
create table if not exists public.dromap_processed_map_checkouts (
  checkout_id text primary key,
  processed_at timestamptz not null default now()
);
alter table public.dromap_processed_map_checkouts enable row level security;
revoke all on public.dromap_processed_map_checkouts from public, anon, authenticated;

insert into public.dromap_processed_map_checkouts(checkout_id)
select stripe_checkout_session_id from public.dromap_project_entitlements
where stripe_checkout_session_id is not null
on conflict do nothing;

create or replace function public.dromap_grant_single_map_checkout(
  p_owner_id uuid, p_project_id text, p_checkout_id text, p_payment_intent_id text,
  p_amount_total bigint, p_currency text, p_purchased_at timestamptz
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_checkout_id is null or p_checkout_id = '' or p_purchased_at is null then return false; end if;
  insert into public.dromap_processed_map_checkouts(checkout_id) values (p_checkout_id)
    on conflict do nothing;
  if not found then return true; end if;

  insert into public.dromap_project_entitlements as entitlement(
    owner_id, project_id, entitlement, stripe_checkout_session_id, stripe_payment_intent_id,
    amount_total, currency, purchased_at, first_downloaded_at
  ) values (
    p_owner_id, p_project_id, 'max-export', p_checkout_id, p_payment_intent_id,
    p_amount_total, p_currency, p_purchased_at, null
  ) on conflict (owner_id, project_id, entitlement) do update set
    stripe_checkout_session_id = excluded.stripe_checkout_session_id,
    stripe_payment_intent_id = excluded.stripe_payment_intent_id,
    amount_total = excluded.amount_total, currency = excluded.currency,
    purchased_at = excluded.purchased_at, first_downloaded_at = null
  where entitlement.purchased_at <= excluded.purchased_at
    and entitlement.stripe_checkout_session_id is distinct from excluded.stripe_checkout_session_id;
  return true;
end;
$$;
revoke all on function public.dromap_grant_single_map_checkout(uuid, text, text, text, bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.dromap_grant_single_map_checkout(uuid, text, text, text, bigint, text, timestamptz) to service_role;

-- Réaffirmer que les sources passent par les routes serveur qui filtrent les
-- champs privés, y compris pour les anciennes publications.
alter table public.dromap_publication_source_chunks enable row level security;
revoke all on public.dromap_publication_source_chunks from public, anon, authenticated;
revoke insert, update, delete on public.dromap_project_entitlements from public, anon, authenticated;

commit;
