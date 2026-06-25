-- ============================================================================
-- PlaceScout multi-city schema (Supabase / Postgres)
-- Paste this whole file into Supabase → SQL Editor → Run.
--
-- Design: each row stores the full typed object as JSONB (flexible, matches the
-- TypeScript model exactly) plus a few extracted columns for filtering/joins.
-- The `places` table doubles as the Google Places discovery cache, so repeat
-- searches of the same city don't re-bill the Places API.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- Cities ---------------------------------------------------------------------
create table if not exists cities (
  id          text primary key,            -- slug, e.g. "nyc"
  data        jsonb not null,              -- City object
  updated_at  timestamptz not null default now()
);

-- Search profiles (per-city criteria + anchors + weights) --------------------
create table if not exists profiles (
  id          text primary key,
  city_id     text not null references cities(id) on delete cascade,
  data        jsonb not null,              -- SearchProfile object
  updated_at  timestamptz not null default now()
);
create index if not exists profiles_city_idx on profiles (city_id);

-- Places (also the discovery cache) ------------------------------------------
create table if not exists places (
  id              text primary key,        -- our Place.id (slug or google id)
  city_id         text references cities(id) on delete cascade,
  google_place_id text,                    -- Places API (New) id, for dedup/refresh
  data            jsonb not null,          -- full Place object
  updated_at      timestamptz not null default now()
);
create index if not exists places_city_idx on places (city_id);
create unique index if not exists places_google_uidx
  on places (google_place_id) where google_place_id is not null;

-- User notes / decisions / ranking (overlay, keyed by place id) --------------
create table if not exists user_meta (
  place_id    text primary key,
  data        jsonb not null,              -- UserMeta object
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Row Level Security.
-- This is a single-user personal research tool with no auth, so we enable RLS
-- and grant the anon role full access. TIGHTEN THIS (add auth + per-user
-- policies) before exposing the app publicly.
-- ----------------------------------------------------------------------------
alter table cities    enable row level security;
alter table profiles  enable row level security;
alter table places    enable row level security;
alter table user_meta enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cities','profiles','places','user_meta'] loop
    execute format('drop policy if exists %I_anon_all on %I;', t, t);
    execute format(
      'create policy %I_anon_all on %I for all to anon using (true) with check (true);',
      t, t
    );
  end loop;
end $$;
