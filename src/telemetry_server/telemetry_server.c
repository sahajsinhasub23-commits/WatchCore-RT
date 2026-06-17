#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <winsock2.h>
#include <ws2tcpip.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "telemetry_server.h"
#include "logging.h"
#include "ipc_manager.h"
#include "system_state.h"
#include "event_manager.h"
#include "command_processor.h"
#include "diagnostics.h"
#include "power_manager.h"
#include "emergency_tasks.h"
#include "watchdog.h"
#include "data_logger.h"
#include "benchmarks.h"
#include "safety_manager.h"
#include "monitoring_tasks.h"
#include "power_model.h"
#include "flight_recorder.h"
#include "config.h"
#include "task.h"
#include "queue.h"

#define MAX_REPORTABLE_TASKS 24

#pragma comment(lib, "ws2_32.lib")

#define DEFAULT_PORT 8080
#define MAX_CLIENTS 4

/* Runtime-configurable identity (set by main from argv / env). */
static int  g_port = DEFAULT_PORT;
static char g_craftId[32] = "SC-01";

void TelemetryServer_SetIdentity(int port, const char *craftId) {
    if (port > 0 && port < 65536) g_port = port;
    if (craftId && *craftId) {
        strncpy(g_craftId, craftId, sizeof(g_craftId) - 1);
        g_craftId[sizeof(g_craftId) - 1] = '\0';
    }
}
#define LOG_QUEUE_LENGTH 25
#define LOG_BUFFER_SIZE 256

static SOCKET server_socket = INVALID_SOCKET;
static SOCKET client_sockets[MAX_CLIENTS];
static QueueHandle_t xLogQueue = NULL;
static uint32_t ulIPCTrafficCount = 0;
static uint32_t ulActiveFaultBits = 0;
static float fLatestCpuUsage = 0.0f;
static float fLatestTemperature = 25.0f;
static float fLatestRadiation = 10.0f;
static float fLatestBattery = 80.0f;
static float fLatestSolar = 2.5f;
static float fLatestAttitude = 1.0f;
static float fLatestPressure = 150.0f;
static float fLatestComm = -60.0f;
static uint32_t ulLatestTelemetrySamples = 0;
static int xSPIBusLocked = 0;
static int xI2CBusLocked = 0;
static int xUARTBusLocked = 0;

static void TelemetryServerTask(void* pvParameters);

void TelemetryServer_Init(void) {
    // Create the RTOS queue for logs
    xLogQueue = xQueueCreate(LOG_QUEUE_LENGTH, LOG_BUFFER_SIZE);
    configASSERT(xLogQueue != NULL);

    for (int i = 0; i < MAX_CLIENTS; i++) {
        client_sockets[i] = INVALID_SOCKET;
    }

    // Spawn the background TCP telemetry task
    BaseType_t created = xTaskCreate(TelemetryServerTask, "TelemSrv", 1024, NULL, 2, NULL);
    configASSERT(created == pdPASS);
}

void TelemetryServer_QueueLog(const char* logMsg) {
    if (xLogQueue != NULL) {
        char buffer[LOG_BUFFER_SIZE];
        strncpy(buffer, logMsg, LOG_BUFFER_SIZE - 1);
        buffer[LOG_BUFFER_SIZE - 1] = '\0';
        xQueueSend(xLogQueue, buffer, 0); // Non-blocking send
    }
}

void TelemetryServer_IncrementIPCTraffic(void) {
    ulIPCTrafficCount++;
}

void TelemetryServer_UpdateTelemetrySnapshot(const TelemetryData_t* telemetry) {
    if (telemetry == NULL) {
        return;
    }

    switch (telemetry->type) {
        case TELEMETRY_TYPE_CPU:
            fLatestCpuUsage = telemetry->data.cpuUsage;
            break;
        case TELEMETRY_TYPE_HEAP:
            break;
        case TELEMETRY_TYPE_SENSORS:
            fLatestTemperature = telemetry->data.sensors.temperature;
            fLatestRadiation = telemetry->data.sensors.radiation;
            fLatestBattery = telemetry->data.sensors.batteryLevel;
            fLatestSolar = telemetry->data.sensors.solarCurrent;
            fLatestAttitude = telemetry->data.sensors.attitudeRate;
            fLatestPressure = telemetry->data.sensors.pressure;
            fLatestComm = telemetry->data.sensors.commSignal;
            break;
        default:
            break;
    }

    ulLatestTelemetrySamples++;
}

void TelemetryServer_SetFaultBits(uint32_t faultBits) {
    ulActiveFaultBits = faultBits;
}

void TelemetryServer_SetBusState(const char* busName, bool locked) {
    int value = locked ? 1 : 0;

    if (busName == NULL) {
        return;
    }

    if (strcmp(busName, "spi") == 0) {
        xSPIBusLocked = value;
    } else if (strcmp(busName, "i2c") == 0) {
        xI2CBusLocked = value;
    } else if (strcmp(busName, "uart") == 0) {
        xUARTBusLocked = value;
    }
}

