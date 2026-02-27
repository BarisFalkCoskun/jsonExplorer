import { type NextApiRequest, type NextApiResponse } from 'next';
import { MongoClient, ObjectId } from 'mongodb';

type MongoClientCacheEntry = {
  client?: MongoClient;
  connecting?: Promise<MongoClient>;
};

type MongoImage = {
  large?: string;
  medium?: string;
  small?: string;
};

const clientCache = new Map<string, MongoClientCacheEntry>();

async function connectToMongoDB(connectionString: string): Promise<MongoClient> {
  const cachedEntry = clientCache.get(connectionString);

  if (cachedEntry?.client) {
    return cachedEntry.client;
  }

  if (cachedEntry?.connecting) {
    return cachedEntry.connecting;
  }

  const client = new MongoClient(connectionString, {
    connectTimeoutMS: 5000,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });

  const connecting = client
    .connect()
    .then(() => {
      clientCache.set(connectionString, { client });
      return client;
    })
    .catch((error) => {
      clientCache.delete(connectionString);
      throw error;
    });

  clientCache.set(connectionString, { connecting });

  return connecting;
}

const getDocumentFilters = (documentId: string): object[] => {
  const filters: object[] = [{ name: documentId }, { _id: documentId }];

  if (ObjectId.isValid(documentId)) {
    filters.push({ _id: new ObjectId(documentId) });
  }

  return filters;
};

const extractDatabaseNameFromConnectionString = (
  connectionString: string
): string | undefined => {
  const protocolMatch = /^mongodb(?:\+srv)?:\/\//i.exec(connectionString);

  if (!protocolMatch) {
    return undefined;
  }

  const connectionWithoutProtocol = connectionString.slice(
    protocolMatch[0].length
  );
  const firstPathSlash = connectionWithoutProtocol.indexOf("/");

  if (firstPathSlash === -1) {
    return undefined;
  }

  const pathAndQuery = connectionWithoutProtocol.slice(firstPathSlash + 1);
  const [rawDatabaseName] = pathAndQuery.split("?");
  const databaseName = decodeURIComponent(rawDatabaseName ?? "").trim();

  return databaseName || undefined;
};

const handleDatabases = async (
  client: MongoClient,
  connectionString: string,
  res: NextApiResponse
): Promise<void> => {
  const adminDb = client.db().admin();

  try {
    const { databases } = await adminDb.listDatabases({
      authorizedDatabases: true,
      nameOnly: true,
    });

    const names = databases
      .map((db: { name?: string }) => db?.name)
      .filter(Boolean) as string[];

    if (names.length > 0) {
      res.json(names);
      return;
    }
  } catch (listDatabasesError) {
    const fallback =
      extractDatabaseNameFromConnectionString(connectionString);

    if (fallback) {
      res.json([fallback]);
      return;
    }

    throw listDatabasesError;
  }

  // Some clusters/users return no database list. Fall back to URI db.
  const fallbackDatabaseName =
    extractDatabaseNameFromConnectionString(connectionString);
  res.json(fallbackDatabaseName ? [fallbackDatabaseName] : []);
};

const handleCollections = async (
  client: MongoClient,
  operationParams: string[],
  res: NextApiResponse
): Promise<void> => {
  const [dbName] = operationParams;

  if (!dbName) {
    res.status(400).json({ error: 'Database name required' });
    return;
  }

  const db = client.db(dbName);
  const collections = await db.listCollections().toArray();

  res.json(collections.map((col: { name: string }) => col.name));
};

const handleDocuments = async (
  client: MongoClient,
  operationParams: string[],
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  const [dbName, collectionName] = operationParams;

  if (!dbName || !collectionName) {
    res.status(400).json({ error: 'Database and collection name required' });
    return;
  }

  const db = client.db(dbName);
  const collection = db.collection(collectionName);
  const metaOnly = req.query.meta === '1' || req.query.meta === 'true';
  let filter = {};

  if (typeof req.query.filter === 'string') {
    try {
      filter = JSON.parse(req.query.filter) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: 'Invalid filter JSON' });
      return;
    }
  }

  /* eslint-disable unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- MongoDB Collection.find, not Array.find */
  const cursor = metaOnly
    ? collection.find(filter, { projection: { _id: 1, category: 1, dismissed: 1, name: 1 } })
    : collection.find(filter);
  /* eslint-enable unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument */
  const documents = await cursor.sort({ name: 1 }).toArray();

  res.json(documents);
};

