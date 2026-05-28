# release.ps1 - Script de release LMU Stats Viewer
#
# Usage :
#   .\release.ps1                        -> invite version, build, instructions GitHub
#   .\release.ps1 -Version 3.1.0         -> force une version precise (pas d'invite)
#   .\release.ps1 -SkipBuild             -> repackage sans recompiler
#   .\release.ps1 -Branch main           -> pousse sur main au lieu de V2 (test)
#
# Prerequis : Node.js, Rust/Cargo, _lmu_updater.key dans le dossier racine.

param(
    [string]$Version   = "",
    [string]$Branch    = "V2",
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

$packageJson = Join-Path $Root "package.json"
$tauriConf  = Join-Path $Root "src-tauri\tauri.conf.json"
$cargoToml  = Join-Path $Root "src-tauri\Cargo.toml"
$keyFile    = Join-Path $Root "_lmu_updater.key"

# Titre
Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "   LMU Stats Viewer - Release Builder"      -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta

# Lecture de la version actuelle depuis package.json (source de verite)
if (-not (Test-Path $packageJson)) {
    Write-Fail "package.json introuvable - lancez le script depuis la racine du projet."
    exit 1
}
$rawJson = [System.IO.File]::ReadAllText($packageJson, [System.Text.UTF8Encoding]::new($false))
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

    # Bump package.json (source de verite)
    $rawPkg = [System.IO.File]::ReadAllText($packageJson, [System.Text.UTF8Encoding]::new($false))
    $rawPkg = $rawPkg -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
    [System.IO.File]::WriteAllText($packageJson, $rawPkg, [System.Text.UTF8Encoding]::new($false))
    Write-Ok "package.json mis a jour ($currentVersion -> $Version)"

    # Bump tauri.conf.json
    $rawConf = [System.IO.File]::ReadAllText($tauriConf, [System.Text.UTF8Encoding]::new($false))
    $rawConf = $rawConf -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
    [System.IO.File]::WriteAllText($tauriConf, $rawConf, [System.Text.UTF8Encoding]::new($false))
    Write-Ok "tauri.conf.json mis a jour ($currentVersion -> $Version)"

    # Bump Cargo.toml (affiche pendant la compilation)
    $rawCargo = [System.IO.File]::ReadAllText($cargoToml, [System.Text.UTF8Encoding]::new($false))
    $rawCargo = $rawCargo -replace '^version\s*=\s*"[^"]+"', "version = `"$Version`""
    [System.IO.File]::WriteAllText($cargoToml, $rawCargo, [System.Text.UTF8Encoding]::new($false))
    Write-Ok "Cargo.toml mis a jour ($currentVersion -> $Version)"

    try {
        git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock 2>&1 | Out-Null
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
        $signingKey = [System.IO.File]::ReadAllText($keyFile, [System.Text.UTF8Encoding]::new($false)).Trim()
        $env:TAURI_SIGNING_PRIVATE_KEY          = $signingKey
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
        Write-Ok "Cle de signature chargee (sans mot de passe)"
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
        $env:TAURI_SIGNING_PRIVATE_KEY          = ""
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
        Remove-Variable signingKey -ErrorAction SilentlyContinue
    }

    $elapsed = [int]((Get-Date) - $buildStart).TotalSeconds
    Write-Ok "Compile en ${elapsed}s"
} else {
    Write-Step "Build"
    Write-Warn "Compilation ignoree (-SkipBuild)"
}

# Artefacts  (Tauri v2 : .exe + .exe.sig — pas de .nsis.zip)
Write-Step "Artefacts"

$bundleDir = Join-Path $Root "src-tauri\target\release\bundle\nsis"
$exeName   = "LMU Stats Viewer_${Version}_x64-setup.exe"
$sigName   = "LMU Stats Viewer_${Version}_x64-setup.exe.sig"
$jsonName  = "latest.json"
$exePath   = Join-Path $bundleDir $exeName
$sigPath   = Join-Path $bundleDir $sigName
$jsonPath  = Join-Path $bundleDir $jsonName

# Verifier l'installeur
if (-not (Test-Path $exePath)) {
    Write-Fail "Installeur introuvable : $exeName"
    exit 1
}
Write-Ok "$exeName  ($([math]::Round((Get-Item $exePath).Length / 1MB, 2)) MB)"

# Verifier la signature
$signature = ""
if (Test-Path $sigPath) {
    Write-Ok "$sigName"
    $signature = [System.IO.File]::ReadAllText($sigPath, [System.Text.UTF8Encoding]::new($false)).Trim()
} else {
    Write-Warn "$sigName introuvable - latest.json ne contiendra pas la signature"
}

# Generer latest.json (requis par le plugin updater Tauri)
$repoBase    = "https://github.com/cparfait/lmustatsviewer"
$pubDate     = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
# GitHub remplace les espaces par des points dans les noms d'assets
$exeNameUrl  = $exeName -replace ' ', '.'
$exeUrl      = "$repoBase/releases/download/v$Version/$exeNameUrl"

# Echapper la signature pour JSON (remplacer les retours a la ligne)
$sigJson   = $signature -replace '\\', '\\' -replace '"', '\"' -replace "`r`n", '\n' -replace "`n", '\n'

$latestContent = "{`n  `"version`": `"$Version`",`n  `"notes`": `"LMU Stats Viewer v$Version`",`n  `"pub_date`": `"$pubDate`",`n  `"platforms`": {`n    `"windows-x86_64`": {`n      `"signature`": `"$sigJson`",`n      `"url`": `"$exeUrl`"`n    }`n  }`n}"
[System.IO.File]::WriteAllText($jsonPath, $latestContent, [System.Text.UTF8Encoding]::new($false))
Write-Ok "latest.json genere"

$filesToUpload = @($exePath, $sigPath, $jsonPath)

if ($signature -eq "") {
    Write-Warn "Signature absente - l'auto-update ne fonctionnera pas sans le .exe.sig"
}

# Push branche + tag (depuis V2)
if ($Version -ne $currentVersion) {
    Write-Step "Push (branche $Branch)"
    try {
        git push origin $Branch 2>&1 | Out-Null
        Write-Ok "Branche V2 poussee"
    } catch {
        Write-Warn "Push branche echoue - faites-le manuellement : git push origin $Branch"
    }

    Write-Step "Tag v$Version"
    try {
        git tag -a "v$Version" -m "LMU Stats Viewer v$Version" 2>&1 | Out-Null
        git push origin "v$Version" 2>&1 | Out-Null
        Write-Ok "Tag v$Version pousse (pointe sur V2)"
    } catch {
        Write-Warn "Tag echoue - faites-le manuellement : git tag -a v$Version -m 'LMU Stats Viewer v$Version' && git push origin v$Version"
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
