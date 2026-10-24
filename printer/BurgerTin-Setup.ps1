[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()

$script:PackageRoot = $PSScriptRoot
$script:ManifestPath = Join-Path $PSScriptRoot 'driver-manifest.json'
$script:Manifest = Get-Content -LiteralPath $script:ManifestPath -Raw | ConvertFrom-Json
$script:InstallRoot = Join-Path $env:ProgramFiles 'Burger Tin Print Agent'
$script:DataRoot = Join-Path $env:ProgramData 'BurgerTin'
$script:CacheRoot = Join-Path $script:DataRoot 'Cache'
$script:ConfigPath = Join-Path $script:DataRoot 'config.json'
$script:DriverReady = $false

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Restart-Elevated {
    if (Test-IsAdministrator) { return $true }
    $choice = [Windows.Forms.MessageBox]::Show(
        'Para instalar el controlador y la aplicacion, Windows pedira permiso de administrador. No se instalara nada hasta que confirmes los pasos del asistente.',
        'Burger Tin - permiso requerido',
        [Windows.Forms.MessageBoxButtons]::OKCancel,
        [Windows.Forms.MessageBoxIcon]::Information
    )
    if ($choice -ne [Windows.Forms.DialogResult]::OK) { return $false }
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath)
    )
    return $false
}

if (-not (Restart-Elevated)) { exit 0 }

function Add-Log {
    param([string]$Message, [Drawing.Color]$Color = [Drawing.Color]::FromArgb(49, 31, 60))
    $log.SelectionStart = $log.TextLength
    $log.SelectionColor = $Color
    $log.AppendText(('[{0:HH:mm:ss}] {1}' -f (Get-Date), $Message) + [Environment]::NewLine)
    $log.ScrollToCaret()
    [Windows.Forms.Application]::DoEvents()
}

function Get-PrinterNames {
    try { return @(Get-Printer -ErrorAction Stop | Sort-Object Name | Select-Object -ExpandProperty Name) }
    catch { return @(Get-CimInstance Win32_Printer | Sort-Object Name | Select-Object -ExpandProperty Name) }
}

function Refresh-Printers {
    $current = [string]$printerCombo.SelectedItem
    $printerCombo.Items.Clear()
    foreach ($name in @(Get-PrinterNames)) { [void]$printerCombo.Items.Add($name) }
    if ($current -and $printerCombo.Items.Contains($current)) { $printerCombo.SelectedItem = $current }
    elseif ($printerCombo.Items.Count -gt 0) {
        $preferred = $null
        foreach ($item in $printerCombo.Items) {
            if ([string]$item -match 'POS|80|OCOM|Receipt|Thermal') { $preferred = $item; break }
        }
        if ($preferred) { $printerCombo.SelectedItem = $preferred } else { $printerCombo.SelectedIndex = 0 }
    }
    Add-Log ("Impresoras detectadas: {0}" -f $printerCombo.Items.Count)
}

function Test-Preflight {
    $ok = $true
    $os = Get-CimInstance Win32_OperatingSystem
    $version = [Version]$os.Version
    Add-Log ("Sistema: {0} ({1}), {2}" -f $os.Caption, $os.Version, $os.OSArchitecture)
    if ($version.Major -lt 10) { Add-Log 'Se requiere Windows 10 u 11.' ([Drawing.Color]::Crimson); $ok = $false }
    if (-not [Environment]::Is64BitOperatingSystem) { Add-Log 'Se requiere Windows de 64 bits.' ([Drawing.Color]::Crimson); $ok = $false }
    $spooler = Get-Service -Name Spooler -ErrorAction SilentlyContinue
    if (-not $spooler) { Add-Log 'No se encontro el servicio de impresion.' ([Drawing.Color]::Crimson); $ok = $false }
    elseif ($spooler.Status -ne 'Running') {
        Start-Service -Name Spooler
        Add-Log 'Servicio de impresion iniciado.' ([Drawing.Color]::DarkGreen)
    } else { Add-Log 'Servicio de impresion activo.' ([Drawing.Color]::DarkGreen) }
    Add-Log 'Permisos de administrador confirmados.' ([Drawing.Color]::DarkGreen)
    return $ok
}

