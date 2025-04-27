import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { MongoClient } from 'mongodb';
import { Readable } from 'stream';
import {updateSyncDuration} from '../metrics'

const start = Date.now()

// MongoDB Connection
const mongo = new MongoClient(
  process.env.MONGO_URI || 'mongodb://localhost:27017'
);

export async function syncInbox(
  email: string,
  password: string,
  host: string,
  port: number
) {
  console.time('Email Sync Timer'); // Start timer
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

        const latestEmails = results.slice(-500);
        let emailCount = 0;

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
        updateSyncDuration(durationMs); // Push to Prometheus metric
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
