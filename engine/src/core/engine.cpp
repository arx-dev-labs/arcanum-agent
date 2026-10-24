#include "arcanum/engine.hpp"
#include "arcanum/config.hpp"
#include "arcanum/message_bus.hpp"
#include "arcanum/plugin.hpp"
#include "arcanum/api.hpp"
#include <iostream>
#include <optional>
#include <thread>
#include <chrono>

namespace arcanum {

class EngineImpl : public IEngine {
public:
    EngineImpl() = default;
    ~EngineImpl() override { stop(); }

    Result<void> initialize(const EngineConfig& config) override {
        config_ = std::make_unique<Config>(config);
        bus_ = std::make_unique<MessageBus>();
        plugin_manager_ = std::make_unique<PluginManager>(*bus_, *config_);
        api_registry_ = std::make_unique<ApiRegistry>();

        // Register built-in providers
        api_registry_->register_provider(std::make_unique<OpenAIProvider>());
        api_registry_->register_provider(std::make_unique<AnthropicProvider>());
        api_registry_->register_provider(std::make_unique<NvidiaProvider>());
        api_registry_->register_provider(std::make_unique<CustomProvider>());

        // Configure providers from config
        configure_providers();

        // Load plugins
        plugin_manager_->load_plugins(std::filesystem::path(config_.plugins_dir()));

        // Set up message handlers
        setup_handlers();

        // Wire every engine-originated message to stdout as JSONL. Without
        // this the engine receives requests but never emits any response.
        bus_->set_output_handler([](const Message& msg) {
            std::cout << msg.serialize() << std::endl;
        });

        return Result<void>::ok();
    }

    Result<void> start() override {
        if (running_.exchange(true)) {
            return Result<void>::err("Engine already running");
        }

        // Start bus dispatcher before any publish can enqueue messages
        bus_->start();

        // Start stdin/stdout message loop
        io_thread_ = std::thread(&EngineImpl::io_loop, this);

        // Announce readiness on the wire
        Message ready_msg(MessageType::EVENT, {{"event", "engine.ready"}, {"version", "1.0.0"}});
        bus_->publish(ready_msg);

        return Result<void>::ok();
    }

    Result<void> stop() override {
        if (!running_.exchange(false)) {
            return Result<void>::ok();
        }

        // Announce shutdown on the wire
        Message shutdown_msg(MessageType::EVENT, {{"event", "engine.shutdown"}});
        bus_->publish(shutdown_msg);

        // The io thread is normally blocked on std::getline and cannot be
        // unblocked safely; detach it. The bus and managers stay alive until
        // process exit so the detached thread can never touch freed memory.
        if (io_thread_.joinable()) {
            io_thread_.detach();
            io_thread_ = {};
        }

        return Result<void>::ok();
    }

    Result<void> send_message(const Message& msg) override {
        if (!running_) return Result<void>::err("Engine not running");
        bus_->publish(msg);
        return Result<void>::ok();
    }

    void set_message_handler(std::function<void(const Message&)> handler) override {
        bus_->set_external_handler(std::move(handler));
    }

    bool is_running() const override {
        return running_.load();
    }

private:
    std::unique_ptr<Config> config_;
    std::unique_ptr<MessageBus> bus_;
    std::unique_ptr<PluginManager> plugin_manager_;
    std::unique_ptr<ApiRegistry> api_registry_;
    std::thread io_thread_;
    std::atomic<bool> running_{false};
    uint64_t msg_id_ = 1;

    void configure_providers() {
        const auto& provider_configs = config_->provider_configs();
        for (const auto& [name, cfg] : provider_configs.items()) {
            if (auto* provider = api_registry_->get_provider(name)) {
                provider->set_config(cfg);
            }
        }
    }

    void setup_handlers() {
        // Handle REQUEST messages
        bus_->subscribe(MessageType::REQUEST, [this](const Message& msg) {
            handle_request(msg);
        });

        // Handle CONFIG_UPDATE
        bus_->subscribe(MessageType::CONFIG_UPDATE, [this](const Message& msg) {
            handle_config_update(msg);
        });

        // Handle PLUGIN_LOAD/UNLOAD
        bus_->subscribe(MessageType::PLUGIN_LOAD, [this](const Message& msg) {
            handle_plugin_load(msg);
        });
        bus_->subscribe(MessageType::PLUGIN_UNLOAD, [this](const Message& msg) {
            handle_plugin_unload(msg);
        });
    }

