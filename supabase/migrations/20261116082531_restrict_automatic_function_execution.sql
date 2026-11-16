-- Preserve internal execution while removing browser/public grants.
-- Function bodies, owners, SECURITY DEFINER and existing triggers stay unchanged.
grant execute on function public.dromap_handle_new_user(),
  public.dromap_handle_new_billing_account()
  to supabase_auth_admin, service_role;

revoke execute on function public.dromap_handle_new_user(),
  public.dromap_handle_new_billing_account()
  from public, anon, authenticated;

-- Supabase installs this helper on hosted projects; it may be absent locally.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    grant execute on function public.rls_auto_enable() to supabase_auth_admin, service_role;
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
