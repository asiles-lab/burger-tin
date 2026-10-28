# Repositorio único de Restia

## Fuente oficial

La fuente oficial es este repositorio Git, conectado a `asiles-lab/burger-tin`.

La rama de trabajo vigente es `feature/glowro-commerce`. Antes de establecer un flujo definitivo de producción deberá integrarse a `main` mediante revisión.

Las carpetas locales históricas `burger-tin-pages` y `GlowRo_15_Octubre_26` dejan de ser fuentes oficiales. No se eliminan todavía: se conservan temporalmente para comparación y recuperación.

## Mapa de componentes

| Componente | Fuente | Publicación |
|---|---|---|
| Institucional Restia | `restia-site/` | `restia.net.ar` |
| Super Admin | `platform.html`, `platform-v2.mjs`, estilos compartidos | `admin.restia.net.ar` |
| Burger Tin | raíz web y `assets/` | `burger-tin.restia.net.ar` |
| GlowRo | `tenants/glowro/dist/` | `glowro.restia.net.ar` |
| API del backend | `backend/src/` | servicio `burger-tin-orders` |
| Base de datos | `backend/migrations/` | base compartida con aislamiento por `store_id` |
| Impresión | `printer/` | aplicación local para Windows |

## Comandos únicos

Instalar las herramientas de desarrollo una sola vez:

```powershell
corepack pnpm --dir backend install --frozen-lockfile
```

Validar y construir:

```powershell
npm test
npm run build
```

Publicar componentes independientes:

```powershell
npm run deploy:api
npm run deploy:institutional
npm run deploy:superadmin
npm run deploy:burger-tin
npm run deploy:glowro
```

Los secretos permanecen en Cloudflare y no se guardan en Git.

## Estado de ambientes

Actualmente existen desarrollo local y producción. No existe todavía un ambiente de QA con API y base de datos independientes. Las URLs de previsualización de Cloudflare no reemplazan ese ambiente.

## Código pendiente recuperado

`archive/pending-onboarding/` conserva una implementación incompleta encontrada en la antigua copia `main`: activación de usuarios e invitaciones por correo. Está aislada y no forma parte del build ni de la API publicada. Antes de recuperarla debe compararse con la API actual, adaptar sus migraciones y agregar pruebas.

## Regla de trabajo

1. Los cambios nuevos se realizan únicamente en este repositorio.
2. No se despliega desde las carpetas históricas.
3. Antes de publicar la API se ejecutan las pruebas y se crea un backup de la base de datos.
4. Cada sitio se publica con su script `deploy:*` correspondiente.
