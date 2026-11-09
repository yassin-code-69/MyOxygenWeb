/**
 * Background job queue (RULES §2: emails, SMS and PDFs never block HTTP handlers).
 *
 * - env.REDIS_URL set   → BullMQ: durable jobs in Redis, retries with
 *   exponential backoff, a Worker in this process, cron schedules via
 *   `upsertJobScheduler` (one schedule cluster-wide).
 * - env.REDIS_URL unset → in-process queue with the same retry/backoff policy
 *   and node-cron schedules, so development works without Redis. Jobs live in
 *   memory and are lost if the process exits.
 *
 * Producers call `enqueueJob(...)` (fire-and-forget, never throws). Jobs are
 * only executed after `start(handlers)` — called by startBackgroundJobs() in
 * the API process, never by the test-suite — so enqueued jobs simply wait,
 * exactly like a Redis queue without a worker.
 */
import { randomUUID } from "node:crypto";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import cron, { type ScheduledTask } from "node-cron";
import { z, ZodError } from "zod";
import { env } from "../env";
import {
  NOTIFICATION_CHANNELS,
  ORDER_NOTIFICATION_TEMPLATES,
  type NotificationChannel,
  type OrderNotificationTemplate,
} from "../services/notification/notification.interface";

// ---------------------------------------------------------------------------
// Job catalogue
// ---------------------------------------------------------------------------

export interface JobPayloads {
  "send-order-notification": {
    orderId: string;
    template: OrderNotificationTemplate;
    channel: NotificationChannel;
  };
  "generate-invoice": {
    orderId: string;
    /** Rebuild the PDF even if one exists (e.g. after a payment status change). */
    regenerate?: boolean;
  };
  "inventory-digest": {
    trigger: "schedule" | "manual";
  };
}

export type JobName = keyof JobPayloads;
export const JOB_NAMES: readonly JobName[] = ["send-order-notification", "generate-invoice", "inventory-digest"];

const jobPayloadSchemas: { [N in JobName]: z.ZodType<JobPayloads[N]> } = {
  "send-order-notification": z.object({
    orderId: z.string().uuid(),
    template: z.enum(ORDER_NOTIFICATION_TEMPLATES),
    channel: z.enum(NOTIFICATION_CHANNELS),
  }),
  "generate-invoice": z.object({
    orderId: z.string().uuid(),
    regenerate: z.boolean().optional(),
  }),
  "inventory-digest": z.object({
    trigger: z.enum(["schedule", "manual"]),
  }),
};

export function isJobName(value: string): value is JobName {
  return (JOB_NAMES as readonly string[]).includes(value);
}

export interface JobContext {
  jobId: string;
  /** 1-based attempt number. */
  attempt: number;
  maxAttempts: number;
}

export type JobHandler<N extends JobName> = (payload: JobPayloads[N], context: JobContext) => Promise<void>;
export type JobHandlers = { [N in JobName]: JobHandler<N> };

export interface RetryPolicy {
  attempts: number;
  /** Delay before the 2nd attempt; doubles for every further attempt. */
  backoffMs: number;
}

export const DEFAULT_RETRY_POLICIES: Readonly<Record<JobName, RetryPolicy>> = {
  "send-order-notification": { attempts: 5, backoffMs: 5_000 },
  "generate-invoice": { attempts: 4, backoffMs: 10_000 },
  "inventory-digest": { attempts: 3, backoffMs: 60_000 },
};

export interface EnqueueOptions {
  /** De-duplication key (no ":" allowed). Jobs with a pending/active id are ignored. */
  jobId?: string;
  delayMs?: number;
}

export interface JobQueue {
  readonly kind: "bullmq" | "in-process";
  enqueue<N extends JobName>(name: N, payload: JobPayloads[N], options?: EnqueueOptions): Promise<void>;
  /** Begins executing jobs with `handlers`. Idempotent. */
  start(handlers: JobHandlers): Promise<void>;
  /** Enqueues `name` on a cron pattern evaluated in `timezone`. Call after start(). */
  scheduleRecurring<N extends JobName>(
    scheduleId: string,
    name: N,
    cronPattern: string,
    timezone: string,
    payload: JobPayloads[N],
  ): Promise<void>;
  /** Stops workers/schedules and waits for running jobs. Idempotent. */
  stop(): Promise<void>;
}

/** Validates the payload and runs the matching handler. */
export async function runJob<N extends JobName>(
  handlers: JobHandlers,
  name: N,
  data: unknown,
  context: JobContext,
): Promise<void> {
  const payload = jobPayloadSchemas[name].parse(data);
  const handler: JobHandler<N> = handlers[name];
  await handler(payload, context);
}

