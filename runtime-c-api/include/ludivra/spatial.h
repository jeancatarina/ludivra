#ifndef LUDIVRA_SPATIAL_H
#define LUDIVRA_SPATIAL_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define LUDIVRA_SPATIAL_ABI_VERSION 1U
#define LUDIVRA_SPATIAL_LOCATION_RECORD_SIZE 48U

typedef struct ludivra_spatial_world ludivra_spatial_world;

typedef enum ludivra_spatial_result {
  LUDIVRA_SPATIAL_OK = 0,
  LUDIVRA_SPATIAL_ERROR_INVALID_ARGUMENT = 1,
  LUDIVRA_SPATIAL_ERROR_ALLOCATION = 2,
  LUDIVRA_SPATIAL_ERROR_CONFIGURATION_INVALID = 3,
  LUDIVRA_SPATIAL_ERROR_ENTITY_UNKNOWN = 4,
  LUDIVRA_SPATIAL_ERROR_DIMENSION_MISMATCH = 5,
  LUDIVRA_SPATIAL_ERROR_COORDINATE_OVERFLOW = 6,
  LUDIVRA_SPATIAL_ERROR_BUFFER_TOO_SMALL = 7,
  LUDIVRA_SPATIAL_ERROR_INTERNAL = 8
} ludivra_spatial_result;

typedef struct ludivra_spatial_world_config {
  /* Must be sizeof(ludivra_spatial_world_config). */
  uint32_t struct_size;
  /* Semantic world dimension. Every position supplied to this world uses it. */
  uint16_t dimension;
  uint16_t reserved;
  /* Region edge in internal chunks; this does not expose chunk coordinates. */
  uint32_t region_extent_chunks;
} ludivra_spatial_world_config;

typedef struct ludivra_spatial_global_position {
  /* Must be sizeof(ludivra_spatial_global_position). */
  uint32_t struct_size;
  uint16_t dimension;
  uint16_t reserved;
  /* Fixed-point global coordinates; 1000 represents one whole unit. */
  int64_t x_milli;
  int64_t y_milli;
  int64_t z_milli;
} ludivra_spatial_global_position;

typedef struct ludivra_spatial_offset {
  /* Must be sizeof(ludivra_spatial_offset). */
  uint32_t struct_size;
  uint32_t reserved;
  int64_t x_milli;
  int64_t y_milli;
  int64_t z_milli;
} ludivra_spatial_offset;

typedef struct ludivra_spatial_region {
  uint16_t dimension;
  uint16_t reserved;
  int32_t x;
  int32_t y;
  int32_t z;
} ludivra_spatial_region;

typedef struct ludivra_spatial_location {
  /* Must be sizeof(ludivra_spatial_location). */
  uint32_t struct_size;
  uint32_t entity_id;
  uint16_t dimension;
  uint16_t reserved;
  int32_t region_x;
  int32_t region_y;
  int32_t region_z;
  int64_t x_milli;
  int64_t y_milli;
  int64_t z_milli;
} ludivra_spatial_location;

uint32_t ludivra_spatial_abi_version(void);
const char* ludivra_spatial_result_message(ludivra_spatial_result result);

ludivra_spatial_result ludivra_spatial_world_create(
    const ludivra_spatial_world_config* config,
    ludivra_spatial_world** out_world);
void ludivra_spatial_world_destroy(ludivra_spatial_world* world);

/* Inserts or replaces an entity by semantic global position. */
ludivra_spatial_result ludivra_spatial_world_put(
    ludivra_spatial_world* world,
    uint32_t entity_id,
    const ludivra_spatial_global_position* position);

/* Moves an existing entity by a semantic fixed-point offset. */
ludivra_spatial_result ludivra_spatial_world_translate(
    ludivra_spatial_world* world,
    uint32_t entity_id,
    const ludivra_spatial_offset* offset);

/* Inspects a semantic global position and its current region. */
ludivra_spatial_result ludivra_spatial_world_locate(
    const ludivra_spatial_world* world,
    uint32_t entity_id,
    ludivra_spatial_location* out_location);

/* Region membership is sorted by entity id for deterministic inspection. */
ludivra_spatial_result ludivra_spatial_world_entities_in_count(
    const ludivra_spatial_world* world,
    const ludivra_spatial_region* region,
    uint32_t* out_count);
ludivra_spatial_result ludivra_spatial_world_entities_in_write(
    const ludivra_spatial_world* world,
    const ludivra_spatial_region* region,
    uint32_t* entity_ids,
    uint32_t capacity,
    uint32_t* out_count);

#ifdef __cplusplus
}
#endif

#endif
