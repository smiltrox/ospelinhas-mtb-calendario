import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.PELINHAS_CONFIG || {};
const ready = !!cfg.SUPABASE_URL && !!cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes('TU-PROYECTO') && !cfg.SUPABASE_ANON_KEY.includes('PEGA_AQUI');
const sb = ready ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
const $ = (s) => document.querySelector(s);
const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
let user = null, profile = null, isAdmin = false, season = new Date().getFullYear(), races = [], attendance = [], availability = [], profileMap = {}, profilePhotos = {}, posterUrls = {}, signupMode = false, resetRequestMode = false, recoveryMode = location.hash.includes('type=recovery'), calendarView = 'year', periodIndex = 0, selectedDate = '', editingRaceId = null;
const seasons = Array.from({length: 10}, (_, i) => 2026 + i);

function toast(msg) { const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
function escapeHtml(s='') { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function dateObj(d) { return new Date(`${d}T12:00:00`); }
function dateKey(y,m,d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function setError(message='') { $('#authError').textContent=message; }
function authErrorMessage(error){
  const message=error?.message||'No se pudo completar la operación.';
  if(/^load failed$/i.test(message)||/failed to fetch/i.test(message))return 'No se pudo conectar con Supabase. Comprueba la conexión y que la URL y clave pública de Supabase estén configuradas. Para recuperar contraseña, la URL de GitHub Pages también debe estar permitida en Supabase > Authentication > URL Configuration.';
  return message;
}

function showAuthMode(){
  const password=$('#authForm').elements.password;
  $('#nameField').hidden=!signupMode;
  $('#passwordField').hidden=resetRequestMode;
  $('#forgotPassword').hidden=signupMode||resetRequestMode||recoveryMode;
  $('#authSwitch').hidden=recoveryMode;
  $('#passwordLabel').textContent=recoveryMode?'Nueva contraseña':'Contraseña';
  password.required=!resetRequestMode;
  password.autocomplete=recoveryMode?'new-password':'current-password';
  $('#authTitle').textContent=recoveryMode?'Crea una contraseña nueva':resetRequestMode?'Restablecer contraseña':signupMode?'Únete al equipo':'Bienvenido al club';
  $('#authIntro').textContent=recoveryMode?'Elige una contraseña nueva para tu cuenta.':resetRequestMode?'Te enviaremos un enlace para crear una contraseña nueva.':signupMode?'Crea tu cuenta para compartir el calendario.':'Entra en tu calendario de temporada.';
  $('#authSubmit').textContent=recoveryMode?'Guardar contraseña →':resetRequestMode?'Enviar enlace →':signupMode?'Crear cuenta →':'Entrar →';
  $('#authSwitchText').textContent=resetRequestMode?'¿Recuerdas tu contraseña?':signupMode?'¿Ya tienes cuenta?':'¿Aún no tienes cuenta?';
  $('#authSwitch').textContent=resetRequestMode?'Inicia sesión':signupMode?'Inicia sesión':'Regístrate';
}
$('#authSwitch').onclick=()=>{if(resetRequestMode){resetRequestMode=false;signupMode=false;}else signupMode=!signupMode;recoveryMode=false;showAuthMode();setError();};
$('#forgotPassword').onclick=()=>{signupMode=false;resetRequestMode=true;showAuthMode();setError();};
if(recoveryMode)showAuthMode();
if(!ready){$('#setupNote').hidden=false;$('#authSubmit').disabled=true;$('#authSwitch').disabled=true;$('#authSubmit').textContent='Configura Supabase para continuar';}

$('#authForm').onsubmit=async e=>{
  e.preventDefault(); if(!sb)return;
  const f=new FormData(e.currentTarget), email=String(f.get('email')).trim().toLowerCase(), password=String(f.get('password'));
  $('#authSubmit').disabled=true;setError('');
  try {
    if(resetRequestMode){
      const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}${location.pathname}`});
      if(error)throw error;
      setError('Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña. Revisa también Spam.');
    } else if(recoveryMode){
      const {data,error}=await sb.auth.updateUser({password});if(error)throw error;
      recoveryMode=false;history.replaceState(null,'',location.pathname+location.search);setError('Contraseña actualizada.');
      if(data.user)await start(data.user);
    } else if(signupMode){
      const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:String(f.get('display_name')).trim()},emailRedirectTo:location.href.split('#')[0]}});
      if(error)throw error;
      if(data.session) await start(data.session.user);
      else setError('Cuenta creada. Revisa tu correo para confirmar y luego inicia sesión.');
    } else {
      const {data,error}=await sb.auth.signInWithPassword({email,password}); if(error)throw error; await start(data.user);
    }
  }catch(err){setError(authErrorMessage(err));}
  finally{$('#authSubmit').disabled=false;}
};

async function start(authUser){
  user=authUser;
  const [{data:p,error:pe},{data:r,error:re}]=await Promise.all([sb.from('profiles').select('id,display_name,avatar_path').eq('id',user.id).single(),sb.from('user_roles').select('is_admin').eq('id',user.id).maybeSingle()]);
  if(pe)throw pe; if(re)throw re; profile=p; isAdmin=!!r?.is_admin;
  $('#authGate').style.display='none'; $('.shell').classList.add('ready');
  document.querySelectorAll('.asidefoot b').forEach(x=>x.textContent=profile.display_name);
  document.querySelectorAll('.asidefoot .avatar,.userpill .avatar').forEach(x=>{x.textContent=(profile.display_name||'S').trim().slice(0,1).toUpperCase();if(profile.avatar_path)sb.storage.from('profile-photos').createSignedUrl(profile.avatar_path,86400).then(({data})=>{if(data?.signedUrl){x.textContent='';x.style.backgroundImage=`url("${data.signedUrl}")`;x.classList.add('has-photo');}})});
  $('.userpill').lastChild.textContent=profile.display_name.split(' ')[0];
  $('#adminNav').hidden=!isAdmin;
  const select=$('#season'), viewSelect=$('#seasonView'); [select,viewSelect].filter(Boolean).forEach(s=>{s.innerHTML='';seasons.forEach(y=>s.insertAdjacentHTML('beforeend',`<option value="${y}">${y}</option>`));}); if(season<2026||season>2035)season=2026;[select,viewSelect].filter(Boolean).forEach(s=>s.value=season);
  $('#profileName').textContent=profile.display_name;$('#profileEmail').textContent=user.email||'';
  $('#profileNameInput').value=profile.display_name;
  await loadAll();
}

async function loadAll(){
  const startDate=`${season}-01-01`, endDate=`${season}-12-31`;
  const [raceResult,busyResult,namesResult]=await Promise.all([
    sb.from('races').select('*').gte('race_date',startDate).lte('race_date',endDate).order('race_date'),
    sb.from('unavailability').select('unavailable_date').eq('user_id',user.id),
    sb.from('profiles').select('id,display_name')
  ]);
  if(raceResult.error)throw raceResult.error;if(busyResult.error)throw busyResult.error;
  races=raceResult.data||[];availability=(busyResult.data||[]).map(x=>x.unavailable_date);profileMap=Object.fromEntries((namesResult.data||[]).map(x=>[x.id,x.display_name]));
  const ids=races.filter(r=>r.status==='approved').map(r=>r.id);
  if(ids.length){const ar=await sb.from('attendance').select('race_id,user_id').in('race_id',ids);if(ar.error)throw ar.error;attendance=ar.data||[];}else attendance=[];
  buildCalendar();await renderRaces();renderAvailability();renderRanking();$('#raceCount').textContent=races.filter(r=>r.status==='approved').length;
  const participants=new Set(attendance.map(a=>a.user_id)).size;$('#attCount').textContent=participants;
  const next=races.filter(r=>r.status==='approved'&&r.race_date>=new Date().toISOString().slice(0,10)).sort((a,b)=>a.race_date.localeCompare(b.race_date))[0];
  $('.stat:nth-child(2) strong').innerHTML=next?`${Math.max(0,Math.ceil((dateObj(next.race_date)-new Date(new Date().toDateString()))/86400000))} <small style="font:600 11px 'DM Sans'">días</small>`:'—';
  if(isAdmin) await renderAdmin();
}

function visibleMonths(){if(calendarView==='month')return [periodIndex];if(calendarView==='quarter')return [periodIndex*3,periodIndex*3+1,periodIndex*3+2];if(calendarView==='half')return Array.from({length:6},(_,i)=>periodIndex*6+i);return Array.from({length:12},(_,i)=>i);}
function setCalendarView(view){calendarView=view;periodIndex=0;document.querySelectorAll('[data-calendar-view]').forEach(b=>b.classList.toggle('active',b.dataset.calendarView===view));buildCalendar();}
function shiftPeriod(step){if(calendarView==='month')periodIndex=(periodIndex+step+12)%12;else if(calendarView==='quarter')periodIndex=(periodIndex+step+4)%4;else if(calendarView==='half')periodIndex=(periodIndex+step+2)%2;else {season=Math.min(2035,Math.max(2026,season+step));$('#season').value=season;if($('#seasonView'))$('#seasonView').value=season;loadAll();return;}buildCalendar();}
function buildCalendar(){
  const grid=$('#monthgrid');if(!grid)return;grid.innerHTML='';const shown=visibleMonths();
  for(const m of shown){const offset=(new Date(season,m,1).getDay()+6)%7,count=new Date(season,m+1,0).getDate();let h=`<div class="month ${season===new Date().getFullYear()&&m===new Date().getMonth()?'current':''}"><div class="monthname">${months[m]}</div><div class="week">${['l','m','x','j','v','s','d'].map(x=>`<span>${x}</span>`).join('')}</div><div class="days">`;for(let i=0;i<offset;i++)h+='<span class="day blank"></span>';for(let d=1;d<=count;d++){const key=dateKey(season,m,d),dayRaces=races.filter(r=>r.race_date===key&&r.status==='approved'),busy=availability.includes(key),today=key===new Date().toISOString().slice(0,10),race=dayRaces[0],poster=race&&posterUrls[race.id],types=new Set(dayRaces.map(r=>r.race_type||'MTB')),discipline=types.size>1?'mixed':types.has('Carretera')?'road':dayRaces.length?'mtb':'';h+=`<button type="button" class="day ${dayRaces.length?'race':''} ${discipline} ${busy?'busy':''} ${today?'today':''}" data-date="${key}" aria-label="${dateObj(key).toLocaleDateString('es-ES')}${dayRaces.length?`: ${escapeHtml(dayRaces.map(r=>r.name).join(', '))}`:''}${busy?' · no disponible':''}" title="${dayRaces.length?escapeHtml(dayRaces.map(r=>r.name).join(', ')):busy?'No disponible':''}">${poster?`<img class="day-poster" src="${poster}" alt="">`:''}<span>${d}</span>${dayRaces.length?`<i class="day-type-dot ${discipline}" aria-hidden="true"></i>`:''}</button>`}h+='</div></div>';grid.insertAdjacentHTML('beforeend',h);}
  const label=calendarView==='year'?`Año ${season}`:calendarView==='month'?`${months[periodIndex]} ${season}`:calendarView==='quarter'?`Trimestre ${periodIndex+1} · ${season}`:`Semestre ${periodIndex+1} · ${season}`;$('#calendarLabel').textContent=label;document.querySelectorAll('[data-date]').forEach(el=>el.onclick=()=>openDay(el.dataset.date));
}
function openDay(key){selectedDate=key;const date=dateObj(key),dateLabel=date.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});const dayRaces=races.filter(r=>r.race_date===key&&(r.status==='approved'||r.created_by===user.id));$('#dayTitle').textContent=dayRaces.length===1?dayRaces[0].name:dateLabel;$('#daySubtitle').textContent=dayRaces.length===1?`${dateLabel} · ${attendance.filter(a=>a.race_id===dayRaces[0].id).length} socios apuntados`:'Pruebas y disponibilidad de esta fecha';$('#dayRaces').innerHTML=dayRaces.map(r=>{const road=(r.race_type||'MTB')==='Carretera',kind=road?'road':'mtb',attendees=attendance.filter(a=>a.race_id===r.id),mine=attendees.some(a=>a.user_id===user.id);return `<article class="race-detail ${kind}">${posterUrls[r.id]?`<div class="race-hero"><img src="${posterUrls[r.id]}" alt="Cartel de ${escapeHtml(r.name)}"><span class="discipline-chip ${kind}">${road?'CARRETERA':'MTB'}</span></div>`:`<div class="race-hero race-hero-empty ${kind}"><span class="discipline-chip ${kind}">${road?'CARRETERA':'MTB'}</span><span class="hero-mark">${road?'⌁':'▲'}</span></div>`}<div class="race-detail-body"><div class="race-detail-date">${dateLabel}${r.status!=='approved'?` · <span class="pending-label">Pendiente de validar</span>`:''}</div><h4>${escapeHtml(r.name)}</h4><div class="race-stats"><div><b>${escapeHtml(String(r.distance_km))}</b><small>KM</small></div><div><b>+${Number(r.elevation_m).toLocaleString('es-ES')}</b><small>DESNIVEL · M</small></div><div><b>${attendees.length}</b><small>SOCIOS</small></div></div><section class="attendees"><div class="attendees-head"><b>En la salida</b><span>${attendees.length?`${attendees.length} ${attendees.length===1?'socio':'socios'}`:'Sé el primero'}</span></div>${attendees.length?`<div class="attendee-list">${attendees.map(a=>{const name=profileMap[a.user_id]||'Socio';return `<span class="attendee-chip"><i>${escapeHtml(name.trim().slice(0,1).toUpperCase())}</i>${escapeHtml(name)}</span>`}).join('')}</div>`:'<p class="attendees-empty">Aún no hay socios apuntados. ¡Abre la lista!</p>'}</section><div class="race-detail-actions">${r.status==='approved'?`<button type="button" class="join-button ${mine?'joined':''}" data-attend="${r.id}">${mine?'✓ Ya estás apuntado':'¡Me apunto!'}</button>`:''}${r.registration_url?`<button type="button" class="registration-button" data-register="${r.id}">Ir a la inscripción <span>↗</span></button>`:''}<button type="button" class="race-share" data-share="${r.id}">Compartir por WhatsApp</button></div></div></article>`}).join('')||'<p class="hint">Todavía no hay carreras para esta fecha.</p>';
  $('#dayBusyBtn').textContent=availability.includes(key)?'Quitar día no disponible':'Marcar día no disponible';$('#dayModal').classList.add('open');$('#dayRaces').querySelectorAll('[data-register]').forEach(b=>b.onclick=()=>openRegistration(races.find(r=>r.id===b.dataset.register)));$('#dayRaces').querySelectorAll('[data-attend]').forEach(b=>b.onclick=()=>toggleAttendance(b.dataset.attend));$('#dayRaces').querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>shareRegistration(b.dataset.share));
}

async function renderRaces(){
  const list=races.filter(r=>r.status==='approved'||r.created_by===user.id).sort((a,b)=>a.race_date.localeCompare(b.race_date));
  posterUrls={};await Promise.all(list.filter(r=>r.poster_path).map(async r=>{const {data}=await sb.storage.from('race-posters').createSignedUrl(r.poster_path,1800);if(data?.signedUrl)posterUrls[r.id]=data.signedUrl;}));
  buildCalendar();
  $('#raceTotalLabel').textContent=`${list.filter(r=>r.status==='approved').length} pruebas publicadas en ${season}`;
  $('#eventlist').innerHTML=list.map(r=>{const d=dateObj(r.race_date),mine=attendance.some(a=>a.race_id===r.id&&a.user_id===user.id),count=attendance.filter(a=>a.race_id===r.id).length;return `<div class="event">${posterUrls[r.id]?`<img class="poster-thumb" src="${posterUrls[r.id]}" alt="Cartel de ${escapeHtml(r.name)}">`:''}<div class="datebox"><b>${String(d.getDate()).padStart(2,'0')}</b><small>${months[d.getMonth()].slice(0,3)}</small></div><div class="eventinfo"><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.race_type||'MTB')} · ${r.distance_km} km · +${Number(r.elevation_m).toLocaleString('es-ES')} m · ${count} apuntados</small>${r.registration_url?`<button type="button" class="reg-link" data-register="${r.id}">Inscribirme ↗</button> <button class="share-link" type="button" data-share="${r.id}">WhatsApp ↗</button>`:''}${r.status==='pending'?'<span class="statusbadge">Pendiente de validar</span>':''}${r.status==='rejected'?'<span class="statusbadge" style="background:#fbe4e3;color:#a3423d">No publicada</span>':''}</div>${r.status==='approved'?`<button class="attend ${mine?'on':''}" data-attend="${r.id}">${mine?'✓ Apuntado':'＋ Me apunto'}</button>`:''}</div>`}).join('');
  $('#empty').style.display=list.length?'none':'block';
  document.querySelectorAll('[data-register]').forEach(b=>b.onclick=()=>openRegistration(races.find(r=>r.id===b.dataset.register)));
  document.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>shareRegistration(b.dataset.share));
  document.querySelectorAll('[data-attend]').forEach(b=>b.onclick=()=>toggleAttendance(b.dataset.attend));
  const upcoming=list.filter(r=>r.status==='approved').slice(0,4);$('#activity').innerHTML=upcoming.map(r=>`<div class="event"><div class="datebox"><b>${attendance.filter(a=>a.race_id===r.id).length}</b><small>van</small></div><div class="eventinfo"><b>${escapeHtml(r.name)}</b><small>${attendance.filter(a=>a.race_id===r.id).map(a=>escapeHtml(profileMap[a.user_id]||'Socio')).join(', ')||'Sé el primero en apuntarte'}</small></div></div>`).join('');
  renderRaceTable();
}

function renderRaceTable(){const body=$('#raceTableBody');if(!body)return;const q=$('#filterText').value.trim().toLocaleLowerCase('es'),type=$('#filterType').value,from=$('#filterFrom').value,to=$('#filterTo').value,minD=$('#filterDistanceMin').value===''?0:Number($('#filterDistanceMin').value),maxD=$('#filterDistanceMax').value===''?Infinity:Number($('#filterDistanceMax').value),minE=$('#filterElevationMin').value===''?0:Number($('#filterElevationMin').value),maxE=$('#filterElevationMax').value===''?Infinity:Number($('#filterElevationMax').value),link=$('#filterRegistration').value;const rows=races.filter(r=>r.status==='approved'||r.created_by===user.id).filter(r=>{const text=[r.name,r.race_type,r.race_date,r.distance_km,r.elevation_m,r.registration_url||'',r.status].join(' ').toLocaleLowerCase('es');return(!q||text.includes(q))&&(!type||r.race_type===type)&&(!from||r.race_date>=from)&&(!to||r.race_date<=to)&&Number(r.distance_km)>=minD&&Number(r.distance_km)<=maxD&&Number(r.elevation_m)>=minE&&Number(r.elevation_m)<=maxE&&(link==='all'||(link==='yes'?!!r.registration_url:!r.registration_url));}).sort((a,b)=>a.race_date.localeCompare(b.race_date));body.innerHTML=rows.map(r=>`<tr><td>${dateObj(r.race_date).toLocaleDateString('es-ES')}</td><td><div class="table-race">${posterUrls[r.id]?`<img src="${posterUrls[r.id]}" alt="">`:''}<b>${escapeHtml(r.name)}</b></div></td><td>${r.distance_km} km</td><td>${escapeHtml(r.race_type||'MTB')}</td><td>+${Number(r.elevation_m).toLocaleString('es-ES')} m</td><td>${r.registration_url?`<button type="button" class="reg-link" data-register="${r.id}">Inscribirme ↗</button>`:'—'}</td><td>${r.status==='approved'?'Publicada':r.status==='pending'?'Pendiente':'Rechazada'}</td></tr>`).join('')||'<tr><td colspan="7" class="empty-row">No hay carreras que coincidan.</td></tr>';body.querySelectorAll('[data-register]').forEach(b=>b.onclick=()=>openRegistration(races.find(r=>r.id===b.dataset.register)));}

async function toggleAttendance(raceId){
  const active=attendance.some(a=>a.race_id===raceId&&a.user_id===user.id);
  const result=active?await sb.from('attendance').delete().eq('race_id',raceId).eq('user_id',user.id):await sb.from('attendance').insert({race_id:raceId,user_id:user.id});
  if(result.error){toast(result.error.message);return;}toast(active?'Has quitado tu asistencia':'¡Asistencia confirmada!');await loadAll();if($('#dayModal').classList.contains('open'))openDay(selectedDate);
}
function openRegistration(race){
  if(!race.registration_url)return;
  $('#registrationTitle').textContent=`Inscripción · ${race.name}`;
  $('#registrationFrame').src=race.registration_url;
  $('#registrationExternal').href=race.registration_url;
  $('#registrationShare').onclick=()=>shareRegistration(race.id);
  $('#registrationModal').classList.add('open');
}
function shareRegistration(raceId){
  const race=races.find(r=>r.id===raceId);if(!race?.registration_url)return;
  const text=`${race.name} · Inscripción a la prueba: ${race.registration_url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
}
function renderAvailability(){
  $('#busyDates').innerHTML=availability.length?availability.sort().slice(0,3).map(k=>`<span style="display:inline-block;background:#fbe8e7;color:#b24542;padding:5px 8px;border-radius:7px;margin:2px;font-size:9px">${dateObj(k).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}</span>`).join(''):'<span style="font-size:10px;color:#92958a">Ningún día marcado todavía</span>';
  $('#busyPickerList').innerHTML=availability.sort().map(k=>`<button type="button" data-remove="${k}" class="btn" style="margin:3px;font-size:10px">${dateObj(k).toLocaleDateString('es-ES',{day:'numeric',month:'short'})} ×</button>`).join('');
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>changeAvailability(b.dataset.remove));
}
async function changeAvailability(k){
  if(!k)return;const active=availability.includes(k);const result=active?await sb.from('unavailability').delete().eq('user_id',user.id).eq('unavailable_date',k):await sb.from('unavailability').insert({user_id:user.id,unavailable_date:k});
  if(result.error){toast(result.error.message);return;}availability=active?availability.filter(x=>x!==k):[...availability,k];renderAvailability();buildCalendar();toast(active?'Disponibilidad actualizada':'Día marcado como no disponible');
}

async function renderRanking(){
  const eligible=races.filter(r=>r.status==='approved').map(r=>r.id);if(!eligible.length){$('#ranking').innerHTML='<div class="empty" style="display:block">Todavía no hay asistencias registradas esta temporada.</div>';return;}
  const {data,error}=await sb.from('attendance').select('race_id,user_id').in('race_id',eligible);if(error){$('#ranking').innerHTML='<div class="empty" style="display:block">No se pudo cargar el ranking.</div>';return;}
  const counts={};for(const a of data||[])counts[a.user_id]=(counts[a.user_id]||0)+1;
  const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]||(profileMap[a[0]]||'').localeCompare(profileMap[b[0]]||''));
  $('#ranking').innerHTML=rows.length?rows.slice(0,8).map(([id,n],i)=>`<div class="event"><span class="ranknum">${i+1}</span><div class="eventinfo"><b>${escapeHtml(profileMap[id]||'Socio')}</b><small>${n} ${n===1?'asistencia':'asistencias'} · temporada ${season}</small></div></div>`).join(''):'<div class="empty" style="display:block">Todavía no hay asistencias registradas esta temporada.</div>';
}

