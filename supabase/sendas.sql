-- ═══════════════════════════════════════════════════════════════════════
-- sendas.sql — Talentos (sendas) del mecenas. Capa C.
-- ─────────────────────────────────────────────────────────────────────────
-- Añade a mecenas_stats una columna `sendas` (jsonb): { dominio: [talentoId…] }.
-- Los talentos se ganan gastando "puntos de talento" (1 por cada 8 niveles de
-- stat subidos) y están gateados por el reparto de stats. La RLS de mecenas_stats
-- ya existe (lectura pública, escritura del dueño); no hace falta tocarla.
-- Ejecutar una vez en el SQL editor de Supabase (después de mecenas_stats.sql).
-- ═══════════════════════════════════════════════════════════════════════
alter table public.mecenas_stats add column if not exists sendas jsonb not null default '{}'::jsonb;
