@echo off
:: ============================================================================
:: MICROGENN · IRM Sync Unit - Windows Service Auto-Installer
:: ============================================================================

:: Check for Administrator elevation
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Administrator rights required. Requesting elevation...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

title MICROGENN MIRM Sync - Windows Service Installer
color 1F

echo ============================================================================
echo   MICROGENN MIRM PMS SYNC UNIT - WINDOWS SERVICE SETUP
echo ============================================================================
echo.
echo Current directory: %~dp0
cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>&1
if %errorLevel% neq 0 (
    color 4F
    echo [ERROR] Node.js is NOT installed or NOT in system PATH!
    echo Please install Node.js 18 or higher from: https://nodejs.org
    echo After installing, restart this script.
    echo.
    pause
    exit /b 1
)

echo [1/3] Node.js detected:
node --version

:: Check if .env exists, if not copy from .env.example
if not exist ".env" (
    echo [INFO] .env not found. Creating from .env.example...
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [NOTICE] Created .env file. Please review your SQL Server credentials!
    )
)

echo.
echo [2/3] Installing/verifying npm dependencies (mssql, dotenv, node-windows)...
call npm install --omit=dev
if %errorLevel% neq 0 (
    color 4F
    echo [ERROR] npm install failed. Please check internet connection or npm config.
    pause
    exit /b 1
)

echo.
echo [3/3] Registering Windows Service in Service Control Manager...
node install-service.js
if %errorLevel% neq 0 (
    color 4F
    echo [ERROR] Service registration failed.
    pause
    exit /b 1
)

echo.
echo ============================================================================
echo   INSTALLATION COMPLETED!
echo ============================================================================
echo.
echo The 'MicroGennMirmSync' Windows Service is registered and started.
echo It will now run continuously in the background on every server boot.
echo.
echo Useful Windows commands:
echo   - Open Services:   services.msc
echo   - Check Status:    sc query MicroGennMirmSync
echo   - Stop Service:    net stop MicroGennMirmSync
echo   - Start Service:   net start MicroGennMirmSync
echo.
pause
