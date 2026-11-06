-- Conserver les colonnes existantes dans le même ordre pour CREATE OR REPLACE VIEW.
create or replace view public.dromap_admin_users_overview
with (security_invoker = true)
as
select
  users.id as user_id,
  nullif(trim(profiles.first_name), '') as first_name,
  nullif(trim(profiles.last_name), '') as last_name,
  users.email,
  users.email_confirmed_at is not null as email_confirmed,
  project_stats.active_count as project_count,
  null::boolean as analytics_accepted,
  users.created_at as account_created_at,
  users.last_sign_in_at,
  billing.plan,
  users.email_confirmed_at,
  project_stats.trashed_count as trashed_project_count,
  project_stats.last_active_update_at as last_project_updated_at
from auth.users as users
left join public.dromap_profiles as profiles on profiles.user_id = users.id
left join public.dromap_billing_accounts as billing on billing.user_id = users.id
left join lateral (
  select
    count(*) filter (where projects.deleted_at is null) as active_count,
    count(*) filter (where projects.deleted_at is not null) as trashed_count,
    max(projects.updated_at) filter (where projects.deleted_at is null) as last_active_update_at
  from public.dromap_projects as projects
  where projects.owner_id = users.id
) as project_stats on true;

revoke all on public.dromap_admin_users_overview
from public, anon, authenticated, service_role;
