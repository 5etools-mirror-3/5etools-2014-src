/**
 * Centralized Character Manager - Single Source of Truth for Character Data
 * Integrates with 5etools DataLoader system to prevent character duplication
 */

class CharacterManager {
	static _instance = null;
	static _characters = new Map(); // Map<id, character> for fast lookups
	static _charactersArray = []; // Array for list operations
	static _isLoaded = false;
	static _isLoading = false;
	static _loadPromise = null;
	static _listeners = new Set();
	static _refreshInterval = null;

	static getInstance() {
		if (!this._instance) {
			this._instance = new CharacterManager();
		}
		return this._instance;
	}

	/**
	 * Register a listener for character data changes
	 * @param {Function} callback - Called when characters are loaded/updated
	 */
	static addListener(callback) {
		this._listeners.add(callback);
	}

	/**
	 * Remove a listener
	 * @param {Function} callback - The callback to remove
	 */
	static removeListener(callback) {
		this._listeners.delete(callback);
	}

	/**
	 * Notify all listeners of character data changes
	 */
	static _notifyListeners() {
		this._listeners.forEach(callback => {
			try {
				callback(this._charactersArray);
			} catch (e) {
				console.warn('Error in character manager listener:', e);
			}
		});
	}

	/**
	 * Load characters from the API (single source of truth)
	 * @returns {Promise<Array>} Array of characters
	 */
	static async loadCharacters() {
		// If already loaded, return cached data
		if (this._isLoaded) {
			return [...this._charactersArray];
		}

		// If currently loading, wait for that to finish
		if (this._isLoading) {
			return this._loadPromise;
		}

		this._isLoading = true;
		this._loadPromise = this._performLoad();

		try {
			const characters = await this._loadPromise;
			this._isLoaded = true;
			return characters;
		} finally {
			this._isLoading = false;
			this._loadPromise = null;
		}
	}

