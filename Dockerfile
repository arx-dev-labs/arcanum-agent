# Multi-stage Docker build for ARX CLI

# Stage 1: Build C++ Engine
FROM ubuntu:22.04 AS engine-builder

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    cmake g++ libssl-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build/engine
COPY engine/ .
RUN mkdir -p build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release && \
    cmake --build . --config Release -j$(nproc)

# Stage 2: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# Stage 3: Runtime
FROM ubuntu:22.04 AS runtime

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    nodejs npm libssl3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -s /bin/bash arx
WORKDIR /home/arx

# Copy binaries
COPY --from=engine-builder /build/engine/build/arx-engine /usr/local/bin/arx-engine
COPY --from=frontend-builder /build/frontend/dist /home/arx/frontend

# Create data directories
RUN mkdir -p /home/arx/.arx/plugins && \
    chown -R arx:arx /home/arx

USER arx
ENV PATH="/home/arx/frontend:${PATH}"
ENV ARX_DATA_DIR="/home/arx/.arx"
ENV ARX_PLUGINS_DIR="/home/arx/.arx/plugins"

# Default command
ENTRYPOINT ["arx"]
CMD ["--help"]