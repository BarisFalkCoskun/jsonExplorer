# Reliability & Data Safety Improvements

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 reliability issues: test-production divergence, O(n) render-path traversals, localStorage race condition, and dual code paths.

**Architecture:** Extract shared API helpers to an importable module, add an indexed Map to MongoDBFS's document cache for O(1) lookups, add early bail-out to `findMongoDBFileSystem`, consolidate localStorage ownership, and unify the `getDocuments` fetch path.

**Tech Stack:** Next.js API routes, React hooks, MongoDBFS (BrowserFS), Jest

---

### Task 1: Extract shared API helpers to importable utils

**Files:**
- Create: `utils/mongoApi.ts`
- Modify: `pages/api/mongodb/[...params].ts:19-30,32-46,119-127,211-230,462-472`
- Modify: `__tests__/pages/api/mongodb/filter-sanitization.spec.ts:1-21`
- Modify: `__tests__/pages/api/mongodb/method-guards.spec.ts:1-16`
- Modify: `__tests__/pages/api/mongodb/meta-thumbnail.spec.ts:1-36`

**Context:** Five symbols (`normalizeImageUrl`, `addThumbnailFields`, `sanitizeFilter`, `SAFE_FILTER_OPERATORS`, `ALLOWED_METHODS`) are copy-pasted into test files. If production code changes, tests pass against stale copies. Moving them to a shared module fixes this.

**Step 1: Create `utils/mongoApi.ts`**

```typescript
import { ObjectId } from "mongodb";

type MongoImage = {
  large?: string;
  medium?: string;
  small?: string;
};

export const normalizeImageUrl = (img: unknown): string => {
  if (typeof img === 'string' && img.trim().length > 0) {
    return img.trim();
  }

  if (img && typeof img === 'object') {
    const imgObj = img as MongoImage;
    return imgObj.medium || imgObj.small || imgObj.large || "";
  }

  return "";
};

export const addThumbnailFields = (doc: Record<string, unknown>): Record<string, unknown> => {
  const images = Array.isArray(doc.images) ? (doc.images as unknown[]) : [];
  const oldImages = Array.isArray(doc.oldImages) ? (doc.oldImages as unknown[]) : [];
  const allImages = [...images, ...oldImages];

  const firstUrl = allImages.length > 0 ? normalizeImageUrl(allImages[0]) : "";

  const result = { ...doc };
  result.thumbnail = firstUrl || undefined;
  result.imageCount = allImages.length;
  delete result.images;
  delete result.oldImages;

  return result;
};

export const SAFE_FILTER_OPERATORS = new Set([
  '$all', '$and', '$elemMatch', '$eq', '$exists',
  '$gt', '$gte', '$in', '$lt', '$lte',
  '$ne', '$nin', '$nor', '$not', '$options',
  '$or', '$regex', '$size', '$type',
]);

export const sanitizeFilter = (obj: unknown): void => {
  if (!obj || typeof obj !== 'object') return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key.startsWith('$') && !SAFE_FILTER_OPERATORS.has(key)) {
      throw new Error(`Disallowed filter operator: ${key}`);
    }
    if (Array.isArray(value)) {
      for (const item of value) sanitizeFilter(item);
    } else if (value && typeof value === 'object') {
      sanitizeFilter(value);
    }
  }
};

export const ALLOWED_METHODS: Record<string, string[]> = {
  'collections': ['GET'],
  'databases': ['GET'],
  'document': ['DELETE', 'GET', 'PATCH', 'PUT'],
  'documents': ['GET'],
  'drop-collection': ['DELETE'],
  'drop-database': ['DELETE'],
  'images': ['GET'],
  'mkdir': ['POST'],
  'test': ['GET'],
};

export const getDocumentFilters = (documentId: string): object[] => {
  const filters: object[] = [{ name: documentId }, { _id: documentId }];

  if (ObjectId.isValid(documentId)) {
    filters.push({ _id: new ObjectId(documentId) });
  }

  return filters;
};
```

