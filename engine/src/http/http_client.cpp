#include "arcanum/http.hpp"
#include <httplib.h>
#include <sstream>
#include <chrono>

namespace arcanum {

HttpClient::HttpClient(const AuthConfig& auth) : auth_(auth), timeout_(30s) {
    default_headers_["User-Agent"] = "ArcanumEngine/1.0";
    default_headers_["Accept"] = "application/json";
}

void HttpClient::set_auth(const AuthConfig& auth) {
    std::lock_guard<std::mutex> lock(client_mutex_);
    auth_ = auth;
}

void HttpClient::set_default_header(const std::string& key, const std::string& value) {
    std::lock_guard<std::mutex> lock(client_mutex_);
    default_headers_[key] = value;
}

void HttpClient::set_timeout(std::chrono::milliseconds timeout) {
    timeout_ = timeout;
}

void HttpClient::set_proxy(const std::string& proxy_url) {
    proxy_ = proxy_url;
}

std::unique_ptr<httplib::Client> HttpClient::create_client(const std::string& url) {
    httplib::URL parsed(url);
    auto client = std::make_unique<httplib::Client>(parsed.host, parsed.port);
    client->set_connection_timeout(0, timeout_.count());
    client->set_read_timeout(timeout_.count());
    client->set_write_timeout(timeout_.count());

    if (!proxy_.empty()) {
        client->set_proxy(proxy_);
    }

    if (parsed.scheme == "https") {
        client->enable_server_certificate_verification(true);
    }

    return client;
}

void HttpClient::apply_auth(httplib::Request& req) const {
    switch (auth_.type) {
        case AuthType::BEARER_TOKEN:
            if (!auth_.token.empty()) {
                req.set_header("Authorization", "Bearer " + auth_.token);
            }
            break;
        case AuthType::API_KEY:
            if (!auth_.api_key.empty()) {
                req.set_header(auth_.api_key_header, auth_.api_key);
            }
            break;
        case AuthType::BASIC_AUTH:
            if (!auth_.username.empty() || !auth_.password.empty()) {
                std::string creds = auth_.username + ":" + auth_.password;
                // Base64 encode would go here
                req.set_header("Authorization", "Basic " + creds); // Simplified
            }
            break;
        case AuthType::CUSTOM:
            // Custom auth handled by user
            break;
        default:
            break;
    }
}

void HttpClient::apply_default_headers(httplib::Request& req) const {
    for (const auto& [key, value] : default_headers_) {
        req.set_header(key, value);
    }
}

HttpResponse HttpClient::make_response(const httplib::Result& res, std::chrono::steady_clock::time_point start) {
    HttpResponse response;
    auto end = std::chrono::steady_clock::now();
    response.elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);

    if (!res) {
        response.error = httplib::to_string(res.error());
        stats_.failures++;
        return response;
    }

    response.status = res->status;
    for (const auto& [key, value] : res->headers) {
        response.headers[key] = value;
    }
    response.body = res->body;
    stats_.bytes_received += res->body.size();
    stats_.successes++;

    return response;
}

Result<HttpResponse> HttpClient::request(const HttpRequest& req) {
    stats_.requests++;

    auto client = create_client(req.url);
    httplib::Request httpreq;
    httpreq.method = req.method;
    httpreq.path = req.url; // httplib expects full URL in path for Client
    httpreq.body = req.body;

    apply_default_headers(httpreq);
    apply_auth(httpreq);
    for (const auto& [key, value] : req.headers) {
        httpreq.set_header(key, value);
    }

    auto start = std::chrono::steady_clock::now();
    httplib::Result res;

    if (req.method == "GET") {
        res = client->Get(req.url, httpreq.headers);
    } else if (req.method == "POST") {
        res = client->Post(req.url, httpreq.headers, req.body, "application/json");
    } else if (req.method == "PUT") {
        res = client->Put(req.url, httpreq.headers, req.body, "application/json");
    } else if (req.method == "PATCH") {
        res = client->Patch(req.url, httpreq.headers, req.body, "application/json");
    } else if (req.method == "DELETE") {
        res = client->Delete(req.url, httpreq.headers, req.body, "application/json");
    } else {
        return Result<HttpResponse>::err("Unsupported HTTP method: " + req.method);
    }

    HttpResponse response = make_response(res, start);
    if (!response.error.empty()) {
        return Result<HttpResponse>::err(response.error);
    }
    stats_.bytes_sent += req.body.size();
    return Result<HttpResponse>::ok(std::move(response));
}

