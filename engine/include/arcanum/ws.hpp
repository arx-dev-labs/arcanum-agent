#pragma once

#include "engine.hpp"
#include <websocketpp/config/asio_client.hpp>
#include <websocketpp/client.hpp>
#include <string>
#include <functional>
#include <mutex>
#include <atomic>
#include <thread>

namespace arcanum {

using WsClient = websocketpp::client<websocketpp::config::asio_tls_client>;
using WsConnectionPtr = WsClient::connection_ptr;

// WebSocket message
struct WsMessage {
    enum class Type { TEXT, BINARY, PING, PONG, CLOSE };
    Type type;
    std::string payload;
    std::string error;
};

// WebSocket client
class WebSocketClient {
public:
    using MessageHandler = std::function<void(const WsMessage&)>;
    using StateHandler = std::function<void(websocketpp::session::state::value)>;

    WebSocketClient();
    ~WebSocketClient();

    // Connection
    Result<void> connect(const std::string& url, const std::map<std::string, std::string>& headers = {});
    Result<void> disconnect();

    // Send messages
    Result<void> send_text(const std::string& text);
    Result<void> send_binary(const std::vector<uint8_t>& data);
    Result<void> ping(const std::string& payload = "");

    // Handlers
    void on_message(MessageHandler handler) { msg_handler_ = std::move(handler); }
    void on_state_change(StateHandler handler) { state_handler_ = std::move(handler); }
    void on_error(std::function<void(const std::string&)> handler) { error_handler_ = std::move(handler); }

    // State
    bool is_connected() const { return connected_.load(); }
    websocketpp::session::state::value state() const;

    // Configuration
    void set_tls_init(std::function<void(websocketpp::lib::asio::ssl::context&)> init) { tls_init_ = std::move(init); }
    void set_proxy(const std::string& proxy) { proxy_ = proxy; }

private:
    WsClient client_;
    WsConnectionPtr connection_;
    std::thread run_thread_;
    std::atomic<bool> connected_{false};
    std::atomic<bool> stopping_{false};

    MessageHandler msg_handler_;
    StateHandler state_handler_;
    std::function<void(const std::string&)> error_handler_;
    std::function<void(websocketpp::lib::asio::ssl::context&)> tls_init_;
    std::string proxy_;
    std::mutex mutex_;

    void run_loop();
    void on_open(websocketpp::connection_hdl hdl);
    void on_close(websocketpp::connection_hdl hdl);
    void on_message(websocketpp::connection_hdl hdl, WsClient::message_ptr msg);
    void on_fail(websocketpp::connection_hdl hdl);
    void handle_message(const WsMessage& msg);
};

// SSE (Server-Sent Events) Client
class SSEClient {
public:
    using EventHandler = std::function<void(const std::string& event, const std::string& data)>;
    using ErrorHandler = std::function<void(const std::string&)>;

    SSEClient();
    ~SSEClient();

    // Connect to SSE endpoint
    Result<void> connect(const std::string& url, const std::map<std::string, std::string>& headers = {});
    Result<void> disconnect();

    // Handlers
    void on_event(const std::string& event_type, EventHandler handler);
    void on_any_event(EventHandler handler);
    void on_error(ErrorHandler handler) { error_handler_ = std::move(handler); }
    void on_open(std::function<void()> handler) { open_handler_ = std::move(handler); }

    bool is_connected() const { return connected_.load(); }

private:
    std::unique_ptr<HttpClient> http_client_;
    std::thread stream_thread_;
    std::atomic<bool> connected_{false};
    std::atomic<bool> stopping_{false};

    std::map<std::string, EventHandler> event_handlers_;
    EventHandler any_event_handler_;
    ErrorHandler error_handler_;
    std::function<void()> open_handler_;
    std::mutex handlers_mutex_;

    void stream_loop(const std::string& url, const std::map<std::string, std::string>& headers);
    void parse_sse_stream(std::istream& stream);
    void dispatch_event(const std::string& event, const std::string& data);
};

} // namespace arcanum