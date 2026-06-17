#ifndef SAFETY_MANAGER_H
#define SAFETY_MANAGER_H

#include <stdint.h>

void SafetyManager_Init(void);

/* Aggregate safety score 0..100 (resource + fault weighted). */
uint32_t SafetyManager_GetScore(void);

/* Number of escalations the safety manager has performed. */
uint32_t SafetyManager_GetEscalations(void);

#endif /* SAFETY_MANAGER_H */