async function renderAdmin(){
  $('#adminSection').hidden=false;
  const {data,error}=await sb.from('races').select('*').eq('status','pending').order('created_at',{ascending:false});
  if(error){$('#adminRaces').innerHTML=`<div class="empty" style="display:block">${escapeHtml(error.message)}</div>`;return;}
  const pendingPosters={};await Promise.all((data||[]).filter(r=>r.poster_path).map(async r=>{const {data:link}=await sb.storage.from('race-posters').createSignedUrl(r.poster_path,1800);if(link?.signedUrl)pendingPosters[r.id]=link.signedUrl;}));
  const pending=(data||[]).map(r=>`<div class="event">${pendingPosters[r.id]?`<img class="poster-thumb" src="${pendingPosters[r.id]}" alt="Cartel">`:''}<div class="datebox"><b>!</b><small>revisar</small></div><div class="eventinfo"><b>${escapeHtml(r.name)}</b><small>${dateObj(r.race_date).toLocaleDateString('es-ES')} · ${escapeHtml(r.race_type||'MTB')} · ${r.distance_km} km · +${Number(r.elevation_m).toLocaleString('es-ES')} m · ${escapeHtml(profileMap[r.created_by]||'Socio')}</small></div><div class="adminactions"><button class="attend" data-edit-race="${r.id}">Editar</button><button class="attend on" data-review="approved" data-id="${r.id}">Validar</button><button class="attend" data-review="rejected" data-id="${r.id}">Rechazar</button></div></div>`).join('');
  const {data:published}=await sb.from('races').select('id,name,race_date').eq('status','approved').gte('race_date',`${season}-01-01`).lte('race_date',`${season}-12-31`).order('race_date');
  const edit=(published||[]).map(r=>`<div class="event"><div class="datebox"><b>${String(dateObj(r.race_date).getDate()).padStart(2,'0')}</b><small>${months[dateObj(r.race_date).getMonth()].slice(0,3)}</small></div><div class="eventinfo"><b>${escapeHtml(r.name)}</b><small>${attendance.filter(a=>a.race_id===r.id).length} asistencias registradas</small></div><button class="attend" data-edit-race="${r.id}">Editar carrera</button><button class="attend" data-edit-att="${r.id}">Editar asistentes</button></div>`).join('');
  $('#adminRaces').innerHTML=`${pending||'<div class="empty" style="display:block">No hay propuestas pendientes.</div>'}<div class="admin-subsection"><b>Editar carreras publicadas · ${season}</b>${edit||'<div class="empty" style="display:block">No hay carreras publicadas.</div>'}</div>`;
  document.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{b.disabled=true;const {error:err}=await sb.functions.invoke('admin-review',{body:{raceId:b.dataset.id,decision:b.dataset.review}});if(err){toast(err.message);b.disabled=false;return;}toast(b.dataset.review==='approved'?'Carrera publicada':'Propuesta rechazada');await loadAll();});
  document.querySelectorAll('[data-edit-att]').forEach(b=>b.onclick=()=>showAttendanceEditor(b.dataset.editAtt));
  document.querySelectorAll('[data-edit-race]').forEach(b=>b.onclick=()=>openRaceEditor(b.dataset.editRace));
  await renderMembers();
}

