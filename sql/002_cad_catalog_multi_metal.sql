-- Run this once in the Supabase SQL Editor, after cad_catalog_schema.sql.
-- Upgrades cad_catalogs/cad_catalog_items from a single `metal` per catalog
-- to multiple metals — the catalog builder now lets you check more than one
-- metal, and each design carries one price per checked metal.
--
-- Safe to run even if you've already opened the builder, AS LONG AS you
-- haven't saved a catalog yet — this drops the old metal/price columns.
-- If you did save one, tell me and I'll write a data-preserving version
-- instead of this drop-and-recreate one.

alter table cad_catalogs drop column if exists metal;
alter table cad_catalogs add column if not exists metals text[] not null default '{}';

alter table cad_catalog_items drop column if exists price;
alter table cad_catalog_items drop column if exists price_breakdown;
alter table cad_catalog_items drop column if exists certified_source;
alter table cad_catalog_items add column if not exists prices jsonb not null default '{}'::jsonb;
