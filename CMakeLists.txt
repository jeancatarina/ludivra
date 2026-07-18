cmake_minimum_required(VERSION 3.25)

project(ludivra VERSION 0.4.0 LANGUAGES C CXX)

option(LUDIVRA_BUILD_TESTS "Build Ludivra tests" ON)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(cmake/Lua.cmake)

function(ludivra_enable_strict_warnings target)
  if(MSVC)
    target_compile_options(${target} PRIVATE /W4 /WX)
  else()
    target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic -Werror)
  endif()
endfunction()

add_subdirectory(kernel)
add_subdirectory(runtime-c-api)
if(EMSCRIPTEN)
  add_subdirectory(runtime-wasm)
endif()
add_subdirectory(hosts/native-headless)

if(LUDIVRA_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests/runtime)
endif()
