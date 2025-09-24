// MongoDB client imports are handled dynamically to avoid SSR issues
// Note: MongoDB client only used in API routes, not in browser code
import { type FileSystem } from "browserfs/dist/node/core/file_system";
import { type ApiError } from "browserfs/dist/node/core/api_error";
import { type Stats } from "browserfs/dist/node/core/node_fs_stats";

interface MongoDocument {
  _id?: any;
  name?: string;
  images?: string[];
  oldImages?: string[];
  [key: string]: any;
}

interface MongoFSEntry {
  type: "database" | "collection" | "document";
  path: string;
  name: string;
  data?: MongoDocument;
}

export class MongoDBFileSystem implements FileSystem {
  private client: any = null;
  private connected = false;
  private readonly connectionString: string;

  constructor(connectionString = "mongodb://localhost:27017") {
    this.connectionString = connectionString;
  }

  getName(): string {
    return "MongoDBFS";
  }

  isReadOnly(): boolean {
    return false;
  }

  supportsProps(): boolean {
    return true;
  }

  supportsLinks(): boolean {
    return false;
  }

  supportsSynch(): boolean {
    return false;
  }

  private async connect(): Promise<void> {
    if (this.connected && this.client) return;

    // Always use API proxy in this implementation
    this.client = this.createAPIClient();
    this.connected = true;
  }

