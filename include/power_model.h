#ifndef POWER_MODEL_H
#define POWER_MODEL_H

#include <stdbool.h>
#include <stdint.h>

/* ------------------------------------------------------------------
 * Power / energy model.
 *
 * Replaces the old "random battery" with a real energy balance:
 *
 *     battery_charge += (solar_in - load_out) * dt
 *
 * - Solar input follows a day/night (sunlight/eclipse) cycle.
 * - Load output grows with CPU usage and the number of active
 *   high-power recovery tasks.
 * So when the spacecraft works hard, the battery really drains;
 * in sunlight with low load, it really charges. This makes the
 * CPU-vs-battery correlation genuine instead of luck.
 * ------------------------------------------------------------------ */

void  PowerModel_Init(void);

/* Advance the model by dtMs milliseconds, given the current CPU load
 * (0..100) and how many high-power recovery tasks are active. */
void  PowerModel_Step(uint32_t dtMs, float cpuLoad, uint32_t activeRecoveries);

/* Current readings produced by the model. */
float PowerModel_GetBattery(void);     /* % charge 0..100 */
float PowerModel_GetSolar(void);       /* solar current, amps */
bool  PowerModel_InSunlight(void);     /* true = day, false = eclipse */
float PowerModel_GetLoadWatts(void);   /* current electrical load */

/* Force the battery toward empty (used by the "Drain Battery" demo). */
void  PowerModel_ForceDrain(bool on);

#endif /* POWER_MODEL_H */
