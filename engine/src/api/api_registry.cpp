#include "arcanum/api.hpp"

namespace arcanum {

void ApiRegistry::register_provider(std::unique_ptr<IProvider> provider) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::string name = provider->name();
    providers_[name] = std::move(provider);
    if (default_provider_.empty()) {
        default_provider_ = name;
    }
}

IProvider* ApiRegistry::get_provider(const std::string& name) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = providers_.find(name);
    return it != providers_.end() ? it->second.get() : nullptr;
}

const IProvider* ApiRegistry::get_provider(const std::string& name) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = providers_.find(name);
    return it != providers_.end() ? it->second.get() : nullptr;
}

std::vector<std::string> ApiRegistry::list_providers() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<std::string> result;
    for (const auto& [name, _] : providers_) {
        result.push_back(name);
    }
    return result;
}

std::vector<std::string> ApiRegistry::list_models(const std::string& provider) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = providers_.find(provider);
    if (it != providers_.end()) {
        return it->second->supported_models();
    }
    return {};
}

Result<ChatCompletionResponse> ApiRegistry::chat_completion(const ChatCompletionRequest& req) {
    std::string provider_name = req.extra.value("provider", default_provider_);
    IProvider* provider = get_provider(provider_name);
    if (!provider) {
        return Result<ChatCompletionResponse>::err("Provider not found: " + provider_name);
    }
    return provider->chat_completion(req);
}

Result<void> ApiRegistry::chat_completion_stream(const ChatCompletionRequest& req,
                                                  std::function<void(const StreamChunk&)> on_chunk) {
    std::string provider_name = req.extra.value("provider", default_provider_);
    IProvider* provider = get_provider(provider_name);
    if (!provider) {
        return Result<void>::err("Provider not found: " + provider_name);
    }
    return provider->chat_completion_stream(req, on_chunk);
}

} // namespace arcanum