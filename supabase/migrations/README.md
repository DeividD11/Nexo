# Inventario de migraciones

Estado consultado contra el proyecto `zyfjffvqcprfcohgdrxx` el 11 de noviembre de 2026.

| Versión | Estado remoto | SQL en este repositorio |
|---|---|---|
| `20261110053559` | Aplicada | Sí — `20261110053559_initial_messenger_web.sql` |
| `20261110054109` | Aplicada | Sí — `20261110054109_security_and_foreign_key_indexes.sql` |
| `20261110062234` | Aplicada | **No** — `lock_direct_data_api_access` debe recuperarse del respaldo original |
| `20261110225842` | Aplicada | **No** — `auth_refresh_rotation_and_atomic_password_reset` debe recuperarse del respaldo original |
| `20261111005001` | Aplicada | Sí |
| `20261111005059` | Aplicada | Sí |
| `20261111010000` | Objetos SQL confirmados; versión no registrada en historial remoto | Sí — Stage 7 |
| `20261111020000` | Índices/columnas confirmados; versión no registrada en historial remoto | Sí — Stage 9 |

No inventes los dos scripts ausentes. Para restaurar el historial, recupera los archivos originales o prepara un esquema base desde un respaldo y revisa los resultados antes de usar `supabase migration repair`. Las versiones Stage 7 y 9 solo deben marcarse como aplicadas después de volver a comprobar el SQL real en la base de datos remota.

No ejecutes `supabase db reset` ni un `db push` sin revisar `supabase migration list --remote=...` y `supabase db push --remote=... --dry-run`.
