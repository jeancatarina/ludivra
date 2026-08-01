#pragma once

#include "runtime.hpp"

struct ludivra_runtime final {
  explicit ludivra_runtime(const ludivra::kernel::RuntimeConfig config) : value(config) {}

  ludivra::kernel::Runtime value;
};
