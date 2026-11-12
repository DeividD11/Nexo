# Arquitectura MVC de Nexo

## Flujo de dependencias

`View → Controller → Model → Repository → ApiClient → Edge Function`

Las vistas reciben estado preparado y generan HTML. Los controladores reciben eventos y coordinan la aplicación. Los modelos representan el estado y entidades del dominio. Los repositorios encapsulan la persistencia remota. Los servicios implementan detalles de infraestructura.

## Límites

- `views/`: renderizado de interfaz y componentes reutilizables; sin consultas ni reglas de negocio.
- `controllers/`: eventos, formularios, navegación y coordinación Model/View.
- `models/entities/`: entidades `User`, `Conversation`, `Message`.
- `models/repositories/`: contrato con las acciones de Edge Functions.
- `models/AppModel.js`: estado de la aplicación y orquestación del dominio.
- `services/`: `ApiClient` y `SessionStore`.
- `config/`: configuración pública no sensible.
- `utils/`: formato, escape HTML, iconos y utilidades puras.

## Navegación

Se utiliza hash routing (`#/app`, `#/login`, `#/register`) para que las rutas funcionen con hosting estático. La aplicación no necesita rewrite del servidor.

## Seguridad del frontend

- Nunca confiar en un `userId` enviado por el cliente como identidad.
- Los mensajes y nombres se escapan antes de ser insertados en plantillas.
- No se insertan imágenes desde rutas arbitrarias; solo URL HTTPS.
- No existe acceso directo a tablas de Supabase desde las vistas.
- La clave publishable es pública por diseño; los secretos administrativos no se incluyen.
