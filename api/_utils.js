import { randomUUID } from 'node:crypto';

const rateLimitBuckets = new Map();

export function methodNotAllowed(res) {
  res.setHeader('Allow', 'POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

export function applyRateLimit(req, res, { scope, max = 6, windowMs = 10 * 60 * 1000 } = {}) {
  const now = Date.now();
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = String(Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  const key = `${scope || 'default'}:${ip}`;
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);

  if (bucket.count > max) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return false;
  }

  if (rateLimitBuckets.size > 500) {
    for (const [bucketKey, value] of rateLimitBuckets.entries()) {
      if (value.resetAt <= now) rateLimitBuckets.delete(bucketKey);
    }
  }

  return true;
}

export function requestId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function cleanText(value, maxLength = 240) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function isValidPhone(value) {
  return value.replace(/[^\d+]/g, '').length >= 7;
}

export function isValidEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export async function forwardLead(event, payload) {
  const webhookUrl = process.env.CONTACT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.info(`[lead:${event}] CONTACT_WEBHOOK_URL not configured`, payload);
    return { delivered: false, destination: 'server-log' };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.CONTACT_WEBHOOK_SECRET) {
    headers.Authorization = `Bearer ${process.env.CONTACT_WEBHOOK_SECRET}`;
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ event, payload }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lead webhook failed with ${response.status}: ${text}`);
  }

  return { delivered: true, destination: 'webhook' };
}