function Get-VerifiedDriver {
    New-Item -ItemType Directory -Path $script:CacheRoot -Force | Out-Null
    $zipPath = Join-Path $script:CacheRoot $script:Manifest.package.fileName
    $expectedHash = ([string]$script:Manifest.package.sha256).ToUpperInvariant()

    if (Test-Path -LiteralPath $zipPath) {
        $existingHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
        if ($existingHash -ne $expectedHash) {
            Add-Log 'El archivo cacheado no coincide con la huella oficial; se descartara.' ([Drawing.Color]::DarkOrange)
            Remove-Item -LiteralPath $zipPath -Force
        }
    }
    if (-not (Test-Path -LiteralPath $zipPath)) {
        Add-Log 'Descargando el controlador desde ocominc.com...'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $script:Manifest.package.url -OutFile $zipPath -UseBasicParsing
    }
    $file = Get-Item -LiteralPath $zipPath
    if ($file.Length -ne [long]$script:Manifest.package.size) { throw 'El tamaño del paquete oficial no coincide. Instalacion detenida.' }
    $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
    if ($hash -ne $expectedHash) { throw 'La huella SHA-256 del paquete no coincide. Instalacion detenida.' }
    Add-Log 'ZIP oficial verificado por SHA-256.' ([Drawing.Color]::DarkGreen)

    $extractPath = Join-Path $script:CacheRoot 'driver'
    if (Test-Path -LiteralPath $extractPath) { Remove-Item -LiteralPath $extractPath -Recurse -Force }
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force
    $installerPath = Join-Path $extractPath ([string]$script:Manifest.installer.relativePath)
    if (-not (Test-Path -LiteralPath $installerPath)) { throw 'No se encontro el instalador esperado dentro del ZIP.' }
    $installerFile = Get-Item -LiteralPath $installerPath
    $installerHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
    if ($installerFile.Length -ne [long]$script:Manifest.installer.size -or $installerHash -ne ([string]$script:Manifest.installer.sha256).ToUpperInvariant()) {
        throw 'El instalador interno no coincide con la version revisada. Instalacion detenida.'
    }
    Add-Log 'Instalador interno verificado por SHA-256.' ([Drawing.Color]::DarkGreen)
    return $installerPath
}

function Invoke-DriverInstall {
    try {
        $installer = Get-VerifiedDriver
        $signature = Get-AuthenticodeSignature -LiteralPath $installer
        $message = @"
El archivo fue descargado del sitio oficial de OCOM y coincide exactamente con las dos huellas revisadas.

Advertencia: el instalador V7.01 es antiguo y Windows informa la firma Authenticode como '$($signature.Status)'. No podemos demostrar una firma digital vigente del fabricante.

¿Queres abrir igualmente el instalador oficial? Debera completarse en pantalla y luego volveras a este asistente.
"@
        $answer = [Windows.Forms.MessageBox]::Show($message, 'Controlador OCOM - confirmacion', [Windows.Forms.MessageBoxButtons]::YesNo, [Windows.Forms.MessageBoxIcon]::Warning)
        if ($answer -ne [Windows.Forms.DialogResult]::Yes) { Add-Log 'Instalacion del controlador cancelada por el usuario.' ([Drawing.Color]::DarkOrange); return }
        Add-Log 'Abriendo el instalador oficial de OCOM...'
        $process = Start-Process -FilePath $installer -Wait -PassThru
        Add-Log ("El instalador termino con codigo {0}." -f $process.ExitCode)
        $script:DriverReady = $true
        Refresh-Printers
        [Windows.Forms.MessageBox]::Show('La pantalla del controlador termino. Selecciona ahora la impresora en la lista. Si no aparece, conectala por USB, encendela y pulsa Actualizar.', 'Burger Tin', 'OK', 'Information') | Out-Null
    } catch {
        Add-Log $_.Exception.Message ([Drawing.Color]::Crimson)
        [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'No se pudo preparar el controlador', 'OK', 'Error') | Out-Null
    }
}

