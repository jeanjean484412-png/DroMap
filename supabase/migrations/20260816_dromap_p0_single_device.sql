create table if not exists public.dromap_account_device_leases (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  device_id text not null,
  last_seen_at timestamptz not null default now()
);

alter table public.dromap_account_device_leases enable row level security;

drop policy if exists "dromap_device_lease_select_own" on public.dromap_account_device_leases;
create policy "dromap_device_lease_select_own"
on public.dromap_account_device_leases for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "dromap_device_lease_insert_own" on public.dromap_account_device_leases;
create policy "dromap_device_lease_insert_own"
on public.dromap_account_device_leases for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "dromap_device_lease_update_own" on public.dromap_account_device_leases;
create policy "dromap_device_lease_update_own"
on public.dromap_account_device_leases for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "dromap_device_lease_delete_own" on public.dromap_account_device_leases;
create policy "dromap_device_lease_delete_own"
on public.dromap_account_device_leases for delete
to authenticated
using (owner_id = auth.uid());

create index if not exists dromap_account_device_leases_last_seen_idx
  on public.dromap_account_device_leases(last_seen_at);
