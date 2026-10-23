#!/usr/bin/env bash
# ============================================================================
# ARX CLI - macOS/Linux Launcher
# ============================================================================
# This script builds and runs ARX CLI on macOS and Linux
# Usage: ./arx.sh [--dev | --build | --start | --clean | --test | --install | --help]
# ============================================================================

set -euo pipefail

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly MAGENTA='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly RESET='\033[0m'

# Project root
readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
readonly FRONTEND_DIR="$ROOT_DIR/frontend"
readonly ENGINE_DIR="$ROOT_DIR/engine"
readonly BUILD_DIR="$ENGINE_DIR/build"
readonly DIST_DIR="$ROOT_DIR/dist"

# PIDs for cleanup
ENGINE_PID=""
FRONTEND_PID=""

# ============================================================================
# Helper Functions
# ============================================================================

log_info()    { echo -e "${BLUE}[INFO]${RESET} $*"; }
log_success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
log_error()   { echo -e "${RED}[ERROR]${RESET} $*"; }
log_step()    { echo -e "${MAGENTA}[STEP]${RESET}  ${BOLD}$*${RESET}"; }

print_banner() {
    echo -e "${CYAN}"
    cat <<'EOF'
    ╔═══════════════════════════════════════════╗
    ║         ARX CLI Launcher v1.0.0          ║
    ║     Beautiful AI Agent with C++ Engine   ║
    ╚═══════════════════════════════════════════╝
EOF
    echo -e "${RESET}"
}

print_usage() {
    print_banner
    echo "Usage: $(basename "$0") [command]"
    echo
    echo -e "${BOLD}Commands:${RESET}"
    echo -e "  ${GREEN}--dev${RESET}        Start development mode (hot reload)"
    echo -e "  ${GREEN}--build${RESET}      Build production binaries"
    echo -e "  ${GREEN}--start${RESET}      Run production build"
    echo -e "  ${GREEN}--clean${RESET}      Clean build artifacts"
    echo -e "  ${GREEN}--test${RESET}       Run tests"
    echo -e "  ${GREEN}--install${RESET}    Install globally (requires sudo)"
    echo -e "  ${GREEN}--uninstall${RESET}  Remove global installation"
    echo -e "  ${GREEN}--package${RESET}    Create distribution packages"
    echo -e "  ${GREEN}--doctor${RESET}     Check system dependencies"
    echo -e "  ${GREEN}--help${RESET}       Show this help"
    echo
    echo -e "${BOLD}Examples:${RESET}"
    echo -e "  $(basename "$0") --dev"
    echo -e "  $(basename "$0") --build && $(basename "$0") --start"
    echo -e "  $(basename "$0") --install"
    echo
    echo -e "${BOLD}Environment Variables:${RESET}"
    echo -e "  ${YELLOW}ARX_DATA_DIR${RESET}      Data directory (default: ~/.arx)"
    echo -e "  ${YELLOW}ARX_PLUGINS_DIR${RESET}   Plugins directory (default: ~/.arx/plugins)"
    echo -e "  ${YELLOW}ARX_CONFIG${RESET}        Config file path"
    echo -e "  ${YELLOW}OPENAI_API_KEY${RESET}    OpenAI API key"
    echo -e "  ${YELLOW}ANTHROPIC_API_KEY${RESET} Anthropic API key"
    echo -e "  ${YELLOW}NVIDIA_API_KEY${RESET}    NVIDIA API key"
}

# Cleanup on exit
cleanup() {
    if [[ -n "$ENGINE_PID" ]] && kill -0 "$ENGINE_PID" 2>/dev/null; then
        log_info "Stopping engine (PID: $ENGINE_PID)..."
        kill "$ENGINE_PID" 2>/dev/null || true
        wait "$ENGINE_PID" 2>/dev/null || true
    fi
    if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    # Kill any child processes
    pkill -P $$ 2>/dev/null || true
}

trap cleanup EXIT INT TERM

# ============================================================================
# Dependency Checks
# ============================================================================

check_command() {
    command -v "$1" >/dev/null 2>&1
}

check_deps() {
    log_step "Checking system dependencies..."
    local missing=0

    # Node.js
    if check_command node; then
        local node_version=$(node --version | sed 's/v//' | cut -d. -f1)
        if [[ $node_version -ge 20 ]]; then
            log_success "Node.js $(node --version)"
        else
            log_error "Node.js >= 20 required (found $(node --version))"
            missing=1
        fi
    else
        log_error "Node.js not found. Install from https://nodejs.org"
        missing=1
    fi

    # npm
    if check_command npm; then
        log_success "npm $(npm --version)"
    else
        log_error "npm not found"
        missing=1
    fi

    # CMake
    if check_command cmake; then
        log_success "CMake $(cmake --version | head -1 | cut -d' ' -f3)"
    else
        log_error "CMake not found. Install: brew install cmake / apt install cmake"
        missing=1
    fi

    # C++ Compiler
    if check_command g++; then
        log_success "g++ $(g++ --version | head -1)"
    elif check_command clang++; then
        log_success "clang++ $(clang++ --version | head -1)"
    elif check_command cl; then
        log_success "MSVC $(cl 2>&1 | head -1)"
    else
        log_error "C++ compiler not found (g++, clang++, or MSVC)"
        missing=1
    fi

    # pkg-config
    if check_command pkg-config; then
        log_success "pkg-config $(pkg-config --version)"
    else
        log_warn "pkg-config not found (may cause build issues)"
    fi

    # OpenSSL
    if pkg-config --exists openssl 2>/dev/null || [[ -f /usr/include/openssl/ssl.h ]] || [[ -f /opt/homebrew/include/openssl/ssl.h ]] || [[ -f /usr/local/include/openssl/ssl.h ]]; then
        log_success "OpenSSL development headers found"
    else
        log_warn "OpenSSL development headers not found (libssl-dev / openssl)"
    fi

    # Git
    if check_command git; then
        log_success "Git $(git --version | cut -d' ' -f3)"
    else
        log_warn "Git not found"
    fi

    # Optional: pkg (for binary packaging)
    if check_command pkg; then
        log_success "pkg $(pkg --version)"
    else
        log_info "pkg not installed (optional, for binary packaging)"
    fi

    if [[ $missing -eq 1 ]]; then
        log_error "Missing required dependencies. Please install them and try again."
        exit 1
    fi

    log_success "All required dependencies satisfied"
}

# ============================================================================
# Build Functions
# ============================================================================

build_frontend() {
    log_step "Building frontend..."
    cd "$FRONTEND_DIR"

    if [[ ! -d node_modules ]]; then
        log_info "Installing frontend dependencies..."
        npm install
    fi

    log_info "Running TypeScript type check..."
    npm run typecheck 2>/dev/null || log_warn "TypeScript check had warnings (continuing)"

    log_info "Building production bundle..."
    npm run build

    log_success "Frontend built successfully"
    cd "$ROOT_DIR"
}

build_engine() {
    log_step "Building C++ engine..."
    mkdir -p "$BUILD_DIR"
    cd "$BUILD_DIR"

    log_info "Configuring with CMake..."
    cmake .. -DCMAKE_BUILD_TYPE=Release

    log_info "Compiling engine..."
    local cores
    cores=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
    cmake --build . --config Release -j"$cores"

    # Copy binary to known location
    if [[ -f arx-engine ]]; then
        cp arx-engine "$BUILD_DIR/arx-engine"
    elif [[ -f Release/arx-engine ]]; then
        cp Release/arx-engine "$BUILD_DIR/arx-engine"
    fi

    if [[ ! -f "$BUILD_DIR/arx-engine" ]]; then
        log_error "Engine binary not found after build"
        exit 1
    fi

    log_success "Engine built successfully"
    cd "$ROOT_DIR"
}

run_tests() {
    log_step "Running tests..."
    cd "$BUILD_DIR"

    if [[ -f CTestTestfile.cmake ]]; then
        ctest --output-on-failure
        log_success "All tests passed"
    else
        log_warn "No tests configured"
    fi
    cd "$ROOT_DIR"
}

# ============================================================================
# Run Modes
# ============================================================================

dev_mode() {
    log_step "Starting ARX CLI in development mode..."

    # Build engine if needed
    if [[ ! -f "$BUILD_DIR/arx-engine" ]]; then
        log_warn "Engine not built. Building now..."
        build_engine
    fi

    # Start engine
    log_info "Starting C++ engine..."
    cd "$BUILD_DIR"
    ./arx-engine &
    ENGINE_PID=$!

    # Wait for engine to be ready
    log_info "Waiting for engine to start..."
    sleep 2

    # Start frontend with hot reload
    log_info "Starting frontend (hot reload)..."
    cd "$FRONTEND_DIR"

    if [[ ! -d node_modules ]]; then
        log_info "Installing frontend dependencies..."
        npm install
    fi

    log_success "ARX CLI running in development mode"
    log_info "Press Ctrl+C to stop"

    npx tsx watch src/cli.tsx &
    FRONTEND_PID=$!
    wait $FRONTEND_PID
}

build_all() {
    log_step "Building ARX CLI (production)..."
    check_deps
    build_frontend
    build_engine
    run_tests
    log_success "Build complete!"
    echo
    log_info "To run: $(basename "$0") --start"
    echo -e "  Or directly: ${CYAN}$FRONTEND_DIR/dist/cli.js${RESET} (with engine running)"
}

start_prod() {
    log_step "Starting ARX CLI (production)..."

    if [[ ! -f "$FRONTEND_DIR/dist/cli.js" ]]; then
        log_error "Frontend not built. Run: $(basename "$0") --build"
        exit 1
    fi

    if [[ ! -f "$BUILD_DIR/arx-engine" ]]; then
        log_error "Engine not built. Run: $(basename "$0") --build"
        exit 1
    fi

    log_info "Starting C++ engine..."
    cd "$BUILD_DIR"
    ./arx-engine &
    ENGINE_PID=$!

    sleep 1

    log_info "Starting frontend..."
    cd "$FRONTEND_DIR"
    node dist/cli.js
}

clean_all() {
    log_step "Cleaning build artifacts..."
    rm -rf "$FRONTEND_DIR/dist"
    rm -rf "$BUILD_DIR"
    rm -rf "$DIST_DIR"
    log_success "Cleaned"
}

doctor() {
    log_step "System Health Check"
    echo
    check_deps
    echo
    log_step "Configuration Check"

    local config_dir="${ARX_DATA_DIR:-$HOME/.arx}"
    local config_file="${ARX_CONFIG:-$config_dir/config.json}"

    if [[ -f "$config_file" ]]; then
        log_success "Config found: $config_file"
        if check_command jq; then
            jq . "$config_file" 2>/dev/null || log_warn "Config file has invalid JSON"
        fi
    else
        log_warn "Config not found: $config_file"
        log_info "Run ARX once to generate default config, or create manually"
    fi

    if [[ -d "$config_dir/plugins" ]]; then
        local plugin_count=$(find "$config_dir/plugins" -name "*.so" -o -name "*.dylib" -o -name "*.dll" 2>/dev/null | wc -l)
        log_success "Plugins directory: $config_dir/plugins ($plugin_count plugins)"
    else
        log_info "Plugins directory not created yet: $config_dir/plugins"
    fi

    # Check API keys
    echo
    log_step "API Keys (from environment)"
    [[ -n "${OPENAI_API_KEY:-}" ]] && log_success "OPENAI_API_KEY: set" || log_warn "OPENAI_API_KEY: not set"
    [[ -n "${ANTHROPIC_API_KEY:-}" ]] && log_success "ANTHROPIC_API_KEY: set" || log_warn "ANTHROPIC_API_KEY: not set"
    [[ -n "${NVIDIA_API_KEY:-}" ]] && log_success "NVIDIA_API_KEY: set" || log_warn "NVIDIA_API_KEY: not set"
}

package_bins() {
    log_step "Creating distribution packages..."

    if ! check_command pkg; then
        log_error "pkg not installed. Install with: npm install -g pkg"
        exit 1
    fi

    if [[ ! -f "$FRONTEND_DIR/dist/cli.js" ]] || [[ ! -f "$BUILD_DIR/arx-engine" ]]; then
        log_error "Build artifacts not found. Run: $(basename "$0") --build"
        exit 1
    fi

    mkdir -p "$DIST_DIR"
    cd "$FRONTEND_DIR"

    log_info "Packaging frontend binary..."
    pkg dist/cli.js \
        --targets node20-linux-x64,node20-macos-x64,node20-win-x64 \
        --output "$DIST_DIR/arx" \
        --compress Brotli

    log_info "Copying engine binary..."
    cp "$BUILD_DIR/arx-engine" "$DIST_DIR/arx-engine"

    # Create archives
    cd "$DIST_DIR"
    local version=$(cat "$ROOT_DIR/frontend/package.json" | grep '"version"' | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
    local platform=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch=$(uname -m)

    case "$platform" in
        linux)
            tar -czf "arx-${version}-${platform}-${arch}.tar.gz" arx arx-engine
            log_success "Created: arx-${version}-${platform}-${arch}.tar.gz"
            ;;
        darwin)
            tar -czf "arx-${version}-${platform}-${arch}.tar.gz" arx arx-engine
            log_success "Created: arx-${version}-${platform}-${arch}.tar.gz"
            ;;
    esac

    log_success "Packages created in $DIST_DIR"
}

