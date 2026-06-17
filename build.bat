@echo off
setlocal

set "ARCH=x64"
set "PRESET=x64-debug"

if not "%~1"=="" set "PRESET=%~1"
if /I "%PRESET:~0,3%"=="x86" set "ARCH=x86"

:: Locate Visual Studio using vswhere when available, with the local VS 2026 path as a fallback.
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VSINSTALL="
if exist "%VSWHERE%" (
    for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSINSTALL=%%i"
)

if "%VSINSTALL%"=="" if exist "C:\Program Files\Microsoft Visual Studio\18\Community" set "VSINSTALL=C:\Program Files\Microsoft Visual Studio\18\Community"
if "%VSINSTALL%"=="" if exist "C:\Program Files\Microsoft Visual Studio\2022\Community" set "VSINSTALL=C:\Program Files\Microsoft Visual Studio\2022\Community"

if "%VSINSTALL%"=="" (
    echo [ERROR] Could not locate Visual Studio with C++ tools.
    exit /b 1
)

:: Initialize VS environment
call "%VSINSTALL%\VC\Auxiliary\Build\vcvarsall.bat" %ARCH%
if %errorlevel% neq 0 (
    echo [ERROR] Failed to initialize VS compiler environment.
    exit /b %errorlevel%
)

:: Add Ninja to PATH so CMake can find it automatically
set "PATH=%VSINSTALL%\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja;%PATH%"
set "CMAKE_EXE=%VSINSTALL%\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"

if not exist "%CMAKE_EXE%" (
    set "CMAKE_EXE=cmake"
)

echo --- Configuring Project ---
"%CMAKE_EXE%" --preset %PRESET%
if %errorlevel% neq 0 (
    echo [ERROR] CMake configuration failed.
    exit /b %errorlevel%
)

echo --- Building Executable ---
"%CMAKE_EXE%" --build out/build/%PRESET%
if %errorlevel% neq 0 (
    echo [ERROR] Build failed.
    exit /b %errorlevel%
)

echo [SUCCESS] Build completed successfully.
exit /b 0