static const char* GetTaskStateString(eTaskState state) {
    switch (state) {
        case eRunning:   return "RUNNING";
        case eReady:     return "READY";
        case eBlocked:   return "BLOCKED";
        case eSuspended: return "SUSPENDED";
        case eDeleted:   return "DELETED";
        default:         return "UNKNOWN";
    }
}

static const char* GetModeString(SystemMode_t mode) {
    switch (mode) {
        case SYS_MODE_NORMAL:    return "NORMAL";
        case SYS_MODE_WARNING:   return "WARNING";
        case SYS_MODE_DEGRADED:  return "DEGRADED";
        case SYS_MODE_EMERGENCY: return "EMERGENCY";
        case SYS_MODE_SAFE_MODE: return "SAFE";
        case SYS_MODE_RECOVERY:  return "RECOVERY";
        default:                 return "UNKNOWN";
    }
}

static uint32_t FaultNameToBit(const char* faultName) {
    if (faultName == NULL) {
        return FAULT_NONE;
    }

    if (strcmp(faultName, "temp") == 0 || strcmp(faultName, "HIGH_TEMP") == 0) {
        return FAULT_HIGH_TEMP;
    }
    if (strcmp(faultName, "battery") == 0 || strcmp(faultName, "LOW_BATTERY") == 0) {
        return FAULT_LOW_BATTERY;
    }
    if (strcmp(faultName, "radiation") == 0 || strcmp(faultName, "RADIATION") == 0) {
        return FAULT_RADIATION;
    }
    if (strcmp(faultName, "memory") == 0 || strcmp(faultName, "MEMORY_EXHAUSTION") == 0) {
        return FAULT_MEMORY_EXHAUSTION;
    }
    if (strcmp(faultName, "comm") == 0 || strcmp(faultName, "COMM_TIMEOUT") == 0) {
        return FAULT_COMM_TIMEOUT;
    }
    if (strcmp(faultName, "solar") == 0 || strcmp(faultName, "SOLAR_LOW") == 0) {
        return FAULT_SOLAR_LOW;
    }
    if (strcmp(faultName, "attitude") == 0 || strcmp(faultName, "ATTITUDE") == 0) {
        return FAULT_ATTITUDE;
    }
    if (strcmp(faultName, "pressure") == 0 || strcmp(faultName, "PRESSURE") == 0) {
        return FAULT_PRESSURE;
    }
    if (strcmp(faultName, "hang") == 0 || strcmp(faultName, "TASK_HANG") == 0) {
        return FAULT_TASK_HANG;
    }
    if (strcmp(faultName, "queue") == 0 || strcmp(faultName, "QUEUE_OVERFLOW") == 0) {
        return FAULT_QUEUE_OVERFLOW;
    }
    if (strcmp(faultName, "deadlock") == 0 || strcmp(faultName, "DEADLOCK") == 0) {
        return FAULT_DEADLOCK;
    }

    return FAULT_NONE;
}

static void SendJsonResponse(SOCKET client, const char* body) {
    char header[256];
    int bodyLen = (int)strlen(body);
    int headerLen = snprintf(header, sizeof(header),
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: application/json; charset=utf-8\r\n"
        "Content-Length: %d\r\n"
        "Connection: close\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "\r\n",
        bodyLen);

    send(client, header, headerLen, 0);
    send(client, body, bodyLen, 0);
}

static void BroadcastToClients(const char* data, int length) {
    int activeClients = 0;
    for (int i = 0; i < MAX_CLIENTS; i++) {
        if (client_sockets[i] != INVALID_SOCKET) {
            activeClients++;
            int sent = send(client_sockets[i], data, length, 0);
            if (sent == SOCKET_ERROR) {
                int err = WSAGetLastError();
                if (err != WSAEWOULDBLOCK) {
                    char logMsg[128];
                    snprintf(logMsg, sizeof(logMsg), "Socket failure on slot %d (error %d)", i, err);
                    Log_Event(LOG_WARN, "TelemSrv", SYS_MODE_NORMAL, "SocketFailure", logMsg);
                    closesocket(client_sockets[i]);
                    client_sockets[i] = INVALID_SOCKET;
                }
            }
        }
    }
    (void)activeClients;
}

/* Gracefully close a TCP connection to prevent ERR_CONNECTION_RESET and TIME_WAIT issues */
static void GracefulClose(SOCKET client) {
    // 1. Shutdown the send side of the TCP connection
    shutdown(client, SD_SEND);

    // 2. Drain any remaining unread bytes from the client to ensure clean TCP close
    char tempBuf[512];
    int res;
    
    // Set socket to non-blocking
    u_long nonBlocking = 1;
    ioctlsocket(client, FIONBIO, &nonBlocking);

    // Give it up to 50ms total to complete the handshake
    for (int i = 0; i < 5; i++) {
        res = recv(client, tempBuf, sizeof(tempBuf), 0);
        if (res == 0 || res == SOCKET_ERROR) {
            int err = WSAGetLastError();
            if (res == SOCKET_ERROR && err == WSAEWOULDBLOCK) {
                vTaskDelay(pdMS_TO_TICKS(10));
                continue;
            }
            break;
        }
    }

    // 3. Close the socket completely
    closesocket(client);
}

