/**
 * Single entry point for background work (cron schedulers, queue workers).
 *
 * `startBackgroundJobs()` is called once from src/index.ts when the API runs
 * as the main process (never during tests); `stopBackgroundJobs()` is awaited
 * during graceful shutdown before the DB pool is closed. Register new
 * schedulers/workers here and make their stop logic idempotent.
 *
 * Jobs (see jobs/queue.ts for the BullMQ / in-process queue):
 *  - send-order-notification  email / SMS per order event
 *  - generate-invoice         PDF invoice after checkout / payment changes
 *  - inventory-digest         daily 08:00 (APP_TIMEZONE) low-stock + expiry email
 */
import { env } from "../env";
import { expiryScheduler } from "./expiry-scheduler";
import { jobHandlers } from "./handlers";
import { jobQueue } from "./queue";

export const INVENTORY_DIGEST_SCHEDULE_ID = "daily-inventory-digest";
export const INVENTORY_DIGEST_CRON = "0 8 * * *";

let running = false;

export function startBackgroundJobs(): void {
  if (running) return;
  running = true;
  expiryScheduler.start();

  void (async () => {
    await jobQueue.start(jobHandlers);
    await jobQueue.scheduleRecurring(
      INVENTORY_DIGEST_SCHEDULE_ID,
      "inventory-digest",
      INVENTORY_DIGEST_CRON,
      env.APP_TIMEZONE,
      { trigger: "schedule" },
    );
    console.log(
      JSON.stringify({
        level: "info",
        event: "job_queue_started",
        queue: jobQueue.kind,
        schedules: [{ id: INVENTORY_DIGEST_SCHEDULE_ID, cron: INVENTORY_DIGEST_CRON, timezone: env.APP_TIMEZONE }],
      }),
    );
  })().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        event: "job_queue_start_failed",
        queue: jobQueue.kind,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  });
}

export async function stopBackgroundJobs(): Promise<void> {
  if (!running) return;
  running = false;
  expiryScheduler.stop();
  await jobQueue.stop();
}

export function backgroundJobsRunning(): boolean {
  return running;
}
