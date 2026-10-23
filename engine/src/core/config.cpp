#include "arcanum/config.hpp"
#include <filesystem>
#include <fstream>
#include <iostream>

namespace arcanum {

Config::Config(const EngineConfig& config) : config_(config) {
    ensure_directories();
    config_path_ = get_config_file();
    load();
}

void Config::ensure_directories() {
    std::filesystem::create_directories(config_.data_dir);
    std::filesystem::create_directories(config_.plugins_dir);
}

std::filesystem::path Config::get_config_file() const {
    return std::filesystem::path(config_.data_dir) / "config.json";
}

json Config::get_provider_config(const std::string& provider) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (config_.provider_configs.contains(provider)) {
        return config_.provider_configs[provider];
    }
    return json::object();
}

void Config::set_provider_config(const std::string& provider, const json& config) {
    std::lock_guard<std::mutex> lock(mutex_);
    config_.provider_configs[provider] = config;
    save();
}

json Config::get_plugin_config(const std::string& plugin) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (config_.plugin_configs.contains(plugin)) {
        return config_.plugin_configs[plugin];
    }
    return json::object();
}

void Config::set_plugin_config(const std::string& plugin, const json& config) {
    std::lock_guard<std::mutex> lock(mutex_);
    config_.plugin_configs[plugin] = config;
    save();
}

Result<void> Config::save() {
    std::lock_guard<std::mutex> lock(mutex_);
    try {
        std::ofstream file(config_path_);
        if (!file) {
            return Result<void>::err("Failed to open config file for writing: " + config_path_.string());
        }
        json j;
        j["data_dir"] = config_.data_dir;
        j["plugins_dir"] = config_.plugins_dir;
        j["log_level"] = config_.log_level;
        j["enable_telemetry"] = config_.enable_telemetry;
        j["provider_configs"] = config_.provider_configs;
        j["plugin_configs"] = config_.plugin_configs;
        file << j.dump(2);
        return Result<void>::ok();
    } catch (const std::exception& e) {
        return Result<void>::err("Failed to save config: " + std::string(e.what()));
    }
}

Result<void> Config::load() {
    std::lock_guard<std::mutex> lock(mutex_);
    try {
        if (!std::filesystem::exists(config_path_)) {
            return Result<void>::ok(); // No config file yet, use defaults
        }
        std::ifstream file(config_path_);
        if (!file) {
            return Result<void>::err("Failed to open config file for reading: " + config_path_.string());
        }
        json j = json::parse(file);
        if (j.contains("data_dir")) config_.data_dir = j["data_dir"];
        if (j.contains("plugins_dir")) config_.plugins_dir = j["plugins_dir"];
        if (j.contains("log_level")) config_.log_level = j["log_level"];
        if (j.contains("enable_telemetry")) config_.enable_telemetry = j["enable_telemetry"];
        if (j.contains("provider_configs")) config_.provider_configs = j["provider_configs"];
        if (j.contains("plugin_configs")) config_.plugin_configs = j["plugin_configs"];
        return Result<void>::ok();
    } catch (const std::exception& e) {
        return Result<void>::err("Failed to load config: " + std::string(e.what()));
    }
}

} // namespace arcanum