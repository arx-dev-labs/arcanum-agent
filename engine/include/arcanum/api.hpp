#pragma once

#include "engine.hpp"
#include "http.hpp"
#include <string>
#include <vector>
#include <memory>

namespace arcanum {

// Chat message
struct ChatMessage {
    enum class Role { SYSTEM, USER, ASSISTANT, TOOL, FUNCTION };
    Role role;
    std::string content;
    std::string name;  // for function/tool messages
    json tool_calls;   // for assistant messages with tool calls
    std::string tool_call_id; // for tool responses

    static ChatMessage system(const std::string& content) { return {Role::SYSTEM, content}; }
    static ChatMessage user(const std::string& content) { return {Role::USER, content}; }
    static ChatMessage assistant(const std::string& content) { return {Role::ASSISTANT, content}; }
    static ChatMessage tool(const std::string& content, const std::string& tool_call_id) {
        return {Role::TOOL, content, "", json{}, tool_call_id};
    }
    json to_json() const;
};

// Tool definition
struct Tool {
    std::string name;
    std::string description;
    json parameters;  // JSON Schema
    bool required = false;

    json to_json() const;
};

// Chat completion request
struct ChatCompletionRequest {
    std::string model;
    std::vector<ChatMessage> messages;
    std::vector<Tool> tools;
    double temperature = 0.7;
    int max_tokens = 4096;
    double top_p = 1.0;
    int n = 1;
    bool stream = false;
    std::string stop;
    json response_format;
    json extra;

    json to_json() const;
};

// Chat completion response
struct ChatCompletionResponse {
    std::string id;
    std::string model;
    uint64_t created = 0;
    std::string object;
    struct Choice {
        int index = 0;
        ChatMessage message;
        std::string finish_reason;
    };
    std::vector<Choice> choices;
    struct Usage {
        int prompt_tokens = 0;
        int completion_tokens = 0;
        int total_tokens = 0;
    };
    Usage usage;
    std::string error;

    static Result<ChatCompletionResponse> from_json(const json& j);
};

// Streaming chunk
struct StreamChunk {
    std::string id;
    std::string model;
    uint64_t created = 0;
    struct Choice {
        int index = 0;
        ChatMessage delta;
        std::string finish_reason;
    };
    std::vector<Choice> choices;
    bool done = false;
};

// Base provider interface
class IProvider {
public:
    virtual ~IProvider() = default;

    virtual std::string name() const = 0;
    virtual std::vector<std::string> supported_models() const = 0;

    // Chat completion
    virtual Result<ChatCompletionResponse> chat_completion(const ChatCompletionRequest& req) = 0;
    virtual Result<void> chat_completion_stream(const ChatCompletionRequest& req,
                                                 std::function<void(const StreamChunk&)> on_chunk) = 0;

    // Embeddings
    virtual Result<json> embeddings(const std::vector<std::string>& texts, const std::string& model) = 0;

    // Model info
    virtual Result<json> list_models() = 0;
    virtual Result<json> get_model(const std::string& model) = 0;

    // Configuration
    virtual void set_config(const json& config) = 0;
    virtual json get_config() const = 0;
    virtual bool validate_config() const = 0;
};

// Provider registry
class ApiRegistry {
public:
    ApiRegistry() = default;

    // Register provider
    void register_provider(std::unique_ptr<IProvider> provider);

    // Get provider
    IProvider* get_provider(const std::string& name);
    const IProvider* get_provider(const std::string& name) const;

    // List providers
    std::vector<std::string> list_providers() const;
    std::vector<std::string> list_models(const std::string& provider) const;

    // Default provider
    void set_default_provider(const std::string& name) { default_provider_ = name; }
    const std::string& default_provider() const { return default_provider_; }

