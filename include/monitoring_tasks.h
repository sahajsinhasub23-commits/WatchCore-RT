#ifndef MONITORING_TASKS_H
#define MONITORING_TASKS_H

#include <stdint.h>

void MonitoringTasks_Init(void);

/* Exposed entries used by the watchdog restart specs. */
void MonitoringTasks_CpuEntry(void *pvParameters);
void MonitoringTasks_HeapEntry(void *pvParameters);
void MonitoringTasks_StackEntry(void *pvParameters);
void MonitoringTasks_SensorEntry(void *pvParameters);
void MonitoringTasks_CommWatchEntry(void *pvParameters);

/* Latest comm-signal reading (dBm), used by the comm detection task. */
float MonitoringTasks_GetLatestComm(void);

/* Worst-case stack headroom across all tasks (words). */
uint32_t MonitoringTasks_GetMinStack(void);

/* Latest CPU usage reading (%), used by the power model. */
float MonitoringTasks_GetLatestCpu(void);

#endif /* MONITORING_TASKS_H */
