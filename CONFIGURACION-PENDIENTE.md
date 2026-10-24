# Burger Tin: listo para configurar

El código queda preparado sin credenciales y con los cobros online desactivados. GitHub Pages sigue funcionando con el flujo actual de WhatsApp hasta completar estos pasos.

## Lo que habrá que hacer con las cuentas

### 1. Cloudflare

1. Crear o abrir una cuenta de Cloudflare.
2. Instalar dependencias en `backend/` con `pnpm install` (o `npm install`).
3. Crear la base: `npx wrangler d1 create burger-tin-orders`.
4. Copiar `backend/wrangler.toml.example` como `backend/wrangler.toml` y reemplazar `database_id` y `PUBLIC_API_URL`.
5. Crear secretos, sin escribirlos en archivos ni Git:
   - `npx wrangler secret put MP_ACCESS_TOKEN`
   - `npx wrangler secret put MP_WEBHOOK_SECRET`
   - `npx wrangler secret put STAFF_TOKEN`
   - `npx wrangler secret put DEVICE_TOKEN`
6. Ejecutar `pnpm db:remote` y `pnpm deploy`.

### 2. Mercado Pago

1. El titular ingresa en Mercado Pago > Tus integraciones y crea la aplicación `Burger Tin Pedidos`.
2. Primero se carga el Access Token de prueba.
3. En Webhooks se configura `https://URL-DEL-WORKER/api/webhooks/mercadopago` para eventos de pagos.
4. Se copia la clave secreta del Webhook directamente al secreto `MP_WEBHOOK_SECRET`.
5. Después de una prueba completa se cambian las credenciales por producción y `PAYMENTS_MODE` por `production`.

### 3. GitHub Pages

Editar únicamente `checkout-config.js`:

```js
window.BURGER_TIN_CHECKOUT = Object.freeze({
  enabled: true,
  apiBaseUrl: 'https://URL-DEL-WORKER'
});
```

Publicar ese cambio. Desde entonces aparecen Efectivo y Mercado Pago en el carrito y queda habilitado `panel.html`.

### 4. Notebook del local

1. Ejecutar el ZIP del asistente de impresora.
2. Elegir la cola OCPP-812.
3. Cargar la URL del Worker y el mismo `DEVICE_TOKEN` durante la instalación del agente.
4. Imprimir la comanda de prueba.

## Flujo resultante

- **Efectivo:** se guarda el pedido, se abre WhatsApp y el local pulsa `Confirmar e imprimir` en `panel.html`.
- **Mercado Pago:** el servidor calcula el importe, crea el checkout y espera el Webhook. Solo un pago `approved`, en ARS y por el total exacto confirma el pedido y genera la comanda.
- **Impresora:** el agente consulta la cola, imprime una vez y confirma el trabajo. Si la notebook está desconectada, el trabajo queda pendiente.

## Seguridad preparada

- Precios recalculados en el servidor a partir del catálogo.
- Credenciales fuera de GitHub Pages y del repositorio.
- Webhook validado con HMAC-SHA256 y consulta posterior a la API de Mercado Pago.
- Tokens diferentes para el panel y la notebook.
- Cola idempotente: un pedido crea un solo trabajo de impresión.
- CORS limitado al origen de GitHub Pages.
