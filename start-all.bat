@echo off
setlocal

REM ============================================================
REM WatchCore RTOS - launch the full stack:
REM   1. Build the FreeRTOS C simulator
REM   2. Launch the Node orchestrator (which spawns 4 spacecraft)
REM   3. Launch the Vite frontend
REM   4. Open the browser
REM ============================================================

set "ROOT=%~dp0"

REM --- Step 0: first-run setup (download kernel, install deps) if needed ---
if not exist "%ROOT%FreeRTOS-Kernel\tasks.c" (
    echo [0/4] FreeRTOS kernel not found - running first-time setup...
    set "WATCHCORE_NO_PAUSE=1"
    call "%ROOT%setup.bat" -Yes -SkipBuild
    set "WATCHCORE_NO_PAUSE="
    if errorlevel 1 (
        echo [ERROR] setup failed. Run setup.bat and fix the reported issues.
        exit /b 1
    )
)

REM --- Step 1: build the C simulator ---
echo [1/4] Building FreeRTOS C simulator...
call "%ROOT%build.bat" x64-debug
if errorlevel 1 (
    echo [ERROR] build.bat failed
    echo         If this is a fresh machine, run setup.bat first.
    exit /b 1
)

if not exist "%ROOT%out\build\x64-debug\WatchCore_RTOS.exe" (
    echo [ERROR] WatchCore_RTOS.exe not produced
    exit /b 1
)

REM --- Step 2: ensure backend deps are installed ---
if not exist "%ROOT%web\backend\node_modules" (
    echo [2/4] Installing backend deps...
    pushd "%ROOT%web\backend"
    call npm install --no-audit --no-fund
    popd
)

REM --- Step 3: ensure frontend deps are installed ---
if not exist "%ROOT%web\frontend\node_modules" (
    echo [3/4] Installing frontend deps...
    pushd "%ROOT%web\frontend"
    call npm install --no-audit --no-fund
    popd
)

REM --- Step 4: launch both servers in separate windows ---
echo [4/4] Launching orchestrator and dashboard...
start "WatchCore Orchestrator (backend :3000)" cmd /K "cd /D ""%ROOT%web\backend"" && npm run dev"
timeout /t 3 /nobreak >nul
start "WatchCore Dashboard (frontend :5173)" cmd /K "cd /D ""%ROOT%web\frontend"" && npm run dev"
timeout /t 4 /nobreak >nul

start "" "http://localhost:5173/"

echo.
echo ============================================================
echo  WatchCore stack is running.
echo    Orchestrator   http://localhost:3000   (REST + WebSocket)
echo    Mission Ops    http://localhost:5173   (React dashboard)
echo    Spacecraft     127.0.0.1:8081..8084    (4 x WatchCore_RTOS.exe)
echo.
echo  Close the two cmd windows opened above to shut everything down.
echo ============================================================
exit /b 0
