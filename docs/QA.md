# Ambiente de QA

QA es un ambiente aislado de producción. Tiene su propia API, base de datos, dominios y secretos. No debe recibir datos personales ni credenciales productivas.

## URLs

| Componente | URL de QA |
|---|---|
| Institucional Restia | `https://qa.restia.net.ar` |
| Super Admin | `https://admin-qa.restia.net.ar` |
| API | `https://api-qa.restia.net.ar` |
| Burger Tin | `https://burger-tin-qa.restia.net.ar` |
| Admin Burger Tin | `https://burger-tin-qa.restia.net.ar/admin/` |
| GlowRo | `https://glowro-qa.restia.net.ar` |
| Admin GlowRo | `https://glowro-qa.restia.net.ar/admin/` |

## Controles de aislamiento

- Base independiente `restia-qa`.
- Secretos diferentes de producción.
- Mercado Pago permanece en sandbox y no tiene credenciales productivas.
- WhatsApp usa un número ficticio para impedir mensajes accidentales.
- Resend queda sin clave hasta que se configure un destinatario interno de pruebas.
- Los builds de QA apuntan exclusivamente a `https://api-qa.restia.net.ar`.

## Uso local

```powershell
npm test
npm run build:qa
```

Los artefactos se generan en `.cloudflare-dist/qa/` y no sobrescriben el build de producción.

## Orden de despliegue

1. Crear la base `restia-qa` y reemplazar su ID en `environments/qa/wrangler.api.toml`.
2. Configurar `SUPERADMIN_TOKEN` y `SETTINGS_ENCRYPTION_KEY` con valores exclusivos de QA.
3. Aplicar migraciones a `restia-qa`.
4. Desplegar la API.
5. Generar `npm run build:qa`.
6. Desplegar los cuatro frontends de QA.
7. Desde el admin de QA, crear una credencial de impresora exclusiva para QA e instalarla en un agente de prueba.
8. Ejecutar pruebas manuales de login, catálogo, pedido, pago sandbox e impresión antes de promover cambios a producción.

## Prohibiciones

- No copiar la base productiva completa a QA.
- No reutilizar tokens, webhooks o Access Tokens productivos.
- No enviar correos o WhatsApp a clientes reales.
- No usar QA como respaldo de producción.