function openRaceEditor(id){const r=races.find(x=>x.id===id);if(!r)return;editingRaceId=id;const f=$('#raceForm');f.elements.name.value=r.name;f.elements.date.value=r.race_date;f.elements.distance.value=r.distance_km;f.elements.elevation.value=r.elevation_m;f.elements.race_type.value=r.race_type||'MTB';f.elements.registration_url.value=r.registration_url||'';$('#raceModalTitle').textContent='Editar carrera';$('#raceSubmit').textContent='Guardar cambios';$('#raceHint').hidden=true;$('#raceModal').classList.add('open');}
async function renderMembers(){const host=$('#memberList');if(!host)return;host.innerHTML='<p class="hint">Cargando socios…</p>';const {data,error}=await sb.functions.invoke('admin-members',{body:{action:'list'}});if(error||data?.error){host.innerHTML=`<p class="hint">No se pudo cargar la lista de socios: ${escapeHtml(data?.error||error.message)}</p>`;return;}host.innerHTML=(data.users||[]).map(m=>`<div class="member-row"><div class="avatar">${escapeHtml((m.display_name||'S').slice(0,1).toUpperCase())}</div><div class="member-info"><b>${escapeHtml(m.display_name||'Socio')}</b><small>${escapeHtml(m.email||'')}</small></div><span class="member-state ${m.banned?'banned':''}">${m.banned?'Bloqueado':'Activo'}</span>${m.is_admin?'<span class="statusbadge">Admin</span>':`<button class="attend" data-member-action="${m.banned?'unban':'ban'}" data-id="${m.id}">${m.banned?'Reactivar':'Bloquear'}</button><button class="attend danger" data-member-action="delete" data-id="${m.id}" data-name="${escapeHtml(m.display_name||'Socio')}">Borrar</button>`}</div>`).join('')||'<p class="hint">Todavía no hay socios.</p>';host.querySelectorAll('[data-member-action]').forEach(b=>b.onclick=()=>manageMember(b));}
async function manageMember(button){const action=button.dataset.memberAction,id=button.dataset.id,name=button.dataset.name||'este socio';if(action==='delete'&&!confirm(`Se borrará la cuenta de ${name}, su perfil y sus asistencias. Sus carreras se conservarán sin autor. Esta acción no se puede deshacer. ¿Continuar?`))return;if(action==='ban'&&!confirm(`¿Bloquear el acceso de ${name} a la app?`))return;button.disabled=true;const {data,error}=await sb.functions.invoke('admin-members',{body:{action,userId:id}});if(error||data?.error){toast(data?.error||error.message);button.disabled=false;return;}toast(action==='delete'?'Cuenta borrada.':action==='ban'?'Socio bloqueado.':'Acceso reactivado.');await renderMembers();}

