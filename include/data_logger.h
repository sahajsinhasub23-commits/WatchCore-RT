#ifndef DATA_LOGGER_H
#define DATA_LOGGER_H

#include <stddef.h>
#include <stdint.h>

void DataLogger_Init(void);

/* Push bytes into the kernel stream buffer for the logger task. */
size_t   DataLogger_Submit(const char *bytes, size_t len);
uint32_t DataLogger_GetBytesProcessed(void);
uint32_t DataLogger_GetBytesDropped(void);

#endif /* DATA_LOGGER_H */
