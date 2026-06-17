#ifndef TELEMETRY_SERVER_H
#define TELEMETRY_SERVER_H

#include "FreeRTOS.h"
#include "ipc_manager.h"
#include <stdint.h>
#include <stdbool.h>

/* Initialize the telemetry server and spawn the background HTTP/SSE task */
void TelemetryServer_Init(void);

/* Queue a log string for streaming to active dashboard clients */
void TelemetryServer_QueueLog(const char* logMsg);

/* Update the live dashboard snapshot from telemetry consumed by the event manager */
void TelemetryServer_UpdateTelemetrySnapshot(const TelemetryData_t* telemetry);

/* Publish the latest active fault bitmask for the dashboard */
void TelemetryServer_SetFaultBits(uint32_t faultBits);

/* Publish current simulated bus ownership for the dashboard */
void TelemetryServer_SetBusState(const char* busName, bool locked);

/* Increment telemetry counters */
void TelemetryServer_IncrementIPCTraffic(void);

/* Override the HTTP listen port and the craft id stamped into every SSE frame.
 * Must be called before TelemetryServer_Init(). */
void TelemetryServer_SetIdentity(int port, const char *craftId);

#endif /* TELEMETRY_SERVER_H */
