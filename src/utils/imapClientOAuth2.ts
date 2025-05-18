// imapClient.ts - Refactored with dynamic provider config and OAuth2 support (stubbed)

import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { MongoClient } from 'mongodb';
import { Readable } from 'stream';
import { updateSyncDuration } from '../metrics';

const start = Date.now();
const mongo = new MongoClient(
  process.env.MONGO_URI || 'mongodb://localhost:27017'
);

const IMAP_CONFIG_MAP: Record<
  string,
  { host: string; port: number; secure: boolean }
> = {
  'gmail.com': { host: 'imap.gmail.com', port: 993, secure: true },
  'yahoo.com': { host: 'imap.mail.yahoo.com', port: 993, secure: true },
  'outlook.com': { host: 'imap-mail.outlook.com', port: 993, secure: true },
  'zoho.com': { host: 'imap.zoho.com', port: 993, secure: true },
  'bluehost.com': { host: 'mail.bluehost.com', port: 993, secure: true },
  'hostinger.com': { host: 'imap.hostinger.com', port: 993, secure: true },
};

function getImapSettings(email: string) {
  const domain = email.split('@')[1];
  return IMAP_CONFIG_MAP[domain] || null;
}

// Stub: replace with actual token-based auth logic
function getAccessToken(email: string): string | null {
  return null; // to be implemented per-provider (Gmail, Outlook, etc.)
}

export async function syncInbox(
  email: string,
  password: string | null = null // password OR access token will be used
) {
  console.time('Email Sync Timer');
  await mongo.connect();
  const db = mongo.db('emailSync');
  const collection = db.collection('emails');

  const imapSettings = getImapSettings(email);
  if (!imapSettings) {
    throw new Error('Unsupported email domain');
  }

  const xoauth2Token = getAccessToken(email); // fetch access token for OAuth2

  const imap = new Imap({
    user: email,
    password: xoauth2Token || password || '',
    xoauth2: xoauth2Token || undefined,
    host: imapSettings.host,
    port: imapSettings.port,
    tls: imapSettings.secure,
    tlsOptions: { rejectUnauthorized: false },
  });

  imap.once('ready', () => {
    console.log('✅ IMAP connection ready.');
    
    imap.openBox('INBOX', true, (err, box) => {
      if (err) {
        console.error('❌ Error opening inbox:', err);
        imap.end();
        return;
      }
      console.log(`📂 Opened mailbox: ${box.name}`);

      imap.search(['ALL'], (err, results) => {
        if (err || !results || results.length === 0) {
          console.log('❌ No emails found.');
          imap.end();
          return;
        }

        const latestEmails = results.slice(-500);
        let emailCount = 0;
        const fetch = imap.fetch(latestEmails, { bodies: '' });

        fetch.on('message', (msg, seqno) => {
          msg.on('body', async (stream: NodeJS.ReadableStream) => {
            try {
              const parsed: ParsedMail = await simpleParser(stream as Readable);
              await collection.insertOne({
                from: parsed.from?.text || '',
                subject: parsed.subject || '',
                date: parsed.date || new Date(),
              });
              emailCount++;
            } catch (error) {
              console.error('❌ Error parsing email:', error);
            }
          });
        });

        fetch.once('end', () => {
          const end = Date.now();
          const durationMs = end - start;
          console.log(`✅ Fetched ${emailCount} emails in ${durationMs} ms.`);
          updateSyncDuration(durationMs);
          imap.end();
        });
      });
    });
  });

  imap.once('error', (err: Error) => {
    console.error('❌ IMAP Error:', err);
  });

  imap.connect();
}
