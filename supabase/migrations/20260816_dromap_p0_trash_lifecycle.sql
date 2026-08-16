-- DroMap P0 — cycle de vie de la corbeille et nettoyage automatique
-- À exécuter APRÈS les migrations P0 du 15 et du 16 août.
-- Le job supprime définitivement les projets restés 10 jours dans la corbeille,
-- puis nettoie les morceaux devenus orphelins ou issus d'anciennes révisions.

create extension if not exists pg_cron;

create index if not exists dromap_projects_deleted_at_idx
  on public.dromap_projects (deleted_at)
  where deleted_at is not null;

create or replace function public.dromap_purge_expired_trash()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  purged_projects integer := 0;
begin
  -- Supprimer d'abord les morceaux associés aux projets arrivés à expiration.
  delete from public.dromap_project_chunks as chunk
  where exists (
    select 1
    from public.dromap_projects as project
    where project.owner_id = chunk.owner_id
      and project.project_id = chunk.project_id
      and project.deleted_at is not null
      and project.deleted_at <= now() - interval '10 days'
  );

  delete from public.dromap_projects
  where deleted_at is not null
    and deleted_at <= now() - interval '10 days';
  get diagnostics purged_projects = row_count;

  -- Filet de sécurité : supprimer les morceaux orphelins laissés par une
  -- interruption réseau ou une ancienne suppression, après 24 h de marge.
  delete from public.dromap_project_chunks as chunk
  where chunk.created_at <= now() - interval '1 day'
    and not exists (
      select 1
      from public.dromap_projects as project
      where project.owner_id = chunk.owner_id
        and project.project_id = chunk.project_id
    );

  -- Nettoyer aussi les anciennes révisions qui ne sont plus référencées par
  -- le manifeste courant. La marge de 24 h évite de toucher à un upload actif.
  delete from public.dromap_project_chunks as chunk
  using public.dromap_projects as project
  where project.owner_id = chunk.owner_id
    and project.project_id = chunk.project_id
    and chunk.revision <> project.current_revision
    and chunk.created_at <= now() - interval '1 day';

  return purged_projects;
end;
$$;

revoke all on function public.dromap_purge_expired_trash() from public;
revoke all on function public.dromap_purge_expired_trash() from anon;
revoke all on function public.dromap_purge_expired_trash() from authenticated;

-- Même nom = mise à jour du job si la migration est rejouée.
select cron.schedule(
  'dromap-purge-expired-trash',
  '17 3 * * *',
  $$select public.dromap_purge_expired_trash();$$
);

-- Nettoyage immédiat lors de l'installation, puis quotidien à 03:17 UTC.
select public.dromap_purge_expired_trash();

notify pgrst, 'reload schema';
