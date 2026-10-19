# fetch-sherpa.ps1 - Download the sherpa-onnx native libs (Windows x64, shared build)
# into src-tauri/resources/stt/sherpa/ (kept out of git). Used by the Parakeet
# dictation engine (stt_parakeet.rs, crate `sherpa-onnx` with the `shared` feature).
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/fetch-sherpa.ps1
#
# The crate links against sherpa-onnx-c-api.lib found through SHERPA_ONNX_LIB_DIR
# (src-tauri/.cargo/config.toml). The DLLs are copied next to the dev binary by
# build.rs and placed at the install root by the bundle (tauri.conf.json), like libvosk.
# The Parakeet MODEL itself (~640 MB) is downloaded on demand from the app (Settings).
# Re-running skips files already present.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# --- Configuration (must match the `sherpa-onnx` crate version in Cargo.toml) ---
$Version = "1.13.8"
$Archive = "sherpa-onnx-v$Version-win-x64-shared-MT-Release-lib"
$Url = "https://github.com/k2-fsa/sherpa-onnx/releases/download/v$Version/$Archive.tar.bz2"
$Keep = @("sherpa-onnx-c-api.dll", "sherpa-onnx-c-api.lib", "onnxruntime.dll", "onnxruntime.lib", "onnxruntime_providers_shared.dll")

# --- Paths ---
$Root = Split-Path -Parent $PSScriptRoot
$LibDir = Join-Path $Root "src-tauri/resources/stt/sherpa"
New-Item -ItemType Directory -Force -Path $LibDir | Out-Null

$missing = $Keep | Where-Object { -not (Test-Path (Join-Path $LibDir $_)) }
if (-not $missing) {
  Write-Host "[sherpa-onnx] already present - skipped"
  exit 0
}

Write-Host "[sherpa-onnx] downloading $Url"
$tmp = Join-Path $env:TEMP "sherpa-onnx-$Version"
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$tarball = Join-Path $tmp "$Archive.tar.bz2"
Invoke-WebRequest -Uri $Url -OutFile $tarball
# Windows 10+ ships bsdtar (System32\tar.exe), which reads .tar.bz2. Called by full
# path: a GNU tar earlier in PATH (Git for Windows) reads "C:" as a remote host.
& (Join-Path $env:SystemRoot "System32\tar.exe") -xjf $tarball -C $tmp
foreach ($f in $Keep) {
  Copy-Item (Join-Path $tmp "$Archive/lib/$f") -Destination $LibDir -Force
}
Remove-Item -Recurse -Force $tmp
Write-Host "[sherpa-onnx] OK -> $LibDir"
