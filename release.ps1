# ─────────────────────────────────────────────────────────────────────────────
# release.ps1 — Script de release LMU Stats Viewer
#
# Usage :
#   .\release.ps1                  → demande la version, build, instructions GitHub
#   .\release.ps1 -Version 3.1.0   → force une version précise (pas d'invite)
#   .\release.ps1 -SkipBuild       → repackage sans recompiler (si déjà compilé)
#
# Prérequis : Node.js, Rust/Cargo, _lmu_updater.key dans le dossier racine.
# ─────────────────────────────────────────────────────────────────────────────

param(
    [string]$Version  = "",
    [switch]$SkipBuild = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step { param($msg) Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "   ✓  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   ⚠  $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "   ✗  $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "   →  $msg" -ForegroundColor Gray }

$Root = $PSScriptRoot
if (-not $Root) { $Root = Get-Location }
Set-Location $Root

$tauriConf = Join-Path $Root "src-tauri\tauri.conf.json"
$keyFile   = Join-Path $Root "_lmu_updater.key"

# ── Titre ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "   LMU Stats Viewer — Release Builder"       -ForegroundColor Magenta
Write-Host "════════════════════════════════════════════" -ForegroundColor Magenta

# ── Lecture de la version actuelle ────────────────────────────────────────────
if (-not (Test-Path $tauriConf)) {
    Write-Fail "tauri.conf.json introuvable — lancez le script depuis la racine du projet."
    exit 1
}
$currentVersion = (Get-Content $tauriConf -Raw | ConvertFrom-Json).version

# ── Invite de version (première interaction, avant tout le reste) ─────────────
if ($Version -eq "") {
    $parts     = $currentVersion -split '\.'
    $major     = [int]$parts[0]
    $minor     = [int]$parts[1]
    $patch     = [int]$parts[2]
    $bumpPatch = "$major.$minor.$($patch + 1)"
    $bumpMinor = "$major.$($minor + 1).0"
    $bumpMajor = "$($major + 1).0.0"

    Write-Host ""
    Write-Host "  Version actuelle : $currentVersion" -ForegroundColor White
    Write-Host ""
    Write-Host "  Nouvelle version :" -ForegroundColor White
    Write-Host "    [1]  Patch  →  $bumpPatch   (corrections de bugs)"       -ForegroundColor Gray
    Write-Host "    [2]  Minor  →  $bumpMinor   (nouvelles fonctionnalités)"  -ForegroundColor Gray
    Write-Host "    [3]  Major  →  $bumpMajor   (changements importants)"     -ForegroundColor Gray
    Write-Host "    [4]  Autre  →  saisir manuellement"                       -ForegroundColor Gray
    Write-Host "  [Entrée]  →  garder $currentVersion (build sans bump)"     -ForegroundColor DarkGray
    Write-Host ""

    $choice = Read-Host "  Choix"

    switch ($choice.Trim()) {
        "1"  { $Version = $bumpPatch }
        "2"  { $Version = $bumpMinor }
        "3"  { $Version = $bumpMajor }
        "4"  {
                Write-Host ""
                $Version = (Read-Host "  Version (ex: 3.1.0)").Trim()
             }
        ""   { $Version = $currentVersion }
        default {
            Write-Warn "Choix non reconnu — version inchangée."
            $Version = $currentVersion
        }
    }
}

# Validation semver
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Fail "Format invalide : '$Version'  (attendu : X.Y.Z)"
    exit 1
}

Write-Host ""
Write-Host "  ──────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  Version cible : $Version" -ForegroundColor White
if ($Version -ne $currentVersion) {
    Write-Host "  Bump : $currentVersion  →  $Version" -ForegroundColor DarkGray
}
Write-Host "  ──────────────────────────────────────────" -ForegroundColor DarkGray

# ── Prérequis ─────────────────────────────────────────────────────────────────
Write-Step "Prérequis"

if (-not (Test-Path $keyFile)) {
    Write-Warn "_lmu_updater.key introuvable — build sans signature (auto-update désactivé)"
    $signed = $false
} else {
    Write-Ok "_lmu_updater.key trouvé"
    $signed = $true
}

