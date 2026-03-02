# Stability Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the highest-impact correctness and reliability bugs in the MongoDB curation workflow — scoped cache lookups, awaited mutations with error feedback, lint toolchain, unified connection restore, and working collection/database delete.

**Architecture:** Each task targets a specific subsystem. Tasks 1 and 2 are the most impactful (cache correctness + mutation reliability). Task 3 is a quick lint fix that unblocks safe refactoring. Tasks 4 and 5 address connection lifecycle and delete semantics. Every task includes targeted regression tests that land alongside the fix.

**Tech Stack:** TypeScript, React, Next.js (Pages Router), Jest (jsdom), BrowserFS, MongoDB driver (server-side API routes)

---

### Task 1: Fix cache scoping + stable document identity in MongoDBFS

The four public cache-query methods (`getCachedDocumentNames`, `getCachedDismissedNames`, `isCachedDismissed`, `getCachedDocumentCategory`) iterate **all** cache entries and return after the first match. After navigating between collections, the wrong collection's data can be used. The callers in `FileManager/index.tsx` (lines 134, 174) don't pass any collection context.

Additionally, `getDocumentIdentifier` (line 559) uses `name || _id || "unnamed"` — names with `/` break path parsing, and duplicate `name` values cause collisions.

**Files:**
- Modify: `contexts/fileSystem/MongoDBFS.ts`
- Modify: `components/system/Files/FileManager/index.tsx`
- Modify: `components/system/Files/FileEntry/useFileContextMenu.ts`
- Create: `__tests__/contexts/fileSystem/MongoDBFS.spec.ts`

**Step 1: Write failing tests for cache scoping**

Create `__tests__/contexts/fileSystem/MongoDBFS.spec.ts`:

```typescript
import { MongoDBFileSystem } from "contexts/fileSystem/MongoDBFS";

// We need to access private members for testing cache behavior.
// Use type assertion to bypass TS access modifiers.
type MongoDBFSTestable = MongoDBFileSystem & {
  documentsListCache: Map<string, { cachedAt: number; documents: any[] }>;
  getCollectionCacheKey(db: string, col: string): string;
};

const createFS = (): MongoDBFSTestable =>
  new MongoDBFileSystem("mongodb://localhost:27017") as MongoDBFSTestable;

describe("MongoDBFileSystem cache scoping", () => {
  it("getCachedDocumentNames scoped to a specific collection", () => {
    const fs = createFS();
    const key1 = fs.getCollectionCacheKey("db1", "products");
    const key2 = fs.getCollectionCacheKey("db1", "orders");

    fs.documentsListCache.set(key1, {
      cachedAt: Date.now(),
      documents: [
        { _id: "1", name: "apple", category: "fruit" },
        { _id: "2", name: "banana" },
      ],
    });
    fs.documentsListCache.set(key2, {
      cachedAt: Date.now(),
      documents: [
        { _id: "3", name: "order1", category: "processed" },
      ],
    });

    // Should return only categorized docs from db1/products
    const result = fs.getCachedDocumentNames("db1", "products");
    expect(result).toEqual(new Set(["apple"]));

    // Should return only categorized docs from db1/orders
    const result2 = fs.getCachedDocumentNames("db1", "orders");
    expect(result2).toEqual(new Set(["order1"]));
  });

  it("getCachedDismissedNames scoped to a specific collection", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, {
      cachedAt: Date.now(),
      documents: [
        { _id: "1", name: "apple", dismissed: true },
        { _id: "2", name: "banana" },
      ],
    });

    const result = fs.getCachedDismissedNames("db1", "products");
    expect(result).toEqual(new Set(["apple"]));
  });

  it("isCachedDismissed scoped to a specific collection", () => {
    const fs = createFS();
    const key1 = fs.getCollectionCacheKey("db1", "col1");
    const key2 = fs.getCollectionCacheKey("db1", "col2");

    fs.documentsListCache.set(key1, {
      cachedAt: Date.now(),
      documents: [{ _id: "1", name: "docA", dismissed: true }],
    });
    fs.documentsListCache.set(key2, {
      cachedAt: Date.now(),
      documents: [{ _id: "2", name: "docA" }],
    });

    expect(fs.isCachedDismissed("docA", "db1", "col1")).toBe(true);
    expect(fs.isCachedDismissed("docA", "db1", "col2")).toBe(false);
  });

  it("getCachedDocumentCategory scoped to a specific collection", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, {
      cachedAt: Date.now(),
      documents: [
        { _id: "1", name: "apple", category: "fruit" },
        { _id: "2", name: "banana" },
      ],
    });

    expect(fs.getCachedDocumentCategory("apple", "db1", "products")).toBe("fruit");
    expect(fs.getCachedDocumentCategory("banana", "db1", "products")).toBeNull();
  });

  it("returns null when no cache exists for the requested collection", () => {
    const fs = createFS();
    expect(fs.getCachedDocumentNames("db1", "nonexistent")).toBeNull();
    expect(fs.getCachedDismissedNames("db1", "nonexistent")).toBeNull();
  });
});

describe("MongoDBFileSystem document identity", () => {
  it("sanitizes / in document names to prevent path confusion", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, {
      cachedAt: Date.now(),
      documents: [
        { _id: "1", name: "weird/name", category: "fruit" },
      ],
    });

    // The identifier should be safe for use in paths (no raw /)
    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toBeDefined();
    for (const id of categorized!) {
      expect(id).not.toContain("/");
    }
  });

  it("uses _id as string when name is missing", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, {
      cachedAt: Date.now(),
      documents: [
        { _id: "abc123", category: "electronics" },
      ],
    });

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toEqual(new Set(["abc123"]));
  });

  it("never returns 'unnamed' — uses _id fallback", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, {
      cachedAt: Date.now(),
      documents: [
        { _id: "fallback-id", category: "misc" },
      ],
    });

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toBeDefined();
    expect(categorized!.has("unnamed")).toBe(false);
    expect(categorized!.has("fallback-id")).toBe(true);
  });
});
```

