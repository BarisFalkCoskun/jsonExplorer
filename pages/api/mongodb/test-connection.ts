import type { NextApiRequest, NextApiResponse } from 'next';
import { testConnection } from '../../../lib/mongodb';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { host, port, username, password, database } = req.body;

  // Build connection string
  let uri = 'mongodb://';

  if (username && password) {
    uri += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
  }

  uri += `${host}:${port}`;

  if (database) {
    uri += `/${database}`;
  }

  try {
    const isConnected = await testConnection(uri);

    if (isConnected) {
      res.status(200).json({
        connected: true,
        message: 'Successfully connected to MongoDB'
      });
    } else {
      res.status(400).json({
        connected: false,
        message: 'Failed to connect to MongoDB'
      });
    }
  } catch (error) {
    console.error('Connection test error:', error);
    res.status(500).json({
      connected: false,
      error: 'Internal server error'
    });
  }
}