add_executable(ludivra_runtime_tests
  runtime_test.cpp
)

target_link_libraries(ludivra_runtime_tests PRIVATE ludivra::runtime)
target_compile_definitions(ludivra_runtime_tests PRIVATE
  LUDIVRA_TEST_FIXTURE_DIR="${CMAKE_SOURCE_DIR}/tests/fixtures"
)
ludivra_enable_strict_warnings(ludivra_runtime_tests)

add_test(NAME ludivra.runtime.boundary COMMAND ludivra_runtime_tests)
