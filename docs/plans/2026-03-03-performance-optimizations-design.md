# Performance Optimizations Design

**Goal:** Close the remaining performance gaps identified by code review — cache correctness, payload reduction, and cache policy — without architectural changes.

**Approach:** Four surgical, independent fixes targeting confirmed issues. No virtualization or batch-delete refactoring (React already batches rapid state updates in the same async tick).

---

## Fix 1: stat() cache key mismatch

`collectionEntriesCache` stores encoded identifiers (via `getDocumentIdentifier` → `encodeURIComponent`). `stat()` looks up decoded names (via `parsePath` → `decodeDocumentIdentifier`). For documents with spaces or special characters, the cache always misses, falling through to a network call.

**Change:** Re-encode the lookup key in `stat()`:
```
- cachedEntries?.has(documentName)
+ cachedEntries?.has(encodeURIComponent(documentName))
```

**Test:** stat a document with a space in its name, verify cache hit without network call.

## Fix 2: Paged listing projection on API

The paged endpoint (`[...params].ts` line 229) returns full document bodies. For mixed-size collections, large documents inflate the payload unnecessarily — the file list only needs `_id`, `name`, `category`, `dismissed`, and first image for thumbnails.

**Change:** Apply the same listing projection used by `meta=1` mode to the paged path. Extract a shared `LISTING_PROJECTION` constant. Apply `addThumbnailFields` to paged results.

**Test:** Verify paged response contains only projected fields, not full document bodies.

## Fix 3: Remove entry-cache invalidation from PATCH

`patchDocument()` line 613 deletes the entire `collectionEntriesCache` entry after every PATCH. But PATCH only changes metadata (category, dismissed) — it doesn't add or remove documents. The entries cache tracks document existence, not metadata. The documents list cache is already patched in-place (lines 596-609).

**Change:** Remove `this.collectionEntriesCache.delete(cacheKey)` from `patchDocument()`.

**Test:** Verify stat() still hits cache after a PATCH operation (no unnecessary re-fetch).

## Fix 4: Bump COLLECTION_CACHE_TTL_MS to 30s

Currently 5000ms — too aggressive for a local single-user tool. After expiry, stat() fallback triggers extra lookups. Aligning with `DOCUMENTS_CACHE_TTL_MS` (already 30s) eliminates premature cache misses during normal browsing.

**Change:** `COLLECTION_CACHE_TTL_MS = 5000` → `COLLECTION_CACHE_TTL_MS = 30_000`.

---

## Verification

1. `npx jest --runInBand` — all tests pass
2. `npx eslint .` — no errors
3. `npm run typecheck` — clean
4. `npm run build` — clean
