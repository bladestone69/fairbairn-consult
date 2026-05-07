// Vercel Serverless Function: Check available time slots
// Called by the Grok Voice Agent as a custom function tool.

// Available business hours: Mon-Fri 8:00-17:00 SAST (Africa/Johannesburg)
const BUSINESS_HOURS = { start: 8, end: 17 };
const SLOT_DURATION_MINUTES = 60;

// In-memory booked slots for demo. Replace with real calendar integration.
const bookedSlots = [];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_SECRET = process.env.BOOKING_API_SECRET || 'changeme-setup-env-var';
  if (req.headers['x-booking-secret'] !== API_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { date } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
  }

  // Check if date is a weekday
  const d = new Date(date + 'T00:00:00+02:00');
  const dayOfWeek = d.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return res.status(200).json({
      date,
      available: false,
      reason: 'Weekends are not available. Please choose a Monday to Friday.',
    });
  }

  // Check if date is in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d < today) {
    return res.status(200).json({
      date,
      available: false,
      reason: 'That date is in the past. Please choose a future date.',
    });
  }

  // Generate available slots
  const available = [];
  for (let hour = BUSINESS_HOURS.start; hour < BUSINESS_HOURS.end; hour++) {
    const timeStr = `${String(hour).padStart(2, '0')}:00`;
    const slotId = `${date}_${timeStr}`;
    if (!bookedSlots.includes(slotId)) {
      available.push(timeStr);
    }
  }

  // If date is today, remove past slots
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  let filteredAvailable = available;
  if (date === todayStr) {
    const currentHour = now.getHours() + 1; // Next available hour
    filteredAvailable = available.filter(t => parseInt(t) >= currentHour);
  }

  return res.status(200).json({
    date,
    available: true,
    slots: filteredAvailable,
    business_hours: `${BUSINESS_HOURS.start}:00 - ${BUSINESS_HOURS.end}:00 SAST`,
    timezone: 'Africa/Johannesburg',
  });
}