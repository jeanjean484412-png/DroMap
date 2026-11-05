-- Supabase Auth may return an obfuscated user for an existing confirmed address
-- and may update an unconfirmed account on a second sign-up attempt. Check first.
create or replace function public.dromap_email_exists(p_email text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(trim(p_email))
      and deleted_at is null
  );
$$;

revoke all on function public.dromap_email_exists(text) from public, anon, authenticated;
grant execute on function public.dromap_email_exists(text) to service_role;
