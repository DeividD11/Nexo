# Edge Function `messenger-api`

La función remota del proyecto `zyfjffvqcprfcohgdrxx` está en versión 19 ACTIVE y corrige el preflight CORS que seguía devolviendo HTTP 403 desde el navegador. **Antes de desplegar desde esta carpeta, lee `SOURCE_SYNC_REQUIRED.md`: los módulos backend del ZIP no se han confirmado byte a byte contra la función remota.**

## Política CORS de la API

La API devuelve `Access-Control-Allow-Origin: *` y no habilita `Access-Control-Allow-Credentials`. Nexo no utiliza cookies ni credenciales HTTP automáticas: las rutas privadas exigen un token opaco en `Authorization: Bearer`, validado en el servidor, y cada acción comprueba la sesión y los permisos de recurso. El `apikey` publicado en el cliente es una clave publishable, no una clave administrativa.

La respuesta `OPTIONS` se procesa antes de analizar el cuerpo o validar la sesión y admite `POST`, `OPTIONS` y los encabezados `authorization`, `apikey`, `content-type`, `x-client-info`, `x-requested-with` y `x-device-label`. Así no se rechaza una petición por el hostname de Pages, el prefijo de repositorio o un dominio personalizado.

CORS no reemplaza autenticación/autorización. No se debe añadir `Access-Control-Allow-Credentials`, ni mover el token a cookies sin rediseñar la política. Las rutas públicas de registro/login siguen sujetas a límites de frecuencia.

## Contenido local

La carpeta local contiene el punto de entrada y los módulos del backend del paquete entregado. No debe considerarse un espejo exacto de la fuente remota hasta completar la sincronización indicada en `SOURCE_SYNC_REQUIRED.md`.


```text
index.ts
deno.json
auth/         crypto.ts, repository.ts, service.ts
accounts/     repository.ts, service.ts
messaging/    repository.ts, service.ts
groups/       repository.ts, service.ts
files/        repository.ts, service.ts
notifications/ repository.ts, service.ts
settings/     repository.ts, service.ts
search/       repository.ts, service.ts
```

## Configuración y despliegue

La función usa autenticación propia con tokens opacos, no Supabase Auth. Se mantiene `verify_jwt = false`; la aplicación valida por sí misma las sesiones y la autorización.

```bash
supabase login
supabase link --project-ref zyfjffvqcprfcohgdrxx
supabase functions serve messenger-api --no-verify-jwt
supabase functions deploy messenger-api --use-api --no-verify-jwt
```

Las claves administrativas deben permanecer en el entorno de Edge Functions, nunca en el frontend.
