# Corrección del error de acceso a Supabase

## Diagnóstico

Los registros de Supabase mostraron que incluso después de la versión 18 seguían llegando peticiones `OPTIONS` con HTTP 403. La versión 18 permitía únicamente una lista de orígenes; el navegador usado para abrir Nexo tenía un origen distinto del que esa lista admitía (los logs de Edge no exponen el valor `Origin`). El navegador ocultaba el cuerpo del 403 y `fetch()` terminaba como error de red.

## Corrección aplicada

La versión 19 de `messenger-api` utiliza CORS público (`Access-Control-Allow-Origin: *`) sin `Access-Control-Allow-Credentials`. Esta decisión es compatible con el modelo de Nexo: no se utilizan cookies de sesión ni credenciales automáticas. Cada acción privada sigue exigiendo un token opaco explícito en `Authorization: Bearer` y validación de sesión y permisos en servidor. El preflight `OPTIONS` responde 204 antes de procesar el cuerpo o comprobar la sesión.

No es necesario configurar `APP_ALLOWED_ORIGINS` para llamadas del navegador. No se habilitaron cookies CORS ni se expuso una clave administrativa. La `sb_publishable_` del cliente sigue siendo pública por diseño.

## Verificación desde el navegador

1. Publica el frontend actualizado en GitHub Pages o sírvelo por HTTP local: `python -m http.server 5500`. No abras `index.html` mediante `file://`.
2. Haz una recarga completa con `Ctrl + F5`.
3. En DevTools → Network, busca `/functions/v1/messenger-api`. La petición `OPTIONS` debe devolver 204 y `Access-Control-Allow-Origin: *`.
4. Después debe aparecer `POST`. Un 401/400 del backend ya no es CORS: revisa el JSON para identificar sesión, parámetros o permisos.
5. Si no aparece siquiera `OPTIONS`, revisa DNS, TLS, bloqueadores, antivirus o la URL pública del proyecto.

La versión 19 está confirmada como ACTIVE en Supabase. La petición HTTP desde este contenedor no se pudo repetir porque el DNS del proyecto no resuelve en este entorno; la comprobación final debe hacerse desde el navegador del sitio.
