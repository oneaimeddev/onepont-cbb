create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  profession text not null check (length(trim(profession)) between 1 and 120),
  can_read_audit boolean not null default false
);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

create policy "Authenticated users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
