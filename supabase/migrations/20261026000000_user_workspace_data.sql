create table if not exists public.user_workspace_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"schemaVersion":1,"apps":[],"collections":[],"projects":[],"activity":[]}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint user_workspace_data_shape check (
    jsonb_typeof(data) = 'object'
    and data ->> 'schemaVersion' = '1'
    and jsonb_typeof(data -> 'apps') = 'array'
    and jsonb_typeof(data -> 'collections') = 'array'
    and jsonb_typeof(data -> 'projects') = 'array'
    and jsonb_typeof(data -> 'activity') = 'array'
  )
);

alter table public.user_workspace_data enable row level security;
alter table public.user_workspace_data force row level security;

revoke all on table public.user_workspace_data from anon, authenticated;
grant select, insert, update on table public.user_workspace_data to authenticated;

drop policy if exists user_workspace_data_select_own on public.user_workspace_data;
create policy user_workspace_data_select_own
  on public.user_workspace_data for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_workspace_data_insert_own on public.user_workspace_data;
create policy user_workspace_data_insert_own
  on public.user_workspace_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists user_workspace_data_update_own on public.user_workspace_data;
create policy user_workspace_data_update_own
  on public.user_workspace_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
