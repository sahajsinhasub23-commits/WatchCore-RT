# WatchCore RTOS — Mission Operations Platform

[![CI](https://github.com/sahajsinhasub23-commits/WatchCore-RT/actions/workflows/ci.yml/badge.svg)](https://github.com/sahajsinhasub23-commits/WatchCore-RT/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform: Windows x64](https://img.shields.io/badge/platform-Windows%20x64-0078D6)

A fault-tolerant **FreeRTOS** supervisor for a simulated **4-spacecraft constellation**,
fronted by a **TypeScript orchestrator** (Express + WebSocket + SQLite) and a
**React + Vite + Tailwind** mission-control dashboard.

> Same FreeRTOS C application runs on each spacecraft. The orchestrator
> spawns the 4 instances, ingests their telemetry, runs **statistical anomaly
> detection** (z-score + EWMA), persists every event to a timeline database,
> drives an **inter-spacecraft relay**, exposes the **autonomous recovery
> loop**, and broadcasts everything to the browser at ~8 Hz. **68+ distinct
> FreeRTOS APIs** are exercised across the C application.

### What makes this build stand out

- **Real energy model** — battery is not random; it integrates `(solar − load)`
  over a day/night orbit, so it genuinely drains under CPU/recovery load and
  charges in sunlight. The CPU↔battery correlation is therefore physical.
- **Real microsecond kernel benchmarks** — a `QueryPerformanceCounter` time base
  gives honest **nanosecond** latencies for queue/mutex/notify/context-switch/
  malloc (no more "0 µs").
- **Graceful degradation (DEGRADED mode)** — when the battery is low-ish the
  safety manager suspends non-essential tasks to save power, then restores them.
- **In-RTOS black box** — a mutex-protected ring buffer flight recorder keeps the
  last 32 critical events inside each spacecraft (dump via `/api/blackbox`).
- **Inter-spacecraft relay** — when one craft loses its downlink, a healthy
  neighbour relays for it; shown as an animated link on the orbital map.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser  ·  http://localhost:5173                                  │
│  React + Vite + Tailwind  (dashboard, this app)                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ WebSocket /live  +  REST /api
┌───────────────────────────────┴─────────────────────────────────────┐
│  Node Orchestrator  ·  :3000                                        │
│  Express · ws · better-sqlite3 · EventSource client                 │
│   - swarm manager (spawns + restarts)                               │
│   - ingest (SSE → in-memory + db)                                   │
│   - anomaly engine (z-score + EWMA + slope forecast)                │
│   - autonomous recovery loop                                        │
│   - timeline persistence + report generator                         │
└────┬────────────┬────────────┬────────────┬─────────────────────────┘
     │            │            │            │   spawn(WATCHCORE_PORT, WATCHCORE_CRAFT)
┌────┴────┐  ┌────┴────┐  ┌────┴────┐  ┌────┴────┐
│ SC-01   │  │ SC-02   │  │ SC-03   │  │ SC-04   │  ← 4 × WatchCore_RTOS.exe
│ :8081   │  │ :8082   │  │ :8083   │  │ :8084   │
│ Polaris │  │  Vega   │  │  Lyra   │  │  Orion  │
└─────────┘  └─────────┘  └─────────┘  └─────────┘
   FreeRTOS kernel + 16 tasks per craft, all on real kernel primitives
```

---

## 1. Quick start (Windows)

> **Platform note.** WatchCore uses the official **MSVC FreeRTOS Windows simulator
> port**, so the C application runs as a native Windows `.exe`. It builds and runs on
> **any Windows 10/11 PC (x64)** — no board or hardware required. (macOS/Linux are not
> supported by this port.)

### Step 1 — Get the code

```bat
git clone https://github.com/sahajsinhasub23-commits/WatchCore-RT.git
cd WatchCore-RT
```

(Or download the ZIP from GitHub and extract it.)

### Step 2 — Run the installer (first time only)

Double-click **`setup.bat`**, or run it from a terminal:

```bat
setup.bat
```

`setup.bat` makes a fresh PC ready to go. It will:

1. **Check prerequisites** (Git, Node.js 20+, Visual Studio C++ tools) and offer to
   **auto-install** anything missing via **winget** (built into Windows 10/11).
2. **Download** the pinned **FreeRTOS kernel** (`V10.5.1`) into `FreeRTOS-Kernel/`.
3. **Install** the backend and frontend npm dependencies.
4. **Build** `WatchCore_RTOS.exe` with the MSVC FreeRTOS port.

> The one prerequisite winget cannot fully automate is the Visual Studio **"Desktop
> development with C++"** workload (it's a large download). If it's missing, `setup.bat`
> points you to the installer; pick that workload, then re-run `setup.bat`.

### Step 3 — Launch everything

```bat
start-all.bat
```

That script will (re)build the simulator if needed, then:

1. Launch the **Node orchestrator** (which spawns 4 spacecraft on ports 8081–8084).
2. Launch the **Vite frontend** on port 5173.
3. Open `http://localhost:5173/` in your default browser.

Close the two cmd windows that opened to stop everything.

> First time on a clean machine, `start-all.bat` will run setup automatically if it
> notices the kernel hasn't been downloaded yet — but running `setup.bat` once up front
> gives you clearer prompts.

### Prerequisites (installed/checked by `setup.bat`)

| Tool | Version | Used for | Auto-install |
|------|---------|----------|--------------|
| Git | any recent | Downloading the FreeRTOS kernel | ✅ winget (`Git.Git`) |
| Node.js + npm | 20+ | Orchestrator + dashboard | ✅ winget (`OpenJS.NodeJS.LTS`) |
| Visual Studio C++ tools | 2022 / 2026 | Building the C simulator (`cl.exe`, CMake, Ninja) | ⚠️ winget can launch the installer; you select the C++ workload |

---

## 2. What you see

### a) The main terminal — plain-English activity feed

The orchestrator window narrates everything happening across the fleet in
plain language (ASCII tags, no jargon):

```
============================================================
   WatchCore Mission Control - live activity (plain English)
============================================================
15:58:52  [ONLINE]    SC-01  is online and reporting telemetry
15:58:57  [WARNING]   SC-01  is now in EMERGENCY mode - handling a fault
15:58:57  [FAULT]     SC-01  detected high temperature
15:58:57  [RECOVERY]  SC-01  started an automatic recovery task
15:59:00  [OK]        SC-01  recovered from high temperature
15:59:00  [OK]        SC-01  is now back to normal operations
```

### b) The Mission Ops console — 4 pages

The browser opens with a short "establishing uplink" boot sequence, then:

| Page | What it shows |
|---|---|
| **Fleet** (`/`) | Animated orbital map — Earth at center, all 4 spacecraft moving on their orbits in real time, color-coded by status, with a radar sweep. **Solar panels glow gold in sunlight**, dim in eclipse; **gold dashed relay links** appear when one craft relays for another. Fleet KPIs, per-craft health cards, live activity feed. A red-alert ribbon + screen vignette appears fleet-wide whenever any craft enters EMERGENCY or SAFE mode. |
| **Monitor** | Single-craft deep dive: 7-sensor **stress radar** (outer ring = the fault threshold), health/safety/CPU **ring gauges**, live trend charts, an **Energy & Power Model** panel (sunlight/eclipse, solar vs load, net charging/draining, battery chart), the **FreeRTOS scheduler as priority lanes** (watch recovery tasks appear in lane P5 during a fault, then vanish), kernel resources (queues, power tokens, bus mutexes, **nanosecond latencies**), and CPU/memory/battery correlation. |
| **Simulate** | Four scripted **mission scenarios** with a live step tracker — *Thermal Cascade* (staggered overheat of all 4 craft), *Comms Blackout* (fleet-wide link loss → relay), *Watchdog Drill* (freeze a task, watch the 7 s kick-and-restart), *Multi-Fault Stress Test* (3 faults at once → SafetyManager escalates to SAFE). Plus manual single-fault injection (all 8 fault types) on any craft. |
| **Analytics** | SQLite-backed mission timeline, live anomaly stream (z-score + EWMA), kernel **benchmark suite** with real **nanosecond** queue/mutex/notify/context-switch/malloc latency across all 4 craft, the in-RTOS **Flight Recorder (black box)** viewer, and a one-click printable **mission report**. |

---

## 3. What's running under the hood

### 3.1 The FreeRTOS C application

`src/` contains the WatchCore RTOS app. Each spacecraft runs the same binary —
identity is provided at launch via `WatchCore_RTOS.exe <port> <craftId>`
(or the env vars `WATCHCORE_PORT` / `WATCHCORE_CRAFT`).

Tasks (per craft):

| Task           | Prio | Period   | What it does |
|----------------|------|----------|---|
| `TelemSrv`     | 2    | event    | HTTP + SSE telemetry server, handles `/api/fault`, `/api/suspend`, `/api/resume`, `/api/bench`, `/api/blackbox` |
| `EventMgr`     | 3    | event    | Reads queue set, evaluates 7 sensor thresholds, sets fault bits, dispatches recovery |
| `CpuMon`       | 1    | 1 Hz     | Real % CPU via `uxTaskGetSystemState` (hi-res time base) |
| `HeapMon`      | 1    | 0.2 Hz   | `xPortGetFreeHeapSize` |
| `StackMon`     | 1    | 0.5 Hz   | Worst-case stack high-water-mark sweep |
| `SensMon`      | 2    | 2 Hz     | Reads 7 sensors (SPI / I²C / UART, mutex-protected); drives the energy model |
| `CommWatch`    | 1    | 1 Hz     | Communication-loss detector (raises/clears COMM_TIMEOUT) |
| `Watchdog`     | timer| 1 Hz     | Detects task hangs, `vTaskDelete`+`xTaskCreate` to restart |
| `SafetyMgr`    | 4    | 0.5 Hz   | Safety score, multi-fault escalation, DEGRADED-mode load-shedding |
| `PwrMgr`       | 4    | 0.5 Hz   | Counting-semaphore power token reporter |
| `Diag`         | 2    | 0.2 Hz   | `vTaskList`, `vTaskGetRunTimeStats`, stack water-mark sweep |
| `DataLog`      | 1    | event    | Stream-buffer log consumer |
| `CmdProc`      | 3    | event    | Message-buffer command dispatcher |
| `FaultInj`     | 2    | 8 s loop | Demo fault scheduler |
| `Bench`        | 2    | 2.5 s    | Real nanosecond kernel latency benchmarks (QueryPerformanceCounter) |
| `Emergency*`   | 5    | dynamic  | Spawn-on-demand recovery (TempRec / BattRec / RadRec / SolarRec / AttRec / PresRec / MemRec / CommRec) |

Plus three non-task support modules: `hires_clock` (µs time base), `power_model`
(energy balance), and `flight_recorder` (black box ring buffer).

### 3.2 The Node orchestrator

`web/backend/src/`:

| File              | Role |
|-------------------|---|
| `index.ts`        | Express server, REST routes, WebSocket fan-out |
| `swarm.ts`        | Child-process manager (spawns and supervises 4 `WatchCore_RTOS.exe`) |
| `ingest.ts`       | EventSource client per craft, parses logs, fan-outs frames |
| `anomaly.ts`      | Per-(craft,metric) z-score + EWMA detector + slope forecaster |
| `correlation.ts`  | Rolling Pearson correlation between CPU / memory / battery |
| `relay.ts`        | Inter-spacecraft relay — assigns a healthy craft to relay for a comm-down one |
| `narrate.ts`      | Plain-English terminal narrator |
| `recovery.ts`     | Autonomous loop that clears stale soft-faults and probes SAFE-stuck craft |
| `db.ts`           | better-sqlite3 schema + insert / query helpers |
| `report.ts`       | Self-contained HTML mission report generator |
| `config.ts`       | Swarm layout (id, port, orbit, label) and tuning constants |

### 3.3 The React dashboard

`web/frontend/src/`:

| File / dir         | Role |
|--------------------|---|
| `lib/store.ts`     | Dependency-free reactive store fed by the `/live` WebSocket |
| `lib/api.ts`       | Typed REST client for all orchestrator endpoints |
| `lib/types.ts`     | Mirrors backend `types.ts` |
| `lib/utils.ts`     | Formatting helpers + color/severity maps |
| `components/`      | Layout, OrbitMap, Radar, SchedulerLanes, Ring/Segmented, BootOverlay, AlertRibbon |
| `pages/`           | Fleet · Monitor · Simulate · Analytics |

---

## 4. FreeRTOS API count

The C application calls **68+ distinct FreeRTOS APIs / macros** across
tasks, queues, queue sets, event groups, software timers, all four
semaphore types (standard + recursive + binary + counting), stream
buffers, message buffers, task notifications, runtime stats, hooks, and
critical sections. The new `Benchmarks` module adds:

`xQueueOverwrite`, `xQueuePeek`, `xQueueReset`, `xTaskNotifyWait`,
`xTaskNotifyWaitIndexed`, `xTimerStop`, `xTimerReset`,
`xTimerChangePeriod`, `xTimerIsTimerActive`, `xTimerDelete`,
`vSemaphoreDelete`, `xTaskGetIdleTaskHandle`, `xTaskGetHandle`,
`vTaskSuspend`, `vTaskResume`.

A complete cross-reference of every API and its call site is in
[`docs/RTOS_APIS.md`](#) — or simply grep `src/`.

---

## 5. Endpoints reference

### Orchestrator (`http://localhost:3000`)

| Method | Path                                | Purpose |
|--------|-------------------------------------|---|
| GET    | `/api/swarm`                        | List swarm layout + runtime state |
| POST   | `/api/swarm/:id/restart`            | Kill and respawn one spacecraft |
| POST   | `/api/craft/:id/fault`              | `{name, action}` → proxied to that craft |
| POST   | `/api/craft/:id/task/:name/:action` | `suspend` / `resume` a task by name |
| POST   | `/api/craft/:id/bench`              | Trigger one-shot benchmark on a craft |
| GET    | `/api/timeline?craft=&limit=`       | SQLite timeline query |
| GET    | `/api/anomalies?craft=&limit=`      | SQLite anomalies query |
| GET    | `/api/benchmarks/:craft?limit=`     | SQLite benchmark series |
| GET    | `/api/correlation`                  | CPU/memory/battery Pearson correlation per craft |
| GET    | `/api/relay`                        | Active inter-spacecraft relay links |
| GET    | `/api/craft/:id/blackbox`           | Dump a craft's flight recorder (black box) |
| GET    | `/api/report`                       | Printable HTML mission report |
| WS     | `/live`                             | Server-pushed frames + logs + anomalies + relay + craft state |

### Per-craft RTOS HTTP server (`http://127.0.0.1:8081..8084`)

| Method | Path                                              | Purpose |
|--------|---------------------------------------------------|---|
| GET    | `/telemetry`                                      | SSE stream (~8 Hz JSON frames + log lines) |
| GET    | `/api/fault?name=temp&action=set\|clear`          | Set or clear a fault bit |
| GET    | `/api/suspend?task=NAME`                          | `vTaskSuspend` by task name |
| GET    | `/api/resume?task=NAME`                           | `vTaskResume` by task name |
| GET    | `/api/bench`                                      | One-shot benchmark trigger (real ns latencies) |
| GET    | `/api/blackbox`                                   | Flight-recorder JSON dump |
| GET    | `/`                                               | Built-in static fallback (not used; React app is canonical) |

---

## 6. Repo layout

```
.
├── setup.bat                ← installer: prereqs + kernel download + deps + build
├── setup.ps1                ← installer logic (called by setup.bat)
├── start-all.bat            ← one-shot launcher (build C + backend + frontend)
├── build.bat                ← build the C simulator only
├── CMakeLists.txt
├── CMakePresets.json
├── LICENSE                  ← MIT (WatchCore code)
├── README.md                ← this file
├── TECHNICAL_REPORT.md · USER_GUIDE.md
├── .github/workflows/ci.yml ← Windows build + web type-check CI
├── include/                 ← public C headers
├── src/                     ← FreeRTOS C application (19 modules)
│     main.c · event_manager · emergency · monitoring · watchdog ·
│     logging · state_machine · ipc · fault_injection · command_processor ·
│     diagnostics · power_manager · data_logger · benchmarks ·
│     safety_manager · telemetry_server ·
│     hires_clock · power_model · flight_recorder
├── FreeRTOS-Kernel/         ← unmodified FreeRTOS V10.5.1 (auto-downloaded, git-ignored)
├── tests/                   ← RTOS primitive smoke tests
└── web/
    ├── backend/             ← Node orchestrator (Express + ws + sqlite)
    │   └── src/  config · db · swarm · ingest · narrate · relay ·
    │             anomaly · correlation · recovery · report · index
    └── frontend/            ← Vite + React + TS + Tailwind dashboard
        └── src/  main.tsx · App.tsx ·
                  components/  Layout · OrbitMap · Radar · SchedulerLanes ·
                               BootOverlay · AlertRibbon · ui
                  pages/       Fleet · Monitor · Simulate · Analytics
                  lib/         store · api · types · plain · utils · tinystore
```

---

## 7. Running pieces individually

If `start-all.bat` is overkill, you can run each piece manually (run `setup.bat`
once first so the kernel and npm deps are in place):

```bat
:: 1. Build the C simulator
build.bat x64-debug

:: 2. Orchestrator (also spawns the 4 spacecraft)
cd web\backend && npm install && npm run dev

:: 3. Dashboard (in another shell)
cd web\frontend && npm install && npm run dev

:: 4. Browse to http://localhost:5173/
```

Want to talk to a single spacecraft directly (bypassing the orchestrator)?

```bat
out\build\x64-debug\WatchCore_RTOS.exe 8081 SC-01
curl http://127.0.0.1:8081/telemetry
```

---

## 8. Bench / smoke test

A minimal RTOS primitive smoke test lives in `tests/test_runtime.c` and
exercises queues, mutexes, semaphores, event groups, stream/message
buffers, and task notifications. Run via:

```bat
tests\run_tests.bat
```

(from an x64 Native Tools VS prompt.)

---

## 9. Notes for the reviewer

- **No magic** — every piece of telemetry on the dashboard maps to a real
  field in the C application's SSE frame. The full JSON shape is in
  `web/backend/src/types.ts`.
- **Autonomous recovery** — the recovery engine in `web/backend/src/recovery.ts`
  clears stale soft-faults after 12 s and issues a benchmark probe to any craft
  stuck in SAFE for over 30 s. The hard recovery (kick-and-restart of hung
  tasks) is performed inside FreeRTOS itself by the watchdog software timer.
- **Anomaly detection** — `anomaly.ts` implements an online z-score detector
  with a 60-sample sliding window, an EWMA (α = 0.25) and a slope-based
  forecast over the next 30 frames. No external ML libraries.
- **Digital twin** — the orchestrator's in-memory frame map *is* the twin.
  Even if a spacecraft drops, the twin retains its last known state plus
  forecasts so the operator can plan against it.
- **Reports** — `/api/report` produces a self-contained HTML document
  reproducible from `web/backend/watchcore.db`. Open it, press Ctrl-P
  to save a PDF.

---

## 10. License

WatchCore application code is released under the **MIT License** — see
[`LICENSE`](LICENSE). The FreeRTOS Kernel (auto-downloaded into `FreeRTOS-Kernel/`)
is a separate work, also MIT-licensed, by Amazon.com, Inc. — see
`FreeRTOS-Kernel/LICENSE.md` after it has been fetched, or
<https://github.com/FreeRTOS/FreeRTOS-Kernel>.
