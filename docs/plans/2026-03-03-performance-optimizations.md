# Performance Optimizations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close remaining performance gaps — cache key bug, payload reduction, cache policy — with four surgical fixes.

**Architecture:** Four independent changes targeting MongoDBFS.ts cache layer and the API route. No architectural changes. Each fix has a regression test.

**Tech Stack:** TypeScript, Next.js API routes, MongoDB driver, Jest

---

### Task 1: Fix stat() cache key mismatch

**Files:**
- Modify: `contexts/fileSystem/MongoDBFS.ts:845`
- Test: `__tests__/contexts/fileSystem/MongoDBFS.spec.ts`

**Context:** `collectionEntriesCache` stores encoded identifiers (via `getDocumentIdentifier` → `encodeURIComponent`). But `stat()` looks up decoded names (via `parsePath` → `decodeDocumentIdentifier`). For document names with spaces or special characters, the cache always misses, falling through to an expensive network call via `getEntry()`.

**Step 1: Write the failing test**

Add to `__tests__/contexts/fileSystem/MongoDBFS.spec.ts` inside the existing top-level describe:

```typescript
describe("stat cache key encoding", () => {
  it("hits cache for documents with special characters in name", async () => {
    const fs = new MongoDBFileSystem("mongodb://localhost");

    // Populate the entries cache with an encoded identifier
    // getDocumentIdentifier returns encodeURIComponent(raw), so "my document" becomes "my%20document"
    fs["setCachedCollectionEntries"]("testdb", "products", ["my%20document"]);

    // stat() receives a path where the filename is encoded (from readdir/readdirPaged)
    // parsePath decodes it back to "my document"
    // The fix ensures stat() re-encodes before cache lookup
    const statResult = await new Promise<{ error: unknown; stats: unknown }>((resolve) => {
      fs.stat("testdb/products/my%20document.json", false, (error, stats) => {
        resolve({ error, stats });
      });
    });

    // Should hit cache and return stats (not ENOENT from a network call)
    expect(statResult.error).toBeNull();
    expect(statResult.stats).toBeDefined();
  });

  it("hits cache for documents with plain names", async () => {
    const fs = new MongoDBFileSystem("mongodb://localhost");

    fs["setCachedCollectionEntries"]("testdb", "products", ["simple-doc"]);

    const statResult = await new Promise<{ error: unknown; stats: unknown }>((resolve) => {
      fs.stat("testdb/products/simple-doc.json", false, (error, stats) => {
        resolve({ error, stats });
      });
    });

    expect(statResult.error).toBeNull();
    expect(statResult.stats).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --runInBand -t "hits cache for documents with special characters"`
Expected: FAIL — stat() returns ENOENT because cache lookup misses (decoded "my document" not found in encoded set)

**Step 3: Implement the fix**

In `contexts/fileSystem/MongoDBFS.ts` line 845, change:

```typescript
// Before:
if (cachedEntries?.has(documentName)) {

// After:
if (cachedEntries?.has(encodeURIComponent(documentName))) {
```

**Step 4: Run tests to verify they pass**

Run: `npx jest --runInBand`
Expected: All tests pass

**Step 5: Verify lint and typecheck**

Run: `npx eslint contexts/fileSystem/MongoDBFS.ts __tests__/contexts/fileSystem/MongoDBFS.spec.ts && npm run typecheck`

**Step 6: Commit**

```bash
git add contexts/fileSystem/MongoDBFS.ts __tests__/contexts/fileSystem/MongoDBFS.spec.ts
git commit -m "fix: re-encode document name for stat() cache lookup"
```

---

### Task 2: Add paged listing projection to API

**Files:**
- Modify: `pages/api/mongodb/[...params].ts:227-252`
- Modify: `utils/mongoApi.ts` (extract shared constant)
- Test: `__tests__/pages/api/mongodb/paged-projection.spec.ts`

**Context:** The paged endpoint (non-meta, non-cursor OR with cursor) returns full document bodies via `collection.find(filter)` with no projection (line 229). For collections with large documents, this sends unnecessary data — the file list only needs `_id`, `name`, `category`, `dismissed`, and thumbnail fields. The `meta=1` path already uses the right projection (line 228) but it's inline and not shared.

**Step 1: Write the failing test**

Create `__tests__/pages/api/mongodb/paged-projection.spec.ts`:

