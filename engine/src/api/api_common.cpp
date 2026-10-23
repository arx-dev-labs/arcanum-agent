#include "arcanum/api.hpp"
#include <sstream>

namespace arcanum {

// ChatMessage JSON serialization
json ChatMessage::to_json() const {
    json j;
    j["role"] = [this]() {
        switch (role) {
            case Role::SYSTEM: return "system";
            case Role::USER: return "user";
            case Role::ASSISTANT: return "assistant";
            case Role::TOOL: return "tool";
            case Role::FUNCTION: return "function";
        }
        return "user";
    }();
    if (!content.empty()) j["content"] = content;
    if (!name.empty()) j["name"] = name;
    if (!tool_calls.empty()) j["tool_calls"] = tool_calls;
    if (!tool_call_id.empty()) j["tool_call_id"] = tool_call_id;
    return j;
}

// Tool JSON serialization
json Tool::to_json() const {
    json j;
    j["type"] = "function";
    j["function"]["name"] = name;
    j["function"]["description"] = description;
    j["function"]["parameters"] = parameters;
    return j;
}

// ChatCompletionRequest JSON serialization
json ChatCompletionRequest::to_json() const {
    json j;
    j["model"] = model;
    j["messages"] = json::array();
    for (const auto& msg : messages) {
        j["messages"].push_back(msg.to_json());
    }
    if (!tools.empty()) {
        j["tools"] = json::array();
        for (const auto& tool : tools) {
            j["tools"].push_back(tool.to_json());
        }
    }
    j["temperature"] = temperature;
    j["max_tokens"] = max_tokens;
    j["top_p"] = top_p;
    j["n"] = n;
    j["stream"] = stream;
    if (!stop.empty()) j["stop"] = stop;
    if (!response_format.empty()) j["response_format"] = response_format;
    for (const auto& [key, value] : extra.items()) {
        j[key] = value;
    }
    return j;
}

// ChatCompletionResponse from JSON
Result<ChatCompletionResponse> ChatCompletionResponse::from_json(const json& j) {
    ChatCompletionResponse resp;
    try {
        resp.id = j.value("id", "");
        resp.model = j.value("model", "");
        resp.created = j.value("created", 0ull);
        resp.object = j.value("object", "");

        for (const auto& choice : j.value("choices", json::array())) {
            Choice c;
            c.index = choice.value("index", 0);
            c.finish_reason = choice.value("finish_reason", "");

            const auto& msg = choice.value("message", json::object());
            c.message.role = [&msg]() {
                std::string r = msg.value("role", "assistant");
                if (r == "system") return ChatMessage::Role::SYSTEM;
                if (r == "user") return ChatMessage::Role::USER;
                if (r == "assistant") return ChatMessage::Role::ASSISTANT;
                if (r == "tool") return ChatMessage::Role::TOOL;
                if (r == "function") return ChatMessage::Role::FUNCTION;
                return ChatMessage::Role::ASSISTANT;
            }();
            c.message.content = msg.value("content", "");
            c.message.name = msg.value("name", "");
            c.message.tool_calls = msg.value("tool_calls", json::array());
            c.message.tool_call_id = msg.value("tool_call_id", "");
            resp.choices.push_back(c);
        }

        const auto& usage = j.value("usage", json::object());
        resp.usage.prompt_tokens = usage.value("prompt_tokens", 0);
        resp.usage.completion_tokens = usage.value("completion_tokens", 0);
        resp.usage.total_tokens = usage.value("total_tokens", 0);

        resp.error = j.value("error", "");

        return Result<ChatCompletionResponse>::ok(std::move(resp));
    } catch (const std::exception& e) {
        return Result<ChatCompletionResponse>::err("Parse error: " + std::string(e.what()));
    }
}

} // namespace arcanum