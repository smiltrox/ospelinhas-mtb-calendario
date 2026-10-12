import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.PELINHAS_CONFIG || {};
const ready = !!cfg.SUPABASE_URL && !!cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes('TU-PROYECTO') && !cfg.SUPABASE_ANON_KEY.includes('PEGA_AQUI');
const sb = ready ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
const $ = (s) => document.querySelector(s);
const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
let user = null, profile = null, isAdmin = false, season = new Date().getFullYear(), races = [], attendance = [], availability = [], profileMap = {}, signupMode = false;

function toast(msg) { const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
function escapeHtml(s='') { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function dateObj(d) { return new Date(`${d}T12:00:00`); }
function dateKey(y,m,d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function setError(message='') { $('#authError').textContent=message; }

$('#authSwitch').onclick=()=>{signupMode=!signupMode;$('#authTitle').textContent=signupMode?'Únete al equipo':'Bienvenido al club';$('#authIntro').textContent=signupMode?'Crea tu cuenta para compartir el calendario.':'Entra en tu calendario de temporada.';$('#nameField').hidden=!signupMode;$('#authSubmit').textContent=signupMode?'Crear cuenta →':'Entrar →';$('#authSwitchText').textContent=signupMode?'¿Ya tienes cuenta?':'¿Aún no tienes cuenta?';$('#authSwitch').textContent=signupMode?'Inicia sesión':'Regístrate';setError();};
if(!ready){$('#setupNote').hidden=false;$('#authSubmit').disabled=true;$('#authSwitch').disabled=true;$('#authSubmit').textContent='Configura Supabase para continuar';}

$('#authForm').onsubmit=async e=>{
  e.preventDefault(); if(!sb)return;
  const f=new FormData(e.currentTarget), email=String(f.get('email')).trim().toLowerCase(), password=String(f.get('password'));
  $('#authSubmit').disabled=true;setError('');
  try {
    if(signupMode){
      const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:String(f.get('display_name')).trim()},emailRedirectTo:location.href.split('#')[0]}});
      if(error)throw error;
      if(data.session) await start(data.session.user);
      else setError('Cuenta creada. Revisa tu correo para confirmar y luego inicia sesión.');
    } else {
      const {data,error}=await sb.auth.signInWithPassword({email,password}); if(error)throw error; await start(data.user);
    }
  }catch(err){setError(err.message||'No se pudo iniciar sesión.');}
  finally{$('#authSubmit').disabled=false;}
};

