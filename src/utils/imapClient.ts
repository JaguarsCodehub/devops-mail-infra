import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { MongoClient } from 'mongodb';
import { Readable } from 'stream';
import { updateSyncDuration } from '../metrics';
import { getImapSettingsByDomain, useOAuth2IfAvailable } from './providers';

const start = Date.now();

const mongo = new MongoClient(
  process.env.MONGO_URI || 'mongodb://localhost:27017'
);

export async function syncInbox({
  email,
  password,
  oauthToken,
}: {
  email: string;
  password?: string;
  oauthToken?: string;
}) {
  console.time('Email Sync Timer');
  await mongo.connect();
  const db = mongo.db('emailSync');
  const collection = db.collection('emails');

  const domain = email.split('@')[1];
  const imapSettings = getImapSettingsByDomain(domain);

  if (!imapSettings) {
    throw new Error(`IMAP settings not found for domain: ${domain}`);
  }

  const imapOptions: any = {
    user: email,
    host: imapSettings.host,
    port: imapSettings.port,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  };

  if (oauthToken && imapSettings.supportsOAuth2) {
    imapOptions.xoauth2 = oauthToken;
  } else if (password) {
    imapOptions.password = password;
  } else {
    throw new Error(
      'Missing credentials: provide either password or oauthToken'
    );
  }

  const imap = new Imap(imapOptions);

  imap.once('ready', () => {
    console.log('✅ IMAP connection ready.');

    imap.getBoxes((err, boxes) => {
      if (err) {
        console.error('❌ Error getting folders:', err);
        imap.end();
        return;
      }

      const allFolders = Object.keys(boxes);
      const inboxFolder =
        allFolders.find((f) => f.toLowerCase() === 'inbox') ||
        imapSettings.inboxFolder ||
        allFolders[0];

      console.log(`📂 Detected inbox folder: ${inboxFolder}`);

      imap.openBox(inboxFolder, true, (err, box) => {
        if (err) {
          console.error('❌ Error opening inbox:', err);
          imap.end();
          return;
        }

        console.log(`📦 Opened mailbox: ${box.name}`);

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
            console.log(`📥 Fetching email ${seqno}`);

            msg.on('body', async (stream: NodeJS.ReadableStream) => {
              try {
                const parsed: ParsedMail = await simpleParser(
                  stream as Readable
                );

                console.log(
                  `📬 Pulled Email: From: ${parsed.from?.text} | Subject: ${parsed.subject}`
                );

                await collection.insertOne({
                  from: parsed.from?.text || '',
                  subject: parsed.subject || '',
                  date: parsed.date || new Date(),
                  provider: domain,
                });
                emailCount++;
              } catch (error) {
                console.error('❌ Error parsing email:', error);
              }
            });
          });

          fetch.once('end', () => {
            console.log(
              `✅ Successfully fetched all latest ${latestEmails.length} emails.`
            );
            console.log(`✅ Fetched ${emailCount} emails.`);
            const end = Date.now();
            const durationMs = end - start;
            console.log(`✅ Fetched ${emailCount} emails in ${durationMs} ms.`);
            updateSyncDuration(durationMs);
            imap.end();
          });
        });
      });
    });
  });

  imap.once('error', (err: Error) => {
    console.error('❌ IMAP Error:', err);
  });

  imap.connect();
}
