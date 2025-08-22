let editor;
let currentCharacterData = null;
let currentCharacterId = null;
let isEditMode = false;

// API configuration
const API_BASE_URL = window.location.origin.includes('localhost')
  ? 'http://localhost:3000/api'
  : '/api';

class CharacterEditorPage {
	constructor() {
		this.ace = null;
		this.initOnLoad();
	}

	async initOnLoad() {
		// Initialize required utilities first
		await Promise.all([
			PrereleaseUtil.pInit(),
			BrewUtil2.pInit(),
		]);

		// Check if we're in edit mode
		const urlParams = new URLSearchParams(window.location.search);
		isEditMode = urlParams.get('edit') === 'true';

		// Initialize ACE editor using 5etools utility
		this.ace = EditorUtil.initEditor("jsoninput", {mode: "ace/mode/json"});

		// Load character data if in edit mode
		if (isEditMode) {
			this.loadCharacterForEdit();
		} else {
			this.loadTemplate();
		}

		// Bind button events
		this.bindEvents();

		// Auto-render on load if we have data
		setTimeout(() => this.renderCharacter(), 500);
	}

	async loadCharacterForEdit() {
		// First try to get character ID from URL or localStorage
		const urlParams = new URLSearchParams(window.location.search);
		const characterId = urlParams.get('id');

		if (characterId) {
			// Load from API
			await this.loadCharacterFromAPI(characterId);
		} else {
			// Fallback to localStorage for backwards compatibility
			const characterData = localStorage.getItem('editingCharacter');
			if (characterData) {
				try {
					currentCharacterData = JSON.parse(characterData);
					this.ace.setValue(JSON.stringify(currentCharacterData, null, 2), 1);
					document.getElementById('message').textContent = 'Loaded character for editing (from localStorage)';
				} catch (e) {
					console.error('Error loading character data:', e);
					document.getElementById('message').textContent = 'Error loading character data';
				}
			}
		}
	}

	async loadCharacterFromAPI(characterId) {
		try {
			const response = await fetch(`${API_BASE_URL}/characters/${characterId}`);
			if (response.ok) {
				const characterResponse = await response.json();
				currentCharacterData = characterResponse.data;
				currentCharacterId = characterResponse.id;
				this.ace.setValue(JSON.stringify(currentCharacterData, null, 2), 1);
				document.getElementById('message').textContent = `Loaded character: ${characterResponse.name}`;
			} else {
				throw new Error('Character not found');
			}
		} catch (error) {
			console.error('Error loading character from API:', error);
			document.getElementById('message').textContent = 'Error loading character from API';
		}
	}

	loadTemplate() {
		// Default character template with custom content example
		const template = {
			name: "New Character",
			source: "Custom",
			page: 1,
			race: {
				name: "Human",
				source: "PHB"
			},
			class: [{
				name: "Fighter",
				source: "PHB",
				level: 1,
				subclass: {
					name: "Champion",
					shortName: "Champion",
					source: "PHB"
				}
			}],
			background: {
				name: "Acolyte",
				source: "PHB"
			},
			alignment: ["L", "G"],
			ac: [{
				ac: 10,
				from: ["natural"]
			}],
			hp: {
				average: 8,
				formula: "1d8",
				current: 8,
				max: 8,
				temp: 0
			},
			speed: {
				walk: 30
			},
			str: 10,
			dex: 10,
			con: 10,
			int: 10,
			wis: 10,
			cha: 10,
			proficiencyBonus: "+2",
			equipment: [],
			trait: [],
			action: [],
			customText: "This is where you can add custom character description and notes. You can include backstory, personality traits, bonds, ideals, flaws, and any other information about your character.",
			fluff: {
				entries: [
					"This character is a blank template ready to be customized.",
					"You can add detailed background information here.",
					"Include physical description, personality traits, and character history."
				]
			},
			_fSource: 'ADD_YOUR_NAME_HERE'
		};
		this.ace.setValue(JSON.stringify(template, null, 2), 1);
	}

	/**
	 * Calculate total character level from class levels
	 * @param {Object} characterData - The character data object
	 * @returns {number} Total level
	 */
	static getCharacterLevel(characterData) {
		if (!characterData || !characterData.class || !Array.isArray(characterData.class)) {
			return 0;
		}
		return characterData.class.reduce((total, cls) => {
			return total + (cls.level || 0);
		}, 0);
	}

	bindEvents() {
		// Load Template button
		document.getElementById('loadTemplate').addEventListener('click', () => {
			this.loadTemplate();
		});

		// Validate JSON button
		document.getElementById('validateJson').addEventListener('click', () => {
			this.validateJson();
		});

		// Render button
		document.getElementById('charRender').addEventListener('click', () => {
			this.renderCharacter();
		});

		// Save button
		document.getElementById('saveCharacter').addEventListener('click', () => {
			this.saveCharacter();
		});

		// Reset button
		document.getElementById('charReset').addEventListener('click', () => {
			if (isEditMode) {
				this.loadCharacterForEdit();
			} else {
				this.loadTemplate();
			}
		});
	}