  private createAPIClient() {
    // API client that proxies requests to Next.js API route
    return {
      db: (dbName?: string) => ({
        admin: () => ({
          listDatabases: async () => {
            const response = await fetch('/api/mongodb/databases', {
              headers: {
                'x-mongodb-connection': this.connectionString,
              },
            });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const databases = await response.json();
            return { databases: databases.map((name: string) => ({ name })) };
          }
        }),
        listCollections: async () => {
          if (!dbName) return [];
          const response = await fetch(`/api/mongodb/collections/${dbName}`, {
            headers: {
              'x-mongodb-connection': this.connectionString,
            },
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const collections = await response.json();
          return collections.map((name: string) => ({ name }));
        },
        collection: (collectionName: string) => ({
          find: () => ({
            toArray: async () => {
              if (!dbName) return [];
              const response = await fetch(`/api/mongodb/documents/${dbName}/${collectionName}`, {
                headers: {
                  'x-mongodb-connection': this.connectionString,
                },
              });
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              return await response.json();
            }
          }),
          findOne: async (filter: any) => {
            if (!dbName) return null;
            const documentId = filter.name || filter._id;
            const response = await fetch(`/api/mongodb/document/${dbName}/${collectionName}/${documentId}`, {
              headers: {
                'x-mongodb-connection': this.connectionString,
              },
            });
            if (!response.ok) {
              return null;
            }
            return await response.json();
          },
          getImages: async (documentId: string) => {
            if (!dbName) return [];
            const response = await fetch(`/api/mongodb/images/${dbName}/${collectionName}/${documentId}`, {
              headers: {
                'x-mongodb-connection': this.connectionString,
              },
            });
            if (!response.ok) {
              return [];
            }
            const result = await response.json();
            return result.images || [];
          },
          insertOne: async (doc: any) => {
            // For inserts, we'll use the upsert functionality of replaceOne
            return this.replaceDocument(dbName!, collectionName, doc);
          },
          replaceOne: async (filter: any, doc: any, options: any) => {
            return this.replaceDocument(dbName!, collectionName, doc);
          },
          deleteOne: async (filter: any) => {
            const documentId = filter.name || filter._id;
            const response = await fetch(`/api/mongodb/document/${dbName}/${collectionName}/${documentId}`, {
              method: 'DELETE',
              headers: {
                'x-mongodb-connection': this.connectionString,
              },
            });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const result = await response.json();
            return { deletedCount: result.deletedCount };
          },
          drop: async () => {
            // Collection drop would need to be implemented if needed
            return { ok: 1 };
          }
        })
      }),
      close: async () => {},
      connect: async () => {}
    };
  }

  private async replaceDocument(dbName: string, collectionName: string, doc: any) {
    const documentId = doc.name || doc._id || new Date().getTime().toString();
    const response = await fetch(`/api/mongodb/document/${dbName}/${collectionName}/${documentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-mongodb-connection': this.connectionString,
      },
      body: JSON.stringify(doc),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return { acknowledged: true };
  }

  private createMockClient() {
    // Mock MongoDB client for demonstration in browser
    const mockData = {
      "sampleDB": {
        "users": [
          { _id: "1", name: "john_doe", email: "john@example.com", age: 30 },
          { _id: "2", name: "jane_smith", email: "jane@example.com", age: 25 },
          { _id: "3", name: "admin_user", email: "admin@example.com", role: "admin" }
        ],
        "products": [
          { _id: "prod1", name: "laptop", price: 999.99, category: "electronics" },
          { _id: "prod2", name: "book", price: 19.99, category: "books" },
          { _id: "prod3", name: "headphones", price: 79.99, category: "electronics" }
        ],
        "orders": [
          { _id: "order1", name: "order_001", userId: "1", productId: "prod1", quantity: 1, total: 999.99 },
          { _id: "order2", name: "order_002", userId: "2", productId: "prod2", quantity: 2, total: 39.98 }
        ]
      },
      "blogDB": {
        "posts": [
          { _id: "post1", name: "first_post", title: "Getting Started with MongoDB", content: "MongoDB is a NoSQL database...", author: "john_doe" },
          { _id: "post2", name: "second_post", title: "Advanced MongoDB Queries", content: "Learn advanced querying techniques...", author: "jane_smith" }
        ],
        "comments": [
          { _id: "comment1", name: "comment_001", postId: "post1", author: "user123", text: "Great post!" },
          { _id: "comment2", name: "comment_002", postId: "post1", author: "user456", text: "Very helpful, thanks!" }
        ]
      }
    };

    return {
      db: (dbName?: string) => ({
        admin: () => ({
          listDatabases: async () => ({
            databases: Object.keys(mockData).map(name => ({ name }))
          })
        }),
        listCollections: async () => {
          if (!dbName || !mockData[dbName]) return [];
          return Object.keys(mockData[dbName]).map(name => ({ name }));
        },
        collection: (collectionName: string) => ({
          find: () => ({
            toArray: async () => {
              if (!dbName || !mockData[dbName] || !mockData[dbName][collectionName]) return [];
              return mockData[dbName][collectionName];
            }
          }),
          insertOne: async (doc: any) => ({ acknowledged: true, insertedId: doc._id || new Date().getTime().toString() }),
          replaceOne: async (filter: any, doc: any, options: any) => ({ acknowledged: true, modifiedCount: 1 }),
          deleteOne: async (filter: any) => ({ acknowledged: true, deletedCount: 1 }),
          drop: async () => ({ ok: 1 })
        })
      }),
      close: async () => {},
      connect: async () => {}
    };
  }

  private async getDatabases(): Promise<string[]> {
    await this.connect();
    if (!this.client) throw new Error("No MongoDB connection");

    const adminDb = this.client.db().admin();
    const { databases } = await adminDb.listDatabases();
    return databases.map((db: any) => db.name);
  }

  private async getCollections(dbName: string): Promise<string[]> {
    await this.connect();
    if (!this.client) throw new Error("No MongoDB connection");

    const db = this.client.db(dbName);
    const collections = await db.listCollections().toArray();
    return collections.map((col: any) => col.name);
  }

  private async getDocuments(dbName: string, collectionName: string): Promise<MongoDocument[]> {
    await this.connect();
    if (!this.client) throw new Error("No MongoDB connection");

    const db = this.client.db(dbName);
    const collection = db.collection(collectionName);
    const documents = await collection.find({}).toArray();
    return documents as MongoDocument[];
  }

  public async getDocumentImages(path: string): Promise<string[]> {
    const { database, collection, document } = this.parsePath(path);

    if (!database || !collection || !document) {
      return [];
    }

    try {
      await this.connect();
      if (!this.client) return [];

      const db = this.client.db(database);
      const col = db.collection(collection);
      const images = await col.getImages(document);
      return images;
    } catch (error) {
      console.warn(`Failed to get images for ${path}:`, error);
      return [];
    }
  }

  public isMongoDBDocument(path: string): boolean {
    const { database, collection, document } = this.parsePath(path);
    return !!(database && collection && document && path.endsWith('.json'));
  }

  private parsePath(path: string): { database?: string; collection?: string; document?: string } {
    const parts = path.split("/").filter(Boolean);
    return {
      database: parts[0],
      collection: parts[1],
      document: parts[2]?.replace(".json", ""),
    };
  }

  private async getEntry(path: string): Promise<MongoFSEntry | null> {
    const { database, collection, document } = this.parsePath(path);

    if (!database) {
      return null;
    }

    if (!collection) {
      // This is a database folder
      return {
        type: "database",
        path,
        name: database,
      };
    }

    if (!document) {
      // This is a collection folder
      return {
        type: "collection",
        path,
        name: collection,
      };
    }

    // This is a document file
    const documents = await this.getDocuments(database, collection);
    const doc = documents.find(
      (d) => (d.name || d._id?.toString()) === document
    );

    if (!doc) return null;

    return {
      type: "document",
      path,
      name: document,
      data: doc,
    };
  }

  async stat(path: string, callback: (error: ApiError | null, stats?: Stats) => void): Promise<void> {
    try {
      const entry = await this.getEntry(path);

      if (!entry) {
        const error = new Error("ENOENT: no such file or directory") as ApiError;
        error.code = "ENOENT";
        if (typeof callback === 'function') {
          callback(error);
        }
        return;
      }

      const isDirectory = entry.type === "database" || entry.type === "collection";
      const size = entry.type === "document" && entry.data
        ? Buffer.byteLength(JSON.stringify(entry.data, null, 2))
        : 0;

      const stats = {
        size,
        mode: isDirectory ? 16877 : 33188, // Directory or file mode
        isFile: () => !isDirectory,
        isDirectory: () => isDirectory,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        mtime: new Date(),
        atime: new Date(),
        ctime: new Date(),
        birthtime: new Date(),
      } as Stats;

      if (typeof callback === 'function') {
        callback(null, stats);
      }
    } catch (error) {
      const apiError = new Error(String(error)) as ApiError;
      apiError.code = "EIO";
      if (typeof callback === 'function') {
        callback(apiError);
      }
    }
  }

  async readdir(path: string, callback: (error: ApiError | null, files?: string[]) => void): Promise<void> {
    try {
      const { database, collection } = this.parsePath(path);

      if (!database) {
        // Root path - list databases
        const databases = await this.getDatabases();
        if (typeof callback === 'function') {
          callback(null, databases);
        }
        return;
      }

      if (!collection) {
        // Database path - list collections
        const collections = await this.getCollections(database);
        if (typeof callback === 'function') {
          callback(null, collections);
        }
        return;
      }

      // Collection path - list documents as JSON files
      const documents = await this.getDocuments(database, collection);
      const filenames = documents.map((doc) => {
        const name = doc.name || doc._id?.toString() || "unnamed";
        return `${name}.json`;
      });
      if (typeof callback === 'function') {
        callback(null, filenames);
      }
    } catch (error) {
      const apiError = new Error(String(error)) as ApiError;
      apiError.code = "EIO";
      if (typeof callback === 'function') {
        callback(apiError);
      }
    }
  }

  async readFile(
    path: string,
    encoding: string | null,
    flag: string,
    callback: (error: ApiError | null, data?: Buffer | string) => void
  ): Promise<void> {
    try {
      const entry = await this.getEntry(path);

      if (!entry || entry.type !== "document" || !entry.data) {
        const error = new Error("ENOENT: no such file or directory") as ApiError;
        error.code = "ENOENT";
        if (typeof callback === 'function') {
          callback(error);
        }
        return;
      }

      const jsonContent = JSON.stringify(entry.data, null, 2);
      const buffer = Buffer.from(jsonContent);

      if (typeof callback === 'function') {
        callback(null, encoding ? buffer.toString(encoding) : buffer);
      }
    } catch (error) {
      const apiError = new Error(String(error)) as ApiError;
      apiError.code = "EIO";
      if (typeof callback === 'function') {
        callback(apiError);
      }
    }
  }

  async writeFile(
    path: string,
    data: Buffer | string,
    encoding: string | null,
    flag: string,
    mode: number,
    callback: (error: ApiError | null) => void
  ): Promise<void> {
    try {
      const { database, collection, document } = this.parsePath(path);

      if (!database || !collection || !document) {
        const error = new Error("EINVAL: invalid argument") as ApiError;
        error.code = "EINVAL";
        callback(error);
        return;
      }

      await this.connect();
      if (!this.client) throw new Error("No MongoDB connection");

      const db = this.client.db(database);
      const col = db.collection(collection);

      const content = typeof data === "string" ? data : data.toString();
      const jsonData = JSON.parse(content);

      // Use the document name as identifier, or _id if provided
      const filter = jsonData._id ? { _id: jsonData._id } : { name: document };

      await col.replaceOne(filter, jsonData, { upsert: true });
      callback(null);
    } catch (error) {
      const apiError = new Error(String(error)) as ApiError;
      apiError.code = "EIO";
      callback(apiError);
    }
  }

  async mkdir(path: string, mode: number, callback: (error: ApiError | null) => void): Promise<void> {
    try {
      const { database, collection } = this.parsePath(path);

      if (!database) {
        const error = new Error("EINVAL: invalid argument") as ApiError;
        error.code = "EINVAL";
        callback(error);
        return;
      }

      await this.connect();
      if (!this.client) throw new Error("No MongoDB connection");

      if (collection) {
        // Create collection by inserting a dummy document
        const db = this.client.db(database);
        const col = db.collection(collection);
        await col.insertOne({ _placeholder: true });
        await col.deleteOne({ _placeholder: true });
      } else {
        // Create database by creating a collection
        const db = this.client.db(database);
        const col = db.collection("_temp");
        await col.insertOne({ _placeholder: true });
        await col.deleteOne({ _placeholder: true });
      }

      callback(null);
    } catch (error) {
      const apiError = new Error(String(error)) as ApiError;
      apiError.code = "EIO";
      callback(apiError);
    }
  }

  async unlink(path: string, callback: (error: ApiError | null) => void): Promise<void> {
    try {
      const { database, collection, document } = this.parsePath(path);

      if (!database || !collection || !document) {
        const error = new Error("EINVAL: invalid argument") as ApiError;
        error.code = "EINVAL";
        callback(error);
        return;
      }

      await this.connect();
      if (!this.client) throw new Error("No MongoDB connection");

      const db = this.client.db(database);
      const col = db.collection(collection);

      // Try to delete by name first, then by _id
      const result = await col.deleteOne({ name: document });
      if (result.deletedCount === 0) {
        await col.deleteOne({ _id: document });
      }

      callback(null);
    } catch (error) {
      const apiError = new Error(String(error)) as ApiError;
      apiError.code = "EIO";
      callback(apiError);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async rmdir(path: string, callback: (error: ApiError | null) => void): Promise<void> {
    try {
      const { database, collection } = this.parsePath(path);

      await this.connect();
      if (!this.client) throw new Error("No MongoDB connection");

      if (collection) {
        // Drop collection
        const db = this.client.db(database);
        await db.collection(collection).drop();
      } else if (database) {
        // Drop database
        await this.client.db(database).dropDatabase();
      }

      callback(null);
    } catch (error) {
      const apiError = new Error(String(error)) as ApiError;
      apiError.code = "EIO";
      callback(apiError);
    }
  }

  // Synchronous methods that throw errors (not supported)
  statSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  readdirSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  readFileSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  writeFileSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  mkdirSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  unlinkSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  rmdirSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  // Other required methods with basic implementations
  async truncate(
    path: string,
    len: number,
    callback: (error: ApiError | null) => void
  ): Promise<void> {
    const error = new Error("ENOSYS: function not implemented") as ApiError;
    error.code = "ENOSYS";
    callback(error);
  }

  async open(
    path: string,
    flag: string,
    mode: number,
    callback: (error: ApiError | null, fd?: number) => void
  ): Promise<void> {
    // Simple implementation - we don't really use file descriptors
    callback(null, Math.floor(Math.random() * 1000));
  }

  async close(fd: number, callback: (error: ApiError | null) => void): Promise<void> {
    callback(null);
  }

  async read(
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: number | null,
    callback: (error: ApiError | null, bytesRead?: number, buffer?: Buffer) => void
  ): Promise<void> {
    const error = new Error("ENOSYS: function not implemented") as ApiError;
    error.code = "ENOSYS";
    callback(error);
  }

  async write(
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: number | null,
    callback: (error: ApiError | null, bytesWritten?: number, buffer?: Buffer) => void
  ): Promise<void> {
    const error = new Error("ENOSYS: function not implemented") as ApiError;
    error.code = "ENOSYS";
    callback(error);
  }

  async sync(fd: number, callback: (error: ApiError | null) => void): Promise<void> {
    callback(null);
  }

  async chown(
    path: string,
    uid: number,
    gid: number,
    callback: (error: ApiError | null) => void
  ): Promise<void> {
    callback(null);
  }

  async chmod(
    path: string,
    mode: number,
    callback: (error: ApiError | null) => void
  ): Promise<void> {
    callback(null);
  }

  async utimes(
    path: string,
    atime: Date,
    mtime: Date,
    callback: (error: ApiError | null) => void
  ): Promise<void> {
    callback(null);
  }

  async rename(
    oldPath: string,
    newPath: string,
    callback: (error: ApiError | null) => void
  ): Promise<void> {
    const error = new Error("ENOSYS: function not implemented") as ApiError;
    error.code = "ENOSYS";
    callback(error);
  }

  async link(
    srcpath: string,
    dstpath: string,
    callback: (error: ApiError | null) => void
  ): Promise<void> {
    const error = new Error("ENOSYS: function not implemented") as ApiError;
    error.code = "ENOSYS";
    callback(error);
  }

  async symlink(
    srcpath: string,
    dstpath: string,
    type: string,
    callback: (error: ApiError | null) => void
  ): Promise<void> {
    const error = new Error("ENOSYS: function not implemented") as ApiError;
    error.code = "ENOSYS";
    callback(error);
  }

  async readlink(
    path: string,
    callback: (error: ApiError | null, linkString?: string) => void
  ): Promise<void> {
    const error = new Error("ENOSYS: function not implemented") as ApiError;
    error.code = "ENOSYS";
    callback(error);
  }

  async realpath(
    path: string,
    cache: { [path: string]: string },
    callback: (error: ApiError | null, resolvedPath?: string) => void
  ): Promise<void> {
    callback(null, path);
  }

  async lstat(
    path: string,
    callback: (error: ApiError | null, stats?: Stats) => void
  ): Promise<void> {
    // For MongoDB FS, lstat is the same as stat (no symbolic links)
    return this.stat(path, callback);
  }

  async exists(path: string, callback: (exists: boolean) => void): Promise<void> {
    try {
      const entry = await this.getEntry(path);
      callback(!!entry);
    } catch {
      callback(false);
    }
  }

  // Sync versions that throw errors
  truncateSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  openSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  closeSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  readSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  writeSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  syncSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  chownSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  chmodSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  utimesSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  renameSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  linkSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  symlinkSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  readlinkSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  realpathSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  lstatSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }

  existsSync(): never {
    throw new Error("MongoDBFS does not support synchronous operations");
  }
}

// Factory function for BrowserFS integration
export function Create(
  options: { connectionString?: string },
  callback: (error: any, fs?: MongoDBFileSystem) => void
): void {
  try {
    const mongoFS = new MongoDBFileSystem(options.connectionString);
    callback(null, mongoFS);
  } catch (error) {
    callback(error);
  }
}