function Install-Agent {
    if (-not $printerCombo.SelectedItem) { throw 'Selecciona una impresora antes de instalar el agente.' }
    New-Item -ItemType Directory -Path $script:InstallRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $script:DataRoot -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $script:PackageRoot 'app\BurgerTin.PrintAgent.ps1') -Destination $script:InstallRoot -Force
    Copy-Item -LiteralPath (Join-Path $script:PackageRoot 'app\BurgerTin.AgentCore.psm1') -Destination $script:InstallRoot -Force

    $apiUrl = $apiText.Text.Trim()
    if ($apiUrl -and -not $apiUrl.StartsWith('https://')) { throw 'La URL del servidor debe comenzar con https://.' }
    $deviceId = $deviceText.Text.Trim()
    if (-not $deviceId) { $deviceId = 'burger-tin-' + [Guid]::NewGuid().ToString('N').Substring(0, 12); $deviceText.Text = $deviceId }
    $environment = 'diagnostic'
    $tokenPath = Join-Path $script:DataRoot 'device-token.dpapi'
    if ($apiUrl) {
        if (-not $tokenText.Text) { throw 'Para activar pedidos reales falta el token del dispositivo.' }
        $tokenText.Text | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $tokenPath -Encoding UTF8
        $tokenText.Clear()
        $environment = 'production'
    }
    $config = [ordered]@{
        printerName = [string]$printerCombo.SelectedItem
        apiBaseUrl = $apiUrl
        deviceId = $deviceId
        pollSeconds = 8
        columns = 42
        cutPaper = $true
        environment = $environment
        tokenPath = $tokenPath
    }
    $config | ConvertTo-Json | Set-Content -LiteralPath $script:ConfigPath -Encoding UTF8

    $taskName = 'Burger Tin - Agente de impresion'
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
    if ($environment -eq 'production') {
        $agentPath = Join-Path $script:InstallRoot 'BurgerTin.PrintAgent.ps1'
        $arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $agentPath
        $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
        $trigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
        $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Recibe e imprime comandas confirmadas de Burger Tin.' | Out-Null
        Start-ScheduledTask -TaskName $taskName
        Add-Log 'Agente instalado y activado para pedidos reales.' ([Drawing.Color]::DarkGreen)
    } else {
        Add-Log 'Agente instalado en modo diagnostico. Se activara al cargar URL y token.' ([Drawing.Color]::DarkGreen)
    }
}

function Invoke-TestPrint {
    if (-not (Test-Path -LiteralPath $script:ConfigPath)) { Install-Agent }
    $agent = Join-Path $script:InstallRoot 'BurgerTin.PrintAgent.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agent -ConfigPath $script:ConfigPath -TestPrint
    if ($LASTEXITCODE -ne 0) { throw 'Windows no pudo enviar la comanda de prueba.' }
    Add-Log 'Comanda de prueba enviada a la cola de Windows.' ([Drawing.Color]::DarkGreen)
}

$form = [Windows.Forms.Form]::new()
$form.Text = 'Burger Tin - Asistente de impresora'
$form.Size = [Drawing.Size]::new(820, 650)
$form.MinimumSize = [Drawing.Size]::new(760, 600)
$form.StartPosition = 'CenterScreen'
$form.BackColor = [Drawing.Color]::FromArgb(255, 248, 241)
$form.Font = [Drawing.Font]::new('Segoe UI', 10)

$title = [Windows.Forms.Label]::new()
$title.Text = 'BURGER TIN  ·  IMPRESORA DE COMANDAS'
$title.Font = [Drawing.Font]::new('Segoe UI Semibold', 18, [Drawing.FontStyle]::Bold)
$title.ForeColor = [Drawing.Color]::FromArgb(55, 22, 74)
$title.AutoSize = $true
$title.Location = [Drawing.Point]::new(24, 18)
$form.Controls.Add($title)

