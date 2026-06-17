/*
 * Lightweight smoke tests for the RTOS primitives this project relies
 * on.  Compiled and linked against the same FreeRTOS Windows simulator
 * port so it exercises real kernel objects.
 *
 * Build (from a Visual Studio "x64 Native Tools" prompt):
 *   cl /Fe:tests\test_runtime.exe ^
 *      tests\test_runtime.c ^
 *      FreeRTOS-Kernel\tasks.c FreeRTOS-Kernel\queue.c FreeRTOS-Kernel\list.c ^
 *      FreeRTOS-Kernel\timers.c FreeRTOS-Kernel\event_groups.c ^
 *      FreeRTOS-Kernel\stream_buffer.c ^
 *      FreeRTOS-Kernel\portable\MemMang\heap_4.c ^
 *      FreeRTOS-Kernel\portable\MSVC-MingW\port.c ^
 *      /I include /I FreeRTOS-Kernel\include /I FreeRTOS-Kernel\portable\MSVC-MingW ^
 *      /D_CRT_SECURE_NO_WARNINGS /Zi /W3 ws2_32.lib winmm.lib
 */
#include "FreeRTOS.h"
#include "task.h"
#include "queue.h"
#include "semphr.h"
#include "event_groups.h"
#include "stream_buffer.h"
#include "message_buffer.h"
#include "timers.h"
#include <stdio.h>
#include <string.h>

#define TEST_OK(cond, name) do { \
        if (!(cond)) { printf("[FAIL] %s\n", name); g_failures++; } \
        else        { printf("[ OK ] %s\n", name); } \
    } while (0)

static int g_failures = 0;

static void TestTask(void *pvParameters) {
    /* ---- queue ---- */
    QueueHandle_t q = xQueueCreate(4, sizeof(int));
    TEST_OK(q != NULL, "queue created");
    int v = 42;
    TEST_OK(xQueueSend(q, &v, 0) == pdPASS, "queue send");
    int out = 0;
    TEST_OK(xQueueReceive(q, &out, 0) == pdPASS && out == 42, "queue receive");
    TEST_OK(uxQueueMessagesWaiting(q) == 0, "queue empty after recv");
    vQueueDelete(q);

    /* ---- mutex / recursive ---- */
    SemaphoreHandle_t m = xSemaphoreCreateMutex();
    TEST_OK(xSemaphoreTake(m, 0) == pdTRUE, "mutex take");
    xSemaphoreGive(m);
    vSemaphoreDelete(m);

    SemaphoreHandle_t rm = xSemaphoreCreateRecursiveMutex();
    TEST_OK(xSemaphoreTakeRecursive(rm, 0) == pdTRUE, "recursive take 1");
    TEST_OK(xSemaphoreTakeRecursive(rm, 0) == pdTRUE, "recursive take 2");
    xSemaphoreGiveRecursive(rm);
    xSemaphoreGiveRecursive(rm);
    vSemaphoreDelete(rm);

    /* ---- counting semaphore ---- */
    SemaphoreHandle_t c = xSemaphoreCreateCounting(3, 3);
    TEST_OK(uxSemaphoreGetCount(c) == 3, "counting initial");
    xSemaphoreTake(c, 0); xSemaphoreTake(c, 0);
    TEST_OK(uxSemaphoreGetCount(c) == 1, "counting after 2 takes");
    vSemaphoreDelete(c);

    /* ---- event group ---- */
    EventGroupHandle_t eg = xEventGroupCreate();
    xEventGroupSetBits(eg, 0x3);
    TEST_OK((xEventGroupGetBits(eg) & 0x3) == 0x3, "event group bits set");
    xEventGroupClearBits(eg, 0x1);
    TEST_OK((xEventGroupGetBits(eg) & 0x3) == 0x2, "event group bits cleared");
    vEventGroupDelete(eg);

    /* ---- stream buffer ---- */
    StreamBufferHandle_t sb = xStreamBufferCreate(64, 1);
    TEST_OK(xStreamBufferSend(sb, "hello", 5, 0) == 5, "stream send");
    char buf[8] = {0};
    TEST_OK(xStreamBufferReceive(sb, buf, 5, 0) == 5 && memcmp(buf, "hello", 5) == 0,
            "stream receive");
    vStreamBufferDelete(sb);

    /* ---- message buffer ---- */
    MessageBufferHandle_t mb = xMessageBufferCreate(128);
    TEST_OK(xMessageBufferSend(mb, "abcd", 4, 0) == 4, "message send");
    char mbuf[8] = {0};
    TEST_OK(xMessageBufferReceive(mb, mbuf, sizeof(mbuf), 0) == 4 && memcmp(mbuf, "abcd", 4) == 0,
            "message receive");
    vMessageBufferDelete(mb);

    /* ---- task notification ---- */
    xTaskNotifyGive(xTaskGetCurrentTaskHandle());
    TEST_OK(ulTaskNotifyTake(pdTRUE, 0) == 1, "notify give/take");

    /* ---- summary ---- */
    if (g_failures == 0) {
        printf("\nAll RTOS smoke tests passed.\n");
    } else {
        printf("\n%d test(s) FAILED.\n", g_failures);
    }
    vTaskEndScheduler();
}

int main(void) {
    setvbuf(stdout, NULL, _IONBF, 0);
    xTaskCreate(TestTask, "Test", 4096, NULL, 3, NULL);
    vTaskStartScheduler();
    return g_failures;
}

/* Stubs required by the simulator port. */
void vApplicationMallocFailedHook(void)  { printf("malloc failed\n"); for (;;); }
void vApplicationStackOverflowHook(TaskHandle_t t, char *n) { (void)t; printf("stack overflow %s\n", n); for (;;); }
void vApplicationIdleHook(void)          { }
void vApplicationTickHook(void)          { }
void vConfigureTimerForRunTimeStats(void){ }
unsigned long ulGetRunTimeCounterValue(void) { static unsigned long c = 0; return ++c; }
void vApplicationGetIdleTaskMemory(StaticTask_t **t, StackType_t **s, uint32_t *sz) {
    static StaticTask_t tcb; static StackType_t st[configMINIMAL_STACK_SIZE];
    *t = &tcb; *s = st; *sz = configMINIMAL_STACK_SIZE;
}
void vApplicationGetTimerTaskMemory(StaticTask_t **t, StackType_t **s, uint32_t *sz) {
    static StaticTask_t tcb; static StackType_t st[configTIMER_TASK_STACK_DEPTH];
    *t = &tcb; *s = st; *sz = configTIMER_TASK_STACK_DEPTH;
}
