create table if not exists public.saved_climbs (
  user_id uuid not null references auth.users(id) on delete cascade,
  climb_id uuid not null references public.climbs(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_climbs_pkey primary key (user_id, climb_id)
);

create index if not exists idx_saved_climbs_user_created
  on public.saved_climbs (user_id, created_at desc);

alter table public.saved_climbs enable row level security;

create policy "Users manage own saved climbs"
  on public.saved_climbs
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users read own saved climbs"
  on public.saved_climbs
  for select
  using (auth.uid() = user_id);

grant select, maintain on table public.saved_climbs to anon;
grant select, insert, delete, maintain, update on table public.saved_climbs to authenticated;
grant all on table public.saved_climbs to service_role;

create table if not exists public.saved_crags (
  user_id uuid not null references auth.users(id) on delete cascade,
  crag_id uuid not null references public.crags(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_crags_pkey primary key (user_id, crag_id)
);

create index if not exists idx_saved_crags_user_created
  on public.saved_crags (user_id, created_at desc);

alter table public.saved_crags enable row level security;

create policy "Users manage own saved crags"
  on public.saved_crags
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users read own saved crags"
  on public.saved_crags
  for select
  using (auth.uid() = user_id);

grant select, maintain on table public.saved_crags to anon;
grant select, insert, delete, maintain, update on table public.saved_crags to authenticated;
grant all on table public.saved_crags to service_role;
