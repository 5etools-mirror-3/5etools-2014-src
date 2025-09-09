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
      // First check if session exists, then try to add a track
      console.log(`Attempting to join existing session: ${existingSessionId}`);
      try {
        // First, check if the session exists
        const sessionCheckResponse = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${sfuAppId}/sessions/${existingSessionId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${sfuAppToken}`
          }
        });
        
        if (sessionCheckResponse.ok) {
          // Session exists, try to add a track
          console.log(`Session ${existingSessionId} exists, adding track...`);
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
            const errorText = await sessionResponse.text();
            console.log(`Failed to join existing session: ${sessionResponse.status} - ${errorText}`);
            sessionResponse = null;
          }
        } else {
          console.log(`Session ${existingSessionId} does not exist, will create new one`);
        }
      } catch (error) {
        console.log(`Error checking/joining existing session: ${error.message}`);
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
    
    // Determine which session ID we're actually using
    const actualSessionId = existingSessionId && sessionResponse.status === 200 ? existingSessionId : sessionData.sessionId;
    
    console.log(`Cloudflare SFU: User ${userId} connected to session ${actualSessionId}`);

    // The response from Cloudflare includes sessionDescription (SDP answer)
    return res.status(200).json({
      success: true,
      sessionId: actualSessionId, // Use the actual session ID (existing or new)
      userId: userId,
      joinedExisting: !!existingSessionId && sessionResponse.status === 200,
      // Pass through the session data from Cloudflare
      sessionData: {
        sessionId: actualSessionId,
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
