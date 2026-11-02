@echo off
rem Abre OpenCode con el agente buscador de material (licencias libres) en la carpeta del proyecto.
cd /d "%~dp0..\.."
git pull
opencode --agent buscador