	validateJson() {
		try {
			const jsonText = this.ace.getValue();
			JSON.parse(jsonText);
			document.getElementById('message').textContent = 'JSON is valid';
			document.getElementById('message').style.color = 'green';
		} catch (e) {
			document.getElementById('message').textContent = 'JSON Error: ' + e.message;
			document.getElementById('message').style.color = 'red';
		}
	}

	renderCharacter() {
		try {
			const jsonText = this.ace.getValue();
			const characterData = JSON.parse(jsonText);

			// Process the character data first to add computed fields
			this._processCharacterData(characterData);

			// Use the existing 5etools character rendering system
			const fn = Renderer.hover.getFnRenderCompact(UrlUtil.PG_CHARACTERS);
			const renderedContent = fn(characterData);

			// Clear and populate the output area using the same structure as characters page
			const $output = $('#pagecontent');
			$output.empty().append(renderedContent);

			// Bind listeners for dice rolling and other interactions using existing system
			const fnBind = Renderer.hover.getFnBindListenersCompact(UrlUtil.PG_CHARACTERS);
			if (fnBind) fnBind(characterData, $output[0]);

			document.getElementById('message').textContent = 'Character rendered successfully';
			document.getElementById('message').style.color = 'green';
		} catch (e) {
			console.error('Render error:', e);
			document.getElementById('message').textContent = 'Render Error: ' + e.message;
			document.getElementById('message').style.color = 'red';
		}
	}

	_processCharacterData(character) {
		// Add computed fields that the filters and rendering system expect
		if (character.race) {
			character._fRace = character.race.variant ? `Variant ${character.race.name}` : character.race.name;
		}
		if (character.class && Array.isArray(character.class)) {
			character._fClass = character.class.map(cls => cls.name).join("/");
			// Calculate total level from class levels
			character._fLevel = CharacterEditorPage.getCharacterLevel(character);
		}
		if (character.background) {
			character._fBackground = character.background.name;
		}

		// Ensure we have the standard character structure for rendering
		// If the character uses the 'entries' format, convert some fields back to standard format
		if (character.entries && !character.trait && !character.action) {
			this._convertEntriesFormat(character);
		}
	}

	_convertEntriesFormat(character) {
		// Convert from structured entries format to flat format for compatibility
		if (!character.entries) return;

		character.trait = character.trait || [];
		character.action = character.action || [];

		for (const entry of character.entries) {
			if (entry.name === "Features & Traits" && entry.entries) {
				for (const trait of entry.entries) {
					if (trait.type === "entries" && trait.name) {
						character.trait.push({
							name: trait.name,
							entries: trait.entries
						});
					}
				}
			} else if (entry.name === "Actions" && entry.entries) {
				for (const action of entry.entries) {
					if (action.type === "entries" && action.name) {
						character.action.push({
							name: action.name,
							entries: action.entries
						});
					}
				}
			} else if (entry.name === "Background & Personality") {
				// Add to fluff or customText
				if (!character.customText) {
					character.customText = entry.entries.join(" ");
				}
				if (!character.fluff) {
					character.fluff = { entries: entry.entries };
				}
			}
		}
	}

	async saveCharacter() {
		try {
			const jsonText = this.ace.getValue();
			const characterData = JSON.parse(jsonText);

			if (isEditMode && currentCharacterData) {
				// Update existing character
				await this.updateCharacterInAPI(characterData);
				document.getElementById('message').textContent = 'Character updated successfully';
			} else {
				// Save new character
				await this.saveNewCharacterToAPI(characterData);
				document.getElementById('message').textContent = 'Character saved successfully';
			}
			document.getElementById('message').style.color = 'green';
		} catch (e) {
			console.error('Save error:', e);
			document.getElementById('message').textContent = 'Save Error: ' + e.message;
			document.getElementById('message').style.color = 'red';
		}
	}

	async updateCharacterInAPI(updatedCharacter) {
		// Update localStorage for immediate use
		localStorage.setItem('editingCharacter', JSON.stringify(updatedCharacter));

		try {
			const response = await fetch('/api/characters/save', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					characterData: updatedCharacter,
					isEdit: true,
					characterId: currentCharacterData ? this.generateCharacterId(currentCharacterData.name) : this.generateCharacterId(updatedCharacter.name)
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to update character');
			}

			const result = await response.json();
			console.log('Character updated:', result);

			// Show instructions to user about manual save
			if (result.instructions) {
				this.showSaveInstructions(result);
			}

			// Update local state
			currentCharacterData = updatedCharacter;
			localStorage.setItem('editingCharacter', JSON.stringify(updatedCharacter));

			return result;
		} catch (error) {
			throw new Error('Failed to update character: ' + error.message);
		}
	}

	async saveNewCharacterToAPI(characterData) {
		try {
			const response = await fetch('/api/characters/save', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					characterData: characterData,
					isEdit: false,
					characterId: this.generateCharacterId(characterData.name)
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to save character');
			}

			const result = await response.json();
			console.log('Character saved:', result);

			// Show instructions to user about manual save
			if (result.instructions) {
				this.showSaveInstructions(result);
			}

			// Update local state for potential future edits
			currentCharacterData = characterData;
			isEditMode = true;
			localStorage.setItem('editingCharacter', JSON.stringify(characterData));

			// Update URL to reflect edit mode
			const newUrl = new URL(window.location);
			newUrl.searchParams.set('edit', 'true');
			window.history.replaceState({}, '', newUrl);

			return result;
		} catch (error) {
			throw new Error('Failed to save character: ' + error.message);
		}
	}

