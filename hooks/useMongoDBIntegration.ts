import { useCallback, useEffect, useState } from "react";
import { useFileSystem } from "contexts/fileSystem";
import { DESKTOP_PATH } from "utils/constants";

interface MongoDBConnection {
  alias: string;
  connectionString: string;
  isConnected: boolean;
}

interface MongoDBIntegrationState {
  connections: MongoDBConnection[];
  // eslint-disable-next-line unicorn/no-null -- null represents "no error" state
  error: string | null;
  isLoading: boolean;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export const useMongoDBIntegration = () => {
  const { rootFs, updateFolder } = useFileSystem();
  const [state, setState] = useState<MongoDBIntegrationState>({
    connections: [],
    error: null, // eslint-disable-line unicorn/no-null
    isLoading: false,
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
    // eslint-disable-next-line unicorn/no-null
    setState(prev => ({ ...prev, error: null, isLoading: true }));

    try {
      // Test the connection first
      const isValid = await testConnection(connectionString);
      if (!isValid) {
        setState(prev => ({
          ...prev,
          error: "Failed to connect to MongoDB. Please check your connection string.",
          isLoading: false,
        }));
        return;
      }

      // Import the MongoDB filesystem dynamically to avoid SSR issues
      const { Create } = await import("contexts/fileSystem/MongoDBFS");

      // eslint-disable-next-line @typescript-eslint/return-await, consistent-return
      return new Promise<void>((resolve, reject) => {
        Create({ connectionString }, (error, mongoFS) => {
          if (error || !mongoFS) {
            setState(prev => ({
              ...prev,
              error: `Failed to create MongoDB filesystem: ${error?.message || "Unknown error"}`,
              isLoading: false,
            }));
            reject(error instanceof Error ? error : new Error("Failed to create MongoDB filesystem"));
            return;
          }

          try {
            if (!rootFs?.mount) {
              throw new Error("File system is not ready yet");
            }

            // Create the Local folder on desktop and mount MongoDB FS inside it
            const localFolderPath = `${DESKTOP_PATH}/${alias}`;

            // Check if mount point already exists and unmount if necessary
            try {
              rootFs?.umount?.(localFolderPath);
            } catch {
              // Ignore unmount errors (mount point may not exist)
            }

            // The filesystem mounting will handle directory creation

            // Now mount the MongoDB filesystem at the Local folder path
            rootFs.mount(localFolderPath, mongoFS);

            const newConnection: MongoDBConnection = {
              alias,
              connectionString,
              isConnected: true,
            };

            setState(prev => {
              const updatedConnections = [
                ...prev.connections.filter(conn => conn.alias !== alias),
                newConnection,
              ];

              saveConnections(updatedConnections);

              return {
                ...prev,
                connections: updatedConnections,
                error: null, // eslint-disable-line unicorn/no-null
                isLoading: false,
              };
            });

            // Update the desktop folder to show the new MongoDB folder
            updateFolder(DESKTOP_PATH);
            resolve();
          } catch (mountError) {
            setState(prev => ({
              ...prev,
              error: `Failed to mount MongoDB filesystem: ${mountError instanceof Error ? mountError.message : String(mountError)}`,
              isLoading: false,
            }));
            reject(mountError instanceof Error ? mountError : new Error(String(mountError)));
          }
        });
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `Failed to load MongoDB filesystem: ${error instanceof Error ? error.message : String(error)}`,
        isLoading: false,
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
        error: `Failed to remove connection: ${error instanceof Error ? error.message : String(error)}`,
      }));
    }
  }, [rootFs, saveConnections, updateFolder]);

  // Seed connections from localStorage (read-only — useFileSystemContextState owns writes at startup)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("mongodbConnections");
      if (!raw) return;

      const parsed = JSON.parse(raw) as MongoDBConnection[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;

      setState(prev => ({
        ...prev,
        connections: parsed.map((c) => ({ ...c, isConnected: false })),
      }));
    } catch {
      // Ignore parse errors — useFileSystemContextState will normalize
    }
  }, []);

  // Sync isConnected state with what's actually mounted (global restore may have already mounted)
  useEffect(() => {
    if (state.connections.length === 0 || !rootFs) return;

    setState(prev => {
      let changed = false;
      const updated = prev.connections.map(conn => {
        const mountPath = `${DESKTOP_PATH}/${conn.alias}`;
        const isMounted = Boolean(rootFs?.mntMap?.[mountPath]);
        if (conn.isConnected !== isMounted) {
          changed = true;
          return { ...conn, isConnected: isMounted };
        }
        return conn;
      });
      return changed ? { ...prev, connections: updated } : prev;
    });
  }, [state.connections, rootFs]);

  return {
    ...state,
    addConnection,
    removeConnection,
    testConnection,
  };
};
