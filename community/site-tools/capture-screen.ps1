# Capture l'écran entier dans un PNG.
#
# Contrairement à capture.ps1, qui photographie une fenêtre précise, ce script
# prend tout ce qui est affiché — c'est la seule façon de saisir les overlays,
# qui sont des fenêtres transparentes posées par-dessus le jeu.
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File ../site-tools/capture-screen.ps1 -Out "overlays.png"
#   ... -Delay 5     attend 5 s avant de déclencher (le temps de basculer sur le jeu)
#   ... -Width 1920  largeur de sortie (0 = résolution native)

param(
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Delay = 0,
  [int]$Width = 1920
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Screen {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[void][Win32Screen]::SetProcessDPIAware()

if ($Delay -gt 0) {
  Write-Host "Capture dans $Delay s..." -ForegroundColor Yellow
  Start-Sleep -Seconds $Delay
}

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($screen.X, $screen.Y, 0, 0, $bmp.Size)
$g.Dispose()

if ($Width -gt 0 -and $bmp.Width -ne $Width) {
  $nh = [int][Math]::Round($bmp.Height * ($Width / [double]$bmp.Width))
  $res = New-Object System.Drawing.Bitmap $Width, $nh
  $g = [System.Drawing.Graphics]::FromImage($res)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($bmp, 0, 0, $Width, $nh)
  $g.Dispose(); $bmp.Dispose(); $bmp = $res
}

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$w = $bmp.Width; $h = $bmp.Height
$bmp.Dispose()

Write-Output "OK $Out ($w x $h)"
