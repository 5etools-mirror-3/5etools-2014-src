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
    const { id: characterId } = req.query;

    if (!characterId) {
      return res.status(400).json({ error: 'Character ID is required' });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({
        error: 'BLOB_READ_WRITE_TOKEN not configured',
        note: 'Cannot load characters without blob storage configuration'
      });
    }

    // List all characters and find the one with matching ID
    const { blobs } = await list({
      prefix: 'characters/',
      limit: 1000,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    const characterBlob = blobs
      .filter(blob => blob.pathname.endsWith('.json'))
      .find(blob => {
        const filename = blob.pathname.split('/').pop();
        const blobCharacterId = filename.replace('.json', '');
        return blobCharacterId === characterId;
      });

    if (!characterBlob) {
      return res.status(404).json({ 
        error: 'Character not found',
        characterId: characterId
      });
    }

    // Fetch the character data from the blob URL
    const response = await fetch(characterBlob.url, {
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

    // Extract character from wrapper if needed
    let character = characterData;
    if (characterData.character && Array.isArray(characterData.character)) {
      character = characterData.character[0];
    }

    return res.status(200).json(character);

  } catch (error) {
    console.error('Load character by ID error:', error);
    return res.status(500).json({
      error: 'Failed to load character',
      details: error.message,
      characterId: req.query.id
    });
  }
}