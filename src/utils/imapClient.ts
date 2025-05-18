import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { MongoClient } from 'mongodb';
import { Readable } from 'stream';
import { updateSyncDuration } from '../metrics';

const start = Date.now();
const mongo = new MongoClient(
  process.env.MONGO_URI || 'mongodb://localhost:27017'
);

// Mapping of common providers to their IMAP settings
const IMAP_SETTINGS: Record<
  string,
  { host: string; port: number; secure: boolean }
> = {
  'gmail.com': { host: 'imap.gmail.com', port: 993, secure: true },
  'yahoo.com': { host: 'imap.mail.yahoo.com', port: 993, secure: true },
  'outlook.com': { host: 'imap-mail.outlook.com', port: 993, secure: true },
  'zoho.com': { host: 'imap.zoho.com', port: 993, secure: true },
  // Add more as needed
};

function getDomain(email: string): string {
  return email.split('@')[1].toLowerCase();
}

export async function syncInbox(
  email: string,
  password: string,
  host?: string,
  port?: number,
  accessToken?: string // for future OAuth support
) {
  console.time('Email Sync Timer');
  await mongo.connect();
  const db = mongo.db('emailSync');
  const collection = db.collection('emails');

  const domain = getDomain(email);
  const settings =
    host && port
      ? { host, port, secure: true }
      : IMAP_SETTINGS[domain] || {
          host: `imap.${domain}`,
          port: 993,
          secure: true,
        };

  const imap = new Imap({
    user: email,
    password: accessToken || password, // Use OAuth2 accessToken if provided
    xoauth2: accessToken ? accessToken : undefined,
    host: settings.host,
    port: settings.port,
    tls: settings.secure,
    tlsOptions: { rejectUnauthorized: false },
  });

  imap.once('ready', () => {
    console.log('✅ IMAP connected to', settings.host);

    imap.getBoxes((err, boxes) => {
      if (err) {
        console.error('❌ Error fetching folders:', err);
        imap.end();
        return;
      }

      const inbox =
        Object.keys(boxes).find((box) => box.toLowerCase().includes('inbox')) ||
        'INBOX';

      imap.openBox(inbox, true, (err, box) => {
        if (err) {
          console.error('❌ Error opening inbox:', err);
          imap.end();
          return;
        }

        imap.search(['ALL'], (err, results) => {
          if (err || !results || results.length === 0) {
            console.log('📭 No emails found.');
            imap.end();
            return;
          }

          const latest = results.slice(-500);
          let emailCount = 0;

          const fetch = imap.fetch(latest, { bodies: '' });

          fetch.on('message', (msg, seqno) => {
            msg.on('body', async (stream: NodeJS.ReadableStream) => {
              try {
                const parsed: ParsedMail = await simpleParser(
                  stream as Readable
                );
                await collection.insertOne({
                  from: parsed.from?.text || '',
                  subject: parsed.subject || '',
                  date: parsed.date || new Date(),
                });
                emailCount++;
              } catch (err) {
                console.error('❌ Parsing error:', err);
              }
            });
          });

          fetch.once('end', () => {
            const durationMs = Date.now() - start;
            console.log(`✅ Synced ${emailCount} emails in ${durationMs} ms`);
            updateSyncDuration(durationMs);
            imap.end();
          });
        });
      });
    });
  });

  imap.once('error', (err: any) => {
    console.error('❌ IMAP Error:', err);
  });

  imap.connect();
}
