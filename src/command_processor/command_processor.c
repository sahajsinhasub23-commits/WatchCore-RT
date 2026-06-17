#include "command_processor.h"
#include "config.h"
#include "ipc_manager.h"
#include "event_manager.h"
#include "system_state.h"
#include "logging.h"
#include "telemetry_server.h"
#include "FreeRTOS.h"
#include "task.h"
#include "message_buffer.h"
#include "semphr.h"
#include <string.h>

#define CMD_NOTIFY_INDEX 0
#define CMD_NOTIFY_BIT   ( 1UL << 0 )

static TaskHandle_t s_cmdTask = NULL;
static volatile uint32_t s_accepted = 0;
static volatile uint32_t s_rejected = 0;

static void CommandTask(void *pvParameters) {
    (void)pvParameters;
    CommandMessage_t msg;

    while (1) {
        /* Block until a notification arrives (sent by Submit), then
         * drain everything currently in the message buffer. */
        ulTaskNotifyTakeIndexed(CMD_NOTIFY_INDEX, pdTRUE, portMAX_DELAY);

        while (xMessageBufferReceive(xCommandBuffer,
                                     &msg,
                                     sizeof(msg),
                                     pdMS_TO_TICKS(10)) == sizeof(msg)) {
            bool ok = true;

            switch (msg.id) {
            case CMD_SET_FAULT:
                EventManager_TriggerFault(msg.arg32);
                Log_Event(LOG_WARN, "CmdProc", StateMachine_GetMode(),
                          "SetFault", msg.label);
                break;
            case CMD_CLEAR_FAULT:
                EventManager_ClearFault(msg.arg32);
                Log_Event(LOG_INFO, "CmdProc", StateMachine_GetMode(),
                          "ClearFault", msg.label);
                break;
            case CMD_SET_MODE:
                StateMachine_SetMode((SystemMode_t)msg.arg32);
                Log_Event(LOG_INFO, "CmdProc", StateMachine_GetMode(),
                          "SetMode", msg.label);
                break;
            case CMD_REQUEST_DIAGNOSTICS:
                /* Diagnostics task will pick up via shared flag. */
                Log_Event(LOG_INFO, "CmdProc", StateMachine_GetMode(),
                          "DiagReq", msg.label);
                break;
            case CMD_PING:
                Log_Event(LOG_INFO, "CmdProc", StateMachine_GetMode(),
                          "Ping", msg.label);
                break;
            default:
                ok = false;
                break;
            }

            if (ok) s_accepted++;
            else    s_rejected++;
        }
    }
}

void CommandProcessor_Init(void) {
    configASSERT(xTaskCreate(CommandTask,
                             "CmdProc",
                             STACK_SIZE_COMMAND,
                             NULL,
                             PRIO_COMMAND,
                             &s_cmdTask) == pdPASS);
}

void CommandProcessor_Submit(const CommandMessage_t *msg) {
    if (msg == NULL || xCommandBuffer == NULL) return;

    /* Push into the message buffer (non-blocking, drop if full). */
    size_t pushed = xMessageBufferSend(xCommandBuffer,
                                       msg,
                                       sizeof(*msg),
                                       0);
    if (pushed != sizeof(*msg)) {
        s_rejected++;
        return;
    }

    /* Wake the command task via direct-to-task notification. */
    if (s_cmdTask != NULL) {
        xTaskNotifyIndexed(s_cmdTask, CMD_NOTIFY_INDEX, CMD_NOTIFY_BIT, eSetBits);
    }
    if (xCommandReadySem != NULL) {
        xSemaphoreGive(xCommandReadySem);
    }
}

TaskHandle_t CommandProcessor_GetTaskHandle(void) {
    return s_cmdTask;
}

uint32_t CommandProcessor_GetTotalAccepted(void) { return s_accepted; }
uint32_t CommandProcessor_GetTotalRejected(void) { return s_rejected; }
