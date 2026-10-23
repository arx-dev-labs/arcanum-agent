#include "arcanum/plugin.hpp"
#include <dlfcn.h>
#include <filesystem>
#include <iostream>

namespace arcanum {

PluginLoader::~PluginLoader() {
    for (auto& [name, plugin] : plugins_) {
        unload_plugin(name);
    }
}

Result<std::unique_ptr<IPlugin>> PluginLoader::load_plugin(const std::filesystem::path& path) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (!std::filesystem::exists(path)) {
        return Result<std::unique_ptr<IPlugin>>::err("Plugin file not found: " + path.string());
    }

    // Load shared library
    void* handle = dlopen(path.c_str(), RTLD_LAZY | RTLD_LOCAL);
    if (!handle) {
        return Result<std::unique_ptr<IPlugin>>::err("Failed to load plugin: " + std::string(dlerror()));
    }

    // Get plugin entry points
    auto create_fn = reinterpret_cast<PluginCreateFn>(dlsym(handle, "arcanum_plugin_create"));
    auto destroy_fn = reinterpret_cast<PluginDestroyFn>(dlsym(handle, "arcanum_plugin_destroy"));
    auto metadata_fn = reinterpret_cast<PluginMetadataFn>(dlsym(handle, "arcanum_plugin_metadata"));

    if (!create_fn || !destroy_fn || !metadata_fn) {
        dlclose(handle);
        return Result<std::unique_ptr<IPlugin>>::err("Plugin missing required entry points");
    }

    const PluginMetadata* meta = metadata_fn();
    if (!meta) {
        dlclose(handle);
        return Result<std::unique_ptr<IPlugin>>::err("Plugin metadata function returned null");
    }

    std::string name = meta->name;
    if (plugins_.contains(name)) {
        dlclose(handle);
        return Result<std::unique_ptr<IPlugin>>::err("Plugin already loaded: " + name);
    }

    // Create plugin instance
    IPlugin* plugin = create_fn();
    if (!plugin) {
        dlclose(handle);
        return Result<std::unique_ptr<IPlugin>>::err("Plugin creation failed");
    }

    LoadedPlugin loaded;
    loaded.plugin = std::unique_ptr<IPlugin>(plugin);
    loaded.handle = handle;
    loaded.path = path;

    plugins_[name] = std::move(loaded);
    return Result<std::unique_ptr<IPlugin>>::ok(nullptr); // Ownership transferred to manager
}

std::vector<PluginMetadata> PluginLoader::list_plugins() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::vector<PluginMetadata> result;
    for (const auto& [name, loaded] : plugins_) {
        result.push_back(loaded.plugin->metadata());
    }
    return result;
}

Result<void> PluginLoader::unload_plugin(const std::string& name) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = plugins_.find(name);
    if (it == plugins_.end()) {
        return Result<void>::err("Plugin not found: " + name);
    }

    LoadedPlugin& loaded = it->second;
    if (loaded.plugin) {
        loaded.plugin->shutdown();
    }

    // Find destroy function
    auto destroy_fn = reinterpret_cast<PluginDestroyFn>(dlsym(loaded.handle, "arcanum_plugin_destroy"));
    if (destroy_fn && loaded.plugin.get()) {
        destroy_fn(loaded.plugin.release());
    }

    dlclose(loaded.handle);
    plugins_.erase(it);
    return Result<void>::ok();
}

} // namespace arcanum