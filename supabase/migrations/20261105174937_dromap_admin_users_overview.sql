-- Tableau de bord privé, consultable dans le Table Editor du schéma public.
-- Les rôles utilisés par l'application ne peuvent pas lire cette vue.
create or replace view public.dromap_admin_users_overview
with (security_invoker = true)
as
select
  users.id as user_id,
  nullif(trim(profiles.first_name), '') as first_name,
  nullif(trim(profiles.last_name), '') as last_name,
  users.email,
  users.email_confirmed_at is not null as email_confirmed,
  (
    select count(*)
    from public.dromap_projects as projects
    where projects.owner_id = users.id
      and projects.deleted_at is null
  ) as project_count,
  null::boolean as analytics_accepted
from auth.users as users
left join public.dromap_profiles as profiles on profiles.user_id = users.id;

revoke all on public.dromap_admin_users_overview
from public, anon, authenticated, service_role;

comment on view public.dromap_admin_users_overview is
  'Vue privée de suivi des comptes. analytics_accepted reste NULL car le choix est uniquement enregistré dans le navigateur.';
