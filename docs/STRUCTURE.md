# Estructura del proyecto

La raíz contiene solamente coordinación, configuración de despliegue y los componentes principales.

```text
restia-platform/
├── restia/                         # Producto principal
│   ├── site/                       # Sitio institucional
│   ├── admin/                      # Super Admin
│   └── core/                       # Servicios compartidos
│       ├── api/                    # API, base de datos y pruebas
│       ├── admin-ui/               # Interfaz común de los paneles
│       ├── printing/               # Agente de impresión para Windows
│       └── runtime-config.js       # Conexión pública con la API
├── clients/                        # Implementaciones que dependen de Restia
│   ├── burger-tin/
│   │   ├── site/
│   │   ├── admin/
│   │   └── config/
│   └── glowro/
│       ├── site/
│       └── admin/
├── scripts/                        # Build y tareas operativas
├── docs/                           # Documentación técnica y funcional
└── archive/                        # Código preservado fuera del build
```

## Límites de cada componente

- `restia/` es el producto principal y contiene todos los servicios centrales.
- `clients/` contiene las experiencias particulares que consumen el núcleo de Restia.
- `restia/core/api/` es compartido, pero identifica y aísla cada comercio mediante `store_id`.
- `restia/core/admin-ui/` aporta coherencia a los paneles sin convertir los sitios públicos en una plantilla visual única.
- `archive/` no se importa ni se publica. Sirve solamente para recuperación y comparación.

## Salidas de build

`npm run build` genera `.cloudflare-dist/` con tres paquetes independientes:

- `.cloudflare-dist/restia-site`
- `.cloudflare-dist/restia-admin`
- `.cloudflare-dist/burger-tin`

El build también compone `.cloudflare-dist/glowro` a partir de su sitio y su admin. Ninguna salida generada se versiona.

## Regla para nuevos comercios

Cada comercio nuevo debe vivir en `clients/<slug>/`, con `site/`, `admin/` y, cuando corresponda, `config/`. La API compartida debe resolver siempre el comercio explícitamente y nunca usar el catálogo de otro cliente como valor por defecto.
