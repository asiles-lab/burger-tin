Set-StrictMode -Version Latest

function ConvertTo-SafeReceiptText {
    param([AllowNull()][string]$Text)
    if ($null -eq $Text) { return '' }
    $normalized = $Text.Normalize([Text.NormalizationForm]::FormD)
    $builder = [Text.StringBuilder]::new()
    foreach ($character in $normalized.ToCharArray()) {
        $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($character)
        if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($character)
        }
    }
    return $builder.ToString().Normalize([Text.NormalizationForm]::FormC) -replace '[^\x20-\x7E\r\n]', '?'
}

function Format-ReceiptLine {
    param(
        [Parameter(Mandatory)][string]$Left,
        [string]$Right = '',
        [ValidateRange(24, 64)][int]$Width = 42
    )
    $leftText = ConvertTo-SafeReceiptText $Left
    $rightText = ConvertTo-SafeReceiptText $Right
    if (-not $rightText) { return $leftText.Substring(0, [Math]::Min($leftText.Length, $Width)) }
    $room = [Math]::Max(1, $Width - $rightText.Length - 1)
    if ($leftText.Length -gt $room) { $leftText = $leftText.Substring(0, $room) }
    return $leftText.PadRight($Width - $rightText.Length) + $rightText
}

function Format-BurgerTinDateTime {
    param([AllowNull()][string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
    try {
        $instant = [DateTimeOffset]::Parse($Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
        try {
            $argentina = [TimeZoneInfo]::FindSystemTimeZoneById('Argentina Standard Time')
            $local = [TimeZoneInfo]::ConvertTime($instant, $argentina)
        } catch {
            $local = $instant.ToOffset([TimeSpan]::FromHours(-3))
        }
        return $local.ToString('dd/MM/yy HH:mm')
    } catch {
        return ConvertTo-SafeReceiptText $Value
    }
}

function ConvertTo-BurgerTinReceipt {
    param(
        [Parameter(Mandatory)]$Order,
        [ValidateRange(24, 64)][int]$Width = 42
    )
    $separator = '-' * $Width
    $lines = [Collections.Generic.List[string]]::new()
    $lines.Add('BURGER TIN')
    $lines.Add('COMANDA CONFIRMADA')
    $lines.Add("Pedido: $($Order.id)")
    $lines.Add($separator)
    if ($Order.confirmedAt) { $lines.Add("Confirmado: $(Format-BurgerTinDateTime $Order.confirmedAt) hs") }
    if ($Order.PSObject.Properties.Name -contains 'customerName' -and $Order.customerName) { $lines.Add("Cliente: $($Order.customerName)") }
    if ($Order.PSObject.Properties.Name -contains 'paymentMethod' -and $Order.paymentMethod) { $lines.Add("Pago: $($Order.paymentMethod)") }
    if ($Order.deliveryMethod) { $lines.Add("Entrega: $($Order.deliveryMethod)") }
    if ($Order.PSObject.Properties.Name -contains 'address' -and $Order.address) { $lines.Add("Direccion: $($Order.address)") }
    $lines.Add($separator)
    foreach ($item in @($Order.items)) {
        $quantity = if ($item.quantity) { [int]$item.quantity } else { 1 }
        $lines.Add((Format-ReceiptLine -Left ("{0} x {1}" -f $quantity, $item.name) -Width $Width))
        if ($item.notes) { $lines.Add("  > $($item.notes)") }
    }
    if ($Order.notes) {
        $lines.Add($separator)
        $lines.Add('NOTAS:')
        $lines.Add([string]$Order.notes)
    }
    $lines.Add('')
    $lines.Add('Pago confirmado por el local')
    $lines.Add('')
    return ($lines | ForEach-Object { ConvertTo-SafeReceiptText $_ }) -join "`r`n"
}

function ConvertTo-EscPosBytes {
    param(
        [Parameter(Mandatory)][string]$Text,
        [bool]$CutPaper = $true
    )
    $bytes = [Collections.Generic.List[byte]]::new()
    $bytes.AddRange([byte[]](0x1B, 0x40))
    foreach ($line in @($Text -split '\r?\n')) {
        if ($line -eq 'BURGER TIN') {
            $bytes.AddRange([byte[]](0x1B, 0x61, 0x01))
            $bytes.AddRange([Text.Encoding]::ASCII.GetBytes("$line`r`n"))
            continue
        }
        if ($line -match '^Pedido:\s*(.+)$') {
            $bytes.AddRange([byte[]](0x1B, 0x61, 0x01))
            $bytes.AddRange([byte[]](0x1D, 0x21, 0x11))
            $bytes.AddRange([Text.Encoding]::ASCII.GetBytes("$($Matches[1])`r`n"))
            $bytes.AddRange([byte[]](0x1D, 0x21, 0x00))
            $bytes.AddRange([byte[]](0x1B, 0x61, 0x00))
            continue
        }
        $bytes.AddRange([byte[]](0x1B, 0x61, 0x00))
        $bytes.AddRange([Text.Encoding]::ASCII.GetBytes("$line`r`n"))
    }
    $bytes.AddRange([Text.Encoding]::ASCII.GetBytes("`r`n`r`n"))
    if ($CutPaper) { $bytes.AddRange([byte[]](0x1D, 0x56, 0x41, 0x03)) }
    return $bytes.ToArray()
}

function Initialize-RawPrinterApi {
    if ('BurgerTin.RawPrinter' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace BurgerTin {
  public static class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private class DOCINFO {
      [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
      [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
      [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)]
    private static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError=true)]
    private static extern bool ClosePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)]
    private static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFO info);
    [DllImport("winspool.drv", SetLastError=true)]
    private static extern bool EndDocPrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError=true)]
    private static extern bool StartPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError=true)]
    private static extern bool EndPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError=true)]
    private static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);

    public static void Send(string printerName, byte[] bytes, string documentName) {
      IntPtr handle;
      if (!OpenPrinter(printerName, out handle, IntPtr.Zero)) throw new Win32Exception();
      try {
        var info = new DOCINFO { pDocName = documentName, pDataType = "RAW" };
        if (StartDocPrinter(handle, 1, info) == 0) throw new Win32Exception();
        try {
          if (!StartPagePrinter(handle)) throw new Win32Exception();
          try {
            int written;
            if (!WritePrinter(handle, bytes, bytes.Length, out written) || written != bytes.Length) throw new Win32Exception();
          } finally { EndPagePrinter(handle); }
        } finally { EndDocPrinter(handle); }
      } finally { ClosePrinter(handle); }
    }
  }
}
'@
}

