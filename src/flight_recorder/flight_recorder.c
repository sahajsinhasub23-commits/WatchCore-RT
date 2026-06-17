#include "flight_recorder.h"
#include "FreeRTOS.h"
#include "task.h"
#include "semphr.h"
#include <string.h>

static FlightRecord_t   s_ring[FR_CAPACITY];
static volatile uint32_t s_head  = 0;   /* next write slot */
static volatile uint32_t s_total = 0;   /* total ever recorded */
static SemaphoreHandle_t s_mutex = NULL;

void FlightRecorder_Init(void) {
    memset(s_ring, 0, sizeof(s_ring));
    s_head  = 0;
    s_total = 0;
    s_mutex = xSemaphoreCreateMutex();
    configASSERT(s_mutex != NULL);
}

void FlightRecorder_Record(uint8_t level, const char *tag,
                           uint8_t mode, const char *text) {
    if (s_mutex == NULL) return;
    /* Short, non-blocking take: never stall a logging path. */
    if (xSemaphoreTake(s_mutex, 0) != pdTRUE) return;

    FlightRecord_t *r = &s_ring[s_head % FR_CAPACITY];
    r->tick  = (xTaskGetSchedulerState() != taskSCHEDULER_NOT_STARTED)
               ? xTaskGetTickCount() : 0;
    r->level = level;
    r->mode  = mode;
    strncpy(r->tag, tag ? tag : "?", sizeof(r->tag) - 1);
    r->tag[sizeof(r->tag) - 1] = '\0';
    strncpy(r->text, text ? text : "", sizeof(r->text) - 1);
    r->text[sizeof(r->text) - 1] = '\0';

    s_head++;
    s_total++;

    xSemaphoreGive(s_mutex);
}

size_t FlightRecorder_Dump(FlightRecord_t *out, size_t maxOut) {
    if (out == NULL || maxOut == 0 || s_mutex == NULL) return 0;
    if (xSemaphoreTake(s_mutex, pdMS_TO_TICKS(20)) != pdTRUE) return 0;

    uint32_t count = (s_total < FR_CAPACITY) ? s_total : FR_CAPACITY;
    if (count > maxOut) count = (uint32_t)maxOut;

    /* newest first */
    for (uint32_t i = 0; i < count; i++) {
        uint32_t idx = (s_head - 1 - i) % FR_CAPACITY;
        out[i] = s_ring[idx];
    }

    xSemaphoreGive(s_mutex);
    return count;
}

uint32_t FlightRecorder_GetTotal(void) { return s_total; }
