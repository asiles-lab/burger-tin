# Restia Platform

Repositorio único de la plataforma Restia y sus comercios activos.

## Jerarquía

- `restia/site/`: sitio institucional de Restia.
- `restia/admin/`: administración central de Restia.
- `restia/core/`: núcleo compartido del que dependen los clientes:
  - `api/`: API, base de datos, migraciones y pruebas.
  - `admin-ui/`: interfaz administrativa compartida.
  - `printing/`: instalador y agente de impresión para Windows.
- `clients/burger-tin/`: sitio, admin y configuración de Burger Tin.
- `clients/glowro/`: sitio y admin de GlowRo, con su historial Git preservado.
- `scripts/`: construcción y utilidades de publicación.
- `archive/`: implementaciones históricas fuera del build activo.

La documentación operativa está en [`docs/REPOSITORY.md`](docs/REPOSITORY.md).
El mapa físico y las reglas de ubicación están en [`docs/STRUCTURE.md`](docs/STRUCTURE.md).
El ambiente de pruebas independiente está documentado en [`docs/QA.md`](docs/QA.md).

## Verificación

```powershell
npm test
npm run build
```

Los despliegues se ejecutan por componente con los scripts `deploy:*`. Hasta que exista un ambiente de QA, no se debe publicar sin revisar el diff, ejecutar las pruebas y generar un backup de la base de datos.
