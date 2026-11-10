import nodemailer from 'nodemailer';
import { applyRateLimit, cleanText, isValidPhone, isValidEmail, methodNotAllowed, noStore, parseBody, requestId } from './_utils.js';

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') return methodNotAllowed(res);
  if (!applyRateLimit(req, res, { scope: 'callback-request', max: 5 })) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  const body = parseBody(req);
  if (body.website) return res.status(400).json({ error: 'Unable to submit your request.' });
  const name = cleanText(body.name, 120);
  const phone = cleanText(body.phone, 60);
  const email = cleanText(body.email, 160);
  const preferredTime = cleanText(body.preferred_time, 120) || 'Any time';
  const reason = cleanText(body.reason, 400);
  if (!name || !phone || !isValidPhone(phone) || !isValidEmail(email)) return res.status(400).json({ error: 'Please provide your name, a valid phone number and, if supplied, a valid email address.' });
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CALLBACK_RECIPIENT } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !CALLBACK_RECIPIENT) return res.status(503).json({ error: 'Unable to send your request right now. Please call or email Erenst directly.' });
  const id = requestId('cb');
  try {
    const transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, requireTLS: true, auth: { user: SMTP_USER, pass: SMTP_PASS }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    await transport.sendMail({ from: `Financial Advisor Website <${SMTP_USER}>`, to: CALLBACK_RECIPIENT, subject: 'New website callback request', text: `A visitor has requested a call.\n\nName: ${name}\nPhone: ${phone}\nEmail: ${email || 'Not supplied'}\nPreferred time: ${preferredTime}\nMessage: ${reason || 'Not supplied'}\nReference: ${id}`, ...(email ? { replyTo: email } : {}) });
    return res.status(200).json({ success: true, callback_id: id, message: 'Thank you. Your callback request has been sent.' });
  } catch (error) {
    console.error('Callback email delivery failed:', error.code || 'unknown error');
    return res.status(502).json({ error: 'Unable to send your request right now. Please call or email Erenst directly.' });
  }
}
