# Etapa 9 — Archivos, notificaciones y funciones complementarias

## Estado de implementación

- Edge Function `messenger-api`: versión **17**, estado `ACTIVE`.
- Autenticación: tokens opacos propios; Supabase Auth no se utiliza.
- Frontend: módulos MVC para adjuntos, notificaciones, búsqueda, preferencias y dispositivos.
- Pruebas frontend: `node --experimental-default-type=module --test tests/*.test.mjs` — **30/30 aprobadas**.
- Sintaxis: `node --check` en modelos, controladores, vistas, bootstrap y cliente HTTP — aprobada.
- Pruebas SQL aisladas con dos cuentas temporales: aprobadas; los registros temporales se eliminaron.
- Asesores Supabase de seguridad y salud: sin alertas.

## Archivos

Bucket existente: `messenger-private`.

- Público: `false`.
- Tamaño máximo: 10 MiB.
- Tipos admitidos: JPEG, PNG, WEBP, GIF, PDF, TXT, DOC, DOCX, XLS, XLSX, PPT, PPTX y ZIP.
- Las extensiones se comparan con MIME y el backend valida la firma del archivo.
- Los nombres se normalizan para eliminar separadores de ruta y caracteres de control.
- Los objetos se suben con una ruta aleatoria bajo la conversación y el usuario que los cargó.
- No hay URL pública de Storage.

### Reglas de acceso a archivos

1. La carga exige una sesión válida y que el usuario sea miembro activo de la conversación.
2. Cada objeto se registra en `message_attachments`.
3. El endpoint de URL firmada valida el UUID del adjunto, la membresía, la ruta guardada, y que el mensaje padre exista y no esté eliminado.
4. Un adjunto todavía no vinculado a un mensaje solo lo puede previsualizar o descargar su uploader.
5. Las URLs firmadas duran 120 segundos.
6. Las imágenes se pueden previsualizar; los demás formatos se entregan como descarga.
7. La eliminación exige uploader y membresía. Si está unido a un mensaje, exige que el usuario sea el remitente del mensaje.
8. Primero se marca el adjunto como eliminado (bloqueando futuras firmas); después se elimina el objeto de Storage. Si falla la eliminación física, queda `FILE_CLEANUP_PENDING` para reintentar.

El cliente envía solamente el identificador del adjunto al pedir una URL. No elige `object_path`, bucket ni nombre de objeto. Alterar un UUID no concede acceso porque la autorización se realiza en el servidor.

## Endpoints incorporados o endurecidos

| Acción | Descripción |
|---|---|
| `files.upload` | Multipart, validación de tamaño/MIME/extensión/firma y registro metadata |
| `files.url` | Firma temporal después de verificar acceso al recurso |
| `files.delete` | Tombstone y eliminación física autorizada |
| `notifications.list` | Últimas 60 notificaciones del usuario y contador no leído |
| `notifications.read` | Marca una notificación propia como leída |
| `notifications.read-all` | Marca como leídas todas las notificaciones propias |
| `settings.get` | Preferencias propias |
| `settings.update` | Actualiza tema y preferencias sin aceptar user ID del cliente |
| `conversations.search` | Busca títulos, descripciones e integrantes de las conversaciones propias |
| `search.messages` | Busca mensajes no eliminados solo dentro de conversaciones activas del usuario |
| `devices.list` | Sesiones no revocadas y no expiradas, con etiqueta de dispositivo |
| `devices.revoke` | Revoca una sesión perteneciente al usuario |
| `devices.revoke-others` | Revoca las demás sesiones de la cuenta |

## Preferencias

La tabla `user_settings` conserva el tema y las preferencias anteriores; se añadieron:

- `in_app_notifications` (por defecto `true`).
- `sound_notifications` (por defecto `false`).

La aplicación también respeta `desktop_notifications` y `message_previews`.

Las notificaciones de escritorio utilizan la Notification API del navegador. Solo se muestran mientras la aplicación está abierta y el navegador permite notificaciones; no se ha implementado Web Push para entregar notificaciones con el sitio cerrado.

## MVC

- Repositories: `FileRepository`, `NotificationRepository`, `SettingsRepository`, `SearchRepository`.
- Controllers: `AttachmentController`, `NotificationController`, `SettingsController`, `SearchController`.
- Model: `AppModel` centraliza estado, preferencias, sesiones y resultados.
- View: `AppView` y `Modal` presentan adjuntos, vista previa, bandeja, búsqueda y preferencias.
- `ApiClient` transporta el token opaco y una etiqueta informativa de dispositivo; nunca incluye secretos administrativos.

Las vistas no ejecutan consultas a Supabase. Los repositorios no manipulan el DOM.

## Cambios de base de datos

El SQL correspondiente está en `supabase/migrations/20261111020000_stage9_files_notifications_settings.sql` y ya fue ejecutado en el proyecto:

- Columnas `in_app_notifications` y `sound_notifications`.
- Índice parcial de notificaciones no leídas por usuario.
- Índice parcial de adjuntos activos por conversación.

La tabla `message_attachments` y el bucket privado ya existían; no se recrearon.

## Verificaciones realizadas

### Frontend

```bash
node --experimental-default-type=module --test tests/*.test.mjs
```

Resultado: 30 pruebas aprobadas, 0 fallos.

También se ejecutó `node --check` en los módulos principales del frontend.

### PostgreSQL y Supabase

- Dos cuentas temporales: notificaciones aisladas por `user_id`.
- Preferencias `dark` y `light`: se guardan de forma independiente.
- Marcar las notificaciones de A como leídas no modificó las de B.
- Revocar la sesión de A no revocó la sesión de B.
- Se verificó que los registros temporales no permanecieron.
- `messenger-private.public = false`; límite `10485760` bytes.
- No existen políticas de `storage.objects` para `anon` ni `authenticated`.
- `message_attachments`, `notifications`, `user_settings`, `user_sessions` y `user_devices` conservan RLS y la política `deny_direct_api_*` para acceso directo.
- Asesores Supabase de seguridad y salud: sin alertas.

## Límites pendientes

- No se completó una prueba HTTP real desde dos navegadores porque, en este entorno, la resolución DNS del host del proyecto no estuvo disponible en intentos anteriores. Por ello, carga de archivo en HTTP, emisión de URL firmada, descarga real, permisos de sesión y notificaciones de navegador no se declaran verificados end-to-end.
- No se ejecutó una prueba del sitio publicado en GitHub Pages en esa etapa. La versión 19 ya no requiere `APP_ALLOWED_ORIGINS` para CORS.
- No se añadió Web Push ni un servicio de notificación cuando la pestaña está cerrada.
- Los archivos pendientes que el usuario sube pero no envía pueden requerir limpieza si el navegador se cierra abruptamente; el frontend los elimina al retirarlos o cambiar de conversación, pero no se configuró un recolector programado de objetos abandonados.

## Fuente backend

La Edge Function remota `messenger-api` v17 permanece desplegada y activa. El repositorio local conserva módulos nuevos de frontend, SQL y documentación; no contiene el `index.ts` completo de producción ni todos los módulos históricos de autenticación/cuentas. No redeplegar desde una copia parcial. Recuperar primero la fuente completa de la función remota y combinarla con estos cambios.
