import { put, head } from '@vercel/blob';

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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { characterData, isEdit, characterId } = req.body;

    if (!characterData || !characterData.name) {
      return res.status(400).json({ error: 'Invalid character data' });
    }

    // Generate character ID if not provided
    let finalCharacterId = characterId || characterData.name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with dashes
      .substring(0, 50); // Limit length

    // Wrap character in the expected format
    const saveData = {
      character: [characterData]
    };

    if (saveData.character[0].__fSource) {
      finalCharacterId += `-${saveData.character[0].__fSource}`;
    }

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const pathname = `characters/${finalCharacterId}.json`;

      // Check if character already exists
      let characterExists = false;
      try {
        await head(pathname, {
          token: process.env.BLOB_READ_WRITE_TOKEN
        });
        characterExists = true;
      } catch (error) {
        // Character doesn't exist, which is fine
        characterExists = false;
      }

      const blob = await put(pathname, JSON.stringify(saveData, null, 2), {
        access: 'public',
        contentType: 'application/json',
        allowOverwrite: true, // Allow overwriting existing characters
      });

      return res.status(200).json({
        success: true,
        message: characterExists
          ? 'Character updated successfully'
          : 'Character created successfully',
        characterId: finalCharacterId,
        wasUpdate: characterExists,
        blob: {
          url: blob.url,
          pathname: blob.pathname,
          size: blob.size,
          uploadedAt: blob.uploadedAt
        }
      });
    } else {
      // Development mode - just return success without actually saving
      return res.status(200).json({
        success: true,
        message: 'Character not saved',
        characterId: finalCharacterId,
        note: 'BLOB_READ_WRITE_TOKEN not configured - character not actually saved'
      });
    }

  } catch (error) {
    console.error('Save character error:', error);
    return res.status(500).json({
      error: 'Failed to save character',
      details: error.message
    });
  }
}
