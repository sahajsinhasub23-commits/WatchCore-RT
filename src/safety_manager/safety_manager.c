#include "safety_manager.h"
#include "config.h"
#include "ipc_manager.h"
#include "logging.h"
#include "system_state.h"
#include "watchdog.h"
#include "monitoring_tasks.h"
#include "power_model.h"
#include "FreeRTOS.h"
#include "task.h"
#include "event_groups.h"
#include <stdio.h>

/* Non-essential tasks that get suspended in DEGRADED mode to save power. */
static const char *SHEDDABLE[] = { "Diag", "Bench" };
#define SHEDDABLE_COUNT (sizeof(SHEDDABLE) / sizeof(SHEDDABLE[0]))

static bool s_loadShed = false;

static void SetLoadShed(bool shed) {
    if (shed == s_loadShed) return;
    for (size_t i = 0; i < SHEDDABLE_COUNT; i++) {
        TaskHandle_t h = xTaskGetHandle(SHEDDABLE[i]);
        if (h == NULL) continue;
        if (shed) vTaskSuspend(h);
        else      vTaskResume(h);
    }
    s_loadShed = shed;
    Log_Event(shed ? LOG_WARN : LOG_INFO, "SafetyMgr", StateMachine_GetMode(),
              shed ? "LoadShed" : "LoadRestore",
              shed ? "Suspended non-essential tasks to save power"
                   : "Resumed non-essential tasks");
}

/* ============================================================
 * SafetyManager - the supervisory "safety manager" task.
 *
 * The assignment objective frames the OS as
 *   "resource manager + safety manager".
 * This always-on task implements the safety-manager half:
 *   - aggregates resource health (heap, stack, CPU headroom)
 *     and active faults into a single 0..100 safety score
 *   - emits a periodic safety status to the log
 *   - escalates to SAFE_MODE if too many faults are active at
 *     once (multi-fault overload) - a protection action that no
 *     single recovery task would take on its own.
 * ============================================================ */

static TaskHandle_t s_task = NULL;
static volatile uint32_t s_score = 100;
static volatile uint32_t s_escalations = 0;

static uint32_t popcount(uint32_t n) {
    uint32_t c = 0;
    while (n) { c += n & 1u; n >>= 1; }
    return c;
}

static void SafetyManagerTask(void *pvParameters) {
    (void)pvParameters;
    TaskHandle_t self = xTaskGetCurrentTaskHandle();
    TickType_t xLastWake = xTaskGetTickCount();
    uint32_t cycle = 0;

    for (;;) {
        Watchdog_Heartbeat(self);

        uint32_t faults = (xSystemEvents != NULL)
            ? (uint32_t)(xEventGroupGetBits(xSystemEvents) & FAULT_ALL_MASK)
            : 0;
        uint32_t nFaults = popcount(faults);

        uint32_t freeHeap = (uint32_t)xPortGetFreeHeapSize();
        uint32_t minStack = MonitoringTasks_GetMinStack();

        /* Compute a weighted safety score. */
        int32_t score = 100;
        score -= (int32_t)(nFaults * 12);
        if (freeHeap < THRESHOLD_HEAP_MIN)       score -= 25;
        else if (freeHeap < THRESHOLD_HEAP_MIN*2) score -= 10;
        if (minStack && minStack < 24)            score -= 15;
        SystemMode_t mode = StateMachine_GetMode();
        if (mode == SYS_MODE_SAFE_MODE)           score -= 30;
        if (score < 0)   score = 0;
        if (score > 100) score = 100;
        s_score = (uint32_t)score;

        /* Multi-fault overload protection: 3+ simultaneous faults
         * means the recovery tasks can't keep up - escalate. */
        if (nFaults >= 3 && mode != SYS_MODE_SAFE_MODE) {
            Log_Event(LOG_CRITICAL, "SafetyMgr", mode, "Escalate",
                      "Multiple simultaneous faults - escalating to SAFE mode");
            StateMachine_SetMode(SYS_MODE_SAFE_MODE);
            s_escalations++;
        }

        /* Graceful degradation (DEGRADED mode):
         * When the battery is low-ish (below the warn level but not yet a
         * critical fault) and nothing serious is wrong, shed non-essential
         * tasks to save power and run in DEGRADED mode. Restore when the
         * battery comes back up. This uses real hysteresis (two thresholds)
         * so the system does not flap on and off. */
        float battery = PowerModel_GetBattery();
        bool serious = (mode == SYS_MODE_SAFE_MODE) ||
                       (faults & (FAULT_HIGH_TEMP | FAULT_RADIATION | FAULT_LOW_BATTERY |
                                  FAULT_MEMORY_EXHAUSTION | FAULT_TASK_HANG));
        if (!serious) {
            if (!s_loadShed && battery < THRESHOLD_BATT_WARN) {
                SetLoadShed(true);
                StateMachine_SetPowerSaving(true);
                StateMachine_ProcessEvent(faults);   /* re-evaluate -> DEGRADED */
            } else if (s_loadShed && battery > (THRESHOLD_BATT_WARN + 8.0f)) {
                SetLoadShed(false);
                StateMachine_SetPowerSaving(false);
                StateMachine_ProcessEvent(faults);   /* re-evaluate -> NORMAL */
            }
        }

        /* Periodic safety status (every ~6 s). */
        if ((cycle % 3) == 0) {
            char d[96];
            snprintf(d, sizeof(d), "score=%lu faults=%lu heap=%luB minStack=%luw",
                     (unsigned long)s_score, (unsigned long)nFaults,
                     (unsigned long)freeHeap, (unsigned long)minStack);
            Log_Event(LOG_INFO, "SafetyMgr", mode, "Status", d);
        }
        cycle++;

        vTaskDelayUntil(&xLastWake, pdMS_TO_TICKS(2000));
    }
}

void SafetyManager_Init(void) {
    configASSERT(xTaskCreate(SafetyManagerTask, "SafetyMgr",
                             STACK_SIZE_DIAG, NULL,
                             PRIO_WATCHDOG, &s_task) == pdPASS);
}

uint32_t SafetyManager_GetScore(void)       { return s_score; }
uint32_t SafetyManager_GetEscalations(void) { return s_escalations; }
