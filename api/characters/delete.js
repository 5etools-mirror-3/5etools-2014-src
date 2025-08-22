import { del } from '@vercel/blob';

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

  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use DELETE or POST.' });
  }

  try {
    // Get character ID from query params or request body
    const characterId = req.query.id || req.body?.characterId;

    if (!characterId) {
      return res.status(400).json({ error: 'Character ID is required' });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({
        error: 'BLOB_READ_WRITE_TOKEN not configured',
        note: 'Cannot delete characters without blob storage configuration'
      });
    }

    const pathname = `characters/${characterId}.json`;

    // Delete the character blob
    await del(pathname, {
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    return res.status(200).json({
      success: true,
      message: 'Character deleted successfully',
      characterId: characterId
    });

  } catch (error) {
    console.error('Delete character error:', error);

    // Handle case where character doesn't exist
    if (error.message && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Character not found',
        characterId: req.query.id || req.body?.characterId
      });
    }

    return res.status(500).json({
      error: 'Failed to delete character',
      details: error.message
    });
  }
}
