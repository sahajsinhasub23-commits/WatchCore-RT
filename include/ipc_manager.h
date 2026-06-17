#ifndef IPC_MANAGER_H
#define IPC_MANAGER_H

#include "FreeRTOS.h"
#include "queue.h"
#include "event_groups.h"
#include "semphr.h"
#include "stream_buffer.h"
#include "message_buffer.h"

/* ---------------------------------------------------------------
 * Telemetry payload that flows through xTelemetryQueue
 * ------------------------------------------------------------- */
typedef enum {
    TELEMETRY_TYPE_CPU = 0,
    TELEMETRY_TYPE_HEAP,
    TELEMETRY_TYPE_SENSORS
} TelemetryType_t;

typedef struct {
    TelemetryType_t type;
    union {
        float cpuUsage;
        uint32_t freeHeap;
        struct {
            float temperature;   /* deg C  */
            float radiation;     /* rad    */
            float batteryLevel;  /* %      */
            float solarCurrent;  /* A      */
            float attitudeRate;  /* deg/s  */
            float pressure;      /* kPa    */
            float commSignal;    /* dBm    */
        } sensors;
    } data;
} TelemetryData_t;

/* ---------------------------------------------------------------
 * Command payload that flows through xCommandBuffer
 * (filled by the HTTP server, drained by command_processor)
 * ------------------------------------------------------------- */
typedef enum {
    CMD_NONE = 0,
    CMD_SET_FAULT,
    CMD_CLEAR_FAULT,
    CMD_REQUEST_DIAGNOSTICS,
    CMD_SET_MODE,
    CMD_PING
} CommandId_t;

typedef struct {
    CommandId_t  id;
    uint32_t     arg32;            /* fault bit / mode value */
    char         label[32];        /* human-readable tag */
} CommandMessage_t;

/* ---------------------------------------------------------------
 * Global IPC handles, created by IPC_Init()
 * ------------------------------------------------------------- */
extern QueueHandle_t         xTelemetryQueue;
extern QueueHandle_t         xSensorPriorityQueue;
extern QueueSetHandle_t      xTelemetryQueueSet;

extern EventGroupHandle_t    xSystemEvents;

extern SemaphoreHandle_t     xI2CMutex;
extern SemaphoreHandle_t     xUARTMutex;
extern SemaphoreHandle_t     xSPIMutex;
extern SemaphoreHandle_t     xLogMutex;             /* recursive */
extern SemaphoreHandle_t     xCommandReadySem;      /* binary */
extern SemaphoreHandle_t     xPowerTokens;          /* counting */

extern StreamBufferHandle_t  xLogStream;
extern MessageBufferHandle_t xCommandBuffer;

void IPC_Init(void);

#endif /* IPC_MANAGER_H */
