-- RECALL — database schema (complete)
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again at any time: it only adds or updates what is missing and never deletes your cards.

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  position    int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  name        text not null,
  position    int  not null default 0,          -- "order" from the import file
  created_at  timestamptz not null default now(),
  unique (subject_id, name)
);

create table if not exists public.cards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  external_id     text not null,                 -- stable "id" from the import file
  subject_id      uuid not null references public.subjects (id) on delete cascade,
  unit_id         uuid not null references public.units (id) on delete cascade,
  section         text,
  kind            text not null default 'basic', -- v2: 'occlusion', …
  front           text not null default '',      -- markdown
  back            text not null default '',      -- markdown
  front_image     text,                          -- path in the card-images bucket
  back_image      text,
  extra           jsonb,                         -- v2 data (e.g. occlusion masks)
  tags            text[] not null default '{}',
  source          text,
  position        int  not null default 0,       -- order of new cards within a unit
  suspended       boolean not null default false,
  -- FSRS scheduling state (ts-fsrs Card)
  state           smallint not null default 0,   -- 0 New, 1 Learning, 2 Review, 3 Relearning
  due             timestamptz not null default now(),
  stability       double precision not null default 0,
  difficulty      double precision not null default 0,
  elapsed_days    int not null default 0,
  scheduled_days  int not null default 0,
  learning_steps  int not null default 0,
  reps            int not null default 0,
  lapses          int not null default 0,
  last_review     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, external_id)
);

create index if not exists cards_user_due_idx on public.cards (user_id, due);
create index if not exists cards_unit_idx     on public.cards (unit_id);
create index if not exists cards_subject_idx  on public.cards (subject_id);
create index if not exists cards_tags_idx     on public.cards using gin (tags);

-- One row per rating. "state", "stability", "difficulty" are the card's values BEFORE the review
-- (ts-fsrs ReviewLog), so this history can later be used to tune FSRS to you.
create table if not exists public.review_logs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id            uuid not null references public.cards (id) on delete cascade,
  subject_id         uuid references public.subjects (id) on delete set null,
  rating             smallint not null,            -- 1 Again, 2 Hard, 3 Good, 4 Easy (the button you pressed)
  state              smallint not null,
  due                timestamptz not null,
  stability          double precision not null,
  difficulty         double precision not null,
  elapsed_days       int not null,
  last_elapsed_days  int not null,
  scheduled_days     int not null,
  learning_steps     int not null default 0,
  review             timestamptz not null,
  duration_ms        int,                          -- card shown → rated
  think_ms           int,                          -- card shown → "Show answer" (recall time)
  created_at         timestamptz not null default now()
);
alter table public.review_logs add column if not exists think_ms int;

create index if not exists review_logs_user_review_idx on public.review_logs (user_id, review);
create index if not exists review_logs_card_idx        on public.review_logs (card_id);

create table if not exists public.settings (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  desired_retention    real not null default 0.9 check (desired_retention between 0.7 and 0.99),
  new_per_day          int  not null default 20  check (new_per_day between 0 and 9999),
  max_reviews_per_day  int  not null default 200 check (max_reviews_per_day between 0 and 99999),
  day_starts_at        smallint not null default 4 check (day_starts_at between 0 and 23),
  updated_at           timestamptz not null default now()
);

