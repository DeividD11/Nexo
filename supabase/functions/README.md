# Supabase Edge Functions

El proyecto `zyfjffvqcprfcohgdrxx` tiene `messenger-api` en **versión 19 ACTIVE**. Nexo usa autenticación personalizada; no utiliza Supabase Auth. Por eso `verify_jwt = false` es deliberado: cada acción privada valida en el servidor un token opaco Bearer y los permisos del recurso.

## Política CORS

La versión 19 responde al preflight `OPTIONS` con HTTP 204 y devuelve `Access-Control-Allow-Origin: *`, sin `Access-Control-Allow-Credentials`. La API no usa cookies ni credenciales automáticas del navegador; las acciones privadas requieren un token de sesión explícito en `Authorization: Bearer` y validación de sesión y permisos en servidor. No se requiere `APP_ALLOWED_ORIGINS`.

Los encabezados permitidos son `authorization`, `apikey`, `content-type`, `x-client-info`, `x-requested-with` y `x-device-label`. Los métodos son `POST` y `OPTIONS`. El uso de CORS público no reemplaza la autenticación, autorización, límites de frecuencia ni validación de membresía.

## Despliegue

La fuente completa está en `messenger-api/`, incluidos `index.ts`, `deno.json` y los módulos `auth/`, `accounts/`, `messaging/`, `groups/`, `files/`, `notifications/`, `settings/` y `search/`.

```bash
supabase login
supabase link --project-ref zyfjffvqcprfcohgdrxx
supabase functions serve messenger-api --no-verify-jwt
supabase functions deploy messenger-api --use-api --no-verify-jwt
```

No cambies `verify_jwt=false` sin rediseñar la autenticación. Las claves de servidor se inyectan como secretos de Supabase y nunca deben incorporarse al frontend ni al repositorio.

## Secretos de aplicación

Configura en **Supabase Dashboard → Edge Functions → Secrets**:

- `APP_BASE_URL`: URL pública completa del sitio, incluyendo el prefijo del repositorio si es un sitio de proyecto; se usa para enlaces de recuperación.
- `RESEND_API_KEY`: clave privada de Resend.
- `MAIL_FROM`: remitente de un dominio validado en Resend.

`APP_ALLOWED_ORIGINS` ya no se utiliza para CORS del navegador.
