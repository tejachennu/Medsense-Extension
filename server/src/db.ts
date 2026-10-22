import mongoose from 'mongoose';
import { config } from './config.js';

let bucket: mongoose.mongo.GridFSBucket | undefined;

export async function connectDb(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: 'pages' });
  console.log('MongoDB connected');
}

// Document page images live in GridFS so a single case is never capped by the 16 MB document limit.
export function pages(): mongoose.mongo.GridFSBucket {
  if (!bucket) throw new Error('Database not connected');
  return bucket;
}
