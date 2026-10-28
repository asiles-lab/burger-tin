# Estructura del proyecto

La raíz contiene solamente coordinación, configuración de despliegue y los componentes principales.

```text
restia-glowro-commerce/
├── apps/
│   ├── restia-admin/       # Super Admin de Restia
│   └── restia-site/        # Sitio institucional
├── backend/                # API, base de datos, migraciones y pruebas
├── packages/
│   └── admin-ui/           # Estilos compartidos por los paneles
├── tenants/
│   ├── burger-tin/         # Sitio y administración de Burger Tin
│   └── glowro/             # Sitio y administración de GlowRo
├── printer/                # Instalador y agente de impresión para Windows
├── scripts/                # Build y tareas operativas
├── docs/                   # Documentación técnica y funcional
└── archive/                # Código preservado que no participa del build
```

## Límites de cada componente

- `apps/` pertenece a Restia como producto y marca.
- `tenants/` contiene las experiencias particulares de cada comercio.
- `backend/` es compartido, pero identifica y aísla cada comercio mediante `store_id`.
- `packages/` contiene recursos reutilizables sin convertir los sitios de los clientes en una plantilla visual única.
- `archive/` no se importa ni se publica. Sirve solamente para recuperación y comparación.

## Salidas de build

`npm run build` genera `.cloudflare-dist/` con tres paquetes independientes:

- `.cloudflare-dist/restia-site`
- `.cloudflare-dist/restia-admin`
- `.cloudflare-dist/burger-tin`

GlowRo conserva su salida en `tenants/glowro/dist/`. Ninguna salida generada se versiona.

## Regla para nuevos comercios

Cada comercio nuevo debe vivir en `tenants/<slug>/`. Sus recursos visuales, catálogo y administración deben permanecer dentro de esa carpeta. La API compartida debe resolver siempre el comercio explícitamente y nunca usar el catálogo de otro cliente como valor por defecto.
