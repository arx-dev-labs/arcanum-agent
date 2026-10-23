# ARX CLI

> **ARX** — A beautiful, extensible CLI AI agent with a C++ engine core and React-based TUI frontend.
> 
> `arx` (noun): *fortress, citadel, stronghold* — Your command center for AI.

[![CI](https://github.com/arx-cli/arx-cli/workflows/CI/CD/badge.svg)](https://github.com/arx-cli/arx-cli/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-green.svg)](https://nodejs.org)
[![C++](https://img.shields.io/badge/C%2B%2B-20-blue.svg)](https://isocpp.org)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Node.js/Ink)                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │  Chat   │ │ Sidebar │ │  Input  │ │ Palette │  ← React/Ink│
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘            │
│       │           │           │           │                  │
│       └───────────┼───────────┼───────────┘                  │
│                   ▼                                           │
│          ┌────────────────┐                                   │
│          │  Zustand Store │  ← Reactive State                │
│          └────────┬───────┘                                   │
│                   │                                           │
│                   ▼                                           │
│          ┌────────────────┐                                   │
│          │  Engine Bridge │  ← JSONL over stdin/stdout       │
│          └────────┬───────┘                                   │
└───────────────────┼───────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                     Engine (C++20)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │  HTTP    │ │  WebSocket│ │   SSE    │ │ Plugins  │        │
│  │  Client  │ │  Client  │ │  Client  │ │  System  │        │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘        │
│       │            │            │            │               │
│       └────────────┼────────────┼────────────┘               │
│                    ▼                                         │
│           ┌────────────────┐                                  │
│           │  API Registry  │  ← OpenAI, Anthropic, NVIDIA   │
│           └────────────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

## Features

- **Beautiful TUI**: Built with Ink (React for CLI) — animations, gradients, 8 themes
- **C++ Engine**: High-performance core with HTTP/WS/SSE clients, connection pooling
- **Multi-Provider**: OpenAI, Anthropic, NVIDIA NIM, Custom OpenAI-compatible endpoints
- **Plugin System**: Dynamic `.so`/`.dll` loading with C API — extend with any capability
- **Streaming**: Real-time token streaming with typing animation
- **Command Palette**: `⌘P` for quick actions (Vim-style)
- **Conversation Management**: Multiple chats, history, export, search
- **Cross-platform**: Linux, macOS, Windows (single binary via `pkg`)

---

## Quick Start

```bash
# Clone and build
git clone https://github.com/arx-cli/arx-cli
cd arx-cli
npm run install:all

# Development (hot reload)
npm run dev

# Production build
npm run build
npm run start

# Or run directly after build
./dist/arx
```

## Installation (Pre-built)

```bash
# Linux/macOS
curl -fsSL https://github.com/arx-cli/arx-cli/releases/latest/download/arx-linux-x64.tar.gz | tar -xz
sudo mv arx /usr/local/bin/

# Windows (PowerShell)
irm https://github.com/arx-cli/arx-cli/releases/latest/download/arx-win-x64.zip | iex
```

## Configuration

Engine config at `~/.arx/config.json`:

```json
{
  "data_dir": "~/.arx",
  "plugins_dir": "~/.arx/plugins",
  "log_level": "info",
  "enable_telemetry": false,
  "provider_configs": {
    "openai": {
      "api_key": "sk-...",
      "base_url": "https://api.openai.com/v1",
      "organization": "org-..."
    },
    "anthropic": {
      "api_key": "sk-ant-...",
      "base_url": "https://api.anthropic.com/v1",
      "version": "2023-06-01"
    },
    "nvidia": {
      "api_key": "nvapi-...",
      "base_url": "https://integrate.api.nvidia.com/v1"
    },
    "custom": {
      "api_key": "",
      "base_url": "http://localhost:1234/v1",
      "models": ["local-model", "my-fine-tune"],
      "extra_headers": {}
    }
  }
}
```

**Set API keys via env vars (recommended):**
```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export NVIDIA_API_KEY=nvapi-...
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘N` / `Ctrl+N` | New conversation |
| `⌘P` / `Ctrl+P` | Command palette |
| `⌘M` / `Ctrl+M` | Switch model |
| `⌘T` / `Ctrl+T` | Switch theme |
| `⌘,` / `Ctrl+,` | Settings |
| `⌘Q` / `Ctrl+Q` | Quit |
| `Shift+Enter` | Send message |
| `/` | Slash commands |
| `↑/↓` | History navigation |
| `Tab` | Complete command |
| `Ctrl+←/→` | Resize sidebar |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/model <name>` | Switch model (e.g. `/model gpt-4o`) |
| `/provider <name>` | Switch provider (`openai`, `anthropic`, `nvidia`, `custom`) |
| `/theme <name>` | Switch theme (`cyberpunk`, `ocean`, `forest`, `mono`, `sunset`, `matrix`, `dracula`, `nord`) |
| `/new` | New conversation |
| `/clear` | Clear current conversation history |
| `/plugins` | Manage plugins |
| `/settings` | Open settings panel |
| `/export` | Export conversation to JSON/Markdown |
| `/help` | Show help |

## Themes

| Theme | Palette | Vibe |
|-------|---------|------|
| `cyberpunk` | `#00ffff` `#ff00ff` `#ffff00` | Synthwave neon (default) |
| `ocean` | `#00d4ff` `#00ff88` `#ffd700` | Deep blue |
| `forest` | `#4ade80` `#22c55e` `#facc15` | Nature green |
| `mono` | `#ffffff` `#cccccc` `#888888` | Minimal B&W |
| `sunset` | `#ff6b35` `#f7931e` `#ffd23f` | Warm orange |
| `matrix` | `#00ff00` `#00cc00` `#009900` | Hacker green |
| `dracula` | `#bd93f9` `#ff79c6` `#f1fa8c` | Popular dark |
| `nord` | `#88c0d0` `#81a1c1` `#ebcb8b` | Arctic colors |

Switch anytime: `⌘T` or `/theme <name>`

---

## Plugin Development

Create a plugin with the C API:

```c
// web_search.c
#include <arcanum/plugin.h>

static const PluginMetadata metadata = {
    .name = "web_search",
    .version = "1.0.0",
    .description = "Web search via DuckDuckGo",
    .author = "You",
    .capabilities = { {"web_search", true}, {"fetch_url", true} }
};

json handle_command(const string& cmd, const json& args) {
    if (cmd == "search") return search_ddg(args["query"]);
    if (cmd == "fetch") return fetch_url(args["url"]);
    return {{"error", "unknown command"}};
}

PluginMetadata* arcanum_plugin_metadata() { return &metadata; }
IPlugin* arcanum_plugin_create() { return new WebSearchPlugin(); }
void arcanum_plugin_destroy(IPlugin* p) { delete static_cast<WebSearchPlugin*>(p); }
```

**Build:**
```bash
g++ -shared -fPIC -std=c++20 -I/path/to/arx-cli/engine/include \
    -o web_search.so web_search.cpp
```

**Load:** Place in `~/.arx/plugins/` or use `/plugins` command.

See `engine/examples/web_search_plugin.cpp` for a complete example.

---

## Engine Communication Protocol

JSONL messages over stdin/stdout — language agnostic:

```json
// Frontend → Engine (Request)
{"type": 128, "id": 1, "correlation_id": 0, "payload": {"request_type": 1, "model": "gpt-4o", "messages": [...], "stream": true}, "timestamp": "2024-01-15T10:30:00.000Z"}

// Engine → Frontend (Streaming chunk)
{"type": 6, "id": 2, "correlation_id": 1, "payload": {"chunk": {"id": "chatcmpl-...", "choices": [{"delta": {"content": "Hello"}}]}, "timestamp": "..."}}

// Engine → Frontend (Final result)
{"type": 3, "id": 3, "correlation_id": 1, "payload": {"id": "chatcmpl-...", "choices": [...], "usage": {...}}, "timestamp": "..."}
```

**Message Types:**
- `0x01` LOG, `0x02` PROGRESS, `0x03` RESULT, `0x04` ERROR, `0x05` EVENT, `0x06` STREAM_CHUNK, `0x07` TOOL_CALL, `0x08` TOOL_RESULT
- Requests: `0x80` REQUEST, `0x81` CANCEL, `0x82` CONFIG_UPDATE, `0x83` PLUGIN_LOAD, `0x84` PLUGIN_UNLOAD

**Request Types:** CHAT_COMPLETION, TOOL_EXECUTE, FILE_READ, FILE_WRITE, FILE_LIST, SHELL_EXECUTE, HTTP_REQUEST, WS_CONNECT, SSE_CONNECT, PLUGIN_CALL, AGENT_RUN

---

## Project Structure

```
arx-cli/
├── package.json           # Root workspace (npm workspaces)
├── README.md
├── LICENSE
├── Dockerfile
├── .github/workflows/ci.yml
├── scripts/
│   ├── build.sh           # Build everything
│   └── dev.sh             # Dev mode with hot reload
├── frontend/              # Ink/React TUI (@arx-cli/frontend)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── App.tsx        # Main app component
│       ├── cli.tsx        # Entry point
│       ├── components/
│       │   ├── animated/  # AnimatedBox, TypingText, GradientText, Spinner, Pulse, ProgressBar, GlitchText, Float
│       │   ├── chat/      # Message, Input, WelcomeBanner, StatusBar, CommandPalette
│       │   └── layout/    # Sidebar (conversations, providers, plugins, settings)
│       ├── hooks/
│       │   └── useEngine.ts  # JSONL bridge to C++ engine
│       ├── store/         # Zustand store (reactive state)
│       ├── theme/         # 8 themes + ANSI helpers
│       └── types/         # TypeScript types
└── engine/                # C++20 Engine (arx-engine)
    ├── CMakeLists.txt
    ├── include/arx/       # Public headers (arx/engine.hpp, arx/http.hpp, etc.)
    └── src/
        ├── core/          # Engine, MessageBus, Config, PluginManager
        ├── http/          # HttpClient, RequestBuilder, AuthManager
        ├── ws/            # WebSocketClient, SSEClient
        ├── plugins/       # PluginLoader, IPlugin, C API
        ├── api/           # ApiRegistry, Providers (OpenAI, Anthropic, NVIDIA, Custom)
        ├── examples/      # web_search_plugin.cpp
        └── tests/         # GoogleTest suite
```

---

## Requirements

| Component | Minimum Version |
|-----------|-----------------|
| **Node.js** | ≥ 20.0.0 |
| **C++ Compiler** | GCC 11+, Clang 13+, MSVC 19.3+ (C++20) |
| **CMake** | ≥ 3.20 |
| **OpenSSL** | Development headers (libssl-dev) |
| **pkg-config** | For dependency detection |

---

## Development

```bash
# One-time setup
npm run install:all

# Daily development
npm run dev          # Hot reload frontend + engine

# Or separately:
npm run dev:frontend # Frontend only (tsx watch)
npm run dev:engine   # Engine only (rebuild + run)

# Testing
npm run test         # All tests
npm run test:frontend
npm run test:engine

# Linting
npm run lint

# Clean build artifacts
npm run clean
```

---

## Distribution

```bash
# Build release binaries (Linux, macOS, Windows)
npm run package

# Output in dist/:
#   arx                    # Frontend binary (pkg)
#   arx-engine             # C++ engine binary
#   arx-linux-x64.tar.gz   # Linux release
#   arx-win-x64.zip        # Windows release
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

**Made with ❤️ by the [arx-cli](https://github.com/arx-cli) team**