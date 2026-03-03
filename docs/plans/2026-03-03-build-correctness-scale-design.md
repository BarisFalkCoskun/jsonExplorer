# Build Fix, Correctness & Scale Improvements — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the production build blocker, eliminate data-safety bugs in hide/show and document identity, add keyset pagination for large collections, and clean up quality gates.

**Architecture:** Seven changes ordered P0→P1→P2. P0 is a one-line type fix. P1s address snapshot leakage, `_id`-first identity, keyset pagination, and credential documentation. P2s fix tsc/eslint noise and replace mirrored-logic tests.

**Tech Stack:** Next.js Pages Router, React, BrowserFS, MongoDB driver, TypeScript, Jest.

---

## P0: Fix production build blocker

### Problem

`next build` fails at `FileEntry/index.tsx:579`:

```
Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
```

`fileManagerId` is optional (`FileEntryProps.fileManagerId?: string`) because Desktop, StartMenu, and nested FileManagers don't pass an id. But `getFocusing(id: string)` at line 140 requires a string.

### Fix

Make `getFocusing` accept an optional id and normalize internally with a named sentinel:

```typescript
const NO_MANAGER_ID = "__no-manager-id__";

const getFocusing = (id?: string): string[] => {
  const key = id ?? NO_MANAGER_ID;
  if (!focusingMap.has(key)) focusingMap.set(key, []);
  return focusingMap.get(key)!;
};
```

No early return from the effect — selection/focus behavior stays intact for all callers. The sentinel avoids accidental collision with a real empty-string id.

### Files

- Modify: `components/system/Files/FileEntry/index.tsx:138-143`

---

## P1a: Fix snapshot leakage across folders

### Problem

`allFilesRef` at `FileManager/index.tsx:113` is a bare ref with no collection key. When the user navigates from collectionA to collectionB with hide active, the snapshot from collectionA can leak into collectionB on restore or merge.

Vectors:
1. Disable hide after navigation → restores wrong collection's files
2. Merge at line 581 adds readdir entries into a stale snapshot

### Fix

Replace bare ref with a keyed snapshot:

```typescript
const allFilesRef = useRef<{ key: string; files: typeof files } | undefined>(undefined);
```

**On save** (toggle enable): store a shallow clone keyed by current URL:
```typescript
if (!allFilesRef.current) {
  allFilesRef.current = { key: url, files: { ...currentFiles } };
}
```

The clone (`{ ...currentFiles }`) prevents later `setFiles` mutations from corrupting the snapshot.

**On restore** (toggle disable): only restore when `allFilesRef.current?.key === url`.

**On merge** (readdir re-apply effect, line 581): only merge when snapshot key matches current URL.

**On navigation** (URL change, line 497): clear `allFilesRef.current = undefined`.

### Files

- Modify: `components/system/Files/FileManager/index.tsx:113,131-262,497,577-600`

---

## P1b: Switch file identity to `_id`-first

### Problem

`getDocumentIdentifier` at `MongoDBFS.ts:617` uses `name || _id`. Two documents with the same `name` produce the same filename, causing:
- Overwrite in the files map (`useFolder.ts:262`)
- Ambiguous PATCH/DELETE (wrong document modified/deleted)

### Fix

Four coordinated changes:

1. **`MongoDBFS.ts:617`** — flip identifier to `_id`-first:
```typescript
private getDocumentIdentifier(document: MongoDocument): string {
  const raw = String(document._id || document.name || "unnamed");
  return encodeURIComponent(raw);
}
```

2. **`utils/mongoApi.ts:71`** — reorder filter precedence to `_id` before `name`:
```typescript
export const getDocumentFilters = (documentId: string): object[] => {
  const filters: object[] = [{ _id: documentId }];
  if (ObjectId.isValid(documentId)) {
    filters.push({ _id: new ObjectId(documentId) });
  }
  filters.push({ name: documentId });
  return filters;
};
```

3. **`MongoDBFS.ts:637`** (`getDocument`) — verify fetch uses `getDocumentFilters` which now prefers `_id`. If it constructs its own filter, update to `_id`-first.

4. **`MongoDBFS.ts:979`** (`unlink` / delete) — same: ensure `_id`-first filter resolution.

### Cache invalidation

Caches are keyed by encoded identifiers. Changing the identifier source from `name` to `_id` means cached entries under old keys become stale. Since caches are in-memory with TTL (30s for documents, 5s for collections), a page refresh or TTL expiry clears them automatically. No migration needed.

### Files

- Modify: `contexts/fileSystem/MongoDBFS.ts:617,637,979`
- Modify: `utils/mongoApi.ts:71-79`
- Update: `__tests__/pages/api/mongodb/*.spec.ts` (filter order assertions)

---

## P1c: Keyset pagination for collection listing

### Problem

`handleDocuments` at `[...params].ts:202` and `readdir` at `MongoDBFS.ts:774` fetch all documents in one call. Large collections (10k+ docs) cause high memory usage and slow initial load.

### Architecture

Two-layer design:

