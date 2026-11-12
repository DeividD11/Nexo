# Etapa 6 — Usuarios, perfiles y contactos

## Estado del despliegue

- Proyecto Supabase: `zyfjffvqcprfcohgdrxx`.
- Edge Function: `messenger-api`, versión desplegada 10.
- Autenticación: personalizada con tokens opacos; no utiliza Supabase Auth.
- Acceso a datos: Edge Function con consultas privilegiadas y autorización explícita por ID de sesión/usuario y recurso.
- RLS: las políticas que bloquean el acceso directo de `anon` y `authenticated` se mantienen activas.

## Endpoints incorporados o endurecidos

| Acción | Uso | Autorización aplicada |
|---|---|---|
| `profile.get` | Leer el perfil propio | Sesión activa; el ID procede del servidor |
| `profile.update` | Cambiar nombre visible, usuario y biografía | RPC transaccional, ID de sesión |
| `profile.avatar.upload` | Cargar fotografía | Sesión activa, imagen permitida, firma de archivo y límite de 5 MB |
| `profile.avatar.delete` | Eliminar fotografía propia | Ruta limitada a `avatars/<user-id>/` |
| `users.search` | Buscar por usuario o nombre visible | Sesión y rate limit; no busca ni devuelve correos |
| `contacts.list` | Contactos y solicitudes propias | Filtrado en servidor por usuario autenticado |
| `contacts.request` | Enviar solicitud | RPC transaccional, comprobación de bloqueos y duplicados |
| `contacts.respond` | Aceptar/rechazar | RPC bloqueado al receptor real de la solicitud |
| `contacts.cancel` | Cancelar solicitud enviada | Filtro simultáneo por solicitud, remitente y estado pendiente |
| `contacts.remove` | Eliminar contacto | RPC con el usuario autenticado y pareja normalizada |
| `users.block` | Bloquear/desbloquear | RPC con bloqueo unilateral del usuario autenticado |
| `users.blocks.list` | Listar bloqueados | Filtro por `blocker_id` derivado de la sesión |

## Perfil y fotografías

El perfil permite modificar:

- Nombre visible: 2–80 caracteres.
- Nombre de usuario: 3–24 caracteres, minúsculas, números, punto y guion bajo.
- Biografía: máximo 300 caracteres.
- Fotografía: JPEG, PNG, WEBP o GIF, máximo 5 MB.

Las fotografías se guardan en el bucket privado `messenger-private`, bajo `avatars/<user-id>/...`. Se generan URLs firmadas de una hora. El navegador nunca recibe la clave administrativa ni una ruta que autorice a escribir fotografías ajenas. Al sustituir una fotografía, el backend actualiza primero la referencia del perfil y elimina después el archivo anterior de esa misma cuenta.

El correo electrónico se presenta como dato de solo lectura en la pantalla de perfil; no se permite cambiarlo desde esta etapa.

## Contactos y privacidad

- La búsqueda devuelve nombre de usuario, nombre visible, biografía, estado visible y URL temporal de avatar. No devuelve email.
- La lista de contactos, solicitudes recibidas/enviadas y bloqueados se obtiene desde el servidor usando el usuario de la sesión.
- El servidor no confía en un `userId` enviado por el cliente para identificar al llamante. Los IDs destino se usan únicamente como recurso solicitado y se validan frente a la identidad autenticada.
- Aceptar/rechazar solicitudes, crear solicitudes, bloquear/desbloquear y eliminar contactos se ejecutan mediante funciones PostgreSQL transaccionales.
- Bloquear cancela solicitudes pendientes y elimina la relación de contacto, sin borrar el historial de conversaciones.
- Los roles `anon` y `authenticated` no tienen EXECUTE en los RPC nuevos; solo `service_role` puede invocarlos desde el backend.

## Seguridad y limitaciones deliberadas

- No se ha introducido Supabase Auth ni JWT personalizados.
- Las sesiones continúan con tokens opacos y hashes en `user_sessions`.
- El frontend mantiene los tokens en `sessionStorage`, no en `localStorage`; esto reduce la persistencia accidental, pero el token sigue siendo accesible a JavaScript de la página. La CSP y el escape de texto mitigan el riesgo XSS; para cookies HttpOnly haría falta un origen backend/proxy propio que pueda establecerlas en el dominio de la aplicación.
- Las URLs firmadas de avatar son credenciales temporales de lectura y expiran; se renuevan al volver a consultar el perfil, contactos o búsqueda.
- El rate limit se aplica a búsqueda, solicitudes, edición de perfil, cargas de avatar, respuestas, eliminación de contactos y bloqueos.

## Migraciones aplicadas

1. `20261111005001_secure_profile_contact_operations`
   - Índice único parcial para evitar solicitudes pendientes duplicadas entre una pareja.
   - RPC transaccionales para crear/responder solicitudes, bloquear y eliminar contactos.
   - Permisos EXECUTE restringidos a `service_role`.
2. `20261111005059_atomic_profile_updates`
   - RPC transaccional para actualizar usuario y perfil en una sola operación.
   - Permisos EXECUTE restringidos a `service_role`.

Los scripts reproducibles se encuentran en `supabase/migrations/`.

## Pruebas ejecutadas

### PostgreSQL/Supabase

- Se recorrió el flujo de crear solicitud pendiente.
- Se comprobó que un tercero no puede responder una solicitud dirigida a otro usuario.
- Se aceptó una solicitud por el receptor correcto y se comprobó la creación del contacto.
- Se eliminó el contacto.
- Se rechazó otra solicitud.
- Se bloqueó una cuenta, comprobando la cancelación de una solicitud pendiente.
- Se comprobó que una nueva solicitud falla mientras existe el bloqueo.
- Se desbloqueó la cuenta.
- Se actualizó nombre de usuario, nombre visible y biografía mediante el RPC.
- Se comprobó que las filas de prueba fueron eliminadas.
- Se verificaron los privilegios: `service_role` puede ejecutar los RPC; `anon`/`authenticated` no.
- Los asesores de seguridad de Supabase no devolvieron alertas.

### Frontend

Ejecutar:

```bash
node --experimental-default-type=module --test tests/stage6-accounts.test.mjs
```

Pruebas incluidas:

- Renderizado del formulario de perfil y email de solo lectura.
- Renderizado de aceptar/rechazar/cancelar/desbloquear.
- Mapeo de acciones desde repositorios.
- Carga multipart con token Bearer y `Content-Type` administrado por el navegador.
- Renderizado de puntos de entrada para perfil/contactos sin conversaciones inventadas.

También se verificó la sintaxis de todos los módulos JavaScript y la resolución de imports relativos.

## Pruebas pendientes

No fue posible ejecutar las solicitudes HTTP contra `https://zyfjffvqcprfcohgdrxx.supabase.co` desde el entorno de esta sesión: la resolución DNS del host falló. Por ese motivo siguen pendientes las pruebas de extremo a extremo para registro, login, actualización de perfil y gestión de contactos a través del endpoint público, así como la carga real de fotografías desde el navegador. Las pruebas PostgreSQL no sustituyen esas pruebas HTTP.

La versión 19 de la Edge Function usa CORS sin cookies y no requiere configurar `APP_ALLOWED_ORIGINS`. No añadas claves secretas al frontend.
