add_executable(ludivra_native_headless
  src/main.cpp
)

target_link_libraries(ludivra_native_headless PRIVATE ludivra::runtime)
ludivra_enable_strict_warnings(ludivra_native_headless)

