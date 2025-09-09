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

    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    // Create or join a session for character sync
    const sessionName = 'character-sync-session';
    
    // Use Cloudflare Calls API to create/join session
    const sessionResponse = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${sfuAppId}/sessions/${sessionName}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${sfuAppToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Session configuration
      })
    });

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`Failed to create session: ${sessionResponse.status} - ${errorText}`);
    }

    const sessionData = await sessionResponse.json();
    console.log(`Cloudflare SFU: User ${userId} connected to session`);

    return res.status(200).json({
      success: true,
      sessionId: sessionName,
      connectionInfo: {
        appId: sfuAppId,
        sessionName: sessionName,
        // Don't expose the token to client
      }
    });

  } catch (error) {
    console.error('Cloudflare SFU connection error:', error);
    return res.status(500).json({
      error: 'Failed to connect to real-time service'
    });
  }
}
