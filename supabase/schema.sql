-- Estudio Viral - Schema Supabase
create extension if not exists "pgcrypto";
create table if not exists public.accounts (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, name text not null, platform text check (platform in ('Instagram','Facebook','TikTok','YouTube Shorts')) not null, niche text check (niche in ('frutinovelas','cine90','cristiano','dropshipping')) not null, audience text, ideal_duration text, created_at timestamptz default now());
create table if not exists public.series (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, account_id uuid references public.accounts(id) on delete set null, title text not null, description text, created_at timestamptz default now());
create table if not exists public.characters (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, series_id uuid references public.series(id) on delete set null, name text not null, image_url text, visual_es text, visual_en text, clothing text, subtitle_color text default '#ffffff', speech_style text, pronunciations jsonb default '[]'::jsonb, created_at timestamptz default now());
create table if not exists public.formulas (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, name text not null, category text, content text, structure jsonb default '[]'::jsonb, created_at timestamptz default now());
create table if not exists public.episodes (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, account_id uuid references public.accounts(id) on delete set null, series_id uuid references public.series(id) on delete set null, formula_id uuid references public.formulas(id) on delete set null, title text, theme text, duration int, previous_summary text, script jsonb, prompts jsonb, hook jsonb, cover_text text, description text, hashtags text[], guion_json jsonb, platform_adaptations jsonb default '[]'::jsonb, versions jsonb default '[]'::jsonb, status text default 'Idea', created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.production_cards (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, episode_id uuid references public.episodes(id) on delete cascade, title text, stage text check (stage in ('Idea','Guion','Clips generados','Montaje','Publicado')) default 'Idea', created_at timestamptz default now());
create table if not exists public.clip_checks (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, episode_id uuid references public.episodes(id) on delete cascade, clip_index int, faces_consistent bool default false, full_phrases bool default false, pronunciation_ok bool default false, no_watermark bool default false, fruit_heads bool default false, notes text, created_at timestamptz default now());
alter table public.characters add column if not exists fruit text, add column if not exists fruit_emoji text, add column if not exists role text, add column if not exists head_es text, add column if not exists voice text, add column if not exists flow_prompt text, add column if not exists reference_version int default 0, add column if not exists reference_approved_at timestamptz, add column if not exists reference_history jsonb default '[]'::jsonb;
alter table public.clip_checks add column if not exists approved bool default false, add column if not exists reference_signature text default '';
update public.episodes set status = 'Borrador' where versions -> -1 ->> 'mode' = 'plantilla-local' and status is distinct from 'Borrador';
create table if not exists public.costs (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, episode_id uuid references public.episodes(id) on delete set null, tool text check (tool in ('Higgsfield','Dola','Otro')), credits numeric default 0, cost_usd numeric default 0, created_at timestamptz default now());
create table if not exists public.calendar_entries (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, account_id uuid references public.accounts(id) on delete cascade, episode_id uuid references public.episodes(id) on delete set null, date date not null, title text, platform text, created_at timestamptz default now());
create table if not exists public.metrics (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, episode_id uuid references public.episodes(id) on delete set null, account_id uuid references public.accounts(id) on delete set null, platform text, published_at date, views int default 0, avg_watch_seconds numeric default 0, interactions int default 0, followers_gained int default 0, formula_name text, hook_text text, duration_seconds int, created_at timestamptz default now());
create table if not exists public.viral_analyses (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, source_url text, transcript text, notes text, structure jsonb, formula_id uuid references public.formulas(id) on delete set null, created_at timestamptz default now());
create table if not exists public.products (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, name text not null, link text, photos jsonb default '[]'::jsonb, cost_price numeric default 0, sale_price numeric default 0, margin numeric generated always as (sale_price - cost_price) stored, angles jsonb, scripts jsonb, landing jsonb, created_at timestamptz default now());
create table if not exists public.product_tests (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, product_id uuid references public.products(id) on delete cascade, views int default 0, sales int default 0, revenue numeric default 0, is_winner bool default false, tested_at date default current_date, created_at timestamptz default now());
-- Migración 4B (segura si ya creaste las tablas): adaptación por plataforma
alter table public.accounts drop constraint if exists accounts_platform_check;
alter table public.accounts add constraint accounts_platform_check check (platform in ('Instagram','Facebook','TikTok','YouTube Shorts'));
alter table public.episodes add column if not exists platform_adaptations jsonb default '[]'::jsonb;
-- Métricas específicas por plataforma 4B (compartidos, % completo, visto vs deslizado...) + título del episodio
alter table public.metrics add column if not exists extra jsonb default '{}'::jsonb;
-- RLS
do $$ declare t text; begin foreach t in array array['accounts','series','characters','formulas','episodes','production_cards','clip_checks','costs','calendar_entries','metrics','viral_analyses','products','product_tests'] loop execute format('alter table public.%I enable row level security;', t); execute format('drop policy if exists "own rows" on public.%I;', t); execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t); end loop; end $$;
-- Conexiones con redes (Meta): tokens de página. RLS activado SIN políticas:
-- solo el servidor (service role) puede leerla; el navegador nunca ve los tokens.
create table if not exists public.social_connections (user_id uuid references auth.users(id) on delete cascade, provider text not null, data jsonb not null default '{}'::jsonb, updated_at timestamptz default now(), primary key (user_id, provider));
alter table public.social_connections enable row level security;
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
