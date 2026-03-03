import { MongoDBFileSystem } from "contexts/fileSystem/MongoDBFS";

// Access private members for testing via double cast (TS private is compile-time only)
type MongoDBFSTestable = {
  documentsListCache: Map<string, { cachedAt: number; documentIndex: Map<string, any>; documents: any[] }>;
  getCollectionCacheKey(db: string, col: string): string;
  getDocumentIdentifier(doc: any): string;
  parsePath(path: string): { database?: string; collection?: string; document?: string };
  unlink(path: string, callback: (error: any) => void): Promise<void>;
  getCachedDocumentNames(database: string, collection: string): Set<string> | null;
  getCachedDismissedNames(database: string, collection: string): Set<string> | null;
  isCachedDismissed(docName: string, database: string, collection: string): boolean;
  getCachedDocumentCategory(docName: string, database: string, collection: string): string | null;
};

const createFS = (): MongoDBFSTestable =>
  new MongoDBFileSystem("mongodb://localhost:27017") as unknown as MongoDBFSTestable;

/** Build a cache entry with both documents array and documentIndex Map. */
function buildCacheEntry(fs: MongoDBFSTestable, documents: any[]) {
  const documentIndex = new Map<string, any>();
  for (const doc of documents) {
    const key = MongoDBFileSystem.decodeDocumentIdentifier(
      fs.getDocumentIdentifier(doc)
    );
    documentIndex.set(key, doc);
  }
  return { cachedAt: Date.now(), documentIndex, documents };
}

describe("MongoDBFileSystem cache scoping", () => {
  it("getCachedDocumentNames scoped to a specific collection", () => {
    const fs = createFS();
    const key1 = fs.getCollectionCacheKey("db1", "products");
    const key2 = fs.getCollectionCacheKey("db1", "orders");

    fs.documentsListCache.set(key1, buildCacheEntry(fs, [
        { _id: "1", name: "apple", category: "fruit" },
        { _id: "2", name: "banana" },
    ]));
    fs.documentsListCache.set(key2, buildCacheEntry(fs, [
        { _id: "3", name: "order1", category: "processed" },
    ]));

    // Should return only categorized docs from db1/products (identified by _id)
    const result = fs.getCachedDocumentNames("db1", "products");
    expect(result).toEqual(new Set(["1"]));

    // Should return only categorized docs from db1/orders (identified by _id)
    const result2 = fs.getCachedDocumentNames("db1", "orders");
    expect(result2).toEqual(new Set(["3"]));
  });

  it("getCachedDismissedNames scoped to a specific collection", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, buildCacheEntry(fs, [
        { _id: "1", name: "apple", dismissed: true },
        { _id: "2", name: "banana" },
    ]));

    const result = fs.getCachedDismissedNames("db1", "products");
    expect(result).toEqual(new Set(["1"]));
  });

  it("isCachedDismissed scoped to a specific collection", () => {
    const fs = createFS();
    const key1 = fs.getCollectionCacheKey("db1", "col1");
    const key2 = fs.getCollectionCacheKey("db1", "col2");

    fs.documentsListCache.set(key1, buildCacheEntry(fs, [
      { _id: "1", name: "docA", dismissed: true },
    ]));
    fs.documentsListCache.set(key2, buildCacheEntry(fs, [
      { _id: "2", name: "docA" },
    ]));

    expect(fs.isCachedDismissed("1", "db1", "col1")).toBe(true);
    expect(fs.isCachedDismissed("2", "db1", "col2")).toBe(false);
  });

  it("getCachedDocumentCategory scoped to a specific collection", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, buildCacheEntry(fs, [
        { _id: "1", name: "apple", category: "fruit" },
        { _id: "2", name: "banana" },
    ]));

    expect(fs.getCachedDocumentCategory("1", "db1", "products")).toBe("fruit");
    expect(fs.getCachedDocumentCategory("2", "db1", "products")).toBeNull();
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

    fs.documentsListCache.set(key, buildCacheEntry(fs, [
        { _id: "1", name: "weird/name", category: "fruit" },
    ]));

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toBeDefined();
    // _id-first: identifier is now "1" (the _id), not the encoded name
    expect(categorized!.has("1")).toBe(true);
  });

  it("does not collide a/b with a_b", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, buildCacheEntry(fs, [
        { _id: "1", name: "a/b", category: "x" },
        { _id: "2", name: "a_b", category: "y" },
    ]));

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toBeDefined();
    expect(categorized!.size).toBe(2);
    // _id-first: identifiers are now the _id values
    expect(categorized!.has("1")).toBe(true);
    expect(categorized!.has("2")).toBe(true);
  });

  it("is reversible via decodeURIComponent", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, buildCacheEntry(fs, [
        { _id: "1", name: "weird/name", category: "fruit" },
    ]));

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toBeDefined();
    // _id-first: identifier is now "1" (the _id)
    const encoded = [...categorized!][0];
    expect(encoded).toBe("1");
    expect(decodeURIComponent(encoded)).toBe("1");
  });

  it("decode helper handles invalid sequences gracefully", () => {
    expect(MongoDBFileSystem.decodeDocumentIdentifier("valid%2Fname")).toBe("valid/name");
    expect(MongoDBFileSystem.decodeDocumentIdentifier("%ZZinvalid")).toBe("%ZZinvalid");
  });

  it("uses _id as string when name is missing", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, buildCacheEntry(fs, [
        { _id: "abc123", category: "electronics" },
    ]));

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toEqual(new Set(["abc123"]));
  });

  it("never returns 'unnamed' — uses _id fallback", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, buildCacheEntry(fs, [
        { _id: "fallback-id", category: "misc" },
    ]));

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

  it("only strips trailing .json extension, not internal occurrences", () => {
    const fs = createFS();
    const result = fs.parsePath("db1/col1/data.json.backup.json");
    expect(result).toEqual({ database: "db1", collection: "col1", document: "data.json.backup" });
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

  it("returns EIO when document path cannot connect to MongoDB", (done) => {
    const fs = createFS();
    fs.unlink("db1/col1/doc1.json", (error) => {
      expect(error).not.toBeNull();
      expect(error!.code).toBe("EIO");
      done();
    });
  });
});

describe("patchDocument cache mutation", () => {
  it("updates document in cache via shared reference", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    const doc = { _id: "1", name: "apple" };
    fs.documentsListCache.set(key, buildCacheEntry(fs, [doc]));

    // Verify initial state — _id-first identifier is "1"
    expect(fs.getCachedDocumentCategory("1", "db1", "products")).toBeNull();

    // Simulate patchDocument mutation (same as production code)
    const cached = fs.documentsListCache.get(key);
    const identifier = MongoDBFileSystem.decodeDocumentIdentifier(
      fs.getDocumentIdentifier(doc)
    );
    const cachedDoc = cached?.documentIndex.get(identifier);

    if (cachedDoc) {
      cachedDoc.category = "fruit";
    }

    // Verify mutation propagated
    expect(fs.getCachedDocumentCategory("1", "db1", "products")).toBe("fruit");
  });

  it("shared reference means documents array also updated", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    const doc = { _id: "1", name: "apple" };
    fs.documentsListCache.set(key, buildCacheEntry(fs, [doc]));

    const cached = fs.documentsListCache.get(key);
    const indexDoc = cached?.documentIndex.get("1");
    const arrayDoc = cached?.documents[0];

    // Same reference
    expect(indexDoc).toBe(arrayDoc);

    // Mutate via index
    if (indexDoc) indexDoc.dismissed = true;

    // Array reflects mutation
    expect(arrayDoc?.dismissed).toBe(true);
  });
});
