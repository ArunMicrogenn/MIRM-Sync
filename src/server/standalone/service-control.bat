@echo off
:: ============================================================================
:: MICROGENN · IRM Sync Unit - Windows Service Control Manager
:: ============================================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Administrator rights required. Requesting elevation...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

:MENU
cls
color 1F
echo ============================================================================
echo   MICROGENN MIRM PMS SYNC - WINDOWS SERVICE CONTROL PANEL
echo ============================================================================
echo.
echo   [1] Check Service Status (sc query)
echo   [2] Start Service (net start MicroGennMirmSync)
echo   [3] Stop Service (net stop MicroGennMirmSync)
echo   [4] Restart Service
echo   [5] Open Windows Services Manager (services.msc)
echo   [6] Open Log Folder (storage/sync_status.json)
echo   [7] Install Service
echo   [8] Uninstall Service
echo   [9] Exit
echo.
echo ============================================================================
set /p choice="Enter option (1-9): "

if "%choice%"=="1" goto STATUS
if "%choice%"=="2" goto START
if "%choice%"=="3" goto STOP
if "%choice%"=="4" goto RESTART
if "%choice%"=="5" goto SERVICES
if "%choice%"=="6" goto LOGS
if "%choice%"=="7" goto INSTALL
if "%choice%"=="8" goto UNINSTALL
if "%choice%"=="9" exit /b

goto MENU

:STATUS
cls
echo Current status of MicroGennMirmSync:
echo.
sc query MicroGennMirmSync
echo.
pause
goto MENU

:START
cls
echo Starting service...
net start MicroGennMirmSync
echo.
pause
goto MENU

:STOP
cls
echo Stopping service...
net stop MicroGennMirmSync
echo.
pause
goto MENU

:RESTART
cls
echo Restarting service...
net stop MicroGennMirmSync
timeout /t 2 /nobreak >nul
net start MicroGennMirmSync
echo.
pause
goto MENU

:SERVICES
start services.msc
goto MENU

:LOGS
if not exist "storage" mkdir storage
start explorer "storage"
goto MENU

:INSTALL
call "%~dp0install-service.bat"
goto MENU

:UNINSTALL
call "%~dp0uninstall-service.bat"
goto MENU
