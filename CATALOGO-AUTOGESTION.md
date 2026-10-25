# Catálogo autogestionable

El panel del local permite cambiar el precio y la foto de cada producto sin editar código ni volver a publicar GitHub Pages.

## Uso

1. Abrir `panel.html` e ingresar con el token del local.
2. Entrar en **Configuración**.
3. Cambiar el precio, elegir una foto JPG, PNG o WebP y pulsar **Guardar cambios**.
4. La foto se reduce automáticamente a un tamaño apto para la web. El cambio queda publicado inmediatamente.

El menú público consulta primero el catálogo del servidor. Si el servidor no está disponible, conserva el catálogo estático como respaldo para que la página no quede vacía.

## Base para nuevos clientes

Cada cliente puede usar una instalación independiente con su propia base D1, tokens, teléfono, catálogo e identidad visual. El panel y la lógica de pedidos se reutilizan; solo se reemplazan la configuración, los productos y el diseño de marca.

Esta primera versión edita productos existentes. Altas, bajas, categorías, horarios, zonas de entrega y branding pueden incorporarse como módulos posteriores.