# ── Bump de version dans tauri.conf.json ──────────────────────────────────────
if ($Version -ne $currentVersion) {
    Write-Step "Mise à jour de la version"
    $rawConf = Get-Content $tauriConf -Raw
    $rawConf = $rawConf -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
    Set-Content $tauriConf $rawConf -NoNewline -Encoding UTF8
    Write-Ok "tauri.conf.json  ($currentVersion → $Version)"

    try {
        git add src-tauri/tauri.conf.json 2>&1 | Out-Null
        git commit -m "chore: bump version to $Version" 2>&1 | Out-Null
        Write-Ok "Commit créé"
    } catch {
        Write-Warn "Commit git échoué (continuons quand même)"
    }
} else {
    Write-Step "Version"
    Write-Ok "Version inchangée : $Version"
}

# ── Build ─────────────────────────────────────────────────────────────────────
if (-not $SkipBuild) {
    Write-Step "Compilation  (5-10 min — vous pouvez aller faire un café ☕)"

    if ($signed) {
        $signingKey = (Get-Content $keyFile -Raw).Trim()
        $env:TAURI_SIGNING_PRIVATE_KEY = $signingKey
        Write-Ok "Clé de signature chargée"
    }

    $buildStart = Get-Date
    try {
        & npm run tauri:build
        if ($LASTEXITCODE -ne 0) { throw "Build échoué (code $LASTEXITCODE)" }
    } catch {
        Write-Fail "Erreur de build : $_"
        exit 1
    } finally {
        $env:TAURI_SIGNING_PRIVATE_KEY = ""
        Remove-Variable signingKey -ErrorAction SilentlyContinue
    }

    $elapsed = [int]((Get-Date) - $buildStart).TotalSeconds
    Write-Ok "Compilé en ${elapsed}s"
} else {
    Write-Step "Build"
    Write-Warn "Compilation ignorée (-SkipBuild)"
}

# ── Artefacts ─────────────────────────────────────────────────────────────────
Write-Step "Artefacts"

$bundleDir = Join-Path $Root "src-tauri\target\release\bundle\nsis"
$artifacts = [ordered]@{
    "Installeur"       = "LMU Stats Viewer_${Version}_x64-setup.exe"
    "Manifeste update" = "latest.json"
    "Archive update"   = "LMU Stats Viewer_${Version}_x64-setup.nsis.zip"
    "Signature"        = "LMU Stats Viewer_${Version}_x64-setup.nsis.zip.sig"
}

$allFound     = $true
$filesToUpload = @()
foreach ($label in $artifacts.Keys) {
    $path = Join-Path $bundleDir $artifacts[$label]
    if (Test-Path $path) {
        $size = [math]::Round((Get-Item $path).Length / 1MB, 2)
        Write-Ok "$label  — $($artifacts[$label])  (${size} MB)"
        $filesToUpload += $path
    } else {
        Write-Warn "$label introuvable : $($artifacts[$label])"
        if ($label -eq "Installeur") { $allFound = $false }
    }
}

if (-not $allFound) {
    Write-Fail "L'installeur est manquant — vérifiez les erreurs ci-dessus."
    exit 1
}

# ── Push ──────────────────────────────────────────────────────────────────────
if ($Version -ne $currentVersion) {
    Write-Step "Push"
    try {
        git push origin V2 2>&1 | Out-Null
        Write-Ok "Commit de version pushé (branche V2)"
    } catch {
        Write-Warn "Push échoué — faites-le manuellement : git push origin V2"
    }
}

# ── Récap final ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Green
Write-Host "   ✓  Build v$Version terminé !"              -ForegroundColor Green
Write-Host "════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  GitHub Release — étapes :" -ForegroundColor White
Write-Host ""
Write-Host "    Tag   :  v$Version" -ForegroundColor Gray
Write-Host "    Titre :  LMU Stats Viewer v$Version" -ForegroundColor Gray
Write-Host ""
Write-Host "  Fichiers à joindre :" -ForegroundColor White
foreach ($f in $filesToUpload) {
    Write-Host "    • $(Split-Path $f -Leaf)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  Dossier : $bundleDir" -ForegroundColor DarkCyan
Write-Host ""

$r1 = Read-Host "  Ouvrir le dossier artefacts dans l'Explorateur ? [O/n]"
if ($r1 -notmatch '^[nN]') { Start-Process "explorer.exe" $bundleDir }

$r2 = Read-Host "  Ouvrir GitHub Releases dans le navigateur ? [O/n]"
if ($r2 -notmatch '^[nN]') {
    Start-Process "https://github.com/cparfait/lmustatsviewer/releases/new?tag=v$Version&title=LMU+Stats+Viewer+v$Version"
}

Write-Host ""
