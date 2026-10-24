@echo off
REM ============================================================================
REM ARX CLI - Windows Launcher (development helper)
REM ----------------------------------------------------------------------------
REM Usage: arx.bat [option]
REM
REM Default (no option) runs the TUI against the source tree, wiring the
REM frontend bundle to a locally built engine through ARX_ENGINE_BIN. The
REM frontend spawns the engine over stdin/stdout itself - no detached engine
REM process is started.
REM ============================================================================

setlocal

set "ROOT=%~dp0.."

if "%~1"=="" goto :run
if /i "%~1"=="--run" goto :run
if /i "%~1"=="--dev" goto :dev
if /i "%~1"=="--build" goto :build
if /i "%~1"=="--test" goto :test
if /i "%~1"=="--clean" goto :clean
if /i "%~1"=="--help" goto :help
echo Unknown option: %~1
goto :help

:help
echo.
echo ARX CLI - Windows Launcher
echo.
echo Usage: arx.bat [option]
echo.
echo Options:
echo   --run     Run the TUI from the source tree (same as no option)
echo   --dev     Hot-reload development mode - frontend + engine
echo   --build   Build the C++ engine and the frontend bundle
echo   --test    Run the frontend test suite
echo   --clean   Remove build artifacts - frontend\dist and engine\build
echo   --help    Show this help
echo.
exit /b 0

REM ----------------------------------------------------------------------------
REM Run the TUI from the source tree
REM ----------------------------------------------------------------------------
:run
if exist "%ROOT%\frontend\dist\cli.js" goto :run_engine
echo [ERROR] Frontend not built. Build it first with:
echo             arx.bat --build
exit /b 1

:run_engine
call :ensure_node
if errorlevel 1 exit /b 1

:run_go
set "ARX_ENGINE_BIN="
if exist "%ROOT%\engine\build\arx-engine.exe" set "ARX_ENGINE_BIN=%ROOT%\engine\build\arx-engine.exe"
if exist "%ROOT%\engine\build\Release\arx-engine.exe" set "ARX_ENGINE_BIN=%ROOT%\engine\build\Release\arx-engine.exe"
if defined ARX_ENGINE_BIN goto :run_tui
echo [INFO]  No engine binary found - the frontend will spawn one itself
goto :run_tui

:run_tui
if defined ARX_ENGINE_BIN echo [INFO]  Engine detected: %ARX_ENGINE_BIN%
cd /d "%ROOT%\frontend"
"%NODE_EXE%" "%ROOT%\frontend\dist\cli.js"
exit /b %ERRORLEVEL%

REM ----------------------------------------------------------------------------
REM Development mode (hot reload)
REM ----------------------------------------------------------------------------
:dev
cd /d "%ROOT%"
call :ensure_node
if errorlevel 1 exit /b 1

:dev_run
echo [INFO]  Starting dev mode - frontend watch + engine
call npm run dev
exit /b %ERRORLEVEL%

REM ----------------------------------------------------------------------------
REM Build engine + frontend
REM ----------------------------------------------------------------------------
:build
call :ensure_node
if errorlevel 1 exit /b 1
where cmake >nul 2>nul
if errorlevel 1 goto :build_no_cmake
echo [INFO]  Building engine...
cmake -S "%ROOT%\engine" -B "%ROOT%\engine\build"
if errorlevel 1 exit /b 1
cmake --build "%ROOT%\engine\build" --config Release
if errorlevel 1 exit /b 1
goto :build_frontend

:build_no_cmake
echo [WARN]  CMake not found - skipping the engine build.
echo         Install CMake from https://cmake.org to build the engine.

:build_frontend
cd /d "%ROOT%"
if not exist node_modules (
    echo [INFO]  Installing dependencies...
    call npm install
    if errorlevel 1 exit /b 1
)
echo [INFO]  Building frontend...
cd /d "%ROOT%\frontend"
call npm run build
if errorlevel 1 exit /b 1
echo [OK]    Build complete - run "arx.bat" to start.
exit /b 0

REM ----------------------------------------------------------------------------
REM Tests
REM ----------------------------------------------------------------------------
:test
call :ensure_node
if errorlevel 1 exit /b 1
cd /d "%ROOT%\frontend"
if not exist node_modules (
    cd /d "%ROOT%"
    if not exist node_modules (
        echo [INFO]  Installing dependencies...
        call npm install
        if errorlevel 1 exit /b 1
    )
    cd /d "%ROOT%\frontend"
)
call npm test
exit /b %ERRORLEVEL%

REM ----------------------------------------------------------------------------
REM Node.js helpers (probe common install locations when "node" is off-PATH)
REM ----------------------------------------------------------------------------
:ensure_node
set "NODE_EXE=node"
where node >nul 2>nul
if not errorlevel 1 exit /b 0
set "NODE_EXE="
call :probe_node
if not defined NODE_EXE (
    echo [ERROR] Node.js not found on PATH or in common install locations:
    echo             %ProgramFiles%\nodejs\node.exe
    echo             %ProgramW6432%\nodejs\node.exe
    echo             %USERPROFILE%\scoop\apps\nodejs\current\node.exe
    echo         Install Node.js 20+ from https://nodejs.org
    exit /b 1
)
for %%d in ("%NODE_EXE%") do set "Path=%%~dpd;%Path%"
exit /b 0

:probe_node
for %%p in (
    "%ProgramFiles%\nodejs\node.exe"
    "%ProgramW6432%\nodejs\node.exe"
    "%USERPROFILE%\scoop\apps\nodejs\current\node.exe"
) do if exist %%p set "NODE_EXE=%%~p"
exit /b 0

REM ----------------------------------------------------------------------------
REM Clean
REM ----------------------------------------------------------------------------
:clean
if exist "%ROOT%\frontend\dist" rmdir /s /q "%ROOT%\frontend\dist"
if exist "%ROOT%\engine\build" rmdir /s /q "%ROOT%\engine\build"
echo [OK]    Build artifacts removed.
exit /b 0
