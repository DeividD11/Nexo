# Corrección de sesiones de dispositivo y panel responsive de detalles

## Etiquetas de dispositivo

- `x-device-label` ahora utiliza caracteres ASCII para evitar conversiones UTF-8/Latin-1 defectuosas en valores de encabezados HTTP.
- Las etiquetas antiguas que contienen la secuencia de reemplazo `Ã¯Â¿Â½` se presentan usando la plataforma inferida del `user_agent` guardado.
- El indicador «Esta sesión» se renderiza como una insignia independiente, no como parte del nombre del dispositivo.

## Panel de detalles del chat

- El panel se comporta como una capa superpuesta y descartable en móvil, tablet y escritorio.
- Incluye un control de cierre explícito, una superficie exterior para cerrar y soporte de la tecla Escape.
- Cerrar los detalles no modifica la conversación activa ni utiliza la navegación «Volver a conversaciones».
- El panel declara `aria-hidden` según su estado de apertura.

## Barra lateral responsive

- Entre 701 y 1180 px se oculta el texto secundario del logotipo y se compactan las acciones superiores para mantener los controles dentro de `sidebar__top`.
- En ventanas de poca altura, el contenedor no fuerza un alto mínimo que provoque desbordamiento vertical.

## Verificación

Las pruebas automatizadas comprueban el saneamiento de etiquetas históricas, el badge de sesión actual, el cierre independiente del panel y las reglas de 768/1024 px.