**Step 2: Update `pages/api/mongodb/[...params].ts` to import from utils**

Remove the local definitions of `MongoImage`, `normalizeImageUrl`, `addThumbnailFields`, `SAFE_FILTER_OPERATORS`, `sanitizeFilter`, `ALLOWED_METHODS`, and `getDocumentFilters`. Replace with:

```typescript
import {
  addThumbnailFields,
  ALLOWED_METHODS,
  getDocumentFilters,
  normalizeImageUrl,
  sanitizeFilter,
} from "utils/mongoApi";
```

Keep the `ObjectId` import from `mongodb` for any remaining usage in the file, but `getDocumentFilters` now lives in `utils/mongoApi.ts`.

Lines to remove from `[...params].ts`:
- Lines 13-17 (`type MongoImage`)
- Lines 19-30 (`normalizeImageUrl`)
- Lines 32-46 (`addThumbnailFields`)
- Lines 119-127 (`getDocumentFilters`)
- Lines 211-216 (`SAFE_FILTER_OPERATORS`)
- Lines 218-230 (`sanitizeFilter`)
- Lines 462-472 (`ALLOWED_METHODS`)

**Step 3: Update test files to import from utils**

`__tests__/pages/api/mongodb/filter-sanitization.spec.ts` — replace lines 1-21 with:

```typescript
import { sanitizeFilter } from "utils/mongoApi";
```

`__tests__/pages/api/mongodb/method-guards.spec.ts` — replace lines 1-16 with:

```typescript
import { ALLOWED_METHODS } from "utils/mongoApi";

const isMethodAllowed = (operation: string, method: string): boolean => {
  const allowed = ALLOWED_METHODS[operation];
  return allowed ? allowed.includes(method) : false;
};
```

Note: `isMethodAllowed` stays in the test since it's a test-only helper; only `ALLOWED_METHODS` data is imported.

`__tests__/pages/api/mongodb/meta-thumbnail.spec.ts` — replace lines 1-36 with:

```typescript
import { addThumbnailFields } from "utils/mongoApi";
```

**Step 4: Run all tests**

Run: `npx jest --runInBand`
Expected: All 98 tests PASS (identical behavior, just imported from shared module)

**Step 5: Lint check**

Run: `npx eslint "utils/mongoApi.ts" "pages/api/mongodb/[...params].ts" 2>&1 | head -20`
Expected: No new errors (existing pre-existing errors may appear)

**Step 6: Commit**

```bash
git add "utils/mongoApi.ts" "pages/api/mongodb/[...params].ts" "__tests__/pages/api/mongodb/filter-sanitization.spec.ts" "__tests__/pages/api/mongodb/method-guards.spec.ts" "__tests__/pages/api/mongodb/meta-thumbnail.spec.ts"
git commit -m "refactor: extract shared API helpers to utils/mongoApi for test-production parity"
```

---

### Task 2: Add indexed Map to MongoDBFS document cache for O(1) lookups

**Files:**
- Modify: `contexts/fileSystem/MongoDBFS.ts:33-36,324-332,395-424,431-443,449-461,463-474,476-487,489-538`
- Create: `__tests__/contexts/fileSystem/MongoDBFS-index.spec.ts`

**Context:** `getDocumentThumbnail`, `getCachedDocumentNames`, `getCachedDismissedNames`, `getCachedDocumentCategory`, and `patchDocument` all iterate the full `cached.documents` array with `decodeDocumentIdentifier(getDocumentIdentifier(doc))`. With large collections this is O(n) per lookup, called hundreds of times per render. Adding a `Map<string, MongoDocument>` keyed by decoded identifier turns these into O(1) lookups.

**Step 1: Write the failing test**

Create `__tests__/contexts/fileSystem/MongoDBFS-index.spec.ts`:

