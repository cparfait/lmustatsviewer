# Capture une série d'écrans de LMU Stats Viewer pour le site.
#
# Le script vous guide écran par écran : il affiche celui à afficher, attend
# que vous appuyiez sur Entrée, puis capture. Vous gardez donc la main sur
# l'application et sur le moment de la prise.
#
# Usage (depuis community/site, les captures vont dans assets/img/shots) :
#   powershell -ExecutionPolicy Bypass -File ../site-tools/capture-set.ps1 -Theme dark
#   powershell -ExecutionPolicy Bypass -File ../site-tools/capture-set.ps1 -Theme light -Set live
#
#   -Theme dark|light   suffixe des fichiers produits (obligatoire)
#   -Set   all|live|app  sous-ensemble d'écrans (all par défaut)
#   -Delay 2            secondes d'attente après Entrée, le temps de lâcher
#                       le clavier et de laisser l'interface se stabiliser

param(
  [Parameter(Mandatory = $true)][ValidateSet("dark", "light")][string]$Theme,
  [ValidateSet("all", "live", "app")][string]$Set = "all",
  [int]$Delay = 2,
  [string]$OutDir = "assets/img/shots"
)

Add-Type -AssemblyName System.Drawing

$app = @(
  @{ f = "profile";        d = "Profil pilote" },
  @{ f = "records";        d = "Records - meilleurs temps par circuit" },
  @{ f = "sessions";       d = "Sessions - la liste complete" },
  @{ f = "session-detail"; d = "Detail d'une course - onglet Resultat" },
  @{ f = "session-laps";   d = "Detail d'une course - onglet Tours" },
  @{ f = "references";     d = "References OhneSpeed" },
  @{ f = "setups";         d = "Garage - liste des setups" },
  @{ f = "setup-editor";   d = "Editeur de setup" },
  @{ f = "telemetry-list"; d = "Telemetrie - liste des enregistrements" },
  @{ f = "telemetry";      d = "Telemetrie - carte + canaux" },
  @{ f = "overlays";       d = "Overlays - les 23 widgets" },
  @{ f = "config-ai";      d = "Config - Coach IA" },
  @{ f = "config";         d = "Config - Joueur & dossiers" },
  @{ f = "changelog";      d = "Notes de version" }
)

$live = @(
  @{ f = "live-overview";  d = "LIVE - onglet Vue d'ensemble" },
  @{ f = "live-standings"; d = "LIVE - onglet Classement" },
  @{ f = "live-telemetry"; d = "LIVE - onglet Telemetrie" },
  @{ f = "live-map";       d = "LIVE - onglet Carte 2D" },
  @{ f = "live-coach";     d = "LIVE - onglet Coach IA" }
)

switch ($Set) {
  "live" { $screens = $live }
  "app"  { $screens = $app }
  default { $screens = $app + $live }
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$capture = Join-Path $here "capture.ps1"
if (-not (Test-Path $capture)) { Write-Error "capture.ps1 introuvable a cote de ce script"; exit 1 }

Write-Host ""
Write-Host "  Captures pour le site - theme $Theme - $($screens.Count) ecrans" -ForegroundColor Cyan
Write-Host "  Entree = capturer   |   S = sauter   |   Q = arreter" -ForegroundColor DarkGray
Write-Host ""

$done = 0; $skipped = 0
foreach ($s in $screens) {
  $out = Join-Path $OutDir "$($s.f)-$Theme.png"

  Write-Host "  -> " -NoNewline -ForegroundColor Yellow
  Write-Host "$($s.d)" -NoNewline
  Write-Host "   [$($s.f)-$Theme.png]" -ForegroundColor DarkGray

  $answer = Read-Host "     pret ?"
  if ($answer -match '^[qQ]') { Write-Host "  Arret demande." -ForegroundColor DarkGray; break }
  if ($answer -match '^[sS]') { $skipped++; Write-Host "     saute" -ForegroundColor DarkGray; Write-Host ""; continue }

  Start-Sleep -Seconds $Delay
  & powershell -NoProfile -ExecutionPolicy Bypass -File $capture -Out $out | Out-Null

  if (Test-Path $out) {
    $img = [System.Drawing.Image]::FromFile($out)
    $size = "$($img.Width)x$($img.Height)"
    $img.Dispose()
    Write-Host "     capture ($size)" -ForegroundColor Green
    $done++
  } else {
    Write-Host "     ECHEC" -ForegroundColor Red
  }
  Write-Host ""
}

Write-Host ""
Write-Host "  $done capture(s), $skipped saut(s)." -ForegroundColor Cyan
Write-Host "  Relancez avec -Theme $(if ($Theme -eq 'dark') { 'light' } else { 'dark' }) pour l'autre variante." -ForegroundColor DarkGray
Write-Host ""
