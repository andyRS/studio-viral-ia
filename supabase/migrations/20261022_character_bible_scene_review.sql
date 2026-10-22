-- Ejecutar en proyectos ya desplegados antes de publicar el cliente actualizado.
alter table public.characters
  add column if not exists fruit text,
  add column if not exists fruit_emoji text,
  add column if not exists role text,
  add column if not exists head_es text,
  add column if not exists voice text,
  add column if not exists flow_prompt text,
  add column if not exists reference_version int default 0,
  add column if not exists reference_approved_at timestamptz,
  add column if not exists reference_history jsonb default '[]'::jsonb;
alter table public.clip_checks add column if not exists approved bool default false, add column if not exists reference_signature text default '';

-- Los guiones que salieron de la plantilla local nunca deben aparentar estar listos para producir.
update public.episodes
set status = 'Borrador'
where versions -> -1 ->> 'mode' = 'plantilla-local'
  and status is distinct from 'Borrador';
