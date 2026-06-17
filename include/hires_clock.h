#ifndef HIRES_CLOCK_H
#define HIRES_CLOCK_H

#include <stdint.h>

/* ------------------------------------------------------------------
 * High-resolution monotonic clock.
 *
 * On the Windows simulator this is backed by QueryPerformanceCounter,
 * which has sub-microsecond resolution. This lets the benchmark suite
 * report REAL microsecond latencies instead of 0 (the millisecond
 * FreeRTOS tick is far too coarse to time a queue or mutex op).
 *
 * It also feeds the FreeRTOS run-time-stats counter, so % CPU usage is
 * computed from a true high-resolution time base.
 * ------------------------------------------------------------------ */

void     HiresClock_Init(void);
uint64_t HiresClock_Micros(void);   /* microseconds since init */

#endif /* HIRES_CLOCK_H */
