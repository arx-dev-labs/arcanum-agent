#pragma once

#include <string>
#include <vector>
#include <memory>
#include <functional>
#include <future>
#include <nlohmann/json.hpp>

namespace arcanum {

// Forward declarations
class Engine;
class MessageBus;
class PluginManager;
class Config;

// Core types
using json = nlohmann::json;
using Callback = std::function<void(const json&)>;
using AsyncCallback = std::function<void(std::future<json>)>;

// Message types for engine-frontend communication
enum class MessageType : uint8_t {
    // Engine -> Frontend
    LOG = 0x01,
    PROGRESS = 0x02,
    RESULT = 0x03,
    ERROR = 0x04,
    EVENT = 0x05,
    STREAM_CHUNK = 0x06,
    TOOL_CALL = 0x07,
    TOOL_RESULT = 0x08,

    // Frontend -> Engine
    REQUEST = 0x80,
    CANCEL = 0x81,
    CONFIG_UPDATE = 0x82,
    PLUGIN_LOAD = 0x83,
    PLUGIN_UNLOAD = 0x84,
};

// Request types
enum class RequestType : uint8_t {
    CHAT_COMPLETION = 0x01,
    TOOL_EXECUTE = 0x02,
    FILE_READ = 0x03,
    FILE_WRITE = 0x04,
    FILE_LIST = 0x05,
    SHELL_EXECUTE = 0x06,
    HTTP_REQUEST = 0x07,
    WS_CONNECT = 0x08,
    SSE_CONNECT = 0x09,
    PLUGIN_CALL = 0x0A,
    AGENT_RUN = 0x0B,
    // Extended request types implemented by the engine binary
    PROVIDER_LIST = 0xF0,
    CONFIG_GET = 0xF1,
    PING = 0xF2,
};

// Engine configuration
struct EngineConfig {
    std::string data_dir;
    std::string plugins_dir;
    std::string log_level = "info";
    bool enable_telemetry = false;
    json provider_configs;  // API keys, endpoints, etc.
    json plugin_configs;
};

// Result wrapper
template<typename T>
struct Result {
    bool success = false;
    T value;
    std::string error;

    static Result<T> ok(T val) { return Result{true, std::move(val), ""}; }
    static Result<T> err(std::string msg) { return Result{false, T{}, std::move(msg)}; }
};

// Base message structure
struct Message {
    MessageType type;
    uint64_t id = 0;
    uint64_t correlation_id = 0;
    json payload;
    std::string timestamp;

    Message() = default;
    Message(MessageType t, json p) : type(t), payload(std::move(p)) {
        timestamp = current_timestamp();
    }

    static std::string current_timestamp();
    std::string serialize() const;
    static Result<Message> deserialize(const std::string& data);
};

// Engine interface
class IEngine {
public:
    virtual ~IEngine() = default;
    virtual Result<void> initialize(const EngineConfig& config) = 0;
    virtual Result<void> start() = 0;
    virtual Result<void> stop() = 0;
    virtual Result<void> send_message(const Message& msg) = 0;
    virtual void set_message_handler(std::function<void(const Message&)> handler) = 0;
    virtual bool is_running() const = 0;
};

// Factory function
std::unique_ptr<IEngine> create_engine();

} // namespace arcanum