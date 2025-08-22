export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'Character blob URL is required' });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({ 
        error: 'BLOB_READ_WRITE_TOKEN not configured',
        note: 'Cannot load characters without blob storage configuration'
      });
    }

    // Load character from blob URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch character from URL: ${response.statusText}`);
    }
    
    const characterData = await response.json();

    return res.status(200).json({
      success: true,
      message: 'Character loaded successfully',
      character: characterData,
      loadedFrom: url
    });

  } catch (error) {
    console.error('Load character error:', error);
    return res.status(500).json({
      error: 'Failed to load character',
      details: error.message
    });
  }
}
