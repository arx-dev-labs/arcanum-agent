@echo off
REM ============================================================================
REM ARX CLI - Windows Uninstaller
REM ----------------------------------------------------------------------------
REM Always runs elevated: if not started as Administrator, the script requests
REM elevation itself (UAC prompt) so the Machine PATH and the Program Files
REM copy can be cleaned as well. Elevation refusal limits the cleanup to the
REM user scope.
REM
REM Implementation notes (v1.2):
REM   * Plain-text output (see install-arx.bat for the rationale).
REM   * PATH cleanup uses PowerShell [Environment]::SetEnvironmentVariable
REM     instead of setx, which silently truncates the PATH to 1024 characters.
REM   * PATH is cleaned before the files are removed: when this script runs
REM     from a copy inside the install directory it deletes itself, and
REM     cmd.exe cannot read any further batch lines afterwards.
REM   * Cleans BOTH possible install locations (user + system-wide).
REM ============================================================================

setlocal

echo.
echo        ==============================================
echo            ARX CLI Uninstaller
echo        ==============================================
echo.

REM --- Elevation ----------------------------------------------------------------
if defined ARX_TEST_DIR goto :admin_check
net session >nul 2>&1
if %errorLevel%==0 goto :admin_check
echo [INFO]  Requesting Administrator rights - accept the UAC prompt...
powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -Verb RunAs | Out-Null } catch { exit 1 }"
if errorlevel 1 (
    echo [WARN]  Elevation refused - only user-scope cleanup will run.
    goto :admin_check
)
echo [OK]    Elevated instance started - continue in the new window.
echo.
pause
exit /b 0

:admin_check
net session >nul 2>&1
if %errorLevel%==0 (
    echo [OK]    Running as Administrator - User and Machine PATH will be cleaned
) else (
    echo [INFO]  Running as user - Machine PATH cleanup needs Administrator
)

set "USER_DIR=%LOCALAPPDATA%\arx"
set "ADMIN_DIR=C:\Program Files\arx"
if defined ARX_TEST_DIR (
    set "USER_DIR=%ARX_TEST_DIR%"
    set "ADMIN_DIR=%ARX_TEST_DIR%"
)
echo [INFO]  Target directories: "%USER_DIR%" and "%ADMIN_DIR%"

REM === PATH cleanup (PowerShell avoids the setx 1024-char truncation) ===========
set "ARX_PATHDIR=%USER_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=$env:ARX_PATHDIR; foreach($s in @('User','Machine')){ $p=[Environment]::GetEnvironmentVariable('Path',$s); if($p){ $parts=@($p -split ';' | Where-Object { $_ -ne '' }); $f=@($parts | Where-Object { $_.TrimEnd('\') -ne $d }); if($f.Count -lt $parts.Count){ try { [Environment]::SetEnvironmentVariable('Path',($f -join ';'),$s); '[OK]    removed from ' + $s + ' PATH' } catch { '[INFO]  skipped ' + $s + ' PATH - needs Administrator' } } else { '[INFO]  not present in ' + $s + ' PATH' } } else { '[INFO]  ' + $s + ' PATH is empty' } }"
if /i "%USER_DIR%"=="%ADMIN_DIR%" goto :paths_done
set "ARX_PATHDIR=%ADMIN_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=$env:ARX_PATHDIR; foreach($s in @('User','Machine')){ $p=[Environment]::GetEnvironmentVariable('Path',$s); if($p){ $parts=@($p -split ';' | Where-Object { $_ -ne '' }); $f=@($parts | Where-Object { $_.TrimEnd('\') -ne $d }); if($f.Count -lt $parts.Count){ try { [Environment]::SetEnvironmentVariable('Path',($f -join ';'),$s); '[OK]    removed from ' + $s + ' PATH' } catch { '[INFO]  skipped ' + $s + ' PATH - needs Administrator' } } else { '[INFO]  not present in ' + $s + ' PATH' } } else { '[INFO]  ' + $s + ' PATH is empty' } }"

:paths_done
echo.
echo [OK]    ARX CLI removed. Open a new terminal for PATH changes to apply.
echo.
pause

REM === File removal (last, so no output is lost when this deletes itself) =======
if not exist "%USER_DIR%" if not exist "%ADMIN_DIR%" exit /b 0

if /i "%~dp0"=="%USER_DIR%\" (
    call :remove_dir_helper "%ADMIN_DIR%"
    set "INSTALL_DIR=%USER_DIR%"
    goto :self_remove
)
if /i "%~dp0"=="%ADMIN_DIR%\" (
    call :remove_dir_helper "%USER_DIR%"
    set "INSTALL_DIR=%ADMIN_DIR%"
    goto :self_remove
)
call :remove_dir_helper "%USER_DIR%"
call :remove_dir_helper "%ADMIN_DIR%"
exit /b 0

:remove_dir_helper
set "INSTALL_DIR=%~1"
if not exist "%INSTALL_DIR%" exit /b 0
REM Never delete the running batch file from a call context - cmd.exe re-reads
REM the file for every line, so a self-delete here aborts the caller. The
REM matching directory is handled by the top-level :self_remove flow instead.
if /i "%~dp0"=="%INSTALL_DIR%\" exit /b 0
del /q "%INSTALL_DIR%\arx.cmd" 2>nul
del /q "%INSTALL_DIR%\arx-engine.exe" 2>nul
del /q "%INSTALL_DIR%\uninstall-arx.bat" 2>nul
if exist "%INSTALL_DIR%\frontend" rmdir /s /q "%INSTALL_DIR%\frontend"
rmdir "%INSTALL_DIR%" 2>nul
if exist "%INSTALL_DIR%" echo [WARN]  Could not fully remove "%INSTALL_DIR%" - close any running "arx" and retry.
exit /b 0

:self_remove
REM Running from inside an install dir: delete the remaining children, end the
REM batch context, delete this script, then remove the empty directory.
del /q "%INSTALL_DIR%\arx.cmd" 2>nul
del /q "%INSTALL_DIR%\arx-engine.exe" 2>nul
if exist "%INSTALL_DIR%\frontend" rmdir /s /q "%INSTALL_DIR%\frontend"
(goto) 2>nul & del "%~f0" & rmdir "%INSTALL_DIR%" 2>nul
exit /b 0
