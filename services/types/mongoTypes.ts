export interface MongoDocument {
  _id: string;
  name?: string;
  images?: string[];
  oldImages?: string[];
  [key: string]: any;
}

export interface MongoCollection {
  name: string;
  documents: MongoDocument[];
}

export interface MongoDatabase {
  name: string;
  collections: MongoCollection[];
}

export interface MongoConnectionInfo {
  name: string;
  url: string;
  status: 'connected' | 'disconnected' | 'error';
  databases?: MongoDatabase[];
}