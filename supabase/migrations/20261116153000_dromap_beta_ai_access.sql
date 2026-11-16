-- Grant beta AI access per account without changing its billing plan.
alter table public.dromap_billing_accounts
  add column if not exists ai_access boolean not null default false;
