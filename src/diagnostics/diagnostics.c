#include "diagnostics.h"
#include "config.h"
#include "logging.h"
#include "system_state.h"
#include "watchdog.h"
#include "FreeRTOS.h"
#include "task.h"
#include "semphr.h"
#include <stdio.h>
#include <string.h>

#define DIAG_NOTIFY_INDEX 1
#define DIAG_PERIOD_MS    5000

static TaskHandle_t      s_diagTask  = NULL;
static SemaphoreHandle_t s_diagMutex = NULL;
static char  s_taskListBuf [DIAG_TEXT_BUFFER_BYTES];
static char  s_runStatsBuf [DIAG_TEXT_BUFFER_BYTES];
static volatile uint32_t s_taskSwitches = 0;

static void RefreshSnapshot(void) {
    if (xSemaphoreTake(s_diagMutex, pdMS_TO_TICKS(100)) != pdTRUE) return;

    /* vTaskList: name, state, priority, stack hwm, task#. */
    s_taskListBuf[0] = '\0';
    vTaskList(s_taskListBuf);

    /* vTaskGetRunTimeStats: name, abs ticks, % CPU. */
    s_runStatsBuf[0] = '\0';
    vTaskGetRunTimeStats(s_runStatsBuf);

    s_taskSwitches++;

    xSemaphoreGive(s_diagMutex);
}

static void DiagnosticsTask(void *pvParameters) {
    (void)pvParameters;
    TaskHandle_t self = xTaskGetCurrentTaskHandle();
    TickType_t xLastWakeTime = xTaskGetTickCount();

    while (1) {
        Watchdog_Heartbeat(self);

        RefreshSnapshot();

        /* Walk every task and emit a warning if stack hwm gets low. */
        UBaseType_t numTasks = uxTaskGetNumberOfTasks();
        TaskStatus_t *arr = pvPortMalloc(numTasks * sizeof(TaskStatus_t));
        if (arr != NULL) {
            uint32_t totalRT = 0;
            UBaseType_t got = uxTaskGetSystemState(arr, numTasks, &totalRT);
            for (UBaseType_t i = 0; i < got; i++) {
                if (arr[i].usStackHighWaterMark < 32) {
                    char detail[64];
                    snprintf(detail, sizeof(detail),
                             "%s stack hwm=%u words",
                             arr[i].pcTaskName,
                             (unsigned)arr[i].usStackHighWaterMark);
                    Log_Event(LOG_WARN, "Diag", StateMachine_GetMode(),
                              "StackLow", detail);
                }
                /* Suspend any rogue task with priority 0 that isn't IDLE
                 * (defensive demonstration of vTaskSuspend / eTaskGetState). */
                eTaskState st = eTaskGetState(arr[i].xHandle);
                if (st == eDeleted) {
                    /* Nothing to do - already gone. */
                }
            }
            vPortFree(arr);
        }

        /* Wait either DIAG_PERIOD_MS or until somebody asks for a snapshot. */
        if (ulTaskNotifyTakeIndexed(DIAG_NOTIFY_INDEX, pdTRUE,
                                    pdMS_TO_TICKS(DIAG_PERIOD_MS)) > 0) {
            RefreshSnapshot();
        }
        (void)xLastWakeTime;
    }
}

void Diagnostics_Init(void) {
    s_diagMutex = xSemaphoreCreateMutex();
    configASSERT(s_diagMutex != NULL);

    configASSERT(xTaskCreate(DiagnosticsTask,
                             "Diag",
                             STACK_SIZE_DIAG,
                             NULL,
                             PRIO_DIAGNOSTICS,
                             &s_diagTask) == pdPASS);
}

size_t Diagnostics_GetTaskList(char *outBuf, size_t outLen) {
    if (outBuf == NULL || outLen == 0) return 0;
    size_t copied = 0;
    if (xSemaphoreTake(s_diagMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        strncpy(outBuf, s_taskListBuf, outLen - 1);
        outBuf[outLen - 1] = '\0';
        copied = strlen(outBuf);
        xSemaphoreGive(s_diagMutex);
    }
    return copied;
}

size_t Diagnostics_GetRunTimeStats(char *outBuf, size_t outLen) {
    if (outBuf == NULL || outLen == 0) return 0;
    size_t copied = 0;
    if (xSemaphoreTake(s_diagMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        strncpy(outBuf, s_runStatsBuf, outLen - 1);
        outBuf[outLen - 1] = '\0';
        copied = strlen(outBuf);
        xSemaphoreGive(s_diagMutex);
    }
    return copied;
}

uint32_t Diagnostics_GetMinFreeHeap(void) {
    return (uint32_t)xPortGetMinimumEverFreeHeapSize();
}

uint32_t Diagnostics_GetTotalTaskSwitches(void) { return s_taskSwitches; }

void Diagnostics_RequestSnapshot(void) {
    if (s_diagTask != NULL) {
        xTaskNotifyGiveIndexed(s_diagTask, DIAG_NOTIFY_INDEX);
    }
}
