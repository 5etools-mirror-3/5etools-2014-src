import { head } from '@vercel/blob';

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
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    const characterId = req.query.id;

    if (!characterId) {
      return res.status(400).json({ error: 'Character ID is required' });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({ 
        error: 'BLOB_READ_WRITE_TOKEN not configured',
        note: 'Cannot check characters without blob storage configuration'
      });
    }

    const pathname = `characters/${characterId}.json`;
    
    try {
      // Use head() to check if the blob exists without downloading it
      const blobInfo = await head(pathname, {
        token: process.env.BLOB_READ_WRITE_TOKEN
      });

      return res.status(200).json({
        exists: true,
        characterId: characterId,
        info: {
          url: blobInfo.url,
          size: blobInfo.size,
          uploadedAt: blobInfo.uploadedAt,
          pathname: blobInfo.pathname
        }
      });

    } catch (error) {
      // If head() throws an error, the blob doesn't exist
      if (error.message && error.message.includes('not found')) {
        return res.status(200).json({
          exists: false,
          characterId: characterId
        });
      }
      throw error; // Re-throw if it's a different error
    }

  } catch (error) {
    console.error('Check character error:', error);
    return res.status(500).json({
      error: 'Failed to check character',
      details: error.message
    });
  }
}
