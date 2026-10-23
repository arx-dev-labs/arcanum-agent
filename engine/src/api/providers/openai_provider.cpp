#include "arcanum/api.hpp"
#include <sstream>

namespace arcanum {

OpenAIProvider::OpenAIProvider() {
    http_.set_default_header("Content-Type", "application/json");
}

std::vector<std::string> OpenAIProvider::supported_models() const {
    return {
        "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4",
        "gpt-3.5-turbo", "gpt-3.5-turbo-16k",
        "o1-preview", "o1-mini"
    };
}

Result<ChatCompletionResponse> OpenAIProvider::chat_completion(const ChatCompletionRequest& req) {
    if (!validate_config()) {
        return Result<ChatCompletionResponse>::err("Invalid OpenAI config: missing API key");
    }

    HttpRequest http_req;
    http_req.method = "POST";
    http_req.url = base_url_ + "/chat/completions";
    http_req.headers["Authorization"] = "Bearer " + api_key_;
    if (!organization_.empty()) {
        http_req.headers["OpenAI-Organization"] = organization_;
    }
    http_req.body = req.to_json().dump();

    auto result = http_.request(http_req);
    if (!result) {
        return Result<ChatCompletionResponse>::err("HTTP error: " + result.error);
    }

    if (result->status != 200) {
        return Result<ChatCompletionResponse>::err("API error " + std::to_string(result->status) + ": " + result->body);
    }

    return ChatCompletionResponse::from_json(json::parse(result->body));
}

Result<void> OpenAIProvider::chat_completion_stream(const ChatCompletionRequest& req,
                                                      std::function<void(const StreamChunk&)> on_chunk) {
    if (!validate_config()) {
        return Result<void>::err("Invalid OpenAI config: missing API key");
    }

    ChatCompletionRequest stream_req = req;
    stream_req.stream = true;

    HttpRequest http_req;
    http_req.method = "POST";
    http_req.url = base_url_ + "/chat/completions";
    http_req.headers["Authorization"] = "Bearer " + api_key_;
    http_req.headers["Accept"] = "text/event-stream";
    if (!organization_.empty()) {
        http_req.headers["OpenAI-Organization"] = organization_;
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
            } catch (...) {
                // Ignore parse errors in stream
            }
        }
    });
}

Result<json> OpenAIProvider::embeddings(const std::vector<std::string>& texts, const std::string& model) {
    if (!validate_config()) {
        return Result<json>::err("Invalid OpenAI config");
    }

    json body;
    body["model"] = model.empty() ? "text-embedding-3-small" : model;
    body["input"] = texts;

    HttpRequest http_req;
    http_req.method = "POST";
    http_req.url = base_url_ + "/embeddings";
    http_req.headers["Authorization"] = "Bearer " + api_key_;
    http_req.body = body.dump();

    auto result = http_.request(http_req);
    if (!result) return Result<json>::err(result.error);
    if (result->status != 200) return Result<json>::err("API error: " + result->body);

    return Result<json>::ok(json::parse(result->body));
}

Result<json> OpenAIProvider::list_models() {
    if (!validate_config()) return Result<json>::err("Invalid config");

    HttpRequest http_req;
    http_req.method = "GET";
    http_req.url = base_url_ + "/models";
    http_req.headers["Authorization"] = "Bearer " + api_key_;

    auto result = http_.request(http_req);
    if (!result) return Result<json>::err(result.error);
    return Result<json>::ok(json::parse(result->body));
}

Result<json> OpenAIProvider::get_model(const std::string& model) {
    if (!validate_config()) return Result<json>::err("Invalid config");

    HttpRequest http_req;
    http_req.method = "GET";
    http_req.url = base_url_ + "/models/" + model;
    http_req.headers["Authorization"] = "Bearer " + api_key_;

    auto result = http_.request(http_req);
    if (!result) return Result<json>::err(result.error);
    return Result<json>::ok(json::parse(result->body));
}

void OpenAIProvider::set_config(const json& config) {
    api_key_ = config.value("api_key", "");
    base_url_ = config.value("base_url", "https://api.openai.com/v1");
    organization_ = config.value("organization", "");

    http_.set_auth({AuthType::BEARER_TOKEN, api_key_});
}

json OpenAIProvider::get_config() const {
    return {{"api_key", api_key_}, {"base_url", base_url_}, {"organization", organization_}};
}

bool OpenAIProvider::validate_config() const {
    return !api_key_.empty();
}

} // namespace arcanum