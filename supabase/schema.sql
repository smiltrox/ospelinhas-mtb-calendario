-- Ejecutar una vez en Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Socio del club',
  created_at timestamptz not null default now()
);
create table if not exists public.user_roles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false
);
create table if not exists public.races (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) between 3 and 140),
  race_date date not null,
  distance_km numeric(7,2) not null check (distance_km > 0),
  elevation_m integer not null check (elevation_m >= 0),
  registration_url text,
  poster_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
alter table public.races add column if not exists registration_url text;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='races_registration_url_https_check') then
    alter table public.races add constraint races_registration_url_https_check check (registration_url is null or registration_url ~ '^https?://');
  end if;
end $$;
create index if not exists races_date_status_idx on public.races(race_date,status);
create table if not exists public.attendance (
  race_id uuid not null references public.races(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (race_id,user_id)
);
create table if not exists public.unavailability (
  user_id uuid not null references auth.users(id) on delete cascade,
  unavailable_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id,unavailable_date)
);
create table if not exists public.review_tokens (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  action text not null check (action in ('approve','reject')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(new.email,'@',1)));
  insert into public.user_roles(id,is_admin) values(new.id,lower(new.email)='lopezsanchez.antonio@gmail.com');
  return new;
end; $$;
drop trigger if exists on_auth_user_created_pelinhas on auth.users;
create trigger on_auth_user_created_pelinhas after insert on auth.users for each row execute procedure public.handle_new_user();
insert into public.user_roles(id,is_admin)
select id, lower(email)='lopezsanchez.antonio@gmail.com' from auth.users
on conflict (id) do update set is_admin=excluded.is_admin;

create or replace function public.is_club_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where id=auth.uid() and is_admin=true);
$$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.races enable row level security;
alter table public.attendance enable row level security;
alter table public.unavailability enable row level security;
alter table public.review_tokens enable row level security;

drop policy if exists "Members see names" on public.profiles;
create policy "Members see names" on public.profiles for select to authenticated using (true);
drop policy if exists "Member edits own name" on public.profiles;
create policy "Member edits own name" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
drop policy if exists "Read own role" on public.user_roles;
create policy "Read own role" on public.user_roles for select to authenticated using (id=auth.uid());

drop policy if exists "See published and own races" on public.races;
create policy "See published and own races" on public.races for select to authenticated using (status='approved' or created_by=auth.uid() or public.is_club_admin());
drop policy if exists "Members propose races" on public.races;
create policy "Members propose races" on public.races for insert to authenticated with check (created_by=auth.uid() and status='pending' and reviewed_at is null and reviewed_by is null);
drop policy if exists "Admin reviews races" on public.races;
create policy "Admin reviews races" on public.races for update to authenticated using (public.is_club_admin()) with check (public.is_club_admin());

drop policy if exists "See attendance on published races" on public.attendance;
create policy "See attendance on published races" on public.attendance for select to authenticated using (exists(select 1 from public.races r where r.id=race_id and r.status='approved'));
drop policy if exists "Manage own attendance" on public.attendance;
create policy "Manage own attendance" on public.attendance for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid() and exists(select 1 from public.races r where r.id=race_id and r.status='approved'));
drop policy if exists "Admin edits attendance" on public.attendance;
create policy "Admin edits attendance" on public.attendance for all to authenticated using (public.is_club_admin()) with check (public.is_club_admin() and exists(select 1 from public.races r where r.id=race_id and r.status='approved'));

drop policy if exists "Private availability" on public.unavailability;
create policy "Private availability" on public.unavailability for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('race-posters','race-posters',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "Upload own race posters" on storage.objects;
create policy "Upload own race posters" on storage.objects for insert to authenticated with check (bucket_id='race-posters' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Read published race posters" on storage.objects;
create policy "Read published race posters" on storage.objects for select to authenticated using (bucket_id='race-posters' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.races where poster_path=name and (status='approved' or created_by=auth.uid() or public.is_club_admin()))));
drop policy if exists "Delete own race posters" on storage.objects;
create policy "Delete own race posters" on storage.objects for delete to authenticated using (bucket_id='race-posters' and (storage.foldername(name))[1]=auth.uid()::text);

grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update on public.races to authenticated;
grant select, insert, delete on public.attendance to authenticated;
grant select, insert, delete on public.unavailability to authenticated;
