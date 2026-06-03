// Vercel Serverless Function: Book an appointment
// Called by the Grok Voice Agent as a custom function tool.

import {
  applyRateLimit,
  cleanText,
  forwardLead,
  isValidEmail,
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

  if (!applyRateLimit(req, res, { scope: 'appointment-request', max: 5 })) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const body = parseBody(req);
  const appointment = {
    id: requestId('apt'),
    name: cleanText(body.name, 120),
    phone: cleanText(body.phone, 60),
    email: cleanText(body.email, 160),
    date: cleanText(body.date, 40),
    time: cleanText(body.time, 40),
    service: cleanText(body.service, 160) || 'General financial advice consultation',
    notes: cleanText(body.notes, 500),
    source: 'website',
    status: 'requested',
    created_at: new Date().toISOString(),
  };

  if (!appointment.name || !appointment.date || !appointment.time) {
    return res.status(400).json({ error: 'name, date, and time are required' });
  }

  if (appointment.phone && !isValidPhone(appointment.phone)) {
    return res.status(400).json({ error: 'Please provide a valid contact number' });
  }

  if (!isValidEmail(appointment.email)) {
    return res.status(400).json({ error: 'Please provide a valid email address' });
  }

  try {
    const delivery = await forwardLead('appointment.requested', appointment);
    console.info('New appointment request:', { ...appointment, delivery });

    return res.status(200).json({
      success: true,
      appointment_id: appointment.id,
      message: `Appointment request received for ${appointment.name} on ${appointment.date} at ${appointment.time}. Reference: ${appointment.id}`,
    });
  } catch (error) {
    console.error('Appointment request delivery failed:', error);
    return res.status(502).json({
      success: false,
      error: 'The appointment request could not be saved right now. Please use the contact details on the website.',
    });
  }
}