    // Chat completion with fallback
    Result<ChatCompletionResponse> chat_completion(const ChatCompletionRequest& req);
    Result<void> chat_completion_stream(const ChatCompletionRequest& req,
                                         std::function<void(const StreamChunk&)> on_chunk);

private:
    std::unordered_map<std::string, std::unique_ptr<IProvider>> providers_;
    std::string default_provider_;
    std::mutex mutex_;
};

// OpenAI Provider
class OpenAIProvider : public IProvider {
public:
    OpenAIProvider();
    ~OpenAIProvider() override = default;

    std::string name() const override { return "openai"; }
    std::vector<std::string> supported_models() const override;

    Result<ChatCompletionResponse> chat_completion(const ChatCompletionRequest& req) override;
    Result<void> chat_completion_stream(const ChatCompletionRequest& req,
                                         std::function<void(const StreamChunk&)> on_chunk) override;
    Result<json> embeddings(const std::vector<std::string>& texts, const std::string& model) override;
    Result<json> list_models() override;
    Result<json> get_model(const std::string& model) override;

    void set_config(const json& config) override;
    json get_config() const override;
    bool validate_config() const override;

private:
    HttpClient http_;
    std::string api_key_;
    std::string base_url_ = "https://api.openai.com/v1";
    std::string organization_;
};

// Anthropic Provider
class AnthropicProvider : public IProvider {
public:
    AnthropicProvider();
    ~AnthropicProvider() override = default;

    std::string name() const override { return "anthropic"; }
    std::vector<std::string> supported_models() const override;

    Result<ChatCompletionResponse> chat_completion(const ChatCompletionRequest& req) override;
    Result<void> chat_completion_stream(const ChatCompletionRequest& req,
                                         std::function<void(const StreamChunk&)> on_chunk) override;
    Result<json> embeddings(const std::vector<std::string>& texts, const std::string& model) override;
    Result<json> list_models() override;
    Result<json> get_model(const std::string& model) override;

    void set_config(const json& config) override;
    json get_config() const override;
    bool validate_config() const override;

private:
    HttpClient http_;
    std::string api_key_;
    std::string base_url_ = "https://api.anthropic.com/v1";
    std::string version_ = "2023-06-01";
};

// NVIDIA Provider (NIM)
class NvidiaProvider : public IProvider {
public:
    NvidiaProvider();
    ~NvidiaProvider() override = default;

    std::string name() const override { return "nvidia"; }
    std::vector<std::string> supported_models() const override;

    Result<ChatCompletionResponse> chat_completion(const ChatCompletionRequest& req) override;
    Result<void> chat_completion_stream(const ChatCompletionRequest& req,
                                         std::function<void(const StreamChunk&)> on_chunk) override;
    Result<json> embeddings(const std::vector<std::string>& texts, const std::string& model) override;
    Result<json> list_models() override;
    Result<json> get_model(const std::string& model) override;

    void set_config(const json& config) override;
    json get_config() const override;
    bool validate_config() const override;

private:
    HttpClient http_;
    std::string api_key_;
    std::string base_url_ = "https://integrate.api.nvidia.com/v1";
};

// Custom/OpenAI-compatible Provider
class CustomProvider : public IProvider {
public:
    CustomProvider();
    ~CustomProvider() override = default;

    std::string name() const override { return "custom"; }
    std::vector<std::string> supported_models() const override { return models_; }

    Result<ChatCompletionResponse> chat_completion(const ChatCompletionRequest& req) override;
    Result<void> chat_completion_stream(const ChatCompletionRequest& req,
                                         std::function<void(const StreamChunk&)> on_chunk) override;
    Result<json> embeddings(const std::vector<std::string>& texts, const std::string& model) override;
    Result<json> list_models() override;
    Result<json> get_model(const std::string& model) override;

    void set_config(const json& config) override;
    json get_config() const override;
    bool validate_config() const override;

    // Allow runtime model list update
    void set_models(const std::vector<std::string>& models) { models_ = models; }

private:
    HttpClient http_;
    std::string api_key_;
    std::string base_url_;
    std::vector<std::string> models_;
    std::map<std::string, std::string> extra_headers_;
};

} // namespace arcanum