	showSaveInstructions(result) {
		const messageEl = document.getElementById('message');
		if (result.instructions && result.instructions.note) {
			const instructionsHtml = `
				<div style="background: #f8f9fa; border: 1px solid #dee2e6; padding: 10px; margin: 10px 0; border-radius: 4px;">
					<strong>Save Instructions:</strong><br>
					${result.instructions.note}<br>
					${result.instructions.suggestion ? `<em>${result.instructions.suggestion}</em><br>` : ''}
					${result.localPath ? `Save to: <code>${result.localPath}</code><br>` : ''}
					<details style="margin-top: 10px;">
						<summary>Generated JSON Data (click to expand)</summary>
						<pre style="background: #f1f3f4; padding: 10px; margin: 5px 0; border-radius: 4px; max-height: 200px; overflow-y: auto;"><code>${JSON.stringify(result.data, null, 2)}</code></pre>
					</details>
				</div>
			`;
			messageEl.innerHTML = instructionsHtml;
		}
	}

	async _updateCharacterInCache(updatedCharacter) {
		// Update the character in the DataLoader cache so it's immediately available
		if (typeof DataLoader !== 'undefined' && DataLoader._pCache_addEntityToCache) {
			// Process the character data to match the expected format
			this._processCharacterData(updatedCharacter);

			// Add/update the character in the cache
			const hashBuilder = UrlUtil.URL_TO_HASH_BUILDER['character'];
			if (hashBuilder) {
				DataLoader._pCache_addEntityToCache({
					prop: 'character',
					hashBuilder,
					ent: updatedCharacter
				});
			}
		}
	}

	async _invalidateCharacterPageCache(updatedCharacter) {
		// Force refresh of the characters page cache
		try {
			// Clear the service worker cache for character data
			if ('caches' in window) {
				const cacheNames = await caches.keys();
				for (const cacheName of cacheNames) {
					const cache = await caches.open(cacheName);
					// Remove character-related cache entries
					const requests = await cache.keys();
					for (const request of requests) {
						if (request.url.includes('character') || request.url.includes(updatedCharacter.source?.toLowerCase())) {
							await cache.delete(request);
						}
					}
				}
			}

			// Also invalidate any preloaded character data
			if (typeof DataLoader !== 'undefined' && DataLoader._CACHE) {
				// Force reload of character data next time
				const source = updatedCharacter.source?.toLowerCase() || 'custom';
				// This will cause the characters page to reload fresh data
				console.log('Invalidated cache for character source:', source);
			}
		} catch (e) {
			console.warn('Could not invalidate cache:', e);
		}
	}

	async _notifyServiceWorkerUpdate(updatedCharacter) {
		// Send message to service worker about character update
		try {
			if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
				const message = {
					type: 'CHARACTER_UPDATED',
					payload: {
						character: updatedCharacter,
						source: updatedCharacter.source?.toLowerCase() || 'custom',
						timestamp: Date.now()
					}
				};

				navigator.serviceWorker.controller.postMessage(message);
				console.log('Notified service worker about character update');
			}
		} catch (e) {
			console.warn('Could not notify service worker:', e);
		}
	}

	async saveNewCharacter(characterData) {
		try {
			// Generate a unique ID for new character
			const characterId = this.generateCharacterId(characterData.name);
			const apiUrl = '/api/characters';

			// Prepare character data for database
			const characterPayload = {
				...characterData,
				id: characterId,
				created: new Date().toISOString(),
				lastModified: new Date().toISOString()
			};

			// Make POST request to create new character
			const response = await fetch(apiUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(characterPayload),
				timeout: 10000 // 10 second timeout
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const result = await response.json();
			console.log('Character created successfully:', result);

			// Update current character data with the returned ID
			currentCharacterData = result;
			isEditMode = true;

			// Update URL to reflect edit mode
			const newUrl = new URL(window.location);
			newUrl.searchParams.set('edit', 'true');
			window.history.replaceState({}, '', newUrl);

			return true;
		} catch (e) {
			console.error('Failed to create character in database:', e);

			// If database save fails, fall back to local storage only
			console.warn('Database save failed, storing locally only');
			document.getElementById('message').textContent = 'Saved locally (database unavailable)';
			document.getElementById('message').style.color = 'orange';

			// Update current character data for local editing
			currentCharacterData = characterPayload;
			isEditMode = true;

			// Update URL to reflect edit mode
			const newUrl = new URL(window.location);
			newUrl.searchParams.set('edit', 'true');
			window.history.replaceState({}, '', newUrl);

			return true; // Don't throw error, allow local-only operation
		}
	}

	generateCharacterId(name) {
		// Simple ID generation - replace spaces with dashes, lowercase
		return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
	}
}

// Initialize when page loads
window.addEventListener('load', () => {
	editor = new CharacterEditorPage();
});
