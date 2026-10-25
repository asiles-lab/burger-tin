# Administración y permisos

## Panel del comercio

- URL: `admin.html` (la dirección anterior `panel.html` redirige automáticamente).
- Acepta el token general del local y los tokens individuales creados desde el panel maestro.
- Los módulos visibles dependen de los permisos del perfil.

## Panel maestro

- URL: `platform.html`.
- Usa un token maestro separado (`SUPERADMIN_TOKEN`).
- Permite crear perfiles individuales, asignar permisos y desactivar accesos.
- El token de cada perfil se muestra una sola vez y no se guarda en texto legible.

Permisos disponibles: ver pedidos, gestionar pedidos e impresión, productos, configuración, reportes BI y facturación.

## Alcance actual

Burger Tin es el primer comercio registrado. Los perfiles y permisos ya son reales. El reporte operativo muestra ventas confirmadas, facturación operativa, ticket promedio, envíos y productos más vendidos.

El módulo de facturación todavía no emite comprobantes fiscales: requiere integrar un proveedor compatible con ARCA y completar los datos tributarios. Antes de incorporar otros comercios también hay que aislar catálogo, pedidos, pagos e impresoras por `store_id`.
