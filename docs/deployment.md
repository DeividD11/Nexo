# Despliegue

Consulta la [guía principal de producción](production-deployment.md).

El frontend se publica como archivos estáticos en GitHub Pages y no necesita un servidor Node.js permanente. Supabase aloja PostgreSQL, Storage y la Edge Function `messenger-api`.

La fuente completa de `messenger-api` está incluida en `supabase/functions/messenger-api/`. La versión 19 ACTIVE ya incorpora la corrección CORS para el origen de GitHub Pages predeterminado. La base de datos, no obstante, conserva dos versiones históricas del esquema cuyos scripts SQL originales no están en el repositorio y requiere reconciliar el historial antes de usar `db push` o reconstruir desde cero. Consulta `supabase/migrations/README.md`.

El workflow no instala dependencias ni ejecuta un servidor Node. GitHub Actions utiliza un runner para empaquetar y publicar, pero el sitio servido al usuario final es estático.
