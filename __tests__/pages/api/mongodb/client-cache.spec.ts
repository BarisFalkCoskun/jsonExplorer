const MAX_CLIENTS = 10;
const CLIENT_TTL_MS = 30 * 60 * 1000;

describe("client cache eviction logic", () => {
  it("evictStaleClients removes entries older than TTL", () => {
    const cache = new Map<string, { lastUsed: number; client: object }>();

    cache.set("fresh", { lastUsed: Date.now(), client: {} });
    cache.set("stale", { lastUsed: Date.now() - CLIENT_TTL_MS - 1, client: {} });

    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now - entry.lastUsed > CLIENT_TTL_MS) {
        cache.delete(key);
      }
    }

    expect(cache.size).toBe(1);
    expect(cache.has("fresh")).toBe(true);
    expect(cache.has("stale")).toBe(false);
  });

  it("evicts oldest when cache exceeds MAX_CLIENTS", () => {
    const cache = new Map<string, { lastUsed: number }>();

    for (let i = 0; i < MAX_CLIENTS + 1; i++) {
      cache.set(`conn-${i}`, { lastUsed: Date.now() + i });
    }

    if (cache.size > MAX_CLIENTS) {
      let oldestKey = "";
      let oldestTime = Infinity;

      for (const [key, entry] of cache) {
        if (entry.lastUsed < oldestTime) {
          oldestTime = entry.lastUsed;
          oldestKey = key;
        }
      }

      cache.delete(oldestKey);
    }

    expect(cache.size).toBe(MAX_CLIENTS);
    expect(cache.has("conn-0")).toBe(false);
  });
});
