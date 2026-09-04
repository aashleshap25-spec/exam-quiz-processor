// A minimal worker-pool implementation: run `worker` over `items` with at
// most `concurrency` in flight at once. This is what makes grading actually
// concurrent (not a sequential for-loop with awaits) without pulling in a
// queue library — appropriate for in-process, single-server grading jobs at
// the scale this assignment targets (thousands of rows, not millions).
//
// Each item's failure is isolated: one throwing worker doesn't abort the
// rest of the pool, mirroring "never crash the pipeline" from the grading
// requirements.

export type PoolResult<T, R> =
  | { item: T; index: number; status: "fulfilled"; value: R }
  | { item: T; index: number; status: "rejected"; reason: unknown };

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number, total: number) => void
): Promise<PoolResult<T, R>[]> {
  const results: PoolResult<T, R>[] = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;
  const total = items.length;

  async function runOne(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;

      const item = items[currentIndex];
      try {
        const value = await worker(item, currentIndex);
        results[currentIndex] = { item, index: currentIndex, status: "fulfilled", value };
      } catch (reason) {
        results[currentIndex] = { item, index: currentIndex, status: "rejected", reason };
      } finally {
        completed++;
        onProgress?.(completed, total);
      }
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, items.length || 1));
  const workers = Array.from({ length: poolSize }, () => runOne());
  await Promise.all(workers);

  return results;
}

// Simulates real grading cost per submission so concurrency is actually
// necessary at scale, per the assignment's math-functions requirement.
// Kept short (a few ms) so test batches still finish quickly; still large
// enough that a sequential loop over thousands of rows would be visibly
// slower than the pooled version.
export function simulateGradingDelay(): Promise<void> {
  const ms = 2 + Math.floor(Math.random() * 4); // 2-5ms artificial cost
  return new Promise((resolve) => setTimeout(resolve, ms));
}
