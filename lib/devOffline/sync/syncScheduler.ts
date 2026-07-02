export type SchedulerState = "idle" | "active" | "paused" | "stopped";

/**
 * Interval scheduler with pause/resume and non-overlapping ticks.
 *
 * Pausing does NOT stop the ticks — while paused the runtime still needs to
 * probe the network to detect the offline → online transition. Pause gates the
 * sync work: the runtime checks `current === "paused"` and skips uploads.
 */
export class SyncScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: SchedulerState = "idle";
  private ticking = false;
  private tickCount = 0;

  constructor(
    private readonly onTick: () => Promise<void>,
    private readonly intervalMs: number,
  ) {}

  get current(): SchedulerState {
    return this.state;
  }

  get ticks(): number {
    return this.tickCount;
  }

  start(): void {
    if (this.timer) return;
    if (this.state === "idle" || this.state === "stopped") this.state = "active";
    this.timer = setInterval(() => {
      void this.runTick();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  /** Run one tick immediately (startup, resume, tests). Never overlaps. */
  async runTick(): Promise<void> {
    if (this.ticking || this.state === "stopped" || this.state === "idle") return;
    this.ticking = true;
    this.tickCount += 1;
    try {
      await this.onTick();
    } finally {
      this.ticking = false;
    }
  }

  pause(): void {
    if (this.state === "active") this.state = "paused";
  }

  resume(): void {
    if (this.state === "paused") this.state = "active";
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.state = "stopped";
  }
}
