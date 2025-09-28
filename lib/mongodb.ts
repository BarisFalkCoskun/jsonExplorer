import { MongoClient, Db } from 'mongodb';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(uri: string) {
  // If we have a cached connection, use it
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  try {
    // Create a new MongoDB client
    const client = new MongoClient(uri);

    // Connect to MongoDB
    await client.connect();

    // Select the database (extract from URI or use default)
    const dbName = uri.split('/').pop()?.split('?')[0] || 'test';
    const db = client.db(dbName);

    // Cache the connection
    cachedClient = client;
    cachedDb = db;

    return { client, db };
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

export async function testConnection(uri: string): Promise<boolean> {
  try {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000, // 5 second timeout
    });

    await client.connect();
    await client.db().admin().ping();
    await client.close();

    return true;
  } catch (error) {
    console.error('MongoDB connection test failed:', error);
    return false;
  }
}