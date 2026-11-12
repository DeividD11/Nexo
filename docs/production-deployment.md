# Etapa 11 — Configuración y despliegue de producción

**Fecha de actualización:** 11 de noviembre de 2026. Los archivos de automatización están preparados y la corrección CORS de `messenger-api` fue desplegada como versión 19 ACTIVE. GitHub Pages todavía no se ha publicado desde este entorno.

## 1. Arquitectura de producción

- **Frontend:** HTML, CSS y módulos ES nativos. GitHub Pages entrega archivos estáticos; no existe un servidor Node.js de aplicación, proceso `npm start`, SSR ni compilación obligatoria.
- **Backend:** Supabase Edge Function `messenger-api` (Deno), PostgreSQL y Storage.
- **Autenticación:** modelo propio de Nexo. No utiliza Supabase Auth ni JWT de Supabase. Por eso `verify_jwt = false` es intencional: las operaciones privadas siguen exigiendo un token opaco validado por `authService.getSession(req)` y las comprobaciones de membresía/propiedad del servicio.
- **Rutas web:** navegación de aplicación mediante hash (`#/app`); `reset-password.html` es una página estática independiente. Todas las rutas de recursos usan rutas relativas (`./`) y funcionan bajo el prefijo de un repositorio de GitHub Pages.

## 2. Configuración pública y privada

### Pública, visible en el navegador

`src/config/appConfig.js` contiene únicamente:

- URL de la Edge Function: `https://zyfjffvqcprfcohgdrxx.supabase.co/functions/v1/messenger-api`.
- Clave `sb_publishable_` de cliente. Es pública por diseño; no equivale a una clave secreta ni debe otorgar acceso directo a tablas.

La página no puede leer GitHub Actions Secrets como variables del navegador: cualquier valor incorporado al HTML/JavaScript se vuelve público. No pongas claves `sb_secret_`, `service_role`, contraseñas PostgreSQL, `SUPABASE_ACCESS_TOKEN` o `RESEND_API_KEY` en `src/`, `public/` ni en un artefacto de Pages.

### Privada, solo en Supabase

Configura desde **Supabase Dashboard → Edge Functions → Secrets**:

| Nombre | Uso |
|---|---|
| `APP_BASE_URL` | URL pública completa de la raíz del frontend, incluyendo el prefijo `/repositorio` cuando corresponda. |
| `RESEND_API_KEY` | Clave privada de Resend para enviar enlaces de recuperación. |
| `MAIL_FROM` | Remitente verificado en Resend. |

La función consume además variables inyectadas por Supabase (`SUPABASE_URL`, `SUPABASE_SECRET_KEYS` y `SUPABASE_PUBLISHABLE_KEYS`). No las escribas en los archivos del proyecto. El ejemplo editable está en `supabase/.env.production.example`; copia el archivo a `supabase/.env.production`, reemplaza los marcadores y no lo subas al repositorio.

## 3. Publicar el frontend en GitHub Pages

1. Crea o selecciona un repositorio GitHub para Nexo. El repositorio `Nexo` no aparecía entre los repositorios disponibles para esta sesión, por lo que falta confirmar su nombre y URL.
2. Copia el contenido de la carpeta del proyecto a la raíz del repositorio, incluyendo `.github/workflows/pages.yml`.
3. Confirma que la rama principal se llame `main` o modifica el disparador del workflow para que coincida.
4. En GitHub, abre **Settings → Pages** y selecciona **GitHub Actions** como *Build and deployment source*.
5. Haz `git push` a `main` o ejecuta manualmente **Actions → Publicar Nexo en GitHub Pages → Run workflow**.
6. Comprueba que el workflow termine en verde y copia la URL real mostrada en el entorno `github-pages`.
7. El workflow crea `_site/` con solo `index.html`, `reset-password.html`, `404.html`, `public/` y `src/`. No publica las migraciones SQL, documentación, ejemplos de secretos ni pruebas.

El workflow no instala dependencias ni ejecuta un servidor Node. GitHub Actions utiliza su propio runner para empaquetar y publicar archivos, pero el sitio servido al usuario final es estático.

### Compatibilidad de rutas

- En un sitio de proyecto, la URL tiene la forma `https://deividd11.github.io/<repositorio>/`.
- CORS no depende del hostname de Pages desde la versión 19; no necesitas registrar el origen por separado.
- `APP_BASE_URL` sí debe incluir `/<repositorio>` porque el enlace de recuperación apunta a `reset-password.html`.
- Para un dominio personalizado, usa el origen `https://tu-dominio` y `APP_BASE_URL=https://tu-dominio` (o el subdirectorio si realmente sirve allí la app).
- La navegación interna usa hash routes para no depender de reescrituras de servidor. `404.html` es un respaldo simple hacia `index.html`.

## 4. Configurar Supabase

