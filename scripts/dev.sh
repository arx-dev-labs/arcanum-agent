#!/usr/bin/env bash
# Development runner for ARX CLI

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
ENGINE_DIR="$ROOT_DIR/engine"
BUILD_DIR="$ENGINE_DIR/build"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Cleanup on exit
cleanup() {
    log_info "Shutting down..."
    jobs -p | xargs -r kill
    wait
    exit 0
}

trap cleanup SIGINT SIGTERM

# Check if engine is built
if [ ! -f "$BUILD_DIR/arx-engine" ] && [ ! -f "$BUILD_DIR/arx-engine.exe" ]; then
    log_warn "Engine not built. Building now..."
    "$ROOT_DIR/scripts/build.sh" engine
fi

# Start engine in background
log_info "Starting C++ engine..."
cd "$BUILD_DIR"
./arx-engine &
ENGINE_PID=$!

# Wait for engine to be ready
sleep 1

# Start frontend
log_info "Starting frontend..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
    log_info "Installing frontend dependencies..."
    npm install
fi

log_success "Starting ARX CLI in development mode"
log_info "Press Ctrl+C to stop"

# Run frontend with tsx (hot reload)
npx tsx watch src/cli.tsx

# Cleanup
cleanup