$tabs = [Windows.Forms.TabControl]::new()
$tabs.Location = [Drawing.Point]::new(22, 62)
$tabs.Size = [Drawing.Size]::new(758, 355)
$tabs.Anchor = 'Top,Left,Right'
$form.Controls.Add($tabs)

function New-StepTab([string]$Name, [string]$Heading, [string]$Body) {
    $tab = [Windows.Forms.TabPage]::new($Name)
    $tab.BackColor = $form.BackColor
    $headingLabel = [Windows.Forms.Label]::new()
    $headingLabel.Text = $Heading
    $headingLabel.Font = [Drawing.Font]::new('Segoe UI Semibold', 16, [Drawing.FontStyle]::Bold)
    $headingLabel.ForeColor = [Drawing.Color]::FromArgb(242, 46, 37)
    $headingLabel.AutoSize = $true
    $headingLabel.Location = [Drawing.Point]::new(26, 25)
    $tab.Controls.Add($headingLabel)
    $bodyLabel = [Windows.Forms.Label]::new()
    $bodyLabel.Text = $Body
    $bodyLabel.Location = [Drawing.Point]::new(28, 72)
    $bodyLabel.Size = [Drawing.Size]::new(680, 70)
    $bodyLabel.ForeColor = [Drawing.Color]::FromArgb(55, 22, 74)
    $tab.Controls.Add($bodyLabel)
    [void]$tabs.TabPages.Add($tab)
    return $tab
}

$tabWelcome = New-StepTab '1. Revisar' 'Preparar la notebook' "Compatible con Windows 10 y 11 de 64 bits.`r`nConecta la OCPP-812 por USB, coloca papel y usa exclusivamente la fuente que vino con la impresora."
$checkButton = [Windows.Forms.Button]::new()
$checkButton.Text = 'Revisar esta notebook'
$checkButton.Location = [Drawing.Point]::new(28, 170)
$checkButton.Size = [Drawing.Size]::new(220, 42)
$tabWelcome.Controls.Add($checkButton)

$tabDriver = New-StepTab '2. Controlador' 'Controlador oficial OCOM' "El asistente descarga Drive for Windows all desde ocominc.com y verifica dos huellas SHA-256.`r`nEl instalador del fabricante se abre en pantalla porque requiere confirmacion por su firma antigua."
$driverButton = [Windows.Forms.Button]::new()
$driverButton.Text = 'Descargar, verificar y abrir'
$driverButton.Location = [Drawing.Point]::new(28, 170)
$driverButton.Size = [Drawing.Size]::new(250, 42)
$tabDriver.Controls.Add($driverButton)
$officialLink = [Windows.Forms.LinkLabel]::new()
$officialLink.Text = 'Ver pagina oficial de descargas'
$officialLink.Location = [Drawing.Point]::new(300, 182)
$officialLink.AutoSize = $true
$tabDriver.Controls.Add($officialLink)

$tabPrinter = New-StepTab '3. Impresora' 'Elegir la cola de Windows' 'Despues de instalar el controlador, elegi la OCPP-812. Si no aparece, revisa USB y encendido y pulsa Actualizar.'
$printerCombo = [Windows.Forms.ComboBox]::new()
$printerCombo.DropDownStyle = 'DropDownList'
$printerCombo.Location = [Drawing.Point]::new(28, 160)
$printerCombo.Size = [Drawing.Size]::new(500, 32)
$tabPrinter.Controls.Add($printerCombo)
$refreshButton = [Windows.Forms.Button]::new()
$refreshButton.Text = 'Actualizar'
$refreshButton.Location = [Drawing.Point]::new(545, 157)
$refreshButton.Size = [Drawing.Size]::new(120, 38)
$tabPrinter.Controls.Add($refreshButton)