El proyecto remoto comprobado es `zyfjffvqcprfcohgdrxx`, región `us-west-2`, estado `ACTIVE_HEALTHY`, PostgreSQL 17.11. La función `messenger-api` está desplegada como versión 19 ACTIVE. El ZIP contiene el snapshot local de sus módulos; consulta `supabase/functions/messenger-api/SOURCE_SYNC_REQUIRED.md` antes de intentar redeplegar, porque los módulos locales no se han confirmado byte a byte contra la función remota.

1. Inicia sesión en Supabase Dashboard y abre el proyecto con referencia `zyfjffvqcprfcohgdrxx`.
2. En **Edge Functions → Secrets**, configura los tres valores privados de la tabla anterior.
3. Establece `APP_BASE_URL` con la URL real de Pages, por ejemplo `https://deividd11.github.io/<repositorio>`; no conserves el marcador literal.
4. En Resend, verifica el dominio remitente, crea la API key privada y usa una dirección `MAIL_FROM` del dominio verificado. Envía y recibe un correo de recuperación de prueba.
5. En **Storage → Buckets**, confirma que `messenger-private` siga como privado, con máximo 10 MiB y la lista MIME que consta en `supabase/config.toml`.
6. No crees políticas amplias de `storage.objects` para `anon` o `authenticated`. La Edge Function opera Storage con la clave privada en servidor y comprueba la membresía antes de emitir URLs firmadas de corta duración.

### CORS

La versión 19 corrige el error `OPTIONS | 403` que hacía que el navegador mostrara «No fue posible conectar con el servidor». La API devuelve `Access-Control-Allow-Origin: *` sin `Access-Control-Allow-Credentials`, y procesa `OPTIONS` antes de validar la sesión. Esto es apropiado porque Nexo no utiliza cookies: toda operación privada exige un token Bearer opaco validado por el backend. Los encabezados admitidos son `authorization`, `apikey`, `content-type`, `x-client-info`, `x-requested-with` y `x-device-label`; los métodos son `POST` y `OPTIONS`. No se requiere `APP_ALLOWED_ORIGINS`.

### Storage y permisos observados

En la consulta remota realizada el 11 de noviembre de 2026:

- `messenger-private`: `public=false`, límite `10485760` bytes, tipos MIME limitados.
- Las tablas de aplicación del esquema `public` tenían RLS habilitado.
- `storage.objects` no tenía políticas permisivas para `anon` o `authenticated` en la consulta auditada; el frontend no recibe rutas de objetos arbitrarias.
- El asesor de seguridad de Supabase devolvió cero hallazgos.

No cambies el bucket a público ni concedas `service_role` al navegador.

## 5. CLI, migraciones y despliegues de backend

Instala Supabase CLI v3 y ejecuta los comandos desde la raíz del proyecto:

```bash
supabase --version
supabase login
supabase link --project-ref zyfjffvqcprfcohgdrxx
supabase migration list --remote=zyfjffvqcprfcohgdrxx
```

### Atención: historial de migraciones que hay que reconciliar

La consulta remota devolvió estas seis versiones aplicadas:

- `20261110053559` — `initial_messenger_web`
- `20261110054109` — `security_and_foreign_key_indexes`
- `20261110062234` — `lock_direct_data_api_access`
- `20261110225842` — `auth_refresh_rotation_and_atomic_password_reset`
- `20261111005001` — `secure_profile_contact_operations`
- `20261111005059` — `atomic_profile_updates`

El ZIP actual sí conserva los SQL para `20261110053559`, `20261110054109`, `20261111005001` y `20261111005059`. **No contiene los SQL originales** de `20261110062234` ni `20261110225842`; sus versiones sí aparecen en el historial remoto. No inventes archivos de migración para esos dos pasos. Recupéralos del repositorio/backup original o genera y revisa un esquema base desde una copia respaldada antes de pretender reconstruir otro proyecto desde cero.

Además, las migraciones locales `20261111010000_stage7_atomic_messaging_and_groups.sql` y `20261111020000_stage9_files_notifications_settings.sql` no aparecían en el historial remoto aunque sus objetos ya estaban aplicados. La consulta remota encontró las diez funciones SQL del bloque Stage 7 y los índices Stage 9, además de las columnas de preferencias. Esto concuerda con que aquellas etapas se aplicaron mediante SQL directo y no quedaron registradas en `schema_migrations`.

**No ejecutes todavía `supabase db push` ni `supabase db reset` contra producción** hasta recuperar las dos migraciones originales, revisar la comparación local/remota y respaldar la base de datos. Una vez restaurado el historial completo y verificado que Stage 7 y Stage 9 ya están aplicadas, el propietario puede registrar solo esas dos versiones en el historial con:

```bash
supabase migration repair --remote=zyfjffvqcprfcohgdrxx --status applied 20261111010000 20261111020000 --yes
supabase migration list --remote=zyfjffvqcprfcohgdrxx
```