/* Read HTTP request headers non-blockingly using select with a timeout */
static int ReadHTTPRequest(SOCKET client, char* buffer, int maxLen, const char* clientIP, int clientPort) {
    int totalBytes = 0;
    int timeoutMs = 500; // 500ms max timeout
    int elapsedMs = 0;

    // Set to non-blocking
    u_long nonBlocking = 1;
    ioctlsocket(client, FIONBIO, &nonBlocking);

    while (totalBytes < maxLen - 1) {
        fd_set readfds;
        FD_ZERO(&readfds);
        FD_SET(client, &readfds);

        struct timeval tv;
        tv.tv_sec = 0;
        tv.tv_usec = 10000; // 10ms select timeout

        int sel = select(0, &readfds, NULL, NULL, &tv);
        if (sel > 0) {
            int received = recv(client, buffer + totalBytes, maxLen - 1 - totalBytes, 0);
            if (received > 0) {
                totalBytes += received;
                buffer[totalBytes] = '\0';
                // Check if we finished receiving the HTTP headers
                if (strstr(buffer, "\r\n\r\n") != NULL || strstr(buffer, "\n\n") != NULL) {
                    return totalBytes;
                }
            } else if (received == 0) {
                break; // Client closed connection
            } else {
                int err = WSAGetLastError();
                if (err != WSAEWOULDBLOCK) {
                    return -1; // Socket error
                }
            }
        } else if (sel < 0) {
            return -1; // Select error
        }

        vTaskDelay(pdMS_TO_TICKS(10));
        elapsedMs += 10;
        if (elapsedMs >= timeoutMs) {
            break; // Timeout
        }
    }

    return totalBytes > 0 ? totalBytes : -1;
}

