import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Inicia sesión para enviar una propuesta.' }, 401);
  const { raceId } = await req.json();
  const admin = createClient(url, service);
  const { data: race, error } = await admin.from('races').select('*').eq('id', raceId).single();
  if (error || !race || race.created_by !== user.id || race.status !== 'pending') return json({ error: 'No se pudo verificar la propuesta.' }, 403);

  const actions = await Promise.all(['approve', 'reject'].map(async (action) => {
    const token = crypto.randomUUID() + crypto.randomUUID();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const tokenHash = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const { error: tokenError } = await admin.from('review_tokens').insert({ race_id: race.id, action, token_hash: tokenHash, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() });
    if (tokenError) throw tokenError;
    return { action, url: `${url}/functions/v1/review-race?token=${encodeURIComponent(token)}&action=${action}` };
  }));
  const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const date = new Date(`${race.race_date}T12:00:00`).toLocaleDateString('es-ES', { dateStyle: 'long' });
  const registration = race.registration_url ? `<tr><td><b>Inscripción</b></td><td><a href="${esc(race.registration_url)}">${esc(race.registration_url)}</a></td></tr>` : '';
  const poster = race.poster_path ? await admin.storage.from('race-posters').createSignedUrl(race.poster_path, 7 * 86400) : null;
  const posterRow = poster?.data?.signedUrl ? `<tr><td><b>Cartel</b></td><td><a href="${poster.data.signedUrl}">Ver cartel (7 días)</a></td></tr>` : '';
  const html = `<div style="font-family:Arial,sans-serif;color:#20221b;max-width:560px;margin:auto"><p style="color:#7a8d26;font-weight:bold">OS PELINHAS · OLIVENZA MTB</p><h2>Nueva carrera pendiente</h2><p>Un socio ha propuesto una prueba para el calendario del club.</p><table cellpadding="8" style="background:#f5f6f1;border-radius:10px"><tr><td><b>Carrera</b></td><td>${esc(race.name)}</td></tr><tr><td><b>Fecha</b></td><td>${date}</td></tr><tr><td><b>Distancia</b></td><td>${race.distance_km} km</td></tr><tr><td><b>Desnivel</b></td><td>+${race.elevation_m} m</td></tr>${registration}${posterRow}<tr><td><b>Propuesta por</b></td><td>${esc(user.email ?? 'Socio')}</td></tr></table><p style="margin:24px 0"><a href="${actions[0].url}" style="background:#c2e51b;color:#1b2011;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">VALIDAR</a>&nbsp;&nbsp;<a href="${actions[1].url}" style="background:#f0e9e7;color:#812e27;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">RECHAZAR</a></p><small>Los enlaces caducan en 7 días y piden una confirmación antes de aplicar la decisión.</small></div>`;
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM'), to: ['lopezsanchez.antonio@gmail.com'], subject: `Validación de carrera: ${race.name}`, html }) });
  if (!response.ok) return json({ error: 'La propuesta se guardó, pero no se pudo enviar el correo.' }, 502);
  return json({ sent: true });
});
