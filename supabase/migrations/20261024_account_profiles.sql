-- Perfil de cuenta: lo que la IA debe saber de cada cuenta (objetivo, metas, público, reglas,
-- ritmo de publicación, CTA, canción de firma por serie, bio, banco de ideas…). Los campos van en
-- «data» (jsonb) para poder ampliarlos sin otra migración. Ejecutar una vez en el SQL Editor de Supabase.
create table if not exists public.account_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.account_profiles enable row level security;
drop policy if exists "own rows" on public.account_profiles;
create policy "own rows" on public.account_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
