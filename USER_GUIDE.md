# WatchCore RTOS — User Guide

**How to run the project and use every part of it.**

This guide is written in simple English. It explains every command, every
button, every page, and what happens when you use them. If you only read one
document to operate the project, read this one.

---

## Table of Contents

1. [Before you start (requirements)](#1-before-you-start-requirements)
2. [The fastest way to run everything](#2-the-fastest-way-to-run-everything)
3. [What opens on your screen](#3-what-opens-on-your-screen)
4. [Running parts separately (all commands)](#4-running-parts-separately-all-commands)
5. [The dashboard — page by page, button by button](#5-the-dashboard--page-by-page-button-by-button)
6. [Every dashboard element explained](#6-every-dashboard-element-explained)
7. [Pop-up pill notifications](#7-pop-up-pill-notifications)
8. [The mission scenarios explained](#8-the-mission-scenarios-explained)
9. [Every fault button and what it does](#9-every-fault-button-and-what-it-does)
10. [The terminal log (what the words mean)](#10-the-terminal-log-what-the-words-mean)
11. [The REST API (for advanced users)](#11-the-rest-api-for-advanced-users)
12. [A 5-minute demo script](#12-a-5-minute-demo-script)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Before you start (requirements)

You need these installed on Windows:

| Tool | Why | Check it works |
|------|-----|----------------|
| **Visual Studio** (with "Desktop development with C++") | Compiles the FreeRTOS C program | `cl.exe` is available |
| **Node.js** (version 18 or newer) | Runs the orchestrator and dashboard | `node --version` |

You do **not** need to install anything else. The first run will download the
web dependencies automatically.

---

## 2. The fastest way to run everything

Double-click this file, or run it in a terminal:

```
start-all.bat
```

This one command does **all four steps** for you:

1. **Builds** the FreeRTOS C program (`WatchCore_RTOS.exe`).
2. **Installs** web dependencies the first time (only once).
3. **Starts** the orchestrator (which launches the 4 spacecraft).
4. **Starts** the dashboard and **opens your browser**.

Wait about 10–15 seconds. Two black terminal windows will open, and your
browser will open the dashboard.

**To stop everything:** close the two black terminal windows.

---

## 3. What opens on your screen

After `start-all.bat`, you will have **three things**:

### a) The Orchestrator terminal (black window #1)
Title: *"WatchCore Orchestrator (backend :3000)"*.
This shows the **plain-English mission log**. Example:
```
15:58:57  [FAULT]     SC-01  detected high temperature
15:58:57  [RECOVERY]  SC-01  started an automatic recovery task
15:59:00  [OK]        SC-01  recovered from high temperature
```

### b) The Dashboard terminal (black window #2)
Title: *"WatchCore Dashboard (frontend :5173)"*.
This just runs the website. You can ignore it. Do not close it (closing it
stops the dashboard).

### c) The Browser dashboard
Opens at **http://localhost:5173**. This is the main thing you look at. It
starts with a short "establishing uplink" animation, then shows the
Mission Ops console.

---

## 4. Running parts separately (all commands)

You usually only need `start-all.bat`. But here is every command, in case you
want to run parts by hand.

| Command | What it does |
|---------|--------------|
| `start-all.bat` | Build + run everything + open browser (the easy way) |
| `build.bat x64-debug` | Build only the C program (no run) |
| `out\build\x64-debug\WatchCore_RTOS.exe 8081 SC-01` | Run ONE spacecraft by hand on port 8081 with id SC-01 |
| `tests\run_tests.bat` | Run the RTOS unit tests (queues, mutexes, etc.) |

Running the web stack by hand (two separate terminals):

```bat
REM Terminal 1 - the orchestrator (starts the 4 spacecraft)
cd web\backend
npm install      REM first time only
npm run dev

REM Terminal 2 - the dashboard
cd web\frontend
npm install      REM first time only
npm run dev
```

Then open **http://localhost:5173** yourself.

**Useful addresses:**

| Address | What it is |
|---------|-----------|
| http://localhost:5173 | The dashboard (what you look at) |
| http://localhost:3000 | The orchestrator REST API + WebSocket |
| http://localhost:3000/api/report | The printable mission report (opens directly) |
| 127.0.0.1:8081 … 8084 | The 4 spacecraft programs (raw telemetry) |

---

## 5. The dashboard — page by page, button by button

The dashboard has **four pages**. You switch between them using the tabs at
the **top-right** of the header: **Fleet · Monitor · Simulate · Analytics**.

The whole dashboard uses a dark **purple / violet / blue** "nebula" theme so it
looks like a real mission-control console.

The **header** (always visible at the top) shows:
- The **WatchCore logo** (a spinning ring).
- Four **status lights**, one per spacecraft. Green = healthy, amber =
  warning, red = emergency, orange = safe mode, violet = recovering. Click a
  light to jump to the Monitor page.
- **UPLINK / NO LINK** — whether the dashboard is connected.
- **X/4 online** — how many spacecraft are sending data.
- The **Mission Time** clock (T+ hours:minutes:seconds since you connected).

Two things appear automatically when something happens:
- If any spacecraft has an emergency, a **red alert bar** slides down under the
  header and the screen edges glow red. It disappears when the problem is fixed.
- Small **pop-up pill notifications** appear in the bottom-right corner when a
  problem starts and again when the craft heals (see
  [Section 7](#7-pop-up-pill-notifications)).

---

### 5.1 Fleet page (the home page)

This is the big-picture view of all spacecraft.

| Thing you see | What it means / does |
|---------------|----------------------|
| **Orbital map** (center) | Earth in the middle, the 4 spacecraft moving on their orbits in real time. Color = mode. |
| **Spinning radar sweep** | Just a visual effect for the "mission control" look. |
| **Gold solar panels on a craft** | That craft is in **sunlight** and charging its battery. |
| **Dim panels** | That craft is in **eclipse** (Earth's shadow), running on battery. |
| **Gold dashed line between two craft** | A **relay link** — one craft lost its radio and another is relaying its data. |
| **Red number badge on a craft** | How many faults that craft has right now. |
| **KPI tiles** (top) | Online count, Fleet Health, Active Faults, Emergency count, RTOS Tasks, Recoveries. |
| **Craft cards** (right) | One card per spacecraft with health bar and quick numbers. |
| **Fleet Activity** (bottom) | A plain-English list of everything happening. |

**Actions on this page:**
- **Click a spacecraft** (on the map or its card) → it becomes the "focused"
  craft (highlighted).
- **Double-click a craft card** → jumps to the Monitor page for that craft.

---

### 5.2 Monitor page (one spacecraft in detail)

This is the deep-dive view of a single spacecraft.

**The craft selector** (top, next to the title): four buttons (SC-01 … SC-04).
Click one to choose which spacecraft you are looking at. The colored dot shows
its current status.

**The panels:**

| Panel | What it shows |
|-------|---------------|
| **Vitals** | Three **animated speedometer gauges** — **Health**, **Safety score**, **CPU Load** — with a sweeping needle, plus free heap, min stack, watchdog count, power tokens, recoveries. |
| **Sensor Stress Radar** | A 7-sided spider chart of all 7 sensors. The **outer ring is the danger limit**. If a corner touches the ring, that sensor has caused a fault (the shape turns red). |
| **Live Trends** | A moving line chart of CPU, temperature, and battery. |
| **Energy & Power Model** | The real energy system: **SUNLIGHT or ECLIPSE**, solar input (W), load draw (W), battery %, and whether the craft is **net charging** or **net draining**. A chart shows battery, solar, and load over time. |
| **FreeRTOS Scheduler · Priority Lanes** | Every task shown as a chip in its priority lane (P6 at top, P0 at bottom). **RUNNING** glows green, **frozen** pulses amber. During a fault you can watch a recovery task appear in lane **P5**, then vanish. |
| **Kernel Resources** | Telemetry queue fill, power budget, the three bus mutexes (SPI/I²C/UART — they light up when in use), IPC counts, and the **kernel latency benchmark** numbers (nanoseconds). |
| **Correlation** | The live relationship between CPU, memory, and battery, with a plain-English insight. |
| **Activity** | Recent events for this craft only. |

---

### 5.3 Simulate page (cause problems, watch recovery)

This is where you **test** the self-healing system.

**Top of page:**
- **Clear all faults** button (top-right, green) → removes every fault on every
  spacecraft and brings them all back to normal. Use this to reset.

**Mission Scenarios** (the four big cards):
Each card runs a *scripted* multi-step test. Press **Launch** to start one,
**Abort** to stop it early. A live step tracker appears showing the progress
(`○ pending → ● active → ✓ done`). The four scenarios are explained in
[Section 8](#8-the-mission-scenarios-explained).

**Manual Fault Injection** (bottom-left panel):
- A row of **target buttons** (SC-01 … SC-04) to choose which craft to hit.
- A grid of **8 fault buttons** (Overheat, Drain Battery, Radiation, Solar
  Loss, Tumbling, Pressure, Low Memory, Lose Comms). Click one to cause that
  fault on the chosen craft.
- **Freeze a task** → suspends the CpuMon task on the chosen craft (to test the
  watchdog).
- **Restart craft** → kills and restarts the whole spacecraft program.

**Mission Log** (bottom-right panel):
Shows your actions (with a ▸ arrow) mixed with the craft's real responses, in
plain English.

---

### 5.4 Analytics page (the evidence)

This page shows recorded data and measurements.

| Panel | What it shows | Buttons |
|-------|---------------|---------|
| **Mission Timeline** | Every important event, saved in a database, newest first. | — |
| **Anomaly Detection** | Unusual readings found by math (z-score + EWMA), with severity. | — |
| **Kernel Benchmark Suite** | Real speed of kernel operations (queue, mutex, notify, context switch, malloc) in **nanoseconds**, compared across all 4 craft. | **Run benchmark on all 4 craft** |
| **Flight Recorder · Black Box** | The in-RTOS "black box" — the last critical events stored inside the spacecraft's own memory. Pick a craft to read its black box. | craft selector |
| **Generate mission report** (top-right) | Opens a printable HTML report in a new tab. | **Generate mission report** |

---

## 6. Every dashboard element explained

This section explains **every single thing you see** on the screen, grouped by
where it appears. Use it as a reference.

### 6.1 The top header (on every page)

| Element | What it is | What it tells you |
|---------|-----------|-------------------|
| **Spinning ring logo** | The WatchCore badge | Just branding; the ring rotates slowly |
| **WATCHCORE / Mission Ops · FreeRTOS** | The product name | — |
| **4 colored dots** (S1 S2 S3 S4) | One status light per spacecraft | Green=healthy, amber=warning, red=emergency, orange=safe, violet=recovering. Click → opens Monitor |
| **● UPLINK / ○ NO LINK** | Connection light | Green = the dashboard is receiving live data; red = not connected |
| **X/4 online** | Live craft counter | How many of the 4 spacecraft are sending telemetry |
| **Nav tabs** (Fleet / Monitor / Simulate / Analytics) | Page switcher | The highlighted one is the current page |
| **T+ 00:00:00** | Mission clock | Time since the dashboard connected (hours:minutes:seconds) |
| **Red alert bar** (appears under header) | Fleet-wide emergency banner | Names which craft and which fault; only shows during EMERGENCY/SAFE |

### 6.2 The Fleet page

**The orbital map (big panel, center-left):**

| Element | Meaning |
|---------|---------|
| **Blue globe in the center** | Earth |
| **Faint dashed ellipses** | The 4 orbit paths |
| **Small square with side panels** | A spacecraft. Its color = its mode (green/amber/red/violet) |
| **Gold glowing side panels** | That craft is in **sunlight** → solar panels are charging |
| **Dim side panels** | That craft is in **eclipse** (Earth's shadow) → running on battery |
| **Pulsing ring around a craft** | It is selected, or it is in an emergency |
| **Small red number on a craft** | How many active faults it has |
| **Gold dashed curved line between two craft** | A **relay link** — the healthy craft is relaying data for the one whose radio is down. The word "RELAY" sits on the line |
| **Rotating faint wedge** | A radar sweep — decoration only |
| **Tiny twinkling dots** | Background stars — decoration only |
| **Text box top-right of map** | The focused craft's id, mode, and any faults |

**The 6 KPI tiles (top row):**

| Tile | Meaning |
|------|---------|
| **Online** | How many craft are alive (e.g. 4/4) |
| **Fleet Health** | Average health score of all craft (0–100) |
| **Active Faults** | Total faults across the whole fleet right now |
| **Emergency** | How many craft are in EMERGENCY or SAFE mode |
| **RTOS Tasks** | Total tasks running across all 4 craft |
| **Recoveries** | Total automatic recoveries completed since start |

**The craft cards (right column):** one card per spacecraft showing its id,
name, orbit, status word, a **health bar**, and quick numbers (health %, task
count, CPU %). Click a card to focus that craft on the map; double-click to
open it in Monitor.

**Fleet Activity (bottom):** a scrolling, plain-English list of recent events
across all craft.

### 6.3 The Monitor page

**Craft selector (top):** four buttons to pick which spacecraft you inspect.

**Vitals panel — the three speedometers:**

| Gauge | Meaning | Good / bad |
|-------|---------|-----------|
| **Health** | Overall craft health (0–100) | Higher is better; needle swings right when healthy |
| **Safety** | Safety-manager score (0–100) | Drops when faults pile up |
| **CPU Load** | How busy the processor is (%) | Rises during recovery work |

Each speedometer has a **sweeping needle**, tick marks, a colored gradient arc,
and a number in the middle. Below the gauges: **Free heap**, **Min ever** heap,
**Min stack** headroom, **Watchdog** task count, **Power tokens** (free/total),
and **Recoveries**.

**Sensor Stress Radar:** a 7-spoke spider chart (Temp, Battery, Radiation,
Solar, Attitude, Pressure, Comm). Each spoke shows how close that sensor is to
its danger limit. The **dashed outer ring is the fault line** — if the shape
touches it, that sensor has triggered a fault and the whole shape turns red.

**Live Trends:** a moving line chart — blue = CPU, orange = temperature,
green = battery — over the last ~60 readings.

**Energy & Power Model panel:**

| Element | Meaning |
|---------|---------|
| **SUNLIGHT / ECLIPSE badge** | Whether the craft is in sun (charging) or shadow (draining) |
| **Net charging / Net draining** | Whether solar power is more or less than the load right now, with the watts |
| **Solar input bar** | Power coming from the solar panels (W) |
| **Load draw bar** | Power being used by the electronics (W) |
| **Battery bar** | Current battery charge (%) |
| **The chart** | Battery (green area), solar (gold), and load (amber) over time |

**FreeRTOS Scheduler · Priority Lanes:** seven rows, one per priority level
(P6 highest at top, P0 idle at bottom). Each task is a small chip in its lane.
Chip colors: **green = running**, blue = ready, grey = waiting (blocked),
**amber = frozen**. When a fault happens, watch a recovery task pop into lane
**P5** and then disappear when done.

**Kernel Resources panel:**

| Element | Meaning |
|---------|---------|
| **Telemetry queue bar** | How full the data queue is (used / total slots) |
| **Power budget bar** | How many power tokens are in use |
| **SPI / I²C / UART boxes** | The three hardware buses. They light up when a task is using that bus |
| **IPC ops / Samples / Cmd ok-bad / Log bytes** | Activity counters |
| **Kernel latencies (µs/ns)** | Real measured speed of queue/mutex/notify/context-switch/jitter/malloc |

**Correlation panel:** four bars showing how strongly CPU, memory, battery, and
task count move together (the **r** value, −1 to +1), with one plain-English
insight sentence.

**Activity panel:** recent events for this craft only.

### 6.4 The Simulate page

| Element | What it does |
|---------|--------------|
| **Clear all faults** (top-right) | Resets every craft back to normal |
| **4 scenario cards** | Scripted multi-step tests; **Launch** to run, **Abort** to stop |
| **Step tracker** (appears while running) | Shows each step as pending ○ → active ● → done ✓ |
| **Target buttons** (SC-01…04) | Choose which craft the manual buttons hit |
| **8 fault buttons** | Cause one specific fault (see [Section 9](#9-every-fault-button-and-what-it-does)) |
| **Freeze a task** | Suspends CpuMon to test the watchdog |
| **Restart craft** | Kills and restarts that spacecraft |
| **Mission Log** | Your actions (▸) mixed with the craft's real responses |

### 6.5 The Analytics page

| Element | What it does |
|---------|--------------|
| **Generate mission report** (top-right) | Opens a printable HTML report |
| **Mission Timeline** | Every recorded event, newest first, color-coded by type |
| **Anomaly Detection** | Unusual readings flagged by math, with a severity badge |
| **Run benchmark on all 4 craft** | Measures real kernel speed on every craft |
| **Benchmark bars** | Compares queue/mutex/notify/context-switch/malloc speed across craft |
| **Flight Recorder · Black Box** | Reads back the last critical events stored inside a chosen craft; pick the craft with the selector |

---

## 7. Pop-up pill notifications

Small notification "pills" appear in the **bottom-right corner** of the screen.
They tell you the moment something important happens, without you having to
watch the logs.

There are two kinds:

| Pill | Color | When it appears | Example |
|------|-------|-----------------|---------|
| **Event pill** | Red (or orange for safe mode) | The moment a problem is detected | *"SC-01 · High temperature — Detected, autonomous recovery starting"* |
| **Fixed pill** | Green | The moment a craft returns to normal | *"SC-01 · Stabilized — Recovered: cooling task stabilized the temperature."* |

How they behave:

- They **slide in** from the side and stack (up to 4 at a time).
- A thin **bar at the bottom counts down**; each pill **disappears by itself
  after about 6 seconds**.
- **Hover** over a pill to reveal a small **✕** button to close it early.
- The **fixed pill explains how the problem was solved** — if several things
  went wrong during the event, it lists all of them (for example,
  *"load-shedding restored the battery and attitude control re-stabilized the
  craft."*).

This is the easiest way to follow the self-healing: a red pill says *what broke*,
and a green pill a couple of seconds later says *how it was fixed*.

---

## 8. The mission scenarios explained

On the **Simulate** page, the four scenario cards each tell a complete story.

### Thermal Cascade
Overheats all four spacecraft one after another, two seconds apart. You watch
four recovery tasks spawn across the fleet at staggered times, each cooling its
craft and disappearing. **Shows:** parallel, fleet-wide self-healing.

### Comms Blackout
Cuts the radio link on the whole fleet at once. The `CommWatch` task on each
craft detects the lost signal, and `CommRec` re-acquires it. On the Fleet map
you may also see **relay links** appear (a healthy craft relaying for a downed
one). **Shows:** communication fault detection + inter-spacecraft relay.

### Watchdog Drill
Freezes the `CpuMon` task on SC-01. For about 7 seconds nothing happens (the
task is silent). Then the watchdog notices the missing heartbeats, **deletes**
the frozen task and **creates a fresh one**. **Shows:** the watchdog kick-and-
restart.

### Multi-Fault Stress Test
Hits SC-02 with three faults at the same time (temperature + battery +
radiation). The `SafetyManager` sees that three faults is an overload and
**escalates the whole craft to SAFE mode**. Then it clears them. **Shows:** the
safety manager's whole-system protection.

---

## 9. Every fault button and what it does

These are on the **Simulate** page. Each one causes a real fault in the chosen
spacecraft, which the system then detects and fixes.

| Button | Fault caused | What the spacecraft does to recover |
|--------|--------------|-------------------------------------|
| **Overheat** | Temperature > 85 °C | `TempRec` task engages cooling (~1 s), then clears it |
| **Drain Battery** | Battery < 15 % | `BattRec` task sheds load (~0.8 s), then clears it |
| **Radiation** | Radiation > 100 | `RadRec` task activates shielding (~0.9 s) |
| **Solar Loss** | Solar current < 0.5 A | `SolarRec` task switches to the battery bus |
| **Tumbling** | Spin rate > 10 °/s | `AttRec` task re-stabilizes the craft (~1.1 s) |
| **Pressure** | Tank pressure out of range | `PresRec` task isolates the line |
| **Low Memory** | Free heap < 4 KB | `MemRec` task frees non-critical caches |
| **Lose Comms** | Radio signal lost | `CommWatch` detects it, `CommRec` re-acquires the link |
| **Freeze a task** | CpuMon stops responding | The watchdog restarts it after 7 s |
| **Restart craft** | (not a fault) | The whole spacecraft program restarts |

After any of these, watch the **Monitor → Scheduler Lanes** to see the recovery
task appear, and the **Fleet activity feed** to read what happened in plain
words.

---

## 10. The terminal log (what the words mean)

The orchestrator terminal prints lines like:
```
15:58:57  [FAULT]     SC-01  detected high temperature
```
The tag in `[brackets]` tells you the kind of event:

| Tag | Meaning |
|-----|---------|
| `[ONLINE]` | A spacecraft started and is sending data |
| `[FAULT]` | A problem was detected |
| `[WARNING]` | The craft changed into a warning/emergency mode |
| `[RECOVERY]` | An automatic recovery task started |
| `[OK]` | A problem was fixed / the craft is healthy again |
| `[RESTART]` | The watchdog restarted a frozen task |
| `[SAFE]` | The craft entered safe mode (locked down) |
| `[RELAY]` | One craft started relaying data for another |
| `[ALERT]` | An unusual sensor reading (anomaly) |

---

## 11. The REST API (for advanced users)

The orchestrator on **http://localhost:3000** offers these endpoints. You can
call them with a browser, `curl`, or any tool. (The dashboard uses these too.)

| Method + path | What it does |
|---------------|--------------|
| `GET /api/swarm` | List the 4 spacecraft and their status |
| `GET /api/correlation` | CPU/memory/battery correlation for each craft |
| `GET /api/timeline?limit=60` | Recent events (from the database) |
| `GET /api/anomalies?limit=50` | Recent anomalies |
| `GET /api/relay` | Current inter-spacecraft relay links |
| `GET /api/report` | The printable HTML mission report |
| `GET /api/craft/SC-01/blackbox` | Dump one craft's flight recorder (black box) |
| `POST /api/craft/SC-01/fault` (body `{"name":"temp","action":"set"}`) | Cause or clear a fault |
| `POST /api/craft/SC-01/task/CpuMon/suspend` | Freeze a task |
| `POST /api/craft/SC-01/task/CpuMon/resume` | Un-freeze a task |
| `POST /api/craft/SC-01/bench` | Run the kernel benchmark on that craft |
| `POST /api/swarm/SC-01/restart` | Restart one spacecraft |

The valid fault `name` values are:
`temp`, `battery`, `radiation`, `memory`, `comm`, `hang`, `queue`,
`deadlock`, `solar`, `attitude`, `pressure`.

Live data comes over a WebSocket at `ws://localhost:3000/live`.

---

## 12. A 5-minute demo script

A simple order to show the project to a teacher or judge:

1. Run `start-all.bat`. Wait for the dashboard to open.
2. **Fleet page:** point out the 4 spacecraft orbiting Earth, the green status,
   and the gold solar panels (charging in sunlight). Watch the
   **bottom-right pill notifications** pop up as the demo faults come and go.
3. **Monitor page:** choose SC-01. Show the three **animated speedometers**
   (Health, Safety, CPU Load), the 7-sensor radar, the **Energy panel** (watch
   it switch between SUNLIGHT and ECLIPSE), and especially the **Scheduler
   Lanes** (explain higher lane = more important).
4. **Simulate page:** click **Launch** on **Thermal Cascade**. Switch back to
   Fleet or Monitor and watch recovery tasks appear and the craft heal. Each
   heal shows a **green "Stabilized" pill** explaining how it was fixed.
5. **Simulate page:** click **Launch** on **Multi-Fault Stress Test**. Watch
   SC-02 go into SAFE mode (red alert bar appears), then recover.
6. **Simulate page:** click **Launch** on **Watchdog Drill**. Wait ~7 seconds
   and watch the watchdog restart the frozen task.
7. **Analytics page:** click **Run benchmark on all 4 craft** to show real
   nanosecond kernel timings. Open the **Black Box** of a craft to show the
   recorded events. Click **Generate mission report**.
8. Point at the **orchestrator terminal** the whole time — it narrates
   everything in plain English.

---

## 13. Troubleshooting

| Problem | Fix |
|---------|-----|
| Browser shows nothing / "can't connect" | Wait a few more seconds; the dashboard terminal must finish starting. Then refresh. |
| Header says **NO LINK** | The orchestrator (port 3000) is not running. Check terminal #1 for errors. |
| **0/4 online** | The spacecraft did not start. Make sure `build.bat x64-debug` succeeded and `WatchCore_RTOS.exe` exists. |
| "WatchCore_RTOS.exe not found" | Run `build.bat x64-debug` first (or just use `start-all.bat`). |
| A port is already in use | Close old WatchCore windows, or end stray `WatchCore_RTOS.exe` / `node.exe` processes in Task Manager, then run again. |
| Build fails | Open a "Developer Command Prompt for VS" and make sure `cl.exe` works; the C++ workload must be installed. |
| Dashboard looks old / wrong | Hard-refresh the browser with **Ctrl + Shift + R**. |
| CPU gauge sits at one value | It only moves a little when idle; cause a fault in **Simulate** and watch CPU Load climb during recovery. |
| Too many pop-up pills | They auto-close after ~6 s; the demo injects faults every few seconds so this is normal. Use **Clear all faults** to calm things down. |

---

## Quick reference card

```
RUN EVERYTHING      start-all.bat
BUILD ONLY          build.bat x64-debug
RUN TESTS           tests\run_tests.bat
DASHBOARD           http://localhost:5173
REPORT              http://localhost:3000/api/report

PAGES               Fleet | Monitor | Simulate | Analytics
RESET               Simulate page -> "Clear all faults"
DEMO FAULT          Simulate page -> any fault button
SCENARIOS           Simulate page -> Launch on a scenario card
BENCHMARKS          Analytics page -> "Run benchmark on all 4 craft"
BLACK BOX           Analytics page -> Flight Recorder panel
PILLS               bottom-right popups: red = problem, green = fixed
GAUGES              Monitor page -> three animated speedometers
STOP                close the two black terminal windows
```
