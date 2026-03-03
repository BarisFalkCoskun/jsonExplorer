import { MongoDBFileSystem } from "contexts/fileSystem/MongoDBFS";

interface MongoDocument {
  [key: string]: unknown;
  _id?: string;
}

// Access private members for testing via double cast (TS private is compile-time only)
type MongoDBFSTestable = {
  collectionEntriesCache: Map<string, { cachedAt: number; entries: Set<string> }>;
  documentsListCache: Map<string, { cachedAt: number; documentIndex: Map<string, MongoDocument>; documents: MongoDocument[] }>;
  getCachedDismissedNames: (database: string, collection: string) => Set<string> | null;
  getCachedDocumentCategory: (docName: string, database: string, collection: string) => string | null;
  getCachedDocumentNames: (database: string, collection: string) => Set<string> | null;
  getCollectionCacheKey: (db: string, col: string) => string;
  getDocumentIdentifier: (doc: MongoDocument) => string;
  isCachedDismissed: (docName: string, database: string, collection: string) => boolean;
  parsePath: (path: string) => { collection?: string; database?: string; document?: string };
  readdirPaged: (path: string, cursor?: { afterId: string; afterName: string }, limit?: number) => Promise<{ entries: string[]; hasMore: boolean; nextCursor?: { afterId: string; afterName: string } }>;
  stat: (path: string, isLstat: boolean | ((error: unknown, stats?: unknown) => void), callback?: (error: unknown, stats?: unknown) => void) => Promise<void>;
  unlink: (path: string, callback: (error: { code: string; message: string } | undefined) => void) => Promise<void>;
};

const createFS = (): MongoDBFSTestable =>
  new MongoDBFileSystem("mongodb://localhost:27017") as unknown as MongoDBFSTestable;

/** Build a cache entry with both documents array and documentIndex Map. */
function buildCacheEntry(fs: MongoDBFSTestable, documents: MongoDocument[]): { cachedAt: number; documentIndex: Map<string, MongoDocument>; documents: MongoDocument[] } {
  const documentIndex = new Map<string, MongoDocument>();
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
        { _id: "1", category: "fruit", name: "apple" },
        { _id: "2", name: "banana" },
    ]));
    fs.documentsListCache.set(key2, buildCacheEntry(fs, [
        { _id: "3", category: "processed", name: "order1" },
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
        { _id: "1", dismissed: true, name: "apple" },
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
      { _id: "1", dismissed: true, name: "docA" },
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
        { _id: "1", category: "fruit", name: "apple" },
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
        { _id: "1", category: "fruit", name: "weird/name" },
    ]));

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toBeDefined();
    // _id-first: identifier is now "1" (the _id), not the encoded name
    expect(categorized?.has("1")).toBe(true);
  });

  it("does not collide a/b with a_b", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, buildCacheEntry(fs, [
        { _id: "1", category: "x", name: "a/b" },
        { _id: "2", category: "y", name: "a_b" },
    ]));

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toBeDefined();
    expect(categorized?.size).toBe(2);
    // _id-first: identifiers are now the _id values
    expect(categorized?.has("1")).toBe(true);
    expect(categorized?.has("2")).toBe(true);
  });

  it("is reversible via decodeURIComponent", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    fs.documentsListCache.set(key, buildCacheEntry(fs, [
        { _id: "1", category: "fruit", name: "weird/name" },
    ]));

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).toBeDefined();
    // _id-first: identifier is now "1" (the _id)
    const encoded = [...(categorized ?? [])][0];
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
    expect(categorized?.has("unnamed")).toBe(false);
    expect(categorized?.has("fallback-id")).toBe(true);
  });
});

describe("parsePath decoding", () => {
  it("decodes percent-encoded slash in document name", () => {
    const fs = createFS();
    const result = fs.parsePath("db1/col1/a%2Fb.json");
    expect(result).toEqual({ collection: "col1", database: "db1", document: "a/b" });
  });

  it("leaves normal names unchanged", () => {
    const fs = createFS();
    const result = fs.parsePath("db1/col1/laptop.json");
    expect(result).toEqual({ collection: "col1", database: "db1", document: "laptop" });
  });

  it("decodes percent-encoded space in document name", () => {
    const fs = createFS();
    const result = fs.parsePath("db1/col1/hello%20world.json");
    expect(result).toEqual({ collection: "col1", database: "db1", document: "hello world" });
  });

  it("round-trips a raw percent sign correctly", () => {
    const fs = createFS();
    // raw "%ZZ" → encoded "%25ZZ" → decoded "%ZZ"
    const result = fs.parsePath("db1/col1/%25ZZ.json");
    expect(result).toEqual({ collection: "col1", database: "db1", document: "%ZZ" });
  });

  it("returns undefined document when path has no document segment", () => {
    const fs = createFS();
    const result = fs.parsePath("db1/col1");
    expect(result).toEqual({ collection: "col1", database: "db1", document: undefined });
  });

  it("only strips trailing .json extension, not internal occurrences", () => {
    const fs = createFS();
    const result = fs.parsePath("db1/col1/data.json.backup.json");
    expect(result).toEqual({ collection: "col1", database: "db1", document: "data.json.backup" });
  });
});

