# Impresoras y credenciales por equipo

Cada notebook o agente de impresión pertenece a un único comercio y utiliza una credencial propia. La API nunca confía en un identificador de comercio o equipo enviado en la URL.

## Alta

1. Ingresar al panel del comercio con permiso de configuración.
2. Abrir **Configuración > Notebooks e impresoras**.
3. Indicar un nombre reconocible, por ejemplo `Notebook mostrador`.
4. Copiar la credencial: se muestra una sola vez.
5. Instalar el agente local y pegar la URL de la API y esa credencial.

La base de datos conserva únicamente el hash SHA-256. Si se pierde la credencial, debe rotarse; no puede recuperarse.

## Rotación y baja

- **Rotar** invalida inmediatamente la credencial anterior y genera una nueva.
- **Desactivar** impide que ese equipo retire o confirme trabajos.
- Los trabajos tomados por un equipo que se rota o desactiva vuelven a la cola para que otro equipo activo pueda imprimirlos.

## Despliegue desde el sistema anterior

La versión anterior utilizaba una credencial global. Para evitar interrumpir una impresora productiva, el cambio debe desplegarse de forma controlada:

1. Hacer respaldo de la base de datos.
2. Aplicar la migración `0015_tenant_devices.sql`.
3. Generar e insertar una credencial inicial para cada notebook activa, o desplegar primero en QA y crearla desde el panel.
4. Actualizar el agente local con la credencial individual.
5. Verificar una comanda completa y recién entonces retirar la credencial global anterior.

No se debe desplegar el corte definitivo en producción antes de contar con acceso a la notebook del local.
