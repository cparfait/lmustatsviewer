# ─────────────────────────────────────────────────────────────────────────────
# release.ps1 — Script de release LMU Stats Viewer
#
# Usage :
#   .\release.ps1               → build + instructions GitHub
#   .\release.ps1 -Version 3.1.0  → force une version précise
#   .\release.ps1 -SkipBuild    → repackage sans recompiler (si déjà compilé)
#
# Prérequis : Node.js, Rust/Cargo, _lmu_updater.key dans le dossier racine.
# ─────────────────────────────────────────────────────────────────────────────

param(
    [string]$Version = "",
    [switch]$SkipBuild = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Couleurs helpers ──────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "   ✓  $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "   ⚠  $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "   ✗  $msg" -ForegroundColor Red }
function Write-Info  { param($msg) Write-Host "   →  $msg" -ForegroundColor Gray }

# ── Répertoire racine ─────────────────────────────────────────────────────────
$Root = $PSScriptRoot
if (-not $Root) { $Root = Get-Location }
Set-Location $Root

Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "   LMU Stats Viewer — Release Builder"      -ForegroundColor Magenta
Write-Host "════════════════════════════════════════════" -ForegroundColor Magenta

# ── 1. Vérification des prérequis ─────────────────────────────────────────────
Write-Step "Vérification des prérequis"

$tauriConf = Join-Path $Root "src-tauri\tauri.conf.json"
$keyFile   = Join-Path $Root "_lmu_updater.key"

if (-not (Test-Path $tauriConf)) {
    Write-Fail "tauri.conf.json introuvable — lancez le script depuis la racine du projet."
    exit 1
}
Write-Ok "tauri.conf.json trouvé"

if (-not (Test-Path $keyFile)) {
    Write-Fail "_lmu_updater.key introuvable — la clé de signature est requise pour l'auto-updater."
    Write-Info "Build sans signature possible mais l'auto-update sera désactivé."
    $signed = $false
} else {
    Write-Ok "_lmu_updater.key trouvé"
    $signed = $true
}

# ── 2. Version actuelle ────────────────────────────────────────────────────────
Write-Step "Version"

$confContent = Get-Content $tauriConf -Raw | ConvertFrom-Json
$currentVersion = $confContent.version
Write-Info "Version actuelle : $currentVersion"

if ($Version -eq "") {
    # Proposer les 3 types de bump
    $parts = $currentVersion -split '\.'
    $major = [int]$parts[0]; $minor = [int]$parts[1]; $patch = [int]$parts[2]

    $bumpPatch = "$major.$minor.$($patch + 1)"
    $bumpMinor = "$major.$($minor + 1).0"
    $bumpMajor = "$($major + 1).0.0"

    Write-Host ""
    Write-Host "   Choisissez la nouvelle version :" -ForegroundColor White
    Write-Host "   [1] Patch  → $bumpPatch  (corrections de bugs)" -ForegroundColor Gray
    Write-Host "   [2] Minor  → $bumpMinor  (nouvelles fonctionnalités)" -ForegroundColor Gray
    Write-Host "   [3] Major  → $bumpMajor  (changements importants)" -ForegroundColor Gray
    Write-Host "   [4] Manuel → saisir moi-même" -ForegroundColor Gray
    Write-Host "   [Enter]    → garder $currentVersion" -ForegroundColor DarkGray
    Write-Host ""
    $choice = Read-Host "   Votre choix"

    switch ($choice) {
        "1" { $Version = $bumpPatch }
        "2" { $Version = $bumpMinor }
        "3" { $Version = $bumpMajor }
        "4" { $Version = Read-Host "   Entrez la version (ex: 3.1.0)" }
        ""  { $Version = $currentVersion }
        default {
            Write-Warn "Choix invalide — version inchangée ($currentVersion)"
            $Version = $currentVersion
        }
    }
}

# Valider le format semver
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Fail "Format de version invalide : '$Version' (attendu : X.Y.Z)"
    exit 1
}

if ($Version -ne $currentVersion) {
    Write-Step "Mise à jour de la version → $Version"

    # Remplacer dans tauri.conf.json
    $rawConf = Get-Content $tauriConf -Raw
    $rawConf = $rawConf -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
    Set-Content $tauriConf $rawConf -NoNewline -Encoding UTF8
    Write-Ok "tauri.conf.json mis à jour ($currentVersion → $Version)"

    # Commit automatique
    try {
        git add src-tauri/tauri.conf.json 2>&1 | Out-Null
        git commit -m "chore: bump version to $Version" 2>&1 | Out-Null
        Write-Ok "Commit de version créé"
    } catch {
        Write-Warn "Commit git échoué (continuons quand même)"
    }
} else {
    Write-Ok "Version inchangée : $Version"
}

