#include "arcanum/message_bus.hpp"
#include "arcanum/engine.hpp"
#include <chrono>
#include <iostream>

namespace arcanum {

MessageBus::~MessageBus() {
    running_ = false;
    queue_cv_.notify_all();
    if (dispatcher_thread_.joinable()) {
        dispatcher_thread_.join();
    }
}

uint64_t MessageBus::subscribe(MessageType type, Handler handler) {
    std::lock_guard<std::mutex> lock(subscriptions_mutex_);
    uint64_t id = next_sub_id_++;
    subscriptions_[id] = Subscription{id, type, {}, std::move(handler), false};
    return id;
}

uint64_t MessageBus::subscribe(Filter filter, Handler handler) {
    std::lock_guard<std::mutex> lock(subscriptions_mutex_);
    uint64_t id = next_sub_id_++;
    subscriptions_[id] = Subscription{id, MessageType::LOG, std::move(filter), std::move(handler), true};
    return id;
}

void MessageBus::unsubscribe(uint64_t subscription_id) {
    std::lock_guard<std::mutex> lock(subscriptions_mutex_);
    subscriptions_.erase(subscription_id);
}

void MessageBus::publish(const Message& msg) {
    stats_.published++;
    std::lock_guard<std::mutex> lock(queue_mutex_);
    message_queue_.push(msg);
    queue_cv_.notify_one();
}

void MessageBus::publish_async(const Message& msg) {
    stats_.published++;
    // Deliver directly without queueing
    deliver_message(msg);
}

std::future<json> MessageBus::request(const Message& req, std::chrono::milliseconds timeout) {
    std::promise<json> promise;
    auto future = promise.get_future();

    uint64_t correlation_id = req.id;
    auto sub_id = subscribe([correlation_id](const Message& msg) {
        return msg.correlation_id == correlation_id &&
               (msg.type == MessageType::RESULT || msg.type == MessageType::ERROR);
    }, [promise = std::move(promise)](const Message& msg) mutable {
        if (msg.type == MessageType::RESULT) {
            promise.set_value(msg.payload);
        } else {
            promise.set_value(json{{"error", msg.payload.value("error", "Unknown error")}});
        }
    });

    publish(req);

    // Wait with timeout
    if (future.wait_for(timeout) == std::future_status::timeout) {
        unsubscribe(sub_id);
        promise.set_value(json{{"error", "Request timeout"}});
    }

    return future;
}

void MessageBus::handle_external_message(const Message& msg) {
    if (external_handler_) {
        external_handler_(msg);
    }
    deliver_message(msg);
}

void MessageBus::dispatcher_loop() {
    running_ = true;
    while (running_) {
        Message msg;
        {
            std::unique_lock<std::mutex> lock(queue_mutex_);
            queue_cv_.wait(lock, [this] { return !message_queue_.empty() || !running_; });
            if (!running_) break;
            if (message_queue_.empty()) continue;
            msg = std::move(message_queue_.front());
            message_queue_.pop();
        }
        deliver_message(msg);
    }
}

void MessageBus::deliver_message(const Message& msg) {
    std::vector<Handler> handlers;
    {
        std::lock_guard<std::mutex> lock(subscriptions_mutex_);
        for (const auto& [id, sub] : subscriptions_) {
            if (matches(sub, msg)) {
                handlers.push_back(sub.handler);
            }
        }
    }

    for (const auto& handler : handlers) {
        try {
            handler(msg);
            stats_.delivered++;
        } catch (const std::exception& e) {
            stats_.failed++;
            std::cerr << "Message handler error: " << e.what() << std::endl;
        }
    }
}

bool MessageBus::matches(const Subscription& sub, const Message& msg) const {
    if (sub.use_filter) {
        return sub.filter(msg);
    }
    return sub.type == msg.type;
}

std::string Message::current_timestamp() {
    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
    auto time = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << std::put_time(std::gmtime(&time), "%Y-%m-%dT%H:%M:%S");
    ss << '.' << std::setfill('0') << std::setw(3) << ms.count() << 'Z';
    return ss.str();
}

std::string Message::serialize() const {
    json j;
    j["type"] = static_cast<uint8_t>(type);
    j["id"] = id;
    j["correlation_id"] = correlation_id;
    j["payload"] = payload;
    j["timestamp"] = timestamp;
    return j.dump();
}

Result<Message> Message::deserialize(const std::string& data) {
    try {
        json j = json::parse(data);
        Message msg;
        msg.type = static_cast<MessageType>(j.value("type", 0));
        msg.id = j.value("id", 0ull);
        msg.correlation_id = j.value("correlation_id", 0ull);
        msg.payload = j.value("payload", json::object());
        msg.timestamp = j.value("timestamp", "");
        return Result<Message>::ok(std::move(msg));
    } catch (const std::exception& e) {
        return Result<Message>::err("Failed to deserialize message: " + std::string(e.what()));
    }
}

} // namespace arcanum