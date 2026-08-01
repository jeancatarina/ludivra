#include "state_archive.hpp"

#include <algorithm>
#include <string>
#include <array>
#include <stdexcept>
#include <utility>

namespace ludivra::kernel {
namespace {

constexpr std::array<std::uint8_t, 4> save_magic{'L', 'D', 'S', 'V'};
constexpr std::array<std::uint8_t, 4> replay_magic{'L', 'D', 'R', 'P'};
constexpr std::uint32_t archive_version = 5;
/// Version 4 saved the active state and history but not elapsed statechart time.
constexpr std::uint32_t archive_version_without_statechart_ticks = 4;
constexpr std::uint32_t archive_version_without_statechart = 3;
/// Version 2 predates logical timers and migrates to an empty timer set.
constexpr std::uint32_t archive_version_without_timers = 2;
/// Version 1 predates PRNG streams. It is still readable and migrates to an empty
/// stream set, which is exactly what a save written before streams existed means.
constexpr std::uint32_t archive_version_without_streams = 1;
constexpr std::uint32_t maximum_stream_entries = 4096;
constexpr std::uint32_t maximum_domain_bytes = 128;
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

  void text(const std::string& value) {
    u32(static_cast<std::uint32_t>(value.size()));
    for (const char character : value) output_.push_back(static_cast<std::uint8_t>(character));
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

  [[nodiscard]] bool text(std::string& value, const std::uint32_t maximum_bytes) {
    std::uint32_t length = 0;
    if (!u32(length) || length > maximum_bytes || position_ + length > content_size()) {
      return false;
    }
    value.assign(reinterpret_cast<const char*>(input_.data() + position_), length);
    position_ += length;
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

bool read_header(ArchiveReader& reader, const std::array<std::uint8_t, 4>& magic, std::uint32_t& version) {
  return reader.verify_checksum() && reader.magic(magic) && reader.u32(version) &&
      (version == archive_version || version == archive_version_without_statechart_ticks || version == archive_version_without_statechart || version == archive_version_without_timers ||
       version == archive_version_without_streams);
}

void write_timers(ArchiveWriter& writer, const std::vector<LogicalTimer>& timers) {
  writer.u32(static_cast<std::uint32_t>(timers.size()));
  for (const auto& timer : timers) {
    writer.u32(timer.key);
    writer.u64(timer.remaining_ticks);
  }
}

bool read_timers(ArchiveReader& reader, const std::uint32_t version, std::vector<LogicalTimer>& timers) {
  if (version < archive_version_without_statechart) return true;
  std::uint32_t count = 0;
  if (!reader.u32(count) || count > maximum_stream_entries) return false;
  for (std::uint32_t index = 0; index < count; ++index) {
    LogicalTimer timer{};
    if (!reader.u32(timer.key) || !reader.u64(timer.remaining_ticks)) return false;
    timers.push_back(timer);
  }
  return true;
}

void write_statechart(ArchiveWriter& writer, const std::optional<StatechartSnapshot>& statechart) {
  writer.u32(statechart.has_value() ? 1U : 0U);
  if (!statechart.has_value()) return;
  writer.u32(statechart->active);
  writer.u64(statechart->active_ticks);
  writer.u32(static_cast<std::uint32_t>(statechart->shallow_history.size()));
  for (const auto& [parent, child] : statechart->shallow_history) { writer.u32(parent); writer.u32(child); }
}

bool read_statechart(ArchiveReader& reader, const std::uint32_t version, std::optional<StatechartSnapshot>& statechart) {
  if (version < archive_version) return true;
  std::uint32_t present = 0;
  if (!reader.u32(present) || present > 1U) return false;
  if (present == 0U) return true;
  StatechartSnapshot snapshot{};
  std::uint32_t count = 0;
  if (!reader.u32(snapshot.active) ||
      (version >= archive_version && !reader.u64(snapshot.active_ticks)) ||
      !reader.u32(count) || count > maximum_archive_entries) return false;
  snapshot.shallow_history.reserve(count);
  for (std::uint32_t index = 0; index < count; ++index) { std::uint32_t parent = 0; std::uint32_t child = 0; if (!reader.u32(parent) || !reader.u32(child)) return false; snapshot.shallow_history.emplace_back(parent, child); }
  statechart = std::move(snapshot);
  return true;
}

void write_streams(ArchiveWriter& writer, const std::vector<NamedRandomStream>& streams) {
  writer.u32(static_cast<std::uint32_t>(streams.size()));
  for (const auto& stream : streams) {
    writer.text(stream.domain);
    writer.u64(stream.instance);
    writer.u64(stream.state.s0);
    writer.u64(stream.state.s1);
    writer.u64(stream.state.s2);
    writer.u64(stream.state.s3);
    writer.u64(stream.state.draws);
  }
}

bool read_streams(ArchiveReader& reader, const std::uint32_t version, std::vector<NamedRandomStream>& streams) {
  // A version 1 archive has no stream section: migrating means an empty set.
  if (version == archive_version_without_streams) return true;
  std::uint32_t count = 0;
  if (!reader.u32(count) || count > maximum_stream_entries) return false;
  for (std::uint32_t index = 0; index < count; ++index) {
    NamedRandomStream stream{};
    if (!reader.text(stream.domain, maximum_domain_bytes) || !reader.u64(stream.instance) ||
        !reader.u64(stream.state.s0) || !reader.u64(stream.state.s1) ||
        !reader.u64(stream.state.s2) || !reader.u64(stream.state.s3) ||
        !reader.u64(stream.state.draws)) {
      return false;
    }
    streams.push_back(std::move(stream));
  }
  return true;
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
  write_streams(writer, state.streams);
  write_timers(writer, state.timers);
  write_statechart(writer, state.statechart);
  return writer.finish();
}

bool decode_save(const std::span<const std::uint8_t> bytes, SavedState& state) {
  if (bytes.size() > maximum_archive_bytes) {
    return false;
  }
  ArchiveReader reader(bytes);
  std::uint32_t count = 0;
  std::uint32_t version = 0;
  SavedState decoded{};
  if (!read_header(reader, save_magic, version) || !reader.u64(decoded.tick) ||
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
  if (!read_streams(reader, version, decoded.streams) ||
      !read_timers(reader, version, decoded.timers) || !read_statechart(reader, version, decoded.statechart) || !reader.complete()) {
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
  write_streams(writer, replay.initial_state.streams);
  write_timers(writer, replay.initial_state.timers);
  write_statechart(writer, replay.initial_state.statechart);
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
  std::uint32_t version = 0;
  ReplayState decoded{};
  if (!read_header(reader, replay_magic, version) || !reader.u32(decoded.tick_rate_hz) ||
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
  if (!read_streams(reader, version, decoded.initial_state.streams) ||
      !read_timers(reader, version, decoded.initial_state.timers) ||
      !read_statechart(reader, version, decoded.initial_state.statechart) ||
      !reader.u64(decoded.expected_tick) ||
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
