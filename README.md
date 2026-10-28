# Restia Platform

Repositorio único de la plataforma Restia y sus comercios activos.

## Componentes

- `apps/restia-site/`: sitio institucional de Restia.
- `apps/restia-admin/`: Super Admin.
- `tenants/burger-tin/`: tienda y administración de Burger Tin.
- `tenants/glowro/`: tienda y administración de GlowRo, con su historial Git preservado.
- `backend/`: API compartida, migraciones y pruebas de la base de datos.
- `printer/`: instalador y agente de impresión para Windows.
- `packages/admin-ui/`: estilos visuales compartidos por los paneles.
- `scripts/`: construcción y utilidades de publicación.
- `archive/`: implementaciones históricas fuera del build activo.

La documentación operativa está en [`docs/REPOSITORY.md`](docs/REPOSITORY.md).
El mapa físico y las reglas de ubicación están en [`docs/STRUCTURE.md`](docs/STRUCTURE.md).

## Verificación

```powershell
npm test
npm run build
```

Los despliegues se ejecutan por componente con los scripts `deploy:*`. Hasta que exista un ambiente de QA, no se debe publicar sin revisar el diff, ejecutar las pruebas y generar un backup de la base de datos.
