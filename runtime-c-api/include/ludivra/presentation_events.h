// Generated from contracts/presentation-events.schema.json. Do not edit.
#ifndef LUDIVRA_PRESENTATION_EVENTS_H
#define LUDIVRA_PRESENTATION_EVENTS_H

#include <stdint.h>

#define LUDIVRA_PRESENTATION_PROTOCOL_VERSION 1U
#define LUDIVRA_PRESENTATION_EVENT_RECORD_SIZE 40U
#define LUDIVRA_MAX_BUFFERED_PRESENTATION_EVENTS 4096U

typedef enum ludivra_presentation_event_type {
  LUDIVRA_PRESENTATION_AUDIO_PLAY = 1,
  LUDIVRA_PRESENTATION_AUDIO_STOP = 2,
  LUDIVRA_PRESENTATION_EFFECT_SPAWN = 3
} ludivra_presentation_event_type;

typedef struct ludivra_presentation_event {
  uint32_t struct_size;
  uint32_t type;
  uint32_t id;
  int32_t value_milli;
  int32_t x_milli;
  int32_t y_milli;
  int32_t z_milli;
  uint32_t reserved;
  uint64_t sequence;
} ludivra_presentation_event;

#endif
