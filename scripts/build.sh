#!/usr/bin/env bash
# Build script for ARX CLI

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
ENGINE_DIR="$ROOT_DIR/engine"
BUILD_DIR="$ENGINE_DIR/build"

echo "🔮 Building ARX CLI..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check dependencies
check_deps() {
    log_info "Checking dependencies..."

    if ! command -v node &> /dev/null; then
        log_error "Node.js not found. Please install Node.js >= 20"
        exit 1
    fi

    if ! command -v cmake &> /dev/null; then
        log_error "CMake not found. Please install CMake >= 3.20"
        exit 1
    fi

    if ! command -v g++ &> /dev/null && ! command -v clang++ &> /dev/null; then
        log_error "C++ compiler not found. Please install GCC 11+ or Clang 13+"
        exit 1
    fi

    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        log_error "Node.js version must be >= 20 (found v$NODE_VERSION)"
        exit 1
    fi

    log_success "All dependencies found"
}

# Build frontend
build_frontend() {
    log_info "Building frontend..."

    cd "$FRONTEND_DIR"

    if [ ! -d "node_modules" ]; then
        log_info "Installing frontend dependencies..."
        npm install
    fi

    log_info "Type checking..."
    npm run typecheck 2>/dev/null || log_warn "TypeScript check failed (continuing)"

    log_info "Building frontend bundle..."
    npm run build

    log_success "Frontend built successfully"
}

# Build engine
build_engine() {
    log_info "Building C++ engine..."

    mkdir -p "$BUILD_DIR"
    cd "$BUILD_DIR"

    log_info "Configuring with CMake..."
    cmake .. -DCMAKE_BUILD_TYPE=Release

    log_info "Compiling engine..."
    CORES=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
    cmake --build . --config Release -j"$CORES"

    if [ -f "arx-engine" ] || [ -f "arx-engine.exe" ]; then
        log_success "Engine built successfully"
    else
        log_error "Engine binary not found after build"
        exit 1
    fi
}

# Run tests
run_tests() {
    log_info "Running tests..."

    cd "$BUILD_DIR"
    if [ -f "CTestTestfile.cmake" ]; then
        ctest --output-on-failure
        log_success "Engine tests passed"
    else
        log_warn "No engine tests configured"
    fi
}

# Package for distribution
package() {
    log_info "Packaging for distribution..."

    cd "$FRONTEND_DIR"

    if command -v pkg &> /dev/null; then
        pkg dist/cli.js \
            --targets node20-linux-x64,node20-macos-x64,node20-win-x64 \
            --output "$ROOT_DIR/dist/arx" \
            --compress Brotli

        # Copy engine binary
        mkdir -p "$ROOT_DIR/dist"
        cp "$BUILD_DIR/arx-engine" "$ROOT_DIR/dist/arx-engine" 2>/dev/null || \
        cp "$BUILD_DIR/arx-engine.exe" "$ROOT_DIR/dist/arx-engine.exe" 2>/dev/null

        log_success "Packaged binaries in dist/"
    else
        log_warn "pkg not installed, skipping binary packaging"
    fi
}

# Main
main() {
    check_deps

    case "${1:-all}" in
        frontend)
            build_frontend
            ;;
        engine)
            build_engine
            ;;
        test)
            run_tests
            ;;
        package)
            package
            ;;
        clean)
            log_info "Cleaning build artifacts..."
            rm -rf "$FRONTEND_DIR/dist" "$BUILD_DIR"
            log_success "Cleaned"
            ;;
        all|*)
            build_frontend
            build_engine
            run_tests
            log_success "Build complete! Run with: npm run start"
            ;;
    esac
}

main "$@"