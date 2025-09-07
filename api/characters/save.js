import { put, head } from '@vercel/blob';
import { PasswordUtils } from '../sources/password-utils.js';
import Cache from './cache.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Prevent caching of save responses
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { characterData, isEdit, characterId, source, password } = req.body;

    if (!characterData || !characterData.name) {
      return res.status(400).json({ error: 'Invalid character data' });
    }

    // Get source from character data or request body
    const characterSource = source || characterData.source;
    if (!characterSource) {
      return res.status(400).json({ 
        error: 'Source is required. Please specify a source for your character.' 
      });
    }

    // Password validation is required for all saves
    if (!password) {
      return res.status(400).json({ 
        error: 'Password is required. Please provide the password for the source.' 
      });
    }

    // Validate the password for the source
    const sanitizedSource = PasswordUtils.sanitizeSourceName(characterSource);
    if (!sanitizedSource) {
      return res.status(400).json({ 
        error: 'Invalid source name. Use only letters, numbers, underscores, and hyphens.' 
      });
    }

    const isValidPassword = await PasswordUtils.validatePassword(sanitizedSource, password);
    if (!isValidPassword) {
      return res.status(403).json({ 
        error: 'Access denied: Invalid or missing password for this source. Please create the source first or check your password.' 
      });
    }

    // Ensure character data has the correct source
    characterData.source = sanitizedSource;

    // Generate character ID if not provided
    let finalCharacterId = characterId || characterData.name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with dashes
      .substring(0, 50); // Limit length

    // Add source to character ID
    finalCharacterId += `-${sanitizedSource}`;

    // Wrap character in the expected format
    const saveData = {
      character: [characterData]
    };

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
        cacheControlMaxAge: 1800, // Cache for 30 minutes to save bandwidth
      });

      // Invalidate the server-side blob list cache so next list() call fetches fresh metadata
      try {
        Cache.invalidate();
      } catch (e) {
        console.warn('Failed to invalidate character list cache after save:', e);
      }

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
      // Development mode - password was validated but can't save without token
      return res.status(200).json({
        success: true,
        message: 'Password validated but character not saved',
        characterId: finalCharacterId,
        source: sanitizedSource,
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
