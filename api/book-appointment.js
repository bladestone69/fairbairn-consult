// Vercel Serverless Function: Book an appointment
// Called by the Grok Voice Agent as a custom function tool.

// In-memory store for demo. Replace with Google Calendar / Calendly / database in production.
const appointments = [];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple auth check — the voice agent calls this with a shared secret
  const API_SECRET = process.env.BOOKING_API_SECRET || 'changeme-setup-env-var';
  if (req.headers['x-booking-secret'] !== API_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { name, phone, email, date, time, service, notes } = req.body;

  if (!name || !date || !time) {
    return res.status(400).json({ error: 'name, date, and time are required' });
  }

  const appointment = {
    id: `apt_${Date.now()}`,
    name,
    phone: phone || 'not provided',
    email: email || 'not provided',
    date,
    time,
    service: service || 'General financial advice consultation',
    notes: notes || '',
    status: 'confirmed',
    created_at: new Date().toISOString(),
  };

  appointments.push(appointment);

  // TODO: Send confirmation email/SMS
  // TODO: Add to Google Calendar
  // TODO: Save to database

  console.log('New appointment booked:', appointment);

  return res.status(200).json({
    success: true,
    appointment_id: appointment.id,
    message: `Appointment confirmed for ${name} on ${date} at ${time}. Reference: ${appointment.id}`,
  });
}