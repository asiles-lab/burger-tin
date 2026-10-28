# Restia Platform

Repositorio único de la plataforma Restia y sus comercios activos.

## Componentes

- `restia-site/`: sitio institucional de Restia.
- `platform.html` y `platform-*.mjs`: Super Admin.
- raíz web: tienda y administración de Burger Tin.
- `tenants/glowro/`: tienda y administración de GlowRo, con su historial Git preservado.
- `backend/`: API compartida, migraciones y pruebas de la base de datos.
- `printer/`: instalador y agente de impresión para Windows.
- `scripts/`: construcción y utilidades de publicación.

La documentación operativa está en [`docs/REPOSITORY.md`](docs/REPOSITORY.md).

## Verificación

```powershell
npm test
npm run build
```

Los despliegues se ejecutan por componente con los scripts `deploy:*`. Hasta que exista un ambiente de QA, no se debe publicar sin revisar el diff, ejecutar las pruebas y generar un backup de la base de datos.
