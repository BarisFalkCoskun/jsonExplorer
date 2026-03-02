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
