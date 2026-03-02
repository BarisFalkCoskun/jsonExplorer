type BatchResult = {
  errors: Error[];
  failed: number;
  succeeded: number;
};

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;

const isTransient = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message : String(error);
  return /HTTP 5\d{2}/i.test(msg) ||
    /Failed to fetch/i.test(msg) ||
    /NetworkError/i.test(msg);
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const runWithRetry = async (
  task: () => Promise<void>,
  retries = MAX_RETRIES
): Promise<void> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await task();
      return;
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === retries) break;
      // eslint-disable-next-line no-await-in-loop
      await delay(BASE_DELAY_MS * 2 ** attempt);
    }
  }

  throw lastError;
};

export const runMongoPatchBatch = async (
  tasks: (() => Promise<void>)[]
): Promise<BatchResult> => {
  const results = await Promise.allSettled(
    tasks.map((task) => runWithRetry(task))
  );

  const errors: Error[] = [];
  let failed = 0;
  let succeeded = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      succeeded++;
    } else {
      failed++;
      errors.push(
        result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason))
      );
    }
  }

  return { errors, failed, succeeded };
};
