import { Queue, Worker } from 'bullmq';
import { syncInbox } from '../utils/imapClient';
import IORedis from 'ioredis';


const connection = new IORedis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
  }
);


connection.on('connect', () => {
  console.log('✅ Redis connection established.');
});

connection.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

export const syncQueue = new Queue('syncQueue', { connection });

console.log('🚀 BullMQ Queue "syncQueue" created.');

const worker = new Worker(
  'syncQueue',
  async (job) => {
    console.log(`📥 Processing sync job ID: ${job.id}`);
    const { email, password, oauthToken } = job.data;
    await syncInbox(email, password, oauthToken);
  },
  { connection }
);

worker.on('completed', (job) => {
  console.log(`✅ Sync job ${job.id} completed.`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Sync job ${job?.id} failed with error:`, err);
});

console.log('👷 BullMQ Worker for "syncQueue" started.');
