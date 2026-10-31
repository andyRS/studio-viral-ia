-- Revisión por fila para detectar ediciones simultáneas (dos ventanas, dos dispositivos, Realtime).
-- Cada UPDATE sube «revision» en 1 y pone «updated_at» a ahora. La app guarda solo si la revisión que
-- leyó sigue siendo la actual; si no, relee y reintenta o avisa del conflicto (ver src/lib/DataContext.tsx).
-- Ejecutar una vez en el SQL Editor de Supabase. Es idempotente (se puede ejecutar otra vez sin daño).
create or replace function public.subir_revision() returns trigger language plpgsql as $$
begin
  new.revision := coalesce(old.revision, 0) + 1;
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['accounts','series','characters','formulas','episodes','production_cards','clip_checks','costs',
                           'calendar_entries','metrics','viral_analyses','products','product_tests','account_profiles','story_outlines']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists revision integer not null default 0', t);
      execute format('alter table public.%I add column if not exists updated_at timestamptz default now()', t);
      execute format('drop trigger if exists subir_revision on public.%I', t);
      execute format('create trigger subir_revision before update on public.%I for each row execute function public.subir_revision()', t);
    end if;
  end loop;
end $$;
