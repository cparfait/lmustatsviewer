# Affiche le nombre de telechargements de LMU Stats Viewer, version par version.
#
# GitHub ne montre plus ce chiffre dans l'interface des releases : il n'est
# disponible que par l'API. Ce script la lit et la met en forme.
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File ../site-tools/downloads.ps1
#   ... -All      inclut aussi latest.json et les .sig (voir plus bas)

param(
  [string]$Repo = "cparfait/lmustatsviewer",
  [switch]$All
)

$ErrorActionPreference = "Stop"

try {
  $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases?per_page=100" `
                                -Headers @{ "User-Agent" = "lmusv-downloads"; "Accept" = "application/vnd.github+json" }
} catch {
  Write-Host ""
  Write-Host "  Impossible de joindre l'API GitHub." -ForegroundColor Red
  Write-Host "  $($_.Exception.Message)" -ForegroundColor DarkGray
  Write-Host ""
  exit 1
}

$releases = @($releases | Where-Object { -not $_.draft })
if (-not $releases) { Write-Host "  Aucune version publiee." -ForegroundColor DarkGray; exit 0 }

Write-Host ""
Write-Host "  LMU Stats Viewer - telechargements" -ForegroundColor Cyan
Write-Host "  $Repo" -ForegroundColor DarkGray
Write-Host ""

$total = 0
$lignes = @()

foreach ($r in $releases) {
  # Par defaut on ne compte que les installeurs. latest.json et les .sig sont
  # telecharges automatiquement par le verificateur de mise a jour de l'appli :
  # les inclure gonfle le total sans qu'aucun humain soit derriere.
  $assets = @($r.assets | Where-Object { $All -or $_.name -match '\.exe$' })
  if (-not $assets) { continue }

  $sousTotal = ($assets | Measure-Object -Property download_count -Sum).Sum
  $total += $sousTotal

  $lignes += [PSCustomObject]@{
    Version         = $r.tag_name
    Date            = if ($r.published_at) { ([datetime]$r.published_at).ToString("dd/MM/yyyy") } else { "-" }
    Telechargements = $sousTotal
  }

  if ($All) {
    foreach ($a in $assets) {
      $lignes += [PSCustomObject]@{ Version = "   $($a.name)"; Date = ""; Telechargements = $a.download_count }
    }
  }
}

$lignes | Format-Table -AutoSize

Write-Host ("  TOTAL : {0} telechargement(s)" -f $total) -ForegroundColor Green
if (-not $All) {
  Write-Host "  (installeurs .exe uniquement - relancez avec -All pour tout voir)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "  A savoir : GitHub compte des requetes, pas des personnes." -ForegroundColor DarkGray
Write-Host "  Une partie correspond a des mises a jour, pas a de nouveaux joueurs." -ForegroundColor DarkGray
Write-Host ""
