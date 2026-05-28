# release.ps1 - Script de release LMU Stats Viewer
#
# Usage :
#   .\release.ps1                 -> invite version, build, instructions GitHub
#   .\release.ps1 -Version 3.1.0  -> force une version precise (pas d'invite)
#   .\release.ps1 -SkipBuild      -> repackage sans recompiler
#
# Prerequis : Node.js, Rust/Cargo, _lmu_updater.key dans le dossier racine.

param(
    [string]$Version  = "",
    [switch]$SkipBuild = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step { param($msg) Write-Host "" ; Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   !!  $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "   XX  $msg" -ForegroundColor Red }

$Root = $PSScriptRoot
if (-not $Root) { $Root = Get-Location }
Set-Location $Root

$tauriConf = Join-Path $Root "src-tauri\tauri.conf.json"
$keyFile   = Join-Path $Root "_lmu_updater.key"

# Titre
Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "   LMU Stats Viewer - Release Builder"      -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta

# Lecture de la version actuelle
if (-not (Test-Path $tauriConf)) {
    Write-Fail "tauri.conf.json introuvable - lancez le script depuis la racine du projet."
    exit 1
}
$rawJson = [System.IO.File]::ReadAllText($tauriConf, [System.Text.UTF8Encoding]::new($false))
if ($rawJson -match '"version"\s*:\s*"([^"]+)"') {
    $currentVersion = $Matches[1]
} else {
    Write-Fail "Impossible de lire la version dans tauri.conf.json"
    exit 1
}

# Invite de version
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
    Write-Host "    [1]  Patch  ->  $bumpPatch   (corrections de bugs)"      -ForegroundColor Gray
    Write-Host "    [2]  Minor  ->  $bumpMinor   (nouvelles fonctionnalites)" -ForegroundColor Gray
    Write-Host "    [3]  Major  ->  $bumpMajor   (changements importants)"    -ForegroundColor Gray
    Write-Host "    [4]  Autre  ->  saisir manuellement"                      -ForegroundColor Gray
    Write-Host "  [Entree]  ->  garder $currentVersion (build sans bump)"     -ForegroundColor DarkGray
    Write-Host ""

    $choice = (Read-Host "  Choix").Trim()

    if ($choice -eq "1") {
        $Version = $bumpPatch
    } elseif ($choice -eq "2") {
        $Version = $bumpMinor
    } elseif ($choice -eq "3") {
        $Version = $bumpMajor
    } elseif ($choice -eq "4") {
        Write-Host ""
        $Version = (Read-Host "  Version (ex: 3.1.0)").Trim()
    } elseif ($choice -eq "") {
        $Version = $currentVersion
    } else {
        Write-Warn "Choix non reconnu - version inchangee."
        $Version = $currentVersion
    }
}

# Validation semver
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Fail "Format invalide : '$Version'  (attendu : X.Y.Z)"
    exit 1
}

Write-Host ""
Write-Host "  --------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Version cible : $Version" -ForegroundColor White
if ($Version -ne $currentVersion) {
    Write-Host "  Bump : $currentVersion -> $Version" -ForegroundColor DarkGray
}
Write-Host "  --------------------------------------------" -ForegroundColor DarkGray

# Prerequis
Write-Step "Prerequis"

$signed = $false
if (-not (Test-Path $keyFile)) {
    Write-Warn "_lmu_updater.key introuvable - build sans signature (auto-update desactive)"
} else {
    Write-Ok "_lmu_updater.key trouve"
    $signed = $true
}

# Bump de version dans tauri.conf.json
if ($Version -ne $currentVersion) {
    Write-Step "Mise a jour de la version"

    $rawConf = [System.IO.File]::ReadAllText($tauriConf, [System.Text.UTF8Encoding]::new($false))
    $rawConf = $rawConf -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
    [System.IO.File]::WriteAllText($tauriConf, $rawConf, [System.Text.UTF8Encoding]::new($false))
    Write-Ok "tauri.conf.json mis a jour ($currentVersion -> $Version)"

    try {
        git add src-tauri/tauri.conf.json 2>&1 | Out-Null
        $msg = "chore: bump version to $Version"
        git commit -m $msg 2>&1 | Out-Null
        Write-Ok "Commit cree"
    } catch {
        Write-Warn "Commit git echoue (continuons quand meme)"
    }
} else {
    Write-Step "Version"
    Write-Ok "Version inchangee : $Version"
}

