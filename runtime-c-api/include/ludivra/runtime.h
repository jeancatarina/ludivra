#ifndef LUDIVRA_RUNTIME_H
#define LUDIVRA_RUNTIME_H

#include <stdint.h>
#include "ludivra/presentation_events.h"

#ifdef __cplusplus
extern "C" {
#endif

#define LUDIVRA_RUNTIME_ABI_VERSION 2U

typedef struct ludivra_runtime ludivra_runtime;

typedef enum ludivra_result {
  LUDIVRA_OK = 0,
  LUDIVRA_ERROR_INVALID_ARGUMENT = 1,
  LUDIVRA_ERROR_ALLOCATION = 2,
  LUDIVRA_ERROR_TICK_OVERFLOW = 3,
  LUDIVRA_ERROR_INPUT_LIMIT = 4,
  LUDIVRA_ERROR_INTERNAL = 5,
  LUDIVRA_ERROR_SCRIPT = 6,
  LUDIVRA_ERROR_INTEGER_OVERFLOW = 7,
  LUDIVRA_ERROR_ARCHIVE_INVALID = 8,
  LUDIVRA_ERROR_REPLAY_MISMATCH = 9,
  LUDIVRA_ERROR_PENDING_INPUTS = 10,
  LUDIVRA_ERROR_BUFFER_TOO_SMALL = 11,
  LUDIVRA_ERROR_PRESENTATION_LIMIT = 12
} ludivra_result;

typedef struct ludivra_runtime_config {
  /* Must be sizeof(ludivra_runtime_config). */
  uint32_t struct_size;
  /* Fixed simulation frequency. Must be greater than zero. */
  uint32_t tick_rate_hz;
  /* Maximum inputs waiting for the next confirmed tick. Must be greater than zero. */
  uint32_t max_pending_inputs;
  /* Deterministic seed mixed into the initial state. */
  uint64_t seed;
} ludivra_runtime_config;

typedef struct ludivra_logical_input {
  /* Must be sizeof(ludivra_logical_input). */
  uint32_t struct_size;
  /* Game-defined logical action ID. */
  uint32_t action_id;
  /* Fixed-point logical value where 1000 represents 1.0. */
  int32_t value_milli;
  /* Stable ordering key within the pending tick. */
  uint64_t sequence;
} ludivra_logical_input;

uint32_t ludivra_runtime_abi_version(void);
const char* ludivra_result_message(ludivra_result result);

ludivra_result ludivra_runtime_create(
    const ludivra_runtime_config* config,
    ludivra_runtime** out_runtime);

/* Accepts NULL. All non-NULL handles must be destroyed exactly once. */
void ludivra_runtime_destroy(ludivra_runtime* runtime);

/* Queues input for the next tick. Inputs are committed in stable sequence order. */
ludivra_result ludivra_runtime_submit_input(
    ludivra_runtime* runtime,
    const ludivra_logical_input* input);

ludivra_result ludivra_runtime_step(
    ludivra_runtime* runtime,
    uint32_t tick_count);

/* Inspection functions never mutate the runtime. */
ludivra_result ludivra_runtime_tick(
    const ludivra_runtime* runtime,
    uint64_t* out_tick);

ludivra_result ludivra_runtime_state_hash(
    const ludivra_runtime* runtime,
    uint64_t* out_state_hash);

/* Replaces the current Lua gameplay module. Source must return a table with on_input(ctx, event). */
ludivra_result ludivra_runtime_load_gameplay(
    ludivra_runtime* runtime,
    const char* source,
    uint32_t source_size);

ludivra_result ludivra_runtime_integer_state(
    const ludivra_runtime* runtime,
    uint32_t key,
    int64_t* out_value);

/* Save and replay archives use a versioned, checksummed, engine-owned binary format. */
ludivra_result ludivra_runtime_save_size(
    const ludivra_runtime* runtime,
    uint32_t* out_size);

ludivra_result ludivra_runtime_save_write(
    const ludivra_runtime* runtime,
    uint8_t* buffer,
    uint32_t buffer_size);

/* Loading is transactional and rejected while logical inputs are pending. */
ludivra_result ludivra_runtime_load_save(
    ludivra_runtime* runtime,
    const uint8_t* buffer,
    uint32_t buffer_size);

ludivra_result ludivra_runtime_replay_size(
    const ludivra_runtime* runtime,
    uint32_t* out_size);

ludivra_result ludivra_runtime_replay_write(
    const ludivra_runtime* runtime,
    uint8_t* buffer,
    uint32_t buffer_size);

/* Re-simulates the archive with the currently loaded gameplay module. */
ludivra_result ludivra_runtime_verify_replay(
    const ludivra_runtime* runtime,
    const uint8_t* buffer,
    uint32_t buffer_size);

/* Presentation events are transient, ordered, and retained until explicitly cleared. */
ludivra_result ludivra_runtime_presentation_event_count(
    const ludivra_runtime* runtime,
    uint32_t* out_count);

ludivra_result ludivra_runtime_presentation_events_write(
    const ludivra_runtime* runtime,
    ludivra_presentation_event* buffer,
    uint32_t capacity,
    uint32_t* out_count);

ludivra_result ludivra_runtime_presentation_events_clear(
    ludivra_runtime* runtime);

/* Pointer remains valid until the next non-const operation or runtime destruction. */
const char* ludivra_runtime_last_error(const ludivra_runtime* runtime);

#ifdef __cplusplus
}
#endif

#endif
