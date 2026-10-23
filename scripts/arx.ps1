<#
.SYNOPSIS
    ARX CLI - PowerShell Launcher for Windows

.DESCRIPTION
    Builds and runs ARX CLI on Windows with PowerShell.
    Supports development mode, production builds, and global installation.

.PARAMETER Command
    Action to perform: dev, build, start, clean, test, install, uninstall, package, doctor, help

.EXAMPLE
    .\arx.ps1 --dev
    .\arx.ps1 --build
    .\arx.ps1 --install
    .\arx.ps1 --doctor
#>

[CmdletBinding()]
param(
    [Parameter(Position=0, Mandatory=$false)]
    [ValidateSet('dev', 'build', 'start', 'clean', 'test', 'install', 'uninstall', 'package', 'doctor', 'help')]
    [string]$Command = 'help'
)

# ============================================================================
# Configuration
# ============================================================================

$ROOT_DIR = Split-Path -Parent $PSScriptRoot
$FRONTEND_DIR = Join-Path $ROOT_DIR 'frontend'
$ENGINE_DIR = Join-Path $ROOT_DIR 'engine'
$BUILD_DIR = Join-Path $ENGINE_DIR 'build'
$DIST_DIR = Join-Path $ROOT_DIR 'dist'

$script:EngineProcess = $null
$script:FrontendProcess = $null

# Colors
$Colors = @{
    Red     = [ConsoleColor]::Red
    Green   = [ConsoleColor]::Green
    Yellow  = [ConsoleColor]::Yellow
    Blue    = [ConsoleColor]::Blue
    Magenta = [ConsoleColor]::Magenta
    Cyan    = [ConsoleColor]::Cyan
    White   = [ConsoleColor]::White
    Gray    = [ConsoleColor]::Gray
    Reset   = [ConsoleColor]::Gray
}

# ============================================================================
# Helper Functions
# ============================================================================

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = 'INFO',
        [ConsoleColor]$Color = [ConsoleColor]::Gray
    )
    $timestamp = Get-Date -Format 'HH:mm:ss'
    $levelStr = $Level.PadRight(5)
    Write-Host "[$timestamp] [$levelStr] $Message" -ForegroundColor $Color
}

function Write-Info    { param($m) Write-Log $m 'INFO'  $Colors.Blue }
function Write-Success { param($m) Write-Log $m 'OK'    $Colors.Green }
function Write-Warn    { param($m) Write-Log $m 'WARN'  $Colors.Yellow }
function Write-Error   { param($m) Write-Log $m 'ERROR' $Colors.Red }
function Write-Step    { param($m) Write-Log $m 'STEP'  $Colors.Magenta }
function Write-Banner  {
    Write-Host @"
${Colors.Cyan}
    ╔═══════════════════════════════════════════╗
    ║         ARX CLI Launcher v1.0.0          ║
    ║     Beautiful AI Agent with C++ Engine   ║
    ╚═══════════════════════════════════════════╝
${Colors.Reset}
"@
}

function Write-Usage {
    Write-Banner
    Write-Host "Usage: arx.ps1 [command]"
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor $Colors.White
    Write-Host "  dev        Start development mode (hot reload)" -ForegroundColor $Colors.Green
    Write-Host "  build      Build production binaries" -ForegroundColor $Colors.Green
    Write-Host "  start      Run production build" -ForegroundColor $Colors.Green
    Write-Host "  clean      Clean build artifacts" -ForegroundColor $Colors.Green
    Write-Host "  test       Run tests" -ForegroundColor $Colors.Green
    Write-Host "  install    Install globally (requires Admin)" -ForegroundColor $Colors.Green
    Write-Host "  uninstall  Remove global installation" -ForegroundColor $Colors.Green
    Write-Host "  package    Create distribution packages" -ForegroundColor $Colors.Green
    Write-Host "  doctor     Check system dependencies" -ForegroundColor $Colors.Green
    Write-Host "  help       Show this help" -ForegroundColor $Colors.Green
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor $Colors.White
    Write-Host "  .\arx.ps1 --dev"
    Write-Host "  .\arx.ps1 --build && .\arx.ps1 --start"
    Write-Host "  .\arx.ps1 --install"
}