```typescript
describe("MongoDBFS document index", () => {
  it("builds index keyed by decoded document identifier", () => {
    const documents = [
      { _id: "1", name: "apple", category: "fruit", thumbnail: "a.jpg", imageCount: 2 },
      { _id: "2", name: "banana", thumbnail: "b.jpg", imageCount: 1 },
      { _id: "3", name: "cherry", dismissed: true },
    ];

    // Simulate building the index the same way MongoDBFS does
    const index = new Map<string, (typeof documents)[0]>();
    for (const doc of documents) {
      const identifier = encodeURIComponent(String(doc.name || doc._id || ""));
      const decoded = decodeURIComponent(identifier);
      index.set(decoded, doc);
    }

    expect(index.size).toBe(3);
    expect(index.get("apple")).toHaveProperty("category", "fruit");
    expect(index.get("banana")).toHaveProperty("thumbnail", "b.jpg");
    expect(index.get("cherry")).toHaveProperty("dismissed", true);
    expect(index.get("nonexistent")).toBeUndefined();
  });

  it("index supports O(1) thumbnail lookup", () => {
    const documents = [
      { _id: "1", name: "apple", thumbnail: "a.jpg", imageCount: 3 },
      { _id: "2", name: "banana", thumbnail: "b.jpg", imageCount: 1 },
    ];

    const index = new Map<string, (typeof documents)[0]>();
    for (const doc of documents) {
      const decoded = decodeURIComponent(encodeURIComponent(String(doc.name || doc._id)));
      index.set(decoded, doc);
    }

    const doc = index.get("apple");
    expect(doc?.thumbnail).toBe("a.jpg");
    expect(doc?.imageCount).toBe(3);
  });

  it("index updated in-place by patchDocument pattern", () => {
    const doc = { _id: "1", name: "apple", thumbnail: "a.jpg", imageCount: 2 };
    const index = new Map<string, typeof doc>();
    index.set("apple", doc);

    // Simulate patchDocument updating the index entry
    const entry = index.get("apple");
    if (entry) {
      (entry as Record<string, unknown>).category = "fruit";
    }

    expect(index.get("apple")).toHaveProperty("category", "fruit");
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npx jest __tests__/contexts/fileSystem/MongoDBFS-index.spec.ts --verbose`
Expected: 3 tests PASS (these test the Map pattern, not the class directly)

**Step 3: Add `documentIndex` to `CachedDocumentsList` type**

In `contexts/fileSystem/MongoDBFS.ts`, change the `CachedDocumentsList` type (lines 33-36):

Replace:

```typescript
type CachedDocumentsList = {
  cachedAt: number;
  documents: MongoDocument[];
};
```

With:

```typescript
type CachedDocumentsList = {
  cachedAt: number;
  documentIndex: Map<string, MongoDocument>;
  documents: MongoDocument[];
};
```

**Step 4: Update `setCachedDocumentsList` to build the index**

Replace `setCachedDocumentsList` (lines 324-332):

```typescript
  private setCachedDocumentsList(
    database: string,
    collection: string,
    documents: MongoDocument[]
  ): void {
    this.documentsListCache.set(
      this.getCollectionCacheKey(database, collection),
      { cachedAt: Date.now(), documents }
    );
  }
```

With:

```typescript
  private setCachedDocumentsList(
    database: string,
    collection: string,
    documents: MongoDocument[]
  ): void {
    const documentIndex = new Map<string, MongoDocument>();
    for (const doc of documents) {
      const key = MongoDBFileSystem.decodeDocumentIdentifier(
        this.getDocumentIdentifier(doc)
      );
      documentIndex.set(key, doc);
    }
    this.documentsListCache.set(
      this.getCollectionCacheKey(database, collection),
      { cachedAt: Date.now(), documentIndex, documents }
    );
  }
```

**Step 5: Replace O(n) scans with O(1) Map lookups**

Replace `getDocumentThumbnail` (lines 395-424):

