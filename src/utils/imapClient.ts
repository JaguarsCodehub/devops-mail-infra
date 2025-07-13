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
  host,
  port,
}: {
  email: string;
  password?: string;
  oauthToken?: string;
  host?: string;
  port?: number;
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
    host: host || imapSettings.host,
    port: port || imapSettings.port,
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

  return new Promise((resolve, reject) => {
    imap.once('ready', () => {
      console.log('✅ IMAP connection ready.');

      imap.getBoxes((err, boxes) => {
        if (err) {
          console.error('❌ Error getting folders:', err);
          imap.end();
          reject(err);
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
            reject(err);
            return;
          }

          console.log(`📦 Opened mailbox: ${box.name}`);

          // Search for all emails first, then filter by date in processing
          const searchCriteria = ['ALL'];
          console.log(`🔍 Searching for all emails (will filter by date during processing)`);

          imap.search(searchCriteria, (err, results) => {
            if (err) {
              console.error('❌ Error searching emails:', err);
              imap.end();
              reject(err);
              return;
            }

            if (!results || results.length === 0) {
              console.log('❌ No emails found from 2022 onwards.');
              imap.end();
              resolve({ emailCount: 0, durationMs: Date.now() - start });
              return;
            }

            console.log(`📊 Found ${results.length} total emails`);
            
            // Filter emails from 2023 onwards during processing
            const cutoffDate = new Date('2023-01-01');
            console.log(`📅 Filtering emails from: ${cutoffDate.toDateString()}`);
            
            // Process in batches to avoid memory issues
            const BATCH_SIZE = 100;
            const totalEmails = results.length;
            let processedCount = 0;
            let emailCount = 0;
            let batchCount = 0;
            let filteredCount = 0;

            const processBatch = (startIndex: number) => {
              const endIndex = Math.min(startIndex + BATCH_SIZE, totalEmails);
              const batch = results.slice(startIndex, endIndex);
              
              console.log(`📦 Processing batch ${batchCount + 1}: emails ${startIndex + 1}-${endIndex} of ${totalEmails}`);
              
              const fetch = imap.fetch(batch, { 
                bodies: '',
                struct: true // Get email structure for better parsing
              });

              const batchEmails: any[] = [];

              fetch.on('message', (msg, seqno) => {
                console.log(`📥 Fetching email ${seqno} (${processedCount + 1}/${totalEmails})`);

                msg.on('body', async (stream: NodeJS.ReadableStream) => {
                  try {
                    const parsed: ParsedMail = await simpleParser(
                      stream as Readable
                    );

                    // Check if email is from 2023 onwards
                    const emailDate = parsed.date || new Date();
                    
                    // Debug: Log first few emails to see what dates we're getting
                    if (processedCount < 5) {
                      console.log(`🔍 Debug - Email ${processedCount + 1}: Date = ${emailDate}, Cutoff = ${cutoffDate}, IsAfter = ${emailDate >= cutoffDate}`);
                    }
                    
                    // Always save the email data, but track filtered count separately
                    const emailData = {
                      from: parsed.from?.text || '',
                      subject: parsed.subject || '',
                      date: emailDate,
                      provider: domain,
                      emailId: parsed.messageId || '',
                      to: Array.isArray(parsed.to) ? parsed.to.map(t => t.text).join(', ') : parsed.to?.text || '',
                      cc: Array.isArray(parsed.cc) ? parsed.cc.map(c => c.text).join(', ') : parsed.cc?.text || '',
                      text: parsed.text || '',
                      html: parsed.html || '',
                      attachments: parsed.attachments?.length || 0,
                    };

                    batchEmails.push(emailData);
                    
                    // Track filtered count for reporting
                    if (emailDate >= cutoffDate) {
                      filteredCount++;
                    }
                    
                    processedCount++;

                    if (processedCount % 10 === 0) {
                      console.log(`📈 Progress: ${processedCount}/${totalEmails} emails processed (${Math.round((processedCount/totalEmails)*100)}%) - Filtered: ${filteredCount}`);
                    }

                  } catch (error) {
                    console.error('❌ Error parsing email:', error);
                    processedCount++;
                  }
                });
              });

              fetch.once('end', async () => {
                try {
                  // Batch insert to MongoDB for better performance
                  if (batchEmails.length > 0) {
                    await collection.insertMany(batchEmails, { ordered: false });
                    emailCount += batchEmails.length;
                    console.log(`✅ Batch ${batchCount + 1} completed: ${batchEmails.length} emails saved`);
                  }

                  batchCount++;

                  // Process next batch or finish
                  if (endIndex < totalEmails) {
                    setTimeout(() => processBatch(endIndex), 100); // Small delay between batches
                  } else {
                    const end = Date.now();
                    const durationMs = end - start;
                    console.log(`🎉 Sync completed!`);
                    console.log(`✅ Total emails processed: ${processedCount}/${totalEmails}`);
                    console.log(`📧 Emails from 2023 onwards: ${filteredCount}`);
                    console.log(`⏱️ Total time: ${durationMs}ms (${Math.round(durationMs/1000)}s)`);
                    console.log(`📊 Average: ${Math.round(emailCount/(durationMs/1000))} emails/second`);
                    updateSyncDuration(durationMs, emailCount);
                    imap.end();
                    resolve({ emailCount, durationMs, totalEmails, filteredCount });
                  }
                } catch (error) {
                  console.error('❌ Error saving batch to database:', error);
                  imap.end();
                  reject(error);
                }
              });

              fetch.once('error', (err) => {
                console.error('❌ Error fetching batch:', err);
                imap.end();
                reject(err);
              });
            };

            // Start processing first batch
            processBatch(0);
          });
        });
      });
    });

    imap.once('error', (err: Error) => {
      console.error('❌ IMAP Error:', err);
      reject(err);
    });

    imap.connect();
  });
}
