cmake_minimum_required(VERSION 3.16)
project(WatchCore_RTOS C)

# Export compilation database for language server integration.
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ----------------------------------------------------------------
# Compiler flags (MSVC Windows simulator build)
# ----------------------------------------------------------------
if (MSVC)
    add_compile_options(/W3 /WX- /Od /Zi /wd4244 /wd4267 /wd4996)
    add_compile_definitions(_CRT_SECURE_NO_WARNINGS)
else()
    add_compile_options(-Wall -Wextra -Wno-unused-parameter -O0 -g)
endif()

# ----------------------------------------------------------------
# WatchCore application sources
# ----------------------------------------------------------------
set(SOURCES_CORE
    src/main.c
    src/event_manager/event_manager.c
    src/emergency/emergency_tasks.c
    src/monitoring/monitoring_tasks.c
    src/watchdog/watchdog.c
    src/logging/logging.c
    src/state_machine/system_state.c
    src/ipc/ipc_manager.c
    src/fault_injection/fault_injection.c
    src/command_processor/command_processor.c
    src/diagnostics/diagnostics.c
    src/power_manager/power_manager.c
    src/data_logger/data_logger.c
    src/benchmarks/benchmarks.c
    src/safety_manager/safety_manager.c
    src/hires_clock/hires_clock.c
    src/power_model/power_model.c
    src/flight_recorder/flight_recorder.c
    src/telemetry_server/telemetry_server.c
)

# ----------------------------------------------------------------
# FreeRTOS kernel sources
# ----------------------------------------------------------------
set(freertos_kernel_SOURCE_DIR "${CMAKE_SOURCE_DIR}/FreeRTOS-Kernel")

set(SOURCES_KERNEL
    ${freertos_kernel_SOURCE_DIR}/tasks.c
    ${freertos_kernel_SOURCE_DIR}/queue.c
    ${freertos_kernel_SOURCE_DIR}/list.c
    ${freertos_kernel_SOURCE_DIR}/timers.c
    ${freertos_kernel_SOURCE_DIR}/event_groups.c
    ${freertos_kernel_SOURCE_DIR}/stream_buffer.c
    ${freertos_kernel_SOURCE_DIR}/portable/MemMang/heap_4.c
    ${freertos_kernel_SOURCE_DIR}/portable/MSVC-MingW/port.c
)

# ----------------------------------------------------------------
# Executable (Windows simulator only)
# ----------------------------------------------------------------
if (NOT WIN32)
    message(FATAL_ERROR "WatchCore RTOS builds on Windows with the MSVC FreeRTOS simulator port.")
endif()

add_executable(${PROJECT_NAME} ${SOURCES_CORE} ${SOURCES_KERNEL})

target_include_directories(${PROJECT_NAME} PRIVATE
    include
    ${freertos_kernel_SOURCE_DIR}/include
    ${freertos_kernel_SOURCE_DIR}/portable/MSVC-MingW
)

target_link_libraries(${PROJECT_NAME} PRIVATE ws2_32 winmm)
