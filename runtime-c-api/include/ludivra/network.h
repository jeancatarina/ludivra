#ifndef LUDIVRA_NETWORK_H
#define LUDIVRA_NETWORK_H

#include <stdint.h>

#include "ludivra/runtime.h"

#ifdef __cplusplus
extern "C" {
#endif

#define LUDIVRA_NETWORK_ABI_VERSION 1U

typedef struct ludivra_network_room ludivra_network_room;

typedef enum ludivra_network_result {
  LUDIVRA_NETWORK_OK = 0,
  LUDIVRA_NETWORK_ERROR_INVALID_ARGUMENT = 1,
  LUDIVRA_NETWORK_ERROR_ALLOCATION = 2,
  LUDIVRA_NETWORK_ERROR_PROTOCOL_VERSION_UNSUPPORTED = 3,
  LUDIVRA_NETWORK_ERROR_WORLD_IDENTITY_MISMATCH = 4,
  LUDIVRA_NETWORK_ERROR_ROOM_FULL = 5,
  LUDIVRA_NETWORK_ERROR_CLIENT_UNKNOWN = 6,
  LUDIVRA_NETWORK_ERROR_CLIENT_INPUT_BACKLOG = 7,
  LUDIVRA_NETWORK_ERROR_CLIENT_SENT_STATE = 8,
  LUDIVRA_NETWORK_ERROR_RUNTIME = 9,
  LUDIVRA_NETWORK_ERROR_SNAPSHOT_MISMATCH = 10,
  LUDIVRA_NETWORK_ERROR_INTERNAL = 11
} ludivra_network_result;

typedef struct ludivra_network_room_config {
  uint32_t struct_size;
  uint32_t tick_rate_hz;
  uint32_t max_pending_inputs;
  uint64_t seed;
  uint32_t protocol_version;
  uint32_t maximum_clients;
  uint32_t maximum_inputs_per_client;
  const char* generator_id_utf8;
  uint32_t generator_id_utf8_bytes;
  uint32_t generator_version;
  uint64_t content_hash;
} ludivra_network_room_config;

typedef struct ludivra_network_peer_hello {
  uint32_t struct_size;
  uint32_t protocol_version;
  const char* generator_id_utf8;
  uint32_t generator_id_utf8_bytes;
  uint32_t generator_version;
  uint32_t reserved;
  uint64_t seed;
  uint64_t content_hash;
} ludivra_network_peer_hello;

typedef struct ludivra_network_input {
  uint32_t struct_size;
  uint32_t action_id;
  int32_t value_milli;
  uint32_t reserved;
  uint64_t sequence;
} ludivra_network_input;

uint32_t ludivra_network_abi_version(void);
const char* ludivra_network_result_message(ludivra_network_result result);

/* The supplied Runtime remains owned by its caller and must outlive the room.
   This makes host transport binding reuse the one authoritative simulation. */
ludivra_network_result ludivra_network_room_create(
    ludivra_runtime* host_runtime,
    const ludivra_network_room_config* config,
    ludivra_network_room** out_room);
void ludivra_network_room_destroy(ludivra_network_room* room);
ludivra_network_result ludivra_network_room_connect(
    ludivra_network_room* room,
    const ludivra_network_peer_hello* hello,
    uint32_t* out_client_id);
ludivra_network_result ludivra_network_room_submit_input(
    ludivra_network_room* room,
    uint32_t client_id,
    const ludivra_network_input* input);
/* No client state reaches the Runtime; this returns CLIENT_SENT_STATE after
   validating the peer exists. */
ludivra_network_result ludivra_network_room_reject_client_state(
    const ludivra_network_room* room,
    uint32_t client_id);
ludivra_network_result ludivra_network_room_advance(ludivra_network_room* room);
/* Snapshot uses the Runtime's versioned LDSV format; query then write. */
ludivra_network_result ludivra_network_room_snapshot_size(
    const ludivra_network_room* room,
    uint32_t* out_size);
ludivra_network_result ludivra_network_room_snapshot_write(
    const ludivra_network_room* room,
    uint8_t* buffer,
    uint32_t buffer_size,
    uint64_t* out_tick,
    uint64_t* out_state_hash);

#ifdef __cplusplus
}
#endif

#endif