function Cleanup {
    if ($script:EngineProcess -and !$script:EngineProcess.HasExited) {
        Write-Info "Stopping engine (PID: $($script:EngineProcess.Id))..."
        Stop-Process -Id $script:EngineProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($script:FrontendProcess -and !$script:FrontendProcess.HasExited) {
        Stop-Process -Id $script:FrontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    # Kill child processes
    Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $PID } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

# Register cleanup
$global:cleanupRegistered = $true
Register-EngineEvent -SourceIdentifier "PowerShell.Exiting" -Action { Cleanup } | Out-Null

# ============================================================================
# Dependency Checks
# ============================================================================

function Test-Command {
    param([string]$Name)
    Get-Command $Name -ErrorAction SilentlyContinue | Out-Null
    return $?
}

function Check-Dependencies {
    Write-Step "Checking system dependencies..."
    $missing = 0

    # Node.js
    if (Test-Command 'node') {
        $nodeVersion = node --version
        $major = [int]($nodeVersion -replace '^v(\d+).*', '$1')
        if ($major -ge 20) {
            Write-Success "Node.js $nodeVersion"
        } else {
            Write-Error "Node.js >= 20 required (found $nodeVersion)"
            $missing = 1
        }
    } else {
        Write-Error "Node.js not found. Install from https://nodejs.org (v20+)"
        $missing = 1
    }

    # npm
    if (Test-Command 'npm') {
        Write-Success "npm $(npm --version)"
    } else {
        Write-Error "npm not found"
        $missing = 1
    }

    # CMake
    if (Test-Command 'cmake') {
        Write-Success "CMake $(cmake --version | Select-Object -First 1)"
    } else {
        Write-Error "CMake not found. Install: choco install cmake / winget install Kitware.CMake"
        $missing = 1
    }

    # C++ Compiler
    $compilerFound = $false
    if (Test-Command 'g++') {
        Write-Success "g++ $(g++ --version | Select-Object -First 1)"
        $compilerFound = $true
    }
    if (Test-Command 'clang++') {
        Write-Success "clang++ $(clang++ --version | Select-Object -First 1)"
        $compilerFound = $true
    }
    if (Test-Command 'cl') {
        Write-Success "MSVC $(cl 2>&1 | Select-Object -First 1)"
        $compilerFound = $true
    }
    if (-not $compilerFound) {
        Write-Error "C++ compiler not found (g++, clang++, or MSVC). Install Visual Studio Build Tools or MinGW-w64"
        $missing = 1
    }

    # pkg (optional)
    if (Test-Command 'pkg') {
        Write-Success "pkg $(pkg --version)"
    } else {
        Write-Info "pkg not installed (optional, for binary packaging)"
    }

    if ($missing -eq 1) {
        Write-Error "Missing required dependencies. Please install them and try again."
        exit 1
    }

    Write-Success "All required dependencies satisfied"
}

# ============================================================================
# Build Functions
# ============================================================================

function Build-Frontend {
    Write-Step "Building frontend..."
    Set-Location $FRONTEND_DIR

    if (-not (Test-Path 'node_modules')) {
        Write-Info "Installing frontend dependencies..."
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    }

    Write-Info "Running TypeScript type check..."
    npm run typecheck 2>$null || Write-Warn "TypeScript check had warnings (continuing)"

    Write-Info "Building production bundle..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }

    Write-Success "Frontend built successfully"
    Set-Location $ROOT_DIR
}

function Build-Engine {
    Write-Step "Building C++ engine..."
    if (-not (Test-Path $BUILD_DIR)) { New-Item -ItemType Directory -Path $BUILD_DIR | Out-Null }
    Set-Location $BUILD_DIR

    Write-Info "Configuring with CMake..."
    cmake .. -DCMAKE_BUILD_TYPE=Release -G "Visual Studio 17 2022" -A x64
    if ($LASTEXITCODE -ne 0) { throw "CMake configure failed" }

    Write-Info "Compiling engine..."
    cmake --build . --config Release -j
    if ($LASTEXITCODE -ne 0) { throw "Engine build failed" }

    # Find and copy binary
    $engineExe = Get-ChildItem -Path . -Recurse -Filter 'arx-engine.exe' | Select-Object -First 1
    if ($engineExe) {
        Copy-Item $engineExe.FullName (Join-Path $BUILD_DIR 'arx-engine.exe') -Force
    } else {
        throw "Engine binary not found after build"
    }

    Write-Success "Engine built successfully"
    Set-Location $ROOT_DIR
}

function Run-Tests {
    Write-Step "Running tests..."
    Set-Location $BUILD_DIR

    if (Test-Path 'CTestTestfile.cmake') {
        ctest --output-on-failure -C Release
        if ($LASTEXITCODE -ne 0) { throw "Tests failed" }
        Write-Success "All tests passed"
    } else {
        Write-Warn "No tests configured"
    }
    Set-Location $ROOT_DIR
}

# ============================================================================
# Run Modes
# ============================================================================

function Dev-Mode {
    Write-Step "Starting ARX CLI in development mode..."

    if (-not (Test-Path (Join-Path $BUILD_DIR 'arx-engine.exe'))) {
        Write-Warn "Engine not built. Building now..."
        Build-Engine
    }

    Write-Info "Starting C++ engine..."
    Set-Location $BUILD_DIR
    $script:EngineProcess = Start-Process -FilePath '.\arx-engine.exe' -PassThru

    Write-Info "Waiting for engine to start..."
    Start-Sleep -Seconds 2

    Write-Info "Starting frontend (hot reload)..."
    Set-Location $FRONTEND_DIR

    if (-not (Test-Path 'node_modules')) {
        Write-Info "Installing frontend dependencies..."
        npm install
    }

    Write-Success "ARX CLI running in development mode"
    Write-Info "Press Ctrl+C to stop"

    $script:FrontendProcess = Start-Process -FilePath 'npx' -ArgumentList 'tsx', 'watch', 'src/cli.tsx' -PassThru -Wait
}

function Build-All {
    Write-Step "Building ARX CLI (production)..."
    Check-Dependencies
    Build-Frontend
    Build-Engine
    Run-Tests
    Write-Success "Build complete!"
    Write-Host ""
    Write-Info "To run: .\arx.ps1 --start"
    Write-Info "Or directly: $FRONTEND_DIR\dist\cli.js (with engine running)"
}

function Start-Prod {
    Write-Step "Starting ARX CLI (production)..."

    if (-not (Test-Path (Join-Path $FRONTEND_DIR 'dist\cli.js'))) {
        Write-Error "Frontend not built. Run: .\arx.ps1 --build"
        exit 1
    }

    if (-not (Test-Path (Join-Path $BUILD_DIR 'arx-engine.exe'))) {
        Write-Error "Engine not built. Run: .\arx.ps1 --build"
        exit 1
    }

    Write-Info "Starting C++ engine..."
    Set-Location $BUILD_DIR
    $script:EngineProcess = Start-Process -FilePath '.\arx-engine.exe' -PassThru

    Start-Sleep -Seconds 1

    Write-Info "Starting frontend..."
    Set-Location $FRONTEND_DIR
    node dist/cli.js
}

function Clean-All {
    Write-Step "Cleaning build artifacts..."
    Remove-Item -Path (Join-Path $FRONTEND_DIR 'dist') -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $BUILD_DIR -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $DIST_DIR -Recurse -Force -ErrorAction SilentlyContinue
    Write-Success "Cleaned"
}

function Doctor {
    Write-Step "System Health Check"
    Write-Host ""
    Check-Dependencies
    Write-Host ""
    Write-Step "Configuration Check"

    $configDir = $env:ARX_DATA_DIR ?? (Join-Path $env:USERPROFILE '.arx')
    $configFile = $env:ARX_CONFIG ?? (Join-Path $configDir 'config.json')

    if (Test-Path $configFile) {
        Write-Success "Config found: $configFile"
        try { Get-Content $configFile | ConvertFrom-Json | Out-Null } catch { Write-Warn "Config file has invalid JSON" }
    } else {
        Write-Warn "Config not found: $configFile"
        Write-Info "Run ARX once to generate default config"
    }

    $pluginsDir = Join-Path $configDir 'plugins'
    if (Test-Path $pluginsDir) {
        $count = (Get-ChildItem $pluginsDir -Filter '*.so','*.dll','*.dylib' -ErrorAction SilentlyContinue).Count
        Write-Success "Plugins directory: $pluginsDir ($count plugins)"
    } else {
        Write-Info "Plugins directory not created yet: $pluginsDir"
    }

    Write-Host ""
    Write-Step "API Keys (from environment)"
    $env:OPENAI_API_KEY    ? (Write-Success "OPENAI_API_KEY:    set") : (Write-Warn "OPENAI_API_KEY:    not set")
    $env:ANTHROPIC_API_KEY ? (Write-Success "ANTHROPIC_API_KEY: set") : (Write-Warn "ANTHROPIC_API_KEY: not set")
    $env:NVIDIA_API_KEY    ? (Write-Success "NVIDIA_API_KEY:    set") : (Write-Warn "NVIDIA_API_KEY:    not set")
}

function Package-Bins {
    Write-Step "Creating distribution packages..."

    if (-not (Test-Command 'pkg')) {
        Write-Error "pkg not installed. Install with: npm install -g pkg"
        exit 1
    }

    if (-not (Test-Path (Join-Path $FRONTEND_DIR 'dist\cli.js')) -or -not (Test-Path (Join-Path $BUILD_DIR 'arx-engine.exe'))) {
        Write-Error "Build artifacts not found. Run: .\arx.ps1 --build"
        exit 1
    }

    if (-not (Test-Path $DIST_DIR)) { New-Item -ItemType Directory -Path $DIST_DIR | Out-Null }
    Set-Location $FRONTEND_DIR

    Write-Info "Packaging frontend binary..."
    pkg dist/cli.js --targets node20-win-x64 --output (Join-Path $DIST_DIR 'arx.exe') --compress Brotli

    Write-Info "Copying engine binary..."
    Copy-Item (Join-Path $BUILD_DIR 'arx-engine.exe') (Join-Path $DIST_DIR 'arx-engine.exe') -Force

    Set-Location $DIST_DIR
    $version = (Get-Content (Join-Path $FRONTEND_DIR 'package.json') -Raw | ConvertFrom-Json).version
    Compress-Archive -Path 'arx.exe','arx-engine.exe' -DestinationPath "arx-${version}-win-x64.zip" -Force
    Write-Success "Created: arx-${version}-win-x64.zip"
}

function Install-Global {
    Write-Step "Installing ARX CLI globally (requires Administrator)..."

    if (-not (Test-Path (Join-Path $FRONTEND_DIR 'dist\cli.js')) -or -not (Test-Path (Join-Path $BUILD_DIR 'arx-engine.exe'))) {
        Write-Error "Not built. Run: .\arx.ps1 --build"
        exit 1
    }

    # Check for Admin
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Error "This command requires Administrator privileges. Re-run PowerShell as Administrator."
        exit 1
    }

    $installDir = 'C:\Program Files\arx'
    Write-Info "Installing to $installDir..."

    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    Copy-Item (Join-Path $BUILD_DIR 'arx-engine.exe') (Join-Path $installDir 'arx-engine.exe') -Force
    Copy-Item -Path (Join-Path $FRONTEND_DIR 'dist') -Destination (Join-Path $installDir 'frontend') -Recurse -Force

    # Create wrapper
    @"
@echo off
set ARX_ENGINE=$installDir\arx-engine.exe
set ARX_FRONTEND=$installDir\frontend\dist\cli.js

REM Start engine if not running
tasklist /FI "IMAGENAME eq arx-engine.exe" 2>NUL | find /I /N "arx-engine.exe">NUL
if "%ERRORLEVEL%"=="1" (
    start /B "" "%ARX_ENGINE%"
    timeout /t 1 /nobreak >NUL
)

node "%ARX_FRONTEND%" %*
"@
    | Set-Content -Path (Join-Path $installDir 'arx.cmd') -Encoding ASCII

    # Add to PATH
    $currentPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    if ($currentPath -notlike "*$installDir*") {
        [Environment]::SetEnvironmentVariable('Path', "$currentPath;$installDir", 'Machine')
        Write-Info "Added $installDir to system PATH"
    }

    Write-Success "ARX CLI installed globally!"
    Write-Info "Run with: arx"
    Write-Info "Uninstall with: .\arx.ps1 --uninstall"
}

function Uninstall-Global {
    Write-Step "Uninstalling ARX CLI..."
    $installDir = 'C:\Program Files\arx'

    # Check for Admin
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Error "This command requires Administrator privileges."
        exit 1
    }

    Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue

    # Remove from PATH
    $currentPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $newPath = $currentPath -replace ";$installDir", "" -replace "$installDir;", ""
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'Machine')

    Write-Success "Uninstalled"
}

# ============================================================================
# Main
# ============================================================================

try {
    Set-Location $ROOT_DIR

    switch ($Command) {
        'dev'       { Check-Dependencies; Dev-Mode }
        'build'     { Build-All }
        'start'     { Start-Prod }
        'clean'     { Clean-All }
        'test'      { Check-Dependencies; Build-Engine; Run-Tests }
        'install'   { Check-Dependencies; Build-All; Install-Global }
        'uninstall' { Uninstall-Global }
        'package'   { Check-Dependencies; Build-All; Package-Bins }
        'doctor'    { Doctor }
        'help'      { Write-Usage }
        default     { Write-Usage }
    }
} catch {
    Write-Error $_.Exception.Message
    exit 1
} finally {
    Cleanup
}