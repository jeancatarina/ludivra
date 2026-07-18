#include "state_archive.hpp"

#include <algorithm>
#include <array>
#include <stdexcept>
#include <utility>

namespace ludivra::kernel {
namespace {

constexpr std::array<std::uint8_t, 4> save_magic{'L', 'D', 'S', 'V'};
constexpr std::array<std::uint8_t, 4> replay_magic{'L', 'D', 'R', 'P'};
constexpr std::uint32_t archive_version = 1;
constexpr std::uint64_t fnv_offset = 14695981039346656037ULL;
constexpr std::uint64_t fnv_prime = 1099511628211ULL;
constexpr std::uint32_t maximum_archive_entries = 1'000'000;
constexpr std::size_t maximum_archive_bytes = 64U * 1024U * 1024U;

void require_encodable_size(const std::size_t size) {
  if (size > maximum_archive_entries) {
    throw std::length_error("archive entry limit exceeded");
  }
}

class ArchiveWriter final {
 public:
  void bytes(const std::span<const std::uint8_t> value) {
    output_.insert(output_.end(), value.begin(), value.end());
  }

  void u32(const std::uint32_t value) {
    for (std::uint32_t shift = 0; shift < 32; shift += 8) {
      output_.push_back(static_cast<std::uint8_t>((value >> shift) & 0xFFU));
    }
  }

  void u64(const std::uint64_t value) {
    for (std::uint32_t shift = 0; shift < 64; shift += 8) {
      output_.push_back(static_cast<std::uint8_t>((value >> shift) & 0xFFU));
    }
  }

  [[nodiscard]] std::vector<std::uint8_t> finish() {
    if (output_.size() > maximum_archive_bytes - sizeof(std::uint64_t)) {
      throw std::length_error("archive byte limit exceeded");
    }
    std::uint64_t checksum = fnv_offset;
    for (const auto byte : output_) {
      checksum = (checksum ^ byte) * fnv_prime;
    }
    u64(checksum);
    return std::move(output_);
  }

 private:
  std::vector<std::uint8_t> output_;
};

class ArchiveReader final {
 public:
  explicit ArchiveReader(const std::span<const std::uint8_t> input) : input_(input) {}

  [[nodiscard]] bool verify_checksum() const {
    if (input_.size() < sizeof(std::uint64_t)) {
      return false;
    }
    std::uint64_t checksum = fnv_offset;
    const auto content_size = input_.size() - sizeof(std::uint64_t);
    for (std::size_t index = 0; index < content_size; ++index) {
      checksum = (checksum ^ input_[index]) * fnv_prime;
    }
    std::uint64_t received = 0;
    for (std::uint32_t shift = 0; shift < 64; shift += 8) {
      received |= static_cast<std::uint64_t>(input_[content_size + (shift / 8)]) << shift;
    }
    return checksum == received;
  }

  [[nodiscard]] bool magic(const std::array<std::uint8_t, 4>& expected) {
    if (position_ + expected.size() > content_size()) {
      return false;
    }
    const bool matches = std::equal(expected.begin(), expected.end(), input_.begin() + position_);
    position_ += expected.size();
    return matches;
  }

  [[nodiscard]] bool u32(std::uint32_t& value) {
    if (position_ + sizeof(value) > content_size()) {
      return false;
    }
    value = 0;
    for (std::uint32_t shift = 0; shift < 32; shift += 8) {
      value |= static_cast<std::uint32_t>(input_[position_++]) << shift;
    }
    return true;
  }

  [[nodiscard]] bool u64(std::uint64_t& value) {
    if (position_ + sizeof(value) > content_size()) {
      return false;
    }
    value = 0;
    for (std::uint32_t shift = 0; shift < 64; shift += 8) {
      value |= static_cast<std::uint64_t>(input_[position_++]) << shift;
    }
    return true;
  }

  [[nodiscard]] bool complete() const {
    return position_ == content_size();
  }

 private:
  [[nodiscard]] std::size_t content_size() const {
    return input_.size() < sizeof(std::uint64_t) ? 0 : input_.size() - sizeof(std::uint64_t);
  }

