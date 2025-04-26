import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { emailRouter } from './routes/email';
import { registerMetrics } from './metrics';
import { QueueEvents } from 'bullmq';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.use('/api', emailRouter);

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registerMetrics.contentType);
  res.end(await registerMetrics.metrics());
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
