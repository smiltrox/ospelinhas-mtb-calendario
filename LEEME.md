# OS PELINHAS · calendario MTB

App web móvil para temporadas 2026–2035. Incluye calendario anual, usuarios, carreras propuestas y moderadas por el administrador, días privados no disponibles, confirmación de asistencia, ranking de socios, carteles, enlaces de inscripción con vista integrada y compartir por WhatsApp.

## Estado

El repositorio contiene el frontend y la configuración de base de datos y funciones de servidor. Para proteger las cuentas y datos privados, la web requiere una instancia propia de Supabase. El sitio todavía no está publicado: primero hay que crear/configurar el proyecto y añadir sus claves públicas a GitHub Actions. No se deben guardar claves privadas en GitHub ni en el navegador.

## Puesta en marcha

1. Crea un proyecto en Supabase. En **SQL Editor**, ejecuta `supabase/schema.sql`.
2. En Supabase Auth, habilita email/contraseña y define la URL final de Pages en **Site URL** y en las URL de redirección.
3. Verifica un remitente de correo en Resend. Instala Supabase CLI y desde la carpeta del repositorio ejecuta:

```powershell
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase secrets set RESEND_API_KEY=re_... EMAIL_FROM="OS PELINHAS <club@tu-dominio-verificado.es>"
supabase functions deploy notify-race
supabase functions deploy review-race
supabase functions deploy admin-review
```

4. En GitHub, abre **Settings → Secrets and variables → Actions** y crea `SUPABASE_URL` y `SUPABASE_ANON_KEY` usando los valores públicos del proyecto.
5. En **Settings → Pages**, selecciona **GitHub Actions** como origen. Al guardar cambios en `main`, Actions publicará el sitio.
6. Regístrate con `lopezsanchez.antonio@gmail.com` para asignar el rol de administrador. El mismo email recibe las solicitudes de revisión.

Supabase proporciona base de datos, autenticación y almacenamiento. Resend envía avisos. Las claves `service_role` y `RESEND_API_KEY` son privadas: guárdalas solo como secretos de Supabase. Solo URL y clave anon/publishable van en GitHub Actions.

Una web de inscripción puede impedir su visualización dentro de la app; por eso la ventana integrada ofrece también abrir en una pestaña. La disponibilidad personal permanece privada por las políticas RLS de la base de datos.