install_global() {
    log_step "Installing ARX CLI globally..."

    if [[ ! -f "$FRONTEND_DIR/dist/cli.js" ]] || [[ ! -f "$BUILD_DIR/arx-engine" ]]; then
        log_error "Not built. Run: $(basename "$0") --build"
        exit 1
    fi

    local install_dir="/usr/local/bin"
    local lib_dir="/usr/local/lib/arx"

    log_info "Installing to $install_dir (requires sudo)..."
    sudo mkdir -p "$lib_dir"
    sudo cp "$BUILD_DIR/arx-engine" "$lib_dir/arx-engine"
    sudo chmod +x "$lib_dir/arx-engine"

    # Create wrapper script
    cat > /tmp/arx-wrapper <<'WRAPPER'
#!/usr/bin/env bash
# ARX CLI wrapper - starts engine and runs frontend

ENGINE="/usr/local/lib/arx/arx-engine"
FRONTEND="/usr/local/lib/arx/frontend/dist/cli.js"

# Start engine if not running
if ! pgrep -f "arx-engine" >/dev/null; then
    "$ENGINE" &
    ENGINE_PID=$!
    sleep 1
    trap "kill $ENGINE_PID 2>/dev/null" EXIT
fi

# Run frontend
exec node "$FRONTEND" "$@"
WRAPPER

    sudo mv /tmp/arx-wrapper "$install_dir/arx"
    sudo chmod +x "$install_dir/arx"

    # Copy frontend dist
    sudo cp -r "$FRONTEND_DIR/dist" "$lib_dir/frontend"

    log_success "ARX CLI installed globally!"
    log_info "Run with: arx"
    log_info "Uninstall with: $(basename "$0") --uninstall"
}

uninstall_global() {
    log_step "Uninstalling ARX CLI..."
    sudo rm -f /usr/local/bin/arx
    sudo rm -rf /usr/local/lib/arx
    log_success "Uninstalled"
}

# ============================================================================
# Main
# ============================================================================

main() {
    cd "$ROOT_DIR"

    case "${1:-}" in
        --dev)
            check_deps
            dev_mode
            ;;
        --build)
            build_all
            ;;
        --start)
            start_prod
            ;;
        --clean)
            clean_all
            ;;
        --test)
            check_deps
            build_engine
            run_tests
            ;;
        --install)
            check_deps
            build_all
            install_global
            ;;
        --uninstall)
            uninstall_global
            ;;
        --package)
            check_deps
            build_all
            package_bins
            ;;
        --doctor)
            doctor
            ;;
        --help|-h|"")
            print_usage
            ;;
        *)
            log_error "Unknown command: $1"
            print_usage
            exit 1
            ;;
    esac
}

main "$@"