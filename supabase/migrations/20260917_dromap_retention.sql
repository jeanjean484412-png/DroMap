-- À appliquer après les migrations existantes, dans Supabase SQL Editor.
-- Aucun compte ni projet actif n'est supprimé par cette migration.
begin;
create extension if not exists pg_cron;

create or replace function public.dromap_purge_expired_technical_data()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.dromap_abuse_windows where expires_at < now();
  delete from public.dromap_request_windows where started_at < now() - interval '1 day';
  delete from public.dromap_personal_library_chunks c
  where c.created_at < now() - interval '1 day'
    and not exists (
      select 1 from public.dromap_personal_library l
      where l.owner_id = c.owner_id and l.current_revision = c.revision
    );
end;
$$;
revoke all on function public.dromap_purge_expired_technical_data() from public, anon, authenticated;
grant execute on function public.dromap_purge_expired_technical_data() to service_role;

-- Contrôle mensuel par l'exploitant : ne pas supprimer aveuglément les comptes
-- ayant des abonnements, des contenus achetés ou des publications vendues.
create or replace view public.dromap_inactive_accounts_review as
select u.id as user_id, activity.last_activity_at,
  exists(select 1 from public.dromap_billing_accounts b where b.user_id = u.id
    and (b.stripe_customer_id is not null or b.plan <> 'free')) as billing_review_required,
  exists(select 1 from public.dromap_project_entitlements e where e.owner_id = u.id)
    or exists(select 1 from public.dromap_publication_entitlements e where e.buyer_id = u.id)
    or exists(select 1 from public.dromap_publications p join public.dromap_publication_entitlements e
      on e.publication_slug = p.slug where p.owner_id = u.id) as purchased_content_review_required
from auth.users u
cross join lateral (
  select greatest(u.created_at, u.last_sign_in_at,
    (select max(d.last_seen_at) from public.dromap_account_device_leases d where d.owner_id = u.id),
    (select max(p.updated_at) from public.dromap_projects p where p.owner_id = u.id),
    (select max(l.updated_at) from public.dromap_personal_library l where l.owner_id = u.id)
  ) as last_activity_at
) activity
where activity.last_activity_at < now() - interval '3 years';
revoke all on public.dromap_inactive_accounts_review from public, anon, authenticated;
grant select on public.dromap_inactive_accounts_review to service_role;

select cron.schedule('dromap-purge-expired-technical-data', '37 3 * * *',
  $$select public.dromap_purge_expired_technical_data();$$);
-- Assurer le nettoyage de la corbeille même en l'absence de connexion utilisateur.
select cron.schedule('dromap-purge-expired-trash', '17 3 * * *',
  $$select public.dromap_purge_expired_trash();$$);
commit;
notify pgrst, 'reload schema';
