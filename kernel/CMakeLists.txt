add_library(ludivra_kernel STATIC
  src/command_buffer.cpp
  src/content_pack.cpp
  src/fixed_point.cpp
  src/logical_timers.cpp
  src/motion_reference.cpp
  src/navigation_reference.cpp
  src/physics_reference.cpp
  src/upstream_physics.cpp
  src/lua_sandbox.cpp
  src/mass_reference.cpp
  src/random_streams.cpp
  src/regional_world.cpp
  src/region_storage.cpp
  src/runtime.cpp
  src/state_archive.cpp
  src/statechart_runtime.cpp
  src/world_chunks.cpp
  src/world_generator.cpp
  src/world_jobs.cpp
  src/world_position.cpp
  src/world_runtime.cpp
  src/world_streaming.cpp
)

target_include_directories(ludivra_kernel
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_link_libraries(ludivra_kernel PRIVATE ludivra_lua)

target_compile_definitions(ludivra_kernel PRIVATE
  LUDIVRA_HAS_JOLT_PHYSICS=$<BOOL:${LUDIVRA_JOLT_PHYSICS_AVAILABLE}>
  LUDIVRA_HAS_BOX2D_PHYSICS=$<BOOL:${LUDIVRA_BOX2D_PHYSICS_AVAILABLE}>
  LUDIVRA_UPSTREAM_PHYSICS_TARGET_DISABLED=$<BOOL:${LUDIVRA_UPSTREAM_PHYSICS_TARGET_DISABLED}>
)

if(LUDIVRA_JOLT_PHYSICS_AVAILABLE)
  target_link_libraries(ludivra_kernel PRIVATE Jolt)
endif()
if(LUDIVRA_BOX2D_PHYSICS_AVAILABLE)
  target_link_libraries(ludivra_kernel PRIVATE box2d)
endif()

ludivra_enable_strict_warnings(ludivra_kernel)