1. **Full metadata index** — fetched once per collection via `getDocuments(meta=true)`. Small (~200 bytes/doc). Populates the filter cache for hide/show toggles. This stays unpaginated because instant toggles are the core UX — partial filter state would confuse users.

2. **Paged readdir** — keyset pagination for the heavy path (file entries with stat). Uses `afterName`/`afterId` cursor instead of `skip/limit` to avoid O(N) scans and drift under concurrent writes.

### API changes

Add query params to `handleDocuments`:
- `?limit=N` — page size (default 500)
- `?afterName=X&afterId=Y` — keyset cursor (sort: `{ name: 1, _id: 1 }`)
- `?meta=1` — unchanged, still returns full list (no pagination)

```typescript
// Keyset pagination filter
if (afterName || afterId) {
  filter.$or = [
    { name: { $gt: afterName } },
    { name: afterName, _id: { $gt: afterId } },
  ];
}
const cursor = collection.find(filter).sort({ name: 1, _id: 1 }).limit(limit);
```

Response includes `hasMore: boolean` and `nextCursor: { afterName, afterId } | null`.

### MongoDBFS changes

Add a parallel paged method (BrowserFS `readdir` callback stays unchanged):

```typescript
async readdirPaged(
  path: string,
  cursor?: { afterName: string; afterId: string },
  limit?: number
): Promise<{ entries: string[]; hasMore: boolean; nextCursor?: { afterName: string; afterId: string } }>
```

### useFolder integration

When the mounted FS is `MongoDBFileSystem`, `useFolder` calls `readdirPaged` instead of BrowserFS `readdir`:
- First page populates files
- `loadMore` fetches next page via `readdirPaged(path, nextCursor, limit)`
- Full metadata index is fetched separately (once) for filter cache

### Hide/show with partial pages

**Decision: hide applies to all loaded pages.** The full metadata index (fetched unpaginated via `meta=1`) powers the hide/show toggles. Documents not yet paged in are simply not visible — they'll be filtered when their page loads.

### Files

- Modify: `pages/api/mongodb/[...params].ts` (handleDocuments)
- Modify: `contexts/fileSystem/MongoDBFS.ts` (add `readdirPaged`, keep `readdir`)
- Modify: `components/system/Files/FileManager/useFolder.ts` (Mongo-specific paging path)

---

## P1d: Document credential handling limitation

### Problem

Connection strings with passwords stored plaintext in localStorage and sent via `x-mongodb-connection` header per request.

### Decision

For local-only deployment (current use case), this is acceptable. Document the limitation clearly rather than building a token system now.

### Files

- Modify: `goal.md` — add security note about credential handling
- No code changes

---

## P2a: Clean up quality gates

### Problem

- `npx tsc --noEmit` fails: 1 production error (P0 above), 20 test errors, several e2e errors
- `npm run eslint` reports 850 problems (mostly upstream daedalOS)

### Fix

1. **Test tsc errors** — `MongoDBFSTestable` intersection type resolves to `never` because `documentsListCache` is private. Fix: cast to `any` for test access instead of intersection type, or use a test-specific subclass.

2. **`put-upsert-id.spec.ts`** — fix `_id` type error on destructured type.

3. **Separate tsconfig** — create `tsconfig.test.json` extending base with `skipLibCheck: true` for test files. Keep production strict.

4. **ESLint baseline** — don't fix 850 inherited issues now. Add `--max-warnings` baseline to CI so new violations fail but existing debt is tracked.

### Files

- Modify: `__tests__/contexts/fileSystem/MongoDBFS.spec.ts`
- Modify: `__tests__/pages/api/mongodb/put-upsert-id.spec.ts`
- Create: `tsconfig.test.json`
- Modify: `package.json` (add lint:ci script)

---

## P2b: Strengthen tests to cover real behavior

### Problem

Tests like `patch-response.spec.ts` validate copied logic (object shape assertions) rather than exercising the actual handler or runtime path.

### Fix

Replace mirrored-logic tests with integration-style tests:

1. **API handler tests** — mock `req`/`res` objects and call the handler function directly. Test actual request→response flow, not duplicated logic.

2. **MongoDBFS cache flow** — test `readdir` → `patchDocument` → `getCachedDocumentNames` as a sequence, verifying cache state after each step.

3. **Hide/show toggle flow** — test: enable hide → verify filtered → navigate → verify snapshot cleared → navigate back → re-enable → verify fresh snapshot.

### Files

- Rewrite: `__tests__/pages/api/mongodb/patch-response.spec.ts`
- Add tests to: `__tests__/contexts/fileSystem/MongoDBFS.spec.ts`
- Consider: `__tests__/components/system/Files/FileManager/toggle-flow.spec.ts`

---

## Verification

After all changes:
1. `npx next build` — succeeds (P0 fixed)
2. `npx jest --runInBand` — all tests pass
3. `npx tsc --noEmit` — no production errors, test errors resolved
4. Manual: navigate between collections with hide active — no stale data
5. Manual: two docs with same `name` — distinct file entries, correct PATCH/DELETE
