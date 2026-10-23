#include "arcanum/api.hpp"

namespace arcanum {

NvidiaProvider::NvidiaProvider() {
    http_.set_default_header("Content-Type", "application/json");
}

std::vector<std::string> NvidiaProvider::supported_models() const {
    return {
        "meta/llama-3.1-405b-instruct",
        "meta/llama-3.1-70b-instruct",
        "meta/llama-3.1-8b-instruct",
        "meta/llama-3.2-1b-instruct",
        "meta/llama-3.2-3b-instruct",
        "mistralai/mistral-7b-instruct-v0.3",
        "mistralai/mixtral-8x7b-instruct-v0.1",
        "google/gemma-2-9b-it",
        "google/gemma-2-27b-it",
        "nvidia/nemotron-3-ultra",
        "nvidia/nemotron-3-8b"
    };
}

Result<ChatCompletionResponse> NvidiaProvider::chat_completion(const ChatCompletionRequest& req) {
    if (!validate_config()) {
        return Result<ChatCompletionResponse>::err("Invalid NVIDIA config: missing API key");
    }

    HttpRequest http_req;
    http_req.method = "POST";
    http_req.url = base_url_ + "/chat/completions";
    http_req.headers["Authorization"] = "Bearer " + api_key_;
    http_req.body = req.to_json().dump();

    auto result = http_.request(http_req);
    if (!result) return Result<ChatCompletionResponse>::err("HTTP error: " + result.error);
    if (result->status != 200) return Result<ChatCompletionResponse>::err("API error: " + result->body);

    return ChatCompletionResponse::from_json(json::parse(result->body));
}

Result<void> NvidiaProvider::chat_completion_stream(const ChatCompletionRequest& req,
                                                     std::function<void(const StreamChunk&)> on_chunk) {
    if (!validate_config()) {
        return Result<void>::err("Invalid NVIDIA config");
    }

    ChatCompletionRequest stream_req = req;
    stream_req.stream = true;

    HttpRequest http_req;
    http_req.method = "POST";
    http_req.url = base_url_ + "/chat/completions";
    http_req.headers["Authorization"] = "Bearer " + api_key_;
    http_req.headers["Accept"] = "text/event-stream";
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

Result<json> NvidiaProvider::embeddings(const std::vector<std::string>& texts, const std::string& model) {
    if (!validate_config()) return Result<json>::err("Invalid config");

    json body;
    body["model"] = model.empty() ? "nvidia/nv-embed-v1" : model;
    body["input"] = texts;
    body["input_type"] = "passage";
    body["truncate"] = "END";

    HttpRequest http_req;
    http_req.method = "POST";
    http_req.url = base_url_ + "/embeddings";
    http_req.headers["Authorization"] = "Bearer " + api_key_;
    http_req.body = body.dump();

    auto result = http_.request(http_req);
    if (!result) return Result<json>::err(result.error);
    return Result<json>::ok(json::parse(result->body));
}

Result<json> NvidiaProvider::list_models() {
    return Result<json>::ok(json::array(supported_models()));
}

Result<json> NvidiaProvider::get_model(const std::string& model) {
    for (const auto& m : supported_models()) {
        if (m == model) return Result<json>::ok({{"id", model}, {"owned_by", "nvidia"}});
    }
    return Result<json>::err("Model not found");
}

void NvidiaProvider::set_config(const json& config) {
    api_key_ = config.value("api_key", "");
    base_url_ = config.value("base_url", "https://integrate.api.nvidia.com/v1");
    http_.set_auth({AuthType::BEARER_TOKEN, api_key_});
}

json NvidiaProvider::get_config() const {
    return {{"api_key", api_key_}, {"base_url", base_url_}};
}

bool NvidiaProvider::validate_config() const {
    return !api_key_.empty();
}

} // namespace arcanum