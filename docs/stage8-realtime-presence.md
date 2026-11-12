# Etapa 8 — Tiempo real, presencia y estados

## Transporte elegido

Nexo mantiene autenticación propia con tokens de sesión opacos. No se ha configurado un emisor OIDC/JWT compatible con Supabase para estos tokens y, por tanto, no se envían a Supabase Realtime ni se habilitan canales privados basados en `auth.uid()` para la identidad de Nexo. Tampoco se abre un canal público para notificar mensajes privados.

La solución desplegada es sincronización periódica autenticada por `messenger-api` (Edge Function). Cada solicitud lleva el token de sesión opaco en `Authorization: Bearer`; la función lo valida y obtiene el usuario de la sesión en servidor. Cada operación sobre conversación vuelve a comprobar la membresía activa.

## Frecuencias

- Mensajes e historial reciente: cada 4,5 segundos en la conversación abierta.
- Presencia y escritura: cada 4,5 segundos para los participantes de la conversación abierta.
- Resúmenes, previsualizaciones y contadores: cada 13,5 segundos.
- Heartbeat: cada 25 segundos.
- Escritura: ping limitado a un máximo aproximado cada 1,8 segundos mientras se escribe; expira a los 8 segundos y se limpia al detener la escritura o cambiar de conversación.
- Al recuperar conectividad o volver a la pestaña: sincronización inmediata.
- En pestañas ocultas se reduce la actividad; al volver a primer plano se fuerza una sincronización.

## Estados

- **Enviado:** el servidor confirmó la persistencia del mensaje.
- **Entregado:** al menos el endpoint autenticado del destinatario cargó el mensaje y el backend marcó `delivered_at`.
- **Leído:** el destinatario abrió la conversación y el backend marcó `read_at`.
- En grupos se muestra el conteo de participantes con entrega o lectura registrada.
- En mensajes propios se refrescan recibos aunque el mensaje ya existiera localmente.

La entrega no significa que el dispositivo haya mostrado una notificación del sistema operativo; significa que una sesión autenticada obtuvo el mensaje desde el backend.

## Presencia y privacidad

`presence.ping` solo actualiza la identidad obtenida de la sesión. `presence.conversation` exige membresía activa y devuelve exclusivamente los otros integrantes actuales. La última conexión se oculta si `show_last_seen` está desactivado; el estado en línea y escritura se ocultan si `show_online_status` está desactivado. Los endpoints tienen límites de frecuencia.

## Recuperación y duplicados

- Se evita solapar ciclos de sincronización.
- Los mensajes se fusionan por ID, no por posición ni por evento.
- Se actualizan recibos, ediciones y tombstones en los mensajes recientes.
- Tras una desconexión se drenan páginas incrementales con cursores fecha + ID para recuperar el backlog.
- Si se agota el límite de páginas por ciclo, el cursor no salta al final de la ventana reciente: el siguiente ciclo continúa desde el último lote recuperado.
- Los errores de red cambian el indicador a reconectando/sin conexión; los ciclos siguientes reintentan.

## Archivos frontend añadidos/modificados

- `src/models/repositories/PresenceRepository.js`
- `src/controllers/RealtimeSyncController.js`
- `src/models/AppModel.js`
- `src/controllers/AppController.js`
- `src/app/bootstrap.js`
- `src/views/AppView.js`
- `src/styles/components.css`
- `tests/stage8-realtime.test.mjs`

## Backend desplegado

Edge Function `messenger-api`, versión 14, estado `ACTIVE`.

Acciones: `presence.ping` y `presence.conversation`. Las dos requieren sesión personalizada; la consulta de presencia exige membresía y está limitada por usuario. No se añadió una política amplia a `realtime.messages` ni se publicaron canales privados sin JWT compatible.

## Validación realizada

- Suite Node: 22 pruebas, 22 aprobadas.
- Prueba SQL transaccional con dos usuarios de prueba, dos sesiones etiquetadas como portátil y teléfono, una conversación privada, persistencia de mensaje, recibo pendiente, entrega, lectura, presencia, escritura, preferencias de privacidad y rechazo de un actor externo.
- Consulta de limpieza posterior: cero usuarios, conversaciones, sesiones y mensajes temporales restantes.
- Supabase Security Advisors: sin alertas (`lints: []`).

## Límite de certificación

La prueba SQL simula las operaciones de dos sesiones/dispositivos en PostgreSQL; no equivale a dos navegadores autenticados ejecutando solicitudes HTTP simultáneas. En esta sesión no se pudo certificar el recorrido HTTP real ni una prueba manual interactiva completa de dos dispositivos. La etapa requiere esa prueba final en dos navegadores/dispositivos con cuentas reales antes de considerarse completamente certificada.
