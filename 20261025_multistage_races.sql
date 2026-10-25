alter table public.races
  add column if not exists stage_dates date[] not null default '{}'::date[];
