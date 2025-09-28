import { useEffect, useState, useCallback } from 'react';
import { useFileSystem } from 'contexts/fileSystem';
import mongoService, { type MongoConnectionInfo } from 'services/mongoService';
import { DESKTOP_PATH, FOLDER_ICON } from 'utils/constants';
import { join } from 'path';

export const useMongoDB = () => {
  const [connections, setConnections] = useState<MongoConnectionInfo[]>([]);
  const { mkdirRecursive, deletePath, exists, writeFile } = useFileSystem();

  // Handle connection changes
  const handleConnectionsChange = useCallback((newConnections: MongoConnectionInfo[]) => {
    console.log('[useMongoDB] Connections changed:', newConnections);
    setConnections(newConnections);
  }, []);

  // Create virtual folder structure for MongoDB databases
  const createDatabaseFolders = useCallback(async (connectionInfo: MongoConnectionInfo) => {
    console.log('[useMongoDB] Creating folders for connection:', connectionInfo.name, connectionInfo.status);

    if (!connectionInfo.databases || connectionInfo.status !== 'connected') {
      console.log('[useMongoDB] Skipping folder creation - not connected or no databases');
      return;
    }

    // Use the connection name for the folder
    const sanitizedName = connectionInfo.name.replace(/[^a-zA-Z0-9\s-_]/g, '').replace(/\s+/g, '_');
    const connectionFolderPath = join(DESKTOP_PATH, sanitizedName);

    try {
      // Create main connection folder (e.g., "Local_MongoDB")
      if (!(await exists(connectionFolderPath))) {
        await mkdirRecursive(connectionFolderPath);
      }

      // Create database folders
      for (const database of connectionInfo.databases) {
        const databasePath = join(connectionFolderPath, database.name);

        if (!(await exists(databasePath))) {
          await mkdirRecursive(databasePath);
        }

        // Create collection folders
        for (const collection of database.collections) {
          const collectionPath = join(databasePath, collection.name);

          if (!(await exists(collectionPath))) {
            await mkdirRecursive(collectionPath);
          }

          // Create document "files"
          for (const document of collection.documents) {
            // Sanitize filename to be filesystem-safe
            const rawName = document.name || document._id;
            const fileName = rawName
              .replace(/[^a-zA-Z0-9\s\-_.]/g, '') // Remove special characters except spaces, hyphens, underscores, dots
              .replace(/\s+/g, '_') // Replace spaces with underscores
              .replace(/\.+/g, '.') // Collapse multiple dots
              .replace(/^[._]+|[._]+$/g, '') // Remove leading/trailing dots and underscores
              .slice(0, 200); // Limit length to prevent filesystem issues

            // Ensure we have a valid filename
            const safeFileName = fileName || document._id.toString();
            const documentPath = join(collectionPath, `${safeFileName}.json`);

            if (!(await exists(documentPath))) {
              // Create JSON file with document data
              const fileContent = JSON.stringify(document, null, 2);
              // Use Buffer.from for BrowserFS compatibility
              const buffer = Buffer.from(fileContent, 'utf8');
              await writeFile(documentPath, buffer);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to create folders for ${connectionInfo.name}:`, error);
    }
  }, [mkdirRecursive, deletePath, exists, writeFile]);

  // Remove connection folders when database disconnects
  const removeConnectionFolders = useCallback(async (connectionName: string) => {
    const sanitizedName = connectionName.replace(/[^a-zA-Z0-9\s-_]/g, '').replace(/\s+/g, '_');
    const connectionFolderPath = join(DESKTOP_PATH, sanitizedName);

    try {
      if (await exists(connectionFolderPath)) {
        await deletePath(connectionFolderPath);
      }
    } catch (error) {
      // Silently handle errors to prevent console spam
    }
  }, [deletePath, exists]);

  // Track previous connections to detect actual changes
  const [previousConnections, setPreviousConnections] = useState<string>('');

  // Update folder structure when connections change
  useEffect(() => {
    const connectionString = JSON.stringify(connections.map(c => ({ id: c.id, name: c.name, status: c.status })));

    // Only update if connections actually changed
    if (connectionString !== previousConnections) {
      setPreviousConnections(connectionString);

      const updateFolders = async () => {
        // Create/update folders for connected databases
        for (const connection of connections) {
          if (connection.status === 'connected') {
            await createDatabaseFolders(connection);
          } else {
            await removeConnectionFolders(connection.name);
          }
        }
      };

      if (connections.length > 0) {
        updateFolders();
      }
    }
  }, [connections, createDatabaseFolders, removeConnectionFolders, previousConnections]);

  // Set up connection listener
  useEffect(() => {
    mongoService.addConnectionListener(handleConnectionsChange);

    return () => {
      mongoService.removeConnectionListener(handleConnectionsChange);
    };
  }, [handleConnectionsChange]);

  return {
    connections,
    refreshConnections: () => mongoService.getConnections(),
  };
};

export default useMongoDB;