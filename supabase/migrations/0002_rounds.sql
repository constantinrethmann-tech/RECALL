-- "New round" per unit: all its cards become due again, and the unit remembers how many rounds were started.
-- Progress shows as 100 % × rounds + the share of cards reviewed since the round started (e.g. 120 %).
alter table public.units add column if not exists rounds int not null default 0;
alter table public.units add column if not exists round_started_at timestamptz;
