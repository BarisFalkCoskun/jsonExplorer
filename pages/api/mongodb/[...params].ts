import { NextApiRequest, NextApiResponse } from 'next';
import { MongoClient } from 'mongodb';

let cachedClient: MongoClient | null = null;

async function connectToMongoDB(connectionString: string): Promise<MongoClient> {
  if (cachedClient && cachedClient.readyState === 'connected') {
    return cachedClient;
  }

  const client = new MongoClient(connectionString, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  await client.connect();
  cachedClient = client;
  return client;
}

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
        const { databases } = await adminDb.listDatabases();
        res.json(databases.map((db: any) => db.name));
        break;

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
        const documents = await collection.find({}).toArray();
        res.json(documents);
        break;

      case 'document':
        const [dbName3, collectionName2, documentId] = operationParams;
        if (!dbName3 || !collectionName2 || !documentId) {
          return res.status(400).json({ error: 'Database, collection, and document ID required' });
        }

        const db3 = client.db(dbName3);
        const collection2 = db3.collection(collectionName2);

        if (req.method === 'GET') {
          // Find document by name or _id
          const doc = await collection2.findOne({
            $or: [
              { name: documentId },
              { _id: documentId }
            ]
          });
          if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
          }
          res.json(doc);
        } else if (req.method === 'PUT') {
          // Update document
          const updateDoc = req.body;
          const filter = updateDoc._id ? { _id: updateDoc._id } : { name: documentId };
          await collection2.replaceOne(filter, updateDoc, { upsert: true });
          res.json({ success: true });
        } else if (req.method === 'DELETE') {
          // Delete document
          const result = await collection2.deleteOne({
            $or: [
              { name: documentId },
              { _id: documentId }
            ]
          });
          res.json({ deletedCount: result.deletedCount });
        } else {
          res.status(405).json({ error: 'Method not allowed' });
        }
        break;

      case 'images':
        const [dbName4, collectionName3, documentId2] = operationParams;
        if (!dbName4 || !collectionName3 || !documentId2) {
          return res.status(400).json({ error: 'Database, collection, and document ID required' });
        }

        const db4 = client.db(dbName4);
        const collection3 = db4.collection(collectionName3);

        // Find document by name or _id
        const docWithImages = await collection3.findOne({
          $or: [
            { name: documentId2 },
            { _id: documentId2 }
          ]
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

        // Filter out invalid URLs and ensure they're strings
        const validImages = images.filter(img =>
          typeof img === 'string' && img.trim().length > 0
        );

        res.json({
          images: validImages,
          document: {
            _id: docWithImages._id,
            name: docWithImages.name
          }
        });
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