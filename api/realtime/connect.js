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

    // Use a fixed session ID so all clients connect to the same session  
    const sharedSessionId = 'character-sync-session-shared';
    
    console.log(`User ${userId} connecting to shared session: ${sharedSessionId}`);
    
    // Try to use the same session ID by making a PUT request to a specific session
    let sessionResponse;
    try {
      // First try to add to existing session
      sessionResponse = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${sfuAppId}/sessions/${sharedSessionId}/tracks/new`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sfuAppToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionDescription: sessionDescription,
          trackName: `track-${userId}-${Date.now()}`
        })
      });
      
      console.log(`User ${userId} joined existing session`);
    } catch (error) {
      console.log(`Session ${sharedSessionId} might not exist, will create it`);
      
      // If that fails, create the session with our fixed ID
      sessionResponse = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${sfuAppId}/sessions/new`, {
        method: 'POST', 
        headers: {
          'Authorization': `Bearer ${sfuAppToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionDescription: sessionDescription
        })
      });
      
      console.log(`Created new session for user ${userId}`);
    }

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`Failed to create session: ${sessionResponse.status} - ${errorText}`);
    }

    const sessionData = await sessionResponse.json();
    console.log(`Cloudflare SFU: User ${userId} connected to session ${sharedSessionId}`);

    // The response from Cloudflare includes sessionDescription (SDP answer)
    return res.status(200).json({
      success: true,
      sessionId: sharedSessionId, // Use our shared session ID
      userId: userId,
      // Pass through the session data from Cloudflare
      sessionData: {
        sessionId: sharedSessionId,
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
