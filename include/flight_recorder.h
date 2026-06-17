#ifndef FLIGHT_RECORDER_H
#define FLIGHT_RECORDER_H

#include <stdint.h>
#include <stddef.h>
#include "config.h"
#include "logging.h"

/* ------------------------------------------------------------------
 * Flight recorder ("black box").
 *
 * A fixed-size ring buffer kept in RAM that stores the most recent
 * important events (warnings, errors, faults, recoveries, mode
 * changes). Real spacecraft keep such a recorder so that after an
 * incident the ground team can read back exactly what happened.
 *
 * It survives task deletion (it is module-global, not per-task), is
 * protected by a mutex, and can be dumped as JSON for the dashboard.
 * ------------------------------------------------------------------ */

#define FR_CAPACITY      32
#define FR_TEXT_LEN      48

typedef struct {
    uint32_t     tick;      /* time of the event */
    uint8_t      level;     /* LogLevel_t */
    uint8_t      mode;      /* SystemMode_t at the time */
    char         tag[16];   /* short source tag */
    char         text[FR_TEXT_LEN];
} FlightRecord_t;

void   FlightRecorder_Init(void);

/* Record one event (called automatically by the logging path for
 * WARN/ERROR/CRITICAL events). */
void   FlightRecorder_Record(uint8_t level, const char *tag,
                             uint8_t mode, const char *text);

/* Copy the most recent records (newest first) into out[]; returns count. */
size_t FlightRecorder_Dump(FlightRecord_t *out, size_t maxOut);

/* Total events ever recorded (including overwritten ones). */
uint32_t FlightRecorder_GetTotal(void);

#endif /* FLIGHT_RECORDER_H */
