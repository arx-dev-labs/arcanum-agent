@echo off
REM ============================================================================
REM ARX CLI - Windows Installer
REM ----------------------------------------------------------------------------
REM Always runs elevated: if not started as Administrator, the script requests
REM elevation itself (UAC prompt) so it can install system-wide and update the
REM Machine PATH. Elevation refusal falls back to a user install.
REM
REM Implementation notes (v1.2):
REM   * Plain-text output only: cmd.exe prints "\x1b[..." escapes literally and
REM     UTF-8 box characters turn into mojibake under the OEM codepage.
REM   * PATH changes use PowerShell [Environment]::Get/SetEnvironmentVariable.
REM     "setx Path" silently truncates the PATH to 1024 characters.
REM   * The generated arx.cmd wrapper only sets ARX_ENGINE_BIN and runs the
REM     bundled frontend, which spawns arx-engine.exe over stdin/stdout itself.
REM   * Set ARX_TEST_DIR to install to an alternate directory without touching
REM     the PATH or requesting elevation (used for testing).
REM ============================================================================

setlocal

set "SCRIPT_VERSION=1.2.0"
set "PROJECT_ROOT=%~dp0.."

REM --- Elevation ---------------------------------------------------------------
if defined ARX_TEST_DIR goto :admin_check
net session >nul 2>&1
if %errorLevel%==0 goto :admin_check
echo [INFO]  Requesting Administrator rights - accept the UAC prompt...
powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -Verb RunAs | Out-Null } catch { exit 1 }"
if errorlevel 1 (
    echo [WARN]  Elevation refused - continuing with a user install.
    goto :admin_check
)
echo [OK]    Elevated instance started - continue in the new window.
echo.
pause
exit /b 0

:admin_check
net session >nul 2>&1
if %errorLevel%==0 (
    set "IS_ADMIN=1"
    set "INSTALL_DIR=C:\Program Files\arx"
    set "PATH_SCOPE=Machine"
    echo [OK]    Running as Administrator - system-wide install
) else (
    set "IS_ADMIN=0"
    set "INSTALL_DIR=%LOCALAPPDATA%\arx"
    set "PATH_SCOPE=User"
    echo [WARN]  Running without Administrator rights - user install only
)

if defined ARX_TEST_DIR (
    set "INSTALL_DIR=%ARX_TEST_DIR%"
    set "TEST_MODE=1"
    echo [WARN]  ARX_TEST_DIR detected - test mode, PATH will not be changed
)

echo.
echo        ==============================================
echo            ARX CLI Installer v%SCRIPT_VERSION%
echo        ==============================================
echo.
echo [INFO]  Project root: %PROJECT_ROOT%
echo [INFO]  Installing to: %INSTALL_DIR%
echo.

REM --- Check prerequisites ------------------------------------------------------
if exist "%PROJECT_ROOT%\frontend\dist\cli.js" goto :engine_check
echo [ERROR] Frontend not built - missing "%PROJECT_ROOT%\frontend\dist\cli.js"
echo         Build it first, then re-run this installer:
echo             npm install
echo             npm run build:frontend
goto :fail

:engine_check
set "ENGINE_SRC="
if exist "%PROJECT_ROOT%\engine\build\arx-engine.exe" set "ENGINE_SRC=%PROJECT_ROOT%\engine\build\arx-engine.exe"
if exist "%PROJECT_ROOT%\engine\build\Release\arx-engine.exe" set "ENGINE_SRC=%PROJECT_ROOT%\engine\build\Release\arx-engine.exe"
if defined ENGINE_SRC goto :node_check
echo [ERROR] arx-engine.exe not found in "%PROJECT_ROOT%\engine\build"
echo         Build the engine first, then re-run this installer:
echo             cmake -S engine -B engine\build
echo             cmake --build engine\build --config Release
goto :fail

:node_check
set "NODE_EXE="
where node >nul 2>nul
if not errorlevel 1 (
    set "NODE_EXE=node"
    goto :node_ok
)
echo [INFO]  "node" not found on PATH - probing common install locations...
for %%p in (
    "%ProgramFiles%\nodejs\node.exe"
    "%ProgramW6432%\nodejs\node.exe"
    "%USERPROFILE%\scoop\apps\nodejs\current\node.exe"
) do if exist %%p set "NODE_EXE=%%~p"
if defined NODE_EXE goto :node_ok
echo [ERROR] Node.js not found. The installer looks for "node" on PATH or at:
echo             %ProgramFiles%\nodejs\node.exe
echo             %ProgramW6432%\nodejs\node.exe
echo             %USERPROFILE%\scoop\apps\nodejs\current\node.exe
echo         Install Node.js 20+ from https://nodejs.org and re-run.
goto :fail

:node_ok
echo [INFO]  Using Node.js: %NODE_EXE%

REM --- Copy files ---------------------------------------------------------------
:copy
echo [INFO]  Creating install directory...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\frontend" mkdir "%INSTALL_DIR%\frontend"
if exist "%INSTALL_DIR%\frontend" goto :do_copy
echo [ERROR] Could not create "%INSTALL_DIR%" - check permissions.
goto :fail

