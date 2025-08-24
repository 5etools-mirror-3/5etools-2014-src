# Source Password System

This system allows you to create password-protected sources for your D&D characters, ensuring only authorized users can create or edit characters for specific sources.

## How It Works

### 1. Source Protection
- Each "source" (like a campaign name, DM name, or organization) can have a password
- Only users with the correct password can save characters to that source
- Passwords are stored as hashed values in individual files in the `passwords/` directory

### 2. User Interface (Character Editor)
- **Source Display**: Shows the current source from your character JSON
- **Password Field**: Enter the password for the source
- **Check Button**: Verifies the password with the server
- **Set New Source Button**: Creates a new password-protected source

### 3. Password Caching
- Valid passwords are cached in your browser's localStorage
- You don't need to re-enter passwords for sources you've already authenticated
- Cached passwords are automatically loaded when you switch to a known source

### 4. Save Protection
- Characters cannot be saved without a valid password for their source
- The system checks the password every time you save
- Invalid passwords result in "Access denied" errors

## Usage Instructions

### For Character Creators
1. **Open the Character Editor** (`charactereditor.html`)
2. **Load or create your character JSON**
3. **Set the source** in your character's `"source"` field (e.g., `"MySourceName"`)
4. **Enter the password** for that source in the password field
5. **Click "Check"** to verify and cache the password
6. **Save normally** - the system will validate your access

### For Source Owners (DMs, Campaign Managers)
1. **Create a new source** by clicking "Set New Source"
2. **Enter a unique source name** (letters, numbers, underscores, hyphens only)
3. **Set a strong password** 
4. **Confirm the password**
5. **Share the source name and password** with authorized users

### Password Requirements
- **Source names**: Only letters, numbers, underscores, and hyphens
- **Passwords**: Any string (recommend strong passwords)
- **Case sensitive**: Both source names and passwords are case-sensitive

## Technical Details

### Server Endpoints
- `POST /api/sources/create` - Create a new source with password
- `POST /api/sources/validate` - Validate a password for a source  
- `GET /api/sources/list` - List all available sources (no passwords)
- `POST /api/characters/save` - Save character (requires source password)

### Password Storage
- Passwords are hashed using SHA-256 with a salt
- Each source has its own file: `passwords/SourceName.json`
- Files contain: source name, password hash, creation date, last modified date

### Local Storage
- Cached passwords stored in `localStorage.sourcePasswords`
- Automatically cleared when browser data is cleared
- JSON format: `{"SourceName": "password", ...}`

## Security Features

1. **Password Hashing**: Passwords are never stored in plain text on the server
2. **Individual Files**: Each source has its own password file
3. **Client-Side Caching**: Reduces server requests while maintaining security
4. **Input Validation**: Source names are sanitized to prevent directory traversal
5. **Error Messages**: Generic error messages prevent password enumeration

## Troubleshooting

### "Access denied: Invalid or missing password"
- Check that you've entered the correct password
- Verify the source name in your character JSON is correct
- Click "Check" to validate the password before saving

### "Source not found. Create the source first."
- The source doesn't exist yet
- Use "Set New Source" to create it with a password
- Or contact the source owner for the correct source name

### "Failed to create source. It may already exist."
- Someone has already created this source name
- Try a different, unique source name
- Or get the password for the existing source

### Password not being cached
- Check that your browser allows localStorage
- Try refreshing the page and re-entering the password
- Clear browser data if localStorage is corrupted

## Testing

Run the test script to verify the system is working:

```bash
# Start the API server
node api-server.js

# In another terminal, run tests
node test-password-system.js
```

The test creates a source, validates passwords, and attempts character saves to verify all functionality.