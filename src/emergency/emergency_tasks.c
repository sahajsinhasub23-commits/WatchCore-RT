#include "emergency_tasks.h"
#include "config.h"
#include "FreeRTOS.h"
#include "task.h"
#include "logging.h"
#include "event_manager.h"
#include "system_state.h"
#include "telemetry_server.h"
#include "power_manager.h"
#include <stdint.h>
#include <stdio.h>
#include <string.h>

/* ============================================================
 * Table-driven dynamic recovery tasks.
 *
 * Every recoverable fault has a descriptor below. When the event
 * manager reports the fault, EmergencyTasks_Create() spawns a
 * single high-priority recovery task for it. The task follows the
 * assignment's required lifecycle:
 *   1. wait for go-signal (task notification)
 *   2. raise priority while mitigating
 *   3. hold a power token (counting semaphore)
 *   4. drive the relevant bus + simulate the mitigation
 *   5. DOWN-PRIORITIZE on return to normal (per spec)
 *   6. RETAIN a state-history snapshot before deletion (per spec)
 *   7. clear the fault and self-delete
 * ============================================================ */

#define EMRG_NOTIFY_INDEX 0
#define EMRG_NOTIFY_GO    ( 1UL << 0 )

typedef struct {
    uint32_t     faultBit;
    const char  *name;
    const char  *busName;
    uint32_t     durationMs;
    const char  *startMsg;
    const char  *doneMsg;
    const char  *logTag;
    TaskHandle_t handle;    /* non-NULL while a recovery is in flight */
} RecoverySpec_t;

/* Mitigation durations kept short so the system tackles faults quickly
 * and the recovery is snappy to watch on the dashboard. */
static RecoverySpec_t s_recoveries[] = {
    { FAULT_HIGH_TEMP,         "TempRec",  "spi",  1000, "High temperature recovery engaged", "Temperature stabilized",        "EmergTemp",  NULL },
    { FAULT_LOW_BATTERY,       "BattRec",  "i2c",   800, "Low battery recovery engaged",      "Load shedding complete",        "EmergBatt",  NULL },
    { FAULT_RADIATION,         "RadRec",   "uart",  900, "Radiation recovery engaged",        "Radiation shielding active",    "EmergRad",   NULL },
    { FAULT_SOLAR_LOW,         "SolarRec", "i2c",   800, "Solar power recovery engaged",      "Switched to battery bus",       "EmergSolar", NULL },
    { FAULT_ATTITUDE,          "AttRec",   "spi",  1100, "Attitude control engaged",          "Spacecraft re-stabilized",      "EmergAtt",   NULL },
    { FAULT_PRESSURE,          "PresRec",  "i2c",   850, "Pressure isolation engaged",        "Propellant line isolated",      "EmergPres",  NULL },
    { FAULT_MEMORY_EXHAUSTION, "MemRec",   "uart",  650, "Low-memory cleanup engaged",        "Non-critical caches freed",     "EmergMem",   NULL },
    { FAULT_COMM_TIMEOUT,      "CommRec",  "uart", 1000, "Comm-link recovery engaged",        "Downlink re-acquired",          "EmergComm",  NULL },
};
#define RECOVERY_COUNT ( sizeof(s_recoveries) / sizeof(s_recoveries[0]) )

static volatile uint32_t s_recoveryCount = 0;

/* "State history / data retention" required before task deletion: capture a
 * compact snapshot of what the recovery accomplished and log it so it is
 * retained in the system log + backend timeline. */
static void RetainStateSnapshot(const RecoverySpec_t *r, UBaseType_t origPrio) {
    char snap[96];
    snprintf(snap, sizeof(snap),
             "retained: fault=0x%lX dur=%lums prio %lu->%d",
             (unsigned long)r->faultBit,
             (unsigned long)r->durationMs,
             (unsigned long)origPrio,
             (int)PRIO_MONITOR);
    Log_Event(LOG_INFO, r->logTag, StateMachine_GetMode(), "Retained", snap);
}

static void GenericRecoveryTask(void *pvParameters) {
    int idx = (int)(intptr_t)pvParameters;
    RecoverySpec_t *r = &s_recoveries[idx];

    /* 1. wait for explicit go-signal */
    (void)ulTaskNotifyTakeIndexed(EMRG_NOTIFY_INDEX, pdTRUE, pdMS_TO_TICKS(500));

    Log_Event(LOG_WARN, r->logTag, StateMachine_GetMode(), "Start", r->startMsg);

    /* 2. raise priority while we mitigate */
    UBaseType_t origPrio = uxTaskPriorityGet(NULL);
    vTaskPrioritySet(NULL, PRIO_HIGHEST);

    /* 3. hold a power token */
    bool gotPower = PowerManager_Acquire(2000);

    /* 4. drive the bus + simulate the mitigation work */
    TelemetryServer_SetBusState(r->busName, true);
    vTaskDelay(pdMS_TO_TICKS(r->durationMs));
    TelemetryServer_SetBusState(r->busName, false);

    if (gotPower) PowerManager_Release();

    /* 5. DOWN-PRIORITIZE on return to normal (assignment requirement) */
    vTaskPrioritySet(NULL, PRIO_MONITOR);

    Log_Event(LOG_INFO, r->logTag, StateMachine_GetMode(), "Complete", r->doneMsg);

    /* 6. RETAIN state history before deletion (assignment requirement) */
    RetainStateSnapshot(r, origPrio);

    /* 7. clear fault + self-delete */
    s_recoveryCount++;
    r->handle = NULL;
    EventManager_ClearFault(r->faultBit);
    vTaskDelete(NULL);
}

void EmergencyTasks_Init(void) {
    /* Recovery tasks are spawned on demand; nothing persistent here. */
}

void EmergencyTasks_Create(uint32_t faultBits) {
    for (int i = 0; i < (int)RECOVERY_COUNT; i++) {
        RecoverySpec_t *r = &s_recoveries[i];
        if ((faultBits & r->faultBit) && (r->handle == NULL)) {
            if (xTaskCreate(GenericRecoveryTask, r->name,
                            STACK_SIZE_EMERGENCY, (void *)(intptr_t)i,
                            PRIO_EMERGENCY, &r->handle) == pdPASS) {
                xTaskNotifyIndexed(r->handle, EMRG_NOTIFY_INDEX,
                                   EMRG_NOTIFY_GO, eSetBits);
            }
        }
    }
}

uint32_t EmergencyTasks_GetRecoveryCount(void) { return s_recoveryCount; }