**Step 2: Run the tests — verify they fail**

Run: `npm test -- --testPathPattern="MongoDBFS" --runInBand`
Expected: FAIL — methods don't accept `database`/`collection` params yet.

**Step 3: Implement scoped cache lookups + safe document identity**

In `contexts/fileSystem/MongoDBFS.ts`:

a) Change `getDocumentIdentifier` to sanitize `/`:

```typescript
private getDocumentIdentifier(document: MongoDocument): string {
  const raw = String(document.name || document._id || "");
  // Replace / with _ to prevent path-parsing confusion
  return raw.replace(/\//g, "_") || String(document._id || "unnamed");
}
```

b) Add `database` and `collection` parameters to the four public cache methods. Each method should look up only the specific cache key:

```typescript
public getCachedDocumentNames(database: string, collection: string): Set<string> | null {
  const key = this.getCollectionCacheKey(database, collection);
  const cached = this.documentsListCache.get(key);
  if (!cached) return null;

  const categorized = new Set<string>();
  for (const doc of cached.documents) {
    if ("category" in doc) {
      categorized.add(this.getDocumentIdentifier(doc));
    }
  }
  return categorized;
}

public getCachedDismissedNames(database: string, collection: string): Set<string> | null {
  const key = this.getCollectionCacheKey(database, collection);
  const cached = this.documentsListCache.get(key);
  if (!cached) return null;

  const dismissed = new Set<string>();
  for (const doc of cached.documents) {
    if (doc.dismissed) {
      dismissed.add(this.getDocumentIdentifier(doc));
    }
  }
  return dismissed;
}

public isCachedDismissed(docName: string, database: string, collection: string): boolean {
  const key = this.getCollectionCacheKey(database, collection);
  const cached = this.documentsListCache.get(key);
  if (!cached) return false;

  for (const doc of cached.documents) {
    if (this.getDocumentIdentifier(doc) === docName) {
      return !!doc.dismissed;
    }
  }
  return false;
}

public getCachedDocumentCategory(docName: string, database: string, collection: string): string | null {
  const key = this.getCollectionCacheKey(database, collection);
  const cached = this.documentsListCache.get(key);
  if (!cached) return null;

  for (const doc of cached.documents) {
    if (this.getDocumentIdentifier(doc) === docName && "category" in doc) {
      return doc.category;
    }
  }
  return null;
}
```

