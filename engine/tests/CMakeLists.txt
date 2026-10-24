# Engine test suite
FetchContent_Declare(
    googletest
    URL https://github.com/google/googletest/archive/refs/tags/v1.14.0.zip
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

add_executable(arcanum_tests test_core.cpp)
target_link_libraries(arcanum_tests PRIVATE arcanum_engine GTest::gtest_main)
include(GoogleTest)
gtest_discover_tests(arcanum_tests)

if(MSVC)
    target_compile_options(arcanum_tests PRIVATE /W4 /permissive- /EHsc)
else()
    target_compile_options(arcanum_tests PRIVATE -Wall -Wextra -Wpedantic)
endif()
