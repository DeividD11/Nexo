# Etapa 5 — Registro de validación

Fecha de trabajo: 10–11 de noviembre de 2026.

## Comprobaciones satisfactorias

- Sintaxis de los 22 módulos JavaScript mediante `node --check`.
- Análisis de sintaxis de las seis hojas CSS mediante PostCSS.
- Auditoría de rutas relativas de imports, scripts, estilos e icono: sin dependencias faltantes.
- Renderizado de la interfaz principal en Chromium mediante un arnés de prueba aislado: sin excepciones JavaScript.
- Layout comprobado a 1440×960, 1024×768, 768×900, 700×900, 390×844 y 320×720: sin desbordamiento horizontal.
- Vista móvil con cambio de lista a conversación y panel lateral de información.
- Modal de inicio de sesión y cierre con Escape.
- Cambio de tema claro/oscuro.
- Pantalla de restablecimiento: comprobación de contraseñas distintas y de transición visual de éxito con una respuesta HTTP simulada.
- Archivo ZIP: integridad de la estructura comprobada.

## Límites de la validación

- El arnés del navegador aisló el módulo frontend para el renderizado y las interacciones; no equivale a desplegar el sitio en GitHub Pages.
- La prueba de restablecimiento utilizó una respuesta de API simulada. No consumió un token real ni modificó contraseñas.
- No se inició sesión con una cuenta real ni se enviaron mensajes a usuarios reales.
- La prueba HTTP integral de autenticación de la etapa 4 sigue pendiente. El dominio de GitHub Pages, CORS y el proveedor de correo deben configurarse y comprobarse antes del uso productivo.
