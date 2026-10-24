$ErrorActionPreference = 'Stop'
$module = Join-Path (Split-Path $PSScriptRoot -Parent) 'app\BurgerTin.AgentCore.psm1'
Import-Module $module -Force

function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -ne $Expected) { throw "$Message`nEsperado: $Expected`nObtenido: $Actual" }
}

$accented = 'Jam' + [char]0x00F3 + 'n y r' + [char]0x00FA + 'cula'
Assert-Equal (ConvertTo-SafeReceiptText $accented) 'Jamon y rucula' 'Debe normalizar acentos para impresoras ESC/POS basicas.'
$line = Format-ReceiptLine -Left '2 x Burger' -Right '$ 10.000' -Width 42
Assert-Equal $line.Length 42 'La linea debe respetar el ancho.'

$order = [pscustomobject]@{
    id='A-001'; confirmedAt='2026-10-24T19:16:00.000Z'; customerName='Ana'; paymentMethod='Mercado Pago aprobado'; address='Croacia 4544'; deliveryMethod='Envio a domicilio'; notes='Sin sal'
    items=@([pscustomobject]@{ quantity=2; name='Burger'; notes='Una sin cebolla' })
}
$receipt = ConvertTo-BurgerTinReceipt -Order $order -Width 42
if ($receipt -notmatch 'A-001' -or $receipt -notmatch '24/10/26 16:16 hs' -or $receipt -notmatch 'Entrega: Envio a domicilio\r?\nDireccion: Croacia 4544' -or $receipt -notmatch 'Pago confirmado por el local') { throw 'La comanda no contiene los datos obligatorios.' }
if ($receipt -match '\$|TOTAL|10\.000') { throw 'La comanda no debe incluir precios ni total.' }
$bytes = ConvertTo-EscPosBytes -Text $receipt -CutPaper $true
Assert-Equal $bytes[0] 27 'Debe comenzar con ESC.'
Assert-Equal $bytes[-4] 29 'Debe incluir el comando de corte GS V.'
Write-Host 'OK: pruebas del agente completadas.' -ForegroundColor Green
