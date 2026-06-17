#include "watchdog.h"
#include "config.h"
#include "logging.h"
#include "event_manager.h"
#include "system_state.h"
#include "timers.h"
#include "task.h"
#include "semphr.h"
#include <string.h>

#define MAX_WATCHED_TASKS 12

typedef struct {
    TaskHandle_t          task;
    char                  name[configMAX_TASK_NAME_LEN];
    TickType_t            lastHeartbeat;
    uint8_t               restartAttempts;
    bool                  isActive;
    bool                  haveRestartSpec;
    WatchdogRestartSpec_t restartSpec;
} WatchedTask_t;

static WatchedTask_t  watchedTasks[MAX_WATCHED_TASKS];
static TimerHandle_t  xWatchdogTimer = NULL;
static SemaphoreHandle_t xWatchdogMutex = NULL;
static volatile bool  bWatchdogTimerStarted = false;

static void WatchdogTimerCallback(TimerHandle_t xTimer) {
    (void)xTimer;
    const TickType_t now = xTaskGetTickCount();

    if (xWatchdogMutex == NULL ||
        xSemaphoreTake(xWatchdogMutex, pdMS_TO_TICKS(50)) != pdTRUE) {
        return;
    }

    for (UBaseType_t i = 0; i < MAX_WATCHED_TASKS; i++) {
        WatchedTask_t *w = &watchedTasks[i];
        if (!w->isActive) continue;

        const TickType_t elapsed = now - w->lastHeartbeat;
        if (elapsed <= pdMS_TO_TICKS(WD_TIMEOUT_MS)) continue;

        Log_Event(LOG_CRITICAL, "Watchdog", StateMachine_GetMode(),
                  "TaskHang", w->name);
        EventManager_TriggerFault(FAULT_TASK_HANG);

        if (w->restartAttempts < MAX_RESTART_ATTEMPTS && w->haveRestartSpec) {
            /* Actually restart: delete the hung task, recreate it. */
            Log_Event(LOG_WARN, "Watchdog", StateMachine_GetMode(),
                      "RestartTask", w->name);

            if (w->task != NULL) {
                vTaskDelete(w->task);
                w->task = NULL;
            }

            TaskHandle_t newTask = NULL;
            BaseType_t created = xTaskCreate(w->restartSpec.entry,
                                             w->restartSpec.name,
                                             w->restartSpec.stackWords,
                                             NULL,
                                             w->restartSpec.priority,
                                             &newTask);
            if (created == pdPASS) {
                w->task = newTask;
                w->lastHeartbeat = now;
                w->restartAttempts++;
                StateMachine_SetMode(SYS_MODE_RECOVERY);
                EventManager_ClearFault(FAULT_TASK_HANG);
            } else {
                Log_Event(LOG_CRITICAL, "Watchdog", StateMachine_GetMode(),
                          "RestartFail", w->name);
                StateMachine_SetMode(SYS_MODE_SAFE_MODE);
            }
        } else if (w->restartAttempts < MAX_RESTART_ATTEMPTS) {
            /* No restart spec: just refresh and log. */
            w->restartAttempts++;
            w->lastHeartbeat = now;
            Log_Event(LOG_WARN, "Watchdog", StateMachine_GetMode(),
                      "LogOnly", w->name);
        } else {
            Log_Event(LOG_CRITICAL, "Watchdog", StateMachine_GetMode(),
                      "MaxRestarts", w->name);
            StateMachine_SetMode(SYS_MODE_SAFE_MODE);
            w->isActive = false;
        }
    }

    xSemaphoreGive(xWatchdogMutex);
}

void Watchdog_Init(void) {
    memset(watchedTasks, 0, sizeof(watchedTasks));

    xWatchdogMutex = xSemaphoreCreateMutex();
    configASSERT(xWatchdogMutex != NULL);

    xWatchdogTimer = xTimerCreate("WDT",
                                  pdMS_TO_TICKS(WD_TICK_PERIOD_MS),
                                  pdTRUE,
                                  (void *)0,
                                  WatchdogTimerCallback);
    configASSERT(xWatchdogTimer != NULL);
    /* Start deferred to first heartbeat (scheduler must be running). */
}

void Watchdog_RegisterTask(TaskHandle_t task,
                           const char *taskName,
                           const WatchdogRestartSpec_t *restartSpec) {
    if (task == NULL || taskName == NULL) return;
    if (xWatchdogMutex != NULL) {
        xSemaphoreTake(xWatchdogMutex, portMAX_DELAY);
    }

    for (UBaseType_t i = 0; i < MAX_WATCHED_TASKS; i++) {
        if (watchedTasks[i].isActive) continue;
        watchedTasks[i].task = task;
        strncpy(watchedTasks[i].name, taskName, configMAX_TASK_NAME_LEN - 1);
        watchedTasks[i].name[configMAX_TASK_NAME_LEN - 1] = '\0';
        watchedTasks[i].lastHeartbeat = xTaskGetTickCount();
        watchedTasks[i].restartAttempts = 0;
        watchedTasks[i].isActive = true;
        watchedTasks[i].haveRestartSpec = (restartSpec != NULL);
        if (restartSpec != NULL) {
            watchedTasks[i].restartSpec = *restartSpec;
        }
        break;
    }

    if (xWatchdogMutex != NULL) {
        xSemaphoreGive(xWatchdogMutex);
    }
}

void Watchdog_Heartbeat(TaskHandle_t task) {
    /* Lazily start the WD timer once the scheduler is alive. */
    if (!bWatchdogTimerStarted &&
        xWatchdogTimer != NULL &&
        xTaskGetSchedulerState() == taskSCHEDULER_RUNNING) {
        if (xTimerStart(xWatchdogTimer, 0) == pdPASS) {
            bWatchdogTimerStarted = true;
        }
    }

    if (xWatchdogMutex == NULL ||
        xSemaphoreTake(xWatchdogMutex, 0) != pdTRUE) {
        /* Couldn't grab lock - skip this beat; next will catch up. */
        return;
    }

    for (UBaseType_t i = 0; i < MAX_WATCHED_TASKS; i++) {
        if (watchedTasks[i].isActive && watchedTasks[i].task == task) {
            watchedTasks[i].lastHeartbeat = xTaskGetTickCount();
            break;
        }
    }
    xSemaphoreGive(xWatchdogMutex);
}

UBaseType_t Watchdog_GetWatchedCount(void) {
    UBaseType_t count = 0;
    for (UBaseType_t i = 0; i < MAX_WATCHED_TASKS; i++) {
        if (watchedTasks[i].isActive) count++;
    }
    return count;
}

TickType_t Watchdog_GetLastHeartbeat(UBaseType_t index, char *outName, size_t outLen) {
    if (index >= MAX_WATCHED_TASKS || !watchedTasks[index].isActive) {
        if (outName && outLen) outName[0] = '\0';
        return 0;
    }
    if (outName && outLen) {
        strncpy(outName, watchedTasks[index].name, outLen - 1);
        outName[outLen - 1] = '\0';
    }
    return watchedTasks[index].lastHeartbeat;
}

uint8_t Watchdog_GetRestartCount(UBaseType_t index) {
    if (index >= MAX_WATCHED_TASKS || !watchedTasks[index].isActive) {
        return 0;
    }
    return watchedTasks[index].restartAttempts;
}