    void handle_request(const Message& msg) {
        RequestType req_type;
        if (auto parsed = parse_request_type(msg.payload.value("request_type", json()))) {
            req_type = *parsed;
        } else {
            send_error(msg, "Unknown request type");
            return;
        }

        switch (req_type) {
            case RequestType::CHAT_COMPLETION:
                handle_chat_completion(msg);
                break;
            case RequestType::TOOL_EXECUTE:
                handle_tool_execute(msg);
                break;
            case RequestType::FILE_READ:
            case RequestType::FILE_WRITE:
            case RequestType::FILE_LIST:
            case RequestType::SHELL_EXECUTE:
                send_error(msg, "Not yet implemented");
                break;
            case RequestType::HTTP_REQUEST:
                handle_http_request(msg);
                break;
            case RequestType::WS_CONNECT:
                handle_ws_connect(msg);
                break;
            case RequestType::SSE_CONNECT:
                handle_sse_connect(msg);
                break;
            case RequestType::PLUGIN_CALL:
                handle_plugin_call(msg);
                break;
            case RequestType::AGENT_RUN:
                handle_agent_run(msg);
                break;
            case RequestType::PROVIDER_LIST:
                handle_provider_list(msg);
                break;
            case RequestType::CONFIG_GET:
                handle_config_get(msg);
                break;
            case RequestType::PING:
                handle_ping(msg);
                break;
            default:
                send_error(msg, "Unknown request type");
        }
    }

private:
    static std::optional<RequestType> parse_request_type(const json& value) {
        if (value.is_number_unsigned() || (value.is_number_integer() && value >= 0)) {
            const auto raw = value.get<long long>();
            if (raw < 0 || raw > 0xFF) return std::nullopt;
            return static_cast<RequestType>(raw);
        }
        if (value.is_string()) {
            static const std::unordered_map<std::string, RequestType> names = {
                {"chat_completion", RequestType::CHAT_COMPLETION},
                {"tool_execute", RequestType::TOOL_EXECUTE},
                {"file_read", RequestType::FILE_READ},
                {"file_write", RequestType::FILE_WRITE},
                {"file_list", RequestType::FILE_LIST},
                {"shell_execute", RequestType::SHELL_EXECUTE},
                {"http_request", RequestType::HTTP_REQUEST},
                {"ws_connect", RequestType::WS_CONNECT},
                {"sse_connect", RequestType::SSE_CONNECT},
                {"plugin_call", RequestType::PLUGIN_CALL},
                {"agent_run", RequestType::AGENT_RUN},
                {"provider_list", RequestType::PROVIDER_LIST},
                {"config_get", RequestType::CONFIG_GET},
                {"ping", RequestType::PING},
            };
            auto it = names.find(value.get<std::string>());
            if (it != names.end()) return it->second;
        }
        return std::nullopt;
    }

    void handle_chat_completion(const Message& msg) {
        uint64_t corr_id = msg.id;
        bool stream = msg.payload.value("stream", false);

        ChatCompletionRequest req;
        req.model = msg.payload.value("model", "");
        req.temperature = msg.payload.value("temperature", 0.7);
        req.max_tokens = msg.payload.value("max_tokens", 4096);
        req.top_p = msg.payload.value("top_p", 1.0);
        req.stream = stream;
        req.extra = msg.payload.value("extra", json::object());

        // Parse messages
        for (const auto& m : msg.payload.value("messages", json::array())) {
            ChatMessage cm;
            cm.role = [&m]() {
                std::string r = m.value("role", "user");
                if (r == "system") return ChatMessage::Role::SYSTEM;
                if (r == "user") return ChatMessage::Role::USER;
                if (r == "assistant") return ChatMessage::Role::ASSISTANT;
                if (r == "tool") return ChatMessage::Role::TOOL;
                return ChatMessage::Role::USER;
            }();
            cm.content = m.value("content", "");
            cm.name = m.value("name", "");
            cm.tool_calls = m.value("tool_calls", json::array());
            cm.tool_call_id = m.value("tool_call_id", "");
            req.messages.push_back(cm);
        }

        // Parse tools
        for (const auto& t : msg.payload.value("tools", json::array())) {
            Tool tool;
            tool.name = t.value("function.name", "");
            tool.description = t.value("function.description", "");
            tool.parameters = t.value("function.parameters", json::object());
            req.tools.push_back(tool);
        }

        if (stream) {
            api_registry_->chat_completion_stream(req, [this, corr_id](const StreamChunk& chunk) {
                Message response(MessageType::STREAM_CHUNK, {
                    {"chunk", {
                        {"id", chunk.id},
                        {"model", chunk.model},
                        {"created", chunk.created},
                        {"choices", json::array()},
                        {"done", chunk.done}
                    }}
                });
                for (const auto& c : chunk.choices) {
                    response.payload["chunk"]["choices"].push_back({
                        {"index", c.index},
                        {"delta", {
                            {"role", "assistant"},
                            {"content", c.delta.content}
                        }},
                        {"finish_reason", c.finish_reason}
                    });
                }
                response.correlation_id = corr_id;
                bus_->publish(response);
            });
        } else {
            auto result = api_registry_->chat_completion(req);
            if (result) {
                Message response(MessageType::RESULT, result->to_json());
                response.correlation_id = corr_id;
                bus_->publish(response);
            } else {
                send_error(msg, result.error);
            }
        }
    }

