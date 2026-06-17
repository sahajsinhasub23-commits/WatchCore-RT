#ifndef DIAGNOSTICS_H
#define DIAGNOSTICS_H

#include <stdint.h>
#include <stddef.h>

void Diagnostics_Init(void);

/* Snapshot helpers used by the telemetry server. The text buffer is
 * filled with the latest vTaskList / vTaskGetRunTimeStats output and
 * must be at least DIAG_TEXT_BUFFER_BYTES wide. */
#define DIAG_TEXT_BUFFER_BYTES 2048

size_t   Diagnostics_GetTaskList(char *outBuf, size_t outLen);
size_t   Diagnostics_GetRunTimeStats(char *outBuf, size_t outLen);
uint32_t Diagnostics_GetMinFreeHeap(void);
uint32_t Diagnostics_GetTotalTaskSwitches(void);

/* Allow the command processor to trigger an immediate snapshot. */
void Diagnostics_RequestSnapshot(void);

#endif /* DIAGNOSTICS_H */