:do_copy
echo [INFO]  Copying engine binary...
copy /y "%ENGINE_SRC%" "%INSTALL_DIR%\arx-engine.exe" >nul
if errorlevel 1 goto :fail

echo [INFO]  Copying frontend bundle...
xcopy /y /q "%PROJECT_ROOT%\frontend\dist\*" "%INSTALL_DIR%\frontend\" >nul
if errorlevel 1 goto :fail

REM --- Write the ESM marker so "node cli.js" is treated as an ES module ---------
> "%INSTALL_DIR%\frontend\package.json" echo {"name":"arx-frontend","version":"%SCRIPT_VERSION%","private":true,"type":"module"}
if errorlevel 1 goto :fail

REM --- Generate the arx.cmd launcher (absolute node path when off-PATH) ---------
> "%INSTALL_DIR%\arx.cmd" echo @echo off
>> "%INSTALL_DIR%\arx.cmd" echo REM ARX CLI launcher - generated by install-arx.bat
>> "%INSTALL_DIR%\arx.cmd" echo set "ARX_ENGINE_BIN=%%~dp0arx-engine.exe"
>> "%INSTALL_DIR%\arx.cmd" echo "%NODE_EXE%" "%%~dp0frontend\cli.js" %%*
>> "%INSTALL_DIR%\arx.cmd" echo exit /b %%ERRORLEVEL%%
if errorlevel 1 goto :fail
echo [OK]    Created %INSTALL_DIR%\arx.cmd

if exist "%~dp0uninstall-arx.bat" copy /y "%~dp0uninstall-arx.bat" "%INSTALL_DIR%\uninstall-arx.bat" >nul

REM --- PATH update (PowerShell avoids the setx 1024-char truncation) ------------
if defined TEST_MODE goto :done_path
if "%PATH_SCOPE%"=="User" goto :user_path

echo [INFO]  Adding %INSTALL_DIR% to Machine PATH...
set "ARX_PATHDIR=%INSTALL_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=$env:ARX_PATHDIR; $p=[Environment]::GetEnvironmentVariable('Path','Machine'); if(-not $p){$p=''}; $parts=@($p -split ';' | Where-Object { $_ -ne '' }); if(($parts | ForEach-Object { $_.TrimEnd('\') }) -contains $d){ '[INFO]  already present in Machine PATH' } else { $parts=$parts+@($d); try { [Environment]::SetEnvironmentVariable('Path',($parts -join ';'),'Machine'); '[OK]    added to Machine PATH' } catch { '[ERROR] PATH update failed: ' + $_.Exception.Message } }"

REM Legacy cleanup: the old v1.0 installer left a user install in the User PATH
set "LEGACY_DIR=%LOCALAPPDATA%\arx"
if /i "%LEGACY_DIR%"=="%INSTALL_DIR%" goto :done_path
if exist "%LEGACY_DIR%" (
    echo [INFO]  Removing stale user install at %LEGACY_DIR%
    call :wipe_dir "%LEGACY_DIR%"
)
set "ARX_PATHDIR=%LEGACY_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=$env:ARX_PATHDIR; $p=[Environment]::GetEnvironmentVariable('Path','User'); if($p){ $parts=@($p -split ';' | Where-Object { $_ -ne '' }); $f=@($parts | Where-Object { $_.TrimEnd('\') -ne $d }); if($f.Count -lt $parts.Count){ try { [Environment]::SetEnvironmentVariable('Path',($f -join ';'),'User'); '[OK]    removed stale entry from User PATH' } catch { '[INFO]  could not clean User PATH (needs Administrator)' } } }"
goto :done_path

:user_path
echo [INFO]  Adding %INSTALL_DIR% to User PATH...
set "ARX_PATHDIR=%INSTALL_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=$env:ARX_PATHDIR; $p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not $p){$p=''}; $parts=@($p -split ';' | Where-Object { $_ -ne '' }); if(($parts | ForEach-Object { $_.TrimEnd('\') }) -contains $d){ '[INFO]  already present in User PATH' } else { $parts=$parts+@($d); try { [Environment]::SetEnvironmentVariable('Path',($parts -join ';'),'User'); '[OK]    added to User PATH' } catch { '[ERROR] PATH update failed: ' + $_.Exception.Message } }"

:done_path
echo.
echo        ==============================================
echo            INSTALLATION COMPLETE
echo        ==============================================
echo.
echo Next steps:
echo   1. Close this terminal
echo   2. Open a new CMD or PowerShell
echo   3. Type: arx
echo.
echo The TUI launches automatically and spawns the bundled engine.
echo To uninstall later, run: %INSTALL_DIR%\uninstall-arx.bat
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] Installation failed or was aborted.
pause
exit /b 1

:wipe_dir
if not exist "%~1" exit /b 0
del /q "%~1\arx.cmd" 2>nul
del /q "%~1\arx-engine.exe" 2>nul
del /q "%~1\uninstall-arx.bat" 2>nul
if exist "%~1\frontend" rmdir /s /q "%~1\frontend"
rmdir "%~1" 2>nul
exit /b 0
