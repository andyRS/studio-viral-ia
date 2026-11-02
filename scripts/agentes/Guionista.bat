@echo off
rem Abre OpenCode con el agente guionista (DeepSeek V4.1 Flash gratis) en la carpeta del proyecto.
cd /d "%~dp0..\.."
git pull
opencode --agent guionista
