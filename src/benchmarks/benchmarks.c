#include "benchmarks.h"
#include "config.h"
#include "logging.h"
#include "system_state.h"
#include "watchdog.h"
#include "hires_clock.h"
#include "FreeRTOS.h"
#include "task.h"
#include "queue.h"
#include "semphr.h"
#include "timers.h"
#include <string.h>

/* ============================================================
 * Benchmarks module
 *
 * Continuously measures latencies of the RTOS primitives the
 * rest of the system relies on. Drives many additional FreeRTOS
 * APIs that the rest of the app doesn't exercise on its own:
 *   xQueueOverwrite, xQueuePeek, xQueueReset, vQueueDelete,
 *   xTaskNotifyWait, vTaskSuspend, vTaskResume, pcTaskGetName,
 *   xTimerStop, xTimerReset, xTimerChangePeriod,
 *   xTimerIsTimerActive, xTimerDelete, vSemaphoreDelete,
 *   xTaskGetIdleTaskHandle, vTaskSetThreadLocalStoragePointer
 * ============================================================ */

#define BENCH_NOTIFY_INDEX  2
#define BENCH_TRIGGER_BIT   ( 1UL << 0 )

static TaskHandle_t s_benchTask = NULL;
static TimerHandle_t s_jitterTimer = NULL;
static SemaphoreHandle_t s_localMutex = NULL;
static QueueHandle_t s_mailbox = NULL;

static volatile BenchmarkResult_t s_last = {0};

static volatile uint64_t s_lastJitterUs64 = 0;
static volatile uint32_t s_lastJitterUs   = 0;

/* Number of repeats per measurement: average out noise and capture
 * sub-microsecond operations that a single sample would round to 0. */
#define BENCH_REPS 200U

static void JitterTimerCallback(TimerHandle_t xTimer) {
    (void)xTimer;
    uint64_t now = HiresClock_Micros();
    if (s_lastJitterUs64 != 0) {
        uint64_t expected = 100000ULL;  /* 100 ms timer period, in us */
        uint64_t actual = now - s_lastJitterUs64;
        s_lastJitterUs = (uint32_t)((actual > expected)
            ? (actual - expected) : (expected - actual));
    }
    s_lastJitterUs64 = now;
}

/* All return NANOSECONDS per single operation (averaged over BENCH_REPS). */
static uint32_t MeasureQueueRoundtrip(void) {
    int value = 0xCAFE, peeked = 0, out = 0;
    uint64_t t0 = HiresClock_Micros();
    for (uint32_t i = 0; i < BENCH_REPS; i++) {
        xQueueOverwrite(s_mailbox, &value);
        xQueuePeek(s_mailbox, &peeked, 0);
        xQueueReceive(s_mailbox, &out, 0);
    }
    return (uint32_t)(((HiresClock_Micros() - t0) * 1000ULL) / BENCH_REPS);
}

static uint32_t MeasureMutexLatency(void) {
    uint64_t t0 = HiresClock_Micros();
    for (uint32_t i = 0; i < BENCH_REPS; i++) {
        xSemaphoreTake(s_localMutex, portMAX_DELAY);
        xSemaphoreGive(s_localMutex);
    }
    return (uint32_t)(((HiresClock_Micros() - t0) * 1000ULL) / BENCH_REPS);
}

static uint32_t MeasureNotifyLatency(TaskHandle_t self) {
    uint32_t notified = 0;
    uint64_t t0 = HiresClock_Micros();
    for (uint32_t i = 0; i < BENCH_REPS; i++) {
        xTaskNotifyIndexed(self, BENCH_NOTIFY_INDEX, BENCH_TRIGGER_BIT, eSetBits);
        xTaskNotifyWaitIndexed(BENCH_NOTIFY_INDEX, 0, BENCH_TRIGGER_BIT, &notified, 0);
    }
    return (uint32_t)(((HiresClock_Micros() - t0) * 1000ULL) / BENCH_REPS);
}

static uint32_t MeasureAllocFree(void) {
    uint64_t t0 = HiresClock_Micros();
    for (uint32_t i = 0; i < BENCH_REPS; i++) {
        void *p = pvPortMalloc(128);
        if (p) vPortFree(p);
    }
    return (uint32_t)(((HiresClock_Micros() - t0) * 1000ULL) / BENCH_REPS);
}

