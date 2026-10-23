#include "arcanum/ws.hpp"
#include <websocketpp/common/thread.hpp>
#include <websocketpp/transport/asio/security.hpp>
#include <iostream>

namespace arcanum {

WebSocketClient::WebSocketClient() {
    client_.init_asio();
    client_.set_tls_init_handler([this](websocketpp::connection_hdl) {
        websocketpp::lib::asio::ssl::context ctx(websocketpp::lib::asio::ssl::context::tlsv12);
        ctx.set_default_verify_paths();
        if (tls_init_) tls_init_(ctx);
        return ctx;
    });

    client_.set_open_handler([this](websocketpp::connection_hdl hdl) { on_open(hdl); });
    client_.set_close_handler([this](websocketpp::connection_hdl hdl) { on_close(hdl); });
    client_.set_message_handler([this](websocketpp::connection_hdl hdl, WsClient::message_ptr msg) { on_message(hdl, msg); });
    client_.set_fail_handler([this](websocketpp::connection_hdl hdl) { on_fail(hdl); });
}

WebSocketClient::~WebSocketClient() {
    disconnect();
}

Result<void> WebSocketClient::connect(const std::string& url, const std::map<std::string, std::string>& headers) {
    if (connected_) return Result<void>::err("Already connected");

    websocketpp::lib::error_code ec;
    auto conn = client_.get_connection(url, ec);
    if (ec) {
        return Result<void>::err("Connection error: " + ec.message());
    }

    for (const auto& [key, value] : headers) {
        conn->append_header(key, value);
    }

    connection_ = conn;
    client_.connect(connection_);

    run_thread_ = std::thread(&WebSocketClient::run_loop, this);

    // Wait for connection
    auto start = std::chrono::steady_clock::now();
    while (!connected_ && !stopping_) {
        if (std::chrono::steady_clock::now() - start > std::chrono::seconds(10)) {
            stopping_ = true;
            if (run_thread_.joinable()) run_thread_.join();
            return Result<void>::err("Connection timeout");
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    return Result<void>::ok();
}

Result<void> WebSocketClient::disconnect() {
    if (!connected_ && !run_thread_.joinable()) return Result<void>::ok();

    stopping_ = true;
    if (connection_) {
        websocketpp::lib::error_code ec;
        client_.close(connection_, websocketpp::close::status::going_away, "", ec);
    }
    client_.stop();

    if (run_thread_.joinable()) {
        run_thread_.join();
    }
    connected_ = false;
    return Result<void>::ok();
}

Result<void> WebSocketClient::send_text(const std::string& text) {
    if (!connected_) return Result<void>::err("Not connected");
    websocketpp::lib::error_code ec;
    client_.send(connection_, text, websocketpp::frame::opcode::text, ec);
    if (ec) return Result<void>::err("Send failed: " + ec.message());
    return Result<void>::ok();
}

Result<void> WebSocketClient::send_binary(const std::vector<uint8_t>& data) {
    if (!connected_) return Result<void>::err("Not connected");
    websocketpp::lib::error_code ec;
    client_.send(connection_, reinterpret_cast<const char*>(data.data()), data.size(), websocketpp::frame::opcode::binary, ec);
    if (ec) return Result<void>::err("Send failed: " + ec.message());
    return Result<void>::ok();
}

Result<void> WebSocketClient::ping(const std::string& payload) {
    if (!connected_) return Result<void>::err("Not connected");
    websocketpp::lib::error_code ec;
    client_.ping(connection_, payload, ec);
    if (ec) return Result<void>::err("Ping failed: " + ec.message());
    return Result<void>::ok();
}

void WebSocketClient::run_loop() {
    try {
        client_.run();
    } catch (const std::exception& e) {
        if (error_handler_) error_handler_("WebSocket run error: " + std::string(e.what()));
    }
}

void WebSocketClient::on_open(websocketpp::connection_hdl hdl) {
    connected_ = true;
    if (state_handler_) state_handler_(websocketpp::session::state::open);
    if (open_handler_) open_handler_();
}

void WebSocketClient::on_close(websocketpp::connection_hdl hdl) {
    connected_ = false;
    if (state_handler_) state_handler_(websocketpp::session::state::closed);
}

void WebSocketClient::on_message(websocketpp::connection_hdl hdl, WsClient::message_ptr msg) {
    WsMessage ws_msg;
    ws_msg.type = msg->get_opcode() == websocketpp::frame::opcode::text ? WsMessage::Type::TEXT
        : msg->get_opcode() == websocketpp::frame::opcode::binary ? WsMessage::Type::BINARY
        : msg->get_opcode() == websocketpp::frame::opcode::ping ? WsMessage::Type::PING
        : msg->get_opcode() == websocketpp::frame::opcode::pong ? WsMessage::Type::PONG
        : WsMessage::Type::CLOSE;
    ws_msg.payload = msg->get_payload();
    handle_message(ws_msg);
}

void WebSocketClient::on_fail(websocketpp::connection_hdl hdl) {
    connected_ = false;
    if (state_handler_) state_handler_(websocketpp::session::state::closed);
    if (error_handler_) error_handler_("WebSocket connection failed");
}

void WebSocketClient::handle_message(const WsMessage& msg) {
    if (msg_handler_) msg_handler_(msg);
}

websocketpp::session::state::value WebSocketClient::state() const {
    if (!connection_) return websocketpp::session::state::connecting;
    return connection_->get_state();
}

// SSE Client Implementation
SSEClient::SSEClient() = default;

SSEClient::~SSEClient() {
    disconnect();
}

Result<void> SSEClient::connect(const std::string& url, const std::map<std::string, std::string>& headers) {
    if (connected_) return Result<void>::err("Already connected");

    http_client_ = std::make_unique<HttpClient>();
    for (const auto& [key, value] : headers) {
        http_client_->set_default_header(key, value);
    }
    http_client_->set_default_header("Accept", "text/event-stream");
    http_client_->set_default_header("Cache-Control", "no-cache");

    connected_ = true;
    stopping_ = false;
    stream_thread_ = std::thread(&SSEClient::stream_loop, this, url, headers);

    return Result<void>::ok();
}

Result<void> SSEClient::disconnect() {
    if (!connected_) return Result<void>::ok();

    stopping_ = true;
    connected_ = false;
    http_client_.reset();

    if (stream_thread_.joinable()) {
        stream_thread_.join();
    }
    return Result<void>::ok();
}

void SSEClient::on_event(const std::string& event_type, EventHandler handler) {
    std::lock_guard<std::mutex> lock(handlers_mutex_);
    event_handlers_[event_type] = std::move(handler);
}

void SSEClient::on_any_event(EventHandler handler) {
    std::lock_guard<std::mutex> lock(handlers_mutex_);
    any_event_handler_ = std::move(handler);
}

void SSEClient::stream_loop(const std::string& url, const std::map<std::string, std::string>& headers) {
    HttpRequest req;
    req.method = "GET";
    req.url = url;
    req.headers = headers;
    req.timeout = 0; // No timeout for SSE

    auto result = http_client_->stream_request(req, [this](const std::string& chunk) {
        static std::string event_type;
        static std::string data;
        static std::string id;
        static int retry = 0;

        std::istringstream iss(chunk);
        std::string line;
        while (std::getline(iss, line)) {
            if (line.empty() || line == "\r") {
                // Empty line = dispatch event
                if (!data.empty()) {
                    dispatch_event(event_type.empty() ? "message" : event_type, data);
                    event_type.clear();
                    data.clear();
                }
                continue;
            }

            if (line.rfind("event:", 0) == 0) {
                event_type = line.substr(6);
                if (!event_type.empty() && event_type[0] == ' ') event_type = event_type.substr(1);
            } else if (line.rfind("data:", 0) == 0) {
                data += line.substr(5);
                if (!data.empty() && data[0] == ' ') data = data.substr(1);
                data += "\n";
            } else if (line.rfind("id:", 0) == 0) {
                id = line.substr(3);
                if (!id.empty() && id[0] == ' ') id = id.substr(1);
            } else if (line.rfind("retry:", 0) == 0) {
                retry = std::stoi(line.substr(6));
            }
        }
    });

    if (!result) {
        if (error_handler_) error_handler_(result.error);
    }
    connected_ = false;
}

void SSEClient::dispatch_event(const std::string& event, const std::string& data) {
    std::lock_guard<std::mutex> lock(handlers_mutex_);

    if (any_event_handler_) {
        any_event_handler_(event, data);
    }
    auto it = event_handlers_.find(event);
    if (it != event_handlers_.end()) {
        it->second(event, data);
    }
}

} // namespace arcanum