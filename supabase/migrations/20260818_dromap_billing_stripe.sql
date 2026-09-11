-- DroMap — facturation Stripe, abonnements et achat Export Max par projet
-- À exécuter une fois dans le SQL Editor Supabase avant d'activer Checkout.

create table if not exists public.dromap_billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus', 'pro', 'tester')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text,
  billing_interval text check (billing_interval is null or billing_interval in ('month', 'year')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dromap_billing_accounts enable row level security;

grant select on public.dromap_billing_accounts to authenticated;

drop policy if exists "dromap_billing_accounts_select_own" on public.dromap_billing_accounts;
create policy "dromap_billing_accounts_select_own"
on public.dromap_billing_accounts for select
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

-- Les comptes déjà présents sont conservés en accès de test pendant la mise en
-- place de Stripe. Les nouveaux comptes créés après cette migration commencent
-- sur la formule gratuite.
insert into public.dromap_billing_accounts (user_id, plan)
select id, 'tester'
from auth.users
on conflict (user_id) do nothing;

create or replace function public.dromap_handle_new_billing_account()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.dromap_billing_accounts (user_id, plan)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_dromap_auth_user_billing_created on auth.users;
create trigger on_dromap_auth_user_billing_created
after insert on auth.users
for each row execute procedure public.dromap_handle_new_billing_account();

create table if not exists public.dromap_project_entitlements (
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  entitlement text not null check (entitlement in ('max-export')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount_total bigint,
  currency text,
  purchased_at timestamptz not null default now(),
  primary key (owner_id, project_id, entitlement),
  foreign key (owner_id, project_id)
    references public.dromap_projects(owner_id, project_id)
    on delete cascade
);

create index if not exists dromap_project_entitlements_owner_idx
  on public.dromap_project_entitlements (owner_id, purchased_at desc);

alter table public.dromap_project_entitlements enable row level security;

grant select on public.dromap_project_entitlements to authenticated;

drop policy if exists "dromap_project_entitlements_select_own" on public.dromap_project_entitlements;
create policy "dromap_project_entitlements_select_own"
on public.dromap_project_entitlements for select
to authenticated
using ((select auth.uid()) is not null and owner_id = (select auth.uid()));
