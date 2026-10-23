@echo off
REM ============================================================================
REM ARX CLI - Windows Launcher
REM ============================================================================
REM This script builds and runs ARX CLI on Windows
REM Usage: arx.bat [--dev | --build | --help]
REM ============================================================================

setlocal enabledelayedexpansion

REM Colors
set GREEN=\x1b[32m
set BLUE=\x1b[34m
set YELLOW=\x1b[33m
set RED=\x1b[31m
set RESET=\x1b[0m

REM Project root
set "ROOT_DIR=%~dp0.."
cd /d "%ROOT_DIR%"

REM Helper functions
:log_info
echo [%BLUE%INFO%RESET%] %*
goto :eof

:log_success
echo [%GREEN%OK%RESET%] %*
goto :eof

:log_warn
echo [%YELLOW%WARN%RESET%] %*
goto :eof

:log_error
echo [%RED%ERROR%RESET%] %*
goto :eof

:print_usage
echo.
echo ARX CLI - Windows Launcher
echo.
echo Usage: arx.bat [command]
echo.
echo Commands:
echo   --dev       Start development mode (hot reload)
echo   --build     Build production binaries
echo   --clean     Clean build artifacts
echo   --start     Run production build
echo   --help      Show this help
echo.
echo Examples:
echo   arx.bat --dev
echo   arx.bat --build
echo   arx.bat --start
goto :eof

REM Check dependencies
:check_deps
call :log_info "Checking dependencies..."

where node >nul 2>nul
if errorlevel 1 (
    call :log_error "Node.js not found. Install from https://nodejs.org (v20+)"
    exit /b 1
)

where cmake >nul 2>nul
if errorlevel 1 (
    call :log_error "CMake not found. Install from https://cmake.org (v3.20+)"
    exit /b 1
)

where g++ >nul 2>nul || where clang++ >nul 2>nul || where cl >nul 2>nul
if errorlevel 1 (
    call :log_warn "C++ compiler not found. Install Visual Studio Build Tools or MinGW-w64"
)

for /f "tokens=2 delims=v." %%a in ('node --version') do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 20 (
    call :log_error "Node.js version must be >= 20"
    exit /b 1
)

call :log_success "All dependencies found"
goto :eof

REM Build frontend
:build_frontend
call :log_info "Building frontend..."
cd /d "%ROOT_DIR%\frontend"

if not exist node_modules (
    call :log_info "Installing frontend dependencies..."
    npm install
    if errorlevel 1 (
        call :log_error "npm install failed"
        exit /b 1
    )
)

call :log_info "Type checking..."
npm run typecheck 2>nul || call :log_warn "TypeScript check failed (continuing)"

call :log_info "Building frontend bundle..."
npm run build
if errorlevel 1 (
    call :log_error "Frontend build failed"
    exit /b 1
)

call :log_success "Frontend built successfully"
cd /d "%ROOT_DIR%"
goto :eof

REM Build engine
:build_engine
call :log_info "Building C++ engine..."
cd /d "%ROOT_DIR%\engine"

if not exist build mkdir build
cd build

call :log_info "Configuring with CMake..."
cmake .. -DCMAKE_BUILD_TYPE=Release -G "Visual Studio 17 2022" -A x64
if errorlevel 1 (
    call :log_error "CMake configure failed"
    exit /b 1
)

call :log_info "Compiling engine..."
cmake --build . --config Release -j
if errorlevel 1 (
    call :log_error "Engine build failed"
    exit /b 1
)

if exist Release\arx-engine.exe (
    copy Release\arx-engine.exe arx-engine.exe >nul
)

if not exist arx-engine.exe (
    call :log_error "Engine binary not found after build"
    exit /b 1
)

call :log_success "Engine built successfully"
cd /d "%ROOT_DIR%"
goto :eof

REM Run tests
:run_tests
call :log_info "Running tests..."
cd /d "%ROOT_DIR%\engine\build"

if exist CTestTestfile.cmake (
    ctest --output-on-failure -C Release
    if errorlevel 1 (
        call :log_error "Tests failed"
        exit /b 1
    )
    call :log_success "All tests passed"
) else (
    call :log_warn "No tests configured"
)
cd /d "%ROOT_DIR%"
goto :eof

REM Development mode
:dev_mode
call :log_info "Starting ARX CLI in development mode..."

REM Check if engine is built
if not exist "%ROOT_DIR%\engine\build\arx-engine.exe" (
    call :log_warn "Engine not built. Building now..."
    call :build_engine
)

REM Start engine in background
call :log_info "Starting C++ engine..."
cd /d "%ROOT_DIR%\engine\build"
start "ARX Engine" /b arx-engine.exe
set ENGINE_PID=%ERRORLEVEL%

REM Wait for engine
timeout /t 2 /nobreak >nul

REM Start frontend
call :log_info "Starting frontend..."
cd /d "%ROOT_DIR%\frontend"

if not exist node_modules (
    call :log_info "Installing frontend dependencies..."
    npm install
)

call :log_success "Starting ARX CLI (Press Ctrl+C to stop)"
npx tsx watch src/cli.tsx

REM Cleanup on exit
taskkill /F /FI "WINDOWTITLE eq ARX Engine*" >nul 2>&1
goto :eof

REM Production build
:build_all
call :build_frontend
call :build_engine
call :run_tests
call :log_success "Build complete! Run with: arx.bat --start"
goto :eof

REM Production start
:start_prod
if not exist "%ROOT_DIR%\frontend\dist\cli.js" (
    call :log_error "Frontend not built. Run: arx.bat --build"
    exit /b 1
)

if not exist "%ROOT_DIR%\engine\build\arx-engine.exe" (
    call :log_error "Engine not built. Run: arx.bat --build"
    exit /b 1
)

call :log_info "Starting ARX CLI (production)..."
cd /d "%ROOT_DIR%\engine\build"
start "ARX Engine" /b arx-engine.exe

timeout /t 1 /nobreak >nul

cd /d "%ROOT_DIR%\frontend"
node dist/cli.js

taskkill /F /FI "WINDOWTITLE eq ARX Engine*" >nul 2>&1
goto :eof

REM Clean
:clean_all
call :log_info "Cleaning build artifacts..."
if exist "%ROOT_DIR%\frontend\dist" rmdir /s /q "%ROOT_DIR%\frontend\dist"
if exist "%ROOT_DIR%\engine\build" rmdir /s /q "%ROOT_DIR%\engine\build"
call :log_success "Cleaned"
goto :eof

REM ============================================================================
REM MAIN ENTRY POINT
REM ============================================================================

if "%~1"=="" (
    call :print_usage
    goto :eof
)

if "%~1"=="--help" (
    call :print_usage
    goto :eof
)

if "%~1"=="--dev" (
    call :check_deps
    call :dev_mode
    goto :eof
)

if "%~1"=="--build" (
    call :check_deps
    call :build_all
    goto :eof
)

if "%~1"=="--start" (
    call :start_prod
    goto :eof
)

if "%~1"=="--clean" (
    call :clean_all
    goto :eof

)

if "%~1"=="--test" (
    call :check_deps
    call :build_engine
    call :run_tests
    goto :eof
)

call :log_error "Unknown command: %~1"
call :print_usage
exit /b 1