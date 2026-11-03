@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "APP_DIR=%CD%"
set "EXIT_CODE=0"

echo.
echo  ============================================
echo   AI RADAR - lokalni start
echo  ============================================
echo   Slozka: %APP_DIR%
echo.

where node >nul 2>nul
if errorlevel 1 goto :no_node

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR goto :no_node
if %NODE_MAJOR% LSS 24 goto :old_node
echo  [OK] Node.js:
node --version

if not exist "node_modules" (
  echo  [INFO] Chybi zavislosti, spoustim npm install...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :install_fail
)

if not exist ".env.local" (
  echo.
  echo  [UPOZORNENI] Soubor .env.local neexistuje.
  echo  Aplikace pobezi bez API klicu: RSS, filtry, knihovna i export funguji.
  echo  Pro @handle a Gemini analyzu zkopiruj .env.example na .env.local a dopln klice.
  echo.
)

if not exist ".next\BUILD_ID" (
  echo  [INFO] Chybi produkcni build, spoustim npm run build...
  call npm run build
  if errorlevel 1 goto :build_fail
)

echo.
echo  Spoustim AI Radar na http://127.0.0.1:3000
echo  Ukonceni: Ctrl+C
echo.
call npm run start
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" goto :fail
endlocal & exit /b 0

:no_node
echo  [CHYBA] Node.js neni nainstalovany nebo neni v PATH.
echo  Nainstaluj Node.js 24 LTS z https://nodejs.org a spust START.cmd znovu.
set "EXIT_CODE=1"
goto :fail

:old_node
echo  [CHYBA] Je potreba Node.js 24 nebo novejsi, nalezeno: %NODE_MAJOR%
echo  Aplikace pouziva zabudovane SQLite z Node.js 24.
set "EXIT_CODE=1"
goto :fail

:install_fail
echo  [CHYBA] npm install selhal. Zkontroluj pripojeni k internetu.
set "EXIT_CODE=1"
goto :fail

:build_fail
echo  [CHYBA] Build selhal. Chybova zprava je vyse.
echo  Zkus smazat slozku .next a spustit START.cmd znovu.
set "EXIT_CODE=1"
goto :fail

:fail
echo.
echo  ==== Diagnostika ====
echo   Exit code: %EXIT_CODE%
echo   Node:
node --version 2>nul
echo   npm:
call npm --version 2>nul
echo   Slozka: %APP_DIR%
echo   Logy: spust "npm run build" nebo "npm run start" rucne pro plny vystup.
echo.
pause
endlocal & exit /b %EXIT_CODE%
