import { runMongoPatchBatch } from "utils/mongoMutations";

describe("runMongoPatchBatch", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("all succeed → { succeeded: N, failed: 0, errors: [] }", async () => {
    const tasks = [
      () => Promise.resolve(),
      () => Promise.resolve(),
      () => Promise.resolve(),
    ];
    const result = await runMongoPatchBatch(tasks);
    expect(result).toEqual({ succeeded: 3, failed: 0, errors: [] });
  });

  it("partial failure → collects errors, doesn't stop others", async () => {
    const tasks = [
      () => Promise.resolve(),
      () => Promise.reject(new Error("HTTP 400: Bad Request")),
      () => Promise.resolve(),
    ];
    const result = await runMongoPatchBatch(tasks);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBeInstanceOf(Error);
  });

  it("retries transient 5xx errors up to 2 times", async () => {
    let attempts = 0;
    const tasks = [
      () => {
        attempts++;
        if (attempts <= 2) return Promise.reject(new Error("HTTP 500: Internal Server Error"));
        return Promise.resolve();
      },
    ];

    const promise = runMongoPatchBatch(tasks);

    // Advance through retry delays (500ms, then 1000ms)
    await jest.advanceTimersByTimeAsync(500);
    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(attempts).toBe(3);
    expect(result).toEqual({ succeeded: 1, failed: 0, errors: [] });
  });

  it("does NOT retry 4xx errors", async () => {
    let attempts = 0;
    const tasks = [
      () => {
        attempts++;
        return Promise.reject(new Error("HTTP 400: Bad Request"));
      },
    ];

    const result = await runMongoPatchBatch(tasks);
    expect(attempts).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("gives up after max retries for persistent 5xx", async () => {
    let attempts = 0;
    const tasks = [
      () => {
        attempts++;
        return Promise.reject(new Error("HTTP 500: Internal Server Error"));
      },
    ];

    const promise = runMongoPatchBatch(tasks);
    await jest.advanceTimersByTimeAsync(500);
    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(attempts).toBe(3); // 1 initial + 2 retries
    expect(result.failed).toBe(1);
  });

  it("retries network errors", async () => {
    let attempts = 0;
    const tasks = [
      () => {
        attempts++;
        if (attempts === 1) return Promise.reject(new Error("Failed to fetch"));
        return Promise.resolve();
      },
    ];

    const promise = runMongoPatchBatch(tasks);
    await jest.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(attempts).toBe(2);
    expect(result).toEqual({ succeeded: 1, failed: 0, errors: [] });
  });

  it("limits concurrency to at most 10 parallel tasks", async () => {
    jest.useRealTimers();

    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 30 }, () => () =>
      new Promise<void>((resolve) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        setTimeout(() => {
          concurrent--;
          resolve();
        }, 10);
      })
    );

    await runMongoPatchBatch(tasks);
    expect(maxConcurrent).toBeLessThanOrEqual(10);
    expect(maxConcurrent).toBeGreaterThan(1);
  });
});
