add_library(ludivra_kernel STATIC
  src/command_buffer.cpp
  src/content_pack.cpp
  src/fixed_point.cpp
  src/logical_timers.cpp
  src/lua_sandbox.cpp
  src/random_streams.cpp
  src/runtime.cpp
  src/state_archive.cpp
  src/world_chunks.cpp
  src/world_generator.cpp
  src/world_jobs.cpp
  src/world_position.cpp
  src/world_streaming.cpp
)

target_include_directories(ludivra_kernel
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_link_libraries(ludivra_kernel PRIVATE ludivra_lua)

ludivra_enable_strict_warnings(ludivra_kernel)
