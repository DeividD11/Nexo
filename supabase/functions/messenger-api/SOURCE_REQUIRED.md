# Fuente requerida antes de desplegar

Esta carpeta es intencionalmente incompleta. El proyecto remoto tiene `messenger-api` versión 17 ACTIVE, pero este ZIP no contiene `index.ts` ni los módulos `auth`, `files`, `notifications`, `settings` y `search`.

No ejecutes `supabase functions deploy messenger-api` desde este directorio. Recupera primero la fuente exacta:

```bash
supabase login
supabase link --project-ref zyfjffvqcprfcohgdrxx
supabase functions download messenger-api --remote=zyfjffvqcprfcohgdrxx --use-api
```

Verifica el inventario de archivos y el diff. La matriz de auditoría se encuentra en `../../../docs/final-audit-stage12.md`.
