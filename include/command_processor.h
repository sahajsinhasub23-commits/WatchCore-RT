#ifndef COMMAND_PROCESSOR_H
#define COMMAND_PROCESSOR_H

#include "ipc_manager.h"

void CommandProcessor_Init(void);
void CommandProcessor_Submit(const CommandMessage_t *msg);
TaskHandle_t CommandProcessor_GetTaskHandle(void);

/* Aggregate counters exposed for the diagnostics module. */
uint32_t CommandProcessor_GetTotalAccepted(void);
uint32_t CommandProcessor_GetTotalRejected(void);

#endif /* COMMAND_PROCESSOR_H */
