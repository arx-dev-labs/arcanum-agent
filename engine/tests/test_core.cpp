#include <gtest/gtest.h>
#include <arcanum/engine.hpp>
#include <arcanum/http.hpp>
#include <arcanum/api.hpp>
#include <nlohmann/json.hpp>

using namespace arcanum;

TEST(ConfigTest, DefaultConfig) {
    EngineConfig config;
    EXPECT_FALSE(config.data_dir.empty());
    EXPECT_FALSE(config.plugins_dir.empty());
    EXPECT_EQ(config.log_level, "info");
}

TEST(ConfigTest, ProviderConfig) {
    EngineConfig config;
    config.provider_configs["openai"] = {{"api_key", "test-key"}, {"base_url", "https://api.openai.com/v1"}};

    auto provider_cfg = config.provider_configs["openai"];
    EXPECT_EQ(provider_cfg["api_key"], "test-key");
    EXPECT_EQ(provider_cfg["base_url"], "https://api.openai.com/v1");
}

TEST(MessageTest, Serialization) {
    Message msg(MessageType::REQUEST, {{"test", "value"}});
    msg.id = 42;
    msg.correlation_id = 1;

    std::string serialized = msg.serialize();
    auto result = Message::deserialize(serialized);

    ASSERT_TRUE(result);
    EXPECT_EQ(result->type, MessageType::REQUEST);
    EXPECT_EQ(result->id, 42);
    EXPECT_EQ(result->correlation_id, 1);
    EXPECT_EQ(result->payload["test"], "value");
}

TEST(MessageTest, SerializationError) {
    auto result = Message::deserialize("invalid json");
    EXPECT_FALSE(result);
}

TEST(HttpClientTest, RequestBuilder) {
    RequestBuilder builder;
    HttpRequest req = builder
        .method("POST")
        .url("https://api.example.com/v1/chat")
        .header("Authorization", "Bearer test")
        .json_body({{"model", "gpt-4o"}, {"messages", nlohmann::json::array()}})
        .timeout(30s)
        .build();

    EXPECT_EQ(req.method, "POST");
    EXPECT_EQ(req.url, "https://api.example.com/v1/chat");
    EXPECT_EQ(req.headers["Authorization"], "Bearer test");
    EXPECT_EQ(req.headers["Content-Type"], "application/json");
    EXPECT_EQ(req.timeout.count(), 30000);
}

TEST(ChatMessageTest, ToJson) {
    ChatMessage msg = ChatMessage::user("Hello, world!");
    json j = msg.to_json();

    EXPECT_EQ(j["role"], "user");
    EXPECT_EQ(j["content"], "Hello, world!");
}

TEST(ChatMessageTest, SystemMessage) {
    ChatMessage msg = ChatMessage::system("You are a helpful assistant.");
    json j = msg.to_json();

    EXPECT_EQ(j["role"], "system");
    EXPECT_EQ(j["content"], "You are a helpful assistant.");
}

TEST(ChatCompletionRequestTest, ToJson) {
    ChatCompletionRequest req;
    req.model = "gpt-4o";
    req.messages = {ChatMessage::user("Hello")};
    req.temperature = 0.7;
    req.max_tokens = 100;
    req.stream = true;

    json j = req.to_json();

    EXPECT_EQ(j["model"], "gpt-4o");
    EXPECT_EQ(j["temperature"], 0.7);
    EXPECT_EQ(j["max_tokens"], 100);
    EXPECT_EQ(j["stream"], true);
    EXPECT_EQ(j["messages"].size(), 1);
}

TEST(ToolTest, ToJson) {
    Tool tool;
    tool.name = "get_weather";
    tool.description = "Get weather for a location";
    tool.parameters = {
        {"type", "object"},
        {"properties", {
            {"location", {"type", "string", "description", "City name"}}
        }},
        {"required", nlohmann::json::array({"location"})}
    };

    json j = tool.to_json();
    EXPECT_EQ(j["type"], "function");
    EXPECT_EQ(j["function"]["name"], "get_weather");
    EXPECT_EQ(j["function"]["parameters"]["required"].size(), 1);
}

TEST(StreamChunkTest, Parsing) {
    // Simulate OpenAI stream chunk
    std::string chunk_data = R"({
        "id": "chatcmpl-123",
        "choices": [{
            "index": 0,
            "delta": {"content": "Hello"},
            "finish_reason": null
        }]
    })";

    json j = nlohmann::json::parse(chunk_data);
    EXPECT_EQ(j["id"], "chatcmpl-123");
    EXPECT_EQ(j["choices"][0]["delta"]["content"], "Hello");
}

TEST(ApiRegistryTest, ProviderRegistration) {
    ApiRegistry registry;
    registry.register_provider(std::make_unique<OpenAIProvider>());

    auto providers = registry.list_providers();
    EXPECT_EQ(providers.size(), 1);
    EXPECT_EQ(providers[0], "openai");

    IProvider* provider = registry.get_provider("openai");
    ASSERT_NE(provider, nullptr);
    EXPECT_EQ(provider->name(), "openai");
}

TEST(EngineTest, CreateEngine) {
    auto engine = create_engine();
    ASSERT_NE(engine, nullptr);
    EXPECT_FALSE(engine->is_running());
}

int main(int argc, char** argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}