# Backend canónico de Restia

Este es el único directorio autorizado para publicar el Worker de producción
`burger-tin-orders`.

El catálogo público se resuelve por el dominio de origen y todas las consultas
administrativas se filtran por el `store_id` de la sesión autenticada. Las
pruebas de `tenant-isolation.test.js` deben pasar antes de cada despliegue.

La copia histórica ubicada en `../../burger-tin-pages/backend` tiene el despliegue
bloqueado para evitar que vuelva a sobrescribir este Worker.
