#ifndef LUDIVRA_REGION_STORAGE_H
#define LUDIVRA_REGION_STORAGE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define LUDIVRA_REGION_STORAGE_ABI_VERSION 1U

typedef struct ludivra_region_storage ludivra_region_storage;

typedef enum ludivra_region_storage_result {
  LUDIVRA_REGION_STORAGE_OK = 0,
  LUDIVRA_REGION_STORAGE_ERROR_INVALID_ARGUMENT = 1,
  LUDIVRA_REGION_STORAGE_ERROR_ALLOCATION = 2,
  LUDIVRA_REGION_STORAGE_ERROR_CONFIGURATION_INVALID = 3,
  LUDIVRA_REGION_STORAGE_ERROR_REGION_MISSING = 4,
  LUDIVRA_REGION_STORAGE_ERROR_JOURNAL_PENDING = 5,
  LUDIVRA_REGION_STORAGE_ERROR_JOURNAL_INCOMPLETE = 6,
  LUDIVRA_REGION_STORAGE_ERROR_CHECKSUM_MISMATCH = 7,
  LUDIVRA_REGION_STORAGE_ERROR_VERSION_UNSUPPORTED = 8,
  LUDIVRA_REGION_STORAGE_ERROR_WRITE_NOT_ATOMIC = 9,
  LUDIVRA_REGION_STORAGE_ERROR_GROWTH_BUDGET_EXCEEDED = 10,
  LUDIVRA_REGION_STORAGE_ERROR_INTERNAL = 11,
  LUDIVRA_REGION_STORAGE_ERROR_BUFFER_TOO_SMALL = 12
} ludivra_region_storage_result;

typedef struct ludivra_region_storage_config {
  uint32_t struct_size;
  const char* root_utf8;
  uint32_t root_utf8_bytes;
  uint32_t reserved;
  uint64_t maximum_region_bytes;
} ludivra_region_storage_config;

typedef struct ludivra_region_storage_key {
  uint16_t dimension;
  uint16_t reserved;
  int32_t x;
  int32_t y;
  int32_t z;
} ludivra_region_storage_key;

typedef struct ludivra_region_storage_bytes {
  const uint8_t* data;
  uint32_t size;
} ludivra_region_storage_bytes;

typedef struct ludivra_region_storage_delta {
  int32_t chunk_x;
  int32_t chunk_y;
  int32_t chunk_z;
  ludivra_region_storage_bytes payload;
} ludivra_region_storage_delta;

typedef struct ludivra_region_storage_record {
  uint32_t struct_size;
  ludivra_region_storage_key key;
  const char* generator_id_utf8;
  uint32_t generator_id_utf8_bytes;
  uint32_t generator_version;
  uint64_t seed;
  const ludivra_region_storage_delta* deltas;
  uint32_t delta_count;
  ludivra_region_storage_bytes persistent_entities;
  ludivra_region_storage_bytes summary;
  ludivra_region_storage_bytes construction_graph;
} ludivra_region_storage_record;

typedef struct ludivra_region_storage_recovery {
  uint32_t struct_size;
  uint32_t replayed_regions;
  uint32_t discarded_incomplete_journal;
} ludivra_region_storage_recovery;

uint32_t ludivra_region_storage_abi_version(void);
const char* ludivra_region_storage_result_message(ludivra_region_storage_result result);
ludivra_region_storage_result ludivra_region_storage_create(
    const ludivra_region_storage_config* config,
    ludivra_region_storage** out_storage);
void ludivra_region_storage_destroy(ludivra_region_storage* storage);
ludivra_region_storage_result ludivra_region_storage_write(
    ludivra_region_storage* storage,
    const ludivra_region_storage_record* record);
ludivra_region_storage_result ludivra_region_storage_recover(
    ludivra_region_storage* storage,
    ludivra_region_storage_recovery* out_recovery);
ludivra_region_storage_result ludivra_region_storage_compact(
    ludivra_region_storage* storage,
    const ludivra_region_storage_key* key);
ludivra_region_storage_result ludivra_region_storage_migrate(
    ludivra_region_storage* storage,
    const ludivra_region_storage_key* key,
    uint32_t* out_migrated);
ludivra_region_storage_result ludivra_region_storage_inspect_count(
    const ludivra_region_storage* storage,
    uint32_t* out_count);
ludivra_region_storage_result ludivra_region_storage_inspect_write(
    const ludivra_region_storage* storage,
    ludivra_region_storage_key* keys,
    uint32_t capacity,
    uint32_t* out_count);

#ifdef __cplusplus
}
#endif

#endif
