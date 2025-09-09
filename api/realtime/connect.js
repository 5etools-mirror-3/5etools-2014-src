export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sfuAppId = process.env.SFU_APP_ID;
    const sfuAppToken = process.env.SFU_APP_TOKEN;

    if (!sfuAppId || !sfuAppToken) {
      return res.status(500).json({
        error: 'Cloudflare SFU not configured'
      });
    }

    const { userId, sessionDescription } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    if (!sessionDescription) {
      return res.status(400).json({ error: 'sessionDescription (SDP offer) required' });
    }

    // Create a new session using correct Cloudflare Realtime SFU API
    const sessionResponse = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${sfuAppId}/sessions/new`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sfuAppToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionDescription: sessionDescription
      })
    });

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`Failed to create session: ${sessionResponse.status} - ${errorText}`);
    }

    const sessionData = await sessionResponse.json();
    console.log(`Cloudflare SFU: Created session ${sessionData.sessionId} for user ${userId}`);

    // The response from Cloudflare includes sessionId and sessionDescription (SDP answer)
    return res.status(200).json({
      success: true,
      sessionId: sessionData.sessionId,
      userId: userId,
      // Pass through the session data from Cloudflare
      sessionData: {
        sessionId: sessionData.sessionId,
        sessionDescription: sessionData.sessionDescription, // SDP answer from Cloudflare
        tracks: sessionData.tracks || [],
        appId: sfuAppId
        // Don't expose the secret token to client
      }
    });

  } catch (error) {
    console.error('Cloudflare SFU connection error:', error);
    return res.status(500).json({
      error: 'Failed to connect to real-time service'
    });
  }
}
