cmake_minimum_required(VERSION 3.20)
project(arcanum_engine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build types
set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type")
set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS "Debug" "Release" "RelWithDebInfo" "MinSizeRel")

# Dependencies - using FetchContent.
# NOTE: warnings stay TARGET-SCOPED on purpose; FetchContent targets must not
# inherit -Werror or third-party warnings would break the build.
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

# standalone Asio (transport dependency of websocketpp)
FetchContent_Declare(
    asio
    URL https://github.com/chriskohlhoff/asio/archive/refs/tags/asio-1-28-2.tar.gz
)
FetchContent_MakeAvailable(asio)

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

if(MSVC)
    set(ARCANUM_WARNING_FLAGS /W4 /permissive- /EHsc)
else()
    set(ARCANUM_WARNING_FLAGS -Wall -Wextra -Wpedantic)
endif()

# Main engine library (only sources that actually exist in the repository)
add_library(arcanum_engine STATIC
    src/core/engine.cpp
    src/core/message_bus.cpp
    src/core/config.cpp
    src/core/plugin_manager.cpp
    src/http/http_client.cpp
    src/ws/websocket_client.cpp
    src/api/api_registry.cpp
    src/api/api_common.cpp
    src/api/providers/openai_provider.cpp
    src/api/providers/anthropic_provider.cpp
    src/api/providers/nvidia_provider.cpp
    src/api/providers/custom_provider.cpp
    src/plugins/plugin_loader.cpp
    src/plugins/plugin_manager.cpp
)

target_include_directories(arcanum_engine PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

target_include_directories(arcanum_engine SYSTEM PUBLIC
    ${asio_SOURCE_DIR}/include
)

target_compile_definitions(arcanum_engine PUBLIC
    ASIO_STANDALONE
    ASIO_HEADER_ONLY
    WEBSOCKETPP_STANDALONE_ASIO
)

target_link_libraries(arcanum_engine PUBLIC
    nlohmann_json::nlohmann_json
    httplib
    websocketpp
    OpenSSL::SSL
    OpenSSL::Crypto
    Threads::Threads
)

target_compile_options(arcanum_engine PRIVATE ${ARCANUM_WARNING_FLAGS})

# CLI executable
add_executable(arx-engine
    src/main.cpp
)

target_link_libraries(arx-engine PRIVATE arcanum_engine)
target_compile_options(arx-engine PRIVATE ${ARCANUM_WARNING_FLAGS})

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
