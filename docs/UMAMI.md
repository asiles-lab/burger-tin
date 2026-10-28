# Umami Analytics en Burger Tin

La integración está preparada pero desactivada hasta conectar una cuenta. No usa grabaciones de sesión, cookies propias, `distinctId` ni `umami.identify()`. Tampoco envía nombre, dirección, aclaraciones, teléfono, mensaje de WhatsApp ni contenido del pedido.

## Conectar Umami

1. En Umami, creá un sitio web con el dominio `asiles-lab.github.io`.
2. Abrí **Edit > Tracking code** y copiá el `data-website-id` y la URL del script.
3. Editá `analytics-config.js`:

```js
window.BURGER_TIN_ANALYTICS = Object.freeze({
  enabled: true,
  scriptUrl: 'https://cloud.umami.is/script.js',
  websiteId: 'PEGAR-AQUI-EL-WEBSITE-ID',
  domains: ['asiles-lab.github.io']
});
```

Para una instalación propia de Umami, reemplazá `scriptUrl` por `https://analytics.tudominio.com/script.js`. El Website ID y la URL del tracker son valores públicos del código de seguimiento; no coloques usuarios, contraseñas ni API tokens en este repositorio.

4. Guardá, hacé commit y push a `main`. GitHub Pages volverá a publicar el sitio.
5. Visitá el sitio y comprobá en el panel **Realtime** de Umami que llegue una visita. Si no aparece, revisá la pestaña Network del navegador y los bloqueadores de anuncios.

## Qué se mide

- Visitas y duración: pageviews y duración de visita de Umami, reforzada con hitos de tiempo activo a los 15, 30, 60, 120 y 300 segundos.
- Dispositivo y sistema operativo: dimensiones y User-Agent procesados por Umami.
- `product_selected`: interés por un producto.
- `cart_add`: producto agregado, cantidad, total de unidades y valor del carrito.
- `cart_open`: apertura desde cabecera o botón flotante.
- `whatsapp_click`: clic desde contacto o checkout, con modalidad de entrega y totales agregados.

Los eventos usan identificadores de productos, categorías, importes y contadores. Nunca incluyen los campos escritos por la persona.

## Enlaces demo

Agregá `?demo=identificador` al enlace compartido, por ejemplo:

`https://asiles-lab.github.io/burger-tin/?demo=cliente-norte`

El identificador se normaliza a minúsculas, admite solo letras ASCII, números, guion y guion bajo, y se limita a 50 caracteres. Se envía como tag `demo-cliente-norte` y como propiedad `demo` de los eventos personalizados. No se conserva en localStorage ni se usa para identificar personas.

La integración excluye todos los parámetros de búsqueda y fragmentos de la URL de los pageviews. También limpia query strings y hashes del referrer antes de enviar datos y respeta la preferencia Do Not Track cuando el navegador la expone.
