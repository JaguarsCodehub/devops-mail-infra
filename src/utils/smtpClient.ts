import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false, // for testing, allow self-signed certs
  },
});

export async function sendColdEmail(to: string, subject: string, text: string) {
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    text,
  });
  console.log(`Email sent to ${to} with Subject: ${subject} and Text: ${text}`);
}