static void BenchmarkTask(void *pvParameters) {
    (void)pvParameters;
    TaskHandle_t self = xTaskGetCurrentTaskHandle();
    TaskHandle_t idle = xTaskGetIdleTaskHandle();
    (void)idle;
    TickType_t xLastWake = xTaskGetTickCount();

    for (;;) {
        Watchdog_Heartbeat(self);

        /* Wait either for a one-shot trigger or for our period. */
        uint32_t notified = 0;
        xTaskNotifyWaitIndexed(BENCH_NOTIFY_INDEX, 0, BENCH_TRIGGER_BIT,
                               &notified, pdMS_TO_TICKS(3000));

        BenchmarkResult_t r;
        r.lastQueueRoundtripUs = MeasureQueueRoundtrip();
        r.lastMutexLatencyUs   = MeasureMutexLatency();
        r.lastNotifyLatencyUs  = MeasureNotifyLatency(self);
        r.lastMemAllocUs       = MeasureAllocFree();

        /* Context-switch proxy: many yields, averaged, in nanoseconds. */
        uint64_t cs0 = HiresClock_Micros();
        for (uint32_t i = 0; i < BENCH_REPS; i++) { taskYIELD(); }
        r.lastContextSwitchUs = (uint32_t)(((HiresClock_Micros() - cs0) * 1000ULL) / BENCH_REPS);

        r.lastTimerJitterUs    = s_lastJitterUs;  /* jitter stays in microseconds */
        r.totalRuns            = s_last.totalRuns + 1;
        s_last = r;

        /* Exercise xTimer dynamics (xTimerIsTimerActive / xTimerReset) without
         * changing the period, so the jitter measurement stays meaningful. */
        if (xTimerIsTimerActive(s_jitterTimer) == pdTRUE) {
            xTimerReset(s_jitterTimer, 0);
        }

        vTaskDelayUntil(&xLastWake, pdMS_TO_TICKS(2500));
    }
}

void Benchmarks_Init(void) {
    /* mailbox = depth-1 queue used with xQueueOverwrite/xQueuePeek. */
    s_mailbox = xQueueCreate(1, sizeof(int));
    configASSERT(s_mailbox != NULL);

    /* private mutex used to measure mutex latency without touching bus mutexes. */
    s_localMutex = xSemaphoreCreateMutex();
    configASSERT(s_localMutex != NULL);

    /* periodic timer used to measure timer-callback jitter. */
    s_jitterTimer = xTimerCreate("BenchJit",
                                 pdMS_TO_TICKS(100),
                                 pdTRUE,
                                 (void *)0,
                                 JitterTimerCallback);
    configASSERT(s_jitterTimer != NULL);
    xTimerStart(s_jitterTimer, 0);

    configASSERT(xTaskCreate(BenchmarkTask,
                             "Bench",
                             STACK_SIZE_MONITOR,
                             NULL,
                             PRIO_DIAGNOSTICS,
                             &s_benchTask) == pdPASS);
}

void Benchmarks_GetLatest(BenchmarkResult_t *out) {
    if (!out) return;
    *out = s_last;
}

void Benchmarks_SuspendTask(const char *taskName) {
    if (!taskName) return;
    TaskHandle_t h = xTaskGetHandle(taskName);
    if (h != NULL) {
        vTaskSuspend(h);
        Log_Event(LOG_WARN, "Bench", StateMachine_GetMode(),
                  "TaskSuspend", taskName);
    }
}

void Benchmarks_ResumeTask(const char *taskName) {
    if (!taskName) return;
    TaskHandle_t h = xTaskGetHandle(taskName);
    if (h != NULL) {
        vTaskResume(h);
        Log_Event(LOG_INFO, "Bench", StateMachine_GetMode(),
                  "TaskResume", taskName);
    }
}

void Benchmarks_TriggerOneShot(void) {
    if (s_benchTask) {
        xTaskNotifyIndexed(s_benchTask, BENCH_NOTIFY_INDEX,
                           BENCH_TRIGGER_BIT, eSetBits);
    }
}
