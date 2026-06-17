#include "system_state.h"
#include "logging.h"
#include "FreeRTOS.h"
#include "task.h"

static SystemMode_t currentMode  = SYS_MODE_NORMAL;
static volatile bool s_powerSaving = false;   /* request DEGRADED when no faults */

void StateMachine_Init(void) {
    currentMode = SYS_MODE_NORMAL;
    s_powerSaving = false;
    Log_Event(LOG_INFO, "System", currentMode, "Init", "State machine initialized");
}

void StateMachine_SetMode(SystemMode_t new_mode) {
    if (currentMode != new_mode) {
        currentMode = new_mode;
        Log_Event(LOG_INFO, "System", currentMode, "StateChange", "System mode changed");
    }
}

SystemMode_t StateMachine_GetMode(void) {
    return currentMode;
}

/* The safety manager turns this on when the battery is low-ish, so the
 * system enters DEGRADED (power-saving) mode instead of plain NORMAL. */
void StateMachine_SetPowerSaving(bool on) {
    s_powerSaving = on;
}

void StateMachine_ProcessEvent(uint32_t eventBits) {
    /* Pick the most serious applicable mode. */
    if (eventBits & (FAULT_DEADLOCK | FAULT_TASK_HANG)) {
        StateMachine_SetMode(SYS_MODE_SAFE_MODE);
    } else if (eventBits & (FAULT_HIGH_TEMP | FAULT_RADIATION | FAULT_LOW_BATTERY |
                            FAULT_COMM_TIMEOUT | FAULT_SOLAR_LOW | FAULT_ATTITUDE |
                            FAULT_PRESSURE | FAULT_MEMORY_EXHAUSTION)) {
        StateMachine_SetMode(SYS_MODE_EMERGENCY);
    } else if (eventBits != FAULT_NONE) {
        StateMachine_SetMode(SYS_MODE_WARNING);
    } else if (s_powerSaving) {
        /* No faults, but battery is low: run in reduced-capability mode. */
        StateMachine_SetMode(SYS_MODE_DEGRADED);
    } else {
        StateMachine_SetMode(SYS_MODE_NORMAL);
    }
}
