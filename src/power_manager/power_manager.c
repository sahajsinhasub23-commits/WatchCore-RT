#include "power_manager.h"
#include "config.h"
#include "ipc_manager.h"
#include "logging.h"
#include "system_state.h"
#include "watchdog.h"
#include "FreeRTOS.h"
#include "task.h"
#include "semphr.h"
#include <stdio.h>

static TaskHandle_t s_powerTask = NULL;

static void PowerManagerTask(void *pvParameters) {
    (void)pvParameters;
    TaskHandle_t self = xTaskGetCurrentTaskHandle();
    TickType_t xLastWake = xTaskGetTickCount();

    while (1) {
        Watchdog_Heartbeat(self);

        /* Periodically log power token availability. */
        UBaseType_t free = uxSemaphoreGetCount(xPowerTokens);
        if (free == 0) {
            Log_Event(LOG_WARN, "PwrMgr", StateMachine_GetMode(),
                      "TokensExhausted", "No power tokens free");
        }

        vTaskDelayUntil(&xLastWake, pdMS_TO_TICKS(2000));
    }
}

void PowerManager_Init(void) {
    configASSERT(xTaskCreate(PowerManagerTask,
                             "PwrMgr",
                             STACK_SIZE_POWER,
                             NULL,
                             PRIO_POWER_MGR,
                             &s_powerTask) == pdPASS);
}

bool PowerManager_Acquire(uint32_t timeoutMs) {
    if (xPowerTokens == NULL) return false;
    TickType_t wait = (timeoutMs == 0) ? 0 : pdMS_TO_TICKS(timeoutMs);
    return xSemaphoreTake(xPowerTokens, wait) == pdTRUE;
}

void PowerManager_Release(void) {
    if (xPowerTokens != NULL) {
        xSemaphoreGive(xPowerTokens);
    }
}

uint32_t PowerManager_GetFreeTokens(void) {
    if (xPowerTokens == NULL) return 0;
    return (uint32_t)uxSemaphoreGetCount(xPowerTokens);
}
