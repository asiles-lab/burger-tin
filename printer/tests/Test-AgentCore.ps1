$ErrorActionPreference = 'Stop'
$module = Join-Path (Split-Path $PSScriptRoot -Parent) 'app\BurgerTin.AgentCore.psm1'
Import-Module $module -Force

function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -ne $Expected) { throw "$Message`nEsperado: $Expected`nObtenido: $Actual" }
}

Assert-Equal (ConvertTo-SafeReceiptText 'Jamón y rúcula') 'Jamon y rucula' 'Debe normalizar acentos para impresoras ESC/POS basicas.'
$line = Format-ReceiptLine -Left '2 x Burger' -Right '$ 10.000' -Width 42
Assert-Equal $line.Length 42 'La linea debe respetar el ancho.'

$order = [pscustomobject]@{
    id='TEST-42'; confirmedAt='2026-10-23T20:00:00'; total='$ 10.000'; deliveryMethod='Retiro'; notes='Sin sal'
    items=@([pscustomobject]@{ quantity=2; name='Burger'; subtotal='$ 10.000'; notes='Una sin cebolla' })
}
$receipt = ConvertTo-BurgerTinReceipt -Order $order -Width 42
if ($receipt -notmatch 'TEST-42' -or $receipt -notmatch 'Pago validado') { throw 'La comanda no contiene los datos obligatorios.' }
$bytes = ConvertTo-EscPosBytes -Text $receipt -CutPaper $true
Assert-Equal $bytes[0] 27 'Debe comenzar con ESC.'
Assert-Equal $bytes[-4] 29 'Debe incluir el comando de corte GS V.'
Write-Host 'OK: pruebas del agente completadas.' -ForegroundColor Green
