-- Units can be put in a named group (e.g. "Midterm 1"): shown as one folded block under the subject,
-- and left out of "study the whole subject" and of the daily totals.
alter table public.units add column if not exists group_name text;
