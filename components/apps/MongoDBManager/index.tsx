import { memo, useCallback } from 'react';
import MongoConnectionManager from 'components/system/Dialogs/MongoConnectionManager';
import useMongoDB from 'hooks/useMongoDB';
import { useProcesses } from 'contexts/process';
import mongoService from 'services/mongoService';

const MongoDBManager = () => {
  const { close } = useProcesses();

  // Initialize MongoDB integration only when this app is open
  const { connections } = useMongoDB();

  const handleClose = useCallback(() => {
    close("MongoDBManager");
  }, [close]);

  const handleConnectionsChange = useCallback((connections) => {
    // Connection changes are already handled by the service
    // This is just for logging
    console.log('MongoDB connections updated:', connections);
  }, []);

  return (
    <MongoConnectionManager
      isOpen={true}
      onClose={handleClose}
      onConnectionsChange={handleConnectionsChange}
    />
  );
};

export default memo(MongoDBManager);