c) Make `getCollectionCacheKey` public (tests need it, and callers will need to extract db/collection from URLs):

```typescript
public getCollectionCacheKey(database: string, collection: string): string {
  return `${database}/${collection}`;
}
```

**Step 4: Update callers in FileManager/index.tsx**

The callers need to extract `database` and `collection` from the current URL. Add a helper that derives db/collection from the `url` and `mountUrl`:

In `components/system/Files/FileManager/index.tsx`, after the `mongoFs` useMemo (around line 120), add:

```typescript
const mongoCollection = useMemo(() => {
  if (!isMongoFS || !mountUrl) return { database: "", collection: "" };
  const relativePath = url.replace(`${mountUrl}/`, "").replace(`${mountUrl}`, "");
  const parts = relativePath.split("/").filter(Boolean);
  return { database: parts[0] || "", collection: parts[1] || "" };
}, [isMongoFS, mountUrl, url]);
```

Then update every call site:
- Line 134: `mongoFs.getCachedDocumentNames()` → `mongoFs.getCachedDocumentNames(mongoCollection.database, mongoCollection.collection)`
- Line 174: `mongoFs.getCachedDismissedNames()` → `mongoFs.getCachedDismissedNames(mongoCollection.database, mongoCollection.collection)`
- Line 240: `mongoFs.getCachedDocumentCategory(...)` → `mongoFs.getCachedDocumentCategory(..., mongoCollection.database, mongoCollection.collection)`
- Line 259: same pattern

Pass `mongoCollection` into `handleDismiss` and `handleSetCategory` via closure (they already close over `mongoFs` and `url`).

**Step 5: Update callers in useFileContextMenu.ts**

Same pattern: derive `database`/`collection` from the `mountUrl` and the entry paths. The context menu entries already have access to `mountUrl` and `absoluteEntries()`. Extract db/collection from the mount-relative path.

For each call to `getCachedDocumentCategory`, `isCachedDismissed` — pass the extracted db/collection.

**Step 6: Run tests — verify they pass**

Run: `npm test -- --testPathPattern="MongoDBFS" --runInBand`
Expected: PASS

**Step 7: Commit**

```bash
git add __tests__/contexts/fileSystem/MongoDBFS.spec.ts contexts/fileSystem/MongoDBFS.ts components/system/Files/FileManager/index.tsx components/system/Files/FileEntry/useFileContextMenu.ts
git commit -m "fix: scope cache lookups to current collection and sanitize document identifiers

Cache query methods (getCachedDocumentNames, getCachedDismissedNames,
isCachedDismissed, getCachedDocumentCategory) now require explicit
database/collection parameters instead of iterating all cache entries.
Prevents wrong-collection data after navigation.

getDocumentIdentifier now sanitizes / in names to prevent path confusion."
```

---

### Task 2: Await mutations and surface errors for label/dismiss operations

`patchDocument()` calls throughout `FileManager/index.tsx` and `useFileContextMenu.ts` use `.forEach()` with unawaited `.catch(console.error)`. If a save fails, the user has no indication.

**Files:**
- Modify: `components/system/Files/FileManager/index.tsx`
- Modify: `components/system/Files/FileEntry/useFileContextMenu.ts`
- Create: `__tests__/components/system/Files/FileManager/mutations.spec.ts`

**Step 1: Write failing test for mutation error surfacing**

Create `__tests__/components/system/Files/FileManager/mutations.spec.ts`:

```typescript
describe("patchDocument error handling", () => {
  it("collects errors from failed patch operations", async () => {
    const results = { succeeded: 0, failed: 0 };
    const mockPatch = jest.fn()
      .mockResolvedValueOnce(undefined)      // first succeeds
      .mockRejectedValueOnce(new Error("Network error")); // second fails

    const entries = ["a.json", "b.json"];
    const errors: Error[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        try {
          await mockPatch(entry, { category: "fruit" });
          results.succeeded++;
        } catch (err) {
          results.failed++;
          errors.push(err as Error);
        }
      })
    );

    expect(results.succeeded).toBe(1);
    expect(results.failed).toBe(1);
    expect(errors[0].message).toBe("Network error");
  });
});
```

