alter table public.races
  add column if not exists locality text,
  add column if not exists distance_from_olivenza_km numeric(7,1),
  add column if not exists travel_time_from_olivenza text,
  add column if not exists travel_time_from_olivenza_minutes integer;