```typescript
import { addThumbnailFields } from "utils/mongoApi";

describe("paged listing projection", () => {
  it("addThumbnailFields derives thumbnail and imageCount from projected fields", () => {
    const projectedDoc = {
      _id: "doc1",
      category: "fruit",
      dismissed: false,
      images: ["https://example.com/img1.jpg"],
      name: "apple",
      oldImages: ["https://example.com/old1.jpg"],
    };

    const result = addThumbnailFields(projectedDoc);

    expect(result).toHaveProperty("thumbnail", "https://example.com/img1.jpg");
    expect(result).toHaveProperty("imageCount", 2);
    expect(result).not.toHaveProperty("images");
    expect(result).not.toHaveProperty("oldImages");
    expect(result).toHaveProperty("_id", "doc1");
    expect(result).toHaveProperty("name", "apple");
    expect(result).toHaveProperty("category", "fruit");
  });

  it("addThumbnailFields handles docs with no images", () => {
    const projectedDoc = {
      _id: "doc2",
      name: "banana",
    };

    const result = addThumbnailFields(projectedDoc);

    expect(result).toHaveProperty("thumbnail", undefined);
    expect(result).toHaveProperty("imageCount", 0);
  });
});
```

**Step 2: Run test to verify it passes** (this test validates the existing helper works correctly with projected data — it should pass already)

Run: `npx jest --runInBand -t "paged listing projection"`
Expected: PASS

**Step 3: Extract shared projection constant**

In `utils/mongoApi.ts`, add after the `addThumbnailFields` function (after line 36):

```typescript
export const LISTING_PROJECTION = {
  _id: 1,
  category: 1,
  dismissed: 1,
  images: { $slice: 1 },
  name: 1,
  oldImages: { $slice: 1 },
};
```

**Step 4: Use shared projection in API route**

In `pages/api/mongodb/[...params].ts`:

1. Update the import on line 3 to include `LISTING_PROJECTION`:
```typescript
import { addThumbnailFields, ALLOWED_METHODS, getDocumentFilters, LISTING_PROJECTION, normalizeImageUrl, sanitizeFilter } from "utils/mongoApi";
```

2. Replace lines 226-230 (the cursor creation block):
```typescript
  /* eslint-disable unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- MongoDB Collection.find, not Array.find */
  const cursor = collection.find(filter, { projection: LISTING_PROJECTION });
  /* eslint-enable unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument */
```

Both meta and paged paths now use the same projection. The `metaOnly` distinction for projection is no longer needed — both paths project the same fields.

3. Replace lines 234-236 (the documents fetch):
```typescript
  const documents = metaOnly
    ? await cursor.sort(sortKey).toArray()
    : await cursor.sort(sortKey).limit(limit + 1).toArray();
```

This stays the same — meta returns all (no limit), paged uses limit.

4. Apply `addThumbnailFields` to paged results too. Replace line 252:
```typescript
  // Before:
  res.json({ documents, hasMore, nextCursor });

  // After:
  res.json({
    documents: documents.map((doc) => addThumbnailFields(doc as Record<string, unknown>)),
    hasMore,
    nextCursor,
  });
```

**Step 5: Run tests**

Run: `npx jest --runInBand`
Expected: All tests pass

**Step 6: Verify lint and typecheck**

Run: `npx eslint pages/api/mongodb/[...params].ts utils/mongoApi.ts __tests__/pages/api/mongodb/paged-projection.spec.ts && npm run typecheck`

**Step 7: Commit**

```bash
git add pages/api/mongodb/[...params].ts utils/mongoApi.ts __tests__/pages/api/mongodb/paged-projection.spec.ts
git commit -m "perf: add listing projection to paged API endpoint"
```

---

### Task 3: Remove entry-cache invalidation from PATCH

**Files:**
- Modify: `contexts/fileSystem/MongoDBFS.ts:612-613`
- Test: `__tests__/contexts/fileSystem/MongoDBFS.spec.ts`

**Context:** `patchDocument()` line 613 deletes the entire `collectionEntriesCache` entry after every PATCH. But PATCH only changes metadata (category, dismissed) — it doesn't add or remove documents from the collection. The entries cache tracks which documents exist in a collection, not their metadata. The documents list cache is already patched in-place on lines 596-609. Removing the entry-cache invalidation prevents cache thrashing during batch label/dismiss operations.