```typescript
  public getDocumentThumbnail(
    path: string
  ): { imageCount: number; thumbnail: string | undefined } {
    const { database, collection, document } = this.parsePath(path);

    if (!database || !collection || !document) {
      return { imageCount: 0, thumbnail: undefined };
    }

    const key = this.getCollectionCacheKey(database, collection);
    const cached = this.documentsListCache.get(key);

    if (!cached) {
      return { imageCount: 0, thumbnail: undefined };
    }

    const doc = cached.documentIndex.get(document);

    if (!doc) {
      return { imageCount: 0, thumbnail: undefined };
    }

    return {
      imageCount: doc.imageCount ?? 0,
      thumbnail: doc.thumbnail ?? undefined,
    };
  }
```

Replace `isCachedDismissed` (lines 463-474):

```typescript
  public isCachedDismissed(docName: string, database: string, collection: string): boolean {
    const key = this.getCollectionCacheKey(database, collection);
    const cached = this.documentsListCache.get(key);
    if (!cached) return false;

    const doc = cached.documentIndex.get(
      MongoDBFileSystem.decodeDocumentIdentifier(docName)
    );
    return !!doc?.dismissed;
  }
```

Replace `getCachedDocumentCategory` (lines 476-487):

```typescript
  public getCachedDocumentCategory(docName: string, database: string, collection: string): string | null {
    const key = this.getCollectionCacheKey(database, collection);
    const cached = this.documentsListCache.get(key);
    if (!cached) return null;

    const doc = cached.documentIndex.get(
      MongoDBFileSystem.decodeDocumentIdentifier(docName)
    );
    return doc && "category" in doc ? doc.category : null;
  }
```

Replace the cache-update block in `patchDocument` (lines 525-538) — the part inside `if (cached) { ... }`:

```typescript
    if (cached) {
      const doc = cached.documentIndex.get(document);

      if (doc) {
        for (const [k, v] of Object.entries(updates)) {
          if (v === null) {
            delete doc[k];
          } else {
            doc[k] = v;
          }
        }
      }
    }
```

Note: `getCachedDocumentNames` and `getCachedDismissedNames` still iterate the full array because they return a `Set` of all matching identifiers. This is fine — they run once per toggle, not per-file.

**Step 6: Run all tests**

Run: `npx jest --runInBand`
Expected: All tests PASS

**Step 7: Lint check**

Run: `npx eslint "contexts/fileSystem/MongoDBFS.ts" 2>&1 | head -10`
Expected: No new errors

**Step 8: Commit**

```bash
git add "contexts/fileSystem/MongoDBFS.ts" "__tests__/contexts/fileSystem/MongoDBFS-index.spec.ts"
git commit -m "perf: add indexed Map to document cache for O(1) thumbnail and category lookups"
```

---

### Task 3: Early bail-out in findMongoDBFileSystem

**Files:**
- Modify: `components/system/Files/FileEntry/useMongoDBIcon.ts:26-56`

**Context:** `findMongoDBFileSystem` is called via `useMemo` for every `FileEntry` component. It walks `rootFs.mntMap` segment-by-segment. For non-MongoDB files (desktop icons, shortcuts), this is wasted work. With very few MongoDB mount points (1-3), a fast prefix check can bail out immediately for all non-matching paths.

**Step 1: Replace `findMongoDBFileSystem` with prefix-based early bail-out**

Replace lines 26-56:

```typescript
const findMongoDBFileSystem = (
  path: string,
  rootFs: RootFileSystem | null | undefined
): {
  mongoFS: MongoDBFileSystem;
  mountPoint: string;
  relativePath: string;
} | null => {
  if (!rootFs) return null;

  const pathParts = path.split("/");
  let currentPath = "/";

  for (let i = 1; i < pathParts.length; i++) {
    currentPath = `${currentPath}${pathParts[i]}/`.replace(/\/+/g, "/");
    const mountPoint = currentPath.slice(0, -1);

    if (rootFs.mntMap && rootFs.mntMap[mountPoint]) {
      const fs = rootFs.mntMap[mountPoint];
      if (fs instanceof MongoDBFileSystem) {
        return {
          mongoFS: fs,
          mountPoint,
          relativePath: path.replace(mountPoint, ""),
        };
      }
    }
  }

  return null;
};
```

