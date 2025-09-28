import { memo, useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import Button from 'styles/common/Button';
import mongoService from 'services/mongoService';

const DialogOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const DialogContent = styled.div`
  background: #2b2b2b;
  border: 2px solid #444;
  border-radius: 8px;
  width: 480px;
  max-height: 600px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  color: #ffffff;
`;

const DialogHeader = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid #444;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #ffffff;
  }
`;

const CloseButton = styled(Button)`
  background: none;
  border: none;
  font-size: 18px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.text};

  &:hover {
    background: ${({ theme }) => theme.colors.selectionHighlight};
  }
`;

const DialogBody = styled.div`
  padding: 20px;
  overflow-y: auto;
  flex: 1;
`;

const FormGroup = styled.div`
  margin-bottom: 16px;

  label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    font-size: 13px;
    color: #ffffff;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #555;
  border-radius: 4px;
  background: #1a1a1a;
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: #0078d4;
    background: #222;
  }

  &::placeholder {
    color: #888;
  }
`;

const ConnectionList = styled.div`
  margin-bottom: 20px;
`;

const ConnectionItem = styled.div<{ $connected?: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  margin-bottom: 8px;
  background: ${({ theme, $connected }) =>
    $connected ? theme.colors.selectionHighlight : theme.colors.window};
`;

const ConnectionInfo = styled.div`
  flex: 1;

  .name {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 2px;
  }

  .url {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textSecondary};
    font-family: monospace;
  }

  .status {
    font-size: 11px;
    margin-top: 2px;

    &.connected { color: #4ade80; }
    &.disconnected { color: #f87171; }
    &.error { color: #fb923c; }
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 8px;
`;

const SmallButton = styled(Button)`
  padding: 4px 8px;
  font-size: 12px;
  height: auto;
  background: #333;
  border: 1px solid #555;
  color: #fff;

  &:hover {
    background: #444;
    border-color: #666;
  }
`;

const AddConnectionForm = styled.div`
  border-top: 1px solid #444;
  padding-top: 20px;
  margin-top: 16px;
`;

const DialogFooter = styled.div`
  padding: 16px 20px;
  border-top: 1px solid #444;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
`;

const ActionButton = styled(Button)`
  padding: 8px 16px;
  font-size: 13px;
  background: #0078d4;
  border: 1px solid #106ebe;
  color: #fff;

  &:hover {
    background: #106ebe;
    border-color: #005a9e;
  }

  &:first-child {
    background: #107c10;
    border-color: #0e6b0e;

    &:hover {
      background: #0e6b0e;
      border-color: #0c5a0c;
    }
  }
`;

interface Connection {
  id: string;
  name: string;
  url: string;
  host: string;
  port: number;
  status: 'connected' | 'disconnected' | 'error';
}

interface MongoConnectionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectionsChange: (connections: Connection[]) => void;
}

