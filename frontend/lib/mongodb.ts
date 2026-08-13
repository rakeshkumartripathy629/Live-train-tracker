import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is missing. Add it to .env.local');
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const client = new MongoClient(uri);

const clientPromise: Promise<MongoClient> =
  global._mongoClientPromise ?? client.connect();

if (process.env.NODE_ENV !== 'production') {
  global._mongoClientPromise = clientPromise;
}

export default clientPromise;
