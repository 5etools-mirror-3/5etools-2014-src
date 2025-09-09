export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const turnWebRtcKey = process.env.TURN_WEB_RTC;
    const cfTurnApiKey = process.env.CL_TURN_API_KEY;

    if (!turnWebRtcKey && !cfTurnApiKey) {
      return res.status(500).json({
        error: 'WebRTC credentials not configured',
        note: 'Neither TURN_WEB_RTC nor CL_TURN_API_KEY environment variables are set'
      });
    }

    // Prefer Cloudflare Realtime if available
    if (cfTurnApiKey) {
      try {
        // Fetch TURN credentials from Cloudflare using correct endpoint
        const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${cfTurnApiKey}/credentials/generate-ice-servers`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
        }

        const credentials = await response.json();
        console.log('Cloudflare credentials response:', credentials);

        return res.status(200).json({
          success: true,
          provider: 'cloudflare',
          iceServers: credentials.iceServers || credentials,
          signalingUrl: `wss://rtc.live.cloudflare.com/v1/rooms/5etools-characters/websocket?access_token=${cfTurnApiKey}`,
          expiresAt: Date.now() + (3600 * 1000) // 1 hour from now
        });
      } catch (error) {
        console.error('Cloudflare TURN credentials failed:', error);
        // Fall back to TurnWebRTC if Cloudflare fails
      }
    }

    return res.status(500).json({
      error: 'No working WebRTC service available'
    });

  } catch (error) {
    console.error('WebRTC credentials error:', error);
    return res.status(500).json({
      error: 'Failed to fetch WebRTC credentials',
      details: error.message
    });
  }
}