const MongoConnectionManager = ({ isOpen, onClose, onConnectionsChange }: MongoConnectionManagerProps) => {
  const [connections, setConnections] = useState<Connection[]>([]);

  const [newConnection, setNewConnection] = useState({
    name: '',
    host: 'localhost',
    port: '27017',
    username: '',
    password: '',
    database: ''
  });

  const [editingId, setEditingId] = useState<string | null>(null);

  // Parse connection string to extract components
  const parseConnectionString = useCallback((url: string) => {
    try {
      const mongoUrl = new URL(url);
      return {
        host: mongoUrl.hostname || 'localhost',
        port: parseInt(mongoUrl.port) || 27017,
        username: mongoUrl.username || '',
        password: mongoUrl.password || '',
        database: mongoUrl.pathname.slice(1) || ''
      };
    } catch {
      return null;
    }
  }, []);

  // Build connection string from components
  const buildConnectionString = useCallback((host: string, port: string, username?: string, password?: string, database?: string) => {
    let url = 'mongodb://';

    if (username && password) {
      url += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
    }

    url += `${host}:${port}`;

    if (database) {
      url += `/${database}`;
    }

    return url;
  }, []);

  const handleAddConnection = useCallback(() => {
    if (!newConnection.name.trim() || !newConnection.host.trim()) {
      return;
    }

    const connectionString = buildConnectionString(
      newConnection.host,
      newConnection.port,
      newConnection.username,
      newConnection.password,
      newConnection.database
    );

    const connectionId = `conn-${Date.now()}`;
    const connection: Connection = {
      id: connectionId,
      name: newConnection.name.trim(),
      url: connectionString,
      host: newConnection.host,
      port: parseInt(newConnection.port) || 27017,
      status: 'disconnected'
    };

    // Add to MongoDB service
    mongoService.addConnection({
      id: connectionId,
      name: newConnection.name.trim(),
      host: newConnection.host,
      port: parseInt(newConnection.port) || 27017,
      url: connectionString,
      username: newConnection.username,
      password: newConnection.password,
      database: newConnection.database
    });

    const updatedConnections = [...connections, connection];
    setConnections(updatedConnections);
    onConnectionsChange(updatedConnections);

    // Reset form
    setNewConnection({
      name: '',
      host: 'localhost',
      port: '27017',
      username: '',
      password: '',
      database: ''
    });
  }, [connections, newConnection, buildConnectionString, onConnectionsChange]);

  const handleDeleteConnection = useCallback((id: string) => {
    // Remove from MongoDB service
    mongoService.removeConnection(id);

    const updatedConnections = connections.filter(conn => conn.id !== id);
    setConnections(updatedConnections);
    onConnectionsChange(updatedConnections);
  }, [connections, onConnectionsChange]);

  const handleTestConnection = useCallback(async (connection: Connection) => {
    // Update status to testing
    const updatedConnections = connections.map(conn =>
      conn.id === connection.id ? { ...conn, status: 'disconnected' as const } : conn
    );
    setConnections(updatedConnections);

    try {
      // Test connection via MongoDB service
      const result = await mongoService.testConnectionManually({
        id: connection.id,
        name: connection.name,
        host: connection.host,
        port: connection.port,
        url: connection.url
      });

      const finalConnections = connections.map(conn =>
        conn.id === connection.id ? { ...conn, status: result.status } : conn
      );

      setConnections(finalConnections);
      onConnectionsChange(finalConnections);
    } catch {
      const errorConnections = connections.map(conn =>
        conn.id === connection.id ? { ...conn, status: 'error' as const } : conn
      );
      setConnections(errorConnections);
      onConnectionsChange(errorConnections);
    }
  }, [connections, onConnectionsChange]);

  // Load connections from MongoDB service on mount
  useEffect(() => {
    const activeConnections = mongoService.getConnections();
    const formattedConnections = activeConnections.map(conn => ({
      id: conn.id,
      name: conn.name,
      url: conn.url,
      host: conn.url.includes('localhost') ? 'localhost' : conn.url.split('@')[1]?.split(':')[0] || 'localhost',
      port: parseInt(conn.url.match(/:(\d+)/)?.[1] || '27017'),
      status: conn.status
    }));
    setConnections(formattedConnections);
  }, []);

  // Listen to connection changes from MongoDB service
  useEffect(() => {
    const handleServiceConnectionsChange = (serviceConnections) => {
      const formattedConnections = serviceConnections.map(conn => ({
        id: conn.id,
        name: conn.name,
        url: conn.url,
        host: conn.url.includes('localhost') ? 'localhost' : conn.url.split('@')[1]?.split(':')[0] || 'localhost',
        port: parseInt(conn.url.match(/:(\d+)/)?.[1] || '27017'),
        status: conn.status
      }));
      setConnections(formattedConnections);
      onConnectionsChange(formattedConnections);
    };

    mongoService.addConnectionListener(handleServiceConnectionsChange);

    return () => {
      mongoService.removeConnectionListener(handleServiceConnectionsChange);
    };
  }, [onConnectionsChange]);

  if (!isOpen) return null;

  return (
    <DialogOverlay onClick={onClose}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <h2>MongoDB Connection Manager</h2>
          <CloseButton onClick={onClose}>×</CloseButton>
        </DialogHeader>

        <DialogBody>
          <ConnectionList>
            <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 14 }}>Saved Connections</h3>

            {connections.map((connection) => (
              <ConnectionItem key={connection.id} $connected={connection.status === 'connected'}>
                <ConnectionInfo>
                  <div className="name">{connection.name}</div>
                  <div className="url">{connection.url}</div>
                  <div className={`status ${connection.status}`}>
                    Status: {connection.status}
                  </div>
                </ConnectionInfo>
                <ButtonGroup>
                  <SmallButton onClick={() => handleTestConnection(connection)}>
                    Test
                  </SmallButton>
                  <SmallButton onClick={() => handleDeleteConnection(connection.id)}>
                    Delete
                  </SmallButton>
                </ButtonGroup>
              </ConnectionItem>
            ))}
          </ConnectionList>

          <AddConnectionForm>
            <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 14 }}>Add New Connection</h3>

            <FormGroup>
              <label>Connection Name</label>
              <Input
                type="text"
                placeholder="e.g., Production DB, Local Test"
                value={newConnection.name}
                onChange={(e) => setNewConnection({ ...newConnection, name: e.target.value })}
              />
            </FormGroup>

            <div style={{ display: 'flex', gap: 12 }}>
              <FormGroup style={{ flex: 2 }}>
                <label>Host</label>
                <Input
                  type="text"
                  placeholder="localhost"
                  value={newConnection.host}
                  onChange={(e) => setNewConnection({ ...newConnection, host: e.target.value })}
                />
              </FormGroup>

              <FormGroup style={{ flex: 1 }}>
                <label>Port</label>
                <Input
                  type="number"
                  placeholder="27017"
                  value={newConnection.port}
                  onChange={(e) => setNewConnection({ ...newConnection, port: e.target.value })}
                />
              </FormGroup>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <FormGroup style={{ flex: 1 }}>
                <label>Username (optional)</label>
                <Input
                  type="text"
                  placeholder="username"
                  value={newConnection.username}
                  onChange={(e) => setNewConnection({ ...newConnection, username: e.target.value })}
                />
              </FormGroup>

              <FormGroup style={{ flex: 1 }}>
                <label>Password (optional)</label>
                <Input
                  type="password"
                  placeholder="password"
                  value={newConnection.password}
                  onChange={(e) => setNewConnection({ ...newConnection, password: e.target.value })}
                />
              </FormGroup>
            </div>

            <FormGroup>
              <label>Database (optional)</label>
              <Input
                type="text"
                placeholder="database name"
                value={newConnection.database}
                onChange={(e) => setNewConnection({ ...newConnection, database: e.target.value })}
              />
            </FormGroup>
          </AddConnectionForm>
        </DialogBody>

        <DialogFooter>
          <ActionButton onClick={handleAddConnection}>
            Add Connection
          </ActionButton>
          <ActionButton onClick={onClose}>
            Close
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </DialogOverlay>
  );
};

export default memo(MongoConnectionManager);