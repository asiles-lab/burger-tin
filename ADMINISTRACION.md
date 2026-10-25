# Administración y permisos

## Panel del comercio

- URL de producción: `https://burger-tin.restia.net.ar/admin/`.
- El menú público funciona en `https://burger-tin.restia.net.ar/`.
- GitHub conserva el código y puede mantener una copia de respaldo, pero no es el alojamiento principal.
- Cada persona ingresa con su usuario y contraseña.
- Los módulos visibles dependen de los permisos del perfil.
- No existe un enlace desde el menú público hacia este panel.

## Panel maestro

- URL de producción: `https://admin.restia.net.ar/`.
- El primer Super Admin se inicializa una sola vez con el secreto técnico `SUPERADMIN_TOKEN`.
- Después, el acceso normal también usa usuario y contraseña.
- Permite crear, editar y eliminar perfiles individuales, asignar permisos, restablecer contraseñas y desactivar accesos.

## Protección de contraseñas y costo

Para conservar el plan gratuito de Cloudflare Workers, el cálculo PBKDF2-SHA-256 de 120.000 iteraciones se realiza en el navegador. La contraseña nunca se envía al servidor. El backend guarda únicamente un verificador protegido además con HMAC-SHA-256 y una clave privada de Cloudflare (`SETTINGS_ENCRYPTION_KEY`). Las sesiones duran 12 horas y se almacenan con hash; cinco intentos fallidos bloquean temporalmente el usuario.

Las contraseñas no están guardadas en archivos locales ni pueden consultarse desde el panel. En Cloudflare D1 solo se almacena el verificador irreversible. Si alguien pierde su clave, un Super Admin debe usar **Restablecer clave** y entregar una contraseña temporal; el usuario tendrá que reemplazarla en el siguiente ingreso. El navegador conserva únicamente la sesión activa en `sessionStorage`, que se elimina al cerrar sesión.

Por seguridad, un Super Admin no puede eliminar ni desactivar su propio usuario. Tampoco se permite borrar el último Super Admin activo.

Esta implementación no requiere contratar hosting, base de datos ni autenticación. Sigue dentro de GitHub Pages, Cloudflare Workers y D1 gratuitos, sujeto a sus límites de uso.

## Marca y dominio

Los paneles usan la identidad Restia y el lema “Tecnología para crecer”. `restia.net.ar` está delegado a Cloudflare mediante `dale.ns.cloudflare.com` y `meadow.ns.cloudflare.com`. El sitio público y el Super Admin se despliegan como Workers con recursos estáticos separados.

Para publicar una nueva versión:

1. Ejecutar `node scripts/build-cloudflare-pages.mjs`.
2. Desplegar el comercio con `wrangler deploy -c wrangler.burger-tin.jsonc`.
3. Desplegar el Super Admin con `wrangler deploy -c wrangler.restia-admin.jsonc`.

Permisos disponibles: ver pedidos, gestionar pedidos e impresión, productos, configuración, reportes BI y facturación.

## Alcance actual

Burger Tin es el primer comercio registrado. Los perfiles y permisos ya son reales. El reporte operativo muestra ventas confirmadas, facturación operativa, ticket promedio, envíos y productos más vendidos.

El módulo de facturación todavía no emite comprobantes fiscales: requiere integrar un proveedor compatible con ARCA y completar los datos tributarios. Antes de incorporar otros comercios también hay que aislar catálogo, pedidos, pagos e impresoras por `store_id`.
