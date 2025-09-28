import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoClient } from 'mongodb';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { host, port, username, password } = req.body;

  // Build connection string
  let uri = 'mongodb://';

  if (username && password) {
    uri += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
  }

  uri += `${host}:${port}`;

  let client: MongoClient | null = null;

  try {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();

    // List all databases
    const admin = client.db().admin();
    const { databases } = await admin.listDatabases();

    // For each database, get collections and sample documents
    const databasesWithDetails = await Promise.all(
      databases
        .filter(db => !['admin', 'local', 'config'].includes(db.name)) // Filter system databases
        .map(async (database) => {
          const db = client!.db(database.name);
          const collections = await db.listCollections().toArray();

          const collectionsWithDocuments = await Promise.all(
            collections.map(async (collection) => {
              // Get up to 10 sample documents from each collection
              const documents = await db.collection(collection.name)
                .find({})
                .limit(10)
                .toArray();

              return {
                name: collection.name,
                documents: documents.map(doc => ({
                  _id: doc._id.toString(),
                  name: doc.name || doc.title || doc._id.toString(),
                  images: doc.images || [],
                  oldImages: doc.oldImages || [],
                  ...doc
                }))
              };
            })
          );

          return {
            name: database.name,
            collections: collectionsWithDocuments
          };
        })
    );

    res.status(200).json({
      success: true,
      databases: databasesWithDetails
    });

  } catch (error) {
    console.error('Failed to list databases:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to connect to MongoDB'
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
}