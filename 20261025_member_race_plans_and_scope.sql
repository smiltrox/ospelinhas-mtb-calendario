-- Ámbito informativo y planificación privada de carreras por socio.
alter table public.races add column if not exists race_scope text;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='races_race_scope_check') then
    alter table public.races add constraint races_race_scope_check
      check (race_scope is null or race_scope in ('extremadura','national','portugal'));
  end if;
end $$;

create table if not exists public.race_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  race_id uuid not null references public.races(id) on delete cascade,
  status text not null check (status in ('interested','not_attending')),
  updated_at timestamptz not null default now(),
  primary key (user_id,race_id)
);
revoke all on public.race_preferences from public,anon;
grant select,insert,update,delete on public.race_preferences to authenticated;
alter table public.race_preferences enable row level security;
drop policy if exists "Manage own private race preferences" on public.race_preferences;
create policy "Manage own private race preferences" on public.race_preferences
  for all to authenticated
  using (public.is_club_member_active() and user_id=auth.uid())
  with check (public.is_club_member_active() and user_id=auth.uid());

create or replace function public.set_my_race_plan(_race_id uuid,_status text)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if auth.uid() is null or not public.is_club_member_active() then
    raise exception 'Se requiere una cuenta activa del club.';
  end if;
  if _status is null or _status not in ('attending','interested','not_attending','none') then
    raise exception 'Estado de planificación no válido.';
  end if;
  if not exists(select 1 from public.races where id=_race_id and status='approved') then
    raise exception 'La carrera no está publicada.';
  end if;

  if _status='attending' then
    delete from public.race_preferences where race_id=_race_id and user_id=auth.uid();
    insert into public.attendance(race_id,user_id) values(_race_id,auth.uid())
      on conflict (race_id,user_id) do nothing;
  elsif _status in ('interested','not_attending') then
    delete from public.attendance where race_id=_race_id and user_id=auth.uid();
    insert into public.race_preferences(user_id,race_id,status,updated_at)
      values(auth.uid(),_race_id,_status,now())
      on conflict (user_id,race_id) do update set status=excluded.status,updated_at=now();
  else
    delete from public.attendance where race_id=_race_id and user_id=auth.uid();
    delete from public.race_preferences where race_id=_race_id and user_id=auth.uid();
  end if;
end; $$;
revoke all on function public.set_my_race_plan(uuid,text) from public,anon;
grant execute on function public.set_my_race_plan(uuid,text) to authenticated;
