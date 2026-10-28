@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0BurgerTin-Setup.ps1"
if errorlevel 1 (
  echo.
  echo La instalacion no termino correctamente. Revisa el mensaje anterior.
  pause
)
endlocal