    void handle_tool_execute(const Message& msg) {
        // Tool execution would go here
        send_error(msg, "Tool execution not yet implemented");
    }

    void handle_http_request(const Message& msg) {
        // HTTP request via engine
        send_error(msg, "HTTP request not yet implemented");
    }

    void handle_ws_connect(const Message& msg) {
        send_error(msg, "WebSocket not yet implemented");
    }

    void handle_sse_connect(const Message& msg) {
        send_error(msg, "SSE not yet implemented");
    }

    void handle_plugin_call(const Message& msg) {
        std::string plugin = msg.payload.value("plugin", "");
        std::string command = msg.payload.value("command", "");
        json args = msg.payload.value("args", json::object());

        auto result = plugin_manager_->execute(plugin, command, args);
        if (result) {
            Message response(MessageType::RESULT, *result);
            response.correlation_id = msg.id;
            bus_->publish(response);
        } else {
            send_error(msg, result.error);
        }
    }

    void handle_agent_run(const Message& msg) {
        send_error(msg, "Agent run not yet implemented");
    }

    void handle_provider_list(const Message& msg) {
        json providers = json::array();
        for (const auto& name : api_registry_->list_providers()) {
            const IProvider* provider = api_registry_->get_provider(name);
            providers.push_back({
                {"name", name},
                {"models", provider ? provider->supported_models() : json::array()},
                {"config", json::object()},
            });
        }
        Message response(MessageType::RESULT, {{"providers", providers}});
        response.correlation_id = msg.id;
        bus_->publish(response);
    }

    void handle_config_get(const Message& msg) {
        Message response(MessageType::RESULT, config_->provider_configs());
        response.correlation_id = msg.id;
        bus_->publish(response);
    }

    void handle_ping(const Message& msg) {
        Message response(MessageType::RESULT, {{"status", "ok"}});
        response.correlation_id = msg.id;
        bus_->publish(response);
    }

    void handle_config_update(const Message& msg) {
        // Update provider configs
        if (msg.payload.contains("providers")) {
            for (const auto& [name, cfg] : msg.payload["providers"].items()) {
                config_->set_provider_config(name, cfg);
                if (auto* provider = api_registry_->get_provider(name)) {
                    provider->set_config(cfg);
                }
            }
        }
        Message response(MessageType::RESULT, {{"status", "config_updated"}});
        response.correlation_id = msg.id;
        bus_->publish(response);
    }

    void handle_plugin_load(const Message& msg) {
        std::string path = msg.payload.value("path", "");
        auto result = plugin_manager_->load_plugin(std::filesystem::path(path));
        if (result) {
            Message response(MessageType::RESULT, {{"status", "loaded"}, {"path", path}});
            response.correlation_id = msg.id;
            bus_->publish(response);
        } else {
            send_error(msg, result.error);
        }
    }

    void handle_plugin_unload(const Message& msg) {
        std::string name = msg.payload.value("name", "");
        auto result = plugin_manager_->unload_plugin(name);
        if (result) {
            Message response(MessageType::RESULT, {{"status", "unloaded"}, {"name", name}});
            response.correlation_id = msg.id;
            bus_->publish(response);
        } else {
            send_error(msg, result.error);
        }
    }

    void send_error(const Message& original, const std::string& error) {
        Message response(MessageType::ERROR, {{"error", error}});
        response.correlation_id = original.id;
        bus_->publish(response);
    }

    void io_loop() {
        std::string line;
        while (running_ && std::getline(std::cin, line)) {
            if (line.empty()) continue;

            auto result = Message::deserialize(line);
            if (result) {
                bus_->handle_external_message(*result);
            } else {
                // Send parse error
                Message err_msg(MessageType::ERROR, {{"error", "Parse error: " + result.error}});
                bus_->publish(err_msg);
            }
        }
        running_ = false;
    }
};

std::unique_ptr<IEngine> create_engine() {
    return std::make_unique<EngineImpl>();
}

} // namespace arcanum