static void TelemetryServerTask(void* pvParameters) {
    (void)pvParameters;
    
    WSADATA wsaData;
    int res = WSAStartup(MAKEWORD(2, 2), &wsaData);
    if (res != 0) {
        Log_Event(LOG_ERROR, "TelemSrv", SYS_MODE_NORMAL, "InitError", "WSAStartup failed");
        while (res != 0) {
            vTaskDelay(pdMS_TO_TICKS(5000));
            res = WSAStartup(MAKEWORD(2, 2), &wsaData);
        }
    }

    // Static buffers to prevent stack overflow in FreeRTOS task
    static char sendBuffer[8192];
    static char taskJson[4096];
    static char reqBuffer[4096];
    static char localPath[512];
    static char fileBuf[2048];
    static char escapedLog[LOG_BUFFER_SIZE * 2];
    static char logBuffer[LOG_BUFFER_SIZE];

    while (1) {
        // Ensure server socket is alive, binded, and listening
        if (server_socket == INVALID_SOCKET) {
            server_socket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
            if (server_socket == INVALID_SOCKET) {
                Log_Event(LOG_ERROR, "TelemSrv", SYS_MODE_NORMAL, "InitError", "Socket creation failed");
                vTaskDelay(pdMS_TO_TICKS(2000));
                continue;
            }

            // Make socket non-blocking
            u_long nonBlockingMode = 1;
            ioctlsocket(server_socket, FIONBIO, &nonBlockingMode);

            // Reuse Address option
            int optval = 1;
            setsockopt(server_socket, SOL_SOCKET, SO_REUSEADDR, (const char*)&optval, sizeof(optval));

            struct sockaddr_in server_addr;
            server_addr.sin_family = AF_INET;
            server_addr.sin_addr.s_addr = INADDR_ANY;
            server_addr.sin_port = htons((unsigned short)g_port);

            if (bind(server_socket, (struct sockaddr*)&server_addr, sizeof(server_addr)) == SOCKET_ERROR) {
                Log_Event(LOG_ERROR, "TelemSrv", SYS_MODE_NORMAL, "BindError", "Socket bind failed");
                closesocket(server_socket);
                server_socket = INVALID_SOCKET;
                vTaskDelay(pdMS_TO_TICKS(2000));
                continue;
            }

            if (listen(server_socket, SOMAXCONN) == SOCKET_ERROR) {
                Log_Event(LOG_ERROR, "TelemSrv", SYS_MODE_NORMAL, "ListenError", "Socket listen failed");
                closesocket(server_socket);
                server_socket = INVALID_SOCKET;
                vTaskDelay(pdMS_TO_TICKS(2000));
                continue;
            }

            char startupMsg[128];
            snprintf(startupMsg, sizeof(startupMsg),
                "HTTP SSE Live Server started [craft=%s, port=%d]", g_craftId, g_port);
            Log_Event(LOG_INFO, "TelemSrv", SYS_MODE_NORMAL, "Startup", startupMsg);
        }

        // 1. Accept any incoming connections (loop to drain backlog)
        struct sockaddr_in client_addr;
        int client_addr_len = sizeof(client_addr);
        SOCKET new_client;

        while ((new_client = accept(server_socket, (struct sockaddr*)&client_addr, &client_addr_len)) != INVALID_SOCKET) {
            // New connection!
            char clientIP[64] = "unknown";
            inet_ntop(AF_INET, &client_addr.sin_addr, clientIP, sizeof(clientIP));
            int clientPort = ntohs(client_addr.sin_port);
            
            char logMsg[128];
            snprintf(logMsg, sizeof(logMsg), "Connection accepted from %s:%d", clientIP, clientPort);
            Log_Event(LOG_INFO, "TelemSrv", SYS_MODE_NORMAL, "ClientConnect", logMsg);

            // Read the incoming HTTP GET request non-blockingly with select-based helper
            int bytesReceived = ReadHTTPRequest(new_client, reqBuffer, sizeof(reqBuffer), clientIP, clientPort);
            if (bytesReceived > 0) {
                // Parse the request line
                char method[16] = {0};
                char path[512] = {0};
                if (sscanf(reqBuffer, "%15s %511s", method, path) == 2) {
                    char requestTarget[512];
                    strncpy(requestTarget, path, sizeof(requestTarget) - 1);
                    requestTarget[sizeof(requestTarget) - 1] = '\0';

                    // Strip query parameters or hash fragments
                    char* queryStr = strchr(path, '?');
                    if (queryStr != NULL) {
                        *queryStr = '\0';
                    }
                    char* hashStr = strchr(path, '#');
                    if (hashStr != NULL) {
                        *hashStr = '\0';
                    }

                    char reqLog[128];
                    snprintf(reqLog, sizeof(reqLog), "HTTP %s %s from %s:%d", method, path, clientIP, clientPort);
                    Log_Event(LOG_INFO, "TelemSrv", SYS_MODE_NORMAL, "HttpRequest", reqLog);

                    if (strcmp(method, "OPTIONS") == 0) {
                        const char* http_options = 
                            "HTTP/1.1 204 No Content\r\n"
                            "Access-Control-Allow-Origin: *\r\n"
                            "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
                            "Access-Control-Allow-Headers: *\r\n"
                            "Connection: close\r\n"
                            "\r\n";
                        send(new_client, http_options, (int)strlen(http_options), 0);
                        GracefulClose(new_client);
                    }
                    else if (strcmp(path, "/api/fault") == 0) {
                        char originalPath[512];
                        char faultName[64] = {0};
                        char action[16] = "set";
                        uint32_t faultBit = FAULT_NONE;

                        strncpy(originalPath, requestTarget, sizeof(originalPath) - 1);
                        originalPath[sizeof(originalPath) - 1] = '\0';

                        char* query = strchr(originalPath, '?');
                        if (query != NULL) {
                            query++;
                            char* token = strtok(query, "&");
                            while (token != NULL) {
                                if (strncmp(token, "name=", 5) == 0) {
                                    strncpy(faultName, token + 5, sizeof(faultName) - 1);
                                    faultName[sizeof(faultName) - 1] = '\0';
                                } else if (strncmp(token, "action=", 7) == 0) {
                                    strncpy(action, token + 7, sizeof(action) - 1);
                                    action[sizeof(action) - 1] = '\0';
                                }
                                token = strtok(NULL, "&");
                            }
                        }

                        faultBit = FaultNameToBit(faultName);
                        if (faultBit != FAULT_NONE) {
                            /* Route through the command processor: drops into
                             * the message buffer and notifies CmdProc to act. */
                            CommandMessage_t cmd = {0};
                            cmd.id = (strcmp(action, "clear") == 0) ? CMD_CLEAR_FAULT : CMD_SET_FAULT;
                            cmd.arg32 = faultBit;
                            strncpy(cmd.label, faultName, sizeof(cmd.label) - 1);
                            cmd.label[sizeof(cmd.label) - 1] = '\0';
                            CommandProcessor_Submit(&cmd);

                            snprintf(sendBuffer, sizeof(sendBuffer),
                                "{\"ok\":true,\"fault\":\"%s\",\"action\":\"%s\"}",
                                faultName,
                                (strcmp(action, "clear") == 0) ? "clear" : "set");
                            SendJsonResponse(new_client, sendBuffer);
                        } else {
                            const char* badFault =
                                "HTTP/1.1 400 Bad Request\r\n"
                                "Content-Type: application/json; charset=utf-8\r\n"
                                "Content-Length: 35\r\n"
                                "Connection: close\r\n"
                                "Access-Control-Allow-Origin: *\r\n"
                                "\r\n"
                                "{\"ok\":false,\"error\":\"bad fault\"}";
                            send(new_client, badFault, (int)strlen(badFault), 0);
                        }
                        GracefulClose(new_client);
                    }
                    else if (strcmp(path, "/api/suspend") == 0 || strcmp(path, "/api/resume") == 0) {
                        /* /api/suspend?task=NAME   /api/resume?task=NAME */
                        char originalPath[512];
                        char taskName[32] = {0};
                        strncpy(originalPath, requestTarget, sizeof(originalPath) - 1);
                        originalPath[sizeof(originalPath) - 1] = '\0';
                        char *q = strchr(originalPath, '?');
                        if (q) {
                            q++;
                            char *tok = strtok(q, "&");
                            while (tok) {
                                if (strncmp(tok, "task=", 5) == 0) {
                                    strncpy(taskName, tok + 5, sizeof(taskName) - 1);
                                    taskName[sizeof(taskName) - 1] = '\0';
                                }
                                tok = strtok(NULL, "&");
                            }
                        }
                        if (taskName[0] != '\0') {
                            if (strcmp(path, "/api/suspend") == 0) Benchmarks_SuspendTask(taskName);
                            else                                    Benchmarks_ResumeTask(taskName);
                            snprintf(sendBuffer, sizeof(sendBuffer),
                                "{\"ok\":true,\"task\":\"%s\",\"action\":\"%s\"}",
                                taskName, (strcmp(path, "/api/suspend") == 0) ? "suspend" : "resume");
                            SendJsonResponse(new_client, sendBuffer);
                        } else {
                            const char *bad = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
                            send(new_client, bad, (int)strlen(bad), 0);
                        }
                        GracefulClose(new_client);
                    }
                    else if (strcmp(path, "/api/bench") == 0) {
                        Benchmarks_TriggerOneShot();
                        SendJsonResponse(new_client, "{\"ok\":true}");
                        GracefulClose(new_client);
                    }
                    else if (strcmp(path, "/api/blackbox") == 0) {
                        /* Dump the flight recorder (black box) as JSON. */
                        static FlightRecord_t recs[FR_CAPACITY];
                        size_t cnt = FlightRecorder_Dump(recs, FR_CAPACITY);
                        int off = snprintf(sendBuffer, sizeof(sendBuffer),
                            "{\"craft\":\"%s\",\"total\":%lu,\"records\":[",
                            g_craftId, (unsigned long)FlightRecorder_GetTotal());
                        for (size_t i = 0; i < cnt; i++) {
                            const char *lvl = (recs[i].level == LOG_CRITICAL) ? "CRIT"
                                            : (recs[i].level == LOG_ERROR) ? "ERROR"
                                            : (recs[i].level == LOG_WARN) ? "WARN" : "INFO";
                            off += snprintf(sendBuffer + off, sizeof(sendBuffer) - off,
                                "%s{\"tick\":%lu,\"level\":\"%s\",\"tag\":\"%s\",\"text\":\"%s\"}",
                                (i ? "," : ""), (unsigned long)recs[i].tick, lvl,
                                recs[i].tag, recs[i].text);
                            if (off >= (int)sizeof(sendBuffer) - 80) break;
                        }
                        snprintf(sendBuffer + off, sizeof(sendBuffer) - off, "]}");
                        SendJsonResponse(new_client, sendBuffer);
                        GracefulClose(new_client);
                    }
                    else if (strcmp(path, "/telemetry") == 0 || strstr(path, "/telemetry") != NULL) {
                        // Respond with SSE Handshake
                        const char* sse_handshake = 
                            "HTTP/1.1 200 OK\r\n"
                            "Content-Type: text/event-stream; charset=utf-8\r\n"
                            "Cache-Control: no-cache\r\n"
                            "Connection: keep-alive\r\n"
                            "Access-Control-Allow-Origin: *\r\n"
                            "\r\n";
                        send(new_client, sse_handshake, (int)strlen(sse_handshake), 0);

                        // Set socket back to non-blocking for SSE streaming
                        u_long clientNonBlocking = 1;
                        ioctlsocket(new_client, FIONBIO, &clientNonBlocking);

                        // Store socket
                        int stored = 0;
                        for (int i = 0; i < MAX_CLIENTS; i++) {
                            if (client_sockets[i] == INVALID_SOCKET) {
                                client_sockets[i] = new_client;
                                stored = 1;
                                char sseLog[128];
                                snprintf(sseLog, sizeof(sseLog), "SSE client registered in slot %d", i);
                                Log_Event(LOG_INFO, "TelemSrv", SYS_MODE_NORMAL, "SSEConnect", sseLog);
                                break;
                            }
                        }
                        if (!stored) {
                            Log_Event(LOG_WARN, "TelemSrv", SYS_MODE_NORMAL, "ServerFull", "Max clients reached, closing");
                            GracefulClose(new_client);
                        }
                    } else if (strcmp(path, "/favicon.ico") == 0) {
                        /* Browsers auto-request favicon.ico. Serve a tiny inline
                         * SVG so we don't pollute the log with FileNotFound. */
                        static const char *favBody =
                            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>"
                            "<rect width='32' height='32' rx='6' fill='#0f172a'/>"
                            "<circle cx='16' cy='16' r='6' fill='none' stroke='#5ac8fa' stroke-width='2'/>"
                            "<circle cx='16' cy='16' r='2' fill='#5ac8fa'/></svg>";
                        char favHdr[256];
                        int favLen = (int)strlen(favBody);
                        int favHdrLen = snprintf(favHdr, sizeof(favHdr),
                            "HTTP/1.1 200 OK\r\n"
                            "Content-Type: image/svg+xml\r\n"
                            "Content-Length: %d\r\n"
                            "Cache-Control: max-age=86400\r\n"
                            "Connection: close\r\n\r\n", favLen);
                        send(new_client, favHdr, favHdrLen, 0);
                        send(new_client, favBody, favLen, 0);
                        GracefulClose(new_client);
                    } else {
                        // Static file serving!
                        if (strcmp(path, "/") == 0 || strcmp(path, "/index.html") == 0 || strstr(path, "/index.html") != NULL) {
                            strncpy(localPath, "dashboard/index.html", sizeof(localPath) - 1);
                            localPath[sizeof(localPath) - 1] = '\0';
                        } else {
                            // Strip leading slash
                            const char* relPath = path;
                            while (*relPath == '/') {
                                relPath++;
                            }
                            if (strstr(relPath, "..") != NULL) {
                                const char* http_400 = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                                send(new_client, http_400, (int)strlen(http_400), 0);
                                GracefulClose(new_client);
                                continue;
                            }
                            snprintf(localPath, sizeof(localPath), "dashboard/%s", relPath);
                        }

                        FILE* f = fopen(localPath, "rb");
                        if (f != NULL) {
                            fseek(f, 0, SEEK_END);
                            long fileSize = ftell(f);
                            fseek(f, 0, SEEK_SET);

                            const char* contentType = "application/octet-stream";
                            if (strstr(localPath, ".html") != NULL || strstr(localPath, ".htm") != NULL) {
                                contentType = "text/html; charset=utf-8";
                            } else if (strstr(localPath, ".css") != NULL) {
                                contentType = "text/css; charset=utf-8";
                            } else if (strstr(localPath, ".js") != NULL) {
                                contentType = "application/javascript; charset=utf-8";
                            } else if (strstr(localPath, ".svg") != NULL) {
                                contentType = "image/svg+xml; charset=utf-8";
                            } else if (strstr(localPath, ".ico") != NULL) {
                                contentType = "image/x-icon";
                            } else if (strstr(localPath, ".png") != NULL) {
                                contentType = "image/png";
                            } else if (strstr(localPath, ".jpg") != NULL || strstr(localPath, ".jpeg") != NULL) {
                                contentType = "image/jpeg";
                            } else if (strstr(localPath, ".json") != NULL) {
                                contentType = "application/json; charset=utf-8";
                            }

                            /* Cache-Control: no-store prevents the browser from
                             * serving a stale dashboard build after the binary
                             * is rebuilt. Without it, stale JS would keep
                             * trying to render fields that no longer exist. */
                            int headerLen = snprintf(sendBuffer, sizeof(sendBuffer),
                                "HTTP/1.1 200 OK\r\n"
                                "Content-Type: %s\r\n"
                                "Content-Length: %ld\r\n"
                                "Cache-Control: no-store, no-cache, must-revalidate\r\n"
                                "Pragma: no-cache\r\n"
                                "Connection: close\r\n"
                                "Access-Control-Allow-Origin: *\r\n"
                                "\r\n",
                                contentType, fileSize);
                            send(new_client, sendBuffer, headerLen, 0);

                            // Send chunk-by-chunk
                            int readBytes;
                            while ((readBytes = (int)fread(fileBuf, 1, sizeof(fileBuf), f)) > 0) {
                                send(new_client, fileBuf, readBytes, 0);
                            }
                            fclose(f);

                            char serveLog[128];
                            snprintf(serveLog, sizeof(serveLog), "Served static asset %s (%ld bytes) to %s:%d", localPath, fileSize, clientIP, clientPort);
                            Log_Event(LOG_INFO, "TelemSrv", SYS_MODE_NORMAL, "FileServed", serveLog);
                        } else {
                            char errLog[128];
                            snprintf(errLog, sizeof(errLog), "Static asset not found: %s", localPath);
                            Log_Event(LOG_WARN, "TelemSrv", SYS_MODE_NORMAL, "FileNotFound", errLog);

                            const char* http_404 = 
                                "HTTP/1.1 404 Not Found\r\n"
                                "Content-Type: text/plain; charset=utf-8\r\n"
                                "Content-Length: 9\r\n"
                                "Connection: close\r\n"
                                "Access-Control-Allow-Origin: *\r\n"
                                "\r\n"
                                "Not Found";
                            send(new_client, http_404, (int)strlen(http_404), 0);
                        }
                        GracefulClose(new_client);
                    }
                } else {
                    Log_Event(LOG_WARN, "TelemSrv", SYS_MODE_NORMAL, "ParseError", "Failed to parse HTTP request");
                    const char* http_400 = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                    send(new_client, http_400, (int)strlen(http_400), 0);
                    GracefulClose(new_client);
                }
            } else {
                if (bytesReceived == SOCKET_ERROR) {
                    int err = WSAGetLastError();
                    if (err != WSAEWOULDBLOCK) {
                        char errLog[128];
                        snprintf(errLog, sizeof(errLog), "Recv failed on new socket (error %d)", err);
                        Log_Event(LOG_WARN, "TelemSrv", SYS_MODE_NORMAL, "RecvError", errLog);
                    }
                }
                GracefulClose(new_client);
            }
        }

        // Check for accept errors other than WSAEWOULDBLOCK
        int acceptErr = WSAGetLastError();
        if (acceptErr != WSAEWOULDBLOCK && acceptErr != 0) {
            char errLog[128];
            snprintf(errLog, sizeof(errLog), "Accept socket failed (error %d)", acceptErr);
            Log_Event(LOG_WARN, "TelemSrv", SYS_MODE_NORMAL, "AcceptError", errLog);
        }

        // 2. Stream Live System Telemetry to all active clients (every 200ms)
        // Check active client socket statuses first (clean up disconnected clients)
        for (int i = 0; i < MAX_CLIENTS; i++) {
            if (client_sockets[i] != INVALID_SOCKET) {
                char tempBuf[1];
                int res = recv(client_sockets[i], tempBuf, sizeof(tempBuf), MSG_PEEK);
                if (res == 0) {
                    char sseLog[128];
                    snprintf(sseLog, sizeof(sseLog), "SSE client in slot %d disconnected gracefully", i);
                    Log_Event(LOG_INFO, "TelemSrv", SYS_MODE_NORMAL, "SSEDisconnect", sseLog);
                    closesocket(client_sockets[i]);
                    client_sockets[i] = INVALID_SOCKET;
                } else if (res == SOCKET_ERROR) {
                    int err = WSAGetLastError();
                    if (err != WSAEWOULDBLOCK) {
                        char sseLog[128];
                        snprintf(sseLog, sizeof(sseLog), "SSE client in slot %d disconnected with error %d", i, err);
                        Log_Event(LOG_INFO, "TelemSrv", SYS_MODE_NORMAL, "SSEDisconnect", sseLog);
                        closesocket(client_sockets[i]);
                        client_sockets[i] = INVALID_SOCKET;
                    }
                }
            }
        }

        // Send a keep-alive comment frame
        BroadcastToClients(":\n\n", 3);

        /* Static task array - no heap churn every 200ms. */
        static TaskStatus_t pxTaskStatusArray[MAX_REPORTABLE_TASKS];
        UBaseType_t uxTaskCount = uxTaskGetNumberOfTasks();
        if (uxTaskCount > MAX_REPORTABLE_TASKS) uxTaskCount = MAX_REPORTABLE_TASKS;

        uint32_t ulTotalRunTime = 0;
        uxTaskCount = uxTaskGetSystemState(pxTaskStatusArray, uxTaskCount, &ulTotalRunTime);

        int taskJsonOffset = snprintf(taskJson, sizeof(taskJson), "[");
        for (UBaseType_t i = 0; i < uxTaskCount; i++) {
            char temp[160];
            snprintf(temp, sizeof(temp),
                "{\"name\":\"%s\",\"prio\":%lu,\"state\":\"%s\",\"stack\":%u,\"runtime\":%lu}",
                pxTaskStatusArray[i].pcTaskName,
                (unsigned long)pxTaskStatusArray[i].uxCurrentPriority,
                GetTaskStateString(pxTaskStatusArray[i].eCurrentState),
                pxTaskStatusArray[i].usStackHighWaterMark,
                (unsigned long)pxTaskStatusArray[i].ulRunTimeCounter);

            if (taskJsonOffset > 0 && taskJsonOffset < (int)sizeof(taskJson)) {
                taskJsonOffset += snprintf(taskJson + taskJsonOffset,
                    sizeof(taskJson) - (size_t)taskJsonOffset,
                    "%s%s",
                    temp,
                    (i < uxTaskCount - 1) ? "," : "");
            }
        }
        if (taskJsonOffset > 0 && taskJsonOffset < (int)sizeof(taskJson)) {
            snprintf(taskJson + taskJsonOffset, sizeof(taskJson) - (size_t)taskJsonOffset, "]");
        } else {
            strcpy(taskJson, "[]");
        }

        /* --- Build the telemetry data: ticks, heap, sensors, mutexes, +
         * additional fields from the new modules. --- */
        BenchmarkResult_t bench = {0};
        Benchmarks_GetLatest(&bench);
        uint32_t ticks    = xTaskGetTickCount();
        uint32_t freeHeap = (uint32_t)xPortGetFreeHeapSize();
        uint32_t minHeap  = Diagnostics_GetMinFreeHeap();
        uint32_t queueLen = xTelemetryQueue ? uxQueueMessagesWaiting(xTelemetryQueue) : 0;
        uint32_t queueSp  = xTelemetryQueue ? uxQueueSpacesAvailable(xTelemetryQueue) : 0;
        SystemMode_t mode = StateMachine_GetMode();

        int len = snprintf(sendBuffer, sizeof(sendBuffer),
            "data: {\"craft\":\"%s\",\"ticks\":%lu,\"heap\":%lu,\"min_heap\":%lu,"
            "\"queue\":%lu,\"queue_free\":%lu,\"ipc\":%lu,"
            "\"mode\":\"%s\",\"faults\":%lu,\"cpu\":%.1f,"
            "\"sensors\":{\"temperature\":%.1f,\"battery\":%.1f,\"radiation\":%.1f,"
            "\"solar\":%.2f,\"attitude\":%.1f,\"pressure\":%.0f,\"comm\":%.0f},"
            "\"mutex\":{\"spi\":%s,\"i2c\":%s,\"uart\":%s},"
            "\"samples\":%lu,"
            "\"power\":{\"free\":%lu,\"total\":%lu},"
            "\"cmd\":{\"ok\":%lu,\"bad\":%lu},"
            "\"emergency\":%lu,"
            "\"watchdog\":{\"watched\":%lu},"
            "\"safety\":{\"score\":%lu,\"escalations\":%lu,\"min_stack\":%lu},"
            "\"energy\":{\"sunlit\":%s,\"load\":%.1f},"
            "\"blackbox\":%lu,"
            "\"logger\":{\"bytes\":%lu,\"dropped\":%lu},"
            "\"bench\":{\"q\":%lu,\"mtx\":%lu,\"ntf\":%lu,\"cs\":%lu,\"jit\":%lu,\"mem\":%lu,\"runs\":%lu},"
            "\"tasks\":%s}\n\n",
            g_craftId,
            (unsigned long)ticks,
            (unsigned long)freeHeap,
            (unsigned long)minHeap,
            (unsigned long)queueLen,
            (unsigned long)queueSp,
            (unsigned long)ulIPCTrafficCount,
            GetModeString(mode),
            (unsigned long)ulActiveFaultBits,
            fLatestCpuUsage,
            fLatestTemperature,
            fLatestBattery,
            fLatestRadiation,
            fLatestSolar,
            fLatestAttitude,
            fLatestPressure,
            fLatestComm,
            xSPIBusLocked ? "true" : "false",
            xI2CBusLocked ? "true" : "false",
            xUARTBusLocked ? "true" : "false",
            (unsigned long)ulLatestTelemetrySamples,
            (unsigned long)PowerManager_GetFreeTokens(),
            (unsigned long)POWER_TOKEN_COUNT,
            (unsigned long)CommandProcessor_GetTotalAccepted(),
            (unsigned long)CommandProcessor_GetTotalRejected(),
            (unsigned long)EmergencyTasks_GetRecoveryCount(),
            (unsigned long)Watchdog_GetWatchedCount(),
            (unsigned long)SafetyManager_GetScore(),
            (unsigned long)SafetyManager_GetEscalations(),
            (unsigned long)MonitoringTasks_GetMinStack(),
            PowerModel_InSunlight() ? "true" : "false",
            PowerModel_GetLoadWatts(),
            (unsigned long)FlightRecorder_GetTotal(),
            (unsigned long)DataLogger_GetBytesProcessed(),
            (unsigned long)DataLogger_GetBytesDropped(),
            (unsigned long)bench.lastQueueRoundtripUs,
            (unsigned long)bench.lastMutexLatencyUs,
            (unsigned long)bench.lastNotifyLatencyUs,
            (unsigned long)bench.lastContextSwitchUs,
            (unsigned long)bench.lastTimerJitterUs,
            (unsigned long)bench.lastMemAllocUs,
            (unsigned long)bench.totalRuns,
            taskJson);

        BroadcastToClients(sendBuffer, len);

        // 4. Read pending logs from the xLogQueue and stream them immediately
        while (xLogQueue != NULL && xQueueReceive(xLogQueue, logBuffer, 0) == pdPASS) {
            // Escape any JSON double quotes in log messages
            int dst = 0;
            for (int src = 0; logBuffer[src] != '\0' && dst < sizeof(escapedLog) - 4; src++) {
                if (logBuffer[src] == '"') {
                    escapedLog[dst++] = '\\';
                    escapedLog[dst++] = '"';
                } else if (logBuffer[src] == '\n' || logBuffer[src] == '\r') {
                    escapedLog[dst++] = ' ';
                } else {
                    escapedLog[dst++] = logBuffer[src];
                }
            }
            escapedLog[dst] = '\0';

            int logLen = snprintf(sendBuffer, sizeof(sendBuffer), 
                "data: {\"log\":\"%s\"}\n\n", escapedLog);
            BroadcastToClients(sendBuffer, logLen);
        }

        vTaskDelay(pdMS_TO_TICKS(120)); // Sleep ~120ms (~8Hz) for snappier UI
    }
}