async function start(authUser){
  user=authUser;
  const [{data:p,error:pe},{data:r,error:re}]=await Promise.all([sb.from('profiles').select('id,display_name').eq('id',user.id).single(),sb.from('user_roles').select('is_admin').eq('id',user.id).maybeSingle()]);
  if(pe)throw pe; if(re)throw re; profile=p; isAdmin=!!r?.is_admin;
  $('#authGate').style.display='none'; $('.shell').classList.add('ready');
  document.querySelectorAll('.asidefoot b').forEach(x=>x.textContent=profile.display_name);
  document.querySelectorAll('.asidefoot .avatar,.userpill .avatar').forEach(x=>x.textContent=(profile.display_name||'S').trim().slice(0,1).toUpperCase());
  $('.userpill').lastChild.textContent=profile.display_name.split(' ')[0];
  $('#adminNav').hidden=!isAdmin;
  const select=$('#season'); select.innerHTML=''; for(let y=2026;y<=2035;y++)select.insertAdjacentHTML('beforeend',`<option value="${y}">${y}</option>`); if(season<2026||season>2035)season=2026;select.value=season;
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

function buildCalendar(){
  const grid=$('#monthgrid');grid.innerHTML='';
  for(let m=0;m<12;m++){const offset=(new Date(season,m,1).getDay()+6)%7, count=new Date(season,m+1,0).getDate();let h=`<div class="month ${season===new Date().getFullYear()&&m===new Date().getMonth()?'current':''}"><div class="monthname">${months[m]}</div><div class="week">${['l','m','x','j','v','s','d'].map(x=>`<span>${x}</span>`).join('')}</div><div class="days">`;for(let i=0;i<offset;i++)h+='<span class="day blank"></span>';for(let d=1;d<=count;d++){const key=dateKey(season,m,d),raceDay=races.some(r=>r.race_date===key&&r.status==='approved'),busy=availability.includes(key),today=key===new Date().toISOString().slice(0,10);h+=`<span class="day ${raceDay?'race':''} ${busy?'busy':''} ${today?'today':''}" data-date="${key}" title="${raceDay?'Carrera publicada':busy?'No disponible':''}">${d}</span>`}h+='</div></div>';grid.insertAdjacentHTML('beforeend',h);}
  $('#calendarLabel').textContent=`Vista anual · ${season}`;
  document.querySelectorAll('.day:not(.blank)').forEach(el=>el.onclick=()=>{const r=races.find(x=>x.race_date===el.dataset.date&&x.status==='approved');if(r)toast(`${r.name} · ${r.distance_km} km`)})
}

async function renderRaces(){
  const list=races.filter(r=>r.status==='approved'||r.created_by===user.id).sort((a,b)=>a.race_date.localeCompare(b.race_date));
  const posterUrls={};await Promise.all(list.filter(r=>r.poster_path).map(async r=>{const {data}=await sb.storage.from('race-posters').createSignedUrl(r.poster_path,1800);if(data?.signedUrl)posterUrls[r.id]=data.signedUrl;}));
  $('#raceTotalLabel').textContent=`${list.filter(r=>r.status==='approved').length} pruebas publicadas en ${season}`;
  $('#eventlist').innerHTML=list.map(r=>{const d=dateObj(r.race_date),mine=attendance.some(a=>a.race_id===r.id&&a.user_id===user.id),count=attendance.filter(a=>a.race_id===r.id).length;return `<div class="event">${posterUrls[r.id]?`<a class="poster-thumb" href="${posterUrls[r.id]}" target="_blank" rel="noopener"><img src="${posterUrls[r.id]}" alt="Cartel de ${escapeHtml(r.name)}"></a>`:''}<div class="datebox"><b>${String(d.getDate()).padStart(2,'0')}</b><small>${months[d.getMonth()].slice(0,3)}</small></div><div class="eventinfo"><b>${escapeHtml(r.name)}</b><small>${r.distance_km} km · +${Number(r.elevation_m).toLocaleString('es-ES')} m · ${count} apuntados</small>${r.registration_url?`<a class="reg-link" href="${escapeHtml(r.registration_url)}" target="_blank" rel="noopener">Inscripción ↗</a>`:''}${r.status==='pending'?'<span class="statusbadge">Pendiente de validar</span>':''}${r.status==='rejected'?'<span class="statusbadge" style="background:#fbe4e3;color:#a3423d">No publicada</span>':''}</div>${r.status==='approved'?`<button class="attend ${mine?'on':''}" data-attend="${r.id}">${mine?'✓ Apuntado':'＋ Me apunto'}</button>`:''}</div>`}).join('');
  $('#empty').style.display=list.length?'none':'block';
  document.querySelectorAll('.reg-link').forEach(a=>{const r=list.find(x=>x.registration_url===a.href||new URL(x.registration_url,location.href).href===a.href);if(!r)return;a.textContent='Inscribirme ↗';a.removeAttribute('target');a.onclick=e=>{e.preventDefault();openRegistration(r);};a.insertAdjacentHTML('afterend',` <button class="share-link" type="button" data-share="${r.id}">WhatsApp ↗</button>`);});
  document.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>shareRegistration(b.dataset.share));
  document.querySelectorAll('[data-attend]').forEach(b=>b.onclick=()=>toggleAttendance(b.dataset.attend));
  const upcoming=list.filter(r=>r.status==='approved').slice(0,4);$('#activity').innerHTML=upcoming.map(r=>`<div class="event"><div class="datebox"><b>${attendance.filter(a=>a.race_id===r.id).length}</b><small>van</small></div><div class="eventinfo"><b>${escapeHtml(r.name)}</b><small>${attendance.filter(a=>a.race_id===r.id).map(a=>escapeHtml(profileMap[a.user_id]||'Socio')).join(', ')||'Sé el primero en apuntarte'}</small></div></div>`).join('');
}

