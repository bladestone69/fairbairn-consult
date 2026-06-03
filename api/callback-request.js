// Vercel Serverless Function: Save a call-back request from the voice agent
// Called by the Grok Voice Agent when a visitor requests a call-back.

import {
  applyRateLimit,
  cleanText,
  forwardLead,
  isValidPhone,
  methodNotAllowed,
  noStore,
  parseBody,
  requestId,
} from './_utils.js';

export default async function handler(req, res) {
  noStore(res);

  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  if (!applyRateLimit(req, res, { scope: 'callback-request', max: 5 })) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const body = parseBody(req);
  const callback = {
    id: requestId('cb'),
    name: cleanText(body.name, 120),
    phone: cleanText(body.phone, 60),
    preferred_time: cleanText(body.preferred_time, 120) || 'Any time',
    reason: cleanText(body.reason, 400) || 'Not specified',
    source: 'voice-agent',
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  if (!callback.name || !callback.phone) {
    return res.status(400).json({ error: 'name and phone are required' });
  }

  if (!isValidPhone(callback.phone)) {
    return res.status(400).json({ error: 'Please provide a valid contact number' });
  }

  try {
    const delivery = await forwardLead('callback.requested', callback);
    console.info('New call-back request:', { ...callback, delivery });

    return res.status(200).json({
      success: true,
      callback_id: callback.id,
      message: `Thank you, ${callback.name}. Erenst will call you back ${callback.preferred_time}. Have a good day!`,
    });
  } catch (error) {
    console.error('Callback request delivery failed:', error);
    return res.status(502).json({
      success: false,
      error: 'The message could not be saved right now. Please use the contact details on the website.',
    });
  }
}