  std::span<const std::uint8_t> input_;
  std::size_t position_{0};
};

bool read_header(ArchiveReader& reader, const std::array<std::uint8_t, 4>& magic) {
  std::uint32_t version = 0;
  return reader.verify_checksum() && reader.magic(magic) && reader.u32(version) &&
      version == archive_version;
}

}  // namespace

std::vector<std::uint8_t> encode_save(const SavedState& state) {
  require_encodable_size(state.integers.size());
  ArchiveWriter writer;
  writer.bytes(save_magic);
  writer.u32(archive_version);
  writer.u64(state.tick);
  writer.u64(state.state_hash);
  std::vector<std::pair<std::uint32_t, std::int64_t>> ordered(state.integers.begin(), state.integers.end());
  std::sort(ordered.begin(), ordered.end());
  writer.u32(static_cast<std::uint32_t>(ordered.size()));
  for (const auto& [key, value] : ordered) {
    writer.u32(key);
    writer.u64(static_cast<std::uint64_t>(value));
  }
  return writer.finish();
}

bool decode_save(const std::span<const std::uint8_t> bytes, SavedState& state) {
  if (bytes.size() > maximum_archive_bytes) {
    return false;
  }
  ArchiveReader reader(bytes);
  std::uint32_t count = 0;
  SavedState decoded{};
  if (!read_header(reader, save_magic) || !reader.u64(decoded.tick) ||
      !reader.u64(decoded.state_hash) || !reader.u32(count) || count > maximum_archive_entries) {
    return false;
  }
  for (std::uint32_t index = 0; index < count; ++index) {
    std::uint32_t key = 0;
    std::uint64_t value = 0;
    if (!reader.u32(key) || !reader.u64(value) || decoded.integers.contains(key)) {
      return false;
    }
    decoded.integers.emplace(key, static_cast<std::int64_t>(value));
  }
  if (!reader.complete()) {
    return false;
  }
  state = std::move(decoded);
  return true;
}

std::vector<std::uint8_t> encode_replay(const ReplayState& replay) {
  require_encodable_size(replay.initial_state.integers.size());
  require_encodable_size(replay.frames.size());
  ArchiveWriter writer;
  writer.bytes(replay_magic);
  writer.u32(archive_version);
  writer.u32(replay.tick_rate_hz);
  writer.u32(replay.max_pending_inputs);
  writer.u64(replay.seed);
  writer.u64(replay.initial_state.tick);
  writer.u64(replay.initial_state.state_hash);
  std::vector<std::pair<std::uint32_t, std::int64_t>> ordered(
      replay.initial_state.integers.begin(), replay.initial_state.integers.end());
  std::sort(ordered.begin(), ordered.end());
  writer.u32(static_cast<std::uint32_t>(ordered.size()));
  for (const auto& [key, value] : ordered) {
    writer.u32(key);
    writer.u64(static_cast<std::uint64_t>(value));
  }
  writer.u64(replay.expected_tick);
  writer.u64(replay.expected_hash);
  writer.u32(static_cast<std::uint32_t>(replay.frames.size()));
  for (const auto& frame : replay.frames) {
    require_encodable_size(frame.inputs.size());
    writer.u32(static_cast<std::uint32_t>(frame.inputs.size()));
    for (const auto& input : frame.inputs) {
      writer.u32(input.action_id);
      writer.u32(static_cast<std::uint32_t>(input.value_milli));
      writer.u64(input.sequence);
    }
  }
  return writer.finish();
}

bool decode_replay(const std::span<const std::uint8_t> bytes, ReplayState& replay) {
  if (bytes.size() > maximum_archive_bytes) {
    return false;
  }
  ArchiveReader reader(bytes);
  std::uint32_t integer_count = 0;
  std::uint32_t frame_count = 0;
  ReplayState decoded{};
  if (!read_header(reader, replay_magic) || !reader.u32(decoded.tick_rate_hz) ||
      !reader.u32(decoded.max_pending_inputs) || !reader.u64(decoded.seed) ||
      decoded.tick_rate_hz == 0U || decoded.max_pending_inputs == 0U ||
      decoded.max_pending_inputs > maximum_archive_entries ||
      !reader.u64(decoded.initial_state.tick) || !reader.u64(decoded.initial_state.state_hash) ||
      !reader.u32(integer_count) || integer_count > maximum_archive_entries) {
    return false;
  }
  for (std::uint32_t index = 0; index < integer_count; ++index) {
    std::uint32_t key = 0;
    std::uint64_t value = 0;
    if (!reader.u32(key) || !reader.u64(value) || decoded.initial_state.integers.contains(key)) {
      return false;
    }
    decoded.initial_state.integers.emplace(key, static_cast<std::int64_t>(value));
  }
  if (!reader.u64(decoded.expected_tick) ||
      !reader.u64(decoded.expected_hash) || !reader.u32(frame_count) ||
      frame_count > maximum_archive_entries) {
    return false;
  }
  decoded.frames.reserve(frame_count);
  for (std::uint32_t frame_index = 0; frame_index < frame_count; ++frame_index) {
    std::uint32_t input_count = 0;
    if (!reader.u32(input_count) || input_count > maximum_archive_entries) {
      return false;
    }
    ReplayFrame frame;
    frame.inputs.reserve(input_count);
    for (std::uint32_t input_index = 0; input_index < input_count; ++input_index) {
      ArchiveInput input{};
      std::uint32_t value = 0;
      if (!reader.u32(input.action_id) || !reader.u32(value) || !reader.u64(input.sequence)) {
        return false;
      }
      input.value_milli = static_cast<std::int32_t>(value);
      frame.inputs.push_back(input);
    }
    decoded.frames.push_back(std::move(frame));
  }
  if (!reader.complete() || decoded.expected_tick < decoded.initial_state.tick ||
      decoded.expected_tick - decoded.initial_state.tick != decoded.frames.size()) {
    return false;
  }
  replay = std::move(decoded);
  return true;
}

}  // namespace ludivra::kernel