	/**
	 * Internal method to perform the actual loading
	 */
	static async _performLoad() {
		try {
			console.log('CharacterManager: Loading characters from API...');
			const cacheBuster = Date.now();
			const response = await fetch(`/api/characters/load?_t=${cacheBuster}`, {
				cache: 'no-cache',
				headers: {
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					'Pragma': 'no-cache'
				}
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch characters: ${response.statusText}`);
			}

			const characters = await response.json();
			return this._processAndStoreCharacters(characters || []);
		} catch (error) {
			console.error('CharacterManager: Error loading characters:', error);
			// Return empty array on error to prevent crashes
			return [];
		}
	}

	/**
	 * Process and store characters, ensuring no duplicates
	 * @param {Array} characters - Raw character data from API
	 * @returns {Array} Processed characters
	 */
	static _processAndStoreCharacters(characters) {
		// Clear existing data
		this._characters.clear();
		this._charactersArray.length = 0;

		const processedCharacters = [];

		for (const character of characters) {
			if (!character || !character.name) {
				console.warn('CharacterManager: Skipping character without name:', character);
				continue;
			}

			// Generate composite ID from name + source if no ID exists
			if (!character.id) {
				character.id = this._generateCompositeId(character.name, character.source);
			}

			// Check for duplicates by ID
			if (this._characters.has(character.id)) {
				console.warn(`CharacterManager: Duplicate character ${character.name} from ${character.source}, skipping`);
				continue;
			}

			// Process character for display
			const processedCharacter = this._processCharacterForDisplay(character);
			
			// Store in both map and array
			this._characters.set(character.id, processedCharacter);
			this._charactersArray.push(processedCharacter);
			processedCharacters.push(processedCharacter);
		}

		console.log(`CharacterManager: Loaded ${processedCharacters.length} unique characters`);
		
		// Populate DataLoader cache for hover/popout functionality and offline support
		if (processedCharacters.length > 0) {
			const formattedData = { character: processedCharacters };
			if (typeof DataLoader !== 'undefined') {
				DataLoader._pCache_addToCache({
					allDataMerged: formattedData,
					propAllowlist: new Set(["character"])
				});
				console.log(`CharacterManager: Populated DataLoader cache with ${processedCharacters.length} characters`);
			}
		}
		
		// Notify listeners of the update
		this._notifyListeners();
		
		return processedCharacters;
	}

	/**
	 * Process a single character for display (adds computed fields)
	 */
	static _processCharacterForDisplay(character) {
		// Clone to avoid modifying original
		const processed = { ...character };

		// Add computed fields that the filters and display expect
		if (processed.race) {
			processed._fRace = processed.race.variant ? `Variant ${processed.race.name}` : processed.race.name;
		}

		if (processed.class && Array.isArray(processed.class)) {
			// Create detailed class display with subclasses
			processed._fClass = processed.class.map(cls => {
				let classStr = cls.name;
				if (cls.subclass && cls.subclass.name) {
					classStr += ` (${cls.subclass.name})`;
				}
				return classStr;
			}).join("/");

			// Also create a simple class list for filtering/search
			processed._fClassSimple = processed.class.map(cls => cls.name).join("/");

			// Calculate total level from class levels
			processed._fLevel = processed.class.reduce((total, cls) => {
				return total + (cls.level || 0);
			}, 0);
		} else {
			processed._fLevel = 1;
		}

		if (processed.background) {
			processed._fBackground = processed.background.name;
		}

		// Ensure __prop is set for DataLoader compatibility
		processed.__prop = "character";

		return processed;
	}

	/**
	 * Get all characters (from cache if loaded)
	 * @returns {Array} Array of characters
	 */
	static getCharacters() {
		return [...this._charactersArray];
	}

	/**
	 * Get a character by ID
	 * @param {string} id - Character ID
	 * @returns {Object|null} Character object or null if not found
	 */
	static getCharacterById(id) {
		return this._characters.get(id) || null;
	}

	/**
	 * Add or update a single character (for editor functionality)
	 * @param {Object} character - Character data
	 */
	static addOrUpdateCharacter(character) {
		if (!character || !character.name) {
			console.warn('CharacterManager: Cannot add character without name');
			return;
		}

		// Generate composite ID if no ID exists
		if (!character.id) {
			character.id = this._generateCompositeId(character.name, character.source);
		}

		const processed = this._processCharacterForDisplay(character);
		
		// Update or add to map
		const existingIndex = this._charactersArray.findIndex(c => c.id === character.id);
		if (existingIndex >= 0) {
			// Update existing
			this._charactersArray[existingIndex] = processed;
		} else {
			// Add new
			this._charactersArray.push(processed);
		}
		
		this._characters.set(character.id, processed);
		
		// Update DataLoader cache to maintain consistency
		this._updateDataLoaderCache();
		
		// Notify listeners
		this._notifyListeners();
	}

	/**
	 * Quick edit functionality for HP and other frequently updated fields
	 * @param {string} characterId - Character ID
	 * @param {Object} updates - Fields to update (e.g., {hp: 25})
	 */
	static updateCharacterQuickEdit(characterId, updates) {
		const character = this._characters.get(characterId);
		if (!character) {
			console.warn(`CharacterManager: Character ${characterId} not found for quick edit`);
			return false;
		}

		// Apply updates
		Object.assign(character, updates);
		
		// Update in array as well
		const arrayIndex = this._charactersArray.findIndex(c => c.id === characterId);
		if (arrayIndex >= 0) {
			Object.assign(this._charactersArray[arrayIndex], updates);
		}

		// Update DataLoader cache
		this._updateDataLoaderCache();

		// Update localStorage cache if this character is currently being edited
		this._updateLocalStorageCache(character);

		// Notify listeners of the update
		this._notifyListeners();

		console.log(`CharacterManager: Quick edit applied to ${character.name}:`, updates);
		return true;
	}

	/**
	 * Update HP for a character (most common quick edit)
	 * @param {string} characterId - Character ID
	 * @param {number} newHp - New HP value
	 */
	static updateCharacterHp(characterId, newHp) {
		return this.updateCharacterQuickEdit(characterId, { hp: newHp });
	}

	/**
	 * Helper to update DataLoader cache after character changes
	 */
	static _updateDataLoaderCache() {
		if (this._charactersArray.length > 0 && typeof DataLoader !== 'undefined') {
			const formattedData = { character: [...this._charactersArray] };
			DataLoader._pCache_addToCache({
				allDataMerged: formattedData,
				propAllowlist: new Set(["character"])
			});
		}
	}

	/**
	 * Update localStorage cache if this character is currently being edited
	 * @param {Object} character - Updated character data
	 */
	static _updateLocalStorageCache(character) {
		try {
			// Check if this character is currently being edited
			const editingCharacterData = localStorage.getItem('editingCharacter');
			if (editingCharacterData) {
				const editingCharacter = JSON.parse(editingCharacterData);
				// Match by composite ID (name + source)
				const editingId = editingCharacter.id || this._generateCompositeId(editingCharacter.name, editingCharacter.source);
				if (editingId === character.id) {
					// Update the localStorage with the latest character data
					localStorage.setItem('editingCharacter', JSON.stringify(character));
					console.log(`CharacterManager: Updated localStorage cache for ${character.name}`);
				}
			}
		} catch (e) {
			console.warn('CharacterManager: Error updating localStorage cache:', e);
		}
	}

	/**
	 * Remove a character by ID
	 * @param {string} id - Character ID to remove
	 */
	static removeCharacter(id) {
		if (this._characters.has(id)) {
			this._characters.delete(id);
			
			const index = this._charactersArray.findIndex(c => c.id === id);
			if (index >= 0) {
				this._charactersArray.splice(index, 1);
			}
			
			// Notify listeners
			this._notifyListeners();
		}
	}

	/**
	 * Force reload characters from API
	 * @returns {Promise<Array>} Fresh character data
	 */
	static async reloadCharacters() {
		this._isLoaded = false;
		return this.loadCharacters();
	}

	/**
	 * Clear all cached data
	 */
	static clearCache() {
		this._characters.clear();
		this._charactersArray.length = 0;
		this._isLoaded = false;
		this._isLoading = false;
		this._loadPromise = null;
		this._stopAutoRefresh();
		this._notifyListeners();
	}

	/**
	 * Start automatic refresh of character data (like existing system)
	 * @param {number} intervalMs - Refresh interval in milliseconds (default 5 minutes)
	 */
	static startAutoRefresh(intervalMs = 5 * 60 * 1000) {
		if (this._refreshInterval) {
			clearInterval(this._refreshInterval);
		}

		this._refreshInterval = setInterval(async () => {
			console.log('CharacterManager: Auto-refreshing character data...');
			try {
				await this.reloadCharacters();
			} catch (e) {
				console.warn('CharacterManager: Auto-refresh failed:', e);
			}
		}, intervalMs);

		console.log(`CharacterManager: Auto-refresh enabled (${intervalMs / 1000}s interval)`);
	}

	/**
	 * Stop automatic refresh
	 */
	static _stopAutoRefresh() {
		if (this._refreshInterval) {
			clearInterval(this._refreshInterval);
			this._refreshInterval = null;
		}
	}

	/**
	 * Integration method for existing 5etools data loader patterns
	 * This makes characters work like any other content type in the system
	 */
	static async pGetCharacterData() {
		const characters = await this.loadCharacters();
		return { character: characters };
	}

	/**
	 * Check if the user can edit a character based on source passwords
	 * @param {Object|string} characterOrSource - Character object or source name
	 * @returns {boolean} True if user can edit this character
	 */
	static canEditCharacter(characterOrSource) {
		try {
			const source = typeof characterOrSource === 'string' 
				? characterOrSource 
				: characterOrSource?.source;

			if (!source || source === 'Unknown' || source === '') {
				return false;
			}

			const cachedPasswords = localStorage.getItem('sourcePasswords');
			if (!cachedPasswords) return false;

			const passwords = JSON.parse(cachedPasswords);
			return !!passwords[source];
		} catch (e) {
			console.error('Error checking character edit permissions:', e);
			return false;
		}
	}

	/**
	 * Save character to server (handles both new and existing characters)
	 * @param {Object} characterData - Character data to save
	 * @param {boolean} isEdit - Whether this is an edit of existing character
	 * @returns {Promise<boolean>} Success status
	 */
	static async saveCharacter(characterData, isEdit = false) {
		if (!characterData || !characterData.source) {
			console.warn('CharacterManager: Cannot save character without source');
			return false;
		}

		if (!this.canEditCharacter(characterData)) {
			console.warn('CharacterManager: No permission to edit character from source:', characterData.source);
			return false;
		}

		try {
			const cachedPasswords = localStorage.getItem('sourcePasswords');
			const passwords = JSON.parse(cachedPasswords);
			const password = passwords[characterData.source];

			// Generate character ID if needed
			const characterId = characterData.id || this._generateCompositeId(characterData.name, characterData.source);

			const API_BASE_URL = window.location.origin.includes('localhost')
				? 'http://localhost:3000/api'
				: '/api';

			const response = await fetch(`${API_BASE_URL}/characters/save`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					characterData: characterData,
					source: characterData.source,
					password: password,
					isEdit: isEdit,
					characterId: characterId
				})
			});

			if (response.ok) {
				// Update local cache
				characterData.id = characterId;
				this.addOrUpdateCharacter(characterData);
				
				// Also ensure localStorage is updated
				this._updateLocalStorageCache(characterData);
				
				console.log(`CharacterManager: Successfully saved character: ${characterData.name}`);
				return true;
			} else {
				const error = await response.json();
				console.error('CharacterManager: Server error saving character:', error);
				return false;
			}
		} catch (error) {
			console.error('CharacterManager: Error saving character:', error);
			return false;
		}
	}

	/**
	 * Update a character stat and save to server
	 * @param {string} characterId - Character ID
	 * @param {string} statPath - Dot notation path to stat (e.g., "hp.current")
	 * @param {any} newValue - New value for the stat
	 * @returns {Promise<boolean>} Success status
	 */
	static async updateCharacterStat(characterId, statPath, newValue) {
		const character = this.getCharacterById(characterId);
		if (!character) {
			console.warn(`CharacterManager: Character ${characterId} not found for stat update`);
			return false;
		}

		if (!this.canEditCharacter(character)) {
			console.warn(`CharacterManager: No permission to edit character: ${character.name}`);
			return false;
		}

		try {
			// Parse and set the value
			const parsedValue = this._parseStatValue(newValue);
			this._setNestedProperty(character, statPath, parsedValue);

			// Save to server first
			const success = await this.saveCharacter(character, true);
			
			if (success) {
				// Only update local caches if server save succeeded
				this.updateCharacterQuickEdit(characterId, { [this._getTopLevelProperty(statPath)]: this._getNestedProperty(character, this._getTopLevelProperty(statPath)) });
			} else {
				// Revert local changes if server update failed
				console.warn('CharacterManager: Server update failed, reverting local changes');
				await this.reloadCharacters();
			}

			return success;
		} catch (error) {
			console.error('CharacterManager: Error updating character stat:', error);
			return false;
		}
	}

	/**
	 * Helper to parse stat values to appropriate types
	 */
	static _parseStatValue(value) {
		if (value === null || value === '' || value === undefined) {
			return null;
		}
		// Try to parse as number if it looks like one
		const numValue = Number(value);
		if (!isNaN(numValue) && value.toString().trim() !== '') {
			return numValue;
		}
		return value; // Return as string if not a number
	}

	/**
	 * Helper to set nested properties using dot notation
	 */
	static _setNestedProperty(obj, path, value) {
		const keys = path.split('.');
		const lastKey = keys.pop();
		const target = keys.reduce((current, key) => {
			if (!current[key] || typeof current[key] !== 'object') {
				current[key] = {};
			}
			return current[key];
		}, obj);
		
		// Handle null/empty values appropriately
		if (value === null || value === '' || value === undefined) {
			delete target[lastKey];
		} else {
			target[lastKey] = value;
		}
	}

	/**
	 * Helper to get nested properties using dot notation
	 */
	static _getNestedProperty(obj, path) {
		return path.split('.').reduce((current, key) => current?.[key], obj);
	}

	/**
	 * Helper to get top-level property from dot notation path
	 */
	static _getTopLevelProperty(path) {
		return path.split('.')[0];
	}

	/**
	 * Generate composite ID from character name and source
	 * @param {string} name - Character name
	 * @param {string} source - Character source
	 * @returns {string} Composite ID
	 */
	static _generateCompositeId(name, source) {
		if (!name) return null;
		const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
		const cleanSource = (source || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
		return `${cleanName}_${cleanSource}`;
	}

	/**
	 * Helper to generate character ID (legacy method, now uses composite ID)
	 */
	static _generateCharacterId(name, source) {
		return this._generateCompositeId(name, source);
	}
}

// Make it available globally for all scripts
globalThis.CharacterManager = CharacterManager;