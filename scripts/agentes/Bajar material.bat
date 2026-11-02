@echo off
rem Descarga a Descargas\EstudioViral\<proyecto> el material que Claude aprobo (manifiesto del repositorio).
cd /d "%~dp0..\.."
git pull
set /p PROYECTO=Proyecto (por ejemplo daniel-21-dias): 
node scripts\material\descargar.mjs bajar --proyecto %PROYECTO%
pause
