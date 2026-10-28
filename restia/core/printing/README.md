# Asistente de impresora Burger Tin

Este paquete prepara una notebook con Windows 10 u 11 para usar una impresora térmica OCOM OCPP-812 por USB y ejecutar el agente local de Burger Tin.

## Qué hace

1. Comprueba Windows 10/11 de 64 bits, conexión, cola de impresión y permisos.
2. Descarga el controlador universal desde el sitio oficial de OCOM.
3. Verifica tamaño y dos huellas SHA-256 antes de permitir la instalación.
4. Abre el instalador del fabricante y luego detecta las colas de impresión disponibles.
5. Instala el agente local, guarda la credencial exclusiva de ese equipo con cifrado DPAPI del usuario y crea una tarea que se inicia al entrar a Windows.
6. Permite probar con una impresora comun de Windows en hoja A4 o con la termica en formato ESC/POS y corte.

## Uso en la notebook del local

1. Conectar la OCPP-812 por USB, colocar papel y encenderla con **su fuente original**.
2. Descomprimir el paquete completo en una carpeta local.
3. Hacer doble clic en `Instalar-Burger-Tin.cmd`.
4. Aceptar la elevación de Windows y seguir las pantallas.
5. Elegir `Prueba: impresora comun de Windows (A4)` para una Canon u otra impresora instalada, o el perfil termico para la OCPP-812.
6. Elegir la cola de la impresora y ejecutar la prueba.

Para una Canon que ya imprime desde Windows se puede omitir el paso del controlador OCOM. Ese controlador se instala solamente al pasar a la impresora térmica.

No hay que hacer esto en la notebook actual. El paquete puede guardarse y ejecutarse cuando esté disponible el equipo del local.

## Seguridad del controlador

- Página oficial: <https://www.ocominc.com/download/Driver.htm>
- Paquete oficial: `Drive for Windows all`
- SHA-256 del ZIP observado el 2026-10-23: `EFA1474163F63D11BDAFB62B91F23D1E2CD49A5840880BF949104DC6435A0F20`
- SHA-256 del instalador interno: `562DB72D581659480E22D974CCA5216D79A40FE9A434E5388025F6EDAE30954E`

El ejecutable interno es antiguo y su firma Authenticode aparece como `HashMismatch`. El asistente informa esto y exige una confirmación explícita. Si el fabricante reemplaza el archivo, la instalación se detiene hasta que se revise y actualice `driver-manifest.json`.

## Qué falta para recibir pedidos reales

El agente queda listo para trabajar con la API de comandas, pero por defecto se instala en modo `diagnostic`. Para producción primero se registra la notebook desde **Administración > Configuración > Notebooks e impresoras**. La credencial se muestra una sola vez y se pega en el instalador de ese equipo.

La API usa este contrato:

- `GET /api/print-jobs/next`
- `POST /api/print-jobs/{id}/ack` con `printed` o `already_printed`
- encabezado `Authorization: Bearer <credencial exclusiva del equipo>`

El comercio y el equipo no se aceptan por parámetros: se obtienen de la credencial. Rotar o desactivar una credencial no afecta a las demás notebooks del comercio.

La web no imprime al abrir WhatsApp. El trabajo se crea solamente después de que el local confirma el pago; el agente evita duplicados guardando los últimos 500 identificadores impresos.

## Privacidad

El log local guarda únicamente identificadores de trabajos y errores técnicos. No guarda el teléfono, dirección ni detalle de la comanda. El agente solo escucha al servidor mediante HTTPS y no abre puertos en la notebook.
