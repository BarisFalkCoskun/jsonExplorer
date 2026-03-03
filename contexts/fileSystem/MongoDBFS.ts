// MongoDB client imports are handled dynamically to avoid SSR issues
// Note: MongoDB client only used in API routes, not in browser code
// eslint-disable-next-line import/no-unresolved
import { type FileSystem } from "browserfs/dist/node/core/file_system";
// eslint-disable-next-line import/no-unresolved
import { type ApiError } from "browserfs/dist/node/core/api_error";
import type Stats from "browserfs/dist/node/core/node_fs_stats";

interface MongoDocument {
  [key: string]: unknown;
  _id?: string;
  dismissed?: boolean;
  imageCount?: number;
  images?: string[];
  name?: string;
  oldImages?: string[];
  thumbnail?: string;
}

interface MongoFSEntry {
  data?: MongoDocument;
  name: string;
  path: string;
  type: "collection" | "database" | "document";
}

const UNKNOWN_DOCUMENT_SIZE = -1;
const COLLECTION_CACHE_TTL_MS = 5000;
const DOCUMENTS_CACHE_TTL_MS = 30_000;

type CachedCollectionEntries = {
  cachedAt: number;
  entries: Set<string>;
};

type CachedDocumentsList = {
  cachedAt: number;
  documentIndex: Map<string, MongoDocument>;
  documents: MongoDocument[];
};

interface MongoCollection {
  deleteOne: (filter: Record<string, unknown>) => Promise<{ deletedCount: number }>;
  drop: () => Promise<{ ok: number }>;
  find: () => { toArray: () => Promise<MongoDocument[]> };
  findOne: (filter: Record<string, unknown>) => Promise<MongoDocument | undefined>;
  getImages: (documentId: string) => Promise<string[]>;
  insertOne: (doc: Record<string, unknown>) => Promise<{ acknowledged: boolean }>;
  replaceOne: (filter: Record<string, unknown>, doc: Record<string, unknown>, options: Record<string, unknown>) => Promise<{ acknowledged: boolean }>;
}

interface MongoDb {
  admin: () => { listDatabases: () => Promise<{ databases: { name: string }[] }> };
  collection: (name: string) => MongoCollection;
  dropDatabase: () => Promise<{ ok: number }>;
  listCollections: () => Promise<{ name: string }[]> | { toArray: () => Promise<{ name: string }[]> };
}

interface MongoAPIClient {
  close: () => Promise<void>;
  connect: () => Promise<void>;
  db: (dbName?: string) => MongoDb;
}

export class MongoDBFileSystem implements FileSystem {
  private client: MongoAPIClient | undefined;

  private connected = false;

  private readonly connectionString: string;

  private readonly collectionEntriesCache = new Map<string, CachedCollectionEntries>();

  private readonly documentsListCache = new Map<string, CachedDocumentsList>();

  public constructor(connectionString = "mongodb://localhost:27017") {
    this.connectionString = connectionString;
  }

  public getName(): string {
    return "MongoDBFS";
  }

  public isReadOnly(): boolean {
    return false;
  }

  public supportsProps(): boolean {
    return true;
  }

  public supportsLinks(): boolean {
    return false;
  }

  public supportsSynch(): boolean {
    return false;
  }

  private connect(): void {
    if (this.connected && this.client) return;

    // Always use API proxy in this implementation
    this.client = this.createAPIClient();
    this.connected = true;
  }

  private static extractFilterId(filter: Record<string, unknown>): string {
    const rawId = filter._id ?? filter.name ?? "";
    return typeof rawId === "string" ? rawId : JSON.stringify(rawId);
  }

  private static readonly FETCH_TIMEOUT_MS = 30_000;

