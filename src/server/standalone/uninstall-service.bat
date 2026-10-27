@echo off
:: ============================================================================
:: MICROGENN · IRM Sync Unit - Windows Service Uninstaller
:: ============================================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Administrator rights required. Requesting elevation...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

title MICROGENN MIRM Sync - Windows Service Uninstaller
color 4F

echo ============================================================================
echo   MICROGENN MIRM PMS SYNC UNIT - UNINSTALL WINDOWS SERVICE
echo ============================================================================
echo.
cd /d "%~dp0"

echo Stopping service if running...
net stop MicroGennMirmSync >nul 2>&1

echo.
echo Removing service from services.msc...
node uninstall-service.js

echo.
echo Done. The service has been cleanly uninstalled.
echo.
pause
