#pragma once

#include <cstdint>
#include <vector>

namespace ludivra::kernel {

struct AddIntegerCommand final {
  std::uint32_t key;
  std::int64_t delta;
};

class CommandBuffer final {
 public:
  void add_integer(std::uint32_t key, std::int64_t delta);
  void clear() noexcept;
  [[nodiscard]] const std::vector<AddIntegerCommand>& additions() const noexcept;

 private:
  std::vector<AddIntegerCommand> additions_;
};

}  // namespace ludivra::kernel
