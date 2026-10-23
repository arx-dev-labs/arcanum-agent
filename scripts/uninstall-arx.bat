@echo off
REM ============================================================================
REM ARX CLI - Windows Uninstaller
REM ============================================================================

setlocal enabledelayedexpansion

set GREEN=\x1b[32m
set BLUE=\x1b[34m
set YELLOW=\x1b[33m
set RED=\x1b[31m
set RESET=\x1b[0m

echo [%BLUE%INFO%RESET%] ARX CLI Uninstaller
echo.

REM Check Admin
net session >nul 2>&1
if %errorLevel% == 0 (
    set IS_ADMIN=1
    set "INSTALL_DIR=C:\Program Files\arx"
    set "PATH_SCOPE=Machine"
    echo [%GREEN%OK%RESET%] Running as Administrator (system-wide uninstall)
) else (
    set IS_ADMIN=0
    set "INSTALL_DIR=%LOCALAPPDATA%\arx"
    set "PATH_SCOPE=User"
    echo [%YELLOW%WARN%RESET%] User uninstall (system install needs Admin)
)

echo [%BLUE%INFO%RESET%] Install directory: %INSTALL_DIR%

if not exist "%INSTALL_DIR%" (
    echo [%YELLOW%WARN%RESET%] Install directory not found
    goto :check_path
)

echo [%BLUE%INFO%RESET%] Removing files...
rmdir /s /q "%INSTALL_DIR%"
echo [%GREEN%OK%RESET%] Files removed

:check_path
echo [%BLUE%INFO%RESET%] Removing from PATH (%PATH_SCOPE%)...

set "CURRENT_PATH="
if "%IS_ADMIN%"=="1" (
    for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "CURRENT_PATH=%%B"
) else (
    for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "CURRENT_PATH=%%B"
)

if defined CURRENT_PATH (
    REM Remove the install dir from PATH
    set "NEW_PATH=!CURRENT_PATH:%INSTALL_DIR%;=!"
    set "NEW_PATH=!NEW_PATH:;%INSTALL_DIR%=!"
    set "NEW_PATH=!NEW_PATH:%INSTALL_DIR%=!"
    
    if "%IS_ADMIN%"=="1" (
        setx /M Path "!NEW_PATH!" >nul
    ) else (
        setx Path "!NEW_PATH!" >nul
    )
    echo [%GREEN%OK%RESET%] Removed from PATH
) else (
    echo [%YELLOW%WARN%RESET%] Could not read current PATH
)

echo.
echo [%GREEN%OK%RESET%] Uninstall complete!
echo [%BLUE%INFO%RESET%] Restart your terminal for changes to take effect.

pause