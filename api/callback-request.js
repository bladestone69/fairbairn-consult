// Vercel Serverless Function: Save a call-back request from the voice agent
// Called by the Grok Voice Agent when a visitor requests a call-back.

// In-memory store for demo. Replace with email notification / database / Google Sheets in production.
const callbacks = [];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check — the voice agent calls this with a shared secret
  const API_SECRET = process.env.BOOKING_API_SECRET || 'changeme-setup-env-var';
  if (req.headers['x-booking-secret'] !== API_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { name, phone, preferred_time, reason } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'name and phone are required' });
  }

  const callback = {
    id: `cb_${Date.now()}`,
    name,
    phone,
    preferred_time: preferred_time || 'Any time',
    reason: reason || 'Not specified',
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  callbacks.push(callback);

  // TODO: Send email notification to Erenst
  // TODO: Save to Google Sheets / database
  // TODO: Send SMS confirmation to visitor

  console.log('New call-back request:', callback);

  return res.status(200).json({
    success: true,
    callback_id: callback.id,
    message: `Thank you, ${name}. Erenst will call you back${preferred_time ? ' ' + preferred_time : ' soon'}. Have a good day!`,
  });
}