  private static async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      MongoDBFileSystem.FETCH_TIMEOUT_MS
    );

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`Request timed out after ${MongoDBFileSystem.FETCH_TIMEOUT_MS}ms: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async makeDeleteOneRequest(
    dbName: string,
    collectionName: string,
    filter: Record<string, unknown>
  ): Promise<{ deletedCount: number }> {
    const documentId = MongoDBFileSystem.extractFilterId(filter);
    const response = await MongoDBFileSystem.fetchWithTimeout(`/api/mongodb/document/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/${encodeURIComponent(documentId)}`, {
      headers: {
        'x-mongodb-connection': this.connectionString,
      },
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const result = await response.json() as { deletedCount: number };
    return { deletedCount: result.deletedCount };
  }

  private async makeFindOneRequest(
    dbName: string,
    collectionName: string,
    filter: Record<string, unknown>
  ): Promise<MongoDocument | undefined> {
    const documentId = MongoDBFileSystem.extractFilterId(filter);
    const response = await MongoDBFileSystem.fetchWithTimeout(`/api/mongodb/document/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/${encodeURIComponent(documentId)}`, {
      headers: {
        'x-mongodb-connection': this.connectionString,
      },
    });
    if (!response.ok) {
      return undefined;
    }
    return await response.json() as MongoDocument;
  }

  private createAPIClient(): MongoAPIClient {
    // API client that proxies requests to Next.js API route
    return {
      close: () => Promise.resolve(),
      connect: () => Promise.resolve(),
      db: (dbName?: string): MongoDb => ({
        admin: () => ({
          listDatabases: async () => {
            const response = await MongoDBFileSystem.fetchWithTimeout('/api/mongodb/databases', {
              headers: {
                'x-mongodb-connection': this.connectionString,
              },
            });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const databases = await response.json() as string[];
            return { databases: databases.map((dbItemName: string) => ({ name: dbItemName })) };
          }
        }),
        collection: (collectionName: string): MongoCollection => ({
          deleteOne: (filter: Record<string, unknown>) => {
            if (!dbName) throw new Error("No database name");
            return this.makeDeleteOneRequest(dbName, collectionName, filter);
          },
          drop: async () => {
            if (!dbName) throw new Error("No database name");
            const response = await MongoDBFileSystem.fetchWithTimeout(
              `/api/mongodb/drop-collection/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}`,
              {
                headers: { 'x-mongodb-connection': this.connectionString },
                method: 'DELETE',
              }
            );
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return { ok: 1 };
          },
          find: () => ({
            toArray: async () => {
              if (!dbName) return [];
              const response = await MongoDBFileSystem.fetchWithTimeout(`/api/mongodb/documents/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}`, {
                headers: {
                  'x-mongodb-connection': this.connectionString,
                },
              });
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              return await response.json() as MongoDocument[];
            }
          }),
          findOne: (filter: Record<string, unknown>): Promise<MongoDocument | undefined> => {
            if (!dbName) return Promise.resolve(undefined); // eslint-disable-line unicorn/no-useless-undefined
            return this.makeFindOneRequest(dbName, collectionName, filter);
          },
          getImages: async (documentId: string) => {
            if (!dbName) return [];
            const response = await MongoDBFileSystem.fetchWithTimeout(`/api/mongodb/images/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/${encodeURIComponent(documentId)}`, {
              headers: {
                'x-mongodb-connection': this.connectionString,
              },
            });
            if (!response.ok) {
              return [];
            }
            const result = await response.json() as { images?: string[] };
            return result.images ?? [];
          },
          insertOne: (doc: Record<string, unknown>) =>
            // For inserts, we'll use the upsert functionality of replaceOne
            this.replaceDocument(dbName ?? "", collectionName, doc),
          replaceOne: (_filter: Record<string, unknown>, doc: Record<string, unknown>, _options: Record<string, unknown>) =>
            this.replaceDocument(dbName ?? "", collectionName, doc)
        }),
        dropDatabase: async () => {
          if (!dbName) throw new Error("No database name");
          const response = await MongoDBFileSystem.fetchWithTimeout(
            `/api/mongodb/drop-database/${encodeURIComponent(dbName)}`,
            {
              headers: { 'x-mongodb-connection': this.connectionString },
              method: 'DELETE',
            }
          );
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return { ok: 1 };
        },
        listCollections: async () => {
          if (!dbName) return [];
          const response = await MongoDBFileSystem.fetchWithTimeout(`/api/mongodb/collections/${encodeURIComponent(dbName)}`, {
            headers: {
              'x-mongodb-connection': this.connectionString,
            },
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const collections = await response.json() as string[];
          return collections.map((colName: string) => ({ name: colName }));
        }
      })
    };
  }

  private async replaceDocument(dbName: string, collectionName: string, doc: Record<string, unknown>): Promise<{ acknowledged: boolean }> {
    const rawDocId = doc._id ?? doc.name ?? Date.now().toString();
    const documentId = typeof rawDocId === "string" ? rawDocId : JSON.stringify(rawDocId);
    const response = await MongoDBFileSystem.fetchWithTimeout(`/api/mongodb/document/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}/${encodeURIComponent(documentId)}`, {
      body: JSON.stringify(doc),
      headers: {
        'Content-Type': 'application/json',
        'x-mongodb-connection': this.connectionString,
      },
      method: 'PUT',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return { acknowledged: true };
  }

  private createMockClient(): MongoAPIClient {
    // Mock MongoDB client for demonstration in browser
    const mockData: Record<string, Record<string, MongoDocument[]>> = {
      "blogDB": {
        "comments": [
          { _id: "comment1", author: "user123", name: "comment_001", postId: "post1", text: "Great post!" },
          { _id: "comment2", author: "user456", name: "comment_002", postId: "post1", text: "Very helpful, thanks!" }
        ],
        "posts": [
          { _id: "post1", author: "john_doe", content: "MongoDB is a NoSQL database...", name: "first_post", title: "Getting Started with MongoDB" },
          { _id: "post2", author: "jane_smith", content: "Learn advanced querying techniques...", name: "second_post", title: "Advanced MongoDB Queries" }
        ]
      },
      "sampleDB": {
        "orders": [
          { _id: "order1", name: "order_001", productId: "prod1", quantity: 1, total: 999.99, userId: "1" },
          { _id: "order2", name: "order_002", productId: "prod2", quantity: 2, total: 39.98, userId: "2" }
        ],
        "products": [
          { _id: "prod1", category: "electronics", name: "laptop", price: 999.99 },
          { _id: "prod2", category: "books", name: "book", price: 19.99 },
          { _id: "prod3", category: "electronics", name: "headphones", price: 79.99 }
        ],
        "users": [
          { _id: "1", age: 30, email: "john@example.com", name: "john_doe" },
          { _id: "2", age: 25, email: "jane@example.com", name: "jane_smith" },
          { _id: "3", email: "admin@example.com", name: "admin_user", role: "admin" }
        ]
      }
    };

    return {
      close: () => Promise.resolve(),
      connect: () => Promise.resolve(),
      db: (dbName?: string): MongoDb => ({
        admin: () => ({
          listDatabases: () => Promise.resolve({
            databases: Object.keys(mockData).map(mockDbName => ({ name: mockDbName }))
          })
        }),
        collection: (collectionName: string): MongoCollection => ({
          deleteOne: (_filter: Record<string, unknown>) => Promise.resolve({ acknowledged: true, deletedCount: 1 }),
          drop: () => Promise.resolve({ ok: 1 }),
          find: () => ({
            toArray: () => {
              if (!dbName || !mockData[dbName]?.[collectionName]) return Promise.resolve([]);
              return Promise.resolve(mockData[dbName][collectionName]);
            }
          }),
          findOne: (_filter: Record<string, unknown>): Promise<MongoDocument | undefined> => Promise.resolve(undefined), // eslint-disable-line unicorn/no-useless-undefined
          getImages: (_documentId: string) => Promise.resolve([] as string[]),
          insertOne: (doc: Record<string, unknown>) => {
            const mockId = doc._id ?? Date.now().toString();
            return Promise.resolve({ acknowledged: true, insertedId: typeof mockId === "string" ? mockId : JSON.stringify(mockId) });
          },
          replaceOne: (_filter: Record<string, unknown>, _doc: Record<string, unknown>, _options: Record<string, unknown>) => Promise.resolve({ acknowledged: true, modifiedCount: 1 })
        }),
        dropDatabase: () => Promise.resolve({ ok: 1 }),
        listCollections: () => {
          if (!dbName || !mockData[dbName]) return Promise.resolve([]);
          return Promise.resolve(Object.keys(mockData[dbName]).map(mockColName => ({ name: mockColName })));
        }
      })
    };
  }

  private async getDatabases(): Promise<string[]> {
    this.connect();
    if (!this.client) throw new Error("No MongoDB connection");

    const adminDb = this.client.db().admin();
    const { databases } = await adminDb.listDatabases();
    return databases.map((dbItem: { name: string }) => dbItem.name);
  }

  private async getCollections(dbName: string): Promise<string[]> {
    this.connect();
    if (!this.client) throw new Error("No MongoDB connection");

    const database = this.client.db(dbName);

    // API-backed listCollections may return either an array-like result
    // or a cursor-like object with toArray(), depending on client impl.
    const listCollectionsResult = await database.listCollections();
    const collections = Array.isArray(listCollectionsResult)
      ? listCollectionsResult
      : await (listCollectionsResult as { toArray: () => Promise<{ name: string }[]> }).toArray();

    return collections.map((col: { name: string }) => col.name);
  }

  private getCachedDocumentsList(
    database: string,
    collection: string
  ): MongoDocument[] | undefined {
    const key = this.getCollectionCacheKey(database, collection);
    const cached = this.documentsListCache.get(key);

    if (!cached) return undefined;

    if (Date.now() - cached.cachedAt > DOCUMENTS_CACHE_TTL_MS) {
      this.documentsListCache.delete(key);
      return undefined;
    }

    return cached.documents;
  }

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

  private async getDocuments(
    dbName: string,
    collectionName: string
  ): Promise<MongoDocument[]> {
    const cached = this.getCachedDocumentsList(dbName, collectionName);

    if (cached) return cached;

    const url = `/api/mongodb/documents/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}?meta=1`;

    const response = await MongoDBFileSystem.fetchWithTimeout(url, {
      headers: {
        "x-mongodb-connection": this.connectionString,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const documents = (await response.json()) as MongoDocument[];

    this.setCachedDocumentsList(dbName, collectionName, documents);

    return documents;
  }

  public async getDocumentImages(imagePath: string): Promise<string[]> {
    const { collection, database, document: documentName } = this.parsePath(imagePath);

    if (!database || !collection || !documentName) {
      return [];
    }

    try {
      this.connect();
      if (!this.client) return [];

      const db = this.client.db(database);
      const col = db.collection(collection);
      const images = await col.getImages(documentName);
      return images;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`Failed to get images for ${imagePath}:`, error);
      return [];
    }
  }

  public getDocumentThumbnail(
    thumbnailPath: string
  ): { imageCount: number; thumbnail: string | undefined } {
    const { collection, database, document: documentName } = this.parsePath(thumbnailPath);

    if (!database || !collection || !documentName) {
      return { imageCount: 0, thumbnail: undefined };
    }

    const key = this.getCollectionCacheKey(database, collection);
    const cached = this.documentsListCache.get(key);

    if (!cached) {
      return { imageCount: 0, thumbnail: undefined };
    }

    const doc = cached.documentIndex.get(documentName);

    if (!doc) {
      return { imageCount: 0, thumbnail: undefined };
    }

    return {
      imageCount: (doc.imageCount as number) ?? 0,
      thumbnail: (doc.thumbnail as string) ?? undefined,
    };
  }

  /**
   * Returns a Set of document names that have a `category` field,
   * scoped to a specific database/collection cache entry.
   * Does NOT check TTL — the toggle should use whatever was loaded this session.
   */
  public getCachedDocumentNames(database: string, collection: string): Set<string> | null {
    const key = this.getCollectionCacheKey(database, collection);
    const cached = this.documentsListCache.get(key);
    if (!cached) return null; // eslint-disable-line unicorn/no-null

    const categorized = new Set<string>();
    for (const doc of cached.documents) {
      if ("category" in doc) {
        categorized.add(this.getDocumentIdentifier(doc));
      }
    }
    return categorized;
  }

  /**
   * Returns a Set of document names that have a `dismissed` field,
   * scoped to a specific database/collection cache entry.
   */
  public getCachedDismissedNames(database: string, collection: string): Set<string> | null {
    const key = this.getCollectionCacheKey(database, collection);
    const cached = this.documentsListCache.get(key);
    if (!cached) return null; // eslint-disable-line unicorn/no-null

    const dismissed = new Set<string>();
    for (const doc of cached.documents) {
      if (doc.dismissed) {
        dismissed.add(this.getDocumentIdentifier(doc));
      }
    }
    return dismissed;
  }

  // docName is the encoded filesystem entry name (from getDocumentIdentifier)
  public isCachedDismissed(docName: string, database: string, collection: string): boolean {
    const key = this.getCollectionCacheKey(database, collection);
    const cached = this.documentsListCache.get(key);
    if (!cached) return false;

    const doc = cached.documentIndex.get(
      MongoDBFileSystem.decodeDocumentIdentifier(docName)
    );
    return !!doc?.dismissed;
  }

  // docName is the encoded filesystem entry name (from getDocumentIdentifier)
  public getCachedDocumentCategory(docName: string, database: string, collection: string): string | null {
    const key = this.getCollectionCacheKey(database, collection);
    const cached = this.documentsListCache.get(key);
    if (!cached) return null; // eslint-disable-line unicorn/no-null

    const doc = cached.documentIndex.get(
      MongoDBFileSystem.decodeDocumentIdentifier(docName)
    );
    return doc && "category" in doc ? (doc.category as string) : null; // eslint-disable-line unicorn/no-null
  }

  public async patchDocument(
    patchPath: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const { collection, database, document: documentName } = this.parsePath(patchPath);

    if (!database || !collection || !documentName) {
      throw new Error("Invalid document path");
    }

    const response = await MongoDBFileSystem.fetchWithTimeout(
      `/api/mongodb/document/${encodeURIComponent(database)}/${encodeURIComponent(collection)}/${encodeURIComponent(documentName)}`,
      {
        body: JSON.stringify(updates),
        headers: {
          "Content-Type": "application/json",
          "x-mongodb-connection": this.connectionString,
        },
        method: "PATCH",
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json() as { matchedCount: number; modifiedCount: number };

    // Only mutate cache if server confirmed the document was found
    if (result.matchedCount === 0) return;

    // Update the in-memory documents cache in-place so that
    // getCachedDocumentCategory returns the new value immediately.
    const cacheKey = this.getCollectionCacheKey(database, collection);
    const cached = this.documentsListCache.get(cacheKey);

    if (cached) {
      const doc = cached.documentIndex.get(documentName);

      if (doc) {
        for (const [k, v] of Object.entries(updates)) {
          if (v === undefined) {
            const mutableDoc = doc as Record<string, unknown>;
            delete mutableDoc[k];
          } else {
            (doc as Record<string, unknown>)[k] = v;
          }
        }
      }
    }
  }

  public isMongoDBDocument(checkPath: string): boolean {
    const { collection, database, document: documentName } = this.parsePath(checkPath);
    return !!(database && collection && documentName && checkPath.endsWith('.json'));
  }

  private parsePath(filePath: string): { collection?: string; database?: string; document?: string } {
    const parts = filePath.split("/").filter(Boolean);
    return {
      collection: parts[1],
      database: parts[0],
      document: parts[2]
        ? MongoDBFileSystem.decodeDocumentIdentifier(parts[2].replace(/\.json$/, ""))
        : undefined,
    };
  }

  public getCollectionCacheKey(database: string, collection: string): string {
    return `${database}/${collection}`;
  }

  private getCachedCollectionEntries(database: string, collection: string): Set<string> | null {
    const key = this.getCollectionCacheKey(database, collection);
    const cached = this.collectionEntriesCache.get(key);

    if (!cached) {
      return null; // eslint-disable-line unicorn/no-null
    }

    if (Date.now() - cached.cachedAt > COLLECTION_CACHE_TTL_MS) {
      this.collectionEntriesCache.delete(key);
      return null; // eslint-disable-line unicorn/no-null
    }

    return cached.entries;
  }

  private setCachedCollectionEntries(
    database: string,
    collection: string,
    entries: string[]
  ): void {
    this.collectionEntriesCache.set(this.getCollectionCacheKey(database, collection), {
      cachedAt: Date.now(),
      entries: new Set(entries),
    });
  }

  /**
   * Incrementally merge a page of documents into both caches.
   * If no cache entry exists yet, creates one. If one exists, appends
   * new documents (skipping duplicates by identifier).
   */
  private mergePagesIntoCaches(
    database: string,
    collection: string,
    documents: MongoDocument[]
  ): void {
    const key = this.getCollectionCacheKey(database, collection);

    // --- documentsListCache ---
    const existingDocsList = this.documentsListCache.get(key);
    if (existingDocsList) {
      for (const doc of documents) {
        const identifier = MongoDBFileSystem.decodeDocumentIdentifier(
          this.getDocumentIdentifier(doc)
        );
        if (!existingDocsList.documentIndex.has(identifier)) {
          existingDocsList.documents.push(doc);
          existingDocsList.documentIndex.set(identifier, doc);
        }
      }
      existingDocsList.cachedAt = Date.now();
    } else {
      this.setCachedDocumentsList(database, collection, documents);
    }

    // --- collectionEntriesCache (encoded identifiers, matching stat lookup path) ---
    const existingEntries = this.collectionEntriesCache.get(key);
    if (existingEntries) {
      for (const doc of documents) {
        existingEntries.entries.add(this.getDocumentIdentifier(doc));
      }
      existingEntries.cachedAt = Date.now();
    } else {
      const identifiers = documents.map((doc) => this.getDocumentIdentifier(doc));
      this.setCachedCollectionEntries(database, collection, identifiers);
    }
  }

  private invalidateCollectionCache(database?: string, collection?: string): void {
    if (database && collection) {
      const key = this.getCollectionCacheKey(database, collection);
      this.collectionEntriesCache.delete(key);
      this.documentsListCache.delete(key);
      return;
    }

    if (database) {
      const databasePrefix = `${database}/`;

      for (const cacheKey of this.collectionEntriesCache.keys()) {
        if (cacheKey.startsWith(databasePrefix)) {
          this.collectionEntriesCache.delete(cacheKey);
        }
      }

      for (const cacheKey of this.documentsListCache.keys()) {
        if (cacheKey.startsWith(databasePrefix)) {
          this.documentsListCache.delete(cacheKey);
        }
      }

      return;
    }

    this.collectionEntriesCache.clear();
    this.documentsListCache.clear();
  }

  private getDocumentIdentifier(mongoDocument: MongoDocument): string {
    const raw = mongoDocument._id ?? mongoDocument.name ?? "";
    if (!raw) return "unnamed";
    return encodeURIComponent(raw);
  }

  public static decodeDocumentIdentifier(encoded: string): string {
    try { return decodeURIComponent(encoded); } catch { return encoded; }
  }

  private async getDocument(
    dbName: string,
    collectionName: string,
    documentId: string
  ): Promise<MongoDocument | undefined> {
    this.connect();
    if (!this.client) throw new Error("No MongoDB connection");

    const db = this.client.db(dbName);
    const col = db.collection(collectionName);

    // _id-first: matches getDocumentIdentifier priority
    const byId = await col.findOne({
      _id: documentId,
    });

    if (byId) {
      return byId;
    }

    return await col.findOne({ name: documentId });
  }

  private async getEntry(entryPath: string): Promise<MongoFSEntry | undefined> {
    const { collection, database, document: documentName } = this.parsePath(entryPath);

    if (!database) {
      // Root path - represents the MongoDB connection itself
      return {
        name: "",
        path: entryPath,
        type: "database",
      };
    }

    if (!collection) {
      // This is a database folder
      return {
        name: database,
        path: entryPath,
        type: "database",
      };
    }

    if (!documentName) {
      // This is a collection folder
      return {
        name: collection,
        path: entryPath,
        type: "collection",
      };
    }

    // This is a document file
    const doc = await this.getDocument(database, collection, documentName);

    if (!doc) return undefined;

    return {
      data: doc,
      name: documentName,
      path: entryPath,
      type: "document",
    };
  }

  private createStats(isDir: boolean, size = 0): Stats {
    return {
      atime: new Date(),
      birthtime: new Date(),
      ctime: new Date(),
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isDirectory: () => isDir,
      isFIFO: () => false,
      // Directory or file mode
      isFile: () => !isDir,
      isSocket: () => false,
      isSymbolicLink: () => false,
      mode: isDir ? 16877 : 33188,
      mtime: new Date(),
      size,
    } as Stats;
  }

  public async stat(statPath: string, isLstat: boolean | ((error: ApiError | null, stats?: Stats) => void), callback?: (error: ApiError | null, stats?: Stats) => void): Promise<void> {
    // BrowserFS calls stat(path, isLstat, callback) with 3 args
    const cb = typeof isLstat === 'function' ? isLstat : callback;
    if (!cb) return;
    try {
      const { collection, database, document: documentName } = this.parsePath(statPath);

      if (!database) {
        cb(null, this.createStats(true, 0)); // eslint-disable-line unicorn/no-null
        return;
      }

      if (database && collection && documentName) {
        const cachedEntries = this.getCachedCollectionEntries(database, collection);

        if (cachedEntries?.has(encodeURIComponent(documentName))) {
          cb(null, this.createStats(false, UNKNOWN_DOCUMENT_SIZE)); // eslint-disable-line unicorn/no-null
          return;
        }
      }

      const entry = await this.getEntry(statPath);

      if (!entry) {
        const statError = new Error("ENOENT: no such file or directory") as ApiError;
        statError.code = "ENOENT";
        cb(statError);
        return;
      }

      const isDir = entry.type === "database" || entry.type === "collection";
      const entrySize = entry.type === "document" && entry.data
        ? Buffer.byteLength(JSON.stringify(entry.data, null, 2)) // eslint-disable-line unicorn/no-null
        : UNKNOWN_DOCUMENT_SIZE;

      cb(null, this.createStats(isDir, entrySize)); // eslint-disable-line unicorn/no-null
    } catch (caughtError) {
      const apiError = new Error(String(caughtError)) as ApiError;
      apiError.code = "EIO";
      cb(apiError);
    }
  }

  public async readdir(readdirPath: string, callback: (error: ApiError | null, files?: string[]) => void): Promise<void> {
    try {
      const { collection, database } = this.parsePath(readdirPath);

      if (!database) {
        // Root path - list databases
        const databases = await this.getDatabases();
        if (typeof callback === 'function') {
          callback(null, databases); // eslint-disable-line unicorn/no-null
        }
        return;
      }

      if (!collection) {
        // Database path - list collections
        const collections = await this.getCollections(database);
        if (typeof callback === 'function') {
          callback(null, collections); // eslint-disable-line unicorn/no-null
        }
        return;
      }

      // Collection path - list documents as JSON files
      const documents = await this.getDocuments(database, collection);
      const entries = documents.map((doc) => this.getDocumentIdentifier(doc));
      this.setCachedCollectionEntries(database, collection, entries);

      const filenames = documents.map((doc) => `${this.getDocumentIdentifier(doc)}.json`);
      if (typeof callback === 'function') {
        callback(null, filenames); // eslint-disable-line unicorn/no-null
      }
    } catch (caughtError) {
      const apiError = new Error(String(caughtError)) as ApiError;
      apiError.code = "EIO";
      if (typeof callback === 'function') {
        callback(apiError);
      }
    }
  }

  /**
   * Paged readdir for large collections. Returns filenames for one page.
   * BrowserFS readdir stays unchanged for non-paged callers.
   */
  public async readdirPaged(
    pagedPath: string,
    cursor?: { afterId: string; afterName: string },
    limit = 500
  ): Promise<{ entries: string[]; hasMore: boolean; nextCursor?: { afterId: string; afterName: string } }> {
    const { collection, database } = this.parsePath(pagedPath);

    if (!database || !collection) {
      // Non-collection paths: delegate to regular readdir
      return new Promise((resolve, reject) => {
        this.readdir(pagedPath, (readdirError, files) => {
          if (readdirError) { reject(readdirError); return; }
          resolve({ entries: files ?? [], hasMore: false });
        });
      });
    }

    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) {
      params.set("afterId", cursor.afterId);
      params.set("afterName", cursor.afterName);
    }

    const url = `/api/mongodb/documents/${encodeURIComponent(database)}/${encodeURIComponent(collection)}?${params}`;
    const response = await MongoDBFileSystem.fetchWithTimeout(url, {
      headers: { "x-mongodb-connection": this.connectionString },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = (await response.json()) as {
      documents: MongoDocument[];
      hasMore: boolean;
      nextCursor?: { afterId: string; afterName: string };
    };

    this.mergePagesIntoCaches(database, collection, result.documents);

    const pagedEntries = result.documents.map((doc) => `${this.getDocumentIdentifier(doc)}.json`);

    return {
      entries: pagedEntries,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };
  }

  public async readFile(
    readPath: string,
    encoding: string | null,
    _flag: string,
    callback: (error: ApiError | null, data?: Buffer | string) => void
  ): Promise<void> {
    try {
      const { collection, database, document: documentName } = this.parsePath(readPath);

      if (!database || !collection || !documentName) {
        const readError = new Error("ENOENT: no such file or directory") as ApiError;
        readError.code = "ENOENT";
        if (typeof callback === 'function') {
          callback(readError);
        }
        return;
      }

      const doc = await this.getDocument(database, collection, documentName);

      if (!doc) {
        const readError = new Error("ENOENT: no such file or directory") as ApiError;
        readError.code = "ENOENT";
        if (typeof callback === 'function') {
          callback(readError);
        }
        return;
      }

      const jsonContent = JSON.stringify(doc, null, 2); // eslint-disable-line unicorn/no-null
      const buffer = Buffer.from(jsonContent);

      if (typeof callback === 'function') {
        callback(
          null, // eslint-disable-line unicorn/no-null
          encoding ? buffer.toString(encoding as BufferEncoding) : buffer
        );
      }
    } catch (caughtError) {
      const apiError = new Error(String(caughtError)) as ApiError;
      apiError.code = "EIO";
      if (typeof callback === 'function') {
        callback(apiError);
      }
    }
  }

  public async writeFile(
    writePath: string,
    data: Buffer | string,
    _encoding: string | null,
    _flag: string,
    _mode: number,
    callback: (error: ApiError | null) => void
  ): Promise<void> {
    try {
      const { collection, database, document: documentName } = this.parsePath(writePath);

      if (!database || !collection || !documentName) {
        const writeError = new Error("EINVAL: invalid argument") as ApiError;
        writeError.code = "EINVAL";
        callback(writeError);
        return;
      }

      this.connect();
      if (!this.client) throw new Error("No MongoDB connection");

      const db = this.client.db(database);
      const col = db.collection(collection);

      const content = typeof data === "string" ? data : data.toString();
      const jsonData = JSON.parse(content) as Record<string, unknown>;

      // Use the document name as identifier, or _id if provided
      const filter = jsonData._id ? { _id: jsonData._id } : { name: documentName };

      await col.replaceOne(filter as Record<string, unknown>, jsonData, { upsert: true });
      this.invalidateCollectionCache(database, collection);
      callback(null); // eslint-disable-line unicorn/no-null
    } catch (caughtError) {
      const apiError = new Error(String(caughtError)) as ApiError;
      apiError.code = "EIO";
      callback(apiError);
    }
  }

  private static readonly INVALID_MONGO_NAME_CHARS = /[\s/\\."$*<>:|?]/;

  private validateMongoName(validateName: string): string | null {
    if (MongoDBFileSystem.INVALID_MONGO_NAME_CHARS.test(validateName)) {
      return String.raw`Name cannot contain spaces or special characters: /\. "$*<>:|?`;
    }
    if (validateName.length === 0 || validateName.length > 64) {
      return "Name must be between 1 and 64 characters";
    }
    return null; // eslint-disable-line unicorn/no-null
  }

  public async mkdir(mkdirPath: string, _mode: number, callback: (error: ApiError | null) => void): Promise<void> {
    try {
      const { collection, database, document: documentName } = this.parsePath(mkdirPath);

      if (!database) {
        const mkdirError = new Error("EINVAL: invalid argument") as ApiError;
        mkdirError.code = "EINVAL";
        callback(mkdirError);
        return;
      }

      // Cannot create folders inside a collection (depth 3+)
      if (documentName) {
        const mkdirError = new Error("Cannot create a folder inside a collection") as ApiError;
        mkdirError.code = "EINVAL";
        callback(mkdirError);
        return;
      }

      const dbError = this.validateMongoName(database);
      if (dbError) {
        const mkdirError = new Error(dbError) as ApiError;
        mkdirError.code = "EINVAL";
        callback(mkdirError);
        return;
      }

      if (collection) {
        const collError = this.validateMongoName(collection);
        if (collError) {
          const mkdirError = new Error(collError) as ApiError;
          mkdirError.code = "EINVAL";
          callback(mkdirError);
          return;
        }
      }

      const url = collection
        ? `/api/mongodb/mkdir/${encodeURIComponent(database)}/${encodeURIComponent(collection)}`
        : `/api/mongodb/mkdir/${encodeURIComponent(database)}`;

      const response = await MongoDBFileSystem.fetchWithTimeout(url, {
        headers: {
          'x-mongodb-connection': this.connectionString,
        },
        method: 'POST',
      });

      if (!response.ok) {
        const fetchResult = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        throw new Error(fetchResult.error ?? `HTTP ${response.status}`);
      }

      this.invalidateCollectionCache(database, collection);
      callback(null); // eslint-disable-line unicorn/no-null
    } catch (caughtError) {
      const apiError = new Error(String(caughtError)) as ApiError;
      apiError.code = "EIO";
      callback(apiError);
    }
  }

  public async unlink(unlinkPath: string, callback: (error: ApiError | null) => void): Promise<void> {
    try {
      const { collection, database, document: documentName } = this.parsePath(unlinkPath);

      if (!database) {
        const unlinkError = new Error("EINVAL: invalid argument") as ApiError;
        unlinkError.code = "EINVAL";
        callback(unlinkError);
        return;
      }

      if (!collection || !documentName) {
        const unlinkError = new Error("EISDIR: is a directory") as ApiError;
        unlinkError.code = "EISDIR";
        callback(unlinkError);
        return;
      }

      this.connect();
      if (!this.client) throw new Error("No MongoDB connection");

      const db = this.client.db(database);
      const col = db.collection(collection);

      // _id-first: matches getDocumentIdentifier priority
      const deleteResult = await col.deleteOne({ _id: documentName });
      if (deleteResult.deletedCount === 0) {
        const fallback = await col.deleteOne({ name: documentName });
        if (fallback.deletedCount === 0) {
          const enoent = new Error("ENOENT: no such file or directory") as ApiError;
          enoent.code = "ENOENT";
          callback(enoent);
          return;
        }
      }

      this.invalidateCollectionCache(database, collection);
      callback(null); // eslint-disable-line unicorn/no-null
    } catch (caughtError) {
      const apiError = new Error(String(caughtError)) as ApiError;
      apiError.code = "EIO";
      callback(apiError);
    }
  }

  public async rmdir(rmdirPath: string, callback: (error: ApiError | null) => void): Promise<void> {
    try {
      const { collection, database } = this.parsePath(rmdirPath);

      this.connect();
      if (!this.client) throw new Error("No MongoDB connection");

      if (collection) {
        // Drop collection
        const db = this.client.db(database);
        await db.collection(collection).drop();
        this.invalidateCollectionCache(database, collection);
      } else if (database) {
        // Drop database
        await this.client.db(database).dropDatabase();
        this.invalidateCollectionCache(database);
      }

      callback(null); // eslint-disable-line unicorn/no-null
    } catch (caughtError) {
      const apiError = new Error(String(caughtError)) as ApiError;
      apiError.code = "EIO";
      callback(apiError);
    }
  }

  // Synchronous methods that throw errors (not supported)
  public statSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public readdirSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public readFileSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public writeFileSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public mkdirSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public unlinkSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public rmdirSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  // Other required methods with basic implementations
  public truncate(
    _path: string,
    _len: number,
    callback: (error: ApiError | null) => void
  ): void {
    const truncateError = new Error("ENOSYS: function not implemented") as ApiError;
    truncateError.code = "ENOSYS";
    callback(truncateError);
  }

  public open(
    _path: string,
    _flag: string,
    _mode: number,
    callback: (error: ApiError | null, fd?: number) => void
  ): void {
    // Simple implementation - we don't really use file descriptors
    callback(null, Math.floor(Math.random() * 1000)); // eslint-disable-line unicorn/no-null
  }

  public close(
    _fd: number,
    callback: (error: ApiError | null) => void
  ): void {
    callback(null); // eslint-disable-line unicorn/no-null
  }

  public read(
    _fd: number,
    _buffer: Buffer,
    _offset: number,
    _length: number,
    _position: number | null,
    callback: (error: ApiError | null, bytesRead?: number, buffer?: Buffer) => void
  ): void {
    const readError = new Error("ENOSYS: function not implemented") as ApiError;
    readError.code = "ENOSYS";
    callback(readError);
  }

  public write(
    _fd: number,
    _buffer: Buffer,
    _offset: number,
    _length: number,
    _position: number | null,
    callback: (error: ApiError | null, bytesWritten?: number, buffer?: Buffer) => void
  ): void {
    const writeError = new Error("ENOSYS: function not implemented") as ApiError;
    writeError.code = "ENOSYS";
    callback(writeError);
  }

  public sync(
    _fd: number,
    callback: (error: ApiError | null) => void
  ): void {
    callback(null); // eslint-disable-line unicorn/no-null
  }

  public chown(
    _path: string,
    _uid: number,
    _gid: number,
    callback: (error: ApiError | null) => void
  ): void {
    callback(null); // eslint-disable-line unicorn/no-null
  }

  public chmod(
    _path: string,
    _mode: number,
    callback: (error: ApiError | null) => void
  ): void {
    callback(null); // eslint-disable-line unicorn/no-null
  }

  public utimes(
    _path: string,
    _atime: Date,
    _mtime: Date,
    callback: (error: ApiError | null) => void
  ): void {
    callback(null); // eslint-disable-line unicorn/no-null
  }

  public rename(
    _oldPath: string,
    _newPath: string,
    callback: (error: ApiError | null) => void
  ): void {
    const renameError = new Error("ENOSYS: function not implemented") as ApiError;
    renameError.code = "ENOSYS";
    callback(renameError);
  }

  public link(
    _srcpath: string,
    _dstpath: string,
    callback: (error: ApiError | null) => void
  ): void {
    const linkError = new Error("ENOSYS: function not implemented") as ApiError;
    linkError.code = "ENOSYS";
    callback(linkError);
  }

  public symlink(
    _srcpath: string,
    _dstpath: string,
    _type: string,
    callback: (error: ApiError | null) => void
  ): void {
    const symlinkError = new Error("ENOSYS: function not implemented") as ApiError;
    symlinkError.code = "ENOSYS";
    callback(symlinkError);
  }

  public readlink(
    _path: string,
    callback: (error: ApiError | null, linkString?: string) => void
  ): void {
    const readlinkError = new Error("ENOSYS: function not implemented") as ApiError;
    readlinkError.code = "ENOSYS";
    callback(readlinkError);
  }

  public realpath(
    realpathPath: string,
    _cache: Record<string, string>,
    callback: (error: ApiError | null, resolvedPath?: string) => void
  ): void {
    callback(null, realpathPath); // eslint-disable-line unicorn/no-null
  }

  public lstat(
    lstatPath: string,
    isLstat: boolean | ((error: ApiError | null, stats?: Stats) => void),
    callback?: (error: ApiError | null, stats?: Stats) => void
  ): void {
    // For MongoDB FS, lstat is the same as stat (no symbolic links)
    this.stat(lstatPath, isLstat, callback).catch(() => { /* noop: stat handles errors via callback */ });
  }

  public async exists(existsPath: string, callback: (exists: boolean) => void): Promise<void> {
    try {
      const { collection, database, document: documentName } = this.parsePath(existsPath);

      if (database && collection && documentName) {
        const cachedEntries = this.getCachedCollectionEntries(database, collection);

        if (cachedEntries?.has(encodeURIComponent(documentName))) {
          callback(true);
          return;
        }
      }

      const entry = await this.getEntry(existsPath);
      callback(!!entry);
    } catch {
      callback(false);
    }
  }

  // Sync versions that throw errors
  public truncateSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public openSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public closeSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public readSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public writeSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public syncSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public chownSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public chmodSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public utimesSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public renameSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public linkSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public symlinkSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public readlinkSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public realpathSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public lstatSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  public existsSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }
}

// Factory function for BrowserFS integration
export function Create(
  options: { connectionString?: string },
  callback: (error: Error | undefined, fs?: MongoDBFileSystem) => void
): void {
  try {
    const mongoFS = new MongoDBFileSystem(options.connectionString);
    callback(undefined, mongoFS);
  } catch (error) {
    callback(error instanceof Error ? error : new Error(String(error)));
  }
}