**Step 1: Write the failing test**

Add to `__tests__/contexts/fileSystem/MongoDBFS.spec.ts`:

```typescript
describe("PATCH cache invalidation", () => {
  it("preserves entry cache after patchDocument", async () => {
    const fs = new MongoDBFileSystem("mongodb://localhost");

    // Seed both caches
    fs["setCachedCollectionEntries"]("testdb", "products", ["doc1"]);
    fs["setCachedDocumentsList"]("testdb", "products", [
      { _id: "doc1", name: "doc1", category: "old" } as MongoDocument,
    ]);

    // Mock the fetch call that patchDocument makes
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await fs.patchDocument("testdb/products/doc1", { category: "fruit" });

    // Entry cache should still exist (not invalidated)
    const entries = fs["getCachedCollectionEntries"]("testdb", "products");
    expect(entries).not.toBeNull();
    expect(entries?.has("doc1")).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --runInBand -t "preserves entry cache after patchDocument"`
Expected: FAIL — `entries` is null because `patchDocument` deletes the cache

**Step 3: Implement the fix**

In `contexts/fileSystem/MongoDBFS.ts`, remove line 612-613:

```typescript
// Delete these two lines:
    // Invalidate the entries cache so readdir refreshes
    this.collectionEntriesCache.delete(cacheKey);
```

**Step 4: Run tests**

Run: `npx jest --runInBand`
Expected: All tests pass

**Step 5: Verify lint and typecheck**

Run: `npx eslint contexts/fileSystem/MongoDBFS.ts && npm run typecheck`

**Step 6: Commit**

```bash
git add contexts/fileSystem/MongoDBFS.ts __tests__/contexts/fileSystem/MongoDBFS.spec.ts
git commit -m "perf: stop invalidating entry cache on PATCH metadata updates"
```

---

### Task 4: Bump COLLECTION_CACHE_TTL_MS to 30s

**Files:**
- Modify: `contexts/fileSystem/MongoDBFS.ts:28`
- Test: `__tests__/contexts/fileSystem/MongoDBFS.spec.ts`

**Context:** `COLLECTION_CACHE_TTL_MS` is 5000ms (5 seconds). For a local single-user curation tool, this is unnecessarily aggressive — after 5 seconds, stat() falls back to network lookups even though the collection hasn't changed. Aligning with `DOCUMENTS_CACHE_TTL_MS` (already 30s) eliminates premature cache misses during normal browsing.

**Step 1: Write the test**

Add to `__tests__/contexts/fileSystem/MongoDBFS.spec.ts`:

```typescript
describe("cache TTL alignment", () => {
  it("entry cache survives 10 seconds (old 5s TTL would expire)", async () => {
    const fs = new MongoDBFileSystem("mongodb://localhost");

    fs["setCachedCollectionEntries"]("testdb", "products", ["doc1"]);

    // Simulate 10 seconds passing
    const cached = fs["collectionEntriesCache"].get("testdb/products");
    if (cached) cached.cachedAt = Date.now() - 10_000;

    const entries = fs["getCachedCollectionEntries"]("testdb", "products");
    expect(entries).not.toBeNull();
    expect(entries?.has("doc1")).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --runInBand -t "entry cache survives 10 seconds"`
Expected: FAIL — cache expires at 5s, so 10s lookup returns null

**Step 3: Implement the fix**

In `contexts/fileSystem/MongoDBFS.ts` line 28, change:

```typescript
// Before:
const COLLECTION_CACHE_TTL_MS = 5000;

// After:
const COLLECTION_CACHE_TTL_MS = 30_000;
```

**Step 4: Run tests**

Run: `npx jest --runInBand`
Expected: All tests pass

**Step 5: Verify lint and typecheck**

Run: `npx eslint contexts/fileSystem/MongoDBFS.ts && npm run typecheck`

**Step 6: Commit**

```bash
git add contexts/fileSystem/MongoDBFS.ts __tests__/contexts/fileSystem/MongoDBFS.spec.ts
git commit -m "perf: increase collection entry cache TTL from 5s to 30s"
```

---

## Final Verification

After all 4 tasks:

1. `npx jest --runInBand` — all tests pass
2. `npx eslint .` — no errors
3. `npm run typecheck` — clean
4. `npm run build` — clean production build