async function toggleAttendance(raceId){
  const active=attendance.some(a=>a.race_id===raceId&&a.user_id===user.id);
  const result=active?await sb.from('attendance').delete().eq('race_id',raceId).eq('user_id',user.id):await sb.from('attendance').insert({race_id:raceId,user_id:user.id});
  if(result.error){toast(result.error.message);return;}toast(active?'Has quitado tu asistencia':'¡Asistencia confirmada!');await loadAll();
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
  const pending=(data||[]).map(r=>`<div class="event">${pendingPosters[r.id]?`<a class="poster-thumb" href="${pendingPosters[r.id]}" target="_blank" rel="noopener"><img src="${pendingPosters[r.id]}" alt="Cartel"></a>`:''}<div class="datebox"><b>!</b><small>revisar</small></div><div class="eventinfo"><b>${escapeHtml(r.name)}</b><small>${dateObj(r.race_date).toLocaleDateString('es-ES')} · ${r.distance_km} km · +${Number(r.elevation_m).toLocaleString('es-ES')} m · ${escapeHtml(profileMap[r.created_by]||'Socio')}</small>${r.registration_url?`<a class="reg-link" href="${escapeHtml(r.registration_url)}" target="_blank" rel="noopener">Enlace de inscripción</a>`:''}</div><div class="adminactions"><button class="attend on" data-review="approved" data-id="${r.id}">Validar</button><button class="attend" data-review="rejected" data-id="${r.id}">Rechazar</button></div></div>`).join('');
  const {data:published}=await sb.from('races').select('id,name,race_date').eq('status','approved').gte('race_date',`${season}-01-01`).lte('race_date',`${season}-12-31`).order('race_date');
  const edit=(published||[]).map(r=>`<div class="event"><div class="datebox"><b>${String(dateObj(r.race_date).getDate()).padStart(2,'0')}</b><small>${months[dateObj(r.race_date).getMonth()].slice(0,3)}</small></div><div class="eventinfo"><b>${escapeHtml(r.name)}</b><small>${attendance.filter(a=>a.race_id===r.id).length} asistencias registradas</small></div><button class="attend" data-edit-att="${r.id}">Editar asistentes</button></div>`).join('');
  $('#adminRaces').innerHTML=`${pending||'<div class="empty" style="display:block">No hay propuestas pendientes.</div>'}<div style="border-top:1px solid #eee;padding-top:12px;margin-top:8px"><b style="font-size:11px">Corregir asistencias · ${season}</b>${edit||'<div class="empty" style="display:block">No hay carreras publicadas.</div>'}</div>`;
  document.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{b.disabled=true;const {error:err}=await sb.functions.invoke('admin-review',{body:{raceId:b.dataset.id,decision:b.dataset.review}});if(err){toast(err.message);b.disabled=false;return;}toast(b.dataset.review==='approved'?'Carrera publicada':'Propuesta rechazada');await loadAll();});
  document.querySelectorAll('[data-edit-att]').forEach(b=>b.onclick=()=>showAttendanceEditor(b.dataset.editAtt));
}

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

$('#season').onchange=async e=>{season=Number(e.target.value);await loadAll();};
$('#addBtn').onclick=()=>$('#raceModal').classList.add('open');$('#busyBtn').onclick=()=>$('#busyModal').classList.add('open');$('#editBusy').onclick=()=>$('#busyModal').classList.add('open');
$('#markBusy').onclick=()=>changeAvailability($('#busyInput').value);
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).classList.remove('open'));
document.querySelectorAll('.modalback').forEach(m=>m.onclick=e=>{if(e.target===m)m.classList.remove('open')});
$('#attendanceClose').onclick=()=>$('#attendanceEditorModal').classList.remove('open');
$('#raceForm').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.currentTarget),year=Number(String(f.get('date')).slice(0,4));if(year<2026||year>2035){toast('La fecha debe estar entre 2026 y 2035.');return;}
  const submit=e.currentTarget.querySelector('[type=submit]');submit.disabled=true;
  try{
    let posterPath=null;const file=f.get('poster');
    if(file?.size){if(file.size>5*1024*1024)throw new Error('El cartel no puede superar 5 MB.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Usa un cartel JPG, PNG o WebP.');posterPath=`${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error:upErr}=await sb.storage.from('race-posters').upload(posterPath,file,{contentType:file.type});if(upErr)throw upErr;}
    const registrationUrl=String(f.get('registration_url')||'').trim()||null;
    const {data:r,error}=await sb.from('races').insert({created_by:user.id,name:String(f.get('name')).trim(),race_date:f.get('date'),distance_km:Number(f.get('distance')),elevation_m:Number(f.get('elevation')),registration_url:registrationUrl,poster_path:posterPath,status:'pending'}).select().single();if(error)throw error;
    season=year;$('#season').value=year;const {error:mailError}=await sb.functions.invoke('notify-race',{body:{raceId:r.id}});$('#raceModal').classList.remove('open');e.currentTarget.reset();await loadAll();
    toast(mailError?'Propuesta pendiente de validar; no se pudo enviar el correo de aviso.':'Propuesta pendiente de validar por el administrador.');
  }catch(err){toast(err.message||'No se pudo guardar la propuesta.');}finally{submit.disabled=false;}
};
$('#bell').onclick=()=>toast('No tienes notificaciones nuevas');
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(b.dataset.tab==='disponibilidad')$('#busyModal').classList.add('open');else if(b.dataset.tab==='carreras')$('#eventlist').scrollIntoView({behavior:'smooth'});else if(b.dataset.tab==='admin'&&isAdmin){$('#adminSection').hidden=false;$('#adminSection').scrollIntoView({behavior:'smooth'});}else if(b.dataset.tab==='perfil'){if(confirm('¿Quieres cerrar sesión?'))sb.auth.signOut().then(()=>location.reload());}});

if(sb)sb.auth.getSession().then(({data:{session}})=>{if(session)start(session.user).catch(e=>{setError(e.message);$('#authGate').style.display='grid'});});
if(sb)sb.auth.onAuthStateChange((_event,session)=>{if(!session){user=null;$('#authGate').style.display='grid';$('.shell').classList.remove('ready');}});
