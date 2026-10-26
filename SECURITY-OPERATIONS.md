# Seguridad y operación de Restia

## Controles activos

- TLS y HSTS en los dominios públicos.
- CSP, `nosniff`, bloqueo de iframes y política restrictiva de permisos.
- SQL parametrizado y precios recalculados exclusivamente en el servidor.
- Validación de origen, encabezado anti-CSRF y límite de tamaño de solicitudes.
- Contraseñas derivadas con PBKDF2 en el navegador, verificador protegido en el servidor, bloqueo por intentos y sesiones de 12 horas.
- Permisos por rol y filtro obligatorio por `store_id` en datos operativos.
- Credenciales de Mercado Pago cifradas; webhooks firmados, pago aprobado, moneda, importe, comercio y pedido validados en el servidor.
- Consentimiento previo para analítica, sin datos del pedido ni grabaciones de sesión.
- Registro de auditoría de cambios sensibles.

## Recuperación gratuita

D1 Time Travel conserva siete días en el plan gratuito. Para obtener un punto recuperable:

```powershell
wrangler d1 time-travel info burger-tin-orders --timestamp="2026-10-25T12:00:00-03:00"
```

Restaurar sobrescribe el estado actual y requiere aprobación operativa:

```powershell
wrangler d1 time-travel restore burger-tin-orders --bookmark="BOOKMARK"
```

Antes de restaurar: exportar el estado actual, registrar el incidente y detener las escrituras. Después: comprobar pedidos, usuarios y trabajos de impresión.

## Monitoreo

- Revisar errores y consumo en Workers & Pages > Observability.
- Revisar lecturas/escrituras en D1 antes de acercarse al límite gratuito.
- Probar trimestralmente una recuperación en un entorno separado.
- Rotar inmediatamente secretos o sesiones ante una sospecha de acceso.

## Integraciones pendientes de cuenta externa

- Google Search Console: verificar `restia.net.ar` mediante DNS y enviar `https://restia.net.ar/sitemap.xml`.
- Google Analytics 4: crear una propiedad solamente si se decide usarla; cargarla después del consentimiento y sin datos personales. Umami continúa siendo la opción activa y minimizada.
- Mercado Pago: pasar `PAYMENTS_MODE` a `production` únicamente luego de cargar credenciales productivas y ejecutar una compra controlada.
