#ifndef LUDIVRA_RUNTIME_H
#define LUDIVRA_RUNTIME_H

#include <stdint.h>
#include "ludivra/presentation_events.h"

#ifdef __cplusplus
extern "C" {
#endif

#define LUDIVRA_RUNTIME_ABI_VERSION 5U
#define LUDIVRA_STATECHART_TRACE_RECORD_SIZE 40U

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
  LUDIVRA_ERROR_PRESENTATION_LIMIT = 12,
  LUDIVRA_ERROR_SYMBOL_CONFLICT = 13,
  LUDIVRA_ERROR_CONTENT_PACK_INVALID = 14,
  LUDIVRA_ERROR_STATECHART_INVALID = 15,
  LUDIVRA_ERROR_STATECHART_EVENT_UNHANDLED = 16
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

typedef struct ludivra_statechart_state {
  uint32_t id;
  uint32_t parent_id;
  uint8_t has_parent;
  uint8_t shallow_history;
} ludivra_statechart_state;

typedef struct ludivra_statechart_transition {
  uint32_t id;
  uint32_t from_state;
  uint32_t event_action_id;
  uint32_t to_state;
  uint32_t priority;
  /* Zero means no guard. Guard handlers are registered separately by semantic name. */
  uint32_t guard_id;
  /* Zero means event-triggered. A positive value is a logical afterTicks trigger. */
  uint32_t after_ticks;
  uint8_t kind; /* 0 external, 1 internal */
} ludivra_statechart_transition;

typedef enum ludivra_statechart_action_phase {
  LUDIVRA_STATECHART_ACTION_ENTRY = 0,
  LUDIVRA_STATECHART_ACTION_EXIT = 1,
  LUDIVRA_STATECHART_ACTION_TRANSITION = 2
} ludivra_statechart_action_phase;

typedef struct ludivra_statechart_action {
  /* State id for entry/exit, transition id for transition actions. */
  uint32_t owner_id;
  uint32_t action_id;
  ludivra_statechart_action_phase phase;
} ludivra_statechart_action;

typedef enum ludivra_statechart_handler_kind {
  LUDIVRA_STATECHART_HANDLER_GUARD = 0,
  LUDIVRA_STATECHART_HANDLER_ACTION = 1
} ludivra_statechart_handler_kind;

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

/* Binds a compiled semantic handler name to the compact ID used by a chart.
   Guards invoke on_statechart_guard(ctx, event); actions invoke
   on_statechart_action(ctx, event). */
ludivra_result ludivra_runtime_declare_statechart_handler(
    ludivra_runtime* runtime,
    ludivra_statechart_handler_kind kind,
    const char* name,
    uint32_t name_size,
    uint32_t id);

/* Installs one deterministic gameplay statechart. Event ids are logical input
   action ids; after_ticks is logical time; actions run through the Lua command
   buffer in exit, transition, entry order. */
ludivra_result ludivra_runtime_install_statechart(
    ludivra_runtime* runtime,
    const ludivra_statechart_state* states,
    uint32_t state_count,
    const ludivra_statechart_transition* transitions,
    uint32_t transition_count,
    const ludivra_statechart_action* actions,
    uint32_t action_count,
    uint32_t initial_state);

ludivra_result ludivra_runtime_statechart_active(
    const ludivra_runtime* runtime,
    uint32_t* out_state);

typedef enum ludivra_statechart_trace_kind {
  LUDIVRA_STATECHART_TRACE_EVENT = 0,
  LUDIVRA_STATECHART_TRACE_GUARD = 1,
  LUDIVRA_STATECHART_TRACE_ACTION = 2
} ludivra_statechart_trace_kind;

typedef struct ludivra_statechart_trace {
  uint64_t tick;
  uint32_t event_action_id;
  uint32_t transition_id;
  uint32_t guard_id;
  uint32_t action_id;
  uint32_t previous_state;
  uint32_t active_state;
  uint8_t kind;
  uint8_t guard_passed;
  /* 0 exit, 1 transition, 2 entry, 255 when the record has no action. */
  uint8_t action_phase;
  uint8_t error;
} ludivra_statechart_trace;

/* The trailing padding required by the uint64_t tick is part of the ABI. Hosts
   allocating trace arrays must use LUDIVRA_STATECHART_TRACE_RECORD_SIZE. */

/* Ordered causal records are transient like presentation events. */
ludivra_result ludivra_runtime_statechart_trace_count(
    const ludivra_runtime* runtime,
    uint32_t* out_count);
ludivra_result ludivra_runtime_statechart_traces_write(
    const ludivra_runtime* runtime,
    ludivra_statechart_trace* buffer,
    uint32_t capacity,
    uint32_t* out_count);
ludivra_result ludivra_runtime_statechart_traces_clear(
    ludivra_runtime* runtime);

/* Inspection functions never mutate the runtime. */
ludivra_result ludivra_runtime_tick(
    const ludivra_runtime* runtime,
    uint64_t* out_tick);

ludivra_result ludivra_runtime_state_hash(
    const ludivra_runtime* runtime,
    uint64_t* out_state_hash);

/* Installs the compiled content pack as the read-only CONTENT global. Call before
   loading gameplay: a module reads content at load time too. */
ludivra_result ludivra_runtime_load_content_pack(
    ludivra_runtime* runtime,
    const char* bytes,
    uint32_t size);

/* Replaces the current Lua gameplay module. Source must return a table with on_input(ctx, event). */
ludivra_result ludivra_runtime_load_gameplay(
    ludivra_runtime* runtime,
    const char* source,
    uint32_t source_size);

typedef enum ludivra_symbol_kind {
  LUDIVRA_SYMBOL_STATE = 0,
  LUDIVRA_SYMBOL_TIMER = 1
} ludivra_symbol_kind;

/* Declares the semantic name of a state or timer before gameplay loads, so scripts
   use names instead of repeating the manifest keys. */
ludivra_result ludivra_runtime_declare_symbol(
    ludivra_runtime* runtime,
    ludivra_symbol_kind kind,
    const char* name,
    uint32_t name_size,
    uint32_t key);

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

/* Stable code of the last script failure, empty when the failure carries none. */
const char* ludivra_runtime_last_error_code(const ludivra_runtime* runtime);

#ifdef __cplusplus
}
#endif

#endif
