#ifndef SYSTEM_STATE_H
#define SYSTEM_STATE_H

#include <stdbool.h>
#include "config.h"

void StateMachine_Init(void);
void StateMachine_SetMode(SystemMode_t new_mode);
SystemMode_t StateMachine_GetMode(void);
void StateMachine_ProcessEvent(uint32_t eventBits);
void StateMachine_SetPowerSaving(bool on);

#endif // SYSTEM_STATE_H
