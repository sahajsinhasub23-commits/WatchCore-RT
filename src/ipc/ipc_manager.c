#include "ipc_manager.h"
#include "config.h"

QueueHandle_t         xTelemetryQueue        = NULL;
QueueHandle_t         xSensorPriorityQueue   = NULL;
QueueSetHandle_t      xTelemetryQueueSet     = NULL;

EventGroupHandle_t    xSystemEvents          = NULL;

SemaphoreHandle_t     xI2CMutex              = NULL;
SemaphoreHandle_t     xUARTMutex             = NULL;
SemaphoreHandle_t     xSPIMutex              = NULL;
SemaphoreHandle_t     xLogMutex              = NULL;
SemaphoreHandle_t     xCommandReadySem       = NULL;
SemaphoreHandle_t     xPowerTokens           = NULL;

StreamBufferHandle_t  xLogStream             = NULL;
MessageBufferHandle_t xCommandBuffer         = NULL;

void IPC_Init(void) {
    /* ---- Queues --------------------------------------------------- */
    xTelemetryQueue = xQueueCreate(TELEMETRY_QUEUE_LEN, sizeof(TelemetryData_t));
    configASSERT(xTelemetryQueue != NULL);
    vQueueAddToRegistry(xTelemetryQueue, "TelemetryQ");

    /* A dedicated short queue for highest-priority sensor samples. */
    xSensorPriorityQueue = xQueueCreate(4, sizeof(TelemetryData_t));
    configASSERT(xSensorPriorityQueue != NULL);
    vQueueAddToRegistry(xSensorPriorityQueue, "PrioSensQ");

    /* Combine both queues into a single set so the event manager can
     * wait on whichever is ready first. */
    xTelemetryQueueSet = xQueueCreateSet(TELEMETRY_QUEUE_LEN + 4);
    configASSERT(xTelemetryQueueSet != NULL);
    configASSERT(xQueueAddToSet(xTelemetryQueue,      xTelemetryQueueSet) == pdPASS);
    configASSERT(xQueueAddToSet(xSensorPriorityQueue, xTelemetryQueueSet) == pdPASS);

    /* ---- Event group --------------------------------------------- */
    xSystemEvents = xEventGroupCreate();
    configASSERT(xSystemEvents != NULL);

    /* ---- Mutexes / semaphores ------------------------------------ */
    xI2CMutex  = xSemaphoreCreateMutex();
    xUARTMutex = xSemaphoreCreateMutex();
    xSPIMutex  = xSemaphoreCreateMutex();
    configASSERT(xI2CMutex  != NULL);
    configASSERT(xUARTMutex != NULL);
    configASSERT(xSPIMutex  != NULL);

    /* Recursive mutex protects the logging path which can be re-entered
     * (Log_Event -> stream broadcast -> Log_Event on socket failure). */
    xLogMutex = xSemaphoreCreateRecursiveMutex();
    configASSERT(xLogMutex != NULL);

    /* Binary semaphore signals "a command is in the buffer". */
    xCommandReadySem = xSemaphoreCreateBinary();
    configASSERT(xCommandReadySem != NULL);

    /* Counting semaphore tracks how many high-power subsystems may
     * run simultaneously (radio, heater, propulsion sim, etc.). */
    xPowerTokens = xSemaphoreCreateCounting(POWER_TOKEN_COUNT, POWER_TOKEN_COUNT);
    configASSERT(xPowerTokens != NULL);

    /* ---- Stream / message buffers -------------------------------- */
    /* Stream buffer: bulk log bytes pushed by tasks, drained by data_logger. */
    xLogStream = xStreamBufferCreate(LOG_STREAM_BYTES, 1);
    configASSERT(xLogStream != NULL);

    /* Message buffer: discrete command frames from the HTTP server. */
    xCommandBuffer = xMessageBufferCreate(COMMAND_BUFFER_BYTES);
    configASSERT(xCommandBuffer != NULL);
}
