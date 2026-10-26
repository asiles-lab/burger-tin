# Mercado Pago por comercio

Cada comercio conecta su propia cuenta desde **Administración → Configuración → Mercado Pago**. Restia no crea otra página de checkout: la tienda envía al comprador a Checkout Pro, alojado por Mercado Pago.

## Configuración del titular

1. En Mercado Pago Developers, crear una aplicación de Checkout Pro para el comercio y obtener el **Access Token de producción**.
2. En la aplicación, abrir **Webhooks → Configurar notificaciones**, seleccionar el entorno de producción y el evento **Pagos**. Copiar allí la URL de webhook que muestra el panel de Restia para ese comercio.
3. Copiar la **clave secreta** que Mercado Pago genera para ese webhook.
4. En el panel de Restia, ingresar el Access Token y la clave secreta, definir el costo de envío y guardar. Cada tienda guarda sus credenciales cifradas por separado; nunca aparecen en el menú público ni en el repositorio.
5. Usar **Comprobar API de Mercado Pago** para validar que el Access Token es aceptado. Esta comprobación no prueba el webhook.
6. Activar **Cobros reales**, guardar y realizar una compra pequeña de prueba. Verificar en Mercado Pago que se cobró y en Restia que el pedido pasó de pendiente a confirmado. El regreso del comprador a la web no confirma por sí solo el pago.

La URL del webhook la genera Restia; no se ingresa una URL arbitraria en el panel. El cliente la registra en su aplicación de Mercado Pago y guarda en Restia la clave secreta correspondiente.

## GlowRo hoy

- Solo acepta envío y Mercado Pago. No ofrece efectivo en la tienda ni pagos offline como Rapipago o Pago Fácil en Checkout Pro.
- El costo de envío es fijo y se configura en el panel; se suma al total antes de generar la preferencia de pago.
- Los cobros públicos permanecen deshabilitados mientras falten credenciales, costo de envío o activación productiva.
- La cotización automática con Andreani queda para una etapa posterior; requerirá sus condiciones comerciales y credenciales.

## Verificaciones del servidor

El servidor recalcula precios y envío, crea la preferencia con el Access Token de ese comercio y valida la firma del webhook con su clave secreta. Luego consulta el pago a Mercado Pago y comprueba estado aprobado, moneda ARS, comercio, pedido y total antes de confirmarlo. Las credenciales de un comercio no se reutilizan para otro.
