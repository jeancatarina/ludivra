include_guard(GLOBAL)

include(FetchContent)

set(LUDIVRA_UPSTREAM_PHYSICS_DEFAULT ON)
if(EMSCRIPTEN)
  # The browser runtime continues to use ReferencePhysics until the separately
  # measured WASM configurations of both solvers are promoted.
  set(LUDIVRA_UPSTREAM_PHYSICS_DEFAULT OFF)
endif()

option(LUDIVRA_ENABLE_UPSTREAM_PHYSICS
  "Build the pinned Jolt and Box2D edge adapters for this target"
  ${LUDIVRA_UPSTREAM_PHYSICS_DEFAULT}
)
option(LUDIVRA_ENABLE_JOLT_PHYSICS "Build the pinned Jolt 3D adapter" ${LUDIVRA_ENABLE_UPSTREAM_PHYSICS})
option(LUDIVRA_ENABLE_BOX2D_PHYSICS "Build the pinned Box2D 2D adapter" ${LUDIVRA_ENABLE_UPSTREAM_PHYSICS})

set(LUDIVRA_JOLT_PHYSICS_AVAILABLE OFF)
set(LUDIVRA_BOX2D_PHYSICS_AVAILABLE OFF)
set(LUDIVRA_UPSTREAM_PHYSICS_TARGET_DISABLED OFF)
if(EMSCRIPTEN AND NOT LUDIVRA_ENABLE_UPSTREAM_PHYSICS)
  set(LUDIVRA_UPSTREAM_PHYSICS_TARGET_DISABLED ON)
endif()

if(LUDIVRA_ENABLE_UPSTREAM_PHYSICS AND LUDIVRA_ENABLE_JOLT_PHYSICS)
  # Keep vendor compiler policy contained: Ludivra owns warnings on its targets.
  set(ENABLE_ALL_WARNINGS OFF CACHE BOOL "Jolt upstream warning policy" FORCE)
  set(OVERRIDE_CXX_FLAGS OFF CACHE BOOL "Jolt upstream compiler flags" FORCE)
  set(GENERATE_DEBUG_SYMBOLS OFF CACHE BOOL "Jolt upstream debug symbols" FORCE)
  set(INTERPROCEDURAL_OPTIMIZATION OFF CACHE BOOL "Jolt upstream IPO" FORCE)
  set(CROSS_PLATFORM_DETERMINISTIC ON CACHE BOOL "Jolt deterministic math" FORCE)
  set(USE_SSE4_1 OFF CACHE BOOL "Jolt optional SSE 4.1" FORCE)
  set(USE_SSE4_2 OFF CACHE BOOL "Jolt optional SSE 4.2" FORCE)
  set(USE_AVX OFF CACHE BOOL "Jolt optional AVX" FORCE)
  set(USE_AVX2 OFF CACHE BOOL "Jolt optional AVX2" FORCE)
  set(USE_LZCNT OFF CACHE BOOL "Jolt optional LZCNT" FORCE)
  set(USE_TZCNT OFF CACHE BOOL "Jolt optional TZCNT" FORCE)
  set(USE_F16C OFF CACHE BOOL "Jolt optional F16C" FORCE)
  set(USE_FMADD OFF CACHE BOOL "Jolt optional FMADD" FORCE)

  FetchContent_Declare(ludivra_jolt_physics
    GIT_REPOSITORY https://github.com/jrouwe/JoltPhysics.git
    GIT_TAG 0373ec0dd762e4bc2f6acdb08371ee84fa23c6db
    GIT_SHALLOW TRUE
    GIT_PROGRESS FALSE
    SOURCE_SUBDIR Build
  )
  FetchContent_MakeAvailable(ludivra_jolt_physics)
  set(LUDIVRA_JOLT_PHYSICS_AVAILABLE ON)
endif()

if(LUDIVRA_ENABLE_UPSTREAM_PHYSICS AND LUDIVRA_ENABLE_BOX2D_PHYSICS)
  set(BOX2D_DISABLE_SIMD ON CACHE BOOL "Box2D portable deterministic baseline" FORCE)
  set(BOX2D_COMPILE_WARNING_AS_ERROR OFF CACHE BOOL "Box2D upstream warning policy" FORCE)

  FetchContent_Declare(ludivra_box2d
    GIT_REPOSITORY https://github.com/erincatto/box2d.git
    GIT_TAG 8c661469c9507d3ad6fbd2fea3f1aa71669c2fe3
    GIT_SHALLOW TRUE
    GIT_PROGRESS FALSE
  )
  FetchContent_MakeAvailable(ludivra_box2d)
  set(LUDIVRA_BOX2D_PHYSICS_AVAILABLE ON)
endif()