function Send-BurgerTinReceipt {
    param(
        [Parameter(Mandatory)][string]$PrinterName,
        [Parameter(Mandatory)]$Order,
        [ValidateRange(24, 64)][int]$Width = 42,
        [bool]$CutPaper = $true
    )
    Initialize-RawPrinterApi
    $receipt = ConvertTo-BurgerTinReceipt -Order $Order -Width $Width
    $bytes = ConvertTo-EscPosBytes -Text $receipt -CutPaper $CutPaper
    [BurgerTin.RawPrinter]::Send($PrinterName, $bytes, "Burger Tin - $($Order.id)")
}

function Send-BurgerTinWindowsDocument {
    param(
        [Parameter(Mandatory)][string]$PrinterName,
        [Parameter(Mandatory)]$Order,
        [ValidateRange(24, 64)][int]$Width = 42
    )
    Add-Type -AssemblyName System.Drawing
    $receipt = ConvertTo-BurgerTinReceipt -Order $Order -Width $Width
    $bodyLines = @($receipt -split '\r?\n' | Where-Object { $_ -notmatch '^(BURGER TIN|COMANDA CONFIRMADA|Pedido:)' })
    $body = $bodyLines -join "`r`n"
    $document = [Drawing.Printing.PrintDocument]::new()
    $document.PrinterSettings.PrinterName = $PrinterName
    if (-not $document.PrinterSettings.IsValid) { throw "La impresora '$PrinterName' no esta disponible en Windows." }
    $document.DocumentName = "Burger Tin - $($Order.id)"
    $font = [Drawing.Font]::new('Consolas', 10)
    $idFont = [Drawing.Font]::new('Consolas', 22, [Drawing.FontStyle]::Bold)
    $titleFont = [Drawing.Font]::new('Consolas', 10, [Drawing.FontStyle]::Bold)
    $handler = [Drawing.Printing.PrintPageEventHandler]{
        param($sender, $eventArgs)
        $bounds = $eventArgs.MarginBounds
        $eventArgs.Graphics.DrawString("BURGER TIN`r`nCOMANDA CONFIRMADA", $titleFont, [Drawing.Brushes]::Black, [single]$bounds.X, [single]$bounds.Y)
        $idSize = $eventArgs.Graphics.MeasureString([string]$Order.id, $idFont)
        $titleSize = $eventArgs.Graphics.MeasureString('COMANDA CONFIRMADA', $titleFont)
        $preferredIdX = $bounds.X + $titleSize.Width + 32
        $idX = [single]([Math]::Min($preferredIdX, $bounds.Right - $idSize.Width))
        $eventArgs.Graphics.DrawString([string]$Order.id, $idFont, [Drawing.Brushes]::Black, $idX, [single]$bounds.Y)
        $bodyY = [single]($bounds.Y + [Math]::Max(48, $idSize.Height + 8))
        $layout = [Drawing.RectangleF]::new(
            [single]$bounds.X,
            $bodyY,
            [single]$bounds.Width,
            [single]($bounds.Bottom - $bodyY)
        )
        $eventArgs.Graphics.DrawString($body, $font, [Drawing.Brushes]::Black, $layout)
        $eventArgs.HasMorePages = $false
    }
    $document.add_PrintPage($handler)
    try { $document.Print() }
    finally {
        $document.remove_PrintPage($handler)
        $font.Dispose()
        $idFont.Dispose()
        $titleFont.Dispose()
        $document.Dispose()
    }
}

function Send-BurgerTinPrint {
    param(
        [Parameter(Mandatory)][string]$PrinterName,
        [Parameter(Mandatory)]$Order,
        [ValidateSet('windows','escpos')][string]$Mode = 'escpos',
        [ValidateRange(24, 64)][int]$Width = 42,
        [bool]$CutPaper = $true
    )
    if ($Mode -eq 'windows') {
        Send-BurgerTinWindowsDocument -PrinterName $PrinterName -Order $Order -Width $Width
        return
    }
    Send-BurgerTinReceipt -PrinterName $PrinterName -Order $Order -Width $Width -CutPaper $CutPaper
}

Export-ModuleMember -Function ConvertTo-SafeReceiptText, Format-ReceiptLine, Format-BurgerTinDateTime, ConvertTo-BurgerTinReceipt, ConvertTo-EscPosBytes, Send-BurgerTinReceipt, Send-BurgerTinWindowsDocument, Send-BurgerTinPrint
