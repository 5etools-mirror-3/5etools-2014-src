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
    const { url, sources } = req.query;

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({
        error: 'BLOB_READ_WRITE_TOKEN not configured',
        note: 'Cannot load characters without blob storage configuration'
      });
    }

    // If no URL provided, return blob metadata for client-side selective loading
    if (!url) {
      const { blobs } = await list({
        prefix: 'characters/',
        limit: 1000,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });

      let characterBlobs = blobs
        .filter(blob => blob.pathname.endsWith('.json'))
        .map(blob => {
          const filename = blob.pathname.split('/').pop();
          const characterId = filename.replace('.json', '');

          return {
            id: characterId,
            filename: filename,
            pathname: blob.pathname,
            url: blob.url,
            uploadedAt: blob.uploadedAt,
            size: blob.size
          };
        });

      // Filter by sources if specified
      if (sources) {
        const sourceList = Array.isArray(sources) ? sources : [sources];
        characterBlobs = characterBlobs.filter(blob => {
          // Extract source from character ID (format: name-source)
          const parts = blob.id.split('-');
          const source = parts[parts.length - 1];
          return sourceList.includes(source);
        });
      }

      return res.status(200).json({
        blobs: characterBlobs,
        count: characterBlobs.length,
        timestamp: Date.now(),
        filteredBy: sources ? (Array.isArray(sources) ? sources : [sources]) : null
      });
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
