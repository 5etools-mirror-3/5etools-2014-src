const fs = require('fs').promises;
const path = require('path');

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
    const { characterData, isEdit, originalSource } = req.body;

    if (!characterData || !characterData.name) {
      return res.status(400).json({ error: 'Invalid character data' });
    }

    // Generate filename based on character source and name
    const source = characterData.source || 'custom';
    const characterId = characterData.name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with dashes
      .substring(0, 50); // Limit length

    const filename = `character-${source.toLowerCase()}-${characterId}.json`;
    
    // For Vercel, we can't write to filesystem in serverless functions
    // Instead, we'll return the data that should be saved locally
    // This is a limitation of serverless functions
    
    const saveData = {
      character: [characterData]
    };

    // In a real implementation, you'd save to a database or external storage
    // For now, we'll return success with the data that should be saved
    return res.status(200).json({
      success: true,
      message: 'Character data processed successfully',
      filename: filename,
      data: saveData,
      instructions: {
        note: 'Due to Vercel serverless limitations, character data cannot be saved directly to files.',
        suggestion: 'Save the returned data to your local data/character/ directory',
        localPath: `data/character/${filename}`
      }
    });

  } catch (error) {
    console.error('Save character error:', error);
    return res.status(500).json({ 
      error: 'Failed to save character',
      details: error.message
    });
  }
}