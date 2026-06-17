#ifndef WATCHDOG_H
#define WATCHDOG_H

#include "FreeRTOS.h"
#include "task.h"

typedef void (*TaskEntry_t)(void *);

typedef struct {
    TaskEntry_t entry;
    const char *name;
    uint16_t    stackWords;
    UBaseType_t priority;
} WatchdogRestartSpec_t;

/* Initialize the software watchdog (timer + book-keeping). */
void Watchdog_Init(void);

/* Register a task and optional restart spec (NULL spec = no restart, only log). */
void Watchdog_RegisterTask(TaskHandle_t task,
                           const char *taskName,
                           const WatchdogRestartSpec_t *restartSpec);

/* Call from inside the task body to refresh its heartbeat. */
void Watchdog_Heartbeat(TaskHandle_t task);

/* Diagnostic helpers consumed by diagnostics / telemetry. */
UBaseType_t Watchdog_GetWatchedCount(void);
TickType_t  Watchdog_GetLastHeartbeat(UBaseType_t index, char *outName, size_t outLen);
uint8_t     Watchdog_GetRestartCount(UBaseType_t index);

#endif /* WATCHDOG_H */