async function showAttendanceEditor(raceId){
  const race=races.find(r=>r.id===raceId);const [{data:members,error:mErr},{data:marked,error:aErr}]=await Promise.all([sb.from('profiles').select('id,display_name').order('display_name'),sb.from('attendance').select('user_id').eq('race_id',raceId)]);
  if(mErr||aErr){toast((mErr||aErr).message);return;}const checked=new Set((marked||[]).map(x=>x.user_id));
  $('#attendanceEditorTitle').textContent=`Asistencia · ${race.name}`;
  $('#attendanceEditorBody').innerHTML=(members||[]).map(m=>`<label><input type="checkbox" value="${m.id}" ${checked.has(m.id)?'checked':''}> ${escapeHtml(m.display_name)}</label>`).join('');
  $('#attendanceEditor').dataset.raceId=raceId;$('#attendanceEditorModal').classList.add('open');
}
$('#saveAttendance').onclick=async()=>{
  const raceId=$('#attendanceEditor').dataset.raceId,ids=[...$('#attendanceEditorBody').querySelectorAll('input:checked')].map(x=>x.value);
  const {error:delErr}=await sb.from('attendance').delete().eq('race_id',raceId);if(delErr){toast(delErr.message);return;}
  if(ids.length){const {error:insErr}=await sb.from('attendance').insert(ids.map(user_id=>({race_id:raceId,user_id})));if(insErr){toast(insErr.message);return;}}
  $('#attendanceEditorModal').classList.remove('open');toast('Asistencias corregidas');await loadAll();
};

