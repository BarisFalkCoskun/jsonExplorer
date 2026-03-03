# Reliability & Data Safety Improvements — Design

**Date:** 2026-03-03
**Status:** Approved

## Problem

Code review identified 5 reliability issues affecting data safety, render performance, and test trustworthiness:

1. `findMongoDBFileSystem` traverses `mntMap` for every FileEntry render — O(segments * mntMap) per file
2. `localStorage("mongodbConnections")` is read/written from two independent React hooks at startup — race condition
3. Test files copy-paste production logic instead of importing — tests can silently diverge from production
4. `getDocumentThumbnail()` does O(n) linear scan through documents array for every visible file
5. `getDocuments()` has two code paths (`fetch()` vs API client) for `metaOnly` vs full — inconsistent error handling

## Approach

### Fix 1: Early bail-out in findMongoDBFileSystem

**Current:** Walks path segment-by-segment checking `rootFs.mntMap[segment]` for every FileEntry, including non-MongoDB files (desktop icons, shortcuts, etc).

**Fix:** Check if path starts with any known MongoDBFS mount point before doing the segment walk. `mntMap` typically has 1-3 entries. For paths that don't match any MongoDB mount, return `null` immediately — no traversal needed.

**Files:** `components/system/Files/FileEntry/useMongoDBIcon.ts`

### Fix 2: Single owner for localStorage connections

**Current:** `useFileSystemContextState.ts` reads `mongodbConnections` on startup to restore mounts. `useMongoDBIntegration.ts` independently reads the same key in its own `useEffect` and writes a demo connection if empty. If both effects fire in the same render cycle, one can overwrite the other.

**Fix:** Make `useFileSystemContextState.ts` the sole reader at startup. `useMongoDBIntegration.ts` drops its initial `localStorage.getItem` + demo-connection logic from the mount-time `useEffect`. It already syncs its in-memory `connections` state from `rootFs.mntMap` (second `useEffect` at line 194), so it doesn't need an independent localStorage read. The hook only writes to localStorage via `saveConnections` when the user explicitly adds/removes connections.

**Files:** `hooks/useMongoDBIntegration.ts`, `contexts/fileSystem/useFileSystemContextState.ts`

### Fix 3: Extract shared logic to importable utils

**Current:** `filter-sanitization.spec.ts` duplicates `sanitizeFilter` + `SAFE_FILTER_OPERATORS`. `method-guards.spec.ts` duplicates `ALLOWED_METHODS`. `meta-thumbnail.spec.ts` duplicates `normalizeImageUrl` + `addThumbnailFields`. If production code changes, tests pass against stale copies.

**Fix:** Move these 5 symbols from `pages/api/mongodb/[...params].ts` into `utils/mongoApi.ts`. Both the API route and tests import from the same source. No logic changes.

**Files:** New: `utils/mongoApi.ts`. Modify: `pages/api/mongodb/[...params].ts`, `__tests__/pages/api/mongodb/filter-sanitization.spec.ts`, `__tests__/pages/api/mongodb/method-guards.spec.ts`, `__tests__/pages/api/mongodb/meta-thumbnail.spec.ts`

### Fix 4: O(1) document lookup via index Map

**Current:** `getDocumentThumbnail`, `getCachedDocumentNames`, `getCachedDismissedNames`, `getCachedDocumentCategory`, and `patchDocument` all iterate the full `cached.documents` array comparing `decodeDocumentIdentifier(getDocumentIdentifier(doc))`. With 5000 docs and 500 visible entries, thumbnail lookups alone produce ~2.5M string comparisons per render.

**Fix:** When `documentsListCache` is populated (in `getDocuments` metaOnly path and in `readdir`), also build a `Map<string, MongoDocument>` keyed by decoded document identifier. Store it alongside the documents array in `CachedDocumentsList`. All lookup methods become O(1) `Map.get()` calls. `patchDocument` updates both the array (for iteration-dependent consumers like `getCachedDocumentNames`) and the Map.

**Files:** `contexts/fileSystem/MongoDBFS.ts`

### Fix 5: Unify getDocuments code paths

**Current:** `metaOnly=true` fetches `/api/mongodb/documents/{db}/{col}?meta=1` via raw `fetch()`. `metaOnly=false` goes through a different code path (the API client's `collection.find().toArray()` pattern, which itself is a `fetch` wrapper). Error handling differs between the two paths.

**Fix:** Route both through the same `fetch()` pattern with the `meta` query param controlling the projection server-side. Remove the unused API client code path for documents. This eliminates the divergence and ensures both paths share the same error handling, timeout, and retry behavior.

**Files:** `contexts/fileSystem/MongoDBFS.ts`

## Execution Order

1. **Fix 3** (extract utils) — lowest risk, unblocks test confidence for all subsequent changes
2. **Fix 1 + Fix 4** (render perf) — together since they share the hot path; Fix 4 benefits Fix 1's callers
3. **Fix 2** (localStorage race) — independent, moderate risk
4. **Fix 5** (unify fetch) — largest refactor surface, benefits from having the test infrastructure from Fix 3

## Out of Scope

- Security hardening (API auth, connection string allowlist) — separate initiative
- MongoDBFS `any` type cleanup — separate initiative
- Component file splitting (700+ line files) — separate initiative
