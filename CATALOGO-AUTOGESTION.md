# Catálogo autogestionable

El panel del local permite administrar la información del comercio, los colores, Mercado Pago y los productos sin editar código ni volver a publicar GitHub Pages.

## Uso

1. Abrir `panel.html` e ingresar con el token del local.
2. Pulsar **Configuración**, debajo de **Salir**.
3. En **Información del local**, modificar dirección, teléfono, colores y conexión de Mercado Pago.
4. En **Productos**, agregar, quitar o modificar nombre, precio y foto.
5. La foto se reduce automáticamente a un tamaño apto para la web. El cambio queda publicado inmediatamente.

El menú público consulta primero el catálogo del servidor. Si el servidor no está disponible, conserva el catálogo estático como respaldo para que la página no quede vacía.

## Base para nuevos clientes

Cada cliente puede usar una instalación independiente con su propia base D1, tokens, teléfono, catálogo e identidad visual. El panel y la lógica de pedidos se reutilizan; solo se reemplazan la configuración, los productos y el diseño de marca.

Las credenciales de Mercado Pago se guardan cifradas y nunca se devuelven al navegador. El medio de pago solo aparece en el menú cuando están configurados tanto el Access Token como la firma secreta del webhook.
