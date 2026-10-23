@echo off
rem Abre el servidor de montaje en este PC (GPU NVIDIA). Deja la ventana abierta mientras montas.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1"
pause
