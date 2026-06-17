#ifndef LOGGING_H
#define LOGGING_H

#include <stdint.h>
#include "config.h"

typedef enum {
    LOG_INFO,
    LOG_WARN,
    LOG_ERROR,
    LOG_CRITICAL
} LogLevel_t;

void Logging_Init(void);
void Log_Event(LogLevel_t level,
               const char *taskName,
               SystemMode_t mode,
               const char *eventType,
               const char *message);

uint32_t Logging_GetCount(LogLevel_t level);

#endif /* LOGGING_H */
