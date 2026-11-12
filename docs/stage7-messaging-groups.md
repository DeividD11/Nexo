# Etapa 7 — Mensajería privada y grupos

**Backend remoto:** `messenger-api` v12 · **Estado del despliegue:** ACTIVE · **Supabase Auth:** no utilizado.

## Arquitectura aplicada

El frontend conserva MVC estricto:

- `MessageController` y `GroupController` coordinan interacciones.
- `AppModel` conserva estado, paginación y sincronización.
- `AppView` y `Modal` representan mensajes, respuestas, reacciones, estados vacíos y administración de grupos.
- `MessageRepository`, `ConversationRepository` y `GroupRepository` llaman al `ApiClient`.
- En el backend, `MessagingService` / `GroupService` contienen reglas de negocio y `MessagingRepository` / `GroupRepository` aíslan consultas SQL y Storage.

Las vistas no ejecutan consultas directas a Supabase. El identificador del usuario no se toma del cuerpo enviado por el cliente: la Edge Function lo obtiene después de validar la sesión opaca personalizada.

## Operaciones de mensajería

- Historial paginado con página máxima de 100 (frontend usa 50).
- Cursores compuestos por fecha e ID para impedir omisiones cuando varios mensajes comparten la misma marca temporal.
- Sincronización incremental por polling mientras el chat está visible; también se consulta el primer lote si el chat estaba vacío.
- Remitente, fecha/hora, contexto de respuesta, estado de edición y lápida visual de eliminación.
- Envío idempotente usando `client_nonce`.
- Validación de que un mensaje de respuesta pertenezca a la misma conversación.
- Edición solo por el autor, durante los primeros 15 minutos y mientras siga siendo miembro.
- Eliminación lógica solo por el autor y miembro activo; el contenido se vacía para todos los participantes y el historial conserva el marcador de eliminación.
- Reacciones añadidas o retiradas por el usuario autenticado.
- Confirmación de entrega/lectura para recibos existentes.

Las operaciones críticas de envío, edición, eliminación y reacciones usan funciones PostgreSQL transaccionales. Los adjuntos siguen el bucket privado y la autorización, aunque la interfaz de esta etapa se centra en texto y fotografías de grupo.

## Operaciones de grupos

- Crear un grupo con nombre, descripción y contactos aceptados (2–50 integrantes, incluido el propietario).
- Cambiar nombre y descripción; cargar, firmar y eliminar fotografía privada del grupo.
- Listar integrantes solo para miembros activos.
- Añadir contactos existentes y retirar participantes.
- Asignar o retirar rol de administrador: exclusivamente el propietario puede hacerlo.
- Propietario y administrador pueden editar información y fotografía; los administradores no pueden retirar a otros administradores ni al propietario.
- Un propietario que sale transfiere la propiedad al administrador más antiguo; si no hay administradores, al integrante más antiguo. Si es el único integrante, el grupo se elimina.
- Quien deja un grupo pierde inmediatamente acceso a sus conversaciones y mensajes a través de la autorización del servidor.

## Funciones SQL instaladas

El archivo `supabase/migrations/20261111010000_stage7_atomic_messaging_and_groups.sql` contiene las definiciones SQL auditables de:

- `send_message_atomic`
- `edit_conversation_message`
- `delete_conversation_message`
- `react_to_conversation_message`
- `create_group_conversation`
- `update_group_details`
- `set_group_avatar`
- `add_group_member`
- `remove_group_member`
- `set_group_member_role`

Todas están definidas como `SECURITY INVOKER`, fijan `search_path` y revocan ejecución a `PUBLIC`, `anon` y `authenticated`; solamente `service_role` puede ejecutarlas. Como la Edge Function usa una clave privilegiada, las funciones siguen verificando membresía, propiedad y rol en cada operación.

**Historial:** los cambios se aplicaron al proyecto remoto mediante SQL y se verificaron. La copia SQL en este repositorio sirve para reproducibilidad. La herramienta usada en esta sesión no añadió esta ejecución al registro de migraciones de Supabase CLI; no debe confundirse con una entrada confirmada en `schema_migrations`.

