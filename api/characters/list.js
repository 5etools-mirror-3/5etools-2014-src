const { list } = import('@vercel/blob');

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
    let characters = [];

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { blobs } = await list({
          prefix: 'characters/',
          limit: 1000,
          token: process.env.BLOB_READ_WRITE_TOKEN
        });

        characters = blobs
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
      } catch (blobError) {
        console.error('Blob storage error:', blobError);
        // Continue with empty array - this is non-fatal
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Character list retrieved successfully',
      characters: characters,
      count: characters.length
    });

  } catch (error) {
    console.error('List characters error:', error);
    return res.status(500).json({
      error: 'Failed to list characters',
      details: error.message
    });
  }
}
