# Servidor de montaje en ESTE PC (Windows + NVIDIA). Lo abre «Montar en mi PC.bat».
# La app (Estudio Viral) lo detecta sola en http://127.0.0.1:8765 y monta aquí, con la GPU;
# si está cerrado, usa el servidor de Fly como respaldo.
$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Estudio Viral · Montaje en este PC"
$montaje = Split-Path -Parent $PSScriptRoot
$envDir = Join-Path $env:USERPROFILE "Developer\montaje-env"
$whisperx = Join-Path $env:USERPROFILE "Developer\whisperx-env"
$py = Join-Path $envDir "Scripts\python.exe"

# Busca un Python real (el alias «python» de la Microsoft Store no sirve).
function Find-Python {
  $cands = @()
  try { $p = (& py -3 -c "import sys; print(sys.executable)" 2>$null); if ($p) { $cands += $p.Trim() } } catch {}
  $cands += Get-ChildItem -ErrorAction SilentlyContinue -Path "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe", "$env:ProgramFiles\Python3*\python.exe", "C:\Python3*\python.exe" | Sort-Object { [int]($_.Directory.Name -replace "\D", "") } -Descending | ForEach-Object { $_.FullName }
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -notmatch "WindowsApps") { $cands += $cmd.Source }
  $base = Join-Path $whisperx "pyvenv.cfg"
  if (Test-Path $base) { $h = (Get-Content $base | Where-Object { $_ -match "^home\s*=" }) -replace "^home\s*=\s*", ""; if ($h) { $cands += (Join-Path $h.Trim() "python.exe") } }
  foreach ($c in $cands) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

# ffmpeg es imprescindible para montar.
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "  Falta ffmpeg en este PC." -ForegroundColor Red
  Write-Host "  Instálalo con este comando, cierra esta ventana y vuelve a abrir «Montar en mi PC»:"
  Write-Host "    winget install --id Gyan.FFmpeg -e" -ForegroundColor Cyan
  Write-Host ""
  exit 1
}

$gpu = $null
try { $gpu = (& nvidia-smi --query-gpu=name --format=csv,noheader 2>$null | Select-Object -First 1) } catch {}
$nvenc = (& ffmpeg -hide_banner -encoders 2>$null | Select-String "h264_nvenc") -ne $null
$reuseWhisperx = Test-Path (Join-Path $whisperx "Lib\site-packages\faster_whisper")
$listo = Join-Path $envDir ".instalado"

if (-not (Test-Path $listo)) {
  Write-Host "Primera vez: preparando el entorno en $envDir (tarda unos minutos) ..." -ForegroundColor Yellow
  if (-not (Test-Path $py)) {
    $base = Find-Python
    if (-not $base) {
      Write-Host ""
      Write-Host "  No encuentro Python en este PC." -ForegroundColor Red
      Write-Host "  Instálalo con este comando, cierra esta ventana y vuelve a abrir «Montar en mi PC»:"
      Write-Host "    winget install --id Python.Python.3.11 -e" -ForegroundColor Cyan
      Write-Host ""
      exit 1
    }
    Write-Host "  Python: $base"
    & $base -m venv $envDir
    if (-not (Test-Path $py)) { Write-Host "  No se pudo crear el entorno en $envDir." -ForegroundColor Red; exit 1 }
  }
  & $py -m pip install -q --upgrade pip
  if ($reuseWhisperx) {
    # Reutiliza faster-whisper y torch con CUDA de WhisperX (sin tocar ese entorno ni descargar 3 GB).
    Set-Content -Encoding ascii (Join-Path $envDir "Lib\site-packages\whisperx-env.pth") (Join-Path $whisperx "Lib\site-packages")
    & $py -m pip install -q "fastapi==0.115.0" "uvicorn==0.30.6" "python-multipart==0.0.9"
  } else {
    & $py -m pip install -q -r (Join-Path $montaje "requirements.txt")
    # Librerías de NVIDIA para que Whisper use la tarjeta gráfica (sin instalar CUDA aparte).
    if ($LASTEXITCODE -eq 0 -and $gpu) { & $py -m pip install -q nvidia-cublas-cu12 "nvidia-cudnn-cu12==9.*" }
  }
  if ($LASTEXITCODE -ne 0) { Write-Host "  La instalación falló (mira el error de arriba). Vuelve a abrir «Montar en mi PC» para reintentar." -ForegroundColor Red; exit 1 }
  Set-Content -Encoding ascii $listo (Get-Date -Format s)
}

# Las DLL de NVIDIA instaladas con pip tienen que estar en el PATH.
foreach ($lib in "cublas", "cudnn") {
  $bin = Join-Path $envDir "Lib\site-packages\nvidia\$lib\bin"
  if (Test-Path $bin) { $env:PATH = "$bin;$env:PATH" }
}

$env:MONTAJE_LOCAL = "1"
$env:FONT_DIR = Join-Path $montaje "fonts"
$env:WHISPER_MODEL = "small"              # con la GPU sobra potencia: el modelo más preciso de los dos
$env:WHISPER_DEVICE = $(if ($gpu) { "cuda" } else { "cpu" })
$env:VIDEO_ENCODER = $(if ($gpu -and $nvenc) { "h264_nvenc" } else { "libx264" })
$env:X264_PRESET = "medium"
$env:ALLOWED_ORIGINS = "https://studio-viral-ia.vercel.app,http://localhost:3000"
$env:PYTHONIOENCODING = "utf-8"

Write-Host ""
Write-Host "  Montaje en este PC listo" -ForegroundColor Green
Write-Host "  GPU: $(if ($gpu) { $gpu } else { 'no detectada (se usa el procesador)' })"
Write-Host "  Whisper: $($env:WHISPER_DEVICE) · vídeo: $($env:VIDEO_ENCODER)"
Write-Host "  Deja esta ventana abierta mientras montas. Para apagarlo, ciérrala."
Write-Host ""
& $py -m uvicorn server:app --app-dir $montaje --host 127.0.0.1 --port 8765
