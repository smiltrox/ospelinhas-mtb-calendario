import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS' };
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const ADMIN_EMAIL='lopezsanchez.antonio@gmail.com';
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Método no permitido.'},405);
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service)return reply({error:'Falta configuración en Supabase.'},500);
 const auth=req.headers.get('Authorization')??'';
 const caller=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {data:{user}}=await caller.auth.getUser();if(!user)return reply({error:'Inicia sesión.'},401);
 const admin=createClient(url,service);const {data:role}=await admin.from('user_roles').select('is_admin,is_banned').eq('id',user.id).maybeSingle();
 if(!role?.is_admin||role.is_banned||user.email?.toLowerCase()!==ADMIN_EMAIL)return reply({error:'Solo el administrador puede gestionar socios.'},403);
 let input:{action?:string;userId?:string};try{input=await req.json()}catch{return reply({error:'Solicitud no válida.'},400)}
 if(input.action==='list'){
  const [{data:profiles,error:pe},{data:roles,error:re}]=await Promise.all([admin.from('profiles').select('id,display_name').order('display_name'),admin.from('user_roles').select('id,is_admin,is_banned')]);
  if(pe||re)return reply({error:pe?.message||re?.message||'No se pudieron cargar los socios.'},500);
  const users=[];for(let page=1;;page++){const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});if(error)return reply({error:error.message},500);users.push(...data.users);if(data.users.length<1000)break;}
  const pm=new Map((profiles||[]).map(p=>[p.id,p.display_name])),rm=new Map((roles||[]).map(r=>[r.id,r]));
  return reply({users:users.map(u=>({id:u.id,email:u.email,display_name:pm.get(u.id)||u.user_metadata?.display_name||'',is_admin:!!rm.get(u.id)?.is_admin,banned:!!rm.get(u.id)?.is_banned||!!u.banned_until}))});
 }
 if(!input.userId||!/^[0-9a-f-]{36}$/i.test(input.userId))return reply({error:'Socio no válido.'},400);
 if(input.userId===user.id)return reply({error:'No puedes modificar tu propia cuenta desde este panel.'},400);
 const {data:tr,error:te}=await admin.from('user_roles').select('is_admin').eq('id',input.userId).maybeSingle();if(te)return reply({error:te.message},500);if(tr?.is_admin)return reply({error:'No se puede bloquear ni borrar otra cuenta administradora.'},403);
 if(input.action==='ban'||input.action==='unban'){
  const banned=input.action==='ban';const {error:ae}=await admin.auth.admin.updateUserById(input.userId,{ban_duration:banned?'876000h':'none'});if(ae)return reply({error:ae.message},500);
  const {error:ue}=await admin.from('user_roles').update({is_banned:banned}).eq('id',input.userId);if(ue)return reply({error:ue.message},500);return reply({ok:true,banned});
 }
 if(input.action==='delete'){
  const {data:target,error:ge}=await admin.auth.admin.getUserById(input.userId);if(ge||!target.user)return reply({error:ge?.message||'No se encontró el socio.'},404);
  if(target.user.email?.toLowerCase()===ADMIN_EMAIL)return reply({error:'No se puede borrar la cuenta administradora principal.'},403);
  const {error:de}=await admin.auth.admin.deleteUser(input.userId);if(de)return reply({error:de.message},500);
  const {data:photos}=await admin.storage.from('profile-photos').list(input.userId,{limit:1000});if(photos?.length)await admin.storage.from('profile-photos').remove(photos.map(photo=>input.userId+'/'+photo.name));return reply({ok:true});
 }
 return reply({error:'Acción no válida.'},400);
});
