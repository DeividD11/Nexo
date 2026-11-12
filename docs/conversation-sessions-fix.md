# Corrección de conversaciones privadas y sesiones de dispositivos

## Creación de conversaciones privadas

El índice de `conversations.private_pair_key` en producción es único y parcial (`WHERE private_pair_key IS NOT NULL`). La versión anterior usaba `upsert(..., { onConflict: "private_pair_key" })`, que PostgREST traducía a un `ON CONFLICT` que no podía inferir ese índice; los registros del proyecto muestran `POST 400` contra `/rest/v1/conversations?on_conflict=private_pair_key`.

La acción `conversations.create` ahora:

1. Valida cuenta activa, contacto aceptado y bloqueos.
2. Busca la conversación privada por clave de pareja.
3. Inserta solo si no existe.
4. Si dos dispositivos la crean a la vez, detecta `23505` y recupera la fila que ganó la carrera.
5. Asegura la membresía de ambos participantes con la clave primaria compuesta completa `conversation_id,user_id`.

No requiere cambios destructivos ni migraciones de esquema.

## Listado de dispositivos y sesiones

`AuthRepository` tenía una colisión de nombres: `this.sessions` almacenaba el `SessionStore` y ocultaba el método `sessions()`. Se renombró la propiedad a `sessionStore`, permitiendo que `AppModel.loadDeviceSessions()` llame a `devices.list`.

La pantalla ahora muestra un error explícito y un botón Reintentar si el servidor no puede consultar las sesiones, en lugar de confundir un error de carga con una lista legítimamente vacía. La respuesta mantiene el indicador `current` para que la sesión actual no se pueda cerrar accidentalmente desde esa misma fila.

## Estado verificado en producción antes del arreglo

- La base de datos ya tenía sesiones activas y no revocadas para la cuenta. No era un problema de que la tabla estuviera vacía.
- Los registros del proyecto mostraban `POST 400` en el `upsert` de la conversación privada.
- La función activa se actualiza a una nueva versión con la corrección de creación de conversaciones.

## Despliegue

El frontend se publica desde GitHub Pages. La Edge Function `messenger-api` se despliega directamente desde la fuente remota vigente para evitar sustituir sus módulos más recientes con una copia local incompleta.