Result<HttpResponse> HttpClient::get(const std::string& url, const std::map<std::string, std::string>& headers) {
    HttpRequest req;
    req.method = "GET";
    req.url = url;
    req.headers = headers;
    return request(req);
}

Result<HttpResponse> HttpClient::post(const std::string& url, const std::string& body, const std::map<std::string, std::string>& headers) {
    HttpRequest req;
    req.method = "POST";
    req.url = url;
    req.body = body;
    req.headers = headers;
    return request(req);
}

Result<HttpResponse> HttpClient::put(const std::string& url, const std::string& body, const std::map<std::string, std::string>& headers) {
    HttpRequest req;
    req.method = "PUT";
    req.url = url;
    req.body = body;
    req.headers = headers;
    return request(req);
}

Result<HttpResponse> HttpClient::patch(const std::string& url, const std::string& body, const std::map<std::string, std::string>& headers) {
    HttpRequest req;
    req.method = "PATCH";
    req.url = url;
    req.body = body;
    req.headers = headers;
    return request(req);
}

Result<HttpResponse> HttpClient::del(const std::string& url, const std::map<std::string, std::string>& headers) {
    HttpRequest req;
    req.method = "DELETE";
    req.url = url;
    req.headers = headers;
    return request(req);
}

Result<void> HttpClient::stream_request(const HttpRequest& req, std::function<void(const std::string&)> on_chunk) {
    stats_.requests++;

    auto client = create_client(req.url);
    httplib::Request httpreq;
    httpreq.method = req.method;
    httpreq.path = req.url;
    httpreq.body = req.body;

    apply_default_headers(httpreq);
    apply_auth(httpreq);
    for (const auto& [key, value] : req.headers) {
        httpreq.set_header(key, value);
    }

    auto start = std::chrono::steady_clock::now();
    auto res = client->send(httpreq);

    if (!res) {
        stats_.failures++;
        return Result<void>::err(httplib::to_string(res.error()));
    }

    if (res->status != 200) {
        stats_.failures++;
        return Result<void>::err("HTTP " + std::to_string(res->status) + ": " + res->body);
    }

    // Read stream
    std::string buffer;
    const auto& body = res->body;
    size_t pos = 0;
    while (pos < body.size()) {
        size_t next = body.find('\n', pos);
        if (next == std::string::npos) next = body.size();
        std::string line = body.substr(pos, next - pos);
        if (!line.empty() && line != "\r") {
            on_chunk(line);
        }
        pos = next + 1;
    }

    stats_.successes++;
    stats_.bytes_received += body.size();
    return Result<void>::ok();
}

std::future<Result<HttpResponse>> HttpClient::request_async(const HttpRequest& req) {
    return std::async(std::launch::async, [this, req]() {
        return this->request(req);
    });
}

// RequestBuilder implementation
RequestBuilder& RequestBuilder::method(const std::string& m) { req_.method = m; return *this; }
RequestBuilder& RequestBuilder::url(const std::string& u) { req_.url = u; return *this; }
RequestBuilder& RequestBuilder::header(const std::string& k, const std::string& v) { req_.headers[k] = v; return *this; }
RequestBuilder& RequestBuilder::headers(const std::map<std::string, std::string>& h) { req_.headers = h; return *this; }
RequestBuilder& RequestBuilder::body(const std::string& b) { req_.body = b; return *this; }
RequestBuilder& RequestBuilder::json_body(const json& j) { req_.body = j.dump(); req_.headers["Content-Type"] = "application/json"; return *this; }
RequestBuilder& RequestBuilder::query_param(const std::string& k, const std::string& v) {
    if (req_.url.find('?') == std::string::npos) req_.url += '?';
    else req_.url += '&';
    req_.url += k + "=" + v;
    return *this;
}
RequestBuilder& RequestBuilder::timeout(std::chrono::milliseconds t) { req_.timeout = t; return *this; }
RequestBuilder& RequestBuilder::auth(const AuthConfig& a) { auth_ = a; return *this; }

HttpRequest RequestBuilder::build() const {
    HttpRequest r = req_;
    // Apply auth to request if needed
    return r;
}

} // namespace arcanum