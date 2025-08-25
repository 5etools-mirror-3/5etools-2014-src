import crypto from 'crypto';
import { put, head } from '@vercel/blob';

export class PasswordUtils {
  static generateSalt() {
    return crypto.randomBytes(32).toString('hex');
  }

  static hashPassword(password, salt) {
    return crypto.createHash('sha256').update(password + salt).digest('hex');
  }

  static async getSourcePassword(sourceName) {
    try {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw new Error('BLOB_READ_WRITE_TOKEN not configured');
      }

      const pathname = `passwords/${sourceName}.json`;

      // Check if the password file exists using the Vercel Blob SDK
      const blobData = await head(pathname);

      if (!blobData || !blobData.url) {
        return null; // Source doesn't exist
      }

      // Fetch the actual content using the blob's public URL
      const response = await fetch(blobData.url);

      if (!response.ok) {
        return null; // Error fetching the file
      }

      const passwordData = await response.json();
      return passwordData;
    } catch (error) {
      console.error('Error in getSourcePassword:', error);
      return null; // Source doesn't exist or error occurred
    }
  }

  static async createSource(sourceName, password) {
    try {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw new Error('BLOB_READ_WRITE_TOKEN not configured');
      }

      // Check if source already exists
      const existing = await this.getSourcePassword(sourceName);
      if (existing) {
        throw new Error('Source already exists');
      }

      const salt = this.generateSalt();
      const hashedPassword = this.hashPassword(password, salt);

      const passwordData = {
        source: sourceName,
        passwordHash: hashedPassword,
        salt: salt,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString()
      };

      const pathname = `passwords/${sourceName}.json`;

      const blob = await put(pathname, JSON.stringify(passwordData, null, 2), {
        access: 'public',
        contentType: 'application/json',
        cacheControlMaxAge: 0,
      });

      return {
        success: true,
        source: sourceName,
        createdAt: passwordData.createdAt
      };
    } catch (error) {
      throw error;
    }
  }

  static async validatePassword(sourceName, password) {
    try {
      const sourceData = await this.getSourcePassword(sourceName);
		console.log(`Retrieved source data for "${sourceName}":${sourceData}`, sourceData);
      if (!sourceData) {
        return false; // Source doesn't exist
      }

      const hashedInput = this.hashPassword(password, sourceData.salt);
		console.log(`Validating password for source "${sourceName}" (sanitized: "${this.sanitizeSourceName(sourceName)}")`);
		console.log(`Stored hash: ${sourceData.passwordHash}`);
		console.log(`Input hash:  ${hashedInput}`);
      return hashedInput === sourceData.passwordHash;
    } catch (error) {
      return false;
    }
  }

  static async listSources() {
    try {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return []; // Return empty array if no token configured
      }

      // Since we can't directly list blob files easily, we'll need to implement a different approach
      // For now, return empty array - this would need to be expanded if we want to list all sources
      return [];
    } catch (error) {
      return [];
    }
  }

  static sanitizeSourceName(sourceName) {
    // Only allow letters, numbers, underscores, and hyphens
    return sourceName.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50).toLowerCase();
  }
}
