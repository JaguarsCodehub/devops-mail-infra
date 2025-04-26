import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { MongoClient } from 'mongodb';
import { Readable } from 'stream'; // important

// MongoDB Connection
const mongo = new MongoClient(
  process.env.MONGO_URI || 'mongodb://localhost:27017'
);

// Main function to sync inbox
export async function syncInbox(
  email: string,
  password: string,
  host: string,
  port: number
) {
  await mongo.connect();
  const db = mongo.db('emailSync');
  const collection = db.collection('emails');

  const imap = new Imap({
    user: email,
    password,
    host,
    port,
    tls: true,
    tlsOptions: {
      rejectUnauthorized: false, // Allow self-signed certificates
    },
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

        const latestEmails = results.slice(-10); // Get latest 10 emails

        const fetch = imap.fetch(latestEmails, { bodies: '' });

        fetch.on('message', (msg, seqno) => {
          console.log(`📥 Fetching email ${seqno}`);

          msg.on('body', async (stream: NodeJS.ReadableStream) => {
            try {
              const parsed: ParsedMail = await simpleParser(stream as Readable);

              console.log(
                `📬 Pulled Email: From: ${parsed.from?.text} | Subject: ${parsed.subject}`
              );

              await collection.insertOne({
                from: parsed.from?.text || '',
                subject: parsed.subject || '',
                date: parsed.date || new Date(),
              });
            } catch (error) {
              console.error('❌ Error parsing email:', error);
            }
          });
        });

        fetch.once('end', () => {
          console.log('✅ Successfully fetched all latest 10 emails.');
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
