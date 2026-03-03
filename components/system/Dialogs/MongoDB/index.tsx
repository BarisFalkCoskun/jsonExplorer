import { useState, useCallback , type FC } from "react";
import styled from "styled-components";
import Button from "styles/common/Button";
import { useMongoDBIntegration } from "hooks/useMongoDBIntegration";
import { type ComponentProcessProps } from "components/system/Apps/RenderComponent";
import { useProcesses } from "contexts/process";
import { maskConnectionString } from "utils/functions";

const StyledMongoDBDialog = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  min-width: 400px;

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;

    label {
      font-weight: 500;
      font-size: 14px;
    }

    input {
      padding: 8px 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;

      &:focus {
        outline: none;
        border-color: #0078d4;
        box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.2);
      }
    }
  }

  .buttons {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 16px;
  }

  .connections-list {
    border: 1px solid #ccc;
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;

    .connection-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      border-bottom: 1px solid #eee;

      &:last-child {
        border-bottom: none;
      }

      .connection-info {
        flex: 1;

        .alias {
          font-weight: 500;
          margin-bottom: 4px;
        }

        .connection-string {
          font-size: 12px;
          color: #666;
          font-family: monospace;
        }

        .status {
          font-size: 12px;
          margin-top: 4px;

          &.connected {
            color: #107c10;
          }

          &.disconnected {
            color: #d13438;
          }
        }
      }

      .connection-actions {
        display: flex;
        gap: 8px;
      }
    }
  }

  .error {
    color: #d13438;
    font-size: 14px;
    background: #fef7f7;
    border: 1px solid #f1aeb5;
    border-radius: 4px;
    padding: 8px 12px;
  }

  .loading {
    color: #0078d4;
    font-size: 14px;
  }

  .empty-state {
    text-align: center;
    color: #666;
    font-style: italic;
    padding: 20px;
  }
`;

const MongoDBDialog: FC<ComponentProcessProps> = ({ id }) => {
  const { closeWithTransition } = useProcesses();
  const {
    connections,
    isLoading,
    error,
    addConnection,
    removeConnection,
    testConnection,
  } = useMongoDBIntegration();

  const [formData, setFormData] = useState({
    alias: "",
    connectionString: "mongodb://localhost:27017",
  });

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; tested: boolean }>({
    success: false,
    tested: false,
  });

  const handleInputChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setTestResult({ success: false, tested: false });
  }, []);

  const handleTestConnection = useCallback(async () => {
    if (!formData.connectionString.trim()) return;

    setTestingConnection(true);
    try {
      const success = await testConnection(formData.connectionString);
      setTestResult({ success, tested: true });
    } catch {
      setTestResult({ success: false, tested: true });
    } finally {
      setTestingConnection(false);
    }
  }, [formData.connectionString, testConnection]);

  const handleAddConnection = useCallback(async () => {
    if (!formData.connectionString.trim() || !formData.alias.trim()) return;

    try {
      await addConnection(formData.connectionString, formData.alias);
      setFormData({ alias: "", connectionString: "mongodb://localhost:27017" });
      setTestResult({ success: false, tested: false });
    } catch {
      // Error handling is done in the hook
    }
  }, [formData, addConnection]);

  const isFormValid = formData.connectionString.trim() && formData.alias.trim() && (!testResult.tested || testResult.success);

  return (
    <StyledMongoDBDialog>
      <h3>MongoDB Integration</h3>

      <div className="form-group">
        <label htmlFor="connectionString">Connection String:</label>
        <input
          id="connectionString"
          onChange={(e) => handleInputChange("connectionString", e.target.value)}
          placeholder="mongodb://localhost:27017"
          type="text"
          value={formData.connectionString}
        />
      </div>

      <div className="form-group">
        <label htmlFor="alias">Display Name:</label>
        <input
          id="alias"
          onChange={(e) => handleInputChange("alias", e.target.value)}
          placeholder="My MongoDB"
          type="text"
          value={formData.alias}
        />
      </div>

      {testResult.tested && (
        <div className={testResult.success ? "success" : "error"}>
          {testResult.success ? "✓ Connection successful" : "✗ Connection failed"}
        </div>
      )}

      <div className="buttons">
        <Button
          disabled={!formData.connectionString.trim() || testingConnection}
          onClick={handleTestConnection}
        >
          {testingConnection ? "Testing..." : "Test Connection"}
        </Button>
        <Button
          disabled={!isFormValid || isLoading}
          onClick={handleAddConnection}
        >
          {isLoading ? "Adding..." : "Add Connection"}
        </Button>
      </div>

      {error && (
        <div className="error">{error}</div>
      )}

      <h4>Active Connections</h4>
      <div className="connections-list">
        {connections.length === 0 ? (
          <div className="empty-state">No MongoDB connections configured</div>
        ) : (
          connections.map((connection) => (
            <div key={connection.alias} className="connection-item">
              <div className="connection-info">
                <div className="alias">{connection.alias}</div>
                <div className="connection-string">{maskConnectionString(connection.connectionString)}</div>
                <div className={`status ${connection.isConnected ? "connected" : "disconnected"}`}>
                  {connection.isConnected ? "Connected" : "Disconnected"}
                </div>
              </div>
              <div className="connection-actions">
                <Button onClick={() => removeConnection(connection.alias)}>
                  Remove
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="buttons">
        <Button onClick={() => closeWithTransition(id)}>Close</Button>
      </div>
    </StyledMongoDBDialog>
  );
};

export default MongoDBDialog;
