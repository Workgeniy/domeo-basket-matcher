@echo off
chcp 65001 >nul
title DOMEO - Podbor (zapusk iz koda)
cd /d "C:\Users\Alex\Desktop\Petrovich\domeo-basket-matcher"

echo ============================================================
echo  DOMEO - Podbor po korzine : zapusk iz koda (dev)
echo ============================================================
echo.
echo [1/3] Obnovlyayu kod s GitHub...
git pull
echo.

cd desktop
if not exist "node_modules\" (
  echo [2/3] Pervaya ustanovka zavisimostey (odin raz, neskolko minut)...
  call npm install
) else (
  echo [2/3] Zavisimosti uzhe ustanovleny - propuskayu.
)
echo.

echo [3/3] Zapuskayu prilozhenie...
echo (Eto okno ne zakryvayte, poka rabotaete v prilozhenii.)
call npm start

echo.
echo Prilozhenie zakryto. Mozhno zakryt eto okno.
pause
