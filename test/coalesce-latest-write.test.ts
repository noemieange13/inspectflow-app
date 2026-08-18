/**
 * Coalescing latest-write queue — locks Zero Draft autosave ordering.
 * `npm run test:coalesce-latest-write`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCoalescingLatestWriter } from "@/lib/coalesceLatestWrite";

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createCoalescingLatestWriter", () => {
  it("synchronous overlapping enqueue() writes only the latest snapshot", async () => {
    let latest = 0;
    const writes: number[] = [];
    const writer = createCoalescingLatestWriter(async () => {
      writes.push(latest);
    });

    latest = 1;
    const p1 = writer.enqueue();
    latest = 2;
    const p2 = writer.enqueue();
    latest = 3;
    const p3 = writer.enqueue();
    await Promise.all([p1, p2, p3]);

    assert.deepEqual(writes, [3]);
  });

  it("enqueue during an in-flight write follows with the latest snapshot only", async () => {
    let latest = 0;
    const writes: number[] = [];
    const firstStarted = deferred();
    const firstGate = deferred();
    let writeCount = 0;

    const writer = createCoalescingLatestWriter(async () => {
      writeCount += 1;
      const snapshot = latest;
      if (writeCount === 1) {
        firstStarted.resolve();
        await firstGate.promise;
      }
      writes.push(snapshot);
    });

    latest = 1;
    const p1 = writer.enqueue();
    await firstStarted.promise;

    latest = 2;
    const p2 = writer.enqueue();
    latest = 3;
    const p3 = writer.enqueue();

    firstGate.resolve();
    await Promise.all([p1, p2, p3]);

    assert.deepEqual(writes, [1, 3]);
  });

  it("a failed write does not block a later enqueue", async () => {
    let shouldFail = true;
    const writes: string[] = [];
    const writer = createCoalescingLatestWriter(async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("transient");
      }
      writes.push("ok");
    });

    await assert.rejects(() => writer.enqueue(), /transient/);
    await writer.enqueue();
    assert.deepEqual(writes, ["ok"]);
  });

  it("whenIdle() resolves after the coalesced follow-up write", async () => {
    let latest = 0;
    const writes: number[] = [];
    const firstStarted = deferred();
    const firstGate = deferred();
    let writeCount = 0;

    const writer = createCoalescingLatestWriter(async () => {
      writeCount += 1;
      const snapshot = latest;
      if (writeCount === 1) {
        firstStarted.resolve();
        await firstGate.promise;
      }
      writes.push(snapshot);
    });

    latest = 10;
    void writer.enqueue();
    await firstStarted.promise;
    latest = 20;
    void writer.enqueue();
    firstGate.resolve();
    await writer.whenIdle();

    assert.deepEqual(writes, [10, 20]);
    assert.equal(writer.isBusy(), false);
  });
});