$tabAgent = New-StepTab '4. Agente' 'Instalar la aplicacion local' "Podes dejar servidor y token vacios para instalar en modo diagnostico.`r`nCuando exista el servidor de comandas, se cargan aqui y el agente queda automatico al iniciar Windows."
$labels = @('Servidor HTTPS (opcional):','Token del dispositivo (opcional):','Identificador de notebook:')
$ys = @(142, 187, 232)
for ($i=0; $i -lt $labels.Count; $i++) {
    $label = [Windows.Forms.Label]::new(); $label.Text=$labels[$i]; $label.Location=[Drawing.Point]::new(28,$ys[$i]+5); $label.Size=[Drawing.Size]::new(220,24); $tabAgent.Controls.Add($label)
}
$apiText = [Windows.Forms.TextBox]::new(); $apiText.Location=[Drawing.Point]::new(250,140); $apiText.Size=[Drawing.Size]::new(430,28); $tabAgent.Controls.Add($apiText)
$tokenText = [Windows.Forms.TextBox]::new(); $tokenText.Location=[Drawing.Point]::new(250,185); $tokenText.Size=[Drawing.Size]::new(430,28); $tokenText.UseSystemPasswordChar=$true; $tabAgent.Controls.Add($tokenText)
$deviceText = [Windows.Forms.TextBox]::new(); $deviceText.Location=[Drawing.Point]::new(250,230); $deviceText.Size=[Drawing.Size]::new(430,28); $deviceText.Text='burger-tin-' + $env:COMPUTERNAME.ToLowerInvariant(); $tabAgent.Controls.Add($deviceText)
$installButton = [Windows.Forms.Button]::new(); $installButton.Text='Instalar agente'; $installButton.Location=[Drawing.Point]::new(250,274); $installButton.Size=[Drawing.Size]::new(170,38); $tabAgent.Controls.Add($installButton)
$testButton = [Windows.Forms.Button]::new(); $testButton.Text='Imprimir prueba'; $testButton.Location=[Drawing.Point]::new(435,274); $testButton.Size=[Drawing.Size]::new(170,38); $tabAgent.Controls.Add($testButton)

$log = [Windows.Forms.RichTextBox]::new()
$log.Location = [Drawing.Point]::new(22, 435)
$log.Size = [Drawing.Size]::new(758, 125)
$log.Anchor = 'Top,Bottom,Left,Right'
$log.ReadOnly = $true
$log.BackColor = [Drawing.Color]::White
$form.Controls.Add($log)

$closeButton = [Windows.Forms.Button]::new()
$closeButton.Text = 'Cerrar'
$closeButton.Location = [Drawing.Point]::new(660, 570)
$closeButton.Size = [Drawing.Size]::new(120, 36)
$closeButton.Anchor = 'Bottom,Right'
$form.Controls.Add($closeButton)

$checkButton.Add_Click({
    try { if (Test-Preflight) { Add-Log 'Revision completada. Podes continuar.' ([Drawing.Color]::DarkGreen); $tabs.SelectedIndex = 1 } }
    catch { Add-Log $_.Exception.Message ([Drawing.Color]::Crimson) }
})
$driverButton.Add_Click({ Invoke-DriverInstall })
$officialLink.Add_LinkClicked({ Start-Process ([string]$script:Manifest.downloadPage) })
$refreshButton.Add_Click({ Refresh-Printers })
$installButton.Add_Click({
    try { Install-Agent; [Windows.Forms.MessageBox]::Show('Agente local instalado correctamente.', 'Burger Tin', 'OK', 'Information') | Out-Null }
    catch { Add-Log $_.Exception.Message ([Drawing.Color]::Crimson); [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'No se pudo instalar', 'OK', 'Error') | Out-Null }
})
$testButton.Add_Click({
    try { Invoke-TestPrint; [Windows.Forms.MessageBox]::Show('La comanda de prueba fue enviada. Revisa la impresora.', 'Burger Tin', 'OK', 'Information') | Out-Null }
    catch { Add-Log $_.Exception.Message ([Drawing.Color]::Crimson); [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Fallo la prueba', 'OK', 'Error') | Out-Null }
})
$closeButton.Add_Click({ $form.Close() })
$form.Add_Shown({ Add-Log 'Asistente listo. Todavia no se modifico el equipo.'; Refresh-Printers })

[void]$form.ShowDialog()
