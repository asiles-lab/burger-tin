[CmdletBinding()]
param(
    [string]$ConfigPath = "$env:ProgramData\BurgerTin\config.json",
    [switch]$Once,
    [switch]$TestPrint
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Security -ErrorAction Stop
Import-Module (Join-Path $PSScriptRoot 'BurgerTin.AgentCore.psm1') -Force

$dataRoot = Split-Path -Parent $ConfigPath
$logPath = Join-Path $dataRoot 'agent.log'
$statePath = Join-Path $dataRoot 'printed-jobs.json'

function Write-AgentLog {
    param([string]$Message)
    if (-not (Test-Path -LiteralPath $dataRoot)) { New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null }
    $line = '{0:u} {1}' -f [DateTime]::UtcNow, $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
    $lines = @(Get-Content -LiteralPath $logPath -ErrorAction SilentlyContinue)
    if ($lines.Count -gt 1000) { $lines[-500..-1] | Set-Content -LiteralPath $logPath -Encoding UTF8 }
}

function Get-PrintedIds {
    if (-not (Test-Path -LiteralPath $statePath)) { return @() }
    try { return @((Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).ids) } catch { return @() }
}

function Save-PrintedId {
    param([string]$Id)
    $ids = [Collections.Generic.List[string]]::new()
    foreach ($existing in @(Get-PrintedIds)) { if ($existing) { $ids.Add([string]$existing) } }
    if (-not $ids.Contains($Id)) { $ids.Add($Id) }
    while ($ids.Count -gt 500) { $ids.RemoveAt(0) }
    @{ ids = @($ids) } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Get-Token {
    param([string]$TokenPath)
    if (-not (Test-Path -LiteralPath $TokenPath)) { return '' }
    $cipherText = (Get-Content -LiteralPath $TokenPath -Raw).Trim()
    $secure = ConvertTo-SecureString -String $cipherText
    $credential = [Management.Automation.PSCredential]::new('BurgerTinAgent', $secure)
    return $credential.GetNetworkCredential().Password
}

function Invoke-AgentRequest {
    param([string]$Method, [string]$Uri, [string]$Token, $Body)
    $headers = @{ Authorization = "Bearer $Token"; 'X-BurgerTin-Agent' = '1' }
    $parameters = @{ Method=$Method; Uri=$Uri; Headers=$headers; UseBasicParsing=$true; TimeoutSec=20 }
    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json'
        $parameters.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
    }
    return Invoke-RestMethod @parameters
}

if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "No existe la configuracion: $ConfigPath" }
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$printerMode = if ($config.PSObject.Properties.Name -contains 'printerMode') { [string]$config.printerMode } else { 'escpos' }

if ($TestPrint) {
    $sample = [pscustomobject]@{
        id='A-001'; confirmedAt=[DateTimeOffset]::UtcNow.ToString('o'); deliveryMethod='Envio a domicilio'; address='Calle de prueba 123'; notes='Prueba de instalacion'
        items=@(
            [pscustomobject]@{ quantity=2; name='Burger Tin completa'; notes='Una sin cebolla' },
            [pscustomobject]@{ quantity=1; name='Papas grandes'; notes='' }
        )
    }
    Send-BurgerTinPrint -PrinterName $config.printerName -Order $sample -Mode $printerMode -Width $config.columns -CutPaper $config.cutPaper
    Write-AgentLog 'Impresion de prueba enviada.'
    exit 0
}

if (-not $config.apiBaseUrl -or $config.environment -eq 'diagnostic') {
    Write-AgentLog 'Modo diagnostico: no hay servidor de pedidos configurado.'
    exit 0
}

$token = Get-Token -TokenPath $config.tokenPath
if (-not $token) { throw 'Falta el token cifrado del dispositivo.' }
$baseUrl = ([string]$config.apiBaseUrl).TrimEnd('/')
$pollSeconds = [Math]::Max(5, [int]$config.pollSeconds)

do {
    try {
        $job = Invoke-AgentRequest -Method GET -Uri "$baseUrl/api/print-jobs/next" -Token $token -Body $null
        $hasJobId = $null -ne $job -and @($job.PSObject.Properties.Name) -contains 'id' -and -not [string]::IsNullOrWhiteSpace([string]$job.id)
        if ($hasJobId) {
            if (@(Get-PrintedIds) -contains [string]$job.id) {
                Invoke-AgentRequest -Method POST -Uri "$baseUrl/api/print-jobs/$($job.id)/ack" -Token $token -Body @{ status='already_printed' } | Out-Null
            } else {
                Send-BurgerTinPrint -PrinterName $config.printerName -Order $job.order -Mode $printerMode -Width $config.columns -CutPaper $config.cutPaper
                Save-PrintedId -Id ([string]$job.id)
                Invoke-AgentRequest -Method POST -Uri "$baseUrl/api/print-jobs/$($job.id)/ack" -Token $token -Body @{ status='printed' } | Out-Null
                Write-AgentLog "Trabajo $($job.id) impreso."
            }
        }
    } catch {
        Write-AgentLog ("Error controlado: " + $_.Exception.Message)
    }
    if (-not $Once) { Start-Sleep -Seconds $pollSeconds }
} while (-not $Once)
