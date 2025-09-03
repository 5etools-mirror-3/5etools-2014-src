import { list } from '@vercel/blob';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  // Prevent caching of character data API responses
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.query;

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({
        error: 'BLOB_READ_WRITE_TOKEN not configured',
        note: 'Cannot load characters without blob storage configuration'
      });
    }

    // If no URL provided, return all characters
    if (!url) {
      const { blobs } = await list({
        prefix: 'characters/',
        limit: 1000,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });

      const characterPromises = blobs
        .filter(blob => blob.pathname.endsWith('.json'))
        .map(async (blob) => {
          try {
            // Add cache-busting to prevent stale data
            const cacheBusterUrl = `${blob.url}${blob.url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
            const response = await fetch(cacheBusterUrl, {
              cache: 'no-cache',
              headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
              }
            });
            if (!response.ok) return null;
            const characterData = await response.json();
            // Extract character from wrapper if needed
            if (characterData.character && Array.isArray(characterData.character)) {
              return characterData.character[0];
            }
            return characterData;
          } catch (e) {
            console.warn(`Failed to load character from ${blob.pathname}:`, e);
            return null;
          }
        });

      const characters = (await Promise.all(characterPromises)).filter(Boolean);

      return res.status(200).json(characters);
    }

    // Load specific character from blob URL
    const cacheBusterUrl = `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
    const response = await fetch(cacheBusterUrl, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
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
