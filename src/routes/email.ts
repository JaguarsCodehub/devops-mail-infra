import { Router } from 'express';
import { syncInbox } from '../utils/imapClient';
import { sendColdEmail } from '../utils/smtpClient';
import { syncQueue } from '../queue/syncQueue';

export const emailRouter = Router();

emailRouter.post('/sync-inbox', async (req, res) => {
  const { email, password, oauthToken } = req.body;
  try {
    await syncQueue.add('sync', { email, password, oauthToken });
    res.json({ message: 'Sync job added to queue' });
  } catch (err) {
    console.error('❌ Error adding sync job to queue:', err);
    res.status(500).json({ error: 'Failed to add sync job' });
  }
});

emailRouter.post('/send-email', async (req, res) => {
  const { to, subject, text } = req.body;
  await sendColdEmail(to, subject, text);
  res.json({ message: 'Email sent' });
});
