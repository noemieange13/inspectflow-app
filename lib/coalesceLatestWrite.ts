/**
 * Serializes async writes so overlapping callers cannot finish out of order.
 *
 * Extra `enqueue()` calls while a write is in flight collapse to a single
 * follow-up that reads whatever `writeLatest` observes *now* (typically refs).
 * That prevents a stale in-flight POST from overwriting a newer draft.
 */
export type CoalescingLatestWriter = {
  enqueue: () => Promise<void>;
  whenIdle: () => Promise<void>;
  isBusy: () => boolean;
};

export function createCoalescingLatestWriter(
  writeLatest: () => Promise<void>,
): CoalescingLatestWriter {
  let tail: Promise<void> = Promise.resolve();
  let scheduledFollowUp = false;
  let inFlight = 0;

  const enqueue = (): Promise<void> => {
    if (scheduledFollowUp) return tail;
    scheduledFollowUp = true;
    const run = tail.then(
      () => undefined,
      () => undefined,
    ).then(async () => {
      scheduledFollowUp = false;
      inFlight += 1;
      try {
        await writeLatest();
      } finally {
        inFlight -= 1;
      }
    });
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  return {
    enqueue,
    whenIdle: () => tail,
    isBusy: () => inFlight > 0 || scheduledFollowUp,
  };
}
