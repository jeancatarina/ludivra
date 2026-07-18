add_library(ludivra_kernel STATIC
  src/command_buffer.cpp
  src/lua_sandbox.cpp
  src/runtime.cpp
  src/state_archive.cpp
)

target_include_directories(ludivra_kernel
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_link_libraries(ludivra_kernel PRIVATE ludivra_lua)

ludivra_enable_strict_warnings(ludivra_kernel)