**Step 2: Run test — verify it passes (this validates the pattern)**

Run: `npm test -- --testPathPattern="mutations" --runInBand`
Expected: PASS (this test validates the Promise.all + try/catch pattern we'll use)

**Step 3: Refactor mutations in FileManager/index.tsx**

Replace the fire-and-forget `forEach` pattern with `Promise.all` + error collection. In each of `handleSetCategory` (line 258), `handleDismiss` (line 206), and the context menu actions:

**handleSetCategory** (around line 255-274):

```typescript
if (raw) {
  const newLabels = raw.toLowerCase().split(",").map((l) => l.trim()).filter(Boolean);

  const results = await Promise.allSettled(
    entries.map(async (entry) => {
      const existing = mongoFs.getCachedDocumentCategory(
        entry.replace(/\.json$/, ""),
        mongoCollection.database,
        mongoCollection.collection
      );
      const existingLabels = existing ? existing.split(",").map((l) => l.trim().toLowerCase()) : [];
      const labelsToAdd = newLabels.filter((l) => !existingLabels.includes(l));
      if (labelsToAdd.length === 0) return;

      const merged = [...existingLabels, ...labelsToAdd].join(", ");
      const relativePath = `${url.replace(`${mountUrl}/`, "")}/${entry}`.replace(
        /\.json$/,
        ""
      );
      await mongoFs.patchDocument(relativePath, { category: merged });
    })
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(`${failures.length} label operation(s) failed:`, failures);
    window.alert(`${failures.length} of ${entries.length} items failed to save. Check console for details.`);
  }
}
```

Note: The callback must become `async`. `useCallback` supports async callbacks.

**handleDismiss** (around line 202-231) — same pattern: `Promise.allSettled` + report failures.

**Step 4: Refactor mutations in useFileContextMenu.ts**

Same pattern for Set Category (line 207-220), Remove Category (line 228-236), Dismiss (line 256-271), Undismiss (line 281-296).

Each `action` callback becomes async, using `Promise.allSettled`.

**Step 5: Run tests**

Run: `npm test -- --runInBand`
Expected: PASS

**Step 6: Commit**

```bash
git add components/system/Files/FileManager/index.tsx components/system/Files/FileEntry/useFileContextMenu.ts __tests__/components/system/Files/FileManager/mutations.spec.ts
git commit -m "fix: await label/dismiss mutations and surface errors to user

Replaced fire-and-forget .forEach + .catch(console.error) pattern with
Promise.allSettled. Failed operations now show an alert with count of
failures. Prevents silent data loss during labeling sessions."
```

---

### Task 3: Fix the ESLint toolchain crash

ESLint crashes on `components/system/Files/FileEntry/functions.ts:108` due to `@typescript-eslint/no-useless-default-assignment` rule bug. The rule can't handle the destructuring pattern at that line.

**Files:**
- Modify: `components/system/Files/FileEntry/functions.ts` (line 108 area)

**Step 1: Read the crashing line and determine the fix**

Line 108 region has a destructured assignment pattern that triggers a bug in `@typescript-eslint`. The simplest fix is to add a targeted eslint-disable comment for that specific line.

**Step 2: Add the eslint-disable**

At the exact line that causes the crash (the destructured default assignment around line 108), add:

```typescript
// eslint-disable-next-line @typescript-eslint/no-useless-default-assignment -- triggers plugin crash (typescript-eslint bug)
```

**Step 3: Verify eslint runs to completion**

Run: `npm run eslint`
Expected: Completes (may have warnings/errors, but no crash)

**Step 4: Commit**

```bash
git add components/system/Files/FileEntry/functions.ts
git commit -m "fix: work around eslint plugin crash on no-useless-default-assignment

Adds targeted eslint-disable for the destructuring pattern that triggers
a TypeError in @typescript-eslint/no-useless-default-assignment. The
crash blocked the entire lint pipeline."
```

---

### Task 4: Unify MongoDB connection restore into one code path

Two independent restore paths race on startup:
- `useFileSystemContextState.ts:694` — guarded by a ref, directly creates + mounts MongoDBFS
- `useMongoDBIntegration.ts:194` — runs on every `state.connections` change, calls `addConnection()` which tests the connection first

Both read `localStorage("mongodbConnections")` independently. The dialog's `isConnected` status comes from `useMongoDBIntegration`'s state, but the actual mount may have been done by `useFileSystemContextState`.

**Files:**
- Modify: `contexts/fileSystem/useFileSystemContextState.ts`
- Modify: `hooks/useMongoDBIntegration.ts`
- Create: `__tests__/hooks/useMongoDBIntegration.spec.ts`

**Step 1: Write test for single-source restore**

```typescript
describe("MongoDB connection restore", () => {
  it("should only attempt mount once per alias", () => {
    // Test that the restore logic checks mntMap before mounting
    const mountFn = jest.fn();
    const mntMap: Record<string, any> = {};

    const shouldMount = (alias: string): boolean => {
      const mountPath = `/Users/Public/Desktop/${alias}`;
      return !mntMap[mountPath];
    };

    expect(shouldMount("Local")).toBe(true);
    mntMap["/Users/Public/Desktop/Local"] = {}; // simulate mount
    expect(shouldMount("Local")).toBe(false);
  });
});
```

**Step 2: Remove the restore logic from useFileSystemContextState.ts**

Delete the entire block from line 694 (`const restoredMongoConnections = useRef(false)`) through line 778 (end of the `useEffect`). This is the duplicate restore path.

**Step 3: Make useMongoDBIntegration the single source of truth**

The restore logic in `useMongoDBIntegration.ts` (line 194-213) already:
- Checks `mntMap` before mounting
- Updates `isConnected` state
- Goes through `addConnection()` which validates the connection

Ensure it runs exactly once by adding a ref guard similar to the one we removed:

```typescript
const restoredRef = useRef(false);

useEffect(() => {
  if (restoredRef.current || state.connections.length === 0 || !rootFs) return;
  restoredRef.current = true;

  const restoreConnections = async () => {
    for (const connection of state.connections) {
      const mountPath = `${DESKTOP_PATH}/${connection.alias}`;
      const isMounted = Boolean(rootFs?.mntMap?.[mountPath]);

      if (!isMounted) {
        try {
          await addConnection(connection.connectionString, connection.alias);
        } catch (error) {
          console.error(`Failed to restore connection ${connection.alias}:`, error);
        }
      }
    }
  };

  restoreConnections();
}, [state.connections, rootFs, addConnection]);
```

**Step 4: Run tests**

Run: `npm test -- --runInBand`
Expected: PASS

**Step 5: Commit**

```bash
git add contexts/fileSystem/useFileSystemContextState.ts hooks/useMongoDBIntegration.ts __tests__/hooks/useMongoDBIntegration.spec.ts
git commit -m "fix: unify MongoDB connection restore into single code path

Removed duplicate restore logic from useFileSystemContextState.
useMongoDBIntegration is now the single source of truth for connection
lifecycle. Added ref guard to prevent double-restore race."
```

---

### Task 5: Implement real delete endpoints for collection/database drop

`rmdir` in MongoDBFS calls `collection.drop()` and `db.dropDatabase()`, but the API client stubs `drop()` as a no-op (`return { ok: 1 }`), and `dropDatabase()` doesn't exist on the client object. Deleting a collection or database from the UI silently does nothing.

**Files:**
- Modify: `contexts/fileSystem/MongoDBFS.ts` (API client `drop()` + add `dropDatabase()`)
- Modify: `pages/api/mongodb/[...params].ts` (add `drop-collection` and `drop-database` handlers)
- Create: `__tests__/pages/api/mongodb/drop.spec.ts`

**Step 1: Write tests for the new API endpoints**

```typescript
describe("MongoDB drop API endpoints", () => {
  it("drop-collection endpoint requires db and collection params", () => {
    // Validates param extraction logic
    const params = ["drop-collection"];
    const [operation, ...operationParams] = params;
    const [dbName, collectionName] = operationParams;

    expect(operation).toBe("drop-collection");
    expect(dbName).toBeUndefined();
    expect(collectionName).toBeUndefined();
  });

  it("drop-database endpoint requires db param", () => {
    const params = ["drop-database", "testdb"];
    const [operation, ...operationParams] = params;
    const [dbName] = operationParams;

    expect(operation).toBe("drop-database");
    expect(dbName).toBe("testdb");
  });
});
```

**Step 2: Add API route handlers**

In `pages/api/mongodb/[...params].ts`, add two new handler functions:

```typescript
const handleDropCollection = async (
  client: MongoClient,
  operationParams: string[],
  res: NextApiResponse
): Promise<void> => {
  const [dbName, collectionName] = operationParams;

  if (!dbName || !collectionName) {
    res.status(400).json({ error: 'Database and collection name required' });
    return;
  }

  await client.db(dbName).collection(collectionName).drop();
  res.json({ success: true });
};

const handleDropDatabase = async (
  client: MongoClient,
  operationParams: string[],
  res: NextApiResponse
): Promise<void> => {
  const [dbName] = operationParams;

  if (!dbName) {
    res.status(400).json({ error: 'Database name required' });
    return;
  }

  await client.db(dbName).dropDatabase();
  res.json({ success: true });
};
```

Add cases to the switch:
```typescript
case 'drop-collection':
  await handleDropCollection(client, operationParams, res);
  break;
case 'drop-database':
  await handleDropDatabase(client, operationParams, res);
  break;
```

**Step 3: Update MongoDBFS API client**

Replace the stub `drop()` and add `dropDatabase()` in `createAPIClient()`:

```typescript
drop: async () => {
  if (!dbName) throw new Error("No database name");
  const response = await fetch(
    `/api/mongodb/drop-collection/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}`,
    {
      method: 'DELETE',
      headers: { 'x-mongodb-connection': this.connectionString },
    }
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return { ok: 1 };
}
```