const handleDocument = async (
  client: MongoClient,
  operationParams: string[],
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  const [dbName, collectionName, ...documentIdParts] = operationParams;
  const documentId = documentIdParts.join('/');

  if (!dbName || !collectionName || !documentId) {
    res.status(400).json({ error: 'Database, collection, and document ID required' });
    return;
  }

  const db = client.db(dbName);
  const collection = db.collection(collectionName);

  if (req.method === 'GET') {
    const doc = await collection.findOne({
      $or: getDocumentFilters(documentId),
    });

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(doc);
  } else if (req.method === 'PATCH') {
    const updates = req.body as Record<string, unknown>;
    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, string> = {};

    for (const [field, value] of Object.entries(updates)) {
      if (value === null || value === undefined) {
        unsetFields[field] = "";
      } else {
        setFields[field] = value;
      }
    }

    const updateOps: Record<string, unknown> = {};

    if (Object.keys(setFields).length > 0) updateOps.$set = setFields;
    if (Object.keys(unsetFields).length > 0) updateOps.$unset = unsetFields;

    const result = await collection.updateOne(
      { $or: getDocumentFilters(documentId) },
      updateOps
    );

    res.json({ modifiedCount: result.modifiedCount });
  } else if (req.method === 'PUT') {
    const updateDoc = req.body as Record<string, unknown>;
    const docFilter = updateDoc._id ? { _id: updateDoc._id } : { name: documentId };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- dynamic MongoDB document
    await collection.replaceOne(docFilter as any, updateDoc as any, { upsert: true });
    res.json({ success: true });
  } else if (req.method === 'DELETE') {
    const result = await collection.deleteOne({
      $or: getDocumentFilters(documentId),
    });

    res.json({ deletedCount: result.deletedCount });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};

const handleImages = async (
  client: MongoClient,
  operationParams: string[],
  res: NextApiResponse
): Promise<void> => {
  const [dbName, collectionName, ...documentIdParts] = operationParams;
  const documentId = documentIdParts.join('/');

  if (!dbName || !collectionName || !documentId) {
    res.status(400).json({ error: 'Database, collection, and document ID required' });
    return;
  }

  const db = client.db(dbName);
  const collection = db.collection(collectionName);

  const docWithImages = await collection.findOne({
    $or: getDocumentFilters(documentId),
  });

  if (!docWithImages) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const images: unknown[] = [];

  if (Array.isArray(docWithImages.images)) {
    images.push(...(docWithImages.images as unknown[]));
  }

  if (Array.isArray(docWithImages.oldImages)) {
    images.push(...(docWithImages.oldImages as unknown[]));
  }

  const validImages = images
    .map((img) => {
      if (typeof img === 'string' && img.trim().length > 0) {
        return img.trim();
      }

      if (img && typeof img === 'object') {
        const imgObj = img as MongoImage;

        return imgObj.medium || imgObj.small || imgObj.large || "";
      }

      return "";
    })
    .filter((url): url is string => url.length > 0);

  res.json({
    document: {
      _id: docWithImages._id,
      name: String(docWithImages.name ?? ""),
    },
    images: validImages,
  });
};

const handleMkdir = async (
  client: MongoClient,
  operationParams: string[],
  res: NextApiResponse
): Promise<void> => {
  const [mkdirDb, mkdirCollection] = operationParams;

  if (!mkdirDb) {
    res.status(400).json({ error: 'Database name required' });
    return;
  }

  // MongoDB databases only exist while they have collections
  await client
    .db(mkdirDb)
    .createCollection(mkdirCollection || '_placeholder');

  res.json({ success: true });
};

const handleTest = async (
  client: MongoClient,
  res: NextApiResponse
): Promise<void> => {
  await client.db().admin().ping();
  res.json({ message: 'Connected to MongoDB', success: true });
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const { params } = req.query;
  const [operation, ...operationParams] = params as string[];

  const connectionString =
    (req.headers['x-mongodb-connection'] as string) || 'mongodb://localhost:27017';

  try {
    const client = await connectToMongoDB(connectionString);

    switch (operation) {
      case 'databases':
        await handleDatabases(client, connectionString, res);
        break;
      case 'collections':
        await handleCollections(client, operationParams, res);
        break;
      case 'documents':
        await handleDocuments(client, operationParams, req, res);
        break;
      case 'document':
        await handleDocument(client, operationParams, req, res);
        break;
      case 'images':
        await handleImages(client, operationParams, res);
        break;
      case 'mkdir':
        await handleMkdir(client, operationParams, res);
        break;
      case 'test':
        await handleTest(client, res);
        break;
      default:
        res.status(400).json({ error: 'Unknown operation' });
    }
  } catch (error) {
    console.error('MongoDB API Error:', error);
    res.status(500).json({
      details: error instanceof Error ? error.message : 'Unknown error',
      error: 'Database operation failed',
    });
  }
}
