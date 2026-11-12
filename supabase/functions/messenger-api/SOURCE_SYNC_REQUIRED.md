# Aviso de sincronización de la fuente del backend

La Edge Function `messenger-api` fue desplegada directamente en Supabase como **versión 19 ACTIVE** con la corrección CORS. La versión 19 activa conserva los 19 archivos de fuente que Supabase reporta.

Los módulos de backend presentes en el ZIP que aportó el propietario no coinciden byte a byte con la fuente que está activa en Supabase para todos los archivos (por ejemplo, `auth/repository.ts`, `files/service.ts` y `messaging/repository.ts` difieren en tamaño/contenido). La corrección CORS del `index.ts` local está incluida, pero no se debe asumir que toda esta carpeta sea un espejo exacto de la función remota.

**No despliegues esta carpeta con `supabase functions deploy` todavía**, porque podrías sustituir módulos remotos más recientes por versiones anteriores. Antes de cualquier cambio futuro, sincroniza la fuente exacta que sirve Supabase, revisa el diff, aplica la corrección de este proyecto sobre esa fuente y ejecuta pruebas en staging.

El frontend de GitHub Pages llama al backend ya desplegado en Supabase; para publicar solo el frontend, el workflow `.github/workflows/pages.yml` copia `index.html`, `reset-password.html`, `404.html`, `public/` y `src/` y no despliega Edge Functions.


## Actualización de producción del 12 de noviembre de 2026

La función remota se actualizó a **versión 20 ACTIVE** para incorporar la acción `conversations.create`, necesaria para abrir conversaciones privadas desde el botón «Conversar». La versión 20 se desplegó usando la fuente remota exacta de la versión 19 más el cambio puntual. El directorio local incluido en este ZIP no contiene una sincronización byte a byte de todos los módulos remotos; por tanto, no ejecutes `supabase functions deploy messenger-api` desde esta copia. GitHub Pages publica únicamente el frontend. Consulta `docs/ui-polish-conversation-fix.md`.


## Actualización remota del 12 de noviembre de 2026 (versión 21)

La función remota `messenger-api` está ahora en **versión 21 ACTIVE**. El bloque `conversations.create` se corrigió en la fuente remota para evitar `upsert` contra el índice único parcial `conversations_private_pair_uq`: utiliza lectura previa, inserción y recuperación de colisiones `23505`. La lista de sesiones ya existía en la función remota y no requirió cambios de backend.

El archivo `index.ts` local contiene el mismo ajuste puntual como referencia, pero la advertencia anterior sigue vigente: el resto de los módulos locales continúa siendo una instantánea y no debe desplegarse con Supabase CLI.
