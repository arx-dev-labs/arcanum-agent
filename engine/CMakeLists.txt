cmake_minimum_required(VERSION 3.20)
project(arcanum_engine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build types
set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type")
set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS "Debug" "Release" "RelWithDebInfo" "MinSizeRel")

# Compiler warnings
if(MSVC)
    add_compile_options(/W4 /WX /permissive- /EHsc)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -Werror -Wconversion -Wshadow)
endif()

# Dependencies - using FetchContent
include(FetchContent)

# nlohmann/json for JSON parsing
FetchContent_Declare(
    nlohmann_json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.2
)
FetchContent_MakeAvailable(nlohmann_json)

# cpp-httplib for HTTP client
FetchContent_Declare(
    cpp_httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.15.3
)
FetchContent_MakeAvailable(cpp_httplib)

# websocketpp for WebSocket support
FetchContent_Declare(
    websocketpp
    GIT_REPOSITORY https://github.com/zaphoyd/websocketpp.git
    GIT_TAG 0.8.2
)
FetchContent_MakeAvailable(websocketpp)

# OpenSSL for HTTPS/TLS
find_package(OpenSSL REQUIRED)

# Threads
find_package(Threads REQUIRED)

# Main engine library
add_library(arcanum_engine STATIC
    src/core/engine.cpp
    src/core/message_bus.cpp
    src/core/plugin_manager.cpp
    src/core/config.cpp
    src/http/http_client.cpp
    src/http/request_builder.cpp
    src/http/auth_manager.cpp
    src/ws/websocket_client.cpp
    src/ws/sse_client.cpp
    src/api/api_registry.cpp
    src/api/providers/openai_provider.cpp
    src/api/providers/anthropic_provider.cpp
    src/api/providers/nvidia_provider.cpp
    src/api/providers/custom_provider.cpp
    src/plugins/plugin_loader.cpp
    src/plugins/plugin_interface.cpp
)

target_include_directories(arcanum_engine PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

target_link_libraries(arcanum_engine PUBLIC
    nlohmann_json::nlohmann_json
    httplib
    websocketpp
    OpenSSL::SSL
    OpenSSL::Crypto
    Threads::Threads
)

# CLI executable
add_executable(arx-engine
    src/main.cpp
)

target_link_libraries(arx-engine PRIVATE arcanum_engine)

# Install targets
install(TARGETS arcanum_engine
    ARCHIVE DESTINATION lib
    LIBRARY DESTINATION lib
    RUNTIME DESTINATION bin
)

install(TARGETS arx-engine
    RUNTIME DESTINATION bin
)

install(DIRECTORY include/ DESTINATION include)

# Testing
enable_testing()
add_subdirectory(tests)