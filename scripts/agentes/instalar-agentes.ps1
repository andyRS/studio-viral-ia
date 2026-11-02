# Instala y comprueba los agentes de Estudio Viral (OpenCode + DeepSeek V4.1 Flash gratis) en este PC
# y crea accesos directos en el escritorio. Se puede ejecutar varias veces sin romper nada.
#   powershell -ExecutionPolicy Bypass -File scripts\agentes\instalar-agentes.ps1
$ErrorActionPreference = "Continue"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repo
function Paso($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  OK  $t" -ForegroundColor Green }
function Mal($t) { Write-Host "  !!  $t" -ForegroundColor Yellow; $script:fallos++ }
$fallos = 0

Paso "Proyecto en $repo"
git pull
if ($LASTEXITCODE -eq 0) { Ok "repositorio actualizado" } else { Mal "git pull falló: revisa la conexión o los cambios locales" }

Paso "Node.js"
$node = (node --version) 2>$null
if ($node) { Ok "Node $node" } else { Mal "Falta Node.js 18+ (https://nodejs.org)"; exit 1 }

Paso "OpenCode"
$oc = (opencode --version) 2>$null
if (-not $oc) { npm install -g opencode-ai; $oc = (opencode --version) 2>$null }
if ($oc) { Ok "OpenCode $oc" } else { Mal "No se pudo instalar OpenCode (npm install -g opencode-ai)" }

Paso "Agentes"
$lista = (opencode agent list) 2>$null | Out-String
foreach ($a in "guionista", "buscador") { if ($lista -match "$a \(primary\)") { Ok "agente $a" } else { Mal "no aparece el agente $a" } }

Paso "Modelo gratuito"
$mods = (opencode models opencode) 2>$null | Out-String
if ($mods -match "deepseek-v4.1-flash-free") { Ok "opencode/deepseek-v4.1-flash-free disponible" } else { Mal "no aparece opencode/deepseek-v4.1-flash-free (abre 'opencode' una vez y elige el modelo gratis)" }

Paso "Herramientas de los agentes"
npx -y tsx scripts/validar-guion.ts tests/fixtures/daniel_ep01_capitulo.json tests/fixtures/daniel_ep01_personajes.json | Out-Null
Ok "validador de guiones ejecutado"
node scripts/material/descargar.mjs lista --proyecto prueba | Out-Null
if ($LASTEXITCODE -eq 0) { Ok "herramienta de material lista" } else { Mal "scripts/material/descargar.mjs no arranca" }
foreach ($k in "PEXELS_API_KEY", "PIXABAY_API_KEY") {
  if ([Environment]::GetEnvironmentVariable($k, "User")) { Ok "$k configurada" } else { Write-Host "  --  $k sin configurar (opcional: scripts\agentes\claves.ps1)" }
}

Paso "Accesos directos en el escritorio"
$esc = [Environment]::GetFolderPath("Desktop")
$sh = New-Object -ComObject WScript.Shell
foreach ($n in @(@("Agente guionista", "Guionista.bat"), @("Agente buscador", "Buscador.bat"), @("Bajar material", "Bajar material.bat"))) {
  $l = $sh.CreateShortcut((Join-Path $esc "$($n[0]).lnk"))
  $l.TargetPath = Join-Path $repo "scripts\agentes\$($n[1])"
  $l.WorkingDirectory = $repo
  $l.Save(); Ok "$($n[0])"
}

Write-Host ""
if ($fallos) { Write-Host "Terminado con $fallos aviso(s): revisa las líneas marcadas con !!" -ForegroundColor Yellow }
else { Write-Host "Todo listo. Abre 'Agente guionista' o 'Agente buscador' en el escritorio." -ForegroundColor Green }
