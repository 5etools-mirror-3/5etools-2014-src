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
    const cfTurnKeyId = process.env.TURN_WEB_RTC;
    const cfTurnApiToken = process.env.CL_TURN_API_TOKEN;

    if (!cfTurnKeyId && !cfTurnApiToken) {
      return res.status(500).json({
        error: 'WebRTC credentials not configured',
        note: 'Need either TURN_WEB_RTC or both CL_TURN_KEY_ID and CL_TURN_API_TOKEN environment variables'
      });
    }

    // Prefer Cloudflare Realtime if available
    if (cfTurnKeyId && cfTurnApiToken) {
      try {
        // Fetch TURN credentials from Cloudflare using exact curl format from docs
        const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${cfTurnKeyId}/credentials/generate-ice-servers`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cfTurnApiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ttl: 86400
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Cloudflare API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const credentials = await response.json();
        console.log('Cloudflare credentials response:', credentials);

        return res.status(200).json({
          success: true,
          provider: 'cloudflare',
          iceServers: credentials.iceServers || credentials,
          expiresAt: Date.now() + (86400 * 1000) // 24 hours from now
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
