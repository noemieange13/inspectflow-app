export type WorkerLifecycleState =
  | "created"
  | "starting"
  | "running"
  | "paused"
  | "stopping"
  | "stopped";

const LIFECYCLE_TRANSITIONS: Record<WorkerLifecycleState, readonly WorkerLifecycleState[]> = {
  created: ["starting"],
  starting: ["running", "stopping"],
  running: ["paused", "stopping"],
  paused: ["running", "stopping"],
  stopping: ["stopped"],
  stopped: ["starting"],
};

export class WorkerLifecycle {
  private state: WorkerLifecycleState = "created";
  private history: Array<{ state: WorkerLifecycleState; at: string }> = [
    { state: "created", at: new Date().toISOString() },
  ];

  get current(): WorkerLifecycleState {
    return this.state;
  }

  canTransition(to: WorkerLifecycleState): boolean {
    return LIFECYCLE_TRANSITIONS[this.state].includes(to);
  }

  transition(to: WorkerLifecycleState): void {
    if (!this.canTransition(to)) {
      throw new Error(`Invalid worker lifecycle transition: ${this.state} → ${to}`);
    }
    this.state = to;
    this.history.push({ state: to, at: new Date().toISOString() });
    if (this.history.length > 50) this.history.shift();
  }

  /** Transition only if allowed — returns whether it happened. */
  tryTransition(to: WorkerLifecycleState): boolean {
    if (!this.canTransition(to)) return false;
    this.transition(to);
    return true;
  }

  getHistory(): ReadonlyArray<{ state: WorkerLifecycleState; at: string }> {
    return this.history;
  }
}
