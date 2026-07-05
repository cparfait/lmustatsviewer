# fetch-vosk.ps1 - Download the Vosk native lib (Windows) + small offline speech
# models into src-tauri/resources/stt/ (kept out of git). Used by the spotter
# Couche 2 (push-to-talk, closed-grammar voice commands).
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/fetch-vosk.ps1
#
# Small models (~40 MB each) are enough for a closed command grammar. They are
# extracted then renamed to models/<2-letter-code> so the backend resolves them
# by language (cf. stt.rs::model_dir). Re-running skips files already present.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # speeds up Invoke-WebRequest

# --- Configuration ---
# Native library (libvosk.dll + import lib + header), Windows x64.
$VoskVersion = "0.3.45"
$LibUrl = "https://github.com/alphacep/vosk-api/releases/download/v$VoskVersion/vosk-win64-$VoskVersion.zip"

# language code (2 letters) -> small model archive on alphacephei.com.
$Models = @(
  @{ code = "en"; name = "vosk-model-small-en-us-0.15" },
  @{ code = "fr"; name = "vosk-model-small-fr-0.22" },
  @{ code = "es"; name = "vosk-model-small-es-0.42" },
  @{ code = "de"; name = "vosk-model-small-de-0.15" }
)
$ModelBase = "https://alphacephei.com/vosk/models"

# --- Paths ---
$Root = Split-Path -Parent $PSScriptRoot
$SttDir = Join-Path $Root "src-tauri/resources/stt"
$LibDir = Join-Path $SttDir "lib"
$ModelsDir = Join-Path $SttDir "models"
New-Item -ItemType Directory -Force -Path $SttDir, $LibDir, $ModelsDir | Out-Null

# --- Native library ---
if (Test-Path (Join-Path $LibDir "libvosk.dll")) {
  Write-Host "[libvosk] already present - skipped"
}
else {
  Write-Host "[libvosk] downloading $LibUrl"
  $zip = Join-Path $env:TEMP "vosk-win64.zip"
  Invoke-WebRequest -Uri $LibUrl -OutFile $zip
  $tmp = Join-Path $env:TEMP "vosk-win64"
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  # The archive has a top-level folder (e.g. vosk-win64-0.3.45/) with the files.
  Get-ChildItem -Recurse -File $tmp |
    Where-Object { $_.Name -match '\.(dll|lib|h)$' } |
    ForEach-Object { Copy-Item $_.FullName -Destination $LibDir -Force }
  Remove-Item $zip -Force
  Remove-Item -Recurse -Force $tmp
  if (Test-Path (Join-Path $LibDir "libvosk.dll")) {
    Write-Host "[libvosk] OK -> $LibDir"
  }
  else {
    Write-Warning "[libvosk] libvosk.dll not found after extraction - check the archive."
  }
}

# --- Models ---
foreach ($m in $Models) {
  $dest = Join-Path $ModelsDir $m.code
  if (Test-Path (Join-Path $dest "conf")) {
    Write-Host "[model:$($m.code)] already present - skipped"
    continue
  }
  try {
    $url = "$ModelBase/$($m.name).zip"
    Write-Host "[model:$($m.code)] downloading $($m.name)"
    $zip = Join-Path $env:TEMP "$($m.name).zip"
    Invoke-WebRequest -Uri $url -OutFile $zip
    $tmp = Join-Path $env:TEMP "vosk-model-$($m.code)"
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    # Archive contains a single top-level folder = the model -> move its content.
    $inner = Get-ChildItem -Directory $tmp | Select-Object -First 1
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Move-Item $inner.FullName $dest
    Remove-Item $zip -Force
    Remove-Item -Recurse -Force $tmp
    Write-Host "[model:$($m.code)] OK -> $dest"
  }
  catch {
    Write-Warning "[model:$($m.code)] failed: $($_.Exception.Message)"
    Write-Warning "  -> check the model name at the top of the script (versions change) and re-run."
  }
}

# --- Build hint ---
# STT is part of every build (vosk is a mandatory Cargo dependency): the native
# lib below is REQUIRED to compile. Language models are no longer bundled — the
# app downloads them on demand (Config -> Audio/Voice, cf. commands/assets.rs);
# fetching them here only serves local dev (they are picked up as a dev base).
#
# Linking: build.rs adds resources/stt/lib to the linker search path. On Windows the
# crate links `libvosk.lib`. If only libvosk.dll is present (no import lib), generate it:
#   dumpbin /exports libvosk.dll        (list symbols, build a libvosk.def)
#   lib /def:libvosk.def /out:libvosk.lib /machine:x64
$hasLib = Test-Path (Join-Path $LibDir "libvosk.lib")
Write-Host ""
Write-Host "Native lib in: $LibDir (libvosk.lib present: $hasLib)"
if (-not $hasLib) {
  Write-Warning "libvosk.lib missing -> MSVC link will fail. Generate it from libvosk.dll (see comment above)."
}
Write-Host ""
Write-Host "Done. Contents of ${SttDir}:"
Get-ChildItem $SttDir | Select-Object FullName | Format-Table -AutoSize
