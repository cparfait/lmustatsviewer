# Capture la fenêtre principale de LMU Stats Viewer dans un PNG.
#
# La capture passe par PrintWindow : c'est la fenêtre elle-même qui se dessine
# dans le bitmap, et non une copie de l'écran. Rien de ce qui est superposé
# (autre fenêtre, curseur, cadre d'un outil de contrôle à distance) ne peut
# donc se retrouver dans l'image.
#
# Usage (depuis community/site, les captures vont dans assets/img/shots) :
#   powershell -ExecutionPolicy Bypass -File ../site-tools/capture.ps1 -Out "assets/img/shots/records-dark.png"
#   ... -KeepTitleBar     conserve la barre de titre (retirée par défaut)
#   ... -Width 0          conserve la résolution native (1920 par défaut)

param(
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$ProcessName = "lmustatsviewer",
  [string]$TitleLike = "LMU Stats Viewer",
  [switch]$KeepTitleBar,
  [int]$Width = 1920
)

Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Cap {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref POINT pt);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT rect, int size);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
}
"@

[void][Win32Cap]::SetProcessDPIAware()

$all = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
       Where-Object { $_.MainWindowHandle -ne 0 }
# On cible la fenetre principale (titrée) et non les fenetres techniques (tray, overlay).
$proc = $all | Where-Object { $_.MainWindowTitle -like "*$TitleLike*" } | Select-Object -First 1
if (-not $proc) { $proc = $all | Select-Object -First 1 }
if (-not $proc) { Write-Error "Fenetre introuvable pour le processus '$ProcessName'"; exit 1 }

$hwnd = $proc.MainWindowHandle

$wr = New-Object Win32Cap+RECT
$null = [Win32Cap]::GetWindowRect($hwnd, [ref]$wr)
$ww = $wr.Right - $wr.Left
$wh = $wr.Bottom - $wr.Top
if ($ww -le 0 -or $wh -le 0) { Write-Error "Dimensions invalides ($ww x $wh)"; exit 1 }

$bmp = New-Object System.Drawing.Bitmap $ww, $wh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
# 2 = PW_RENDERFULLCONTENT : indispensable pour les fenetres rendues par GPU
# (WebView2, Chromium), sinon le bitmap revient vide.
$ok = [Win32Cap]::PrintWindow($hwnd, $hdc, 2)
$g.ReleaseHdc($hdc)
$g.Dispose()

# PrintWindow peut echouer sans le dire : on verifie que l'image n'est pas vide.
$sample = @(
  $bmp.GetPixel([int]($ww * 0.5), [int]($wh * 0.5)),
  $bmp.GetPixel([int]($ww * 0.25), [int]($wh * 0.75)),
  $bmp.GetPixel([int]($ww * 0.75), [int]($wh * 0.25))
)
$blank = ($sample | Where-Object { $_.A -eq 0 -or ($_.R -eq 0 -and $_.G -eq 0 -and $_.B -eq 0) }).Count -eq 3

if (-not $ok -or $blank) {
  Write-Warning "PrintWindow n'a rien rendu : repli sur une copie d'ecran (la fenetre doit etre au premier plan et non masquee)."
  $null = [Win32Cap]::SetForegroundWindow($hwnd)
  Start-Sleep -Milliseconds 400
  $bmp.Dispose()
  $fr = New-Object Win32Cap+RECT
  # 9 = DWMWA_EXTENDED_FRAME_BOUNDS : bornes reelles sans l'ombre portee
  $null = [Win32Cap]::DwmGetWindowAttribute($hwnd, 9, [ref]$fr, 16)
  $ww = $fr.Right - $fr.Left; $wh = $fr.Bottom - $fr.Top
  $bmp = New-Object System.Drawing.Bitmap $ww, $wh
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($fr.Left, $fr.Top, 0, 0, (New-Object System.Drawing.Size $ww, $wh))
  $g.Dispose()
  $wr = $fr
}

# Recadrage sur la zone client : ni barre de titre, ni bordure de fenetre.
if (-not $KeepTitleBar) {
  $cr = New-Object Win32Cap+RECT
  $null = [Win32Cap]::GetClientRect($hwnd, [ref]$cr)
  $origin = New-Object Win32Cap+POINT
  $null = [Win32Cap]::ClientToScreen($hwnd, [ref]$origin)

  $offX = $origin.X - $wr.Left
  $offY = $origin.Y - $wr.Top
  $cw = $cr.Right - $cr.Left
  $ch = $cr.Bottom - $cr.Top

  if ($cw -gt 0 -and $ch -gt 0 -and
      $offX -ge 0 -and $offY -ge 0 -and
      ($offX + $cw) -le $bmp.Width -and ($offY + $ch) -le $bmp.Height) {
    $rect = New-Object System.Drawing.Rectangle $offX, $offY, $cw, $ch
    $crop = $bmp.Clone($rect, $bmp.PixelFormat)
    $bmp.Dispose()
    $bmp = $crop
  } else {
    Write-Warning "Zone client hors cadre : la barre de titre est conservee."
  }
}

# Mise a l'echelle : les captures du site sont calibrees sur 1920 px de large.
if ($Width -gt 0 -and $bmp.Width -ne $Width) {
  $nh = [int][Math]::Round($bmp.Height * ($Width / [double]$bmp.Width))
  $res = New-Object System.Drawing.Bitmap $Width, $nh
  $g = [System.Drawing.Graphics]::FromImage($res)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($bmp, 0, 0, $Width, $nh)
  $g.Dispose()
  $bmp.Dispose()
  $bmp = $res
}

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$w = $bmp.Width; $h = $bmp.Height
$bmp.Dispose()

Write-Output "OK $Out ($w x $h)"
