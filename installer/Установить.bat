@echo off
rem Устанавливает расширение «DOMEO · Подбор по корзине» в Chrome и Яндекс.Браузер
rem через политику force-install. Расширение скачается само и будет авто-обновляться.
rem Нужны права администратора (политика пишется в HKLM).

net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)

set "EXTID=nlmlkoehkkkcipbhciedkgekbhoiboen"
set "UPD=https://workgeniy.github.io/domeo-basket-matcher/crx/update.xml"

reg add "HKLM\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist" /v 1 /t REG_SZ /d "%EXTID%;%UPD%" /f
reg add "HKLM\SOFTWARE\Policies\YandexBrowser\ExtensionInstallForcelist" /v 1 /t REG_SZ /d "%EXTID%;%UPD%" /f

echo.
echo ============================================================
echo  Готово. Расширение установлено через политику.
echo  ПЕРЕЗАПУСТИТЕ Chrome / Яндекс.Браузер полностью —
echo  расширение подтянется само и дальше будет обновляться само.
echo ============================================================
echo.
pause
