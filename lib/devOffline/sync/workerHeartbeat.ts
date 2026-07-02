export type HeartbeatKind = "tick" | "sync_pass" | "network_check" | "idle";

export class WorkerHeartbeat {
  private lastBeat: { kind: HeartbeatKind; at: number } | null = null;
  private beats = 0;

  beat(kind: HeartbeatKind, now: number = Date.now()): void {
    this.lastBeat = { kind, at: now };
    this.beats += 1;
  }

  get lastBeatAt(): string | null {
    return this.lastBeat ? new Date(this.lastBeat.at).toISOString() : null;
  }

  get lastKind(): HeartbeatKind | null {
    return this.lastBeat?.kind ?? null;
  }

  get totalBeats(): number {
    return this.beats;
  }

  ageMs(now: number = Date.now()): number | null {
    return this.lastBeat ? now - this.lastBeat.at : null;
  }

  /** Stale = no beat within the threshold (worker likely hung). */
  isStale(thresholdMs: number, now: number = Date.now()): boolean {
    const age = this.ageMs(now);
    return age === null || age > thresholdMs;
  }
}
