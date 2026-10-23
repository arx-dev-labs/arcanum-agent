// Example Plugin: Web Search
// Build: g++ -shared -fPIC -std=c++20 -I../../include -o web_search.so web_search_plugin.cpp

#include <arcanum/plugin.hpp>
#include <arcanum/http.hpp>
#include <string>
#include <vector>
#include <memory>

using namespace arcanum;

class WebSearchPlugin : public IPlugin {
public:
    PluginMetadata metadata() const override {
        return PluginMetadata{
            .name = "web_search",
            .version = "1.0.0",
            .description = "Web search capability using DuckDuckGo HTML scraping",
            .author = "Arcanum Team",
            .dependencies = {},
            .config_schema = R"({
                "type": "object",
                "properties": {
                    "max_results": {"type": "integer", "default": 5},
                    "timeout": {"type": "integer", "default": 10000}
                }
            })"_json,
            .capabilities = {
                {"web_search", true},
                {"fetch_url", true}
            }
        };
    }

    Result<void> initialize(const json& config) override {
        max_results_ = config.value("max_results", 5);
        timeout_ = std::chrono::milliseconds(config.value("timeout", 10000));
        http_client_ = std::make_unique<HttpClient>();
        http_client_->set_timeout(timeout_);
        return Result<void>::ok();
    }

    Result<void> shutdown() override {
        http_client_.reset();
        return Result<void>::ok();
    }

    json handle_command(const std::string& command, const json& args) override {
        if (command == "search") {
            return search(args);
        } else if (command == "fetch") {
            return fetch(args);
        }
        return Result<json>::err("Unknown command: " + command).value();
    }

private:
    std::unique_ptr<HttpClient> http_client_;
    int max_results_ = 5;
    std::chrono::milliseconds timeout_{10000};

    json search(const json& args) {
        std::string query = args.value("query", "");
        if (query.empty()) {
            return {{"error", "Query parameter required"}};
        }

        int count = args.value("count", max_results_);

        // Use DuckDuckGo HTML (no API key needed)
        std::string url = "https://html.duckduckgo.com/html/?q=" + url_encode(query);

        HttpRequest req;
        req.method = "GET";
        req.url = url;
        req.timeout = timeout_;

        auto result = http_client_->request(req);
        if (!result) {
            return {{"error", result.error}};
        }

        // Parse HTML results (simplified)
        std::vector<json> results = parse_ddg_html(result->body, count);

        return {
            {"query", query},
            {"results", results},
            {"count", results.size()}
        };
    }

    json fetch(const json& args) {
        std::string url = args.value("url", "");
        if (url.empty()) {
            return {{"error", "URL parameter required"}};
        }

        HttpRequest req;
        req.method = "GET";
        req.url = url;
        req.timeout = timeout_;

        auto result = http_client_->request(req);
        if (!result) {
            return {{"error", result.error}};
        }

        return {
            {"url", url},
            {"status", result->status},
            {"content", result->body.substr(0, 50000)}, // Limit size
            {"content_type", result->headers["content-type"]}
        };
    }

    std::string url_encode(const std::string& str) {
        std::string encoded;
        encoded.reserve(str.size() * 3);
        for (char c : str) {
            if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
                encoded += c;
            } else if (c == ' ') {
                encoded += '+';
            } else {
                char buf[4];
                sprintf(buf, "%%%02X", (unsigned char)c);
                encoded += buf;
            }
        }
        return encoded;
    }

    std::vector<json> parse_ddg_html(const std::string& html, int limit) {
        std::vector<json> results;
        // Simplified HTML parsing - in production use a proper parser
        size_t pos = 0;
        while (results.size() < static_cast<size_t>(limit) && (pos = html.find("class=\"result__snippet\"", pos)) != std::string::npos) {
            size_t start = html.find('>', pos);
            size_t end = html.find("</a>", start);
            if (start != std::string::npos && end != std::string::npos) {
                std::string snippet = html.substr(start + 1, end - start - 1);
                // Clean up HTML entities
                results.push_back({{"snippet", snippet}});
            }
            pos = end;
        }
        return results;
    }
};

// C API entry points
extern "C" {
    PluginMetadata* arcanum_plugin_metadata() {
        static WebSearchPlugin plugin;
        static PluginMetadata meta = plugin.metadata();
        return &meta;
    }

    IPlugin* arcanum_plugin_create() {
        return new WebSearchPlugin();
    }

    void arcanum_plugin_destroy(IPlugin* plugin) {
        delete static_cast<WebSearchPlugin*>(plugin);
    }
}