# Build
if (-not $SkipBuild) {
    Write-Step "Compilation (5-10 min)"

    if ($signed) {
        $signingKey = (Get-Content $keyFile -Raw).Trim()
        $env:TAURI_SIGNING_PRIVATE_KEY = $signingKey
        Write-Ok "Cle de signature chargee"
    } else {
        Write-Warn "Build sans signature"
    }

    $buildStart = Get-Date
    try {
        & npm run tauri:build
        if ($LASTEXITCODE -ne 0) { throw "Build echoue (code $LASTEXITCODE)" }
    } catch {
        Write-Fail "Erreur de build : $_"
        exit 1
    } finally {
        $env:TAURI_SIGNING_PRIVATE_KEY = ""
        Remove-Variable signingKey -ErrorAction SilentlyContinue
    }

    $elapsed = [int]((Get-Date) - $buildStart).TotalSeconds
    Write-Ok "Compile en ${elapsed}s"
} else {
    Write-Step "Build"
    Write-Warn "Compilation ignoree (-SkipBuild)"
}

# Artefacts
Write-Step "Artefacts"

$bundleDir = Join-Path $Root "src-tauri\target\release\bundle\nsis"
$names = @(
    "LMU Stats Viewer_${Version}_x64-setup.exe",
    "latest.json",
    "LMU Stats Viewer_${Version}_x64-setup.nsis.zip",
    "LMU Stats Viewer_${Version}_x64-setup.nsis.zip.sig"
)

$allFound     = $true
$filesToUpload = @()
foreach ($name in $names) {
    $path = Join-Path $bundleDir $name
    if (Test-Path $path) {
        $size = [math]::Round((Get-Item $path).Length / 1MB, 2)
        Write-Ok "$name  (${size} MB)"
        $filesToUpload += $path
    } else {
        Write-Warn "Introuvable : $name"
        if ($name -like "*setup.exe") { $allFound = $false }
    }
}

if (-not $allFound) {
    Write-Fail "L'installeur est manquant - verifiez les erreurs ci-dessus."
    exit 1
}

# Push
if ($Version -ne $currentVersion) {
    Write-Step "Push"
    try {
        git push origin V2 2>&1 | Out-Null
        Write-Ok "Commit de version pousse (branche V2)"
    } catch {
        Write-Warn "Push echoue - faites-le manuellement : git push origin V2"
    }
}

# Recapitulatif
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "   Build v$Version termine avec succes !"   -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  GitHub Release :" -ForegroundColor White
Write-Host "    Tag   : v$Version" -ForegroundColor Gray
Write-Host "    Titre : LMU Stats Viewer v$Version" -ForegroundColor Gray
Write-Host ""
Write-Host "  Fichiers a joindre :" -ForegroundColor White
foreach ($f in $filesToUpload) {
    Write-Host "    - $(Split-Path $f -Leaf)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  Dossier : $bundleDir" -ForegroundColor DarkCyan
Write-Host ""

$r1 = (Read-Host "  Ouvrir le dossier artefacts dans l'Explorateur ? [O/n]").Trim()
if ($r1 -notmatch '^[nN]') {
    Start-Process "explorer.exe" $bundleDir
}

$r2 = (Read-Host "  Ouvrir GitHub Releases dans le navigateur ? [O/n]").Trim()
if ($r2 -notmatch '^[nN]') {
    $url = "https://github.com/cparfait/lmustatsviewer/releases/new?tag=v$Version&title=LMU+Stats+Viewer+v$Version"
    Start-Process $url
}

Write-Host ""
