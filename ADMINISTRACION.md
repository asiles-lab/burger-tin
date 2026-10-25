# Administración y permisos

## Panel del comercio

- URL: `admin.html` (la dirección anterior `panel.html` redirige automáticamente).
- Cada persona ingresa con su usuario y contraseña.
- Los módulos visibles dependen de los permisos del perfil.
- No existe un enlace desde el menú público hacia este panel.

## Panel maestro

- URL: `platform.html`.
- El primer Super Admin se inicializa una sola vez con el secreto técnico `SUPERADMIN_TOKEN`.
- Después, el acceso normal también usa usuario y contraseña.
- Permite crear perfiles individuales, asignar permisos, restablecer contraseñas y desactivar accesos.

## Protección de contraseñas y costo

Para conservar el plan gratuito de Cloudflare Workers, el cálculo PBKDF2-SHA-256 de 120.000 iteraciones se realiza en el navegador. La contraseña nunca se envía al servidor. El backend guarda únicamente un verificador protegido además con HMAC-SHA-256 y una clave privada de Cloudflare (`SETTINGS_ENCRYPTION_KEY`). Las sesiones duran 12 horas y se almacenan con hash; cinco intentos fallidos bloquean temporalmente el usuario.

Esta implementación no requiere contratar hosting, base de datos ni autenticación. Sigue dentro de GitHub Pages, Cloudflare Workers y D1 gratuitos, sujeto a sus límites de uso.

## Marca y dominio

Los paneles usan la identidad Restia y el lema “Tecnología para crecer”. El dominio `restia.ar` podrá apuntarse más adelante a estas interfaces mediante DNS y dominios personalizados, sin cambiar la lógica de acceso.

Permisos disponibles: ver pedidos, gestionar pedidos e impresión, productos, configuración, reportes BI y facturación.

## Alcance actual

Burger Tin es el primer comercio registrado. Los perfiles y permisos ya son reales. El reporte operativo muestra ventas confirmadas, facturación operativa, ticket promedio, envíos y productos más vendidos.

El módulo de facturación todavía no emite comprobantes fiscales: requiere integrar un proveedor compatible con ARCA y completar los datos tributarios. Antes de incorporar otros comercios también hay que aislar catálogo, pedidos, pagos e impresoras por `store_id`.