Ejecuta `migration repair` únicamente después de comprobar que el SQL correspondiente ya está aplicado. Esta operación registra el estado; no ejecuta las migraciones.

Antes de futuras migraciones, usa una previsualización:

```bash
supabase db push --remote=zyfjffvqcprfcohgdrxx --dry-run
```

Lee cada línea propuesta. Solo cuando la comparación sea correcta, el respaldo esté disponible y el SQL haya pasado pruebas en un proyecto de staging, aplica cambios con la confirmación explícita de CLI v3:

```bash
supabase db push --remote=zyfjffvqcprfcohgdrxx --yes
```

No utilices `db reset` en la base de datos de producción.

## 6. Descargar y desplegar la Edge Function

El código remoto activo no estaba íntegramente en el ZIP de Etapa 9. La carpeta local incluye `deno.json` y esta guía, no una implementación backend ficticia. Descarga la fuente que está sirviendo actualmente:

```bash
supabase functions download messenger-api --remote=zyfjffvqcprfcohgdrxx --use-api
```

Comprueba que se han descargado `index.ts` y todos los módulos `auth`, `accounts`, `messaging`, `groups`, `files`, `notifications`, `settings` y `search`. Revisa los cambios y conserva la versión desplegada actual. Después de una modificación aprobada, despliega:

```bash
supabase functions deploy messenger-api --remote=zyfjffvqcprfcohgdrxx --yes
```

`verify_jwt = false` debe permanecer así mientras la autenticación siga usando tokens opacos propios. No lo cambies a `true` sin migrar el sistema de identidad y autorización a JWT de Supabase Auth.

## 7. Procedimiento de actualización

1. Haz una copia de seguridad de la base de datos y registra la versión actual de la función.
2. Crea una rama de Git y modifica el frontend, migraciones o función según corresponda.
3. Ejecuta todas las pruebas frontend y revisa el diff SQL.
4. Prueba cambios SQL y Edge Function en un proyecto de staging antes de producción.
5. Para nuevas migraciones, usa timestamp único, cambios compatibles hacia atrás, restricciones e índices deliberados; no reescribas una migración ya aplicada.
6. Despliega la Edge Function solo si su fuente completa está versionada en el repositorio y sus secretos están configurados.
7. Fusiona en `main`; el workflow de Pages publica el frontend estático.
8. Revisa el resultado de GitHub Actions, los logs de Edge Functions y los asesores de Supabase.
9. Ejecuta un smoke test: carga de la página, registro/inicio de sesión de prueba, sesión, conversación, envío/lectura de mensaje, adjunto, recuperación de contraseña y revocación de sesión.
10. Si hay error en frontend, revierte el commit de Pages. Si una migración ya se aplicó, prepara una migración compensatoria; no edites el SQL histórico ni hagas `db reset`.

## 8. Verificación y límites de esta preparación

| Comprobación | Resultado | Evidencia / límite |
|---|---|---|
| Frontend sin servidor Node permanente | Preparado | Solo HTML/CSS/ES modules; workflow publica artefactos estáticos. |
| Configuración Supabase local | Preparada | `supabase/config.toml` y bucket privado declarados. CLI no estaba instalado para validar el config con el binario. |
| Proyecto Supabase activo | Aprobada | `ACTIVE_HEALTHY`, PostgreSQL 17.11. |
| Edge Function actual | Aprobada | `messenger-api`, versión 19 ACTIVE, `verify_jwt=false`; código completo en el ZIP. |
| CORS de la función | Corrección desplegada | Versión 19 combina el origen Pages predeterminado con `CORS público sin credenciales`; falta una nueva prueba de navegador desde el dominio publicado. |
| Bucket privado y tamaño | Aprobada | Bucket consultado como privado, 10 MiB. |
| RLS del esquema public | Aprobada | RLS habilitado en todas las tablas de aplicación consultadas. |
| Asesor de seguridad | Aprobada | Cero hallazgos de seguridad en consulta actual. |
| Variables privadas de producción | No ejecutada | No se inspeccionaron ni modificaron secretos; el propietario debe comprobarlos en Dashboard. |
| Migraciones reconstruibles desde cero | Fallida / pendiente | Faltan dos SQL originales; además, Stage 7 y 9 requieren reconciliar historial. |
| GitHub Pages publicado | No ejecutada | No se encontró repositorio Nexo accesible y no se ejecutó workflow. |
| URL y correo de recuperación | No ejecutada | Depende de URL final, dominio y credenciales de Resend. |
| Prueba HTTP desde navegador real | No ejecutada | No se realizó despliegue ni prueba E2E en el dominio de producción. |

**Conclusión:** Nexo queda con los archivos de despliegue estático y configuración local preparados. No se declara producción publicada ni una reconstrucción de base de datos certificada hasta resolver las operaciones manuales anotadas arriba.
