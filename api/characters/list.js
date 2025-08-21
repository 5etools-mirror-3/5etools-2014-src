module.exports = async function handler(req, res) {
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
    // Check if running in Vercel production with blob storage
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Import blob functionality for production
      const { list } = require('@vercel/blob');

      const { blobs } = await list({
        prefix: 'characters/',
        limit: 1000
      });

      const characterFiles = blobs
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

      return res.status(200).json({
        success: true,
        message: 'Character list retrieved from blob storage',
        characters: characterFiles,
        count: characterFiles.length
      });
	 }

  } catch (error) {
    console.error('List characters error:', error);
    return res.status(500).json({
      error: 'Failed to list characters',
      details: error.message
    });
  }
}
