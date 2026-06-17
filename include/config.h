#ifndef CONFIG_H
#define CONFIG_H

#include <stdint.h>
#include <stdbool.h>

/* ---------------------------------------------------------------
 * System operating modes (state machine outputs)
 * ------------------------------------------------------------- */
typedef enum {
    SYS_MODE_NORMAL = 0,
    SYS_MODE_WARNING,
    SYS_MODE_DEGRADED,
    SYS_MODE_EMERGENCY,
    SYS_MODE_SAFE_MODE,
    SYS_MODE_RECOVERY
} SystemMode_t;

/* ---------------------------------------------------------------
 * Fault bitmask used inside the system EventGroup
 * ------------------------------------------------------------- */
#define FAULT_NONE              (0)
#define FAULT_HIGH_TEMP         (1 << 0)
#define FAULT_RADIATION         (1 << 1)
#define FAULT_LOW_BATTERY       (1 << 2)
#define FAULT_MEMORY_EXHAUSTION (1 << 3)
#define FAULT_COMM_TIMEOUT      (1 << 4)
#define FAULT_TASK_HANG         (1 << 5)
#define FAULT_QUEUE_OVERFLOW    (1 << 6)
#define FAULT_DEADLOCK          (1 << 7)
#define FAULT_SOLAR_LOW         (1 << 8)
#define FAULT_ATTITUDE          (1 << 9)
#define FAULT_PRESSURE          (1 << 10)
#define FAULT_ALL_MASK          (FAULT_HIGH_TEMP | FAULT_RADIATION | FAULT_LOW_BATTERY | \
                                 FAULT_MEMORY_EXHAUSTION | FAULT_COMM_TIMEOUT | FAULT_TASK_HANG | \
                                 FAULT_QUEUE_OVERFLOW | FAULT_DEADLOCK | \
                                 FAULT_SOLAR_LOW | FAULT_ATTITUDE | FAULT_PRESSURE)

/* ---------------------------------------------------------------
 * Task priorities (configMAX_PRIORITIES = 7)
 * Higher = more important.
 * ------------------------------------------------------------- */
#define PRIO_IDLE           ( 0 )
#define PRIO_MONITOR        ( 1 )
#define PRIO_CONTROL        ( 2 )
#define PRIO_DIAGNOSTICS    ( 2 )
#define PRIO_TELEMETRY      ( 2 )
#define PRIO_EVENT_MGR      ( 3 )
#define PRIO_COMMAND        ( 3 )
#define PRIO_WATCHDOG       ( 4 )
#define PRIO_POWER_MGR      ( 4 )
#define PRIO_EMERGENCY      ( 5 )
#define PRIO_HIGHEST        ( 6 )

/* ---------------------------------------------------------------
 * Task stack sizes (in StackType_t words)
 * ------------------------------------------------------------- */
#define STACK_SIZE_MIN       ( 128 )
#define STACK_SIZE_MONITOR   ( 384 )
#define STACK_SIZE_EVENT_MGR ( 512 )
#define STACK_SIZE_EMERGENCY ( 512 )
#define STACK_SIZE_DIAG      ( 512 )
#define STACK_SIZE_COMMAND   ( 256 )
#define STACK_SIZE_POWER     ( 256 )
#define STACK_SIZE_LOGGER    ( 256 )
#define STACK_SIZE_TELEM     ( 2048 )

/* ---------------------------------------------------------------
 * Physical thresholds for fault detection
 * ------------------------------------------------------------- */
#define THRESHOLD_TEMP_MAX      85.0f
#define THRESHOLD_TEMP_WARN     70.0f
#define THRESHOLD_RAD_MAX       100.0f
#define THRESHOLD_BATT_MIN      15.0f
#define THRESHOLD_BATT_WARN     25.0f
#define THRESHOLD_HEAP_MIN      (1024 * 4)

/* Extended spacecraft sensor thresholds (7-sensor suite) */
#define THRESHOLD_SOLAR_MIN     0.5f    /* amps  - below = eclipse / panel fault */
#define THRESHOLD_ATTITUDE_MAX  10.0f   /* deg/s - above = tumbling */
#define THRESHOLD_PRESSURE_MIN  50.0f   /* kPa   - below = leak */
#define THRESHOLD_PRESSURE_MAX  300.0f  /* kPa   - above = overpressure */
#define THRESHOLD_COMM_MIN      (-90.0f)/* dBm   - below = weak/lost link */
#define COMM_LOSS_STREAK        3       /* consecutive bad reads = comm timeout */

/* ---------------------------------------------------------------
 * Watchdog
 * ------------------------------------------------------------- */
#define WD_TIMEOUT_MS           7000    /* hang timeout (safe margin over the 5s HeapMon heartbeat) */
#define WD_TICK_PERIOD_MS       1000
#define TASK_HEARTBEAT_PERIOD   1000
#define MAX_RESTART_ATTEMPTS    3

/* ---------------------------------------------------------------
 * Power manager
 * Counting semaphore caps simultaneous high-power subsystems.
 * ------------------------------------------------------------- */
#define POWER_TOKEN_COUNT       3

/* ---------------------------------------------------------------
 * Telemetry / data logger queue sizes
 * ------------------------------------------------------------- */
#define TELEMETRY_QUEUE_LEN     10
#define COMMAND_BUFFER_BYTES    1024
#define LOG_STREAM_BYTES        2048

/* ---------------------------------------------------------------
 * Compile-time identification banner shown at boot
 * ------------------------------------------------------------- */
#define WATCHCORE_VERSION       "1.2.0"
#define WATCHCORE_BUILD_TARGET  "WatchCore-RTOS"

#endif /* CONFIG_H */
