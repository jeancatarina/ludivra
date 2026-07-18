add_library(ludivra_kernel STATIC
  src/runtime.cpp
)

target_include_directories(ludivra_kernel
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

ludivra_enable_strict_warnings(ludivra_kernel)

