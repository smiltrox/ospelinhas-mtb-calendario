-- Aplicar una vez desde Supabase > SQL Editor.
alter table public.profiles add column if not exists avatar_path text;
alter table public.user_roles add column if not exists is_banned boolean not null default false;
alter table public.races add column if not exists race_type text not null default 'MTB';
do $$ begin
  if not exists(select 1 from pg_constraint where conname='races_race_type_check') then
    alter table public.races add constraint races_race_type_check check (race_type in ('MTB','Carretera'));
  end if;
end $$;
-- Al borrar una cuenta se conservan las carreras de club, pero se anonimizan.
alter table public.races alter column created_by drop not null;
alter table public.races drop constraint if exists races_created_by_fkey;
alter table public.races add constraint races_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
create or replace function public.is_club_member_active() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where id=auth.uid() and is_banned=false);
$$;
create or replace function public.is_club_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where id=auth.uid() and is_admin=true and is_banned=false);
$$;
drop policy if exists "Members see names" on public.profiles;
create policy "Members see names" on public.profiles for select to authenticated using (public.is_club_member_active());
drop policy if exists "Member edits own name" on public.profiles;
create policy "Member edits own name" on public.profiles for update to authenticated using (id=auth.uid() and public.is_club_member_active()) with check (id=auth.uid() and public.is_club_member_active());
drop policy if exists "Read own role" on public.user_roles;
create policy "Read own role" on public.user_roles for select to authenticated using (id=auth.uid() and public.is_club_member_active());
drop policy if exists "See published and own races" on public.races;
create policy "See published and own races" on public.races for select to authenticated using (public.is_club_member_active() and (status='approved' or created_by=auth.uid() or public.is_club_admin()));
drop policy if exists "Members propose races" on public.races;
create policy "Members propose races" on public.races for insert to authenticated with check (public.is_club_member_active() and created_by=auth.uid() and status='pending' and reviewed_at is null and reviewed_by is null);
drop policy if exists "Admin reviews races" on public.races;
create policy "Admin reviews races" on public.races for update to authenticated using (public.is_club_admin()) with check (public.is_club_admin());
drop policy if exists "See attendance on published races" on public.attendance;
create policy "See attendance on published races" on public.attendance for select to authenticated using (public.is_club_member_active() and exists(select 1 from public.races r where r.id=race_id and r.status='approved'));
drop policy if exists "Manage own attendance" on public.attendance;
create policy "Manage own attendance" on public.attendance for all to authenticated using (public.is_club_member_active() and user_id=auth.uid()) with check (public.is_club_member_active() and user_id=auth.uid() and exists(select 1 from public.races r where r.id=race_id and r.status='approved'));
drop policy if exists "Admin edits attendance" on public.attendance;
create policy "Admin edits attendance" on public.attendance for all to authenticated using (public.is_club_admin()) with check (public.is_club_admin() and exists(select 1 from public.races r where r.id=race_id and r.status='approved'));
drop policy if exists "Private availability" on public.unavailability;
create policy "Private availability" on public.unavailability for all to authenticated using (public.is_club_member_active() and user_id=auth.uid()) with check (public.is_club_member_active() and user_id=auth.uid());
grant execute on function public.is_club_member_active() to authenticated;
grant execute on function public.is_club_admin() to authenticated;
grant update on public.profiles to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-photos','profile-photos',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Members read profile photos" on storage.objects;
create policy "Members read profile photos" on storage.objects for select to authenticated using (bucket_id='profile-photos' and public.is_club_member_active());
drop policy if exists "Upload own profile photos" on storage.objects;
create policy "Upload own profile photos" on storage.objects for insert to authenticated with check (bucket_id='profile-photos' and public.is_club_member_active() and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Update own profile photos" on storage.objects;
create policy "Update own profile photos" on storage.objects for update to authenticated using (bucket_id='profile-photos' and public.is_club_member_active() and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='profile-photos' and public.is_club_member_active() and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Delete own profile photos" on storage.objects;
create policy "Delete own profile photos" on storage.objects for delete to authenticated using (bucket_id='profile-photos' and public.is_club_member_active() and (storage.foldername(name))[1]=auth.uid()::text);
-- Las reglas del bucket de carteles también impiden el acceso de socios bloqueados.
drop policy if exists "Upload own race posters" on storage.objects;
create policy "Upload own race posters" on storage.objects for insert to authenticated with check (bucket_id='race-posters' and public.is_club_member_active() and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Read published race posters" on storage.objects;
create policy "Read published race posters" on storage.objects for select to authenticated using (bucket_id='race-posters' and public.is_club_member_active() and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.races where poster_path=name and (status='approved' or created_by=auth.uid() or public.is_club_admin()))));
drop policy if exists "Delete own race posters" on storage.objects;
create policy "Delete own race posters" on storage.objects for delete to authenticated using (bucket_id='race-posters' and public.is_club_member_active() and (storage.foldername(name))[1]=auth.uid()::text);
