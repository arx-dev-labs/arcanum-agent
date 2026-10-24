#include "arcanum/engine.hpp"
#include "arcanum/config.hpp"
#include <iostream>
#include <filesystem>
#include <signal.h>
#include <cstdlib>

namespace arcanum {

static std::unique_ptr<IEngine> g_engine;
static std::atomic<bool> g_shutdown{false};

void signal_handler(int sig) {
    // Only set the flag here: calling into the engine from a signal handler
    // is not async-signal-safe.
    g_shutdown = true;
}

void print_usage(const char* prog) {
    std::cout << "ARX Engine v1.0.0\n";
    std::cout << "Usage: " << prog << " [options]\n\n";
    std::cout << "Options:\n";
    std::cout << "  --data-dir <path>      Data directory (default: ~/.arx)\n";
    std::cout << "  --plugins-dir <path>   Plugins directory (default: ~/.arx/plugins)\n";
    std::cout << "  --log-level <level>    Log level: debug, info, warn, error (default: info)\n";
    std::cout << "  --config <path>        Config file path\n";
    std::cout << "  --help                 Show this help\n";
    std::cout << "\nCommunication: JSONL over stdin/stdout\n";
    std::cout << "Message format: {\"type\": N, \"id\": N, \"correlation_id\": N, \"payload\": {...}, \"timestamp\": \"...\"}\n";
}

static const char* env_first(const char* primary, const char* fallback) {
    if (const char* v = std::getenv(primary)) return v;
    return std::getenv(fallback);
}

EngineConfig parse_args(int argc, char* argv[]) {
    EngineConfig config;

    // Defaults from the environment (used by the Docker image and CI), then
    // the standard ~/.arx layout as a fallback. CLI arguments win over both.
    const char* home = std::getenv("HOME");
    if (!home) home = std::getenv("USERPROFILE");
    std::string base = home ? home : ".";

    if (const char* v = env_first("ARX_DATA_DIR", "ARCANUM_DATA_DIR")) {
        config.data_dir = v;
    } else {
        config.data_dir = base + "/.arx";
    }
    if (const char* v = env_first("ARX_PLUGINS_DIR", "ARCANUM_PLUGINS_DIR")) {
        config.plugins_dir = v;
    } else {
        config.plugins_dir = config.data_dir + "/plugins";
    }
    if (const char* v = env_first("ARX_LOG_LEVEL", "ARCANUM_LOG_LEVEL")) {
        config.log_level = v;
    }

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--help" || arg == "-h") {
            print_usage(argv[0]);
            exit(0);
        } else if (arg == "--data-dir" && i + 1 < argc) {
            config.data_dir = argv[++i];
        } else if (arg == "--plugins-dir" && i + 1 < argc) {
            config.plugins_dir = argv[++i];
        } else if (arg == "--log-level" && i + 1 < argc) {
            config.log_level = argv[++i];
        } else if (arg == "--config" && i + 1 < argc) {
            // Config file would be loaded by Config class
            std::cerr << "Config file: " << argv[++i] << std::endl;
        } else {
            std::cerr << "Unknown argument: " << arg << std::endl;
            print_usage(argv[0]);
            exit(1);
        }
    }

    return config;
}

} // namespace arcanum

int main(int argc, char* argv[]) {
    using namespace arcanum;

    // Setup signal handlers
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
#ifdef _WIN32
    signal(SIGBREAK, signal_handler);
#endif

    // Parse arguments
    EngineConfig config = parse_args(argc, argv);

    // Create and initialize engine
    g_engine = create_engine();
    auto init_result = g_engine->initialize(config);
    if (!init_result) {
        std::cerr << "Failed to initialize engine: " << init_result.error << std::endl;
        return 1;
    }

    // Start engine
    auto start_result = g_engine->start();
    if (!start_result) {
        std::cerr << "Failed to start engine: " << start_result.error << std::endl;
        return 1;
    }

    std::cerr << "ARX Engine started. Listening on stdin/stdout..." << std::endl;

    // Wait for shutdown
    while (!g_shutdown && g_engine->is_running()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    // Cleanup
    g_engine->stop();
    g_engine.reset();

    std::cerr << "ARX Engine stopped." << std::endl;

    // Deterministic teardown: the io thread was detached while blocked on
    // getline, so skip static destructors and exit immediately.
    std::quick_exit(0);
}