# OS PELINHAS · calendario MTB

Aplicación web móvil para temporadas 2026–2035. Este paquete contiene el frontend, el esquema de datos, las reglas de privacidad y las funciones de correo y moderación. El proyecto queda preparado para publicar con GitHub Pages y conectar a Supabase.

## Funciones incluidas

- Registro e inicio de sesión por correo y contraseña. Supabase envía la verificación de correo.
- Calendario anual de 12 meses, con carreras publicadas y marcas privadas de disponibilidad.
- Propuestas de carrera con fecha, distancia, desnivel, cartel opcional y enlace opcional a la inscripción.
- Botones de aprobación/rechazo en el email del administrador, con enlace de un solo uso y confirmación previa. También hay panel de administración.
- Check de asistencia que el socio puede quitar después. El administrador puede corregir la lista de asistentes.
- Ranking de la temporada basado en los checks de asistencia, sin resultados ni tiempos deportivos.
- Vista integrada de la página de inscripción y botón para compartir el enlace por WhatsApp. Si la organización bloquea la vista integrada, se puede abrir aparte.
- Privacidad de disponibilidad aplicada en la base de datos con políticas RLS; cada usuario solo consulta y cambia sus fechas.

## Servicios necesarios

GitHub Pages publica los archivos de la web, pero no almacena de forma segura cuentas o información compartida. Supabase es el servicio de base de datos, autenticación y almacenamiento de carteles. Resend envía los correos. Los niveles gratuitos suelen bastar para una primera puesta en marcha, sujetos a las condiciones vigentes de cada servicio.

## Puesta en marcha

1. Crea un proyecto en Supabase y ejecuta `supabase/schema.sql` una vez desde **SQL Editor**.
2. En Supabase, activa el registro con email y contraseña y la confirmación de correo. En Auth > URL Configuration, añade la URL final de GitHub Pages como Site URL y redirect permitida.
3. Configura un dominio de envío en Resend. Desde la terminal con Supabase CLI, vincula el proyecto y guarda los secretos de correo en Supabase, nunca en el navegador:

   ```text
   supabase link --project-ref TU_PROJECT_REF
   supabase secrets set RESEND_API_KEY=re_... EMAIL_FROM="OS PELINHAS <club@tu-dominio-verificado.es>"
   supabase functions deploy notify-race
   supabase functions deploy review-race
   supabase functions deploy admin-review
   ```

   Supabase inyecta automáticamente la URL y las claves del servidor que necesitan las funciones.
4. Copia el contenido de esta carpeta como raíz de un repositorio público de GitHub. El workflow `.github/workflows/pages.yml` publica solo los archivos de la web.
5. En los secretos de Actions del repositorio crea `SUPABASE_URL` y `SUPABASE_ANON_KEY` (o la clave pública/publishable). Habilita GitHub Pages con origen **GitHub Actions**. El workflow construye `config.js` con esas dos claves públicas.
6. Regístrate en la app con `lopezsanchez.antonio@gmail.com`. Ese email recibe el rol de administrador al crearse la cuenta. Si ya existía en Supabase al ejecutar el SQL, también se habilita en ese momento.
7. Comprueba una cuenta de socio distinta: propone una carrera, revisa la llegada del email al administrador, valida y confirma la publicación y el correo de confirmación.

No compartas la clave `service_role`/`secret` ni la clave de Resend en GitHub, en el chat ni en `config.js`. Solo la clave pública anon/publishable debe llegar al navegador; las tablas llevan RLS.

## Detalles prácticos

- El email se envía a `lopezsanchez.antonio@gmail.com`; el remitente debe verificarse en Resend.
- Los botones del email muestran una página de confirmación antes de aplicar la decisión. Los tokens son aleatorios, se guardan como hash y caducan en siete días.
- Las fechas no disponibles son privadas incluso si alguien intenta leerlas directamente desde la API.
- Las asistencias confirmadas son visibles a todos los usuarios autenticados y alimentan el ranking de la temporada seleccionada.
- Los carteles son privados hasta que la carrera se publica y se sirven mediante enlaces firmados temporales.
- Una página externa puede impedir que su web se muestre dentro de un iframe. En ese caso se mantiene el enlace para abrirla en otra pestaña y compartirlo por WhatsApp.

## Archivos

- `index.html`, `app.js`, `app.css`, `config.js`, `logo-club.png`: app web.
- `supabase/schema.sql`: tablas, políticas privadas, roles de administrador y almacenamiento.
- `supabase/functions/`: notificación y revisión por email y panel admin.
- `.github/workflows/pages.yml`: publicación automatizada.