## Pruebas ejecutadas

### Pruebas reales en PostgreSQL

Un bloque transaccional con cuatro cuentas temporales recorrió los siguientes casos:

1. Inserción de un mensaje privado y comprobación de su persistencia por conversación, remitente y cuerpo.
2. Intento de envío por parte de un no miembro: rechazado.
3. Respuesta a un mensaje de otra conversación: rechazada.
4. Edición por otro usuario: rechazada; edición por el autor: guardada.
5. Reacción de un usuario externo: rechazada; reacción del participante: guardada.
6. Eliminación por otro usuario: rechazada; eliminación por el autor: lápida lógica guardada.
7. Creación de grupo y registro de los integrantes.
8. Intento de un miembro de asignar un administrador: rechazado; asignación por propietario: aceptada.
9. Alta y retirada de participante por administrador: correctas.
10. Envío de mensaje grupal y verificación de persistencia.
11. Salida del propietario, transferencia de propiedad y rechazo de envío por parte del antiguo propietario.
12. Actualización de nombre y descripción por el nuevo propietario.
13. Regresión específica: usuario ajeno y miembro normal intentan actualizar el grupo, cambiar la fotografía, añadir participantes o asignar roles; las cinco operaciones no autorizadas fueron rechazadas. El propietario legítimo pudo actualizar y asignar rol después de esas denegaciones.

Las consultas posteriores comprobaron que no quedan cuentas, conversaciones o mensajes temporales.

### Permisos y asesores

- RLS activo y política de denegación directa para `anon` en las ocho tablas del núcleo.
- Los diez RPC nuevos son ejecutables por `service_role`, pero no por `anon` ni `authenticated`.
- Asesores de seguridad Supabase: sin alertas.
- Asesores de salud Supabase: sin alertas.
- La Edge Function remota está en v12 ACTIVE y `verify_jwt=false` porque autentica sus propios tokens opacos.

### Frontend

Comprobaciones automatizadas con Node: 17/17 correctas. Incluyen renderizado de modales de grupo, controles por rol, lápidas, datos de remitente, cursores, repositorios y sincronización inicial de chats vacíos. Todos los archivos JavaScript pasan `node --check`; `tinycss2` analiza las hojas CSS sin errores.

## Limitaciones pendientes

- No se pudo ejecutar una prueba HTTP de extremo a extremo contra la URL de Supabase desde este entorno: la resolución DNS del host falla (`curl: Could not resolve host`). Por tanto, no se certifica aquí el recorrido navegador → Edge Function → PostgreSQL aunque las funciones estén desplegadas y sus rutinas SQL hayan superado las pruebas directas.
- No se pudo probar desde navegador la carga real de fotografía de grupo ni las acciones de mensajes con una sesión HTTP real.
- Chromium local no terminó de arrancar en este entorno; la validación de interfaz de esta etapa fue por renderizado automatizado, no por una sesión de navegador interactiva.
- Para GitHub Pages, la Edge Function v19 usa CORS sin cookies y ya no requiere configurar `APP_ALLOWED_ORIGINS`. La configuración de correo de recuperación sigue siendo un pendiente heredado de la etapa 4.
- El ZIP incluye los nuevos servicios y repositorios de mensajería y grupos y el SQL. El punto de entrada remoto `index.ts` y los módulos completos de autenticación/cuentas continúan en Supabase; la carpeta local no es una exportación autosuficiente de la Edge Function completa. Antes de redeplegar, descargar/exportar la fuente completa de `messenger-api` v12 y fusionar estos módulos, nunca sustituirla por un punto de entrada parcial.

## Rutas de API incorporadas

- `messages.list`, `messages.send`, `messages.edit`, `messages.delete`, `messages.read`, `messages.react`
- `groups.create`, `groups.update`, `groups.members`, `groups.add-member`, `groups.remove-member`, `groups.set-role`, `groups.avatar.upload`, `groups.avatar.delete`

No se usan datos de conversación ficticios. Los estados vacíos permanecen vacíos hasta que el usuario inicie sesión y el servidor devuelva sus datos reales.
