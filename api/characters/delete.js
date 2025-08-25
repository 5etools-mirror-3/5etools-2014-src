import { del } from '@vercel/blob';
import { PasswordUtils } from '../sources/password-utils.js';

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

  // Get character ID, source, and password from query params or request body
  const baseCharacterId = req.query.id || req.body?.characterId;
  const source = req.query.source || req.body?.source;
  const password = req.query.password || req.body?.password;

  if (!baseCharacterId) {
    return res.status(400).json({ error: 'Character ID is required' });
  }

  if (!source) {
    return res.status(400).json({ error: 'Source is required to delete character' });
  }

  // Password validation is required for all deletions
  if (!password) {
    return res.status(400).json({ 
      error: 'Password is required. Please provide the password for the source.' 
    });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      error: 'BLOB_READ_WRITE_TOKEN not configured',
      note: 'Cannot delete characters without blob storage configuration'
    });
  }

  // Sanitize the source name to match how it's saved
  const sanitizedSource = PasswordUtils.sanitizeSourceName(source);
  if (!sanitizedSource) {
    return res.status(400).json({ 
      error: 'Invalid source name. Use only letters, numbers, underscores, and hyphens.' 
    });
  }

  // Validate the password for the source
  const isValidPassword = await PasswordUtils.validatePassword(sanitizedSource, password);
  if (!isValidPassword) {
    return res.status(403).json({ 
      error: 'Access denied: Invalid password for this source. Only users with the correct password can delete characters from this source.' 
    });
  }

  // Construct the full character ID with source (same as save endpoint)
  const fullCharacterId = `${baseCharacterId}-${sanitizedSource}`;
  const pathname = `characters/${fullCharacterId}.json`;

  try {

    // Delete the character blob
    await del(pathname, {
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    console.log(`Successfully deleted character blob: ${pathname}`);

    return res.status(200).json({
      success: true,
      message: 'Character deleted successfully',
      baseCharacterId: baseCharacterId,
      fullCharacterId: fullCharacterId,
      source: sanitizedSource,
      pathname: pathname
    });

  } catch (error) {
    console.error('Delete character error:', error);

    // Handle case where character doesn't exist
    if (error.message && error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Character not found',
        baseCharacterId: baseCharacterId,
        source: source,
        fullCharacterId: fullCharacterId,
        pathname: pathname
      });
    }

    return res.status(500).json({
      error: 'Failed to delete character',
      details: error.message
    });
  }
}
