#pragma once

#include "engine.hpp"
#include <filesystem>
#include <fstream>
#include <mutex>

namespace arcanum {

class Config {
public:
    explicit Config(const EngineConfig& config);
    ~Config() = default;

    // Getters
    const std::string& data_dir() const { return config_.data_dir; }
    const std::string& plugins_dir() const { return config_.plugins_dir; }
    const std::string& log_level() const { return config_.log_level; }
    bool telemetry_enabled() const { return config_.enable_telemetry; }
    const json& provider_configs() const { return config_.provider_configs; }
    const json& plugin_configs() const { return config_.plugin_configs; }

    // Provider config access
    json get_provider_config(const std::string& provider) const;
    void set_provider_config(const std::string& provider, const json& config);

    // Plugin config access
    json get_plugin_config(const std::string& plugin) const;
    void set_plugin_config(const std::string& plugin, const json& config);

    // Persistence
    Result<void> save();
    Result<void> load();

private:
    EngineConfig config_;
    std::filesystem::path config_path_;
    mutable std::mutex mutex_;

    std::filesystem::path get_config_file() const;
    void ensure_directories();
};

} // namespace arcanum