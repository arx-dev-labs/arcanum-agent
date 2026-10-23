#include "arcanum/api.hpp"

namespace arcanum {

AnthropicProvider::AnthropicProvider() {
    http_.set_default_header("Content-Type", "application/json");
    http_.set_default_header("anthropic-version", version_);
}

std::vector<std::string> AnthropicProvider::supported_models() const {
    return {
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307",
        "claude-2.1",
        "claude-2.0",
        "claude-instant-1.2"
    };
}

Result<ChatCompletionResponse> AnthropicProvider::chat_completion(const ChatCompletionRequest& req) {
    if (!validate_config()) {
        return Result<ChatCompletionResponse>::err("Invalid Anthropic config: missing API key");
    }

    // Convert to Anthropic format
    json body;
    body["model"] = req.model;
    body["max_tokens"] = req.max_tokens;
    body["temperature"] = req.temperature;
    body["top_p"] = req.top_p;
    body["stream"] = false;

    // Separate system message
    std::string system_prompt;
    json messages = json::array();
    for (const auto& msg : req.messages) {
        if (msg.role == ChatMessage::Role::SYSTEM) {
            system_prompt = msg.content;
        } else {
            json m;
            m["role"] = (msg.role == ChatMessage::Role::USER) ? "user" : "assistant";
            m["content"] = msg.content;
            messages.push_back(m);
        }
    }
    if (!system_prompt.empty()) body["system"] = system_prompt;
    body["messages"] = messages;

    // Tools
    if (!req.tools.empty()) {
        json tools = json::array();
        for (const auto& tool : req.tools) {
            tools.push_back(tool.to_json());
        }
        body["tools"] = tools;
    }

    HttpRequest http_req;
    http_req.method = "POST";
    http_req.url = base_url_ + "/messages";
    http_req.headers["x-api-key"] = api_key_;
    http_req.body = body.dump();

    auto result = http_.request(http_req);
    if (!result) return Result<ChatCompletionResponse>::err("HTTP error: " + result.error);
    if (result->status != 200) return Result<ChatCompletionResponse>::err("API error: " + result->body);

    // Convert Anthropic response to OpenAI format
    json resp = json::parse(result->body);
    ChatCompletionResponse out;
    out.id = resp.value("id", "");
    out.model = resp.value("model", "");
    out.object = "chat.completion";
    out.created = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();

    ChatCompletionResponse::Choice choice;
    choice.index = 0;
    choice.message.role = ChatMessage::Role::ASSISTANT;
    choice.message.content = "";
    for (const auto& content : resp.value("content", json::array())) {
        if (content.value("type", "") == "text") {
            choice.message.content += content.value("text", "");
        }
    }
    choice.finish_reason = resp.value("stop_reason", "stop");
    out.choices.push_back(choice);

    const auto& usage = resp.value("usage", json::object());
    out.usage.prompt_tokens = usage.value("input_tokens", 0);
    out.usage.completion_tokens = usage.value("output_tokens", 0);
    out.usage.total_tokens = out.usage.prompt_tokens + out.usage.completion_tokens;

    return Result<ChatCompletionResponse>::ok(std::move(out));
}

Result<void> AnthropicProvider::chat_completion_stream(const ChatCompletionRequest& req,
                                                        std::function<void(const StreamChunk&)> on_chunk) {
    if (!validate_config()) {
        return Result<void>::err("Invalid Anthropic config");
    }

    json body;
    body["model"] = req.model;
    body["max_tokens"] = req.max_tokens;
    body["temperature"] = req.temperature;
    body["top_p"] = req.top_p;
    body["stream"] = true;

    std::string system_prompt;
    json messages = json::array();
    for (const auto& msg : req.messages) {
        if (msg.role == ChatMessage::Role::SYSTEM) {
            system_prompt = msg.content;
        } else {
            json m;
            m["role"] = (msg.role == ChatMessage::Role::USER) ? "user" : "assistant";
            m["content"] = msg.content;
            messages.push_back(m);
        }
    }
    if (!system_prompt.empty()) body["system"] = system_prompt;
    body["messages"] = messages;

    HttpRequest http_req;
    http_req.method = "POST";
    http_req.url = base_url_ + "/messages";
    http_req.headers["x-api-key"] = api_key_;
    http_req.headers["Accept"] = "text/event-stream";
    http_req.body = body.dump();

    return http_.stream_request(http_req, [on_chunk](const std::string& line) {
        if (line.rfind("event: ", 0) == 0) {
            // Anthropic sends events: message_start, content_block_delta, message_delta, message_stop
        } else if (line.rfind("data: ", 0) == 0) {
            std::string data = line.substr(6);
            try {
                json j = json::parse(data);
                std::string type = j.value("type", "");

                StreamChunk chunk;
                if (type == "content_block_delta") {
                    const auto& delta = j.value("delta", json::object());
                    if (delta.value("type", "") == "text_delta") {
                        chunk.choices.push_back({0, {ChatMessage::Role::ASSISTANT, delta.value("text", "")}, ""});
                        on_chunk(chunk);
                    }
                } else if (type == "message_stop") {
                    chunk.done = true;
                    on_chunk(chunk);
                }
            } catch (...) {}
        }
    });
}

Result<json> AnthropicProvider::embeddings(const std::vector<std::string>&, const std::string&) {
    return Result<json>::err("Anthropic does not support embeddings");
}

Result<json> AnthropicProvider::list_models() {
    return Result<json>::ok(json::array(supported_models()));
}

Result<json> AnthropicProvider::get_model(const std::string& model) {
    for (const auto& m : supported_models()) {
        if (m == model) return Result<json>::ok({{"id", model}, {"owned_by", "anthropic"}});
    }
    return Result<json>::err("Model not found");
}

void AnthropicProvider::set_config(const json& config) {
    api_key_ = config.value("api_key", "");
    base_url_ = config.value("base_url", "https://api.anthropic.com/v1");
    version_ = config.value("version", "2023-06-01");
    http_.set_default_header("anthropic-version", version_);
}

json AnthropicProvider::get_config() const {
    return {{"api_key", api_key_}, {"base_url", base_url_}, {"version", version_}};
}

bool AnthropicProvider::validate_config() const {
    return !api_key_.empty();
}

} // namespace arcanum