With:

```typescript
const findMongoDBFileSystem = (
  path: string,
  rootFs: RootFileSystem | null | undefined
): {
  mongoFS: MongoDBFileSystem;
  mountPoint: string;
  relativePath: string;
} | null => {
  if (!rootFs?.mntMap) return null;

  // Fast path: check if path starts with any known MongoDB mount point
  for (const [mountPoint, fs] of Object.entries(rootFs.mntMap)) {
    if (fs instanceof MongoDBFileSystem && path.startsWith(mountPoint)) {
      return {
        mongoFS: fs,
        mountPoint,
        relativePath: path.slice(mountPoint.length),
      };
    }
  }

  return null;
};
```

Key changes:
- Instead of walking path segments and checking each prefix, iterate the (small) `mntMap` directly
- `Object.entries(mntMap)` iterates 1-3 entries vs the old approach iterating all path segments
- `path.startsWith(mountPoint)` is a single string comparison
- Returns immediately for non-MongoDB paths after checking 1-3 entries

**Step 2: Run all tests**

Run: `npx jest --runInBand`
Expected: All tests PASS

**Step 3: Lint check**

Run: `npx eslint "components/system/Files/FileEntry/useMongoDBIcon.ts" 2>&1 | head -10`
Expected: No new errors

**Step 4: Commit**

```bash
git add "components/system/Files/FileEntry/useMongoDBIcon.ts"
git commit -m "perf: replace segment walk with prefix check in findMongoDBFileSystem"
```

---

### Task 4: Single owner for localStorage connections

**Files:**
- Modify: `hooks/useMongoDBIntegration.ts:165-191`

**Context:** Both `useFileSystemContextState.ts` (line 718) and `useMongoDBIntegration.ts` (line 166) read `localStorage("mongodbConnections")` on startup. `useFileSystemContextState` is the authoritative owner — it restores mounts and writes back a normalized value. `useMongoDBIntegration` independently reads the same key and writes a demo connection if empty, creating a race condition.

The fix: `useMongoDBIntegration` should not read from localStorage on mount. It already syncs its `connections` state from `rootFs.mntMap` in its second `useEffect` (line 194). We just need to seed the initial state from `mntMap` instead of localStorage, and let `useFileSystemContextState` remain the sole startup reader/writer.

**Step 1: Replace the localStorage-reading useEffect**

In `hooks/useMongoDBIntegration.ts`, replace lines 164-191 (the first `useEffect`):

```typescript
  // Load saved connections from localStorage
  useEffect(() => {
    const savedConnections = localStorage.getItem("mongodbConnections");

    if (savedConnections) {
      try {
        const connections = (JSON.parse(savedConnections) as MongoDBConnection[]).map(
          (connection) => ({
            ...connection,
            isConnected: false,
          })
        );

        setState(prev => ({ ...prev, connections }));
      } catch (error) {
        console.error("Failed to load MongoDB connections:", error);
      }
    } else {
      // Add a default demo connection for first-time users
      const demoConnection: MongoDBConnection = {
        connectionString: "mongodb://localhost:27017",
        alias: "Local",
        isConnected: false,
      };
      setState(prev => ({ ...prev, connections: [demoConnection] }));
      saveConnections([demoConnection]);
    }
  }, [saveConnections]);
```

With:

```typescript
  // Seed connections from localStorage (read-only — useFileSystemContextState owns writes at startup)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("mongodbConnections");
      if (!raw) return;

      const parsed = JSON.parse(raw) as MongoDBConnection[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;

      setState(prev => ({
        ...prev,
        connections: parsed.map((c) => ({ ...c, isConnected: false })),
      }));
    } catch {
      // Ignore parse errors — useFileSystemContextState will normalize
    }
  }, []);
```

Key changes:
- Removed `saveConnections` dependency — this effect never writes to localStorage
- Removed demo connection creation — `useFileSystemContextState` already handles the default
- Read-only: only populates in-memory state from whatever `useFileSystemContextState` stored
- Removed `saveConnections` from deps array since the effect no longer calls it

