import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// Lazy connect: the URI is required only when the promise is actually awaited.
// (next build collects page data by importing route modules, so this module must
// not throw at import time when MONGODB_URI is only provided at runtime.)
const clientPromise: Promise<MongoClient> =
  global._mongoClientPromise ??
  (async () => {
    if (!uri) {
      throw new Error('MONGODB_URI is missing. Add it to .env.local');
    }
    const client = new MongoClient(uri);
    await client.connect();
    return client;
  })();

if (process.env.NODE_ENV !== 'production') {
  global._mongoClientPromise = clientPromise;
}

export default clientPromise;
