-- Series ancladas a una red: YouTube normal (largo) como red y datos de la serie en «meta»
-- (formato largo/corto y cuentas que reciben sus clips). Ejecutar una vez en el SQL Editor de Supabase.
alter table public.accounts drop constraint if exists accounts_platform_check;
alter table public.accounts add constraint accounts_platform_check
  check (platform in ('Instagram','Facebook','TikTok','YouTube Shorts','YouTube'));
alter table public.series add column if not exists meta jsonb not null default '{}'::jsonb;
