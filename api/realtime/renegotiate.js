/**
 * Send WebRTC answer to Cloudflare SFU for session renegotiation
 */

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

		const { sessionId, answer } = req.body;

		if (!sessionId || !answer) {
			return res.status(400).json({ error: 'sessionId and answer required' });
		}

		// Send answer to Cloudflare for renegotiation
		const renegotiateResponse = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${sfuAppId}/sessions/${sessionId}/renegotiate`, {
			method: 'PUT',
			headers: {
				'Authorization': `Bearer ${sfuAppToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				sessionDescription: answer
			})
		});

		if (!renegotiateResponse.ok) {
			const errorText = await renegotiateResponse.text();
			throw new Error(`Failed to renegotiate: ${renegotiateResponse.status} - ${errorText}`);
		}

		const result = await renegotiateResponse.json();
		console.log(`Cloudflare SFU: Renegotiation successful for session ${sessionId}`);

		return res.status(200).json({
			success: true,
			sessionId,
			result
		});

	} catch (error) {
		console.error('Cloudflare SFU renegotiation error:', error);
		return res.status(500).json({
			error: 'Failed to renegotiate with real-time service',
			message: error.message
		});
	}
}
