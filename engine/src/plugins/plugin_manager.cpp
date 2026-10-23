#include "arcanum/plugin.hpp"
#include <filesystem>
#include <iostream>

namespace arcanum {

PluginManager::PluginManager(MessageBus& bus, const Config& config)
    : bus_(bus), config_(config) {
    plugins_dir_ = std::filesystem::path(config_.plugins_dir());
}

PluginManager::~PluginManager() {
    // Unload all plugins
    auto plugins = loader_.list_plugins();
    for (const auto& meta : plugins) {
        loader_.unload_plugin(meta.name);
    }
}

Result<void> PluginManager::load_plugins(const std::filesystem::path& dir) {
    if (!std::filesystem::exists(dir)) {
        return Result<void>::err("Plugins directory not found: " + dir.string());
    }

    for (const auto& entry : std::filesystem::directory_iterator(dir)) {
        if (entry.is_regular_file()) {
            std::string ext = entry.path().extension().string();
            if (ext == ".so" || ext == ".dll" || ext == ".dylib") {
                auto result = load_plugin(entry.path());
                if (!result) {
                    std::cerr << "Failed to load plugin " << entry.path() << ": " << result.error << std::endl;
                }
            }
        }
    }
    return Result<void>::ok();
}

Result<void> PluginManager::load_plugin(const std::filesystem::path& path) {
    auto result = loader_.load_plugin(path);
    if (!result) return result;

    // Get the plugin we just loaded
    auto plugins = loader_.list_plugins();
    if (!plugins.empty()) {
        const auto& meta = plugins.back();
        IPlugin* plugin = loader_.get_plugin(meta.name);
        if (plugin) {
            json plugin_config = config_.get_plugin_config(meta.name);
            auto init_result = plugin->initialize(plugin_config);
            if (!init_result) {
                loader_.unload_plugin(meta.name);
                return Result<void>::err("Plugin initialization failed: " + init_result.error);
            }
        }
    }
    return Result<void>::ok();
}

Result<void> PluginManager::unload_plugin(const std::string& name) {
    IPlugin* plugin = get_plugin(name);
    if (plugin) {
        plugin->shutdown();
    }
    return loader_.unload_plugin(name);
}

Result<json> PluginManager::execute(const std::string& plugin, const std::string& command, const json& args) {
    IPlugin* p = get_plugin(plugin);
    if (!p) {
        return Result<json>::err("Plugin not found: " + plugin);
    }
    return Result<json>::ok(p->handle_command(command, args));
}

std::vector<PluginMetadata> PluginManager::list_plugins() const {
    return loader_.list_plugins();
}

IPlugin* PluginManager::get_plugin(const std::string& name) {
    // This would need access to loader's internal map
    // For now, return nullptr - would need friend or getter
    return nullptr;
}

} // namespace arcanum