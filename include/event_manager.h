#ifndef EVENT_MANAGER_H
#define EVENT_MANAGER_H

#include <stdint.h>
#include "FreeRTOS.h"
#include "task.h"

void EventManager_Init(void);
void EventManager_TriggerFault(uint32_t faultBit);
void EventManager_ClearFault(uint32_t faultBit);
TaskHandle_t EventManager_GetTaskHandle(void);

#endif /* EVENT_MANAGER_H */