-- Brain dump attempts (Phase 3).
create table if not exists public.brain_dumps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id   uuid references public.subjects (id) on delete cascade,
  unit_id      uuid references public.units (id) on delete cascade,
  section      text,
  text         text not null default '',
  duration_s   int  not null default 0,
  hints_used   boolean not null default false,
  covered_ids  uuid[] not null default '{}',
  missed_ids   uuid[] not null default '{}',
  score        real not null default 0,            -- 0..1
  created_at   timestamptz not null default now()
);
create index if not exists brain_dumps_unit_idx on public.brain_dumps (user_id, unit_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- Row-level security: every row belongs to exactly one user,
-- and only that user can read or change it.
-- ─────────────────────────────────────────────────────────────

alter table public.subjects    enable row level security;
alter table public.units       enable row level security;
alter table public.cards       enable row level security;
alter table public.review_logs enable row level security;
alter table public.settings    enable row level security;
alter table public.brain_dumps enable row level security;

drop policy if exists "own rows" on public.subjects;
create policy "own rows" on public.subjects for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own rows" on public.units;
create policy "own rows" on public.units for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own rows" on public.cards;
create policy "own rows" on public.cards for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own rows" on public.review_logs;
create policy "own rows" on public.review_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own rows" on public.settings;
create policy "own rows" on public.settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own rows" on public.brain_dumps;
create policy "own rows" on public.brain_dumps for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.subjects, public.units, public.cards, public.review_logs, public.settings, public.brain_dumps from anon;
grant select, insert, update, delete
  on public.subjects, public.units, public.cards, public.review_logs, public.settings, public.brain_dumps
  to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Functions (run with the caller's rights, so the rules above apply)
-- ─────────────────────────────────────────────────────────────

-- Old versions with other parameter/return types.
drop function if exists public.record_review(uuid, jsonb, jsonb, int);
drop function if exists public.unit_counts(timestamptz);

-- Writes a ts-fsrs Card (as JSON) onto a card row. Returns the card's subject.
create or replace function public.set_card_schedule(p_card_id uuid, p_card jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subject uuid;
begin
  update public.cards set
    state          = (p_card->>'state')::smallint,
    due            = (p_card->>'due')::timestamptz,
    stability      = (p_card->>'stability')::double precision,
    difficulty     = (p_card->>'difficulty')::double precision,
    elapsed_days   = round((p_card->>'elapsed_days')::numeric)::int,
    scheduled_days = round((p_card->>'scheduled_days')::numeric)::int,
    learning_steps = coalesce((p_card->>'learning_steps')::int, 0),
    reps           = (p_card->>'reps')::int,
    lapses         = (p_card->>'lapses')::int,
    last_review    = (p_card->>'last_review')::timestamptz
  where id = p_card_id
  returning subject_id into v_subject;

  if not found then
    raise exception 'Card % not found', p_card_id;
  end if;
  return v_subject;
end;
$$;

-- Saves one rating: new schedule on the card + a review log row. Returns the log id (for undo).
create or replace function public.record_review(
  p_card_id uuid, p_card jsonb, p_log jsonb, p_duration_ms int default null, p_think_ms int default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subject uuid;
  v_log_id  uuid;
begin
  v_subject := public.set_card_schedule(p_card_id, p_card);

  insert into public.review_logs (
    card_id, subject_id, rating, state, due, stability, difficulty,
    elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review, duration_ms, think_ms
  ) values (
    p_card_id, v_subject,
    (p_log->>'rating')::smallint,
    (p_log->>'state')::smallint,
    (p_log->>'due')::timestamptz,
    (p_log->>'stability')::double precision,
    (p_log->>'difficulty')::double precision,
    round((p_log->>'elapsed_days')::numeric)::int,
    round((p_log->>'last_elapsed_days')::numeric)::int,
    round((p_log->>'scheduled_days')::numeric)::int,
    coalesce((p_log->>'learning_steps')::int, 0),
    (p_log->>'review')::timestamptz,
    p_duration_ms,
    p_think_ms
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- Undo: put the card back to its previous schedule and forget the rating.
create or replace function public.undo_review(p_log_id uuid, p_card_id uuid, p_card jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.set_card_schedule(p_card_id, p_card);
  delete from public.review_logs where id = p_log_id;
end;
$$;

-- "Trouble" cards: forgotten at least twice, or marked hard (high FSRS difficulty, e.g. from slow answers).
create or replace function public.is_trouble(c public.cards)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select c.state <> 0 and (c.lapses >= 2 or c.difficulty >= 7.5);
$$;

-- Counts per unit for the overview.
create or replace function public.unit_counts(p_day_end timestamptz)
returns table (
  unit_id        uuid,
  total          int,
  new_count      int,
  learning_count int,
  due_count      int,
  seen_count     int,
  trouble_count  int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.unit_id,
         count(*)::int,
         count(*) filter (where c.state = 0)::int,
         count(*) filter (where c.state in (1, 3))::int,
         count(*) filter (where c.state = 2 and c.due < p_day_end)::int,
         count(*) filter (where c.state <> 0)::int,
         count(*) filter (where public.is_trouble(c))::int
  from public.cards c
  where not c.suspended
  group by c.unit_id;
$$;

-- Counts per subject and tag (exam, case-study-1, …).
create or replace function public.tag_counts(p_day_end timestamptz)
returns table (
  subject_id     uuid,
  tag            text,
  total          int,
  new_count      int,
  learning_count int,
  due_count      int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.subject_id, t.tag,
         count(*)::int,
         count(*) filter (where c.state = 0)::int,
         count(*) filter (where c.state in (1, 3))::int,
         count(*) filter (where c.state = 2 and c.due < p_day_end)::int
  from public.cards c
  cross join lateral unnest(c.tags) as t(tag)
  where not c.suspended
  group by c.subject_id, t.tag;
$$;

-- What was already studied today, per subject (for the daily limits).
create or replace function public.today_counts(p_day_start timestamptz)
returns table (
  subject_id  uuid,
  new_done    int,
  review_done int,
  total_done  int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.subject_id,
         count(*) filter (where l.state = 0)::int,
         count(*) filter (where l.state = 2)::int,
         count(*)::int
  from public.review_logs l
  where l.review >= p_day_start
  group by l.subject_id;
$$;

-- Days with at least one review (for the streak), in your time zone, with the day starting at p_day_start_hour.
create or replace function public.review_days(p_time_zone text, p_day_start_hour int)
returns table (day date)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct ((l.review at time zone p_time_zone) - make_interval(hours => p_day_start_hour))::date as day
  from public.review_logs l
  where l.review > now() - interval '400 days'
  order by day desc;
$$;

-- Brain dump: put missed cards into today's review (new ones jump to the front of the new-card queue).
create or replace function public.prioritize_cards(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.cards set due = least(due, now()) where id = any(p_ids) and state <> 0;
  update public.cards set position = least(position, 0) - 1000000 where id = any(p_ids) and state = 0;
$$;

revoke execute on function public.set_card_schedule(uuid, jsonb)                 from public, anon;
revoke execute on function public.record_review(uuid, jsonb, jsonb, int, int)    from public, anon;
revoke execute on function public.undo_review(uuid, uuid, jsonb)                 from public, anon;
revoke execute on function public.unit_counts(timestamptz)                       from public, anon;
revoke execute on function public.tag_counts(timestamptz)                        from public, anon;
revoke execute on function public.today_counts(timestamptz)                      from public, anon;
revoke execute on function public.review_days(text, int)                         from public, anon;
revoke execute on function public.prioritize_cards(uuid[])                       from public, anon;
grant  execute on function public.set_card_schedule(uuid, jsonb)                 to authenticated;
grant  execute on function public.record_review(uuid, jsonb, jsonb, int, int)    to authenticated;
grant  execute on function public.undo_review(uuid, uuid, jsonb)                 to authenticated;
grant  execute on function public.unit_counts(timestamptz)                       to authenticated;
grant  execute on function public.tag_counts(timestamptz)                        to authenticated;
grant  execute on function public.today_counts(timestamptz)                      to authenticated;
grant  execute on function public.review_days(text, int)                         to authenticated;
grant  execute on function public.prioritize_cards(uuid[])                       to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Image storage: private bucket, one folder per user (named after the user id)
-- ─────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-images', 'card-images', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists "recall: read own images"   on storage.objects;
drop policy if exists "recall: add own images"    on storage.objects;
drop policy if exists "recall: change own images" on storage.objects;
drop policy if exists "recall: delete own images" on storage.objects;

create policy "recall: read own images" on storage.objects for select to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "recall: add own images" on storage.objects for insert to authenticated
  with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "recall: change own images" on storage.objects for update to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "recall: delete own images" on storage.objects for delete to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ─────────────────────────────────────────────────────────────
-- Live updates: tell open devices when cards change
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.cards;
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;
