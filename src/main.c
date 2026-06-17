#include "FreeRTOS.h"
#include "task.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
    #ifndef WIN32_LEAN_AND_MEAN
        #define WIN32_LEAN_AND_MEAN
    #endif
    #include <windows.h>
#endif

#include "config.h"
#include "ipc_manager.h"
#include "logging.h"
#include "system_state.h"
#include "watchdog.h"
#include "event_manager.h"
#include "monitoring_tasks.h"
#include "fault_injection.h"
#include "telemetry_server.h"
#include "command_processor.h"
#include "diagnostics.h"
#include "power_manager.h"
#include "data_logger.h"
#include "emergency_tasks.h"
#include "benchmarks.h"
#include "safety_manager.h"
#include "hires_clock.h"
#include "power_model.h"
#include "flight_recorder.h"

/* ============================================================
 * FreeRTOS application hooks
 * ============================================================ */
void vApplicationMallocFailedHook(void) {
    Log_Event(LOG_CRITICAL, "OS", StateMachine_GetMode(),
              "SysError", "Malloc Failed");
    taskDISABLE_INTERRUPTS();
    for (;;);
}

void vApplicationStackOverflowHook(TaskHandle_t pxTask, char *pcTaskName) {
    (void)pxTask;
    (void)pcTaskName;
    Log_Event(LOG_CRITICAL, "OS", StateMachine_GetMode(),
              "SysError", "Stack Overflow");
    taskDISABLE_INTERRUPTS();
    for (;;);
}

void vApplicationIdleHook(void) {
#ifdef _WIN32
    Sleep(0);   /* Yield to other host threads in the MSVC simulator. */
#endif
}

void vApplicationTickHook(void) {
    /* Reserved for future cycle counters. */
}

/* For configSUPPORT_STATIC_ALLOCATION = 1 we must provide buffers for
 * the idle and timer service tasks. */
void vApplicationGetIdleTaskMemory(StaticTask_t **ppxIdleTaskTCBBuffer,
                                   StackType_t  **ppxIdleTaskStackBuffer,
                                   uint32_t      *pulIdleTaskStackSize) {
    static StaticTask_t xIdleTCB;
    static StackType_t  xIdleStack[configMINIMAL_STACK_SIZE];
    *ppxIdleTaskTCBBuffer  = &xIdleTCB;
    *ppxIdleTaskStackBuffer = xIdleStack;
    *pulIdleTaskStackSize  = configMINIMAL_STACK_SIZE;
}

void vApplicationGetTimerTaskMemory(StaticTask_t **ppxTimerTaskTCBBuffer,
                                    StackType_t  **ppxTimerTaskStackBuffer,
                                    uint32_t      *pulTimerTaskStackSize) {
    static StaticTask_t xTimerTCB;
    static StackType_t  xTimerStack[configTIMER_TASK_STACK_DEPTH];
    *ppxTimerTaskTCBBuffer  = &xTimerTCB;
    *ppxTimerTaskStackBuffer = xTimerStack;
    *pulTimerTaskStackSize  = configTIMER_TASK_STACK_DEPTH;
}

/* ============================================================
 * Run-time stats counter (used by uxTaskGetSystemState /
 * vTaskGetRunTimeStats). We piggy-back on the FreeRTOS tick;
 * with a higher resolution this would normally be a hardware
 * timer.
 * ============================================================ */
void vConfigureTimerForRunTimeStats(void) {
    HiresClock_Init();
}

unsigned long ulGetRunTimeCounterValue(void) {
    /* True high-resolution time base (QueryPerformanceCounter on Windows).
     * Used by uxTaskGetSystemState/vTaskGetRunTimeStats for honest % CPU. */
    return (unsigned long)HiresClock_Micros();
}

/* ============================================================
 * Entry point
 * ============================================================ */
int main(int argc, char **argv) {
    setvbuf(stdout, NULL, _IONBF, 0);

    /* Resolve port & craft id.
     *   priority: argv[1] / argv[2]  >  WATCHCORE_PORT / WATCHCORE_CRAFT env  >  defaults
     */
    int port = 8080;
    const char *craft = "SC-01";

    if (argc >= 2 && argv[1] && *argv[1]) {
        int p = atoi(argv[1]);
        if (p > 0 && p < 65536) port = p;
    } else {
        const char *envPort = getenv("WATCHCORE_PORT");
        if (envPort) {
            int p = atoi(envPort);
            if (p > 0 && p < 65536) port = p;
        }
    }
    if (argc >= 3 && argv[2] && *argv[2]) {
        craft = argv[2];
    } else {
        const char *envCraft = getenv("WATCHCORE_CRAFT");
        if (envCraft && *envCraft) craft = envCraft;
    }

    printf("\n============================================================\n");
    printf("  %s v%s starting [craft=%s, port=%d]\n",
           WATCHCORE_BUILD_TARGET, WATCHCORE_VERSION, craft, port);
    printf("============================================================\n");

    HiresClock_Init();
    StateMachine_Init();
    IPC_Init();
    Logging_Init();
    FlightRecorder_Init();
    PowerModel_Init();

    TelemetryServer_SetIdentity(port, craft);
    TelemetryServer_Init();
    Watchdog_Init();
    PowerManager_Init();
    Diagnostics_Init();
    DataLogger_Init();
    CommandProcessor_Init();
    EmergencyTasks_Init();
    EventManager_Init();
    MonitoringTasks_Init();
    SafetyManager_Init();
    Benchmarks_Init();
    FaultInjection_Init();

    Log_Event(LOG_INFO, "Main", StateMachine_GetMode(),
              "Startup", "Starting FreeRTOS scheduler");

    vTaskStartScheduler();

    /* Should never reach here unless the scheduler returned. */
    for (;;);
    return 0;
}
