#include "fault_injection.h"
#include "config.h"
#include "event_manager.h"
#include "command_processor.h"
#include "diagnostics.h"
#include "FreeRTOS.h"
#include "task.h"
#include "ipc_manager.h"
#include <string.h>

static TaskHandle_t s_injTask = NULL;

/* Faster, richer demo cadence: cycle through more fault types with a short
 * gap between them so the dashboard always has events to show and the
 * recovery system is constantly being exercised. */
#define INJ_GAP_MS  3500   /* time between demo faults */

static void FaultInjectionTask(void *pvParameters) {
    (void)pvParameters;
    /* Short warm-up. */
    vTaskDelay(pdMS_TO_TICKS(3000));

    for (;;) {
        EventManager_TriggerFault(FAULT_HIGH_TEMP);
        vTaskDelay(pdMS_TO_TICKS(INJ_GAP_MS));

        EventManager_TriggerFault(FAULT_LOW_BATTERY);
        vTaskDelay(pdMS_TO_TICKS(INJ_GAP_MS));

        EventManager_TriggerFault(FAULT_RADIATION);
        vTaskDelay(pdMS_TO_TICKS(INJ_GAP_MS));

        EventManager_TriggerFault(FAULT_SOLAR_LOW);
        vTaskDelay(pdMS_TO_TICKS(INJ_GAP_MS));

        EventManager_TriggerFault(FAULT_ATTITUDE);
        vTaskDelay(pdMS_TO_TICKS(INJ_GAP_MS));

        /* Periodic diagnostics + a benign ping to keep those paths warm. */
        CommandMessage_t cmd = {0};
        cmd.id = CMD_REQUEST_DIAGNOSTICS;
        strncpy(cmd.label, "Periodic", sizeof(cmd.label) - 1);
        CommandProcessor_Submit(&cmd);
        Diagnostics_RequestSnapshot();
        vTaskDelay(pdMS_TO_TICKS(2500));

        CommandMessage_t ping = {0};
        ping.id = CMD_PING;
        strncpy(ping.label, "Heartbeat", sizeof(ping.label) - 1);
        CommandProcessor_Submit(&ping);
        vTaskDelay(pdMS_TO_TICKS(2000));
    }
}

void FaultInjection_Init(void) {
    configASSERT(xTaskCreate(FaultInjectionTask,
                             "FaultInj",
                             configMINIMAL_STACK_SIZE * 2,
                             NULL,
                             PRIO_CONTROL,
                             &s_injTask) == pdPASS);
}
