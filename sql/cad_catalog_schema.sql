-- CAD-sourced catalog feature — run this once in the Supabase SQL Editor.
-- Additive only: does not touch products / catalogues / catalogue_products.

-- ---------------------------------------------------------------
-- diamond_stock — imported wholesale from the stock Excel, swap-safe
-- replaced on each re-upload via /diamond-stock (batch_id trick: new
-- rows are inserted under a fresh batch_id, old rows are only deleted
-- after every new row lands, so there's never a zero-row window).
-- Server-only access (service-role key) — no anon/authenticated policy,
-- so the raw stock list is never reachable from the browser.
-- ---------------------------------------------------------------
create table if not exists diamond_stock (
  id bigserial primary key,
  batch_id uuid not null,
  location text,
  stone_id text,
  cert text,
  shape text not null,
  carat numeric not null,
  color text,
  clarity text,
  cut text,
  polish text,
  symm text,
  fls text,
  rate numeric not null,
  amount numeric,
  measurement text,
  table_pct numeric,
  depth_pct numeric,
  ca numeric,
  ch numeric,
  pa numeric,
  ph numeric,
  ratio numeric,
  report_no text,
  comments text,
  girdle text,
  culet text,
  shade text,
  milky text,
  eye_clean text,
  image_link text,
  video_link text,
  cert_link text,
  extra text,
  cert_stage text,
  price_stage text,
  stone_stage text,
  imported_at timestamptz not null default now()
);
create index if not exists diamond_stock_shape_carat_idx on diamond_stock (shape, carat);
create index if not exists diamond_stock_batch_idx on diamond_stock (batch_id);

alter table diamond_stock enable row level security;
-- No policies added on purpose: default-deny for anon and authenticated.
-- Only the service-role client (lib/supabase/admin.ts) can read/write this table.

-- ---------------------------------------------------------------
-- cad_catalogs — one row per published CAD catalog (mirrors `catalogues`)
-- ---------------------------------------------------------------
create table if not exists cad_catalogs (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  name text not null,
  metals text[] not null, -- e.g. {'14k','18k'} — a catalog can be priced in more than one metal
  category text not null,
  extra_percent numeric not null default 0,
  show_price boolean not null default true,
  show_branding boolean not null default true,
  status text not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table cad_catalogs enable row level security;

create policy "cad_catalogs public read active"
  on cad_catalogs for select
  to anon, authenticated
  using (status = 'active');

create policy "cad_catalogs authenticated manage"
  on cad_catalogs for all
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------
-- cad_catalog_items — catalog -> design join (design itself lives in
-- data/gemini_tags.json / data/luxe_CAD.json, not a DB table). Price is
-- snapshotted at save time so a later stock re-upload or rate change
-- never silently changes an already-shared quote.
-- ---------------------------------------------------------------
create table if not exists cad_catalog_items (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references cad_catalogs(id) on delete cascade,
  design_id text not null,       -- `${dataset}::${collection}::${key}`
  dataset text not null,         -- 'design' | 'luxe'
  collection text not null,
  design_code text not null,
  design_type text not null,     -- Ring / Earring / Pendant / Necklace / Bracelet
  cad_url text not null,
  display_order int not null,
  prices jsonb not null,          -- { [metal]: { price, breakdown, certifiedSource } } — one entry per catalog metal
  created_at timestamptz not null default now(),
  unique (catalog_id, design_id)
);
create index if not exists cad_catalog_items_catalog_idx on cad_catalog_items (catalog_id, display_order);

alter table cad_catalog_items enable row level security;

create policy "cad_catalog_items public read via active catalog"
  on cad_catalog_items for select
  to anon, authenticated
  using (
    exists (
      select 1 from cad_catalogs c
      where c.id = cad_catalog_items.catalog_id and c.status = 'active'
    )
  );

create policy "cad_catalog_items authenticated manage"
  on cad_catalog_items for all
  to authenticated
  using (true)
  with check (true);
