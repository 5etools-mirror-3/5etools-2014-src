let editor;
let currentCharacterData = null;
let currentCharacterId = null;
let isEditMode = false;
let currentSource = null;
let hasSourceAccess = false;

// API configuration
const API_BASE_URL = window.location.origin.includes('localhost')
  ? 'http://localhost:3000/api'
  : '/api';

// Source Password Management
class SourcePasswordManager {
	static STORAGE_KEY = 'sourcePasswords';

	// Get all cached passwords from localStorage
	static getCachedPasswords() {
		try {
			const stored = localStorage.getItem(this.STORAGE_KEY);
			return stored ? JSON.parse(stored) : {};
		} catch (e) {
			console.error('Error loading cached passwords:', e);
			return {};
		}
	}

	// Cache a password for a source
	static cachePassword(sourceName, password) {
		try {
			const passwords = this.getCachedPasswords();
			passwords[sourceName] = password;
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(passwords));
			return true;
		} catch (e) {
			console.error('Error caching password:', e);
			return false;
		}
	}

	// Get cached password for a source
	static getCachedPassword(sourceName) {
		const passwords = this.getCachedPasswords();
		return passwords[sourceName] || null;
	}

	// Remove cached password for a source
	static removeCachedPassword(sourceName) {
		try {
			const passwords = this.getCachedPasswords();
			delete passwords[sourceName];
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(passwords));
			return true;
		} catch (e) {
			console.error('Error removing cached password:', e);
			return false;
		}
	}

	// Check if password is valid for a source
	static async validatePassword(sourceName, password) {
		try {
			const response = await fetch(`${API_BASE_URL}/sources/validate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ source: sourceName, password })
			});

			if (response.ok) {
				const result = await response.json();
				return result.valid === true;
			}
			return false;
		} catch (e) {
			console.error('Error validating password:', e);
			return false;
		}
	}

	// Create a new source with password
	static async createSource(sourceName, password) {
		try {
			const response = await fetch(`${API_BASE_URL}/sources/create`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ source: sourceName, password })
			});

			if (response.ok) {
				const result = await response.json();
				return result.success === true;
			}
			return false;
		} catch (e) {
			console.error('Error creating source:', e);
			return false;
		}
	}
}

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

		// Initialize source display
		setTimeout(() => {
			this.updateSourceDisplay();
			this.renderCharacter();
		}, 500);
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
		// Check if a specific source was requested
		const urlParams = new URLSearchParams(window.location.search);
		const requestedSource = urlParams.get('source') || localStorage.getItem('newCharacterSource');

		// Clear the localStorage item after using it
		if (localStorage.getItem('newCharacterSource')) {
			localStorage.removeItem('newCharacterSource');
		}

		// Generate random character data
		const randomName = this.generateRandomName();
		const randomRace = this.generateRandomRace();
		const randomClass = this.generateRandomClass();

		// Default character template with custom content example
		const template = {
			name: randomName,
			source: requestedSource || "ADD_YOUR_NAME_HERE",
			race: randomRace,
			class: [randomClass],
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
			passive: 10,
			"save": {
				"wis": "+0",
				"cha": "+0"
			},
			"skill": {
				"deception": "+0",
				"insight": "+0",
				"investigation": "+0",
				"perception": "+0",
				"survival": "+0"
			},
			proficiencyBonus: "+2",
			"action": [
				{
					"name": "{@item Longsword|phb}",
					"entries": [
					"{@atk rm} {@hit 4} ({@damage 1d6})"
					]
				}
			],
			"entries": [
			{
				"type": "entries",
				"name": "Background & Personality",
				"entries": [
				"This is where you can add information about the background and personality of your character. The entries section here is highly editable and you can add a lot of stuff about your character. "
				]
			},    {
      "type": "section",
      "name": "Spellcasting",
      "entries": [
        "2/2 spell slots available",
        "Spell casting ability charisma",
        "Spell save DC 15",
        "Spell Attack Bonus  {@d20 +1}",
        {
          "type": "entries",
          "name": "Cantrips",
          "entries": [
            {
              "type": "list",
              "items": [
                "{@spell Poison Spray}",
              ]
            }
          ]
        },
        {
          "type": "entries",
          "name": "Level 1",
          "entries": [
            {
              "type": "list",
              "items": [
                "{@spell Fireball}",
              ]
            }
          ]
        },
      ]
    },
    {
      "type": "section",
      "name": "Items",
      "entries": [
        "{@item leather armor|phb|Leather} Armor",
        "{@item Staff|phb}",
        "{@item Dungeoneer's Pack|phb}",
      ]
    },],
			fluff: {
				entries: [
					"This character is a blank template ready to be customized.",
					"You can add detailed background information here.",
					"Include physical description, personality traits, and character history."
				]
			}
		};
		this.ace.setValue(JSON.stringify(template, null, 2), 1);
	}

	// Random character generation methods
	generateRandomName() {
		const firstNames = [
			"Aeliana", "Bael", "Caelynn", "Dain", "Elara", "Finn", "Gwen", "Hale", "Ivy", "Jace",
			"Kira", "Lyra", "Mira", "Nolan", "Ora", "Pike", "Quinn", "Ren", "Sage", "Tara",
			"Una", "Vale", "Wren", "Xara", "Yara", "Zara", "Aven", "Brix", "Cora", "Dex",
			"Ember", "Fox", "Gray", "Haven", "Iris", "Juno", "Kane", "Luna", "Max", "Nova",
			"Onyx", "Phoenix", "Rain", "Storm", "Vale", "Winter", "Ash", "Blaze", "Clay", "Dawn"
		];

		const lastNames = [
			"Brightblade", "Stormwind", "Ironforge", "Goldleaf", "Shadowhawk", "Fireborn", "Starweaver", "Moonwhisper",
			"Dragonbane", "Thornfield", "Blackwood", "Silverstone", "Redmane", "Whiteheart", "Greycloak", "Blueshield",
			"Swiftarrow", "Stronghammer", "Lightbringer", "Darkbane", "Frostborn", "Emberfall", "Windwalker", "Earthshaker",
			"Skyrender", "Voidcaller", "Sunblade", "Nightfall", "Dawnbreaker", "Duskweaver", "Starfinder", "Moontide",
			"Flameheart", "Iceborn", "Stormcaller", "Thunderstrike", "Lightforge", "Shadowmend", "Wildborn", "Freewind"
		];

		const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
		const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
		return `${firstName} ${lastName}`;
	}

	generateRandomRace() {
		const races = [
			{ name: "Human", source: "PHB" },
			{ name: "Elf", source: "PHB", subrace: "High Elf" },
			{ name: "Dwarf", source: "PHB", subrace: "Mountain Dwarf" },
			{ name: "Halfling", source: "PHB", subrace: "Lightfoot" },
			{ name: "Dragonborn", source: "PHB" },
			{ name: "Gnome", source: "PHB", subrace: "Forest Gnome" },
			{ name: "Half-Elf", source: "PHB" },
			{ name: "Half-Orc", source: "PHB" },
			{ name: "Tiefling", source: "PHB" },
			{ name: "Elf", source: "PHB", subrace: "Wood Elf" },
			{ name: "Dwarf", source: "PHB", subrace: "Hill Dwarf" },
			{ name: "Halfling", source: "PHB", subrace: "Stout" },
			{ name: "Gnome", source: "PHB", subrace: "Rock Gnome" },
			{ name: "Elf", source: "PHB", subrace: "Dark Elf (Drow)" }
		];

		const selectedRace = races[Math.floor(Math.random() * races.length)];
		const race = {
			name: selectedRace.name,
			source: selectedRace.source
		};

		if (selectedRace.subrace) {
			race.subrace = selectedRace.subrace;
		}

		return race;
	}

	generateRandomClass() {
		const classes = [
			{
				name: "Fighter",
				source: "PHB",
				subclasses: [
					{ name: "Champion", shortName: "Champion", source: "PHB" },
					{ name: "Battle Master", shortName: "Battle Master", source: "PHB" },
					{ name: "Eldritch Knight", shortName: "Eldritch Knight", source: "PHB" }
				]
			},
			{
				name: "Wizard",
				source: "PHB",
				subclasses: [
					{ name: "School of Evocation", shortName: "Evocation", source: "PHB" },
					{ name: "School of Abjuration", shortName: "Abjuration", source: "PHB" },
					{ name: "School of Divination", shortName: "Divination", source: "PHB" }
				]
			},
			{
				name: "Rogue",
				source: "PHB",
				subclasses: [
					{ name: "Thief", shortName: "Thief", source: "PHB" },
					{ name: "Assassin", shortName: "Assassin", source: "PHB" },
					{ name: "Arcane Trickster", shortName: "Arcane Trickster", source: "PHB" }
				]
			},
			{
				name: "Cleric",
				source: "PHB",
				subclasses: [
					{ name: "Life Domain", shortName: "Life", source: "PHB" },
					{ name: "Light Domain", shortName: "Light", source: "PHB" },
					{ name: "War Domain", shortName: "War", source: "PHB" }
				]
			},
			{
				name: "Ranger",
				source: "PHB",
				subclasses: [
					{ name: "Hunter", shortName: "Hunter", source: "PHB" },
					{ name: "Beast Master", shortName: "Beast Master", source: "PHB" }
				]
			},
			{
				name: "Paladin",
				source: "PHB",
				subclasses: [
					{ name: "Oath of Devotion", shortName: "Devotion", source: "PHB" },
					{ name: "Oath of the Ancients", shortName: "Ancients", source: "PHB" },
					{ name: "Oath of Vengeance", shortName: "Vengeance", source: "PHB" }
				]
			},
			{
				name: "Barbarian",
				source: "PHB",
				subclasses: [
					{ name: "Path of the Berserker", shortName: "Berserker", source: "PHB" },
					{ name: "Path of the Totem Warrior", shortName: "Totem Warrior", source: "PHB" }
				]
			},
			{
				name: "Bard",
				source: "PHB",
				subclasses: [
					{ name: "College of Lore", shortName: "Lore", source: "PHB" },
					{ name: "College of Valor", shortName: "Valor", source: "PHB" }
				]
			},
			{
				name: "Druid",
				source: "PHB",
				subclasses: [
					{ name: "Circle of the Land", shortName: "Land", source: "PHB" },
					{ name: "Circle of the Moon", shortName: "Moon", source: "PHB" }
				]
			},
			{
				name: "Monk",
				source: "PHB",
				subclasses: [
					{ name: "Way of the Open Hand", shortName: "Open Hand", source: "PHB" },
					{ name: "Way of Shadow", shortName: "Shadow", source: "PHB" },
					{ name: "Way of the Four Elements", shortName: "Four Elements", source: "PHB" }
				]
			},
			{
				name: "Sorcerer",
				source: "PHB",
				subclasses: [
					{ name: "Draconic Bloodline", shortName: "Draconic", source: "PHB" },
					{ name: "Wild Magic", shortName: "Wild Magic", source: "PHB" }
				]
			},
			{
				name: "Warlock",
				source: "PHB",
				subclasses: [
					{ name: "The Fiend", shortName: "Fiend", source: "PHB" },
					{ name: "The Great Old One", shortName: "Great Old One", source: "PHB" },
					{ name: "The Archfey", shortName: "Archfey", source: "PHB" }
				]
			}
		];

		const selectedClass = classes[Math.floor(Math.random() * classes.length)];
		const randomSubclass = selectedClass.subclasses[Math.floor(Math.random() * selectedClass.subclasses.length)];

		return {
			name: selectedClass.name,
			source: selectedClass.source,
			level: 1,
			subclass: randomSubclass
		};
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

	// Utility function to debounce calls
	debounce(func, wait) {
		let timeout;
		return function(...args) {
			const context = this;
			clearTimeout(timeout);
			timeout = setTimeout(() => func.apply(context, args), wait);
		};
	}

	// Debounced render method
	debouncedRenderCharacter = this.debounce(this.renderCharacter, 300);

	bindEvents() {
		// Render button
		document.getElementById('charRender').addEventListener('click', () => {
			this.renderCharacter();
		});

		// Save button
		document.getElementById('saveCharacter').addEventListener('click', () => {
			this.saveCharacter();
		});

		// Delete button with triple confirmation
		document.getElementById('deleteCharacter').addEventListener('click', () => {
			this.deleteCharacter();
		});

		// Note: Source password management moved to sources.html page

		// Watch for JSON changes to update source display and render preview
		this.ace.session.on('change', () => {
			this.updateSourceDisplay();
			this.debouncedRenderCharacter();
		});

		// Update button visibility based on edit mode
		this.updateButtonVisibility();
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
			// Create detailed class display with subclasses
			character._fClass = character.class.map(cls => {
				let classStr = cls.name;
				if (cls.subclass && cls.subclass.name) {
					classStr += ` (${cls.subclass.name})`;
				}
				return classStr;
			}).join("/");

			// Also create a simple class list for filtering/search
			character._fClassSimple = character.class.map(cls => cls.name).join("/");

			// Calculate total level from class levels
			character._fLevel = CharacterEditorPage.getCharacterLevel(character);
		} else {
			character._fLevel = 1;
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

			// Auto-set source if missing or default
			const currentSource = this.getCurrentSourceName(characterData);
			if (!characterData.source || characterData.source === 'MyCharacters' || characterData.source === 'ADD_YOUR_NAME_HERE') {
				characterData.source = currentSource;
				// Update the JSON in the editor to reflect the change
				this.ace.setValue(JSON.stringify(characterData, null, 2));
			}

			// Check source password before saving
			if (!await this.validateSourceAccess(characterData.source)) {
				document.getElementById('message').textContent = 'Access denied: Invalid or missing password for this source';
				document.getElementById('message').style.color = 'red';
				return;
			}

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
			let errorMessage = 'Save Error: ' + e.message;

			// Provide helpful guidance for authentication errors
			if (e.message.includes('Access denied') || e.message.includes('Invalid or missing password')) {
				errorMessage += '\n\nTo fix this:\n1. Go to Source Management (gear icon)\n2. Create a new source with a password\n3. Or verify your password for the existing source';
			} else if (e.message.includes('No cached password found')) {
				errorMessage += '\n\nPlease go to Source Management (gear icon) and login to your source first.';
			}

			document.getElementById('message').textContent = errorMessage;
			document.getElementById('message').style.color = 'red';
			document.getElementById('message').style.whiteSpace = 'pre-line'; // Allow line breaks in error message
		}
	}

	async updateCharacterInAPI(updatedCharacter) {
		// Update localStorage for immediate use
		localStorage.setItem('editingCharacter', JSON.stringify(updatedCharacter));

		// Get password from localStorage cache
		const currentSource = this.getCurrentSourceName(updatedCharacter);
		const sanitizedSource = this.sanitizeSourceName(currentSource);
		const password = SourcePasswordManager.getCachedPassword(sanitizedSource);

		if (!password) {
			const cachedSources = Object.keys(SourcePasswordManager.getCachedPasswords());
			let errorMsg = `Error: No cached password found for source "${currentSource}" (sanitized: "${sanitizedSource}").`;
			if (cachedSources.length > 0) {
				errorMsg += ` Available sources: ${cachedSources.join(', ')}. Please update the "source" field in your character JSON or visit Source Management.`;
			} else {
				errorMsg += ` Please visit Source Management to create and login to a source first.`;
			}
			document.getElementById('message').textContent = errorMsg;
			document.getElementById('message').style.color = 'red';
			return;
		}

		try {
			const response = await fetch('/api/characters/save', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					characterData: updatedCharacter,
					source: updatedCharacter.source,
					password: password,
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

			// Clear any cached character data to ensure fresh loads
			this.clearCharacterCache();

			// Ask if user wants to view the character on the characters page
			setTimeout(() => {
				if (confirm('Character updated successfully! Would you like to view it on the characters page?')) {
					const characterAnchor = this.generateCharacterAnchor(updatedCharacter.name, updatedCharacter.source);
					window.location.href = `characters.html${characterAnchor}`;
				}
			}, 1000);

			return result;
		} catch (error) {
			throw new Error('Failed to update character: ' + error.message);
		}
	}

	async saveNewCharacterToAPI(characterData) {
		// Get password from localStorage cache
		const currentSource = this.getCurrentSourceName(characterData);
		const sanitizedSource = this.sanitizeSourceName(currentSource);
		const password = SourcePasswordManager.getCachedPassword(sanitizedSource);

		if (!password) {
			const cachedSources = Object.keys(SourcePasswordManager.getCachedPasswords());
			let errorMsg = `Error: No cached password found for source "${currentSource}" (sanitized: "${sanitizedSource}").`;
			if (cachedSources.length > 0) {
				errorMsg += ` Available sources: ${cachedSources.join(', ')}. Please update the "source" field in your character JSON or visit Source Management.`;
			} else {
				errorMsg += ` Please visit Source Management to create and login to a source first.`;
			}
			document.getElementById('message').textContent = errorMsg;
			document.getElementById('message').style.color = 'red';
			return;
		}

		try {
			const response = await fetch('/api/characters/save', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					characterData: characterData,
					source: characterData.source,
					password: password,
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

			// Clear any cached character data to ensure fresh loads
			this.clearCharacterCache();

			// Update URL to reflect edit mode
			const newUrl = new URL(window.location.href);
			newUrl.searchParams.set('edit', 'true');
			window.history.replaceState({}, '', newUrl);

			// Update button visibility to show delete button
			this.updateButtonVisibility();

			// Ask if user wants to view the character on the characters page
			setTimeout(() => {
				if (confirm('Character saved successfully! Would you like to view it on the characters page?')) {
					const characterAnchor = this.generateCharacterAnchor(characterData.name);
					window.location.href = `characters.html${characterAnchor}`;
				}
			}, 1000);

			return result;
		} catch (error) {
			throw new Error('Failed to save character: ' + error.message);
		}
	}

	showSaveInstructions(result) {
		const messageEl = document.getElementById('message');
		if (result.instructions && result.instructions.note) {
			const instructionsHtml = `
				<div style="border: 1px solid #dee2e6; padding: 10px; margin: 10px 0; border-radius: 4px;">
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
				body: JSON.stringify(characterPayload)
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
			const newUrl = new URL(window.location.href);
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
			const newUrl = new URL(window.location.href);
			newUrl.searchParams.set('edit', 'true');
			window.history.replaceState({}, '', newUrl);

			return true; // Don't throw error, allow local-only operation
		}
	}

	updateButtonVisibility() {
		const deleteButton = document.getElementById('deleteCharacter');
		if (deleteButton) {
			deleteButton.style.display = isEditMode ? 'inline-block' : 'none';
		}
	}

	async deleteCharacter() {
		// Only allow deletion in edit mode
		if (!isEditMode || !currentCharacterData) {
			document.getElementById('message').textContent = 'Can only delete saved characters';
			document.getElementById('message').style.color = 'red';
			return;
		}

		const characterName = currentCharacterData.name || 'Unknown Character';

		// First confirmation
		if (!confirm(`Are you sure you want to delete "${characterName}"? This action cannot be undone.`)) {
			return;
		}

		// Second confirmation
		if (!confirm(`This will permanently delete "${characterName}". Are you absolutely sure?`)) {
			return;
		}

		// Third confirmation - require typing the character name
		const typedName = prompt(`To confirm deletion, please type the character name exactly: "${characterName}"`);
		if (typedName !== characterName) {
			document.getElementById('message').textContent = 'Character name did not match. Deletion cancelled.';
			document.getElementById('message').style.color = 'orange';
			return;
		}

		// Get password from localStorage cache (same as save functionality)
		const currentSource = this.getCurrentSourceName(currentCharacterData);
		const sanitizedSource = this.sanitizeSourceName(currentSource);
		const password = SourcePasswordManager.getCachedPassword(sanitizedSource);

		if (!password) {
			const cachedSources = Object.keys(SourcePasswordManager.getCachedPasswords());
			let errorMsg = `Error: No cached password found for source "${currentSource}" (sanitized: "${sanitizedSource}").`;
			if (cachedSources.length > 0) {
				errorMsg += ` Available sources: ${cachedSources.join(', ')}. Please update the "source" field or visit Source Management.`;
			} else {
				errorMsg += ` Please visit Source Management to login to a source first.`;
			}
			document.getElementById('message').textContent = errorMsg;
			document.getElementById('message').style.color = 'red';
			return;
		}

		try {
			const characterId = this.generateCharacterId(characterName);
			const characterSource = currentCharacterData.source;
			
			if (!characterSource) {
				throw new Error('Character has no source specified - cannot delete');
			}
			
			document.getElementById('message').textContent = 'Authenticating and deleting character...';
			document.getElementById('message').style.color = 'orange';
			
			const response = await fetch('/api/characters/delete', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					characterId: characterId,
					source: characterSource,
					password: password
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to delete character');
			}

			const result = await response.json();
			console.log('Character deleted:', result);

			// Clear local state
			currentCharacterData = null;
			isEditMode = false;
			localStorage.removeItem('editingCharacter');

			// Update URL to remove edit mode
			const newUrl = new URL(window.location.href);
			newUrl.searchParams.delete('edit');
			window.history.replaceState({}, '', newUrl);

			// Update button visibility
			this.updateButtonVisibility();

			// Load template to reset editor
			this.loadTemplate();

			// Show success message
			document.getElementById('message').textContent = `Character "${characterName}" deleted successfully`;
			document.getElementById('message').style.color = 'green';

			// Optionally redirect to characters page after a delay
			setTimeout(() => {
				if (confirm('Character deleted. Would you like to go to the characters page?')) {
					window.location.href = 'characters.html';
				}
			}, 2000);

		} catch (error) {
			console.error('Delete error:', error);
			document.getElementById('message').textContent = 'Delete Error: ' + error.message;
			document.getElementById('message').style.color = 'red';
		}
	}

	generateCharacterId(name) {
		// Simple ID generation - replace spaces with dashes, lowercase
		return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
	}

	getCurrentSourceName(characterData) {
		// Get source name from character data
		const sourceFromData = characterData?.source;
		if (sourceFromData && sourceFromData !== 'MyCharacters' && sourceFromData !== 'ADD_YOUR_NAME_HERE') {
			return sourceFromData;
		}

		// Check if user came from sources page with a pre-set source
		const urlParams = new URLSearchParams(window.location.search);
		const sourceFromUrl = urlParams.get('source');
		if (sourceFromUrl) {
			return sourceFromUrl;
		}

		// Check if there's a cached source from localStorage
		const newCharacterSource = localStorage.getItem('newCharacterSource');
		if (newCharacterSource) {
			// Clear it after using it once
			localStorage.removeItem('newCharacterSource');
			return newCharacterSource;
		}

		// Check for any cached sources - use the first one
		const cachedPasswords = SourcePasswordManager.getCachedPasswords();
		const availableSources = Object.keys(cachedPasswords);
		if (availableSources.length > 0) {
			return availableSources[0];
		}

		// Fallback to 'MyCharacters'
		return 'MyCharacters';
	}

	generateCharacterAnchor(characterName, characterSource) {
		// Properly encode characterName and characterSource
		const encodedName = encodeURIComponent(characterName); // Encode the raw name
		const encodedSource = encodeURIComponent(characterSource);
		return `#${encodedName}_${encodedSource}`.toLowerCase();
	}

	// Source Password Management UI Methods
	updateSourceDisplay() {
		try {
			const jsonText = this.ace.getValue();
			const characterData = JSON.parse(jsonText);
			const sourceName = characterData.source || 'Not set';

			// document.getElementById('current-source').textContent = sourceName;
			currentSource = sourceName !== 'Not set' ? sourceName : null;

			// Update source status display
			this.updateSourceStatus();
		} catch (e) {
			currentSource = null;
		}
	}

	updateSourceStatus() {
		const statusEl = document.getElementById('source-status');

		// Get the current character data to determine the best source
		let characterData = {};
		try {
			const jsonText = this.ace.getValue();
			characterData = JSON.parse(jsonText);
		} catch (e) {
			// Ignore parsing errors for status display
		}

		const detectedSource = this.getCurrentSourceName(characterData);
		const cachedSources = Object.keys(SourcePasswordManager.getCachedPasswords());

		if (!currentSource) {
			currentSource = detectedSource;
		}

		// Check if this source has a cached password (using sanitized name)
		const sanitizedDetectedSource = this.sanitizeSourceName(detectedSource);
		const cachedPassword = SourcePasswordManager.getCachedPassword(sanitizedDetectedSource);
		if (cachedPassword) {
			statusEl.innerHTML = `Detected password for: "<strong>${detectedSource}</strong>" (authenticated). <a href="sources.html">Manage sources</a>.`;
			hasSourceAccess = true;
		} else if (cachedSources.length > 0) {
			statusEl.innerHTML = `No password found for: "<strong>${detectedSource}</strong>" (not authenticated). Available sources: ${cachedSources.join(', ')}. <a href="sources.html">Login here</a>.`;
			hasSourceAccess = false;
		} else {
			statusEl.innerHTML = `No authenticated character sources found. <a href="sources.html">Create and login to a source</a> to save characters.`;
			hasSourceAccess = false;
		}
	}

	// Source creation functionality moved to sources.html page

	// Sanitize source name the same way the API does
	sanitizeSourceName(sourceName) {
		// Only allow letters, numbers, underscores, and hyphens
		return sourceName.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50).toLowerCase();
	}

	async validateSourceAccess(sourceName) {
		if (!sourceName || sourceName === 'ADD_YOUR_NAME_HERE' || sourceName === 'Not set') {
			return false;
		}

		// Check if we have a cached password for this source (using sanitized name)
		const sanitizedSource = this.sanitizeSourceName(sourceName);
		const cachedPassword = SourcePasswordManager.getCachedPassword(sanitizedSource);
		if (cachedPassword) {
			return true;
		}

		// No cached password found
		console.warn(`No cached password found for source: "${sourceName}" (sanitized: "${sanitizedSource}")`);
		return false;
	}

	clearCharacterCache() {
		// Set a timestamp to indicate when character data was last updated
		localStorage.setItem('characterDataLastUpdated', Date.now().toString());

		// Clear any application-level character cache that might exist
		if (window.characterCache) {
			window.characterCache = null;
		}

		// Trigger a custom event that other parts of the app can listen to
		window.dispatchEvent(new CustomEvent('characterDataUpdated', {
			detail: { timestamp: Date.now() }
		}));
	}
}

// Use dynamic property assignment for characterCache
if (!window['characterCache']) {
    window['characterCache'] = {};
}

// Initialize when page loads
window.addEventListener('load', () => {
	editor = new CharacterEditorPage();
});
