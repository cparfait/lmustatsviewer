# fetch-piper.ps1 - Download the Piper engine (Windows) + neural voice models
# into src-tauri/resources/tts/ (kept out of git).
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/fetch-piper.ps1
#
# Voices are configurable below. Prefer permissive licences (MIT / CC-BY).
# If a download fails (404), change the voice path and re-run; other files are
# not lost.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # speeds up Invoke-WebRequest

# --- Configuration ---
$PiperRelease = "2023.11.14-2"
$PiperUrl = "https://github.com/rhasspy/piper/releases/download/$PiperRelease/piper_windows_amd64.zip"

# language code (2 letters) -> voice path on HuggingFace rhasspy/piper-voices
# out = nom de fichier (= id de la voix). "<langue>" sert de voix par defaut.
$Voices = @(
  @{ out = "en"; path = "en/en_US/ryan/medium/en_US-ryan-medium" },
  @{ out = "en_GB-alan-medium"; path = "en/en_GB/alan/medium/en_GB-alan-medium" },
  @{ out = "fr"; path = "fr/fr_FR/tom/medium/fr_FR-tom-medium" },
  @{ out = "fr_FR-siwis-medium"; path = "fr/fr_FR/siwis/medium/fr_FR-siwis-medium" },
  @{ out = "fr_FR-upmc-medium"; path = "fr/fr_FR/upmc/medium/fr_FR-upmc-medium" },
  @{ out = "es"; path = "es/es_ES/davefx/medium/es_ES-davefx-medium" },
  @{ out = "es_MX-claude-high"; path = "es/es_MX/claude/high/es_MX-claude-high" },
  @{ out = "de"; path = "de/de_DE/thorsten/medium/de_DE-thorsten-medium" },
  @{ out = "de_DE-eva_k-x_low"; path = "de/de_DE/eva_k/x_low/de_DE-eva_k-x_low" }
)
$HfBase = "https://huggingface.co/rhasspy/piper-voices/resolve/main"

# --- Paths ---
$Root = Split-Path -Parent $PSScriptRoot
$TtsDir = Join-Path $Root "src-tauri/resources/tts"
$PiperDir = Join-Path $TtsDir "piper"
$VoicesDir = Join-Path $TtsDir "voices"
New-Item -ItemType Directory -Force -Path $TtsDir, $VoicesDir | Out-Null

# --- Piper binary ---
if (Test-Path (Join-Path $PiperDir "piper.exe")) {
  Write-Host "[piper] already present - skipped"
}
else {
  Write-Host "[piper] downloading $PiperUrl"
  $zip = Join-Path $env:TEMP "piper_windows_amd64.zip"
  Invoke-WebRequest -Uri $PiperUrl -OutFile $zip
  Write-Host "[piper] extracting..."
  # The archive contains a top-level "piper/" folder -> extract into tts/
  Expand-Archive -Path $zip -DestinationPath $TtsDir -Force
  Remove-Item $zip -Force
  if (Test-Path (Join-Path $PiperDir "piper.exe")) {
    Write-Host "[piper] OK -> $PiperDir"
  }
  else {
    Write-Warning "[piper] piper.exe not found after extraction - check the archive."
  }
}

# --- Voices ---
foreach ($v in $Voices) {
  $code = $v.out
  $onnxUrl = "$HfBase/$($v.path).onnx"
  $jsonUrl = "$HfBase/$($v.path).onnx.json"
  $onnxOut = Join-Path $VoicesDir "$code.onnx"
  $jsonOut = Join-Path $VoicesDir "$code.onnx.json"

  if ((Test-Path $onnxOut) -and (Test-Path $jsonOut)) {
    Write-Host "[voice:$code] already present - skipped"
    continue
  }
  try {
    Write-Host "[voice:$code] $($v.path)"
    Invoke-WebRequest -Uri $onnxUrl -OutFile $onnxOut
    Invoke-WebRequest -Uri $jsonUrl -OutFile $jsonOut
    Write-Host "[voice:$code] OK"
  }
  catch {
    Write-Warning "[voice:$code] failed ($onnxUrl): $($_.Exception.Message)"
    Write-Warning "  -> adjust the voice path at the top of the script and re-run."
  }
}

Write-Host ""
Write-Host "Done. Contents of ${TtsDir}:"
Get-ChildItem -Recurse $TtsDir | Select-Object FullName | Format-Table -AutoSize
