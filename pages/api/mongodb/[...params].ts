import { NextApiRequest, NextApiResponse } from 'next';
import { MongoClient, ObjectId } from 'mongodb';

type MongoClientCacheEntry = {
  client?: MongoClient;
  connecting?: Promise<MongoClient>;
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
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
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
}

const extractDatabaseNameFromConnectionString = (
  connectionString: string
): string | undefined => {
  const protocolMatch = connectionString.match(/^mongodb(?:\+srv)?:\/\//i);

  if (!protocolMatch) {
    return undefined;
  }

  const connectionWithoutProtocol = connectionString.slice(
    protocolMatch[0].length
  );
  const firstPathSlash = connectionWithoutProtocol.indexOf("/");

  if (firstPathSlash < 0) {
    return undefined;
  }

  const pathAndQuery = connectionWithoutProtocol.slice(firstPathSlash + 1);
  const [rawDatabaseName = ""] = pathAndQuery.split("?");
  const databaseName = decodeURIComponent(rawDatabaseName).trim();

  return databaseName || undefined;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { params } = req.query;
  const [operation, ...operationParams] = params as string[];

  // Get connection string from headers or use default
  const connectionString = req.headers['x-mongodb-connection'] as string || 'mongodb://localhost:27017';

  try {
    const client = await connectToMongoDB(connectionString);

    switch (operation) {
      case 'databases':
        const adminDb = client.db().admin();
        try {
          const { databases } = await adminDb.listDatabases({
            authorizedDatabases: true,
            nameOnly: true,
          });

          const names = databases
            .map((db: any) => db?.name)
            .filter(Boolean) as string[];

          if (names.length > 0) {
            return res.json(names);
          }
        } catch (listDatabasesError) {
          const fallbackDatabaseName =
            extractDatabaseNameFromConnectionString(connectionString);

          if (fallbackDatabaseName) {
            return res.json([fallbackDatabaseName]);
          }

          throw listDatabasesError;
        }

        // Some clusters/users return no database list. Fall back to URI db.
        {
          const fallbackDatabaseName =
            extractDatabaseNameFromConnectionString(connectionString);
          return res.json(
            fallbackDatabaseName ? [fallbackDatabaseName] : []
          );
        }

      case 'collections':
        const [dbName] = operationParams;
        if (!dbName) {
          return res.status(400).json({ error: 'Database name required' });
        }
        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        res.json(collections.map((col: any) => col.name));
        break;

      case 'documents':
        const [dbName2, collectionName] = operationParams;
        if (!dbName2 || !collectionName) {
          return res.status(400).json({ error: 'Database and collection name required' });
        }
        const db2 = client.db(dbName2);
        const collection = db2.collection(collectionName);
        const metaOnly = req.query.meta === '1' || req.query.meta === 'true';
        let filter = {};
        if (typeof req.query.filter === 'string') {
          try {
            filter = JSON.parse(req.query.filter);
          } catch {
            return res.status(400).json({ error: 'Invalid filter JSON' });
          }
        }
        const documents = await collection.find(
          filter,
          metaOnly ? { projection: { _id: 1, name: 1, category: 1, dismissed: 1 } } : undefined
        ).sort({ name: 1 }).toArray();
        res.json(documents);
        break;

      case 'document':
        const [dbName3, collectionName2, ...documentIdParts] = operationParams;
        const documentId = documentIdParts.join('/');
        if (!dbName3 || !collectionName2 || !documentId) {
          return res.status(400).json({ error: 'Database, collection, and document ID required' });
        }

        const db3 = client.db(dbName3);
        const collection2 = db3.collection(collectionName2);

        if (req.method === 'GET') {
          // Find document by name or _id
          const doc = await collection2.findOne({
            $or: getDocumentFilters(documentId),
          });
          if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
          }
          res.json(doc);
        } else if (req.method === 'PATCH') {
          // Partial update: $set or $unset fields
          const updates = req.body;
          const setFields: Record<string, any> = {};
          const unsetFields: Record<string, string> = {};

          for (const [field, value] of Object.entries(updates)) {
            if (value === null) {
              unsetFields[field] = "";
            } else {
              setFields[field] = value;
            }
          }

          const updateOps: Record<string, any> = {};
          if (Object.keys(setFields).length > 0) updateOps.$set = setFields;
          if (Object.keys(unsetFields).length > 0) updateOps.$unset = unsetFields;

          const result = await collection2.updateOne(
            { $or: getDocumentFilters(documentId) },
            updateOps
          );
          res.json({ modifiedCount: result.modifiedCount });
        } else if (req.method === 'PUT') {
          // Update document
          const updateDoc = req.body;
          const filter = updateDoc._id ? { _id: updateDoc._id } : { name: documentId };
          await collection2.replaceOne(filter, updateDoc, { upsert: true });
          res.json({ success: true });
        } else if (req.method === 'DELETE') {
          // Delete document
          const result = await collection2.deleteOne({
            $or: getDocumentFilters(documentId),
          });
          res.json({ deletedCount: result.deletedCount });
        } else {
          res.status(405).json({ error: 'Method not allowed' });
        }
        break;

      case 'images':
        const [dbName4, collectionName3, ...documentIdParts2] = operationParams;
        const documentId2 = documentIdParts2.join('/');
        if (!dbName4 || !collectionName3 || !documentId2) {
          return res.status(400).json({ error: 'Database, collection, and document ID required' });
        }

        const db4 = client.db(dbName4);
        const collection3 = db4.collection(collectionName3);

        // Find document by name or _id
        const docWithImages = await collection3.findOne({
          $or: getDocumentFilters(documentId2),
        });

        if (!docWithImages) {
          return res.status(404).json({ error: 'Document not found' });
        }

        // Combine images from both 'images' and 'oldImages' arrays
        const images = [];
        if (Array.isArray(docWithImages.images)) {
          images.push(...docWithImages.images);
        }
        if (Array.isArray(docWithImages.oldImages)) {
          images.push(...docWithImages.oldImages);
        }

        // Extract image URLs - images can be strings or objects with small/medium/large
        const validImages = images
          .map(img => {
            if (typeof img === 'string' && img.trim().length > 0) {
              return img.trim();
            }
            if (img && typeof img === 'object') {
              // Prefer medium, then small, then large
              return img.medium || img.small || img.large || null;
            }
            return null;
          })
          .filter((url): url is string => url !== null);

        res.json({
          images: validImages,
          document: {
            _id: docWithImages._id,
            name: docWithImages.name
          }
        });
        break;

      case 'mkdir':
        const [mkdirDb, mkdirCollection] = operationParams;
        if (!mkdirDb) {
          return res.status(400).json({ error: 'Database name required' });
        }
        if (mkdirCollection) {
          // Create collection
          await client.db(mkdirDb).createCollection(mkdirCollection);
        } else {
          // Create database by creating a placeholder collection
          // MongoDB databases only exist while they have collections
          await client.db(mkdirDb).createCollection('_placeholder');
        }
        res.json({ success: true });
        break;

      case 'test':
        // Test connection
        await client.db().admin().ping();
        res.json({ success: true, message: 'Connected to MongoDB' });
        break;

      default:
        res.status(400).json({ error: 'Unknown operation' });
    }
  } catch (error) {
    console.error('MongoDB API Error:', error);
    res.status(500).json({
      error: 'Database operation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
