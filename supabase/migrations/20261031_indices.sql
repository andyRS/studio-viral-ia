-- Índices para leer rápido los datos de cada usuario (la app filtra por user_id y ordena por created_at).
-- Sin ellos, con muchos episodios, Supabase cortaba la lectura: «canceling statement due to statement timeout».
-- Ejecutar una vez en el SQL Editor de Supabase. Es seguro repetirlo (if not exists).
create index if not exists episodes_user_created_idx on public.episodes (user_id, created_at, id);
create index if not exists series_user_created_idx on public.series (user_id, created_at, id);
create index if not exists characters_user_created_idx on public.characters (user_id, created_at, id);
create index if not exists accounts_user_created_idx on public.accounts (user_id, created_at, id);
create index if not exists formulas_user_created_idx on public.formulas (user_id, created_at, id);
create index if not exists production_cards_user_created_idx on public.production_cards (user_id, created_at, id);
create index if not exists clip_checks_user_created_idx on public.clip_checks (user_id, created_at, id);
create index if not exists costs_user_created_idx on public.costs (user_id, created_at, id);
create index if not exists calendar_entries_user_created_idx on public.calendar_entries (user_id, created_at, id);
create index if not exists metrics_user_created_idx on public.metrics (user_id, created_at, id);
create index if not exists viral_analyses_user_created_idx on public.viral_analyses (user_id, created_at, id);
create index if not exists products_user_created_idx on public.products (user_id, created_at, id);
create index if not exists product_tests_user_created_idx on public.product_tests (user_id, created_at, id);
create index if not exists account_profiles_user_created_idx on public.account_profiles (user_id, created_at, id);
