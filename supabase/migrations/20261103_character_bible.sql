-- Biblia extendida de cada personaje (rasgos invariables, vestuario, paleta, prompt negativo, voz, relaciones,
-- candado de identidad y versiones). Ejecutar una vez en el SQL Editor de Supabase.
alter table public.characters add column if not exists bible jsonb not null default '{}'::jsonb;
