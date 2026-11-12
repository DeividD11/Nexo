# Revisión final y corrección de conectividad de Nexo

**Última revisión:** 12 de noviembre de 2026.  
**Proyecto Supabase:** `zyfjffvqcprfcohgdrxx`.  
**Edge Function:** `messenger-api`, versión **19 ACTIVE**, `verify_jwt=false`.

## Hallazgo que causaba el mensaje de conexión

Los logs remotos mostraron una invocación:

```text
OPTIONS | 403 | https://zyfjffvqcprfcohgdrxx.supabase.co/functions/v1/messenger-api
```

El preflight CORS era rechazado por la allowlist de `Origin` de la Edge Function. Al no recibir un `Access-Control-Allow-Origin` válido, el navegador bloqueaba el resultado del preflight y `fetch()` fallaba como `TypeError`; el cliente lo mostraba como «No fue posible conectar con el servidor», aunque el fallo observado era una configuración de origen y no necesariamente una desconexión de Internet.

## Correcciones aplicadas

1. Se desplegó `messenger-api` versión **18 ACTIVE** desde la fuente completa de la versión 17, manteniendo la autenticación personalizada y `verify_jwt=false`.
2. Los logs consultados el 12 de noviembre mostraron que la versión 18 aún recibía `OPTIONS | 403`; el origen exacto no se registró, por lo que no podía asegurarse que fuera `https://deividd11.github.io`.
3. Para eliminar esta dependencia del hostname, se desplegó `messenger-api` versión **19 ACTIVE**. Responde al preflight con HTTP 204 y `Access-Control-Allow-Origin: *`, sin habilitar cookies ni `Access-Control-Allow-Credentials`. La autenticación privada continúa usando un Bearer opaco validado en servidor.
4. Se mantuvo en el ZIP el snapshot de los 19 archivos backend disponibles, pero la comparación con la función remota mostró diferencias byte a byte en varios módulos; `SOURCE_SYNC_REQUIRED.md` prohíbe redeplegar esa carpeta hasta sincronizarla con la fuente remota exacta.
5. Se mejoró `ApiClient`: diferencia el modo sin conexión de errores de CORS, DNS, TLS o URL, y muestra el origen del navegador para diagnóstico.
6. Se añadió `tests/network-cors.test.mjs` para impedir que se vuelva a introducir el rechazo del origen de GitHub Pages o un mensaje de red que oculte el error CORS.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
|---|---|
| Suite automatizada completa | **39 aprobadas, 0 fallidas** |
| Sintaxis de JavaScript | Aprobada en todos los archivos `src/` y `tests/` |
| Imports relativos del frontend y pruebas | 78 revisados, 0 ausentes |
| Imports relativos de Edge Function | Todos resuelven a archivos incluidos |
| Sintaxis TypeScript (transpilación sintáctica) | 18 archivos, 0 errores de sintaxis |
| Recursos bajo ruta de subdirectorio tipo GitHub Pages | 8 respuestas HTTP 200 en servidor local |
| Configuración de producción | Revisada; URL/key públicas separadas de secretos |
| Escaneo de secretos | Sin claves privadas ni credenciales reales identificadas |
| ZIP de origen | Legible y sin errores de estructura antes de aplicar las correcciones |
| Edge Function en Supabase | Versión 19 `ACTIVE`, confirmada por la plataforma |
| Petición OPTIONS real después del despliegue | **No ejecutada desde este entorno**; el DNS del entorno no resuelve `supabase.co` |
| Publicación real en GitHub Pages | No ejecutada |

La transpilación sintáctica de TypeScript no equivale a una validación completa de tipos de Deno. La función remota se desplegó correctamente a través de la plataforma Supabase, pero no se pudo repetir la llamada HTTP desde el entorno de esta sesión.

## Estructura backend recuperada

```text
supabase/functions/messenger-api/
├── index.ts
├── deno.json
├── auth/
├── accounts/
├── messaging/
├── groups/
├── files/
├── notifications/
├── settings/
└── search/
```

El ZIP contiene archivos de código para todos los módulos, pero no es un espejo exacto de la versión remota 19. Antes de redeplegar, sincroniza la fuente desde Supabase siguiendo `SOURCE_SYNC_REQUIRED.md`.

## Configuración manual que aún depende del propietario

- La versión 19 permite CORS sin cookies, independientemente del dominio frontend. No se requiere configurar `APP_ALLOWED_ORIGINS`. Las operaciones privadas siguen protegidas mediante el token Bearer y las comprobaciones de autorización en el backend.
- `APP_BASE_URL` debe contener la URL pública completa del sitio, incluyendo la ruta del repositorio si corresponde.
- `RESEND_API_KEY` y `MAIL_FROM` deben configurarse en Supabase si se desea recuperar contraseña por correo.
- GitHub Pages todavía debe publicarse desde el repositorio real del propietario y verificarse con el workflow.

## Limitación pendiente: historial de migraciones SQL

El proyecto remoto conserva seis migraciones registradas, pero faltan dos scripts SQL históricos en el repositorio (`20261110062234_lock_direct_data_api_access` y `20261110225842_auth_refresh_rotation_and_atomic_password_reset`). Además, los objetos SQL de las etapas 7 y 9 ya fueron comprobados en producción, pero sus versiones necesitan reconciliación en el historial remoto.

No ejecutar `supabase db push` ni `supabase db reset` en producción hasta recuperar esos scripts, inspeccionar el esquema y reconciliar el historial. Esta limitación no explica el error CORS observado, pero sí impide certificar una reconstrucción limpia de una base de datos nueva.

## Dictamen

La causa concreta del mensaje de conexión fue identificada y corregida en la Edge Function remota versión 19; el frontend y el snapshot backend están incluidos y las pruebas locales pasan; los módulos backend deben sincronizarse antes de volver a desplegar la función. Aun así, la publicación de GitHub Pages y una prueba HTTP real posterior al despliegue siguen pendientes, y el historial de migraciones requiere la operación manual descrita. Por eso no se declara la aplicación publicada y verificada integralmente en producción.
