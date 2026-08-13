const mongoose = require('mongoose');
const config = require('./env');

async function connectDb() {
  if (!config.mongoUri) {
    console.error('[db] MONGODB_URI is not set. Favorites, recent searches and alarms will be unavailable.');
    return null;
  }
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`[db] MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error('[db] MongoDB connection failed:', err.message);
    console.error('[db] Is MongoDB running? Try: docker compose up -d mongo');
    throw err;
  }
}

module.exports = { connectDb };
