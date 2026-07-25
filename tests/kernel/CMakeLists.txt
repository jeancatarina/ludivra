add_executable(ludivra_kernel_tests
  kernel_test.cpp
)

target_link_libraries(ludivra_kernel_tests PRIVATE ludivra_kernel)
target_compile_definitions(ludivra_kernel_tests PRIVATE
  LUDIVRA_TEST_FIXTURE_DIR="${CMAKE_SOURCE_DIR}/tests/fixtures"
)
ludivra_enable_strict_warnings(ludivra_kernel_tests)

add_test(NAME ludivra.kernel.determinism COMMAND ludivra_kernel_tests)
