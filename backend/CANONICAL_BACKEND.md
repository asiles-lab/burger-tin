# Backend histórico — no publicar

Este directorio no es la fuente de producción de Restia.

El backend canónico está en:

`../../restia-glowro-commerce/backend`

La configuración de Wrangler de esta copia usa deliberadamente otro nombre de
Worker y `npm run deploy` falla de forma explícita. Estas dos barreras evitan
que una versión antigua vuelva a sobrescribir `burger-tin-orders` y pierda el
aislamiento por empresa.