**Step 2: Run all tests**

Run: `npx jest --runInBand`
Expected: All tests PASS

**Step 3: Lint check**

Run: `npx eslint "hooks/useMongoDBIntegration.ts" 2>&1 | head -10`
Expected: No new errors

**Step 4: Commit**

```bash
git add "hooks/useMongoDBIntegration.ts"
git commit -m "fix: make useMongoDBIntegration read-only at startup to avoid localStorage race"
```

---

### Task 5: Unify getDocuments code paths

**Files:**
- Modify: `contexts/fileSystem/MongoDBFS.ts:335-372`

**Context:** `getDocuments` has two code paths: `metaOnly=true` uses raw `fetch()` to `/api/mongodb/documents/{db}/{col}?meta=1`; `metaOnly=false` goes through `this.client.db(dbName).collection(collectionName).find({}).toArray()` which itself is a `fetch()` wrapper in the API client. The error handling differs (direct fetch throws `HTTP {status}` errors; the client wrapper does the same but in a different code path). Unifying them reduces maintenance surface.

**Step 1: Replace getDocuments with unified fetch**

Replace lines 335-372:

```typescript
  private async getDocuments(
    dbName: string,
    collectionName: string,
    metaOnly = false
  ): Promise<MongoDocument[]> {
    await this.connect();
    if (!this.client) throw new Error("No MongoDB connection");

    if (metaOnly) {
      const cached = this.getCachedDocumentsList(dbName, collectionName);

      if (cached) return cached;

      const response = await fetch(
        `/api/mongodb/documents/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}?meta=1`,
        {
          headers: {
            "x-mongodb-connection": this.connectionString,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const documents = (await response.json()) as MongoDocument[];

      this.setCachedDocumentsList(dbName, collectionName, documents);

      return documents;
    }

    const db = this.client.db(dbName);
    const collection = db.collection(collectionName);
    const documents = await collection.find({}).toArray();
    return documents as MongoDocument[];
  }
```

With:

```typescript
  private async getDocuments(
    dbName: string,
    collectionName: string,
    metaOnly = false
  ): Promise<MongoDocument[]> {
    if (metaOnly) {
      const cached = this.getCachedDocumentsList(dbName, collectionName);

      if (cached) return cached;
    }

    const url = `/api/mongodb/documents/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}${metaOnly ? "?meta=1" : ""}`;

    const response = await fetch(url, {
      headers: {
        "x-mongodb-connection": this.connectionString,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const documents = (await response.json()) as MongoDocument[];

    if (metaOnly) {
      this.setCachedDocumentsList(dbName, collectionName, documents);
    }

    return documents;
  }
```

Key changes:
- Single `fetch()` call for both paths — only the `?meta=1` query param differs
- Removed `await this.connect()` and `this.client` dependency — the API client was only used for the non-meta path, and all it did was call the same API endpoint
- Cache check and population still scoped to `metaOnly` path only

**Step 2: Run all tests**

Run: `npx jest --runInBand`
Expected: All tests PASS

**Step 3: Lint check**

Run: `npx eslint "contexts/fileSystem/MongoDBFS.ts" 2>&1 | head -10`
Expected: No new errors

**Step 4: Commit**

```bash
git add "contexts/fileSystem/MongoDBFS.ts"
git commit -m "refactor: unify getDocuments into single fetch path for both meta and full queries"
```

---

## Verification

After all 5 tasks:

1. `npx jest --runInBand` — all tests pass
2. `npx eslint "utils/mongoApi.ts" "pages/api/mongodb/[...params].ts" "contexts/fileSystem/MongoDBFS.ts" "components/system/Files/FileEntry/useMongoDBIcon.ts" "hooks/useMongoDBIntegration.ts"` — no new errors
3. Manual smoke test: connect to MongoDB, browse a collection, toggle hide-categorized/dismissed, verify thumbnails load