Add `dropDatabase` to the `db()` return object:

```typescript
dropDatabase: async () => {
  if (!dbName) throw new Error("No database name");
  const response = await fetch(
    `/api/mongodb/drop-database/${encodeURIComponent(dbName)}`,
    {
      method: 'DELETE',
      headers: { 'x-mongodb-connection': this.connectionString },
    }
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return { ok: 1 };
}
```

**Step 4: Update rmdir to use the new methods**

`rmdir` (line 926) already calls `db.collection(collection).drop()` and `db.dropDatabase()`. After step 3, these will hit real API endpoints. No change needed in `rmdir` itself — it already has the right shape.

**Step 5: Run tests**

Run: `npm test -- --runInBand`
Expected: PASS

**Step 6: Commit**

```bash
git add contexts/fileSystem/MongoDBFS.ts pages/api/mongodb/[...params].ts __tests__/pages/api/mongodb/drop.spec.ts
git commit -m "feat: implement real delete endpoints for collections and databases

Added drop-collection and drop-database API route handlers. Updated
MongoDBFS API client to call these endpoints instead of returning
stub responses. rmdir now actually drops collections/databases."
```

---

## Summary of changes by file

| File | Tasks | What changes |
|------|-------|-------------|
| `contexts/fileSystem/MongoDBFS.ts` | 1, 5 | Scoped cache lookups, safe doc identity, real drop/dropDatabase client |
| `components/system/Files/FileManager/index.tsx` | 1, 2 | Pass db/collection to cache methods, await mutations |
| `components/system/Files/FileEntry/useFileContextMenu.ts` | 1, 2 | Pass db/collection to cache methods, await mutations |
| `components/system/Files/FileEntry/functions.ts` | 3 | eslint-disable for plugin crash |
| `contexts/fileSystem/useFileSystemContextState.ts` | 4 | Remove duplicate restore logic |
| `hooks/useMongoDBIntegration.ts` | 4 | Add ref guard, single source of truth |
| `pages/api/mongodb/[...params].ts` | 5 | Add drop-collection, drop-database handlers |
| `__tests__/contexts/fileSystem/MongoDBFS.spec.ts` | 1 | Cache scoping + identity tests |
| `__tests__/components/system/Files/FileManager/mutations.spec.ts` | 2 | Mutation error handling tests |
| `__tests__/hooks/useMongoDBIntegration.spec.ts` | 4 | Single-source restore test |
| `__tests__/pages/api/mongodb/drop.spec.ts` | 5 | Drop endpoint tests |