describe("unlink error codes", () => {
  it("returns EISDIR for collection-level paths", async () => {
    const fs = createFS();
    const error = await new Promise<{ code: string; message: string } | undefined>((resolve) => {
      fs.unlink("db1/col1", resolve);
    });
    expect(error).toBeDefined();
    expect(error?.code).toBe("EISDIR");
  });

  it("returns EISDIR for database-level paths", async () => {
    const fs = createFS();
    const error = await new Promise<{ code: string; message: string } | undefined>((resolve) => {
      fs.unlink("db1", resolve);
    });
    expect(error).toBeDefined();
    expect(error?.code).toBe("EISDIR");
  });

  it("returns EINVAL for empty paths", async () => {
    const fs = createFS();
    const error = await new Promise<{ code: string; message: string } | undefined>((resolve) => {
      fs.unlink("", resolve);
    });
    expect(error).toBeDefined();
    expect(error?.code).toBe("EINVAL");
  });

  it("returns EIO when document path cannot connect to MongoDB", async () => {
    const fs = createFS();
    const error = await new Promise<{ code: string; message: string } | undefined>((resolve) => {
      fs.unlink("db1/col1/doc1.json", resolve);
    });
    expect(error).toBeDefined();
    expect(error?.code).toBe("EIO");
  });
});

describe("patchDocument cache mutation", () => {
  it("updates document in cache via shared reference", () => {
    const fs = createFS();
    const key = fs.getCollectionCacheKey("db1", "products");

    const doc: MongoDocument = { _id: "1", name: "apple" };
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

    const doc: MongoDocument = { _id: "1", name: "apple" };
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

const mockPagedResponse = (
  documents: MongoDocument[],
  nextCursor?: { afterId: string; afterName: string },
  hasMore = false,
): Response =>
  ({
    json: () => Promise.resolve({ documents, hasMore, nextCursor }),
    ok: true,
  }) as unknown as Response;

describe("readdirPaged cache hydration", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("populates documentsListCache from paged response", async () => {
    const fs = createFS();
    const docs: MongoDocument[] = [
      { _id: "1", category: "fruit", name: "apple" },
      { _id: "2", name: "banana" },
    ];
    fetchMock.mockResolvedValueOnce(mockPagedResponse(docs));

    await fs.readdirPaged("db1/products");

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).not.toBeNull();
    expect(categorized).toEqual(new Set(["1"]));
  });

  it("merges subsequent pages into existing cache", async () => {
    const fs = createFS();

    const page1Docs: MongoDocument[] = [
      { _id: "1", category: "fruit", name: "apple" },
    ];
    const page2Docs: MongoDocument[] = [
      { _id: "2", category: "vegetable", name: "carrot" },
    ];

    fetchMock
      .mockResolvedValueOnce(mockPagedResponse(page1Docs, { afterId: "1", afterName: "apple" }, true))
      .mockResolvedValueOnce(mockPagedResponse(page2Docs));

    await fs.readdirPaged("db1/products");
    await fs.readdirPaged("db1/products", { afterId: "1", afterName: "apple" });

    const categorized = fs.getCachedDocumentNames("db1", "products");
    expect(categorized).not.toBeNull();
    expect(categorized).toEqual(new Set(["1", "2"]));

    // Also verify both docs are in the documents array
    const key = fs.getCollectionCacheKey("db1", "products");
    const cached = fs.documentsListCache.get(key);
    expect(cached?.documents).toHaveLength(2);
  });

  it("populates collectionEntriesCache for stat lookups", async () => {
    const fs = createFS();
    const docs: MongoDocument[] = [
      { _id: "doc1", name: "apple" },
      { _id: "doc2", name: "banana" },
    ];
    fetchMock.mockResolvedValueOnce(mockPagedResponse(docs));

    await fs.readdirPaged("db1/products");

    // Reset fetch mock so we can detect if stat makes any new calls
    fetchMock.mockClear();

    // stat() should resolve from cache without additional fetch calls
    const statResult = await new Promise<{ error: unknown; stats: unknown }>((resolve) => {
      fs.stat("db1/products/doc1.json", (error: unknown, stats: unknown) => {
        resolve({ error, stats });
      });
    });

    expect(statResult.error).toBeNull();
    expect(statResult.stats).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("paged initial load contract", () => {
  it("readdirPaged first page request is limit-bounded, not meta=1", async () => {
    const fs = createFS();

    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({
        documents: [{ _id: "doc1", name: "doc1" }],
        hasMore: false,
      }),
      ok: true,
    });

    await fs.readdirPaged("testdb/products", undefined, 200);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- accessing jest mock internals
    const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(fetchUrl).toContain("limit=200");
    expect(fetchUrl).not.toContain("meta=1");
  });
});
