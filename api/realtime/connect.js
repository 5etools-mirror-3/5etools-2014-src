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

    const { userId, sessionDescription, existingSessionId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    if (!sessionDescription) {
      return res.status(400).json({ error: 'sessionDescription (SDP offer) required' });
    }

    console.log(`User ${userId} connecting to Cloudflare SFU...`);
    
    let sessionResponse;
    
    if (existingSessionId) {
      // Try to add a track to existing session
      console.log(`Attempting to join existing session: ${existingSessionId}`);
      try {
        sessionResponse = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${sfuAppId}/sessions/${existingSessionId}/tracks/new`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sfuAppToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionDescription: sessionDescription,
            trackName: `user-${userId}-${Date.now()}`
          })
        });
        
        if (sessionResponse.ok) {
          console.log(`Successfully joined existing session ${existingSessionId}`);
        } else {
          console.log(`Failed to join existing session, will create new one`);
          sessionResponse = null;
        }
      } catch (error) {
        console.log(`Error joining existing session: ${error.message}`);
        sessionResponse = null;
      }
    }
    
    // If joining existing session failed or no existing session, create new one
    if (!sessionResponse || !sessionResponse.ok) {
      console.log(`Creating new Cloudflare SFU session`);
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
    }
    
    console.log(`Session creation response status: ${sessionResponse.status}`);
    
    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      console.error(`Cloudflare SFU error: ${sessionResponse.status} - ${errorText}`);
      throw new Error(`Failed to create session: ${sessionResponse.status} - ${errorText}`);
    }

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`Failed to create session: ${sessionResponse.status} - ${errorText}`);
    }

    const sessionData = await sessionResponse.json();
    console.log(`Cloudflare SFU: Created session ${sessionData.sessionId} for user ${userId}`);

    // The response from Cloudflare includes sessionDescription (SDP answer)
    return res.status(200).json({
      success: true,
      sessionId: sessionData.sessionId, // Use Cloudflare's actual session ID
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
