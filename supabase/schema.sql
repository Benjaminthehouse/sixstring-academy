-- Sixstring Academy: the one table that accounts and cross-device sync need.
--
-- Run this whole file once in your Supabase project: Dashboard > SQL Editor > New query > paste >
-- Run. It is safe to run again (after an app update, or if you are not sure you ran it): it only
-- creates what is missing and re-applies the rules.
--
-- What it stores: for each learner, a handful of small JSON documents (their progress, practice
-- journal, settings and their own songs), one row each. The app never stores anything else here:
-- no AI key, no passwords, no recordings (recordings stay on the device that made them).
--
-- Who can read what: the app's "anon" key is public on purpose (it ships inside the web page).
-- What protects the data is row-level security below: a signed-in learner can select, insert,
-- update and delete only rows whose user_id is their own id (auth.uid()). Anyone who is not
-- signed in can do nothing at all with this table.

-- ---------------------------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------------------------

create table if not exists public.sync_docs (
  -- A random id. Realtime sends "a row was deleted" events to every listener without checking
  -- row security (Postgres cannot check a row that is gone), carrying only the primary key. With
  -- a random key those events give away nothing about whose row it was or what it held.
  id uuid primary key default gen_random_uuid(),
  -- The learner. Deleting the user (Authentication > Users > Delete) deletes their rows too.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The document's name: "progress", "progress.<save>.<n>" for a large save, "song.<id>".
  path text not null,
  -- The document itself.
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint sync_docs_user_path unique (user_id, path),
  constraint sync_docs_path_check check (char_length(path) between 1 and 200),
  -- One document stays well under this (the app splits a large save into parts of about 200 KB,
  -- and a song travels only when it is under 180 KB).
  constraint sync_docs_data_size check (octet_length(data::text) <= 300000)
);

comment on table public.sync_docs is 'Sixstring Academy: each learner''s synced documents (progress, journal, settings, own songs). Row-level security: own rows only.';

-- The app reads one learner's rows by (user_id, path): the unique constraint above is that index.

-- ---------------------------------------------------------------------------------------------
-- updated_at is set by the database, never by a device's clock
-- ---------------------------------------------------------------------------------------------

create or replace function public.sync_docs_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sync_docs_touch on public.sync_docs;
create trigger sync_docs_touch
  before insert or update on public.sync_docs
  for each row execute function public.sync_docs_touch();

-- ---------------------------------------------------------------------------------------------
-- A ceiling per learner, so one account cannot fill the free database for everyone else.
-- The app needs a few dozen rows (at most 50 songs, a save in up to 48 parts, a little more
-- while a save is being replaced); 300 leaves plenty of room. Replacing a row that exists is
-- always allowed (an upsert fires this trigger before it finds the row it will update).
-- ---------------------------------------------------------------------------------------------

create or replace function public.sync_docs_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.sync_docs where user_id = new.user_id and path = new.path)
     and (select count(*) from public.sync_docs where user_id = new.user_id) >= 300 then
    raise exception 'Too many sync documents for one account' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_docs_limit on public.sync_docs;
create trigger sync_docs_limit
  before insert on public.sync_docs
  for each row execute function public.sync_docs_limit();

-- ---------------------------------------------------------------------------------------------
-- Row-level security: every learner reaches only their own rows
-- ---------------------------------------------------------------------------------------------

alter table public.sync_docs enable row level security;

-- Nobody who is not signed in may touch the table at all; signed-in learners only through the
-- policies below.
revoke all on table public.sync_docs from anon;
revoke all on table public.sync_docs from authenticated;
grant select, insert, update, delete on table public.sync_docs to authenticated;

-- (select auth.uid()) rather than auth.uid(): Postgres then works it out once per query, not
-- once per row. The meaning is the same.

drop policy if exists "sync_docs: read own rows" on public.sync_docs;
create policy "sync_docs: read own rows"
  on public.sync_docs for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "sync_docs: add own rows" on public.sync_docs;
create policy "sync_docs: add own rows"
  on public.sync_docs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- "using" decides which rows may be changed, "with check" what they may become: a learner can
-- neither change someone else's row nor hand one of their own rows to someone else.
drop policy if exists "sync_docs: change own rows" on public.sync_docs;
create policy "sync_docs: change own rows"
  on public.sync_docs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "sync_docs: delete own rows" on public.sync_docs;
create policy "sync_docs: delete own rows"
  on public.sync_docs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------
-- Realtime: changes from the learner's other devices arrive within seconds
-- ---------------------------------------------------------------------------------------------
-- The app listens for inserts and updates of its own rows (filtered by user_id; Realtime checks
-- the policies above before delivering a row). It does not listen for deletes, and it also
-- looks for changes by itself now and then, so syncing works even if Realtime is switched off.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sync_docs'
     ) then
    alter publication supabase_realtime add table public.sync_docs;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Check it worked (optional): run these one at a time.
-- ---------------------------------------------------------------------------------------------
-- select relrowsecurity from pg_class where oid = 'public.sync_docs'::regclass;     -- true
-- select policyname, cmd from pg_policies where tablename = 'sync_docs';             -- four rows
-- select count(*) from pg_publication_tables where tablename = 'sync_docs';          -- 1
