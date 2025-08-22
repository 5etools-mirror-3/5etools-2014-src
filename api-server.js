const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// List all characters
app.get('/api/characters/list', async (req, res) => {
  try {
    const charactersDir = path.join(__dirname, 'data', 'character');
    const files = await fs.readdir(charactersDir);
    const characterFiles = files.filter(file => file.endsWith('.json'));
    
    const characters = [];
    for (const file of characterFiles) {
      try {
        const filePath = path.join(charactersDir, file);
        const data = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(data);
        
        if (parsed.character && Array.isArray(parsed.character)) {
          // Add source file info to each character
          parsed.character.forEach(char => {
            char._sourceFile = file;
          });
          characters.push(...parsed.character);
        }
      } catch (error) {
        console.warn(`Error reading character file ${file}:`, error.message);
      }
    }
    
    res.json({ characters });
  } catch (error) {
    console.error('Error listing characters:', error);
    res.status(500).json({ error: 'Failed to list characters' });
  }
});

// Load a specific character
app.get('/api/characters/load/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename.endsWith('.json')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const filePath = path.join(__dirname, 'data', 'character', filename);
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    
    res.json(parsed);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Character file not found' });
    } else {
      console.error('Error loading character:', error);
      res.status(500).json({ error: 'Failed to load character' });
    }
  }
});

// Save a character
app.post('/api/characters/save', async (req, res) => {
  try {
    const { filename, character } = req.body;
    
    if (!filename || !character) {
      return res.status(400).json({ error: 'Filename and character data required' });
    }
    
    const safeFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
    const filePath = path.join(__dirname, 'data', 'character', safeFilename);
    
    // Create the character file structure
    const characterData = {
      character: Array.isArray(character) ? character : [character]
    };
    
    await fs.writeFile(filePath, JSON.stringify(characterData, null, '\t'));
    
    res.json({ 
      success: true, 
      message: 'Character saved successfully',
      filename: safeFilename 
    });
  } catch (error) {
    console.error('Error saving character:', error);
    res.status(500).json({ error: 'Failed to save character' });
  }
});

// Update an existing character
app.put('/api/characters/save/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const { character } = req.body;
    
    if (!character) {
      return res.status(400).json({ error: 'Character data required' });
    }
    
    const safeFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
    const filePath = path.join(__dirname, 'data', 'character', safeFilename);
    
    // Read existing file
    let existingData = { character: [] };
    try {
      const data = await fs.readFile(filePath, 'utf8');
      existingData = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, will create new one
    }
    
    // Update or add the character
    if (character.name) {
      const index = existingData.character.findIndex(c => c.name === character.name);
      if (index >= 0) {
        existingData.character[index] = character;
      } else {
        existingData.character.push(character);
      }
    } else {
      existingData.character = [character];
    }
    
    await fs.writeFile(filePath, JSON.stringify(existingData, null, '\t'));
    
    res.json({ 
      success: true, 
      message: 'Character updated successfully',
      filename: safeFilename 
    });
  } catch (error) {
    console.error('Error updating character:', error);
    res.status(500).json({ error: 'Failed to update character' });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log('Static files served from http://localhost:5050');
  console.log('Available endpoints:');
  console.log('  GET  /api/characters/list');
  console.log('  GET  /api/characters/load/:filename');
  console.log('  POST /api/characters/save');
  console.log('  PUT  /api/characters/save/:filename');
});