// Vercel Serverless Function: Create ephemeral token for xAI Voice Agent
// This keeps the API key server-side and gives the browser a short-lived token.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const XAI_API_KEY = process.env.XAI_API_KEY;
  if (!XAI_API_KEY) {
    return res.status(500).json({ error: 'XAI_API_KEY not configured' });
  }

  try {
    const response = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { seconds: 300 } // 5-minute token
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('xAI ephemeral token error:', err);
      return res.status(response.status).json({ error: 'Failed to create session' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Session creation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}