#ifndef BENCHMARKS_H
#define BENCHMARKS_H

#include <stdint.h>

void Benchmarks_Init(void);

typedef struct {
    uint32_t lastQueueRoundtripUs;
    uint32_t lastMutexLatencyUs;
    uint32_t lastNotifyLatencyUs;
    uint32_t lastContextSwitchUs;
    uint32_t lastTimerJitterUs;
    uint32_t lastMemAllocUs;
    uint32_t totalRuns;
} BenchmarkResult_t;

void Benchmarks_GetLatest(BenchmarkResult_t *out);

/* Operator-driven on-demand actions used by the dashboard:
 *  - suspend / resume a specific task by name
 *  - inject a "priority inversion" demo
 *  - run a one-shot quick benchmark and return immediately
 */
void Benchmarks_SuspendTask(const char *taskName);
void Benchmarks_ResumeTask(const char *taskName);
void Benchmarks_TriggerOneShot(void);

#endif /* BENCHMARKS_H */
