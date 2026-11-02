# Guarda las claves opcionales del buscador (Pexels y Pixabay, gratis) en tu usuario de Windows.
# Se escriben aquí, no en ningún chat. Deja en blanco la que no tengas.
#   powershell -ExecutionPolicy Bypass -File scripts\agentes\claves.ps1
function Guardar($nombre, $donde) {
  $s = Read-Host "$nombre (de $donde; Enter para saltar)" -AsSecureString
  $t = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
  if ($t) { [Environment]::SetEnvironmentVariable($nombre, $t, "User"); Write-Host "  guardada $nombre" -ForegroundColor Green }
}
Guardar "PEXELS_API_KEY" "https://www.pexels.com/api/"
Guardar "PIXABAY_API_KEY" "https://pixabay.com/api/docs/"
Write-Host "Cierra y vuelve a abrir las ventanas de los agentes para que las usen."
