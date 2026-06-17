#ifndef POWER_MANAGER_H
#define POWER_MANAGER_H

#include <stdbool.h>
#include <stdint.h>

void PowerManager_Init(void);

/* Acquire / release power tokens (counting semaphore). */
bool PowerManager_Acquire(uint32_t timeoutMs);
void PowerManager_Release(void);

/* Tokens currently free (0..POWER_TOKEN_COUNT). */
uint32_t PowerManager_GetFreeTokens(void);

#endif /* POWER_MANAGER_H */
