#pragma once

#include "engine.hpp"
#include <string>
#include <memory>
#include <vector>
#include <filesystem>

namespace arcanum {

// Plugin metadata
struct PluginMetadata {
    std::string name;
    std::string version;
    std::string description;
    std::string author;
    std::vector<std::string> dependencies;
    json config_schema;
    json capabilities;  // What this plugin can do
};

// Plugin interface - all plugins must implement this
class IPlugin {
public:
    virtual ~IPlugin() = default;

    // Lifecycle
    virtual Result<void> initialize(const json& config) = 0;
    virtual Result<void> shutdown() = 0;

    // Metadata
    virtual PluginMetadata metadata() const = 0;

    // Commands this plugin handles
    virtual json handle_command(const std::string& command, const json& args) = 0;

    // Event hooks
    virtual void on_event(const std::string& event, const json& data) {}
    virtual void on_message(const Message& msg) {}
};

// Plugin loader - handles dynamic loading of .so/.dll plugins
class PluginLoader {
public:
    PluginLoader() = default;
    ~PluginLoader();

    // Load plugin from shared library
    Result<std::unique_ptr<IPlugin>> load_plugin(const std::filesystem::path& path);

    // Get loaded plugin metadata
    std::vector<PluginMetadata> list_plugins() const;

    // Unload plugin
    Result<void> unload_plugin(const std::string& name);

private:
    struct LoadedPlugin {
        std::unique_ptr<IPlugin> plugin;
        void* handle = nullptr;  // dlopen handle
        std::filesystem::path path;
    };

    std::unordered_map<std::string, LoadedPlugin> plugins_;
    std::mutex mutex_;
};

// Plugin manager - high-level plugin management
class PluginManager {
public:
    explicit PluginManager(MessageBus& bus, const Config& config);
    ~PluginManager();

    // Load all plugins from directory
    Result<void> load_plugins(const std::filesystem::path& dir);

    // Load specific plugin
    Result<void> load_plugin(const std::filesystem::path& path);

    // Unload plugin
    Result<void> unload_plugin(const std::string& name);

    // Execute plugin command
    Result<json> execute(const std::string& plugin, const std::string& command, const json& args);

    // List available plugins
    std::vector<PluginMetadata> list_plugins() const;

    // Get plugin by name
    IPlugin* get_plugin(const std::string& name);

private:
    MessageBus& bus_;
    const Config& config_;
    PluginLoader loader_;
    std::filesystem::path plugins_dir_;
    std::mutex mutex_;
};

// C-style plugin entry points (for dynamic loading)
extern "C" {
    using PluginCreateFn = IPlugin* (*)();
    using PluginDestroyFn = void (*)(IPlugin*);
    using PluginMetadataFn = const PluginMetadata* (*)();
}

} // namespace arcanum