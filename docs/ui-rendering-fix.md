# Corrección de renderizado visual y modales

## Síntomas atendidos

- Las ventanas `modal-card` volvían a ejecutar su animación cuando cambiaba cualquier dato de la aplicación.
- Los mensajes globales de error podían quedar por debajo de la capa oscura del modal.
- Los avisos `toast` no distinguían claramente entre éxito, error, información y advertencia.
- Algunas cargas asíncronas devolvían el foco al primer control del modal después de actualizar los datos.

## Cambios

- `AppView` conserva el nodo del modal y el nodo del shell principal cuando actualiza el resto de la interfaz.
- El cuerpo del modal se actualiza únicamente cuando cambian los datos que ese modal presenta; las actualizaciones de conexión, presencia o sincronización no reinician su animación.
- Los errores del formulario se mantienen fuera de la región dinámica del cuerpo, para que una actualización independiente no los elimine.
- El foco y la posición de desplazamiento del modal se conservan cuando cambia su contenido.
- Se eliminaron llamadas de enfoque redundantes al terminar algunas cargas asíncronas.
- Los avisos tienen fondos opacos y colores específicos por tipo. El error global queda por encima de la capa de oscurecimiento cuando hay un modal abierto.

## Validación

Las pruebas automatizadas de esta versión cubren la identidad de los modales, la estabilidad de su firma de contenido frente a cambios de sincronización no relacionados, la actualización de contenido cuando cambian sus datos y la opacidad/jerarquía visual de los avisos.
