import { useCallback, useEffect, useState } from "react";
import { useFileSystem } from "contexts/fileSystem";
import { DESKTOP_PATH } from "utils/constants";

interface MongoDBConnection {
  connectionString: string;
  alias: string;
  isConnected: boolean;
}

interface MongoDBIntegrationState {
  connections: MongoDBConnection[];
  isLoading: boolean;
  error: string | null;
}

export const useMongoDBIntegration = () => {
  const { rootFs, updateFolder } = useFileSystem();
  const [state, setState] = useState<MongoDBIntegrationState>({
    connections: [],
    isLoading: false,
    error: null,
  });

  // Save connections to localStorage
  const saveConnections = useCallback((connections: MongoDBConnection[]) => {
    localStorage.setItem("mongodbConnections", JSON.stringify(connections));
  }, []);

  // Test connection to MongoDB
  const testConnection = useCallback(async (connectionString: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/mongodb/test', {
        headers: {
          'x-mongodb-connection': connectionString,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const addConnection = useCallback(async (connectionString: string, alias: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Test the connection first
      const isValid = await testConnection(connectionString);
      if (!isValid) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: "Failed to connect to MongoDB. Please check your connection string.",
        }));
        return;
      }

      // Import the MongoDB filesystem dynamically to avoid SSR issues
      const { Create } = await import("contexts/fileSystem/MongoDBFS");

      return new Promise<void>((resolve, reject) => {
        Create({ connectionString }, (error, mongoFS) => {
          if (error || !mongoFS) {
            setState(prev => ({
              ...prev,
              isLoading: false,
              error: `Failed to create MongoDB filesystem: ${error?.message || "Unknown error"}`,
            }));
            reject(error);
            return;
          }

          try {
            // Create the Local folder on desktop and mount MongoDB FS inside it
            const localFolderPath = `${DESKTOP_PATH}/${alias}`;

            // Check if mount point already exists and unmount if necessary
            try {
              rootFs?.umount?.(localFolderPath);
            } catch (unmountError) {
              // Ignore unmount errors (mount point may not exist)
            }

            // The filesystem mounting will handle directory creation

            // Now mount the MongoDB filesystem at the Local folder path
            rootFs?.mount?.(localFolderPath, mongoFS);

            const newConnection: MongoDBConnection = {
              connectionString,
              alias,
              isConnected: true,
            };

            setState(prev => {
              const updatedConnections = [...prev.connections, newConnection];
              saveConnections(updatedConnections);
              return {
                ...prev,
                connections: updatedConnections,
                isLoading: false,
                error: null,
              };
            });

            // Update the desktop folder to show the new MongoDB folder
            updateFolder(DESKTOP_PATH);
            resolve();
          } catch (mountError) {
            setState(prev => ({
              ...prev,
              isLoading: false,
              error: `Failed to mount MongoDB filesystem: ${mountError}`,
            }));
            reject(mountError);
          }
        });
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Failed to load MongoDB filesystem: ${error}`,
      }));
      throw error;
    }
  }, [rootFs, saveConnections, updateFolder, testConnection]);

  const removeConnection = useCallback((alias: string) => {
    try {
      // Unmount the filesystem
      const mountPath = `${DESKTOP_PATH}/${alias}`;
      rootFs?.umount?.(mountPath);

      setState(prev => {
        const updatedConnections = prev.connections.filter(conn => conn.alias !== alias);
        saveConnections(updatedConnections);
        return {
          ...prev,
          connections: updatedConnections,
        };
      });

      // Update the desktop folder to remove the MongoDB folder
      updateFolder(DESKTOP_PATH);
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `Failed to remove connection: ${error}`,
      }));
    }
  }, [rootFs, saveConnections, updateFolder]);

  // Load saved connections from localStorage
  useEffect(() => {
    const savedConnections = localStorage.getItem("mongodbConnections");
    if (savedConnections) {
      try {
        const connections = JSON.parse(savedConnections);
        setState(prev => ({ ...prev, connections }));
      } catch (error) {
        console.error("Failed to load MongoDB connections:", error);
      }
    } else {
      // Add a default demo connection for first-time users
      const demoConnection: MongoDBConnection = {
        connectionString: "mongodb://localhost:27017",
        alias: "Local",
        isConnected: false,
      };
      setState(prev => ({ ...prev, connections: [demoConnection] }));
      saveConnections([demoConnection]);
    }
  }, [saveConnections]);

  // Restore connections on mount
  useEffect(() => {
    const restoreConnections = async () => {
      for (const connection of state.connections) {
        if (!connection.isConnected) {
          try {
            await addConnection(connection.connectionString, connection.alias);
          } catch (error) {
            console.error(`Failed to restore connection ${connection.alias}:`, error);
          }
        }
      }
    };

    if (state.connections.length > 0 && rootFs) {
      restoreConnections();
    }
  }, [state.connections, rootFs, addConnection]); // Run when connections or rootFs change

  return {
    ...state,
    addConnection,
    removeConnection,
    testConnection,
  };
};