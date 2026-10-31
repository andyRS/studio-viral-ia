-- Proyecto largo (Facebook / YouTube): estructura por actos → secuencias → escenas, guiones por escena,
-- candados e historial de versiones, en «data» (jsonb). Una fila por serie. Ejecutar una vez en el SQL Editor.
create table if not exists public.story_outlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  series_id uuid references public.series(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.story_outlines enable row level security;
drop policy if exists "own rows" on public.story_outlines;
create policy "own rows" on public.story_outlines for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists story_outlines_user_created_idx on public.story_outlines (user_id, created_at, id);
create index if not exists story_outlines_series_idx on public.story_outlines (series_id);
