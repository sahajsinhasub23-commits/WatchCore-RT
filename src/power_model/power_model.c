#include "power_model.h"
#include "FreeRTOS.h"
#include "task.h"
#include <math.h>

/* ------------------------------------------------------------------
 * Simple but real spacecraft energy balance.
 * Units are simplified ("amps", "watts") but the relationships are
 * physical: charge integrates (solar - load) over time.
 * ------------------------------------------------------------------ */

#define BATTERY_CAPACITY_WS   4000.0f   /* arbitrary energy units (watt-seconds) */
#define ORBIT_PERIOD_MS       90000.0f  /* 90 s simulated orbit (sun + eclipse) */
#define SUNLIT_FRACTION       0.62f     /* ~62% of orbit in sunlight */
#define SOLAR_PEAK_A          2.9f      /* peak solar current in full sun */
#define BASE_LOAD_W           1.0f      /* always-on housekeeping load */
#define CPU_LOAD_W            2.0f      /* extra load at 100% CPU */
#define RECOVERY_LOAD_W       2.5f      /* per active recovery task */

static float    s_chargeWs   = BATTERY_CAPACITY_WS * 0.80f;  /* start at 80% */
static float    s_solar      = SOLAR_PEAK_A;
static float    s_loadW      = BASE_LOAD_W;
static bool     s_sunlit     = true;
static bool     s_forceDrain = false;
static uint32_t s_orbitMs    = 0;

void PowerModel_Init(void) {
    s_chargeWs   = BATTERY_CAPACITY_WS * 0.80f;
    s_orbitMs    = 0;
    s_forceDrain = false;
}

void PowerModel_Step(uint32_t dtMs, float cpuLoad, uint32_t activeRecoveries) {
    float dt = (float)dtMs / 1000.0f;   /* seconds */

    /* --- Orbital sunlight cycle --- */
    s_orbitMs = (uint32_t)(s_orbitMs + dtMs) % (uint32_t)ORBIT_PERIOD_MS;
    float phase = (float)s_orbitMs / ORBIT_PERIOD_MS;   /* 0..1 */
    s_sunlit = (phase < SUNLIT_FRACTION);

    if (s_sunlit) {
        /* Solar current follows a smooth curve while in sunlight. */
        float sunPhase = phase / SUNLIT_FRACTION;             /* 0..1 */
        s_solar = SOLAR_PEAK_A * sinf(sunPhase * 3.14159265f);
        if (s_solar < 0.0f) s_solar = 0.0f;
    } else {
        s_solar = 0.0f;   /* eclipse: no sunlight */
    }

    /* --- Electrical load grows with CPU and recovery work --- */
    s_loadW = BASE_LOAD_W
            + CPU_LOAD_W * (cpuLoad / 100.0f)
            + RECOVERY_LOAD_W * (float)activeRecoveries;

    /* Solar "amps" converted to watts with a nominal bus voltage of ~5. */
    float solarW = s_solar * 5.0f;

    /* --- Energy balance: integrate (in - out) --- */
    float netW = solarW - s_loadW;
    if (s_forceDrain) netW = -8.0f;     /* demo: strong forced drain */

    s_chargeWs += netW * dt;
    if (s_chargeWs > BATTERY_CAPACITY_WS) s_chargeWs = BATTERY_CAPACITY_WS;
    if (s_chargeWs < 0.0f)                s_chargeWs = 0.0f;
}

float PowerModel_GetBattery(void) {
    return (s_chargeWs / BATTERY_CAPACITY_WS) * 100.0f;
}

float PowerModel_GetSolar(void)    { return s_solar; }
bool  PowerModel_InSunlight(void)  { return s_sunlit; }
float PowerModel_GetLoadWatts(void){ return s_loadW; }
void  PowerModel_ForceDrain(bool on){ s_forceDrain = on; }
