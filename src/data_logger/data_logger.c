#include "data_logger.h"
#include "config.h"
#include "ipc_manager.h"
#include "telemetry_server.h"
#include "watchdog.h"
#include "FreeRTOS.h"
#include "task.h"
#include "stream_buffer.h"
#include <string.h>

#define LOGGER_CHUNK 128

static TaskHandle_t s_loggerTask = NULL;
static volatile uint32_t s_bytesProcessed = 0;
static volatile uint32_t s_bytesDropped   = 0;

static void DataLoggerTask(void *pvParameters) {
    (void)pvParameters;
    char buf[LOGGER_CHUNK + 1];
    TaskHandle_t self = xTaskGetCurrentTaskHandle();

    while (1) {
        Watchdog_Heartbeat(self);

        size_t n = xStreamBufferReceive(xLogStream,
                                        buf,
                                        LOGGER_CHUNK,
                                        pdMS_TO_TICKS(250));
        if (n > 0) {
            buf[n] = '\0';
            s_bytesProcessed += (uint32_t)n;
            /* DataLogger is a passive consumer for throughput stats only.
             * Log_Event already pushes directly to the dashboard SSE feed;
             * re-publishing here would cause every log line to appear twice. */
        }

        /* If the stream becomes empty for a while, yield deliberately. */
        if (xStreamBufferIsEmpty(xLogStream) == pdTRUE) {
            taskYIELD();
        }
    }
}

void DataLogger_Init(void) {
    configASSERT(xTaskCreate(DataLoggerTask,
                             "DataLog",
                             STACK_SIZE_LOGGER,
                             NULL,
                             PRIO_MONITOR,
                             &s_loggerTask) == pdPASS);
}

size_t DataLogger_Submit(const char *bytes, size_t len) {
    if (bytes == NULL || len == 0 || xLogStream == NULL) return 0;
    if (xStreamBufferIsFull(xLogStream) == pdTRUE) {
        s_bytesDropped += (uint32_t)len;
        return 0;
    }
    size_t written = xStreamBufferSend(xLogStream, bytes, len, 0);
    if (written < len) s_bytesDropped += (uint32_t)(len - written);
    return written;
}

uint32_t DataLogger_GetBytesProcessed(void) { return s_bytesProcessed; }
uint32_t DataLogger_GetBytesDropped(void)   { return s_bytesDropped;   }
