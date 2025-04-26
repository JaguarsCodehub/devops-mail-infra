import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { MongoClient } from 'mongodb';
import { Readable } from 'stream'; // important

const mongo = new MongoClient(
  process.env.MONGO_URI || 'mongodb://localhost:27017'
);

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
      rejectUnauthorized: false,
    }
  });

  imap.once('ready', () => {
    imap.openBox('INBOX', true, () => {
      const fetch = imap.seq.fetch('1:10', { bodies: '' });

      fetch.on('message', (msg) => {
        msg.on('body', async (stream: NodeJS.ReadableStream) => {
          try {
            const parsed: ParsedMail = await simpleParser(stream as Readable);
            await collection.insertOne({
              from: parsed.from?.text || '',
              subject: parsed.subject || '',
              date: parsed.date || new Date(),
            });
          } catch (error) {
            console.error('Error parsing email:', error);
          }
        });
      });

      fetch.once('end', () => {
        imap.end();
      });
    });
  });

  imap.once('error', (err: Error) => {
    console.error('IMAP Error:', err);
  });

  imap.connect();
}