$('#season').onchange=async e=>{season=Number(e.target.value);periodIndex=0;if($('#seasonView'))$('#seasonView').value=season;await loadAll();};
$('#seasonView').onchange=async e=>{season=Number(e.target.value);periodIndex=0;$('#season').value=season;await loadAll();};
document.querySelectorAll('[data-calendar-view]').forEach(b=>b.onclick=()=>setCalendarView(b.dataset.calendarView));
$('#periodPrev').onclick=()=>shiftPeriod(-1);$('#periodNext').onclick=()=>shiftPeriod(1);
$('#addBtn').onclick=()=>$('#raceModal').classList.add('open');$('#busyBtn').onclick=()=>$('#busyModal').classList.add('open');$('#editBusy').onclick=()=>$('#busyModal').classList.add('open');
$('#markBusy').onclick=()=>changeAvailability($('#busyInput').value);
$('#dayBusyBtn').onclick=async()=>{await changeAvailability(selectedDate);openDay(selectedDate);};
$('#dayAddRace').onclick=()=>{editingRaceId=null;$('#dayModal').classList.remove('open');$('#raceForm').reset();$('#raceForm').elements.date.value=selectedDate;$('#raceModalTitle').textContent='Proponer una carrera';$('#raceSubmit').textContent='Enviar propuesta →';$('#raceHint').hidden=false;$('#raceModal').classList.add('open');};
$('#profileBtn').onclick=()=>$('#profileModal').classList.add('open');
$('#signOutBtn').onclick=async()=>{await sb.auth.signOut();location.reload();};
$('#profileForm').onsubmit=async e=>{e.preventDefault();const save=$('#saveProfile');save.disabled=true;try{const name=$('#profileNameInput').value.trim();if(!name)throw new Error('Escribe tu nombre.');let avatarPath=profile.avatar_path||null;const file=$('#profilePhoto').files[0];if(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Usa una foto JPG, PNG o WebP de hasta 5 MB.');avatarPath=`${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error:uploadError}=await sb.storage.from('profile-photos').upload(avatarPath,file,{contentType:file.type});if(uploadError)throw uploadError;}const {error}=await sb.from('profiles').update({display_name:name,avatar_path:avatarPath}).eq('id',user.id);if(error)throw error;profile={...profile,display_name:name,avatar_path:avatarPath};$('#profileModal').classList.remove('open');toast('Perfil actualizado.');await start(user);}catch(err){toast(err.message||'No se pudo guardar el perfil.');}finally{save.disabled=false;}};
$('#changePasswordForm').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget),current=String(f.get('current_password')),next=String(f.get('new_password')),confirmPassword=String(f.get('confirm_password')),button=$('#changePasswordBtn');
  if(next.length<8){toast('La nueva contraseña debe tener al menos 8 caracteres.');return;}
  if(next!==confirmPassword){toast('Las nuevas contraseñas no coinciden.');return;}
  button.disabled=true;
  try{const {error:verifyError}=await sb.auth.signInWithPassword({email:user.email,password:current});if(verifyError)throw new Error('La contraseña actual no es correcta.');const {error:updateError}=await sb.auth.updateUser({password:next});if(updateError)throw updateError;e.currentTarget.reset();toast('Contraseña actualizada.');}
  catch(err){toast(authErrorMessage(err));}
  finally{button.disabled=false;}
};
['filterText','filterType','filterFrom','filterTo','filterDistanceMin','filterDistanceMax','filterElevationMin','filterElevationMax','filterRegistration'].forEach(id=>{const el=$(`#${id}`);if(el)el.addEventListener('input',renderRaceTable);});
$('#clearFilters').onclick=()=>{document.querySelectorAll('#raceFilters input').forEach(x=>x.value='');$('#filterType').value='';$('#filterRegistration').value='all';renderRaceTable();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).classList.remove('open'));
document.querySelectorAll('.modalback').forEach(m=>m.onclick=e=>{if(e.target===m)m.classList.remove('open')});
$('#attendanceClose').onclick=()=>$('#attendanceEditorModal').classList.remove('open');
$('#raceForm').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget),year=Number(String(f.get('date')).slice(0,4));if(year<2026||year>2035){toast('La fecha debe estar entre 2026 y 2035.');return;}
  const submit=e.currentTarget.querySelector('[type=submit]');submit.disabled=true;
  try{
    let posterPath=editingRaceId?races.find(r=>r.id===editingRaceId)?.poster_path||null:null;const file=f.get('poster');
    if(file?.size){if(file.size>5*1024*1024)throw new Error('El cartel no puede superar 5 MB.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Usa un cartel JPG, PNG o WebP.');posterPath=`${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error:upErr}=await sb.storage.from('race-posters').upload(posterPath,file,{contentType:file.type});if(upErr)throw upErr;}
    const registrationUrl=String(f.get('registration_url')||'').trim()||null;
    const values={name:String(f.get('name')).trim(),race_date:f.get('date'),distance_km:Number(f.get('distance')),elevation_m:Number(f.get('elevation')),race_type:String(f.get('race_type')),registration_url:registrationUrl,poster_path:posterPath};let raceId;
    if(editingRaceId){const {data,error}=await sb.from('races').update(values).eq('id',editingRaceId).select('id').single();if(error)throw error;raceId=data.id;toast('Carrera actualizada.');}
    else{const {data,error}=await sb.from('races').insert({...values,created_by:user.id,status:'pending'}).select('id').single();if(error)throw error;raceId=data.id;const {error:mailError}=await sb.functions.invoke('notify-race',{body:{raceId}});toast(mailError?'Propuesta guardada; no se pudo enviar el correo de aviso.':'Propuesta pendiente de validar por el administrador.');}
    editingRaceId=null;season=year;$('#season').value=year;if($('#seasonView'))$('#seasonView').value=year;$('#raceModal').classList.remove('open');e.currentTarget.reset();await loadAll();
  }catch(err){toast(err.message||'No se pudo guardar la propuesta.');}finally{submit.disabled=false;}
};
$('#bell').onclick=()=>toast('No tienes notificaciones nuevas');
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(b.dataset.tab==='disponibilidad')$('#busyModal').classList.add('open');else if(b.dataset.tab==='carreras')$('#eventlist').scrollIntoView({behavior:'smooth'});else if(b.dataset.tab==='listado')$('#raceTableSection').scrollIntoView({behavior:'smooth'});else if(b.dataset.tab==='admin'&&isAdmin){$('#adminSection').hidden=false;$('#adminSection').scrollIntoView({behavior:'smooth'});}else if(b.dataset.tab==='perfil')$('#profileModal').classList.add('open');});

if(sb)sb.auth.getSession().then(({data:{session}})=>{if(session&&!recoveryMode)start(session.user).catch(e=>{setError(e.message);$('#authGate').style.display='grid'});});
if(sb)sb.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){recoveryMode=true;showAuthMode();$('#authGate').style.display='grid';$('.shell').classList.remove('ready');}if(!session){user=null;$('#authGate').style.display='grid';$('.shell').classList.remove('ready');}});
