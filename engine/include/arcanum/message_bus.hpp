#pragma once

#include "engine.hpp"
#include <queue>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <unordered_map>
#include <atomic>

namespace arcanum {

class MessageBus {
public:
    using Handler = std::function<void(const Message&)>;
    using Filter = std::function<bool(const Message&)>;

    MessageBus() = default;
    ~MessageBus();

    // Subscribe to message types
    uint64_t subscribe(MessageType type, Handler handler);
    uint64_t subscribe(Filter filter, Handler handler);
    void unsubscribe(uint64_t subscription_id);

    // Publish message
    void publish(const Message& msg);
    void publish_async(const Message& msg);

    // Request-response pattern
    std::future<json> request(const Message& req, std::chrono::milliseconds timeout = 30s);

    // Engine message handler (for stdin/stdout)
    void set_external_handler(Handler handler) { external_handler_ = handler; }
    void handle_external_message(const Message& msg);

    // Statistics
    struct Stats {
        std::atomic<uint64_t> published{0};
        std::atomic<uint64_t> delivered{0};
        std::atomic<uint64_t> failed{0};
    };
    Stats stats() const { return stats_; }

private:
    struct Subscription {
        uint64_t id;
        MessageType type = MessageType::LOG;
        Filter filter;
        Handler handler;
        bool use_filter = false;
    };

    std::mutex subscriptions_mutex_;
    std::unordered_map<uint64_t, Subscription> subscriptions_;
    uint64_t next_sub_id_ = 1;

    std::mutex queue_mutex_;
    std::queue<Message> message_queue_;
    std::condition_variable queue_cv_;
    std::thread dispatcher_thread_;
    std::atomic<bool> running_{false};

    Handler external_handler_;
    Stats stats_;

    void dispatcher_loop();
    void deliver_message(const Message& msg);
    bool matches(const Subscription& sub, const Message& msg) const;
};

} // namespace arcanum