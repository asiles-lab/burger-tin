# Catálogo autogestionable

El panel del local permite administrar la información del comercio, los colores, Mercado Pago y los productos sin editar código ni volver a publicar GitHub Pages.

## Uso

1. Abrir `/admin/` en el dominio del comercio e ingresar con el usuario y la contraseña correspondientes.
2. Pulsar **Configuración**, debajo de **Salir**.
3. En **Información del local**, modificar dirección, teléfono, colores y conexión de Mercado Pago.
4. En **Productos**, agregar, quitar o modificar nombre, precio y foto.
5. La foto se reduce automáticamente a un tamaño apto para la web. El cambio queda publicado inmediatamente.

El menú público consulta primero el catálogo del servidor. Si el servidor no está disponible, conserva el catálogo estático como respaldo para que la página no quede vacía.

## Base para nuevos clientes

Cada cliente tiene su empresa y sus datos separados por `store_id` en la base D1 compartida. Puede tener panel, dominio, teléfono, catálogo e identidad visual propios. El diseño del menú se adapta por separado para cada negocio.

Las credenciales de Mercado Pago se guardan cifradas por comercio y nunca se devuelven al navegador. La tienda activa Checkout Pro solo cuando están configurados el Access Token, la clave secreta del webhook y el modo de cobro productivo. Véase [Mercado Pago por comercio](MERCADO-PAGO-POR-COMERCIO.md).
