import { Router } from 'express';
import { syncInbox } from '../utils/imapClient';
import { sendColdEmail } from '../utils/smtpClient';
import { syncQueue } from '../queue/syncQueue';

export const emailRouter = Router();

emailRouter.post('/sync-inbox', async (req, res) => {
  const { email, password, host, port } = req.body;
  await syncQueue.add('sync', { email, password, host, port });
  res.json({ message: 'Sync job added to queue' });
});

emailRouter.post('/send-email', async (req, res) => {
  const { to, subject, text } = req.body;
  await sendColdEmail(to, subject, text);
  res.json({ message: 'Email sent' });
});
