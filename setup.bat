@echo off
REM ============================================================
REM  WatchCore RTOS - installer
REM  Prepares a fresh Windows PC: checks/installs prerequisites,
REM  downloads the FreeRTOS kernel, installs web deps, builds the
REM  C simulator. Double-click this file, or run:  setup.bat
REM
REM  Pass-through flags (optional):
REM     setup.bat -NoInstall    just check prerequisites
REM     setup.bat -SkipBuild    skip building the C simulator
REM     setup.bat -Yes          auto-confirm winget installs
REM ============================================================
setlocal
set "ROOT=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%setup.ps1" %*
set "RC=%errorlevel%"

if not "%RC%"=="0" (
    echo.
    echo [setup] finished with errors ^(exit code %RC%^). See the messages above.
)

REM Keep the window open if a user double-clicked this file (but not when
REM another script, e.g. start-all.bat, invoked us non-interactively).
if not defined WATCHCORE_NO_PAUSE (
    echo %CMDCMDLINE% | find /i "/c" >nul && pause
)

exit /b %RC%
