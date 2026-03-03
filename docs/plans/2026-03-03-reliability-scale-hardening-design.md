# Design: Reliability & Scale Hardening Pass

## Problem

The codebase has a strong foundation for local curation but has scaling and correctness gaps that block clean growth:

1. **Initial collection load fetches all documents upfront.** `readdir()` calls `getDocuments()` with `meta=1` and no limit, loading every document's metadata in one shot. Pagination (`readdirPaged`) only kicks in for subsequent scroll-triggered `loadMore` calls. A 50k-document collection still blocks on a full initial fetch.

2. **PATCH accepts empty/malicious field updates.** An empty `{}` body passes validation but produces an empty `updateOps`, causing an invalid `updateOne()` call. Field names with `$` prefixes or dotted paths also pass through unchecked.

3. **Keyboard delete uses fire-and-forget forEach.** `useFileKeyboardShortcuts.ts` uses `focusedEntries.forEach(async ...)` for delete operations — async callbacks in `forEach` are never awaited, so failures are silently dropped and UI can diverge from database state.

4. **Hide/show snapshot resurrects deleted entries.** The sync block at `index.tsx:586-592` only adds new entries to `allFilesRef` but never removes entries deleted from `currentFiles`. Toggling show-all after a delete brings back ghost entries.

5. **`tsc --noEmit` fails with 11 errors.** No `typecheck` script exists in `package.json`. Type drift in unit tests (3 errors) and e2e files (8 errors) goes undetected.

6. **Clipboard paste has no `.catch()`.** `createFileReaders(...).then(openTransferDialog)` in keyboard shortcuts has no error handler.

## Design

### Phase 1 — Bug fixes, each with a regression test (single PR)

#### 1a. Truly paged initial listing + cache hydration

**Approach (1a-i):** `useFolder` detects MongoDB collection paths (already has `mongoFsRef` at line 302) and calls `readdirPaged` for the first page instead of `readdir`. `readdir` itself stays unchanged for BrowserFS compatibility.

**Cache contract:** `readdirPaged` currently returns filenames but does NOT hydrate caches. This must change. After each paged fetch, `readdirPaged` must:
- **Merge into `documentsListCache`** — append returned documents to the existing cache entry (or create one). This is required for `getCachedDocumentNames()` and `getCachedDismissedNames()` to work correctly with hide toggles.
- **Merge into `collectionEntriesCache`** — add returned document identifiers to the Set. This is required for fast `stat/lstat` lookups without per-file network calls.

Both caches must be merge-not-replace, since subsequent `loadMore` pages will add to them incrementally.

**useFolder changes:**
- When `mongoFsRef.current` is detected, skip `readdir` entirely and call `readdirPaged` for the first page (same `limit` as `loadMore`, default 200-500).
- Set `mongoCursorRef.current` from the first page result.
- Set `hasMore` from the first page result.
- The existing `loadMore` path continues to work unchanged for subsequent pages.

**Acceptance criteria:**
- Initial collection open must NOT call the `meta=1` full-fetch endpoint (`getDocuments()`).
- First request must be limit-bounded (e.g., `?limit=500`).
- `mongoCursorRef` is set from first page and `hasMore` is accurate.
- `Ctrl+H` / `Ctrl+Shift+D` are still instant for loaded entries and still correct after scrolling more pages in.
- `stat/lstat` for loaded documents resolves from cache without network calls.

**Regression test:** Mock fetch to verify initial MongoDB collection load issues a limit-bounded request, not `meta=1`.

#### 1b. Guard empty and malicious PATCH fields

**Fix:** In the PATCH handler, after splitting into `setFields`/`unsetFields`:
- If both are empty (`updateOps` has no keys), return 400 with `"No update fields provided"`.
- Before building `$set/$unset`, reject field names starting with `$` or containing `.` (dotted paths) — these are MongoDB operator injection vectors. The allowlist for `$`-prefixed keys in filter queries doesn't apply to update field names.

**Regression tests:**
- `{}` body returns 400.
- `{ "$set": "evil" }` body returns 400.
- `{ "dotted.path": "value" }` body returns 400.
- `{ "category": "fruit" }` still succeeds.

#### 1c. Fix async-in-forEach on keyboard delete

**Fix:** In `useFileKeyboardShortcuts.ts`, replace:
```typescript
focusedEntries.forEach(async (entry) => { ... });
```
with `Promise.allSettled` + error surfacing or `for...of` with `await`.

**Regression test:** Verify all deletions are awaited and that a failed deletion in the batch doesn't prevent others from executing.

#### 1d. Fix stale snapshot resurrection

**Fix:** In the sync block at `index.tsx:586-592`, after adding new entries to `allFilesRef`, also remove entries from `allFilesRef.files` that are NOT in `currentFiles`:

```typescript
// Remove entries deleted while filter was active
for (const name of Object.keys(allFilesRef.current.files)) {
  if (!(name in currentFiles)) {
    delete allFilesRef.current.files[name];
  }
}
```

**Regression test:** Simulate delete-while-hidden → toggle show-all → verify deleted entry does not reappear.

#### 1e. Clipboard paste `.catch()`

**Fix:** Add `.catch(console.error)` to `createFileReaders(...).then(openTransferDialog)`.

No separate test — fire-and-forget error handling.

#### 1f. Fix tsc drift + add typecheck scripts

**Fix 11 tsc errors:**
- 3 in `__tests__/` (mutations.spec.ts argument count, put-upsert-id.spec.ts type comparison)
- 8 in `e2e/` (missing exports from e2e/constants, unknown type)

**Add two scripts to `package.json`:**
- `"typecheck": "tsc --noEmit"` — app code only (tsconfig.json excludes test/e2e)
- `"typecheck:all": "tsc --noEmit -p tsconfig.test.json && tsc --noEmit"` — full coverage including tests and e2e

This lets e2e drift not block core reliability work while still providing full coverage when desired.

### Phase 2 — Behavioral tests for critical paths (separate PR)

- `fetchWithTimeout` timeout behavior (verify AbortController fires after 30s, error message is descriptive)
- API route handlers end-to-end (PATCH/PUT/DELETE with mocked MongoDB client — test actual handler, not extracted logic)
- `patchDocument` cache coherence (verify `documentsListCache` and `documentIndex` are updated after successful patch)
- Keyset pagination cursor construction in `handleDocuments` (verify `afterName`/`afterId` produce correct MongoDB filter)

### Phase 3 — Dead code & cleanup (separate PR)

- Remove ~50+ unused exports inherited from daedalOS
- Fix `as any` casts in PUT handler with proper types
- Guard `localStorage` calls with SSR check in `useMongoDBIntegration`

## File impact

| File | Phase | Change |
|------|-------|--------|
| `contexts/fileSystem/MongoDBFS.ts` | 1a | `readdirPaged` hydrates both caches |
| `components/system/Files/FileManager/useFolder.ts` | 1a | Skip `readdir`, use `readdirPaged` for first page |
| `pages/api/mongodb/[...params].ts` | 1b | Empty + field name validation on PATCH |
| `components/system/Files/FileManager/useFileKeyboardShortcuts.ts` | 1c, 1e | Await deletes, catch paste |
| `components/system/Files/FileManager/index.tsx` | 1d | Prune stale entries from snapshot |
| `package.json` | 1f | Add typecheck scripts |
| `__tests__/` + `e2e/` | 1f | Fix 11 type errors |
| New test files | 1a-1d | Regression tests per fix |
