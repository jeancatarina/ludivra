#include "command_buffer.hpp"

namespace ludivra::kernel {

void CommandBuffer::add_integer(const std::uint32_t key, const std::int64_t delta) {
  additions_.push_back({key, delta});
}

void CommandBuffer::clear() noexcept {
  additions_.clear();
}

const std::vector<AddIntegerCommand>& CommandBuffer::additions() const noexcept {
  return additions_;
}

}  // namespace ludivra::kernel
