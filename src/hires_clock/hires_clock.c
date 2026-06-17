#include "hires_clock.h"

#ifdef _WIN32
  #ifndef WIN32_LEAN_AND_MEAN
    #define WIN32_LEAN_AND_MEAN
  #endif
  #include <windows.h>

static LARGE_INTEGER s_freq;
static LARGE_INTEGER s_start;
static int s_ready = 0;

void HiresClock_Init(void) {
    QueryPerformanceFrequency(&s_freq);
    QueryPerformanceCounter(&s_start);
    s_ready = 1;
}

uint64_t HiresClock_Micros(void) {
    if (!s_ready) HiresClock_Init();
    LARGE_INTEGER now;
    QueryPerformanceCounter(&now);
    /* (ticks * 1e6) / frequency, done carefully to avoid overflow. */
    uint64_t delta = (uint64_t)(now.QuadPart - s_start.QuadPart);
    return (delta * 1000000ULL) / (uint64_t)s_freq.QuadPart;
}

#else  /* portable fallback (e.g. QEMU/ARM) */
  #include "FreeRTOS.h"
  #include "task.h"

void HiresClock_Init(void) { }

uint64_t HiresClock_Micros(void) {
    /* 1 ms tick resolution fallback. */
    return (uint64_t)xTaskGetTickCount() * 1000ULL;
}
#endif
