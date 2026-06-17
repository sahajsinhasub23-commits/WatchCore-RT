#include "logging.h"
#include "FreeRTOS.h"
#include "task.h"
#include "semphr.h"
#include "ipc_manager.h"
#include "telemetry_server.h"
#include "data_logger.h"
#include "flight_recorder.h"
#include <stdio.h>
#include <stdarg.h>
#include <string.h>

static const char *levelStrings[] = {
    "INFO", "WARN", "ERROR", "CRIT"
};

static const char *modeStrings[] = {
    "NORMAL", "WARNING", "DEGRADED", "EMERGENCY", "SAFE", "RECOVERY"
};

/* Aggregate counters, demonstrate taskENTER_CRITICAL/EXIT. */
static uint32_t s_loggedTotal[4] = {0};

void Logging_Init(void) {
    /* Mutex created by IPC_Init; nothing to do here. */
}

static const char *lvl_to_string(LogLevel_t level) {
    if ((int)level >= 0 && (int)level < (int)(sizeof(levelStrings) / sizeof(levelStrings[0]))) {
        return levelStrings[(int)level];
    }
    return "UNKNOWN";
}

static const char *mode_to_string(SystemMode_t mode) {
    if ((int)mode >= 0 && (int)mode < (int)(sizeof(modeStrings) / sizeof(modeStrings[0]))) {
        return modeStrings[(int)mode];
    }
    return "UNKNOWN";
}

void Log_Event(LogLevel_t level,
               const char *taskName,
               SystemMode_t mode,
               const char *eventType,
               const char *message) {
    TickType_t timestamp = 0;
    bool schedulerRunning =
        (xTaskGetSchedulerState() == taskSCHEDULER_RUNNING);
    if (schedulerRunning) {
        timestamp = xTaskGetTickCount();
    }

    char logBuffer[256];
    int written = snprintf(logBuffer, sizeof(logBuffer),
        "[%lu] [%s] [%s] [%s] [%s] - %s",
        (unsigned long)timestamp,
        lvl_to_string(level),
        mode_to_string(mode),
        taskName ? taskName : "SYS",
        eventType ? eventType : "?",
        message ? message : "");

    if (written < 0) return;
    if ((size_t)written >= sizeof(logBuffer)) {
        logBuffer[sizeof(logBuffer) - 1] = '\0';
    }

    /* Capture important events (WARN and above) in the flight recorder. */
    if ((int)level >= (int)LOG_WARN) {
        char frText[FR_TEXT_LEN];
        snprintf(frText, sizeof(frText), "%s: %s",
                 eventType ? eventType : "?", message ? message : "");
        FlightRecorder_Record((uint8_t)level, taskName ? taskName : "SYS",
                              (uint8_t)mode, frText);
    }

    /* Increment counter inside a tiny critical section (demonstrates
     * taskENTER_CRITICAL / taskEXIT_CRITICAL when scheduler is running). */
    if (schedulerRunning) {
        taskENTER_CRITICAL();
        if ((int)level >= 0 && (int)level < 4) {
            s_loggedTotal[(int)level]++;
        }
        taskEXIT_CRITICAL();
    } else {
        if ((int)level >= 0 && (int)level < 4) {
            s_loggedTotal[(int)level]++;
        }
    }

    /* Before the scheduler is alive, mutex APIs are not safe to call - go
     * straight to stdout/dashboard queue. */
    if (!schedulerRunning || xLogMutex == NULL) {
        printf("%s\n", logBuffer);
        fflush(stdout);
        return;
    }

    /* Recursive mutex permits Log_Event to be called from nested paths
     * (e.g. from inside a socket-error fallback that also logs). */
    if (xSemaphoreTakeRecursive(xLogMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        printf("%s\n", logBuffer);
        fflush(stdout);

        TelemetryServer_QueueLog(logBuffer);
        DataLogger_Submit(logBuffer, strlen(logBuffer));

        xSemaphoreGiveRecursive(xLogMutex);
    } else {
        /* Last-resort path; don't lose the log entirely. */
        printf("%s\n", logBuffer);
        fflush(stdout);
    }
}

uint32_t Logging_GetCount(LogLevel_t level) {
    if ((int)level < 0 || (int)level >= 4) return 0;
    taskENTER_CRITICAL();
    uint32_t v = s_loggedTotal[(int)level];
    taskEXIT_CRITICAL();
    return v;
}
