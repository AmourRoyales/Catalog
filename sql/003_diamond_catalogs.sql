-- Run this once in the Supabase SQL Editor, after 002_cad_catalog_multi_metal.sql.
-- Adds the Diamond Catalog feature: a saved FILTER (not a picked stone list —
-- see the "live filtered link" decision) that a public link re-runs against
-- the current diamond_stock on every view, plus a few derived columns on
-- diamond_stock that the import route now fills in so filtering is fast and
-- exact instead of parsing text at query time.

-- length_mm/width_mm/depth_mm: parsed from the Measurement column at import
--   time (round stones are "d1-d2xdepth", everything else is "LxWxdepth").
-- growth_type: derived from Comments ('CVD' / 'HPHT' / 'Other').
-- color_mode: derived from Col ('white' = a plain D-Z letter grade or range
--   like "O-P"; 'fancy' = any descriptive fancy-color text).
alter table diamond_stock add column if not exists length_mm numeric;
alter table diamond_stock add column if not exists width_mm numeric;
alter table diamond_stock add column if not exists depth_mm numeric;
alter table diamond_stock add column if not exists growth_type text;
alter table diamond_stock add column if not exists color_mode text;
create index if not exists diamond_stock_color_mode_idx on diamond_stock (color_mode);
create index if not exists diamond_stock_growth_type_idx on diamond_stock (growth_type);

-- diamond_catalogs — a saved filter + share code. No item table: the public
-- page re-queries diamond_stock live with the stored `filters` on every
-- view, so the link always reflects current stock (unlike cad_catalogs,
-- which snapshots prices at save time).
create table if not exists diamond_catalogs (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  show_price boolean not null default true,
  show_branding boolean not null default true,
  status text not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table diamond_catalogs enable row level security;

create policy "diamond_catalogs public read active"
  on diamond_catalogs for select
  to anon, authenticated
  using (status = 'active');

create policy "diamond_catalogs authenticated manage"
  on diamond_catalogs for all
  to authenticated
  using (true)
  with check (true);

-- diamond_stock itself still has NO anon/authenticated policy (unchanged) —
-- the public /diamonds/[code] page reads it only through the service-role
-- admin client in server code, never directly from the browser, so the
-- filter is the only thing a link's holder can see through.
