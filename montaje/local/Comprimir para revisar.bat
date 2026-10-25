@echo off
rem Arrastra uno o varios videos encima de este archivo: deja al lado una copia ligera (540p) para revisar.
chcp 65001 >NUL
where ffmpeg >NUL 2>NUL || (echo Falta ffmpeg. Instalalo con: winget install --id Gyan.FFmpeg -e & pause & exit /b 1)
if "%~1"=="" (echo Arrastra un video encima de este archivo. & pause & exit /b 0)
:siguiente
if "%~1"=="" goto fin
echo.
echo Comprimiendo %~nx1 ...
ffmpeg -v error -stats -y -i "%~1" -vf "scale='if(lt(iw,ih),min(540,iw),-2)':'if(lt(iw,ih),-2,min(540,ih))'" -c:v libx264 -crf 30 -preset fast -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart "%~dpn1-revisar.mp4"
if errorlevel 1 (echo No se pudo comprimir %~nx1) else (echo Listo: %~dpn1-revisar.mp4)
shift
goto siguiente
:fin
echo.
pause
