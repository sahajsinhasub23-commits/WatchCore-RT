#ifndef EMERGENCY_TASKS_H
#define EMERGENCY_TASKS_H

#include <stdint.h>

void EmergencyTasks_Init(void);
void EmergencyTasks_Create(uint32_t faultBits);

/* Diagnostic counters. */
uint32_t EmergencyTasks_GetRecoveryCount(void);

#endif /* EMERGENCY_TASKS_H */
