# Consideraciones de seguridad

- La identidad y autorización de recursos deben validarse siempre en `messenger-api`.
- El navegador almacena los tokens opacos en `sessionStorage`; no son cookies HttpOnly. Se requiere CSP, prevención de XSS y rotación/revocación del lado servidor.
- Se aplica una CSP en `index.html` limitada al propio origen y a la URL de Supabase configurada.
- El contenido de mensajes se renderiza escapado como texto, nunca como HTML.
- No se incluyen secretos de Supabase en este frontend.
- Las operaciones con privilegios y las validaciones de membresía permanecen en la Edge Function.
- La entrega de recuperación requiere `RESEND_API_KEY`, `MAIL_FROM`, `APP_BASE_URL` configurados en Edge Function Secrets.
- La prueba de autenticación de extremo a extremo de la etapa 4 sigue siendo una condición de aceptación previa al despliegue productivo.
