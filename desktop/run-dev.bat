@echo off
chcp 65001 >nul
title DOMEO - Podbor (zapusk iz koda)
cd /d "C:\Users\Alex\Desktop\Petrovich\domeo-basket-matcher"

echo ============================================================
echo  DOMEO - Podbor po korzine : zapusk iz koda
echo ============================================================
echo.

where git >nul 2>nul
if errorlevel 1 echo [!] git ne nayden - propuskayu obnovlenie koda
if not errorlevel 1 echo Obnovlyayu kod s GitHub...
if not errorlevel 1 call git pull
echo.

cd desktop
if not exist node_modules echo Pervaya ustanovka zavisimostey (odin raz, neskolko minut)...
if not exist node_modules call npm install
echo.

echo Zapuskayu prilozhenie. NE ZAKRYVAYTE eto okno, poka rabotaete.
call npm start

echo.
echo ------------------------------------------------------------
echo Prilozhenie zakryto. Esli vyshe oshibka - skopiruyte tekst i prishlite.
echo ------------------------------------------------------------
pause
