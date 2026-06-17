#include "event_manager.h"
#include "config.h"
#include "ipc_manager.h"
#include "system_state.h"
#include "logging.h"
#include "emergency_tasks.h"
#include "telemetry_server.h"
#include "FreeRTOS.h"
#include "task.h"
#include "queue.h"
#include "event_groups.h"

static TaskHandle_t s_eventTask = NULL;

static void HandleTelemetrySample(const TelemetryData_t *t) {
    TelemetryServer_UpdateTelemetrySnapshot(t);

    switch (t->type) {
    case TELEMETRY_TYPE_SENSORS:
        if (t->data.sensors.temperature > THRESHOLD_TEMP_MAX) {
            EventManager_TriggerFault(FAULT_HIGH_TEMP);
        }
        if (t->data.sensors.radiation > THRESHOLD_RAD_MAX) {
            EventManager_TriggerFault(FAULT_RADIATION);
        }
        if (t->data.sensors.batteryLevel < THRESHOLD_BATT_MIN) {
            EventManager_TriggerFault(FAULT_LOW_BATTERY);
        }
        /* NOTE: solar current is naturally near zero at dawn/dusk and during
         * eclipse — that is normal (the battery covers it), not a fault. So we
         * do NOT auto-raise FAULT_SOLAR_LOW from the sensor here; a real solar
         * fault comes only from explicit injection (demo or dashboard). */
        if (t->data.sensors.attitudeRate > THRESHOLD_ATTITUDE_MAX) {
            EventManager_TriggerFault(FAULT_ATTITUDE);
        }
        if (t->data.sensors.pressure < THRESHOLD_PRESSURE_MIN ||
            t->data.sensors.pressure > THRESHOLD_PRESSURE_MAX) {
            EventManager_TriggerFault(FAULT_PRESSURE);
        }
        break;
    case TELEMETRY_TYPE_HEAP:
        if (t->data.freeHeap < THRESHOLD_HEAP_MIN) {
            EventManager_TriggerFault(FAULT_MEMORY_EXHAUSTION);
        }
        break;
    case TELEMETRY_TYPE_CPU:
    default:
        break;
    }
}

static void EventManagerTask(void *pvParameters) {
    (void)pvParameters;
    uint32_t lastFaults = 0;

    while (1) {
        /* Wait on whichever queue (priority or bulk) is ready first.
         * Falls through every 100ms so we re-evaluate the event group. */
        QueueSetMemberHandle_t ready =
            xQueueSelectFromSet(xTelemetryQueueSet, pdMS_TO_TICKS(50));

        if (ready != NULL) {
            TelemetryData_t t;
            if (xQueueReceive((QueueHandle_t)ready, &t, 0) == pdPASS) {
                HandleTelemetrySample(&t);
                /* Drain any remaining items in the same queue before
                 * re-arming the set - avoids backlog. */
                while (xQueueReceive((QueueHandle_t)ready, &t, 0) == pdPASS) {
                    HandleTelemetrySample(&t);
                }
            }
        }

        /* Re-read the event group every loop and react to changes. */
        uint32_t bits = (uint32_t)(xEventGroupGetBits(xSystemEvents) & FAULT_ALL_MASK);
        if (bits != lastFaults) {
            lastFaults = bits;
            StateMachine_ProcessEvent(bits);
            TelemetryServer_SetFaultBits(bits);
            if (bits != 0) {
                /* Notify all emergency dispatchers via the emergency module. */
                EmergencyTasks_Create(bits);
            }
        }

        /* Always publish the latest fault snapshot. */
        TelemetryServer_SetFaultBits(bits);
    }
}

void EventManager_Init(void) {
    configASSERT(xTaskCreate(EventManagerTask,
                             "EventMgr",
                             STACK_SIZE_EVENT_MGR,
                             NULL,
                             PRIO_EVENT_MGR,
                             &s_eventTask) == pdPASS);
}

void EventManager_TriggerFault(uint32_t faultBit) {
    if (xSystemEvents != NULL) {
        xEventGroupSetBits(xSystemEvents, faultBit);
    }
}

void EventManager_ClearFault(uint32_t faultBit) {
    if (xSystemEvents != NULL) {
        xEventGroupClearBits(xSystemEvents, faultBit);
    }
}

TaskHandle_t EventManager_GetTaskHandle(void) {
    return s_eventTask;
}
