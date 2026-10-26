# Conectar el Worker y el dominio de una empresa

El alta de empresa reserva un hostname como `glowro.restia.net.ar` y asigna el nombre fijo `restia-tenant-glowro` al Worker. Desde el Super Admin, **Conectar Worker y DNS** asocia ese hostname al Worker. Cloudflare crea el registro DNS y gestiona el certificado HTTPS al configurar el Custom Domain.

## Requisitos

1. Preparar y desplegar el sitio personalizado de la empresa en un Worker con el nombre exacto que muestra el diálogo (`restia-tenant-<subdominio>`). Ese Worker debe servir el contenido de esa empresa. No usar `burger-tin-restia`.
2. Antes de conectarlo, asegurar que el sitio usa el backend multiempresa con aislamiento para esa compañía. El enrutamiento del dominio por sí solo no cambia el catálogo ni el destino de las órdenes; el backend actual todavía usa Burger Tin como tienda pública predeterminada.
3. Configurar las credenciales del backend de forma privada. No pegarlas en el navegador, en el formulario de empresa ni en Git:

   ```powershell
   pnpm --dir backend exec wrangler secret put CLOUDFLARE_ACCOUNT_ID --config wrangler.toml
   pnpm --dir backend exec wrangler secret put CLOUDFLARE_API_TOKEN --config wrangler.toml
   ```

   El token debe estar limitado a la cuenta Restia y al permiso **Workers Scripts Write**. El identificador de cuenta no es secreto, pero se guarda con el mismo mecanismo para evitar agregarlo al repositorio.

4. Aplicar las migraciones nuevas de D1 y desplegar el Worker de pedidos/API para que exponga la acción de conexión:

   ```powershell
   pnpm --dir backend exec wrangler d1 migrations apply burger-tin-orders --remote --config wrangler.toml
   pnpm --dir backend exec wrangler deploy --config wrangler.toml
   ```

5. Desplegar el Super Admin actualizado. El botón se habilita para una empresa en preparación y muestra el resultado o el error devuelto por Cloudflare.

## Qué hace el botón

Envía al backend autenticado el ID de la empresa. El backend deriva el hostname y el Worker del registro D1, valida el prefijo `restia-tenant-`, y llama a `PUT /accounts/{account_id}/workers/domains` con `zone_name: restia.net.ar`. Al éxito guarda el ID del dominio y marca el Worker enlazado y el pedido DNS solicitado.

El estado **solicitado** significa que Cloudflare aceptó el vínculo. No certifica que el sitio publicado sea el correcto ni que el DNS/HTTPS ya se haya propagado; el Worker personalizado debe estar desplegado y probado antes de pulsarlo. El diálogo exige confirmarlo y el backend solo permite conectar un Worker con el nombre derivado de esa empresa.