# ── 3. Build ──────────────────────────────────────────────────────────────────
if (-not $SkipBuild) {
    Write-Step "Compilation (cela peut prendre 5-10 minutes)…"

    if ($signed) {
        $signingKey = (Get-Content $keyFile -Raw).Trim()
        $env:TAURI_SIGNING_PRIVATE_KEY = $signingKey
        Write-Ok "Clé de signature chargée"
    } else {
        Write-Warn "Build sans signature (auto-update désactivé)"
    }

    $buildStart = Get-Date
    try {
        & npm run tauri:build
        if ($LASTEXITCODE -ne 0) { throw "Build échoué (code $LASTEXITCODE)" }
    } catch {
        Write-Fail "Erreur de build : $_"
        exit 1
    } finally {
        # Effacer la clé de la mémoire
        $env:TAURI_SIGNING_PRIVATE_KEY = ""
        Remove-Variable signingKey -ErrorAction SilentlyContinue
    }

    $buildTime = [int]((Get-Date) - $buildStart).TotalSeconds
    Write-Ok "Build terminé en ${buildTime}s"
} else {
    Write-Warn "Build ignoré (-SkipBuild)"
}

# ── 4. Vérification des artefacts ─────────────────────────────────────────────
Write-Step "Artefacts générés"

$bundleDir = Join-Path $Root "src-tauri\target\release\bundle\nsis"
$artifacts = @{
    "Installeur"       = "LMU Stats Viewer_${Version}_x64-setup.exe"
    "Manifeste update" = "latest.json"
    "Archive update"   = "LMU Stats Viewer_${Version}_x64-setup.nsis.zip"
    "Signature"        = "LMU Stats Viewer_${Version}_x64-setup.nsis.zip.sig"
}

$allFound = $true
$filesToUpload = @()
foreach ($label in $artifacts.Keys) {
    $path = Join-Path $bundleDir $artifacts[$label]
    if (Test-Path $path) {
        $size = [math]::Round((Get-Item $path).Length / 1MB, 1)
        Write-Ok "$label : $($artifacts[$label]) (${size} MB)"
        $filesToUpload += $path
    } else {
        Write-Warn "$label introuvable : $($artifacts[$label])"
        if ($label -eq "Installeur") { $allFound = $false }
    }
}

if (-not $allFound) {
    Write-Fail "L'installeur est manquant — vérifiez les erreurs de build."
    exit 1
}

# ── 5. Push du commit de version ──────────────────────────────────────────────
if ($Version -ne $currentVersion) {
    Write-Step "Push du commit de version"
    try {
        git push origin V2 2>&1 | Out-Null
        Write-Ok "Commit pushé sur la branche V2"
    } catch {
        Write-Warn "Push git échoué — faites-le manuellement : git push origin V2"
    }
}

# ── 6. Instructions GitHub Release ────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Green
Write-Host "   Build v$Version terminé avec succès !" -ForegroundColor Green
Write-Host "════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Prochaines étapes — Release GitHub :" -ForegroundColor White
Write-Host ""
Write-Host "  1. Ouvrir la page de release :" -ForegroundColor Gray
Write-Host "     https://github.com/cparfait/lmustatsviewer/releases/new" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  2. Tag : v$Version  /  Titre : LMU Stats Viewer v$Version" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Fichiers à uploader (obligatoires) :" -ForegroundColor Gray
foreach ($f in $filesToUpload) {
    Write-Host "     • $(Split-Path $f -Leaf)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  4. Le dossier des artefacts :" -ForegroundColor Gray
Write-Host "     $bundleDir" -ForegroundColor DarkCyan
Write-Host ""

# Ouvrir le dossier des artefacts et la page GitHub
$openBundleDir = Read-Host "  Ouvrir le dossier des artefacts dans l'Explorateur ? [O/n]"
if ($openBundleDir -ne "n" -and $openBundleDir -ne "N") {
    Start-Process "explorer.exe" $bundleDir
}

$openGithub = Read-Host "  Ouvrir la page GitHub Releases dans le navigateur ? [O/n]"
if ($openGithub -ne "n" -and $openGithub -ne "N") {
    Start-Process "https://github.com/cparfait/lmustatsviewer/releases/new?tag=v$Version&title=LMU+Stats+Viewer+v$Version"
}

Write-Host ""
