import { MongoDBFileSystem } from "contexts/fileSystem/MongoDBFS";

// We need to access private members for testing cache behavior.
// Use type assertion to bypass TS access modifiers.
type MongoDBFSTestable = MongoDBFileSystem & {
  documentsListCache: Map<string, { cachedAt: number; documents: any[] }>;
  getCollectionCacheKey(db: string, col: string): string;
  parsePath(path: string): { database?: string; collection?: string; document?: string };
  unlink(path: string, callback: (error: any) => void): Promise<void>;
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
  it("percent-encodes / in document names", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, {
      cachedAt: Date.now(),
      documents: [
        { _id: "1", name: "weird/name", category: "fruit" },
      ],
    });

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toBeDefined();
    expect(categorized!.has("weird%2Fname")).toBe(true);
  });

  it("does not collide a/b with a_b", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, {
      cachedAt: Date.now(),
      documents: [
        { _id: "1", name: "a/b", category: "x" },
        { _id: "2", name: "a_b", category: "y" },
      ],
    });

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toBeDefined();
    expect(categorized!.size).toBe(2);
    expect(categorized!.has("a%2Fb")).toBe(true);
    expect(categorized!.has("a_b")).toBe(true);
  });

  it("is reversible via decodeURIComponent", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, {
      cachedAt: Date.now(),
      documents: [
        { _id: "1", name: "weird/name", category: "fruit" },
      ],
    });

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toBeDefined();
    const encoded = [...categorized!][0];
    expect(decodeURIComponent(encoded)).toBe("weird/name");
  });

  it("decode helper handles invalid sequences gracefully", () => {
    expect(MongoDBFileSystem.decodeDocumentIdentifier("valid%2Fname")).toBe("valid/name");
    expect(MongoDBFileSystem.decodeDocumentIdentifier("%ZZinvalid")).toBe("%ZZinvalid");
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

describe("parsePath decoding", () => {
  it("decodes percent-encoded slash in document name", () => {
    const fs = createFS();
    const result = fs.parsePath("db1/col1/a%2Fb.json");
    expect(result).toEqual({ database: "db1", collection: "col1", document: "a/b" });
  });

  it("leaves normal names unchanged", () => {
    const fs = createFS();
    const result = fs.parsePath("db1/col1/laptop.json");
    expect(result).toEqual({ database: "db1", collection: "col1", document: "laptop" });
  });

  it("decodes percent-encoded space in document name", () => {
    const fs = createFS();
    const result = fs.parsePath("db1/col1/hello%20world.json");
    expect(result).toEqual({ database: "db1", collection: "col1", document: "hello world" });
  });

  it("round-trips a raw percent sign correctly", () => {
    const fs = createFS();
    // raw "%ZZ" → encoded "%25ZZ" → decoded "%ZZ"
    const result = fs.parsePath("db1/col1/%25ZZ.json");
    expect(result).toEqual({ database: "db1", collection: "col1", document: "%ZZ" });
  });

  it("returns undefined document when path has no document segment", () => {
    const fs = createFS();
    const result = fs.parsePath("db1/col1");
    expect(result).toEqual({ database: "db1", collection: "col1", document: undefined });
  });
});

describe("unlink error codes", () => {
  it("returns EISDIR for collection-level paths", (done) => {
    const fs = createFS();
    fs.unlink("db1/col1", (error) => {
      expect(error).not.toBeNull();
      expect(error!.code).toBe("EISDIR");
      done();
    });
  });

  it("returns EISDIR for database-level paths", (done) => {
    const fs = createFS();
    fs.unlink("db1", (error) => {
      expect(error).not.toBeNull();
      expect(error!.code).toBe("EISDIR");
      done();
    });
  });

  it("returns EINVAL for empty paths", (done) => {
    const fs = createFS();
    fs.unlink("", (error) => {
      expect(error).not.toBeNull();
      expect(error!.code).toBe("EINVAL");
      done();
    });
  });
});
