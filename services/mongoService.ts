import { type MongoDatabase, type MongoCollection, type MongoDocument } from './types/mongoTypes';

export interface MongoConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  database?: string;
  url: string;
}

export interface MongoConnectionInfo {
  id: string;
  name: string;
  url: string;
  status: 'connected' | 'disconnected' | 'error';
  databases?: MongoDatabase[];
}

export interface MongoDatabase {
  name: string;
  collections: MongoCollection[];
}

export interface MongoCollection {
  name: string;
  documents: MongoDocument[];
}

export interface MongoDocument {
  _id: string;
  name?: string;
  images?: string[];
  oldImages?: string[];
  [key: string]: any;
}

class MongoService {
  private connections: Map<string, MongoConnectionInfo> = new Map();
  private configuredConnections: Map<string, MongoConnectionConfig> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private listeners: Set<(connections: MongoConnectionInfo[]) => void> = new Set();

  constructor() {
    // Only initialize in browser environment
    if (typeof window !== 'undefined') {
      // Add default local connection
      this.addConnection({
        id: 'local-default',
        name: 'Local MongoDB',
        host: 'localhost',
        port: 27017,
        url: 'mongodb://localhost:27017'
      });

      this.startConnectionPolling();
    }
  }

  // Start polling for MongoDB connections
  private startConnectionPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      await this.checkConnections();
    }, 15000); // Check every 15 seconds (reduced frequency)

    // Initial check after a short delay to prevent immediate re-renders
    setTimeout(() => {
      this.checkConnections();
    }, 2000);
  }

  // Check all configured connections
  private async checkConnections(): Promise<void> {
    const connectionsToCheck = Array.from(this.configuredConnections.values());
    let hasChanges = false;

    for (const config of connectionsToCheck) {
      try {
        const connectionInfo = await this.testConnection(config);
        const existingConnection = this.connections.get(config.id);

        // Update if status changed or it's a new connection
        if (!existingConnection || existingConnection.status !== connectionInfo.status) {
          this.connections.set(config.id, connectionInfo);
          hasChanges = true;
        }
      } catch (error) {
        console.warn(`Connection check failed for ${config.name}:`, error);

        // Mark as error if connection exists
        const existingConnection = this.connections.get(config.id);
        if (existingConnection && existingConnection.status !== 'error') {
          this.connections.set(config.id, {
            ...existingConnection,
            status: 'error'
          });
          hasChanges = true;
        }
      }
    }

    // Only notify listeners if there were actual changes
    if (hasChanges) {
      this.notifyListeners();
    }
  }

  // Test a specific connection configuration
  private async testConnection(config: MongoConnectionConfig): Promise<MongoConnectionInfo> {
    // Only run in browser environment
    if (typeof window === 'undefined') {
      return {
        id: config.id,
        name: config.name,
        url: config.url,
        status: 'error',
        databases: [],
      };
    }

    try {
      // Test connection via API
      const testResponse = await fetch('/api/mongodb/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          database: config.database,
        }),
      });

      const testResult = await testResponse.json();

      if (testResult.connected) {
        // If connected, fetch the databases
        const dbResponse = await fetch('/api/mongodb/list-databases', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
          }),
        });

        const dbResult = await dbResponse.json();

        return {
          id: config.id,
          name: config.name,
          url: config.url,
          status: 'connected',
          databases: dbResult.databases || [],
        };
      } else {
        return {
          id: config.id,
          name: config.name,
          url: config.url,
          status: 'error',
          databases: [],
        };
      }
    } catch (error) {
      console.error('Connection test error:', error);
      return {
        id: config.id,
        name: config.name,
        url: config.url,
        status: 'error',
        databases: [],
      };
    }
  }

  // Fetch real databases from MongoDB
  private async fetchDatabases(config: MongoConnectionConfig): Promise<MongoDatabase[]> {
    // Only run in browser environment
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const response = await fetch('/api/mongodb/list-databases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
        }),
      });

      const result = await response.json();
      return result.databases || [];
    } catch (error) {
      console.error('Failed to fetch databases:', error);
      return [];
    }
  }


  // Add a new connection configuration
  addConnection(config: MongoConnectionConfig): void {
    this.configuredConnections.set(config.id, config);
    // Immediately test the new connection
    this.testConnection(config).then(connectionInfo => {
      this.connections.set(config.id, connectionInfo);
      this.notifyListeners();
    });
  }

  // Remove a connection configuration
  removeConnection(id: string): void {
    this.configuredConnections.delete(id);
    this.connections.delete(id);
    this.notifyListeners();
  }

  // Update an existing connection configuration
  updateConnection(config: MongoConnectionConfig): void {
    this.configuredConnections.set(config.id, config);
    // Re-test the updated connection
    this.testConnection(config).then(connectionInfo => {
      this.connections.set(config.id, connectionInfo);
      this.notifyListeners();
    });
  }

  // Test a connection manually
  async testConnectionManually(config: MongoConnectionConfig): Promise<MongoConnectionInfo> {
    // Add to configured connections if not already there
    if (!this.configuredConnections.has(config.id)) {
      this.configuredConnections.set(config.id, config);
    }

    // Store the full config for future use
    const fullConfig = {
      ...config,
      username: config.username || undefined,
      password: config.password || undefined,
      database: config.database || undefined,
    };
    this.configuredConnections.set(config.id, fullConfig);

    const result = await this.testConnection(fullConfig);

    // Update stored connection
    this.connections.set(config.id, result);
    this.notifyListeners();

    return result;
  }

  // Get all active connections
  getConnections(): MongoConnectionInfo[] {
    return Array.from(this.connections.values());
  }

  // Get all configured connections
  getConfiguredConnections(): MongoConnectionConfig[] {
    return Array.from(this.configuredConnections.values());
  }

  // Add listener for connection changes
  addConnectionListener(listener: (connections: MongoConnectionInfo[]) => void): void {
    this.listeners.add(listener);
  }

  // Remove listener
  removeConnectionListener(listener: (connections: MongoConnectionInfo[]) => void): void {
    this.listeners.delete(listener);
  }

  // Notify all listeners of connection changes
  private notifyListeners(): void {
    const connections = this.getConnections();
    console.log('[MongoService] Notifying listeners:', connections.length, 'connections');
    this.listeners.forEach(listener => listener(connections));
  }

  // Clean up
  destroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.listeners.clear();
    this.connections.clear();
  }
}

// Singleton instance - only create in browser
let mongoServiceInstance: MongoService | null = null;

if (typeof window !== 'undefined') {
  mongoServiceInstance = new MongoService();
}

// Export a proxy that returns a stub on server-side
const mongoService = mongoServiceInstance || {
  addConnection: () => {},
  removeConnection: () => {},
  updateConnection: () => {},
  testConnectionManually: async () => ({
    id: '',
    name: '',
    url: '',
    status: 'error' as const,
    databases: [],
  }),
  getConnections: () => [],
  getConfiguredConnections: () => [],
  addConnectionListener: () => {},
  removeConnectionListener: () => {},
  destroy: () => {},
};

export { mongoService };
export default mongoService;