function logJob(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>): void {
  const line = JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// In-process queue
// ---------------------------------------------------------------------------

interface InProcessJob {
  id: string;
  name: JobName;
  data: unknown;
  attempt: number;
  policy: RetryPolicy;
}

export interface InProcessQueueOptions {
  policies?: Partial<Record<JobName, RetryPolicy>>;
  /** Max jobs kept while no worker is running (oldest dropped first). */
  maxBuffered?: number;
}

export class InProcessJobQueue implements JobQueue {
  readonly kind = "in-process" as const;
  private handlers: JobHandlers | null = null;
  private readonly policies: Readonly<Record<JobName, RetryPolicy>>;
  private readonly maxBuffered: number;
  private readonly buffered: InProcessJob[] = [];
  private readonly knownIds = new Set<string>();
  private readonly timers = new Map<ReturnType<typeof setTimeout>, InProcessJob>();
  private readonly running = new Set<Promise<void>>();
  private readonly schedules = new Map<string, ScheduledTask>();
  private idleWaiters: Array<() => void> = [];

  constructor(options: InProcessQueueOptions = {}) {
    this.policies = { ...DEFAULT_RETRY_POLICIES, ...options.policies };
    this.maxBuffered = options.maxBuffered ?? 10_000;
  }

  async enqueue<N extends JobName>(name: N, payload: JobPayloads[N], options: EnqueueOptions = {}): Promise<void> {
    const id = options.jobId ?? randomUUID();
    if (this.knownIds.has(id)) return;
    this.knownIds.add(id);

    const job: InProcessJob = { id, name, data: payload, attempt: 0, policy: this.policies[name] };
    if (this.handlers === null) {
      this.buffer(job);
      return;
    }
    this.schedule(job, options.delayMs ?? 0);
  }

  async start(handlers: JobHandlers): Promise<void> {
    if (this.handlers !== null) return;
    this.handlers = handlers;
    for (const job of this.buffered.splice(0)) {
      this.schedule(job, 0);
    }
  }

  async scheduleRecurring<N extends JobName>(
    scheduleId: string,
    name: N,
    cronPattern: string,
    timezone: string,
    payload: JobPayloads[N],
  ): Promise<void> {
    this.schedules.get(scheduleId)?.stop();
    const task = cron.schedule(
      cronPattern,
      () => {
        void this.enqueue(name, payload).catch((error: unknown) =>
          logJob("error", "job_enqueue_failed", { job: name, scheduleId, message: errorMessage(error) }),
        );
      },
      { timezone },
    );
    this.schedules.set(scheduleId, task);
  }

  async stop(): Promise<void> {
    this.handlers = null;
    for (const task of this.schedules.values()) task.stop();
    this.schedules.clear();
    for (const [timer, job] of this.timers) {
      clearTimeout(timer);
      this.buffer(job);
    }
    this.timers.clear();
    await Promise.allSettled([...this.running]);
    if (this.buffered.length > 0) {
      logJob("warn", "jobs_left_unprocessed", { queue: this.kind, count: this.buffered.length });
    }
    this.notifyIfIdle();
  }

  /** Resolves once no job is running or waiting for a retry timer. */
  onIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** Jobs waiting for a worker (not started / stopped). */
  get bufferedCount(): number {
    return this.buffered.length;
  }

  private buffer(job: InProcessJob): void {
    if (this.buffered.length >= this.maxBuffered) {
      const dropped = this.buffered.shift();
      if (dropped) {
        this.knownIds.delete(dropped.id);
        logJob("warn", "job_dropped", { queue: this.kind, job: dropped.name, jobId: dropped.id, reason: "buffer full" });
      }
    }
    this.buffered.push(job);
  }

  private schedule(job: InProcessJob, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.execute(job);
    }, Math.max(0, delayMs));
    timer.unref?.();
    this.timers.set(timer, job);
  }

  private execute(job: InProcessJob): void {
    const handlers = this.handlers;
    if (handlers === null) {
      this.buffer(job);
      this.notifyIfIdle();
      return;
    }
    const run: Promise<void> = this.attempt(handlers, job).finally(() => {
      this.running.delete(run);
      this.notifyIfIdle();
    });
    this.running.add(run);
  }

  private async attempt(handlers: JobHandlers, job: InProcessJob): Promise<void> {
    job.attempt += 1;
    const context: JobContext = { jobId: job.id, attempt: job.attempt, maxAttempts: job.policy.attempts };
    try {
      await runJob(handlers, job.name, job.data, context);
      this.knownIds.delete(job.id);
    } catch (error) {
      const permanent = error instanceof ZodError || job.attempt >= job.policy.attempts;
      if (!permanent && this.handlers !== null) {
        const delayMs = job.policy.backoffMs * 2 ** (job.attempt - 1);
        logJob("warn", "job_retry_scheduled", {
          queue: this.kind,
          job: job.name,
          jobId: job.id,
          attempt: job.attempt,
          maxAttempts: job.policy.attempts,
          delayMs,
          message: errorMessage(error),
        });
        this.schedule(job, delayMs);
        return;
      }
      this.knownIds.delete(job.id);
      logJob("error", "job_failed", {
        queue: this.kind,
        job: job.name,
        jobId: job.id,
        attempt: job.attempt,
        maxAttempts: job.policy.attempts,
        message: errorMessage(error),
      });
    }
  }

  private isIdle(): boolean {
    return this.running.size === 0 && this.timers.size === 0;
  }

  private notifyIfIdle(): void {
    if (!this.isIdle() || this.idleWaiters.length === 0) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

// ---------------------------------------------------------------------------
// BullMQ queue
// ---------------------------------------------------------------------------

export class BullMqJobQueue implements JobQueue {
  readonly kind = "bullmq" as const;
  private queue: Queue<unknown, void, string> | null = null;
  private worker: Worker<unknown, void, string> | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly queueName = "my-oxygen-jobs",
    private readonly policies: Readonly<Record<JobName, RetryPolicy>> = DEFAULT_RETRY_POLICIES,
  ) {}

  private connection(): ConnectionOptions {
    // BullMQ requires maxRetriesPerRequest = null for blocking worker connections.
    return { url: this.redisUrl, maxRetriesPerRequest: null };
  }

  private getQueue(): Queue<unknown, void, string> {
    if (this.queue === null) {
      this.queue = new Queue<unknown, void, string>(this.queueName, {
        connection: this.connection(),
        defaultJobOptions: {
          removeOnComplete: { count: 1_000, age: 7 * 24 * 3600 },
          removeOnFail: { count: 5_000, age: 30 * 24 * 3600 },
        },
      });
      this.queue.on("error", (error: Error) =>
        logJob("error", "job_queue_error", { queue: this.kind, message: error.message }),
      );
    }
    return this.queue;
  }

  async enqueue<N extends JobName>(name: N, payload: JobPayloads[N], options: EnqueueOptions = {}): Promise<void> {
    const policy = this.policies[name];
    await this.getQueue().add(name, payload, {
      jobId: options.jobId,
      delay: options.delayMs,
      attempts: policy.attempts,
      backoff: { type: "exponential", delay: policy.backoffMs },
    });
  }

  async start(handlers: JobHandlers): Promise<void> {
    if (this.worker !== null) return;
    this.getQueue();
    const worker = new Worker<unknown, void, string>(
      this.queueName,
      async (job) => {
        if (!isJobName(job.name)) {
          throw new Error(`Unknown job "${job.name}"`);
        }
        const maxAttempts = job.opts.attempts ?? 1;
        await runJob(handlers, job.name, job.data, {
          jobId: job.id ?? "unknown",
          attempt: job.attemptsMade + 1,
          maxAttempts,
        });
      },
      { connection: this.connection(), concurrency: 5 },
    );
    worker.on("failed", (job, error) => {
      const attempt = job?.attemptsMade ?? 0;
      const maxAttempts = job?.opts.attempts ?? 1;
      logJob(attempt >= maxAttempts ? "error" : "warn", attempt >= maxAttempts ? "job_failed" : "job_retry_scheduled", {
        queue: this.kind,
        job: job?.name,
        jobId: job?.id,
        attempt,
        maxAttempts,
        message: error.message,
      });
    });
    worker.on("error", (error: Error) =>
      logJob("error", "job_worker_error", { queue: this.kind, message: error.message }),
    );
    this.worker = worker;
  }

  async scheduleRecurring<N extends JobName>(
    scheduleId: string,
    name: N,
    cronPattern: string,
    timezone: string,
    payload: JobPayloads[N],
  ): Promise<void> {
    const policy = this.policies[name];
    await this.getQueue().upsertJobScheduler(
      scheduleId,
      { pattern: cronPattern, tz: timezone },
      {
        name,
        data: payload,
        opts: { attempts: policy.attempts, backoff: { type: "exponential", delay: policy.backoffMs } },
      },
    );
  }

  async stop(): Promise<void> {
    const worker = this.worker;
    const queue = this.queue;
    this.worker = null;
    this.queue = null;
    await worker?.close();
    await queue?.close();
  }
}

// ---------------------------------------------------------------------------
// Singleton + producer helper
// ---------------------------------------------------------------------------

export function createJobQueue(): JobQueue {
  if (env.REDIS_URL) {
    return new BullMqJobQueue(env.REDIS_URL);
  }
  if (env.NODE_ENV === "production") {
    // Not fatal (the store keeps working), but pending notifications and
    // invoice jobs are lost on restart. Make the gap visible in the logs.
    logJob("warn", "jobs_in_process_in_production", {
      queue: "in-process",
      reason: "REDIS_URL is not set; jobs are not durable",
    });
  }
  return new InProcessJobQueue();
}

export const jobQueue: JobQueue = createJobQueue();

/**
 * Fire-and-forget producer used by services after a transaction commits.
 * Never throws and never blocks the caller on Redis.
 */
export function enqueueJob<N extends JobName>(name: N, payload: JobPayloads[N], options?: EnqueueOptions): void {
  jobQueue.enqueue(name, payload, options).catch((error: unknown) => {
    logJob("error", "job_enqueue_failed", { queue: jobQueue.kind, job: name, message: errorMessage(error) });
  });
}
