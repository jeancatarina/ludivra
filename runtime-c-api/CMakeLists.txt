add_library(ludivra_runtime STATIC
  src/runtime_c_api.cpp
)

target_include_directories(ludivra_runtime
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(ludivra_runtime PRIVATE ludivra_kernel)
ludivra_enable_strict_warnings(ludivra_runtime)

add_library(ludivra::runtime ALIAS ludivra_runtime)

