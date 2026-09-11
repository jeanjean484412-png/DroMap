-- DroMap — verrouillage de la zone après le premier téléchargement d'un Export Max acheté à l'unité.
-- Migration additive et idempotente : elle peut être exécutée après 20260818_dromap_billing_stripe.sql.

alter table if exists public.dromap_project_entitlements
  add column if not exists first_downloaded_at timestamptz;
