#pragma once

#include "engine.hpp"
#include <httplib.h>
#include <string>
#include <map>
#include <mutex>
#include <chrono>

namespace arcanum {

// HTTP request/response types
struct HttpRequest {
    std::string method = "GET";
    std::string url;
    std::map<std::string, std::string> headers;
    std::string body;
    std::chrono::milliseconds timeout = 30s;
    bool follow_redirects = true;
    int max_redirects = 10;
};

struct HttpResponse {
    int status = 0;
    std::map<std::string, std::string> headers;
    std::string body;
    std::chrono::milliseconds elapsed;
    std::string error;
};

enum class AuthType {
    NONE,
    BEARER_TOKEN,
    API_KEY,
    BASIC_AUTH,
    OAUTH2,
    CUSTOM
};

struct AuthConfig {
    AuthType type = AuthType::NONE;
    std::string token;
    std::string api_key;
    std::string api_key_header = "Authorization";
    std::string username;
    std::string password;
    std::string oauth2_token_url;
    std::string client_id;
    std::string client_secret;
    json custom;
};

// HTTP Client with connection pooling, retries, auth
class HttpClient {
public:
    explicit HttpClient(const AuthConfig& auth = {});
    ~HttpClient() = default;

    // Configure
    void set_auth(const AuthConfig& auth);
    void set_default_header(const std::string& key, const std::string& value);
    void set_timeout(std::chrono::milliseconds timeout);
    void set_proxy(const std::string& proxy_url);

    // Request methods
    Result<HttpResponse> request(const HttpRequest& req);
    Result<HttpResponse> get(const std::string& url, const std::map<std::string, std::string>& headers = {});
    Result<HttpResponse> post(const std::string& url, const std::string& body, const std::map<std::string, std::string>& headers = {});
    Result<HttpResponse> put(const std::string& url, const std::string& body, const std::map<std::string, std::string>& headers = {});
    Result<HttpResponse> patch(const std::string& url, const std::string& body, const std::map<std::string, std::string>& headers = {});
    Result<HttpResponse> del(const std::string& url, const std::map<std::string, std::string>& headers = {});

    // Streaming request (for SSE)
    Result<void> stream_request(const HttpRequest& req, std::function<void(const std::string&)> on_chunk);

    // Async versions
    std::future<Result<HttpResponse>> request_async(const HttpRequest& req);

    // Statistics
    struct Stats {
        std::atomic<uint64_t> requests{0};
        std::atomic<uint64_t> successes{0};
        std::atomic<uint64_t> failures{0};
        std::atomic<uint64_t> bytes_sent{0};
        std::atomic<uint64_t> bytes_received{0};
    };
    Stats stats() const { return stats_; }

private:
    AuthConfig auth_;
    std::map<std::string, std::string> default_headers_;
    std::chrono::milliseconds timeout_;
    std::string proxy_;
    mutable std::mutex client_mutex_;
    std::unique_ptr<httplib::Client> client_;
    Stats stats_;

    std::unique_ptr<httplib::Client> create_client(const std::string& url);
    void apply_auth(httplib::Request& req) const;
    void apply_default_headers(httplib::Request& req) const;
    HttpResponse make_response(const httplib::Result& res, std::chrono::steady_clock::time_point start);
};

// Request builder for fluent API
class RequestBuilder {
public:
    RequestBuilder& method(const std::string& m);
    RequestBuilder& url(const std::string& u);
    RequestBuilder& header(const std::string& k, const std::string& v);
    RequestBuilder& headers(const std::map<std::string, std::string>& h);
    RequestBuilder& body(const std::string& b);
    RequestBuilder& json_body(const json& j);
    RequestBuilder& query_param(const std::string& k, const std::string& v);
    RequestBuilder& timeout(std::chrono::milliseconds t);
    RequestBuilder& auth(const AuthConfig& a);

    HttpRequest build() const;

private:
    HttpRequest req_;
    AuthConfig auth_;
};

} // namespace arcanum