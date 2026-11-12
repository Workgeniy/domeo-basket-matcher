@echo off
rem Удаляет политику установки расширения DOMEO (расширение пропадёт из браузера).
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)
reg delete "HKLM\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist" /v 1 /f 2>nul
reg delete "HKLM\SOFTWARE\Policies\YandexBrowser\ExtensionInstallForcelist" /v 1 /f 2>nul
echo.
echo Политика удалена. Перезапустите браузер.
pause
