# Backend canónico de Restia

Este es el único directorio autorizado para publicar el Worker de producción
`burger-tin-orders`.

El catálogo público se resuelve por el dominio de origen y todas las consultas
administrativas se filtran por el `store_id` de la sesión autenticada. Las
pruebas de `tenant-isolation.test.js` deben pasar antes de cada despliegue.

La copia histórica ubicada en `../../burger-tin-pages/backend` tiene el despliegue
bloqueado para evitar que vuelva a sobrescribir este Worker.

## Avisos de ventas por correo

Las ventas aprobadas por Mercado Pago pueden generar un correo operativo a la
empresa. La integración usa Resend y una cola persistente en D1 para impedir
duplicados y reintentar entregas fallidas.

- Secreto del Worker: `RESEND_API_KEY`.
- Remitente: variable `SALES_EMAIL_FROM` (por defecto,
  `Restia Ventas <notificaciones@restia.net.ar>`).
- Activación por empresa: setting `sales_notification_enabled` con valor `1`.
- Destinatario por empresa: setting `sales_notification_email`. Si falta, se
  usa el correo del administrador principal activo del comercio.
- El cron procesa hasta 10 avisos pendientes cada 5 minutos.

El correo se encola después de validar la firma del webhook, consultar el pago
directamente a Mercado Pago y comprobar estado, moneda, comercio e importe.
