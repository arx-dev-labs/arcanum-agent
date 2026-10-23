#include "arcanum/api.hpp"

namespace arcanum {

CustomProvider::CustomProvider() {
    http_.set_default_header("Content-Type", "application/json");
}

Result<ChatCompletionResponse> CustomProvider::chat_completion(const ChatCompletionRequest& req) {
    if (!validate_config()) {
        return Result<ChatCompletionResponse>::err("Invalid custom provider config");
    }

    HttpRequest http_req;
    http_req.method = "POST";
    http_req.url = base_url_ + "/chat/completions";
    if (!api_key_.empty()) {
        http_req.headers["Authorization"] = "Bearer " + api_key_;
    }
    for (const auto& [k, v] : extra_headers_) {
        http_req.headers[k] = v;
    }
    http_req.body = req.to_json().dump();

    auto result = http_.request(http_req);
    if (!result) return Result<ChatCompletionResponse>::err("HTTP error: " + result.error);
    if (result->status != 200) return Result<ChatCompletionResponse>::err("API error: " + result->body);

    return ChatCompletionResponse::from_json(json::parse(result->body));
}

Result<void> CustomProvider::chat_completion_stream(const ChatCompletionRequest& req,
                                                     std::function<void(const StreamChunk&)> on_chunk) {
    if (!validate_config()) return Result<void>::err("Invalid config");

    ChatCompletionRequest stream_req = req;
    stream_req.stream = true;

    HttpRequest http_req;
    http_req.method = "POST";
    http_req.url = base_url_ + "/chat/completions";
    if (!api_key_.empty()) {
        http_req.headers["Authorization"] = "Bearer " + api_key_;
    }
    http_req.headers["Accept"] = "text/event-stream";
    for (const auto& [k, v] : extra_headers_) {
        http_req.headers[k] = v;
    }
    http_req.body = stream_req.to_json().dump();

    return http_.stream_request(http_req, [on_chunk](const std::string& line) {
        if (line.rfind("data: ", 0) == 0) {
            std::string data = line.substr(6);
            if (data == "[DONE]") {
                StreamChunk chunk;
                chunk.done = true;
                on_chunk(chunk);
                return;
            }
            try {
                json j = json::parse(data);
                StreamChunk chunk;
                chunk.id = j.value("id", "");
                chunk.model = j.value("model", "");
                chunk.created = j.value("created", 0ull);
                for (const auto& choice : j.value("choices", json::array())) {
                    StreamChunk::Choice c;
                    c.index = choice.value("index", 0);
                    c.finish_reason = choice.value("finish_reason", "");
                    const auto& delta = choice.value("delta", json::object());
                    c.delta.role = ChatMessage::Role::ASSISTANT;
                    c.delta.content = delta.value("content", "");
                    c.delta.tool_calls = delta.value("tool_calls", json::array());
                    chunk.choices.push_back(c);
                }
                on_chunk(chunk);
            } catch (...) {}
        }
    });
}

Result<json> CustomProvider::embeddings(const std::vector<std::string>& texts, const std::string& model) {
    if (!validate_config()) return Result<json>::err("Invalid config");

    json body;
    body["model"] = model;
    body["input"] = texts;

    HttpRequest http_req;
    http_req.method = "POST";
    http_req.url = base_url_ + "/embeddings";
    if (!api_key_.empty()) http_req.headers["Authorization"] = "Bearer " + api_key_;
    for (const auto& [k, v] : extra_headers_) http_req.headers[k] = v;
    http_req.body = body.dump();

    auto result = http_.request(http_req);
    if (!result) return Result<json>::err(result.error);
    return Result<json>::ok(json::parse(result->body));
}

Result<json> CustomProvider::list_models() {
    return Result<json>::ok(json::array(models_));
}

Result<json> CustomProvider::get_model(const std::string& model) {
    for (const auto& m : models_) {
        if (m == model) return Result<json>::ok({{"id", model}, {"owned_by", "custom"}});
    }
    return Result<json>::err("Model not found");
}

void CustomProvider::set_config(const json& config) {
    api_key_ = config.value("api_key", "");
    base_url_ = config.value("base_url", "");
    models_ = config.value("models", std::vector<std::string>{});
    extra_headers_ = config.value("extra_headers", std::map<std::string, std::string>{});

    if (!api_key_.empty()) {
        http_.set_auth({AuthType::BEARER_TOKEN, api_key_});
    }
}

json CustomProvider::get_config() const {
    json j;
    j["api_key"] = api_key_;
    j["base_url"] = base_url_;
    j["models"] = models_;
    j["extra_headers"] = extra_headers_;
    return j;
}

bool CustomProvider::validate_config() const {
    return !base_url_.empty();
}

} // namespace arcanum