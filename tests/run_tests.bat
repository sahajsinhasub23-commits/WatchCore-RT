@echo off
setlocal

REM Quick host build & run of tests\test_runtime.c.
REM Must be launched from a "x64 Native Tools Command Prompt for VS 2022/2026".

set "ROOT=%~dp0..\"
set "OUT=%~dp0test_runtime.exe"

cl /nologo /Fe:"%OUT%" ^
   /I "%ROOT%include" ^
   /I "%ROOT%FreeRTOS-Kernel\include" ^
   /I "%ROOT%FreeRTOS-Kernel\portable\MSVC-MingW" ^
   "%~dp0test_runtime.c" ^
   "%ROOT%FreeRTOS-Kernel\tasks.c" ^
   "%ROOT%FreeRTOS-Kernel\queue.c" ^
   "%ROOT%FreeRTOS-Kernel\list.c" ^
   "%ROOT%FreeRTOS-Kernel\timers.c" ^
   "%ROOT%FreeRTOS-Kernel\event_groups.c" ^
   "%ROOT%FreeRTOS-Kernel\stream_buffer.c" ^
   "%ROOT%FreeRTOS-Kernel\portable\MemMang\heap_4.c" ^
   "%ROOT%FreeRTOS-Kernel\portable\MSVC-MingW\port.c" ^
   /D_CRT_SECURE_NO_WARNINGS /Zi /W3 ws2_32.lib winmm.lib

if errorlevel 1 (
    echo [ERROR] Test build failed.
    exit /b 1
)

echo ---- running tests ----
"%OUT%"
exit /b %errorlevel%
