// CharacterManager is available globally via character-manager.js script tag

let editor;
let currentCharacterData = null;
let currentCharacterId = null;
let isEditMode = false;
let currentSource = null;
let hasSourceAccess = false;


// Source Password Management
class CharacterSourcePasswordManager {
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
		this._classDataCache = new Map(); // Cache for loaded class JSON data
		this.initOnLoad();
	}

	async initOnLoad() {
		// Initialize required utilities first
		await Promise.all([
			PrereleaseUtil.pInit(),
			BrewUtil2.pInit(),
		]);

		// Check URL parameters for edit mode and random generation
		const urlParams = new URLSearchParams(window.location.search);
		isEditMode = urlParams.get('edit') === 'true';

		// Initialize ACE editor using 5etools utility
		this.ace = EditorUtil.initEditor("jsoninput", {mode: "ace/mode/json"});

		// Check for random character generation from URL parameters
		const shouldGenerateRandom = urlParams.get('random') === 'true';

		if (shouldGenerateRandom && !isEditMode) {
			// Get generation parameters from URL
			const level = urlParams.get('level') !== null ? parseInt(urlParams.get('level')) : 5;
			const sourceName = urlParams.get('source') || '';
			const characterName = urlParams.get('name') || '';
			const baseClass = urlParams.get('baseClass') || '';
			const race = urlParams.get('race') || '';

			// Generate random character
			console.log(`Generating random level ${level} character for source: ${sourceName} (baseClass: ${baseClass}, race: ${race})`);
			await this.generateRandomCharacterAtLevel(level, characterName, sourceName, baseClass, race);
		} else if (isEditMode) {
			// Load character data if in edit mode
			this.loadCharacterForEdit();
		} else {
			// Load default template
			await this.loadTemplate();
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
			this.ace.setValue(JSON.stringify(currentCharacterData, null, 2), 1);
			document.getElementById('message').textContent = 'Loaded character for editing (from API)';
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
			// Try CharacterManager first for consistency
			const character = CharacterManager.getCharacterById(characterId);
			if (character) {
				currentCharacterData = character;
				currentCharacterId = characterId;
				this.ace.setValue(JSON.stringify(currentCharacterData, null, 2), 1);
				document.getElementById('message').textContent = `Loaded character: ${character.name}`;
				return;
			}

			// Fallback to direct API call if not in CharacterManager cache
			const response = await fetch(`${API_BASE_URL}/characters/${characterId}`);
			if (response.ok) {
				const characterResponse = await response.json();
				currentCharacterData = characterResponse.data;
				currentCharacterId = characterResponse.id;
				this.ace.setValue(JSON.stringify(currentCharacterData, null, 2), 1);
				document.getElementById('message').textContent = `Loaded character: ${characterResponse.name}`;
			} else {
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
			}
		} catch (error) {
			console.error('Error loading character from API:', error);
			document.getElementById('message').textContent = 'Error loading character from API';
		}
	}

	async loadTemplate() {
		// Get URL parameters
		const urlParams = new URLSearchParams(window.location.search);
		const requestedSource = urlParams.get('source') || localStorage.getItem('newCharacterSource');
		// Handle level parameter carefully - 0 is a valid level but falsy
		let requestedLevel;
		const urlLevel = urlParams.get('level');
		const storageLevel = localStorage.getItem('newCharacterLevel');

		if (urlLevel !== null) {
			requestedLevel = parseInt(urlLevel);
		} else if (storageLevel !== null) {
			requestedLevel = parseInt(storageLevel);
		} else {
			requestedLevel = Math.floor(Math.random() * 10) + 1;
		}

		// Clear the source from localStorage if it exists
		if (localStorage.getItem('newCharacterSource')) {
			localStorage.removeItem('newCharacterSource');
		}
		if (localStorage.getItem('newCharacterLevel')) {
			localStorage.removeItem('newCharacterLevel');
		}

		// Special handling for level 0 - create basic character and trigger level up popup
		if (requestedLevel === 0) {
			await this.createLevel0Character(requestedSource);
			return;
		}

		// Generate random character data
		const randomName = this.generateRandomName();
		const randomClasses = this.generateRandomClasses(requestedLevel);
		const randomRace = this.generateRandomRace(randomClasses);
		const randomAlignment = this.generateRandomAlignment();
		const randomBackground = await this.generateRandomBackground(randomRace, randomAlignment);
	const randomAbilityScores = await this.generateRandomAbilityScores(randomClasses, randomRace);
		const randomEquipment = this.generateRandomEquipment(randomClasses, requestedLevel, randomAbilityScores, randomRace);
		const randomActions = this.generateRandomActions(randomClasses, randomAbilityScores);
		const randomSpells = this.generateRandomSpells(randomClasses, requestedLevel, randomAbilityScores);

	// Calculate derived stats
	const totalLevel = randomClasses.reduce((sum, cls) => sum + cls.level, 0);
	const profBonus = this.getProficiencyBonus(totalLevel);
	const conMod = Math.floor((randomAbilityScores.con - 10) / 2);
	const randomHp = this.calculateRandomHp(randomClasses, conMod);

	// Generate character depth first so we can use it in fluff (store as fluff, not as a top-level field)
		const characterDepth = await this.generateCharacterDepth(randomBackground, randomRace, randomClasses, randomAlignment);


		// Generate all features and traits (racial traits + class/subclass features)
		const allFeatureEntries = await this.generateAllFeatureEntries(randomClasses, randomRace);

		// Default character template with random content
		let template = {
			name: randomName,
			source: requestedSource || "ADD_YOUR_NAME_HERE",
			race: randomRace,
			class: randomClasses,
			background: {
				name: randomBackground.name,
				source: randomBackground.source
			},
			alignment: randomAlignment,
			ac: await this.generateRandomAC(randomClasses, randomAbilityScores, randomRace),
			hp: randomHp,
			speed: {
				walk: 30 // Default speed, will be overridden by race data
			},
			...randomAbilityScores,
			passive: 10 + Math.floor((randomAbilityScores.wis - 10) / 2) + (this.hasSkillProficiency("perception", randomClasses) ? profBonus : 0),
			saveProficiencies: await this.generateRandomSaves(randomAbilityScores, randomClasses, profBonus),
			skillProficiencies: await this.generateRandomSkills(randomAbilityScores, randomClasses, profBonus, randomRace, randomBackground),
			proficiencyBonus: `+${profBonus}`,
			deathSaves: {
				successes: 0,
				failures: 0
			},
			customTrackers: this.generateRandomTrackers(randomClasses),
			action: randomActions,
			...(randomSpells && { spells: randomSpells }),
			currency: this.generateRandomCurrency(totalLevel),
			entries: [...await this.generateRandomEntries(randomRace, randomClasses, randomEquipment, randomAbilityScores, randomName, randomBackground, randomAlignment)],
			fluff: {
				entries: 'write notes about the character here'
			}
		};

		// Apply race data to set actual character stats
		template = await this.applyRaceDataToCharacter(randomRace, template);

		// Apply class data to set spellcasting and other class features
		template = await this.applyClassDataToCharacter(randomClasses, template, totalLevel);

		this.ace.setValue(JSON.stringify(template, null, 2), 1);
	}

	async createLevel0Character(requestedSource) {
		// For level 0 characters, we don't populate the editor immediately
		// Instead, we store the basic info and let the wizard generate the full character

		// Get URL parameters to check for specific race
		const urlParams = new URLSearchParams(window.location.search);
		const requestedRace = urlParams.get('race');
		const characterName = this.generateRandomName();

		// Store minimal info needed for the wizard without creating a full character
		this.level0WizardData = {
			name: characterName,
			source: requestedSource || "ADD_YOUR_NAME_HERE",
			// Default to no forced race (treat as random) rather than defaulting to Human
			race: requestedRace || null,
			background: null,
			alignment: null
		};

		// Set editor to empty with just a placeholder message
		const placeholderMessage = {
			name: characterName,
			source: "LEVEL_0_PLACEHOLDER",
			note: "Complete the level-up wizard to generate your character...",
			race: requestedRace || ''
		};

		this.ace.setValue(JSON.stringify(placeholderMessage, null, 2), 1);
		document.getElementById('message').textContent = `Welcome ${characterName}! Complete the wizard to create your level 1 character.`;
		document.getElementById('message').style.color = 'blue';

		// Don't render character yet - wait for wizard completion
		console.log('Level 0 placeholder created, waiting for wizard completion...');

		// Prompt the user to pick background and alignment before starting the wizard
		const { $modalInner, $modalFooter, doClose } = UiUtil.getShowModal({
			title: 'Level 0 - Initial Choices',
			hasFooter: true,
			isWidth100: false
		});

		// Populate dynamically from data files
		$modalInner.html(`
			<div class="form-group">
				<label for="lvl0-race"><strong>Race</strong></label>
				<select id="lvl0-race" class="form-control">
					<option value="">-- Random --</option>
				</select>
			</div>
			<div class="form-group">
				<label for="lvl0-background"><strong>Background</strong></label>
				<select id="lvl0-background" class="form-control">
					<option value="">-- Random --</option>
				</select>
			</div>
			<div class="form-group">
				<label for="lvl0-alignment"><strong>Alignment</strong></label>
				<select id="lvl0-alignment" class="form-control">
					<option value="">-- Random --</option>
					<option value="Lawful Good">Lawful Good</option>
					<option value="Neutral Good">Neutral Good</option>
					<option value="Chaotic Good">Chaotic Good</option>
					<option value="Lawful Neutral">Lawful Neutral</option>
					<option value="True Neutral">True Neutral</option>
					<option value="Chaotic Neutral">Chaotic Neutral</option>
					<option value="Lawful Evil">Lawful Evil</option>
					<option value="Neutral Evil">Neutral Evil</option>
					<option value="Chaotic Evil">Chaotic Evil</option>
				</select>
			</div>
		`);

		// Load races and backgrounds from data files and populate selects
		(async () => {
			try {
				const [rRes, bRes] = await Promise.all([
					fetch('data/races.json'),
					fetch('data/backgrounds.json')
				]);
				const racesJson = await rRes.json();
				const bgsJson = await bRes.json();
				const races = racesJson.race || [];
				const backgrounds = bgsJson.background || [];
				const $race = $modalInner.find('#lvl0-race');
				const $bg = $modalInner.find('#lvl0-background');
				// Add races
				races.forEach(r => {
					$race.append(`<option value="${r.name}">${r.name} (${r.source || ''})</option>`);
				});
				// If URL forced race exists, select it
				if (this.level0WizardData?.race) {
					$race.val(this.level0WizardData.race);
				}
				// Add backgrounds
				backgrounds.forEach(bg => {
					$bg.append(`<option value="${bg.name}">${bg.name} (${bg.source || ''})</option>`);
				});
				if (this.level0WizardData?.background) $bg.val(this.level0WizardData.background);
			} catch (e) {
				console.warn('Could not load races/backgrounds for modal:', e);
			}
		})();

		const $btnCancel = $(`<button class="ve-btn ve-btn-default">Cancel</button>`).click(() => doClose(false));
		const $btnConfirm = $(`<button class="ve-btn ve-btn-primary">Start Wizard</button>`).click(async () => {
			const selectedRace = $modalInner.find('#lvl0-race').val();
			const selectedBg = $modalInner.find('#lvl0-background').val();
			const selectedAl = $modalInner.find('#lvl0-alignment').val();
			
			// Convert race name to full race object
			if (selectedRace) {
				this.level0WizardData.race = this.generateForcedRace(selectedRace);
			} else {
				this.level0WizardData.race = this.level0WizardData.race;
			}
			
			// Convert background name to full background object
			if (selectedBg) {
				this.level0WizardData.background = await this._getBackgroundByName(selectedBg);
			} else {
				this.level0WizardData.background = null;
			}
			
			// Convert alignment string to array format
			if (selectedAl) {
				this.level0WizardData.alignment = this.convertAlignmentStringToArray(selectedAl);
			} else {
				this.level0WizardData.alignment = null;
			}
			
			doClose(true);
			setTimeout(() => this.initiateLevelUpForLevel0(), 200);
		});

		$modalFooter.append($btnCancel).append($btnConfirm);
	}

	async initiateLevelUpForLevel0() {
		try {
			// Create minimal character data for level up state using stored wizard data
			const characterRace = this.generateForcedRace(this.level0WizardData.race);
			// Respect user-selected alignment/background if provided
			const chosenAlignment = this.level0WizardData.alignment || this.generateRandomAlignment();
			let chosenBackground = null;
			if (this.level0WizardData.background) {
				if (typeof this.level0WizardData.background === 'string') {
					chosenBackground = { name: this.level0WizardData.background, source: 'PHB' };
				} else {
					chosenBackground = this.level0WizardData.background;
				}
			} else {
				chosenBackground = await this.generateRandomBackground(characterRace, chosenAlignment);
			}
			const characterData = {
				name: this.level0WizardData.name,
				source: this.level0WizardData.source,
				race: characterRace,
				background: {
					name: chosenBackground.name,
					source: chosenBackground.source
				},
				class: [], // Empty - will be filled by user choice
				// Minimal data needed for the wizard - actual character will be generated later
			};

			// Set up level up state for level 0 -> 1 transition
			this.levelUpState = {
				originalCharacter: JSON.parse(JSON.stringify(characterData)), // Original backup
				characterData: JSON.parse(JSON.stringify(characterData)), // Working copy
				currentLevel: 0,
				newLevel: 1,
				choices: [], // Store user choices here
				pendingFeatures: [], // Features to process
				currentFeatureIndex: 0,
				changes: {
					classLevels: [],
					features: [],
					abilityScores: [],
					hitPoints: 0,
					spellSlots: []
				},
				choices: [],
				pendingFeatures: [],
				currentFeatureIndex: 0
			};

			console.log('Starting level 0 -> 1 character creation');

			// Show success message
			document.getElementById('message').textContent = 'Choose your first class to begin character creation!';
			document.getElementById('message').style.color = 'green';

			// Go directly to class selection modal (the multiclass UI)
			await this.showClassSelectionModal();

		} catch (e) {
			console.error('Error initiating level 0 level up:', e);
			document.getElementById('message').textContent = 'Error reading character data';
			document.getElementById('message').style.color = 'red';
		}
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

	generateRandomRace(classes) {
		// Enhanced race selection with class synergy considerations - expanded race list
		const raceOptions = [
			// Core PHB Races with higher weights for familiarity
			{ name: "Human", source: "PHB", weight: 3 },
			{ name: "Elf", source: "PHB", weight: 3 },
			{ name: "Dwarf", source: "PHB", weight: 3 },
			{ name: "Halfling", source: "PHB", weight: 3 },
			{ name: "Dragonborn", source: "PHB", weight: 2 },
			{ name: "Gnome", source: "PHB", weight: 2 },
			{ name: "Half-Elf", source: "PHB", weight: 2 },
			{ name: "Half-Orc", source: "PHB", weight: 2 },
			{ name: "Tiefling", source: "PHB", weight: 2 },

			// Popular expanded races
			{ name: "Aasimar", source: "MPMM", weight: 2 },
			{ name: "Genasi", source: "MPMM", weight: 2 },
			{ name: "Goliath", source: "MPMM", weight: 2 },
			{ name: "Tabaxi", source: "MPMM", weight: 2 },
			{ name: "Tortle", source: "MPMM", weight: 2 },
			{ name: "Triton", source: "MPMM", weight: 2 },

			// More exotic races with lower weights
			{ name: "Aarakocra", source: "MPMM", weight: 1 },
			{ name: "Bugbear", source: "MPMM", weight: 1 },
			{ name: "Centaur", source: "MPMM", weight: 1 },
			{ name: "Changeling", source: "MPMM", weight: 1 },
			{ name: "Deep Gnome", source: "MPMM", weight: 1 },
			{ name: "Duergar", source: "MPMM", weight: 1 },
			{ name: "Eladrin", source: "MPMM", weight: 1 },
			{ name: "Fairy", source: "MPMM", weight: 1 },
			{ name: "Firbolg", source: "MPMM", weight: 1 },
			{ name: "Githyanki", source: "MPMM", weight: 1 },
			{ name: "Githzerai", source: "MPMM", weight: 1 },
			{ name: "Goblin", source: "MPMM", weight: 1 },
			{ name: "Harengon", source: "MPMM", weight: 1 },
			{ name: "Hobgoblin", source: "MPMM", weight: 1 },
			{ name: "Kenku", source: "MPMM", weight: 1 },
			{ name: "Kobold", source: "MPMM", weight: 1 },
			{ name: "Lizardfolk", source: "MPMM", weight: 1 },
			{ name: "Minotaur", source: "MPMM", weight: 1 },
			{ name: "Orc", source: "MPMM", weight: 1 },
			{ name: "Satyr", source: "MPMM", weight: 1 },
			{ name: "Sea Elf", source: "MPMM", weight: 1 },
			{ name: "Shadar-Kai", source: "MPMM", weight: 1 },
			{ name: "Shifter", source: "MPMM", weight: 1 },
			{ name: "Yuan-Ti", source: "MPMM", weight: 1 }
		];

		// If classes are provided, weight races that synergize well
		let weightedRaces = [];
		if (classes && classes.length > 0) {
			raceOptions.forEach(raceOption => {
				const classSynergy = this.calculateRaceClassSynergy(raceOption, classes);
				const totalWeight = Math.max(1, raceOption.weight * classSynergy);
				for (let i = 0; i < totalWeight; i++) {
					weightedRaces.push(raceOption);
				}
			});
		} else {
			// No class provided - use base weights
			raceOptions.forEach(raceOption => {
				for (let i = 0; i < raceOption.weight; i++) {
					weightedRaces.push(raceOption);
				}
			});
		}

		const selectedRaceOption = weightedRaces[Math.floor(Math.random() * weightedRaces.length)];

		// Return the race structure matching 5etools format
		return {
			name: selectedRaceOption.name,
			source: selectedRaceOption.source
		};
	}

	generateForcedRace(forcedRaceName) {
		// Expanded race options with their source data - matches 5etools structure
		const raceOptions = [
			// Core PHB Races
			{ name: "Human", source: "PHB" },
			{ name: "Elf", source: "PHB" },
			{ name: "Dwarf", source: "PHB" },
			{ name: "Halfling", source: "PHB" },
			{ name: "Dragonborn", source: "PHB" },
			{ name: "Gnome", source: "PHB" },
			{ name: "Half-Elf", source: "PHB" },
			{ name: "Half-Orc", source: "PHB" },
			{ name: "Tiefling", source: "PHB" },

			// Expanded Races from various sources
			{ name: "Aarakocra", source: "MPMM" },
			{ name: "Aasimar", source: "MPMM" },
			{ name: "Bugbear", source: "MPMM" },
			{ name: "Centaur", source: "MPMM" },
			{ name: "Changeling", source: "MPMM" },
			{ name: "Deep Gnome", source: "MPMM" },
			{ name: "Duergar", source: "MPMM" },
			{ name: "Eladrin", source: "MPMM" },
			{ name: "Fairy", source: "MPMM" },
			{ name: "Firbolg", source: "MPMM" },
			{ name: "Genasi", source: "MPMM" },
			{ name: "Githyanki", source: "MPMM" },
			{ name: "Githzerai", source: "MPMM" },
			{ name: "Goblin", source: "MPMM" },
			{ name: "Goliath", source: "MPMM" },
			{ name: "Harengon", source: "MPMM" },
			{ name: "Hobgoblin", source: "MPMM" },
			{ name: "Kenku", source: "MPMM" },
			{ name: "Kobold", source: "MPMM" },
			{ name: "Lizardfolk", source: "MPMM" },
			{ name: "Minotaur", source: "MPMM" },
			{ name: "Orc", source: "MPMM" },
			{ name: "Satyr", source: "MPMM" },
			{ name: "Sea Elf", source: "MPMM" },
			{ name: "Shadar-Kai", source: "MPMM" },
			{ name: "Shifter", source: "MPMM" },
			{ name: "Tabaxi", source: "MPMM" },
			{ name: "Tortle", source: "MPMM" },
			{ name: "Triton", source: "MPMM" },
			{ name: "Yuan-Ti", source: "MPMM" }
		];

		// Find the forced race option
		// If no forced race provided, pick a random non-human race
		if (!forcedRaceName) {
			return this.generateRandomNonHumanRace(raceOptions);
		}

		// Find the forced race option
		const raceOption = raceOptions.find(option => option.name === forcedRaceName);

		if (!raceOption) {
			console.warn(`Unknown race: ${forcedRaceName}, falling back to random non-human`);
			return this.generateRandomNonHumanRace(raceOptions);
		}

		// Return the race structure matching 5etools format
		return {
			name: raceOption.name,
			source: raceOption.source
		};
	}

	// Pick a random race that is not Human
	generateRandomNonHumanRace(raceOptions) {
		// If a specific raceOptions array isn't provided, construct a sensible default list
		const defaultRaces = [
			"Elf", "Dwarf", "Halfling", "Dragonborn", "Gnome", "Half-Elf", "Half-Orc", "Tiefling",
			"Aasimar", "Genasi", "Goliath", "Tabaxi", "Tortle", "Triton",
			"Aarakocra", "Bugbear", "Centaur", "Changeling", "Deep Gnome", "Duergar", "Eladrin",
			"Fairy", "Firbolg", "Githyanki", "Githzerai", "Goblin", "Harengon", "Hobgoblin",
			"Kenku", "Kobold", "Lizardfolk", "Minotaur", "Orc", "Satyr", "Sea Elf", "Shadar-Kai",
			"Shifter", "Yuan-Ti"
		];

		let candidates;
		if (Array.isArray(raceOptions) && raceOptions.length) {
			candidates = raceOptions.filter(r => String(r.name).toLowerCase() !== 'human');
		} else {
			candidates = defaultRaces.map(n => ({ name: n, source: 'MPMM' }));
		}

		if (!candidates || candidates.length === 0) {
			return { name: 'Human', source: 'PHB' };
		}

		const pick = candidates[Math.floor(Math.random() * candidates.length)];
		return { name: pick.name, source: pick.source || 'MPMM' };
	}

	calculateRaceClassSynergy(race, classes) {
		let synergy = 3; // Base weight

		classes.forEach(cls => {
			switch (cls.name) {
				case "Fighter":
				case "Paladin":
					if (race.name === "Dragonborn" || race.name === "Half-Orc" ||
						(race.name === "Dwarf" && race.subraces && race.subraces.includes("Mountain Dwarf"))) {
						synergy += 2;
					}
					break;
				case "Wizard":
					if (race.name === "High Elf" || race.name === "Gnome" ||
						(race.name === "Human" && race.subraces && race.subraces.includes("Variant"))) {
						synergy += 2;
					}
					break;
				case "Rogue":
				case "Ranger":
					if (race.name === "Elf" || race.name === "Halfling" ||
						race.name === "Half-Elf") {
						synergy += 2;
					}
					break;
				case "Bard":
				case "Sorcerer":
				case "Warlock":
					if (race.name === "Half-Elf" || race.name === "Tiefling" ||
						race.name === "Dragonborn") {
						synergy += 2;
					}
					break;
				case "Cleric":
				case "Druid":
					if (race.name === "Human" || (race.name === "Dwarf" &&
						race.subraces && race.subraces.includes("Hill Dwarf")) || race.name === "Half-Elf") {
						synergy += 2;
					}
					break;
			}
		});

		return synergy;
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
					{ name: "Wild Magic", shortName: "Wild Magic", source: "TCE" }
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
			subclass: randomSubclass,
			currentHitDice: 1
		};
	}

	// Generate multiple classes with levels distributed across them
	generateRandomClasses(totalLevel, baseClass = '') {
		const classes = [];
		let remainingLevels = totalLevel;

		// 70% chance for single class, 25% for dual class, 5% for triple class
		const classCount = totalLevel >= 3 && Math.random() < 0.3 ?
			(totalLevel >= 6 && Math.random() < 0.05 ? 3 : 2) : 1;

		// Get unique random classes
		const availableClasses = [
			"Fighter", "Wizard", "Rogue", "Cleric", "Ranger", "Paladin",
			"Barbarian", "Bard", "Druid", "Monk", "Sorcerer", "Warlock", "Artificer"
		];

		// If a baseClass is provided and valid, force it to be the first class
		let forcedClass = null;
		if (baseClass && availableClasses.includes(baseClass)) {
			forcedClass = baseClass;
			// remove it from availableClasses so it isn't chosen again
			const idx = availableClasses.indexOf(baseClass);
			if (idx !== -1) availableClasses.splice(idx, 1);
		}

		for (let i = 0; i < classCount; i++) {
			let className;
			if (i === 0 && forcedClass) {
				className = forcedClass;
			} else {
				className = availableClasses.splice(Math.floor(Math.random() * availableClasses.length), 1)[0];
			}
			const classTemplate = this.generateRandomClass();

			// Assign levels
			let levelsForThisClass;
			if (i === classCount - 1) {
				levelsForThisClass = remainingLevels; // Last class gets remaining levels
			} else {
				// Distribute levels, ensuring at least 1 level per class
				const maxLevels = Math.min(remainingLevels - (classCount - i - 1), Math.floor(remainingLevels * 0.7));
				levelsForThisClass = Math.max(1, Math.floor(Math.random() * maxLevels) + 1);
			}

			// If this is the forced base class and classTemplate doesn't match, ensure source is consistent
			const subclass = this.getSubclassForClass(className);
			const hitDie = this.getClassHitDie(className) || 8;
			classes.push({
				name: className,
				source: classTemplate.source,
				level: levelsForThisClass,
				hitDie: `d${hitDie}`,
				subclass: subclass,
				currentHitDice: levelsForThisClass // Hit dice should equal the level in that class
			});

			remainingLevels -= levelsForThisClass;
		}

		return classes;
	}

	getSubclassForClass(className) {
		const subclasses = {
			"Fighter": [
				// PHB Core
				{ name: "Champion", shortName: "Champion", source: "PHB" },
				{ name: "Battle Master", shortName: "Battle Master", source: "PHB" },
				{ name: "Eldritch Knight", shortName: "Eldritch Knight", source: "PHB" },
				// Expanded
				{ name: "Arcane Archer", shortName: "Arcane Archer", source: "XGE" },
				{ name: "Cavalier", shortName: "Cavalier", source: "XGE" },
				{ name: "Samurai", shortName: "Samurai", source: "XGE" },
				{ name: "Echo Knight", shortName: "Echo Knight", source: "EGW" },
				{ name: "Psi Warrior", shortName: "Psi Warrior", source: "TCE" },
				{ name: "Rune Knight", shortName: "Rune Knight", source: "TCE" }
			],
			"Wizard": [
				// PHB Core - All Schools
				{ name: "School of Abjuration", shortName: "Abjuration", source: "PHB" },
				{ name: "School of Conjuration", shortName: "Conjuration", source: "PHB" },
				{ name: "School of Divination", shortName: "Divination", source: "PHB" },
				{ name: "School of Enchantment", shortName: "Enchantment", source: "PHB" },
				{ name: "School of Evocation", shortName: "Evocation", source: "PHB" },
				{ name: "School of Illusion", shortName: "Illusion", source: "PHB" },
				{ name: "School of Necromancy", shortName: "Necromancy", source: "PHB" },
				{ name: "School of Transmutation", shortName: "Transmutation", source: "PHB" },
				// Expanded
				{ name: "Bladesinging", shortName: "Bladesinging", source: "TCE" },
				{ name: "War Magic", shortName: "War", source: "XGE" },
				{ name: "Order of Scribes", shortName: "Scribes", source: "TCE" },
				{ name: "Chronurgy Magic", shortName: "Chronurgy", source: "EGW" },
				{ name: "Graviturgy Magic", shortName: "Graviturgy", source: "EGW" }
			],
			"Rogue": [
				// PHB Core
				{ name: "Thief", shortName: "Thief", source: "PHB" },
				{ name: "Assassin", shortName: "Assassin", source: "PHB" },
				{ name: "Arcane Trickster", shortName: "Arcane Trickster", source: "PHB" },
				// Expanded
				{ name: "Mastermind", shortName: "Mastermind", source: "XGE" },
				{ name: "Scout", shortName: "Scout", source: "XGE" },
				{ name: "Swashbuckler", shortName: "Swashbuckler", source: "XGE" },
				{ name: "Inquisitive", shortName: "Inquisitive", source: "XGE" },
				{ name: "Phantom", shortName: "Phantom", source: "TCE" },
				{ name: "Soulknife", shortName: "Soulknife", source: "TCE" }
			],
			"Cleric": [
				// PHB Core
				{ name: "Knowledge Domain", shortName: "Knowledge", source: "PHB" },
				{ name: "Life Domain", shortName: "Life", source: "PHB" },
				{ name: "Light Domain", shortName: "Light", source: "PHB" },
				{ name: "Nature Domain", shortName: "Nature", source: "PHB" },
				{ name: "Tempest Domain", shortName: "Tempest", source: "PHB" },
				{ name: "Trickery Domain", shortName: "Trickery", source: "PHB" },
				{ name: "War Domain", shortName: "War", source: "PHB" },
				// Expanded
				{ name: "Death Domain", shortName: "Death", source: "DMG" },
				{ name: "Arcana Domain", shortName: "Arcana", source: "SCAG" },
				{ name: "Forge Domain", shortName: "Forge", source: "XGE" },
				{ name: "Grave Domain", shortName: "Grave", source: "XGE" },
				{ name: "Order Domain", shortName: "Order", source: "TCE" },
				{ name: "Peace Domain", shortName: "Peace", source: "TCE" },
				{ name: "Twilight Domain", shortName: "Twilight", source: "TCE" }
			],
			"Ranger": [
				// PHB Core
				{ name: "Hunter", shortName: "Hunter", source: "PHB" },
				{ name: "Beast Master", shortName: "Beast Master", source: "PHB" },
				// Expanded
				{ name: "Gloom Stalker", shortName: "Gloom Stalker", source: "XGE" },
				{ name: "Horizon Walker", shortName: "Horizon Walker", source: "XGE" },
				{ name: "Monster Slayer", shortName: "Monster Slayer", source: "XGE" },
				{ name: "Fey Wanderer", shortName: "Fey Wanderer", source: "TCE" },
				{ name: "Swarmkeeper", shortName: "Swarmkeeper", source: "TCE" },
				{ name: "Drakewarden", shortName: "Drakewarden", source: "FTD" }
			],
			"Paladin": [
				// PHB Core
				{ name: "Oath of Devotion", shortName: "Devotion", source: "PHB" },
				{ name: "Oath of the Ancients", shortName: "Ancients", source: "PHB" },
				{ name: "Oath of Vengeance", shortName: "Vengeance", source: "PHB" },
				// Expanded
				{ name: "Oathbreaker", shortName: "Oathbreaker", source: "DMG" },
				{ name: "Oath of the Crown", shortName: "Crown", source: "SCAG" },
				{ name: "Oath of Conquest", shortName: "Conquest", source: "XGE" },
				{ name: "Oath of Redemption", shortName: "Redemption", source: "XGE" },
				{ name: "Oath of Glory", shortName: "Glory", source: "TCE" },
				{ name: "Oath of the Watchers", shortName: "Watchers", source: "TCE" }
			],
			"Barbarian": [
				// PHB Core
				{ name: "Path of the Berserker", shortName: "Berserker", source: "PHB" },
				{ name: "Path of the Totem Warrior", shortName: "Totem Warrior", source: "PHB" },
				// Expanded
				{ name: "Path of the Battlerager", shortName: "Battlerager", source: "SCAG" },
				{ name: "Path of the Ancestral Guardian", shortName: "Ancestral Guardian", source: "XGE" },
				{ name: "Path of the Storm Herald", shortName: "Storm Herald", source: "XGE" },
				{ name: "Path of the Zealot", shortName: "Zealot", source: "XGE" },
				{ name: "Path of the Beast", shortName: "Beast", source: "TCE" },
				{ name: "Path of Wild Magic", shortName: "Wild Magic", source: "TCE" }
			],
			"Bard": [
				// PHB Core
				{ name: "College of Lore", shortName: "Lore", source: "PHB" },
				{ name: "College of Valor", shortName: "Valor", source: "PHB" },
				// Expanded
				{ name: "College of Swords", shortName: "Swords", source: "XGE" },
				{ name: "College of Whispers", shortName: "Whispers", source: "XGE" },
				{ name: "College of Glamour", shortName: "Glamour", source: "XGE" },
				{ name: "College of Creation", shortName: "Creation", source: "TCE" },
				{ name: "College of Eloquence", shortName: "Eloquence", source: "TCE" }
			],
			"Druid": [
				// PHB Core
				{ name: "Circle of the Land", shortName: "Land", source: "PHB" },
				{ name: "Circle of the Moon", shortName: "Moon", source: "PHB" },
				// Expanded
				{ name: "Circle of Dreams", shortName: "Dreams", source: "XGE" },
				{ name: "Circle of the Shepherd", shortName: "Shepherd", source: "XGE" },
				{ name: "Circle of Spores", shortName: "Spores", source: "TCE" },
				{ name: "Circle of Stars", shortName: "Stars", source: "TCE" },
				{ name: "Circle of Wildfire", shortName: "Wildfire", source: "TCE" }
			],
			"Monk": [
				// PHB Core
				{ name: "Way of the Open Hand", shortName: "Open Hand", source: "PHB" },
				{ name: "Way of Shadow", shortName: "Shadow", source: "PHB" },
				{ name: "Way of the Four Elements", shortName: "Four Elements", source: "PHB" },
				// Expanded
				{ name: "Way of the Long Death", shortName: "Long Death", source: "SCAG" },
				{ name: "Way of the Sun Soul", shortName: "Sun Soul", source: "XGE" },
				{ name: "Way of the Drunken Master", shortName: "Drunken Master", source: "XGE" },
				{ name: "Way of the Kensei", shortName: "Kensei", source: "XGE" },
				{ name: "Way of Mercy", shortName: "Mercy", source: "TCE" },
				{ name: "Way of the Astral Self", shortName: "Astral Self", source: "TCE" },
				{ name: "Way of the Ascendant Dragon", shortName: "Ascendant Dragon", source: "FTD" }
			],
			"Sorcerer": [
				// PHB Core
				{ name: "Draconic Bloodline", shortName: "Draconic", source: "PHB" },
				{ name: "Wild Magic", shortName: "Wild", source: "PHB" },
				// Expanded
				{ name: "Storm Sorcery", shortName: "Storm", source: "XGE" },
				{ name: "Divine Soul", shortName: "Divine Soul", source: "XGE" },
				{ name: "Shadow Magic", shortName: "Shadow", source: "XGE" },
				{ name: "Aberrant Mind", shortName: "Aberrant Mind", source: "TCE" },
				{ name: "Clockwork Soul", shortName: "Clockwork Soul", source: "TCE" }
			],
			"Warlock": [
				// PHB Core
				{ name: "The Archfey", shortName: "Archfey", source: "PHB" },
				{ name: "The Fiend", shortName: "Fiend", source: "PHB" },
				{ name: "The Great Old One", shortName: "Great Old One", source: "PHB" },
				// Expanded
				{ name: "The Undying", shortName: "Undying", source: "SCAG" },
				{ name: "The Celestial", shortName: "Celestial", source: "XGE" },
				{ name: "The Hexblade", shortName: "Hexblade", source: "XGE" },
				{ name: "The Fathomless", shortName: "Fathomless", source: "TCE" },
				{ name: "The Genie", shortName: "Genie", source: "TCE" },
				{ name: "The Undead", shortName: "Undead", source: "VRGR" }
			],
			"Artificer": [
				// TCE Core
				{ name: "Alchemist", shortName: "Alchemist", source: "TCE" },
				{ name: "Armorer", shortName: "Armorer", source: "TCE" },
				{ name: "Artillerist", shortName: "Artillerist", source: "TCE" },
				{ name: "Battle Smith", shortName: "Battle Smith", source: "TCE" }
			]
		};

		const availableSubclasses = subclasses[className] || [];
		return availableSubclasses[Math.floor(Math.random() * availableSubclasses.length)];
	}

	async generateRandomBackground(race = null, alignment = null) {
		// Load backgrounds from 5etools data
		let backgrounds;
		try {
			const response = await fetch('data/backgrounds.json');
			const backgroundData = await response.json();
			backgrounds = backgroundData.background || [];

			// Filter to more common/playable backgrounds (avoid adventure-specific ones)
			backgrounds = backgrounds.filter(bg => {
				const commonSources = ["PHB", "SCAG", "XGE", "TCE", "VGM", "MPMM", "FTD", "BGG"];
				return commonSources.includes(bg.source);
			});

			// If no backgrounds found, fallback to basic list
			if (backgrounds.length === 0) {
				backgrounds = [
					{ name: "Acolyte", source: "PHB" },
					{ name: "Criminal", source: "PHB" },
					{ name: "Folk Hero", source: "PHB" },
					{ name: "Noble", source: "PHB" },
					{ name: "Sage", source: "PHB" },
					{ name: "Soldier", source: "PHB" }
				];
			}
		} catch (error) {
			console.warn('Could not load backgrounds data, using fallback:', error);
			backgrounds = [
				{ name: "Acolyte", source: "PHB" },
				{ name: "Criminal", source: "PHB" },
				{ name: "Folk Hero", source: "PHB" },
				{ name: "Noble", source: "PHB" },
				{ name: "Sage", source: "PHB" },
				{ name: "Soldier", source: "PHB" }
			];
		}

		// If no race or alignment provided, return random
		if (!race && !alignment) {
			return backgrounds[Math.floor(Math.random() * backgrounds.length)];
		}

		// Create weighted background selection based on race and alignment
		const backgroundWeights = {};
		backgrounds.forEach(bg => {
			backgroundWeights[bg.name] = { background: bg, weight: 1 };
		});

		// Apply racial influences
		if (race) {
			const racialBackgroundAffinities = this.getRacialBackgroundAffinities(race);
			Object.entries(racialBackgroundAffinities).forEach(([bgName, bonus]) => {
				if (backgroundWeights[bgName]) {
					backgroundWeights[bgName].weight += bonus;
				}
			});
		}

		// Apply alignment influences
		if (alignment) {
			const alignmentBackgroundAffinities = this.getAlignmentBackgroundAffinities(alignment);
			Object.entries(alignmentBackgroundAffinities).forEach(([bgName, bonus]) => {
				if (backgroundWeights[bgName]) {
					backgroundWeights[bgName].weight += bonus;
				}
			});
		}

		// Create weighted array for selection
		const weightedBackgrounds = [];
		Object.values(backgroundWeights).forEach(({ background, weight }) => {
			for (let i = 0; i < weight; i++) {
				weightedBackgrounds.push(background);
			}
		});

		return weightedBackgrounds[Math.floor(Math.random() * weightedBackgrounds.length)];
	}

	// Helper to resolve a background name to a full background object from data/backgrounds.json
	async _getBackgroundByName(name) {
		if (!name) return null;
		try {
			const response = await fetch('data/backgrounds.json');
			const backgroundData = await response.json();
			const backgrounds = backgroundData.background || [];
			const found = backgrounds.find(b => b.name.toLowerCase() === String(name).toLowerCase());
			if (found) return found;
			return { name: name, source: 'PHB' };
		} catch (e) {
			console.warn('Could not load backgrounds.json to resolve background name, using simple object fallback', e);
			return { name: name, source: 'PHB' };
		}
	}

	getRacialBackgroundAffinities(race) {
		const affinities = {};

		switch (race.name) {
			case "Human":
				// Humans are versatile, slight preference for social/civilized backgrounds
				affinities["Noble"] = 2;
				affinities["Guild Artisan"] = 2;
				affinities["Soldier"] = 2;
				affinities["Entertainer"] = 1;
				break;
			case "Elf":
				// Elves favor cultured, magical, or nature-connected backgrounds
				affinities["Sage"] = 3;
				affinities["Hermit"] = 2;
				affinities["Entertainer"] = 2;
				affinities["Noble"] = 2;
				affinities["Outlander"] = 1;
				break;
			case "Dwarf":
				// Dwarves favor crafting, military, or traditional backgrounds
				affinities["Guild Artisan"] = 4;
				affinities["Soldier"] = 3;
				affinities["Folk Hero"] = 2;
				affinities["Acolyte"] = 1;
				break;
			case "Halfling":
				// Halflings favor peaceful, social, or traveling backgrounds
				affinities["Folk Hero"] = 3;
				affinities["Entertainer"] = 3;
				affinities["Guild Artisan"] = 2;
				affinities["Sailor"] = 2;
				break;
			case "Dragonborn":
				// Dragonborn favor noble, military, or honor-based backgrounds
				affinities["Noble"] = 3;
				affinities["Soldier"] = 3;
				affinities["Acolyte"] = 2;
				affinities["Folk Hero"] = 2;
				break;
			case "Gnome":
				// Gnomes favor scholarly, crafting, or tinkering backgrounds
				affinities["Sage"] = 4;
				affinities["Guild Artisan"] = 3;
				affinities["Hermit"] = 2;
				affinities["Entertainer"] = 1;
				break;
			case "Half-Elf":
				// Half-elves favor social, artistic, or wandering backgrounds
				affinities["Entertainer"] = 3;
				affinities["Charlatan"] = 2;
				affinities["Folk Hero"] = 2;
				affinities["Sailor"] = 2;
				affinities["Noble"] = 1;
				break;
			case "Half-Orc":
				// Half-orcs favor physical, outcast, or proving backgrounds
				affinities["Outlander"] = 3;
				affinities["Soldier"] = 3;
				affinities["Folk Hero"] = 2;
				affinities["Criminal"] = 2;
				break;
			case "Tiefling":
				// Tieflings favor outcast, mysterious, or cunning backgrounds
				affinities["Charlatan"] = 3;
				affinities["Criminal"] = 2;
				affinities["Entertainer"] = 2;
				affinities["Hermit"] = 2;
				affinities["Outlander"] = 1;
				break;
			default:
				// Unknown race, no specific preferences
				break;
		}

		return affinities;
	}

	getAlignmentBackgroundAffinities(alignment) {
		const affinities = {};

		if (!Array.isArray(alignment)) return affinities;

		const [law, good] = alignment;

		// Lawful alignments
		if (law === "L") {
			affinities["Acolyte"] = 2;
			affinities["Soldier"] = 2;
			affinities["Noble"] = 2;
			affinities["Guild Artisan"] = 1;
		}

		// Chaotic alignments
		if (law === "C") {
			affinities["Criminal"] = 2;
			affinities["Charlatan"] = 2;
			affinities["Entertainer"] = 1;
			affinities["Outlander"] = 1;
			affinities["Sailor"] = 1;
		}

		// Good alignments
		if (good === "G") {
			affinities["Acolyte"] = 2;
			affinities["Folk Hero"] = 3;
			affinities["Sage"] = 1;
			affinities["Hermit"] = 1;
		}

		// Evil alignments
		if (good === "E") {
			affinities["Criminal"] = 3;
			affinities["Charlatan"] = 2;
			affinities["Noble"] = 1; // Corrupt nobility
		}

		// Neutral alignments (no strong preferences, but some mild tendencies)
		if (alignment.length === 1 && alignment[0] === "N") {
			// True neutral - balanced approach
			affinities["Hermit"] = 2;
			affinities["Outlander"] = 1;
			affinities["Sage"] = 1;
		}

		return affinities;
	}

	async generateRandomAbilityScores(classes, race) {
		// Enhanced ability score generation using multiple methods
		const method = Math.random();
		let baseStats;

		if (method < 0.4) {
			// Standard Array (40% chance) - balanced and reliable
			baseStats = this.generateStandardArray();
		} else if (method < 0.7) {
			// Point Buy (30% chance) - customized allocation
			baseStats = this.generatePointBuyStats(classes);
		} else {
			// 4d6 drop lowest (30% chance) - more random, potentially stronger
			baseStats = this.roll4d6DropLowest();
		}

		// Apply racial bonuses (may involve async data loads)
		baseStats = await this.applyRacialAbilityBonuses(baseStats, race);

		// Intelligently allocate scores based on class priorities
		baseStats = this.optimizeStatsForClasses(baseStats, classes);

		// Ensure multiclassing requirements are met if applicable
		if (classes.length > 1) {
			baseStats = this.ensureMulticlassRequirements(baseStats, classes);
		}

		return baseStats;
	}

	generateStandardArray() {
		// Standard array: 15, 14, 13, 12, 10, 8
		const standardScores = [15, 14, 13, 12, 10, 8];
		const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
		const stats = {};

		// Shuffle the array for random assignment
		for (let i = standardScores.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[standardScores[i], standardScores[j]] = [standardScores[j], standardScores[i]];
		}

		abilities.forEach((ability, index) => {
			stats[ability] = standardScores[index];
		});

		return stats;
	}

	generatePointBuyStats(classes) {
		// Point buy system - start with base 8 and distribute 27 points
		const stats = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
		let points = 27;

		// Get primary stats for each class
		const priorities = this.getClassAbilityPriorities(classes);

		// Allocate points based on priorities, with some randomization
		const sortedPriorities = Object.entries(priorities)
			.sort(([,a], [,b]) => b - a)
			.map(([ability]) => ability);

		// First pass: ensure key stats are at least decent (13+)
		sortedPriorities.forEach((ability, index) => {
			if (index < 2 && points > 0) { // Top 2 priorities
				const targetMin = 13 + Math.floor(Math.random() * 3); // 13-15
				const desiredIncrease = Math.max(0, targetMin - stats[ability]);

				// Apply increases one point at a time, deducting the true incremental cost
				let appliedIncrease = 0;
				while (appliedIncrease < desiredIncrease && stats[ability] + appliedIncrease < 15) {
					const nextScore = stats[ability] + appliedIncrease + 1;
					const incrementalCost = this.getPointBuyCost(stats[ability] + appliedIncrease, nextScore);
					if (points >= incrementalCost) {
						appliedIncrease++;
						points -= incrementalCost;
					} else break;
				}

				stats[ability] += appliedIncrease;
			}
		});

		// Second pass: distribute remaining points with preference for higher priority stats
		while (points > 0) {
			const weightedAbilities = [];
			sortedPriorities.forEach((ability, index) => {
				const weight = Math.max(1, 6 - index); // Higher weight for higher priority
				for (let i = 0; i < weight; i++) {
					if (stats[ability] < 15) { // Cap at 15 for point buy
						weightedAbilities.push(ability);
					}
				}
			});

			if (weightedAbilities.length === 0) break;

			const chosenAbility = weightedAbilities[Math.floor(Math.random() * weightedAbilities.length)];
			const cost = this.getPointBuyCost(stats[chosenAbility], stats[chosenAbility] + 1);
			if (points >= cost && stats[chosenAbility] < 15) {
				stats[chosenAbility]++;
				points -= cost;
			} else {
				break;
			}
		}

		return stats;
	}

	getPointBuyCost(currentScore, targetScore) {
		// Point buy costs: 8-13 cost 1 point each, 14-15 cost 2 points each
		let cost = 0;
		for (let score = currentScore; score < targetScore; score++) {
			cost += (score >= 13) ? 2 : 1;
		}
		return cost;
	}

	roll4d6DropLowest() {
		const stats = {};
		const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

		abilities.forEach(ability => {
			// Roll 4d6, drop lowest
			const rolls = [];
			for (let i = 0; i < 4; i++) {
				rolls.push(Math.floor(Math.random() * 6) + 1);
			}
			rolls.sort((a, b) => b - a);
			stats[ability] = rolls[0] + rolls[1] + rolls[2]; // Sum of highest 3
		});

		return stats;
	}

	getClassAbilityPriorities(classes) {
		// Accept either an array of class objects, an array of class names, or a single class
		if (!Array.isArray(classes)) classes = [classes];

		// Base priorities start neutral; we'll bump relevant ones per class
		const priorities = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

		classes.forEach(clsRaw => {
			if (!clsRaw) return;

			const clsName = (typeof clsRaw === 'string') ? clsRaw : (clsRaw.name || clsRaw.className || '');
			const cname = String(clsName).toLowerCase();
			const subclass = (typeof clsRaw === 'string') ? null : (clsRaw.subclass || clsRaw.subclass?.shortName || clsRaw.subclass?.name || null);
			const sname = subclass ? String(subclass).toLowerCase() : null;

			// Use substring matching so names like "Wizard (Bladesinging)" are recognized
			if (cname.includes('fighter')) {
				if (sname && (sname.includes('eldritch') || sname.includes('eldritch_knight'))) {
					priorities.int += 2;
					priorities.str += 3;
				} else {
					priorities.str += 3;
					priorities.dex += 1;
				}
			} else if (cname.includes('barbarian')) {
				priorities.str += 3;
				priorities.con += 2;
			} else if (cname.includes('paladin')) {
				priorities.str += 3;
				priorities.cha += 2;
			} else if (cname.includes('ranger')) {
				priorities.dex += 3;
				priorities.wis += 2;
			} else if (cname.includes('rogue')) {
				priorities.dex += 3;
				if (sname && sname.includes('arcane')) priorities.int += 1;
			} else if (cname.includes('monk')) {
				priorities.dex += 3;
				priorities.wis += 2;
			} else if (cname.includes('bard')) {
				priorities.cha += 3;
				priorities.dex += 1;
			} else if (cname.includes('cleric')) {
				priorities.wis += 3;
				if (sname && sname.includes('war')) priorities.str += 1;
			} else if (cname.includes('druid')) {
				priorities.wis += 3;
			} else if (cname.includes('sorcerer')) {
				priorities.cha += 3;
				priorities.con += 1;
			} else if (cname.includes('warlock')) {
				priorities.cha += 3;
			} else if (cname.includes('wizard')) {
				priorities.int += 3;
				priorities.dex += 1;
			} else {
				// Unknown class - keep neutral priorities
			}
		});

		return priorities;
	}

	// Return primary/secondary arrays derived from numeric priorities
	getClassAbilityPriorityArrays(classes) {
		const numeric = this.getClassAbilityPriorities(classes);
		const ordered = Object.entries(numeric)
			.sort(([, a], [, b]) => b - a)
			.map(([ability]) => ability);
		return {
			primary: ordered.slice(0, 1),
			secondary: ordered.slice(1, 2)
		};
	}

	async applyRacialAbilityBonuses(stats, race) {
		const bonuses = await this.getRacialAbilityBonuses(race, stats);
		const newStats = { ...stats };

		Object.entries(bonuses).forEach(([ability, bonus]) => {
			newStats[ability] = (newStats[ability] || 8) + bonus;
		});

		return newStats;
	}

	async getRacialAbilityBonuses(race, stats = {}) {
		const bonuses = {};

		if (!race || !race.name) {
			return bonuses;
		}

		try {
			// Load race data from 5etools JSON files
			const response = await fetch('data/races.json');
			if (!response.ok) {
				console.warn('Could not load race data for ability bonuses');
				return bonuses;
			}

			const raceData = await response.json();
			const raceInfo = raceData.race?.find(r =>
				r.name === race.name && r.source === race.source
			);

			if (!raceInfo || !raceInfo.ability || !raceInfo.ability.length) {
				return bonuses; // No ability bonuses
			}

			// Process each ability bonus entry
			for (const abilityEntry of raceInfo.ability) {
				// Handle direct ability bonuses (e.g., {str: 2, con: 1})
				const directBonuses = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
				directBonuses.forEach(ability => {
					if (abilityEntry[ability]) {
						bonuses[ability] = (bonuses[ability] || 0) + abilityEntry[ability];
					}
				});

				// Handle "choose" format for flexible bonuses
				if (abilityEntry.choose) {
					const choose = abilityEntry.choose;
					const count = choose.count || 1;
					const amount = choose.amount || 1;
					const availableAbilities = choose.from || ['str', 'dex', 'con', 'int', 'wis', 'cha'];

					// For race generation, prioritize highest stats for bonuses
					const sortedAbilities = availableAbilities.slice().sort((a, b) => {
						return (stats[b] || 8) - (stats[a] || 8);
					});

					// Apply bonuses to the highest available stats
					for (let i = 0; i < Math.min(count, sortedAbilities.length); i++) {
						const ability = sortedAbilities[i];
						bonuses[ability] = (bonuses[ability] || 0) + amount;
					}
				}
			}

			// Handle subrace ability bonuses
			if (race.subrace && raceInfo.subraces) {
				const subrace = raceInfo.subraces.find(sr => sr.name === race.subrace);
				if (subrace && subrace.ability) {
					for (const abilityEntry of subrace.ability) {
						const directBonuses = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
						directBonuses.forEach(ability => {
							if (abilityEntry[ability]) {
								bonuses[ability] = (bonuses[ability] || 0) + abilityEntry[ability];
							}
						});

						// Handle subrace choose bonuses
						if (abilityEntry.choose) {
							const choose = abilityEntry.choose;
							const count = choose.count || 1;
							const amount = choose.amount || 1;
							const availableAbilities = choose.from || ['str', 'dex', 'con', 'int', 'wis', 'cha'];

							const sortedAbilities = availableAbilities.slice().sort((a, b) => {
								return (stats[b] || 8) - (stats[a] || 8);
							});

							for (let i = 0; i < Math.min(count, sortedAbilities.length); i++) {
								const ability = sortedAbilities[i];
								bonuses[ability] = (bonuses[ability] || 0) + amount;
							}
						}
					}
				}
			}

			return bonuses;

		} catch (error) {
			console.error('Error loading racial ability bonuses:', error);
			return bonuses; // Return empty bonuses on error
		}
	}

	optimizeStatsForClasses(stats, classes) {
		// This method fine-tunes stat allocation after racial bonuses
		// to ensure the character is viable for their chosen classes

		const priorities = this.getClassAbilityPriorities(classes);
		const sortedPriorities = Object.entries(priorities)
			.sort(([,a], [,b]) => b - a)
			.map(([ability]) => ability);

		// Ensure primary stats are at least 13 (especially for multiclassing)
		const newStats = { ...stats };

		sortedPriorities.slice(0, 2).forEach(ability => {
			if (newStats[ability] < 13) {
				// Find lowest priority stat to swap with
				const lowestPriority = sortedPriorities[sortedPriorities.length - 1];
				if (newStats[lowestPriority] > newStats[ability]) {
					[newStats[ability], newStats[lowestPriority]] = [newStats[lowestPriority], newStats[ability]];
				}
			}
		});

		return newStats;
	}

	ensureMulticlassRequirements(stats, classes) {
		// Ensure multiclassing ability score requirements are met
		const requirements = {
			"Barbarian": { str: 13 },
			"Bard": { cha: 13 },
			"Cleric": { wis: 13 },
			"Druid": { wis: 13 },
			"Fighter": { str: 13 }, // STR OR DEX 13 (handled specially below)
			"Monk": { dex: 13, wis: 13 },
			"Paladin": { str: 13, cha: 13 },
			"Ranger": { dex: 13, wis: 13 },
			"Rogue": { dex: 13 },
			"Sorcerer": { cha: 13 },
			"Warlock": { cha: 13 },
			"Wizard": { int: 13 }
		};

		const newStats = { ...stats };

		classes.forEach(cls => {
			const reqs = requirements[cls.name];
			if (reqs) {
				// Special case for Fighter: needs STR 13 OR DEX 13, not both
				if (cls.name === "Fighter") {
					if (newStats.str < 13 && newStats.dex < 13) {
						// Need to ensure at least one is 13+
						const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
						const swapCandidate = abilities.find(a =>
							newStats[a] >= 13 &&
							!this.isStatRequired(a, classes, requirements)
						);
						if (swapCandidate) {
							// Prefer boosting STR for simplicity
							[newStats.str, newStats[swapCandidate]] = [newStats[swapCandidate], newStats.str];
						}
					}
				} else {
					// Standard multiclassing requirements for other classes
					Object.entries(reqs).forEach(([ability, minScore]) => {
						if (newStats[ability] < minScore) {
							// Find a stat to swap with
							const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
							const swapCandidate = abilities.find(a =>
								newStats[a] >= minScore &&
								!this.isStatRequired(a, classes, requirements)
							);
							if (swapCandidate) {
								[newStats[ability], newStats[swapCandidate]] = [newStats[swapCandidate], newStats[ability]];
							}
						}
					});
				}
			}
		});

		return newStats;
	}

	isStatRequired(ability, classes, requirements) {
		return classes.some(cls => {
			const reqs = requirements[cls.name];
			return reqs && reqs[ability];
		});
	}

	generateRandomAlignment() {
		const alignments = [
			["L", "G"], ["N", "G"], ["C", "G"],
			["L", "N"], ["N"], ["C", "N"],
			["L", "E"], ["N", "E"], ["C", "E"]
		];
		return alignments[Math.floor(Math.random() * alignments.length)];
	}

	convertAlignmentStringToArray(alignmentString) {
		const alignmentMap = {
			"Lawful Good": ["L", "G"],
			"Neutral Good": ["N", "G"],
			"Chaotic Good": ["C", "G"],
			"Lawful Neutral": ["L", "N"],
			"True Neutral": ["N"],
			"Chaotic Neutral": ["C", "N"],
			"Lawful Evil": ["L", "E"],
			"Neutral Evil": ["N", "E"],
			"Chaotic Evil": ["C", "E"]
		};
		return alignmentMap[alignmentString] || ["N"];
	}

	// Class data loading methods for high-level character enhancement
	async loadClassData(className) {
		// Check cache first
		if (this._classDataCache.has(className)) {
			return this._classDataCache.get(className);
		}

		try {
			// Load class data from 5etools JSON files
			const classFileName = `class-${className.toLowerCase()}.json`;
			const response = await fetch(`data/class/${classFileName}`);

			if (!response.ok) {
				console.warn(`Could not load class data for ${className}`);
				return null;
			}

			const classData = await response.json();

			// Cache the loaded data
			this._classDataCache.set(className, classData);

			return classData;
		} catch (error) {
			console.error(`Error loading class data for ${className}:`, error);
			return null;
		}
	}

	async loadFeatData() {
		// Check cache first
		if (this._featDataCache) {
			return this._featDataCache;
		}

		try {
			const response = await fetch('data/feats.json');
			if (!response.ok) {
				console.warn('Could not load feat data');
				return null;
			}

			const featData = await response.json();

			// Cache the loaded data
			this._featDataCache = featData;

			return featData;
		} catch (e) {
			console.error('Error loading feat data:', e);
			return null;
		}
	}

	// Enhanced choice system for class features that require selections
	async showClassFeatureChoiceModal(feature, featureData) {
		console.log('Showing class feature choice modal for:', featureData.feature.name);

		// Determine the type of choice based on feature name and content
		const featureName = featureData.feature.name.toLowerCase();

		if (featureName.includes('fighting style')) {
			await this.showFightingStyleChoiceModal(feature, featureData);
		} else if (featureName.includes('metamagic')) {
			await this.showMetamagicChoiceModal(feature, featureData);
		} else if (featureName.includes('expertise')) {
			await this.showExpertiseChoiceModal(feature, featureData);
		} else if (featureName.includes('maneuver')) {
			await this.showManeuverChoiceModal(feature, featureData);
		} else if (featureName.includes('invocation')) {
			await this.showEldritchInvocationChoiceModal(feature, featureData);
		} else if (featureName.includes('pact boon')) {
			await this.showPactBoonChoiceModal(feature, featureData);
		} else if (featureName.includes('cantrip') || featureName.includes('spell')) {
			await this.showFeatureSpellChoiceModal(feature, featureData);
		} else {
			// Generic choice modal for other features
			await this.showGenericFeatureChoiceModal(feature, featureData);
		}
	}

	// Enhanced racial choice system
	async showRacialChoiceModal(feature, raceData) {
		console.log('Showing racial choice modal for:', raceData);

		const raceName = raceData.race?.name || raceData.name;

		// Handle specific racial choices
		if (raceName === 'Dragonborn') {
			await this.showDragonbornAncestryChoice(feature, raceData);
		} else if (raceName === 'Genasi') {
			await this.showGenasiSubraceChoice(feature, raceData);
		} else if (raceName === 'Tiefling') {
			await this.showTieflingHeritageChoice(feature, raceData);
		} else if (raceName === 'Aasimar') {
			await this.showAasimarSubraceChoice(feature, raceData);
		} else {
			// Generic racial ability choice (like skill proficiencies, languages, etc.)
			await this.showGenericRacialChoiceModal(feature, raceData);
		}
	}

	// Enhanced background choice system
	async showBackgroundChoiceModal(feature, backgroundData) {
		console.log('Showing background choice modal for:', backgroundData);

		const backgroundName = backgroundData.background?.name || backgroundData.name;

		// Handle specific background choices
		if (backgroundName === 'Hermit') {
			await this.showHermitDiscoveryChoice(feature, backgroundData);
		} else if (backgroundName === 'Folk Hero') {
			await this.showFolkHeroDefiningEventChoice(feature, backgroundData);
		} else if (backgroundName === 'Noble') {
			await this.showNobleVariantChoice(feature, backgroundData);
		} else {
			// Generic background choice (skills, languages, tools)
			await this.showGenericBackgroundChoiceModal(feature, backgroundData);
		}
	}

	async getClassFeaturesAtLevel(className, level) {
		const classData = await this.loadClassData(className);
		if (!classData || !classData.class || !classData.class[0]) {
			return [];
		}

		const classInfo = classData.class[0];
		const features = [];

		// Extract class features for the given level and all lower levels
		if (classInfo.classFeatures) {
			classInfo.classFeatures.forEach(featureRef => {
				let featureName = null;
				let featureSource = null;
				let featureLevel = null;

				if (typeof featureRef === 'string') {
					// Parse string format: "Feature Name|Class||Level|Source"
					const parts = featureRef.split('|');
					featureName = parts[0];
					featureLevel = parseInt(parts[3]) || 1;
					featureSource = parts[4] || 'PHB';
				} else if (featureRef.classFeature) {
					// Parse object format with classFeature property
					const parts = featureRef.classFeature.split('|');
					featureName = parts[0];
					featureLevel = parseInt(parts[3]) || 1;
					featureSource = parts[4] || 'PHB';
				}

				if (featureName && featureLevel <= level) {
					// Find the actual feature in the classFeature array
					const feature = classData.classFeature?.find(f =>
						f.name === featureName &&
						f.level === featureLevel &&
						f.className === className &&
						(f.source === featureSource || featureSource === 'PHB')
					);
					if (feature) {
						features.push({
							name: feature.name,
							level: feature.level,
							entries: feature.entries || [],
							source: feature.source || 'PHB',
							type: 'class'
						});
					}
				}
			});
		}

		return features.sort((a, b) => a.level - b.level);
	}

	async getSubclassFeaturesAtLevel(className, subclassName, level) {
		const classData = await this.loadClassData(className);
		if (!classData || !classData.subclass) {
			return [];
		}

		const subclass = classData.subclass.find(sc =>
			sc.name === subclassName || sc.shortName === subclassName
		);

		if (!subclass) {
			return [];
		}

		const features = [];

		// Extract subclass features for the given level and all lower levels
		if (subclass.subclassFeatures) {
			subclass.subclassFeatures.forEach(featureRef => {
				let featureName = null;
				let featureSource = null;
				let featureLevel = null;

				if (typeof featureRef === 'string') {
					// Parse string format: "Feature Name|Class|Subclass|Level|Source"
					const parts = featureRef.split('|');
					featureName = parts[0];
					featureLevel = parseInt(parts[3]) || 1;
					featureSource = parts[4] || 'PHB';
				} else if (featureRef.subclassFeature) {
					// Parse object format with subclassFeature property
					const parts = featureRef.subclassFeature.split('|');
					featureName = parts[0];
					featureLevel = parseInt(parts[3]) || 1;
					featureSource = parts[4] || 'PHB';
				}

				if (featureName && featureLevel <= level) {
					// Find the actual feature in the subclassFeature array
					const feature = classData.subclassFeature?.find(f =>
						f.name === featureName &&
						f.level === featureLevel &&
						f.className === className &&
						f.subclassShortName === subclass.shortName &&
						(f.source === featureSource || featureSource === 'PHB')
					);
					if (feature) {
						features.push({
							name: feature.name,
							level: feature.level,
							entries: feature.entries || [],
							source: feature.source || 'PHB',
							type: 'subclass',
							subclass: subclass.name
						});
					}
				}
			});
		}

		return features.sort((a, b) => a.level - b.level);
	}

	async generateClassFeaturesDescription(classes) {
		const descriptions = [];

		for (const classInfo of classes) {
			const className = classInfo.name;
			const level = classInfo.level;
			const subclassName = classInfo.subclass?.name || classInfo.subclass?.shortName;

			// Get class features
			const classFeatures = await this.getClassFeaturesAtLevel(className, level);
			const subclassFeatures = subclassName ?
				await this.getSubclassFeaturesAtLevel(className, subclassName, level) : [];

			const allFeatures = [...classFeatures, ...subclassFeatures];

			if (allFeatures.length > 0) {
				// Focus on the most impactful features for high-level characters
				const significantFeatures = allFeatures.filter(f =>
					f.level >= Math.max(1, level - 5) && // Recent features
					(f.level % 2 === 1 || f.level >= 10) // Odd levels or high levels
				);

				if (significantFeatures.length > 0) {
					const featureNames = significantFeatures
						.slice(-3) // Last 3 significant features
						.map(f => f.name)
						.join(', ');

					descriptions.push(
						`As a ${level}${this.getOrdinalSuffix(level)}-level ${className}${subclassName ? ` (${subclassName})` : ''}, ` +
						`they have mastered ${featureNames}${significantFeatures.length > 3 ? ' among other abilities' : ''}.`
					);
				}
			}
		}

		return descriptions;
	}

	async generateAllFeatureEntries(classes, race) {
		const featureEntries = [];

		// Add racial traits
		const racialTraits = await this.getRacialTraits(race);
		racialTraits.forEach(trait => {
			featureEntries.push({
				name: trait.name,
				entries: trait.entries || [`${race.name} racial trait.`]
			});
		});

		// Add class and subclass features
		for (const classInfo of classes) {
			const className = classInfo.name;
			const level = classInfo.level;
			const subclassName = classInfo.subclass?.name || classInfo.subclass?.shortName;

			// Get all class features for this level
			const classFeatures = await this.getClassFeaturesAtLevel(className, level);
			const subclassFeatures = subclassName ?
				await this.getSubclassFeaturesAtLevel(className, subclassName, level) : [];

			// Add class features
			classFeatures.forEach(feature => {
				featureEntries.push({
					name: feature.name,
					entries: feature.entries || [`${className} feature gained at ${feature.level}${this.getOrdinalSuffix(feature.level)} level.`]
				});
			});

			// Add subclass features
			subclassFeatures.forEach(feature => {
				featureEntries.push({
					name: feature.name,
					entries: feature.entries || [`${feature.subclass} feature gained at ${feature.level}${this.getOrdinalSuffix(feature.level)} level.`]
				});
			});
		}

		return featureEntries;
	}

	async applyRaceDataToCharacter(race, characterTemplate) {
		try {
			// Load race data from 5etools JSON files
			const raceFileName = `races.json`;
			const response = await fetch(`data/${raceFileName}`);

			if (!response.ok) {
				console.warn(`Could not load race data`);
				return characterTemplate;
			}

			const raceData = await response.json();

			// Find the specific race
			const raceInfo = raceData.race?.find(r =>
				r.name === race.name && r.source === race.source
			);

			if (!raceInfo) {
				console.warn(`Race ${race.name} not found in data`);
				return characterTemplate;
			}

			// Apply speed from race data
			if (raceInfo.speed) {
				if (typeof raceInfo.speed === 'number') {
					characterTemplate.speed = { walk: raceInfo.speed };
				} else {
					characterTemplate.speed = {
						walk: raceInfo.speed.walk || 30,
						...(raceInfo.speed.fly && typeof raceInfo.speed.fly === 'number' && { fly: raceInfo.speed.fly }),
						...(raceInfo.speed.swim && typeof raceInfo.speed.swim === 'number' && { swim: raceInfo.speed.swim }),
						...(raceInfo.speed.climb && typeof raceInfo.speed.climb === 'number' && { climb: raceInfo.speed.climb }),
						...(raceInfo.speed.burrow && typeof raceInfo.speed.burrow === 'number' && { burrow: raceInfo.speed.burrow })
					};
				}
			}

			// Apply size from race data
			if (raceInfo.size && raceInfo.size.length > 0) {
				characterTemplate.size = raceInfo.size[0]; // Use first size (usually just one)
			}


			// Apply darkvision from race data
			if (raceInfo.darkvision) {
				if (!characterTemplate.senses) characterTemplate.senses = [];
				characterTemplate.senses.push(`Darkvision ${raceInfo.darkvision} ft.`);
			}

			// Apply damage resistances from race data
			if (raceInfo.resist) {
				if (!characterTemplate.resist) characterTemplate.resist = [];
				raceInfo.resist.forEach(resistance => {
					if (typeof resistance === 'string') {
						characterTemplate.resist.push(resistance);
					} else if (resistance.resist) {
						resistance.resist.forEach(res => characterTemplate.resist.push(res));
					}
				});
			}

			// Apply damage immunities from race data
			if (raceInfo.immune) {
				if (!characterTemplate.immune) characterTemplate.immune = [];
				raceInfo.immune.forEach(immunity => {
					if (typeof immunity === 'string') {
						characterTemplate.immune.push(immunity);
					}
				});
			}

			// Apply condition immunities from race data
			if (raceInfo.conditionImmune) {
				if (!characterTemplate.conditionImmune) characterTemplate.conditionImmune = [];
				raceInfo.conditionImmune.forEach(immunity => characterTemplate.conditionImmune.push(immunity));
			}

			// Apply racial spells from additionalSpells
			if (raceInfo.additionalSpells && raceInfo.additionalSpells.length > 0) {
				await this.applyRacialSpells(raceInfo.additionalSpells, characterTemplate, 1); // Start at level 1
			}

			// Racial features are already handled in the existing "Features & Traits" section
			// So we don't need to duplicate them here

			// Apply ability score bonuses from race (handles both fixed and flexible bonuses)
			if (raceInfo.ability && raceInfo.ability.length > 0) {
				raceInfo.ability.forEach(abilitySet => {
					// Handle fixed ability score bonuses (e.g., Elf +2 Dex)
					Object.entries(abilitySet).forEach(([ability, bonus]) => {
						if (typeof bonus === 'number' && characterTemplate[ability] !== undefined) {
							characterTemplate[ability] += bonus;
							console.log(`Applied racial bonus: ${ability} +${bonus} (${race.name})`);
						} else if (ability === 'choose' && bonus && bonus.from) {
							// Handle flexible racial bonuses (e.g., Half-Elf: choose +1 to two different abilities)
							const availableAbilities = bonus.from || [];
							const choiceCount = bonus.count || 1;
							const bonusAmount = bonus.amount || 1;

							console.log(`Flexible racial bonus available: choose ${choiceCount} from [${availableAbilities.join(', ')}], +${bonusAmount} each (${race.name})`);

							// For automated character generation, select the highest priority abilities
							const abilityPriority = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
							const selectedAbilities = availableAbilities
								.filter(ab => characterTemplate[ab] !== undefined)
								.sort((a, b) => abilityPriority.indexOf(a) - abilityPriority.indexOf(b))
								.slice(0, choiceCount);

							selectedAbilities.forEach(selectedAbility => {
								characterTemplate[selectedAbility] += bonusAmount;
								console.log(`Applied flexible racial bonus: ${selectedAbility} +${bonusAmount} (${race.name})`);
							});
						}
					});
				});
			}

			return characterTemplate;
		} catch (error) {
			console.error(`Error applying race data:`, error);
			return characterTemplate;
		}
	}

	async applyRacialSpells(additionalSpells, characterTemplate, characterLevel) {
		if (!characterTemplate.spells) characterTemplate.spells = {};
		for (const spellGroup of additionalSpells) {
			// Handle known spells (like cantrips) - integrate into main spell structure
			if (spellGroup.known) {
				for (const [level, spells] of Object.entries(spellGroup.known)) {
					const requiredLevel = parseInt(level);
					if (characterLevel >= requiredLevel) {
						for (const spell of spells) {
							const spellName = spell.replace('#c', ''); // Remove cantrip marker
							const isCantrip = spell.includes('#c');

							// Get actual spell level from data
							const actualSpellLevel = isCantrip ? '0' : await this.getSpellLevel(spellName);

							// Add to main spells.levels structure (correct 5etools format)
							if (!characterTemplate.spells.levels) characterTemplate.spells.levels = {};
							if (!characterTemplate.spells.levels[actualSpellLevel]) {
								characterTemplate.spells.levels[actualSpellLevel] = {
									maxSlots: actualSpellLevel === '0' ? 0 : 0, // Will be set by class progression later
									slotsUsed: 0,
									spells: []
								};
							}

							if (!characterTemplate.spells.levels[actualSpellLevel].spells.includes(spellName)) {
								characterTemplate.spells.levels[actualSpellLevel].spells.push(spellName);
							}
						}
					}
				}
			}

			// Handle innate spells - add as Features & Traits entries instead of separate spell section
			if (spellGroup.innate) {
				if (!characterTemplate.entries) characterTemplate.entries = [];

				for (const [level, spellsOrData] of Object.entries(spellGroup.innate)) {
					const requiredLevel = parseInt(level);
					if (characterLevel >= requiredLevel) {
						if (Array.isArray(spellsOrData)) {
							// Simple list of spells - add as innate feature
							for (const spell of spellsOrData) {
								characterTemplate.entries.push({
									type: "entries",
									name: "Innate Spellcasting",
									entries: [`You can cast {@spell ${spell}} once, and regain the ability to do so when you finish a long rest.`]
								});
							}
						} else if (spellsOrData.daily) {
							// Daily usage format
							for (const [uses, spells] of Object.entries(spellsOrData.daily)) {
								for (const spell of spells) {
									const usageText = uses === '1' ? 'once' : `${uses} times`;
									characterTemplate.entries.push({
										type: "entries",
										name: "Innate Spellcasting",
										entries: [`You can cast {@spell ${spell}} ${usageText}, and regain all expended uses when you finish a long rest.`]
									});
								}
							}
						}
					}
				}
			}

			// Set spellcasting ability if provided (for racial spells)
			if (spellGroup.ability && Array.isArray(spellGroup.ability)) {
				if (!characterTemplate.spells.racialSpellcastingAbility) {
					characterTemplate.spells.racialSpellcastingAbility = spellGroup.ability[0];
				}
			}
		}
	}


	async applyClassDataToCharacter(classes, characterTemplate, totalLevel) {
		try {
			// Apply data for each class
			for (const classEntry of classes) {
				const classData = await this.loadClassData(classEntry.name);
				if (!classData || !classData.class || !classData.class[0]) {
					console.warn(`Could not load class data for ${classEntry.name}`);
					continue;
				}

				const classInfo = classData.class[0];
				const subclasses = classData.subclass || [];
				const classLevel = classEntry.level || 1;

				// Hit dice are already stored in the class object, no need to duplicate

				// Apply spellcasting ability and progression to spells section
				if (classInfo.spellcastingAbility) {
					// Initialize spells object if it doesn't exist
					if (!characterTemplate.spells) {
						characterTemplate.spells = {};
					}

					// Enhance the spells object with spellcasting information
					characterTemplate.spells.spellcastingAbility = classInfo.spellcastingAbility;
					characterTemplate.spells.casterProgression = classInfo.casterProgression;

					// Calculate spell slots and populate them into the levels structure
					if (classInfo.casterProgression === 'full') {
						const spellSlots = this.calculateSpellSlots(classLevel, 'full');
						characterTemplate.spells.spellSlots = spellSlots; // Keep for compatibility
						this.populateSpellSlotsIntoLevels(spellSlots, characterTemplate);
					} else if (classInfo.casterProgression === 'half') {
						const spellSlots = this.calculateSpellSlots(Math.floor(classLevel / 2), 'full');
						characterTemplate.spells.spellSlots = spellSlots; // Keep for compatibility
						this.populateSpellSlotsIntoLevels(spellSlots, characterTemplate);
					}

					// Add cantrips
					if (classInfo.cantripProgression) {
						const cantripCount = classInfo.cantripProgression[Math.min(classLevel - 1, classInfo.cantripProgression.length - 1)];
						characterTemplate.spells.cantripsKnown = cantripCount;
					}

					// Add spells prepared/known
					if (classInfo.preparedSpells) {
						characterTemplate.spells.spellsPrepared = classInfo.preparedSpells;
					}
					if (classInfo.spellsKnownProgressionFixed) {
						const spellsKnown = classInfo.spellsKnownProgressionFixed[Math.min(classLevel - 1, classInfo.spellsKnownProgressionFixed.length - 1)];
						characterTemplate.spells.spellsKnown = spellsKnown;
					}

					// Add actual spells for the class
					await this.addClassSpells(classEntry.name, classLevel, characterTemplate);
				}

				// Apply subclass spellcasting if it exists (subclass info already in class object)
				if (classEntry.subclass && classLevel >= 3) {
					const subclass = subclasses.find(sc =>
						sc.name === classEntry.subclass.name ||
						sc.shortName === classEntry.subclass.shortName
					);

					if (subclass && subclass.spellcastingAbility && !classInfo.spellcastingAbility) {
						// Only apply subclass spellcasting if main class doesn't have it
						if (!characterTemplate.spellcasting) characterTemplate.spellcasting = {};
						characterTemplate.spellcasting.ability = subclass.spellcastingAbility;
						characterTemplate.spellcasting.casterProgression = subclass.casterProgression || 'third';
					}
				}

				// Apply starting equipment for level 1 characters
				// if (classLevel === 1 && classInfo.startingEquipment) {
				// 	if (!characterTemplate.items) characterTemplate.items = [];
				// 	this.applyClassStartingEquipment(classInfo.startingEquipment, characterTemplate);
				// }

				// Class features are already handled by the existing feature generation system
			}

			// Apply ability score improvements based on class levels
			characterTemplate = this.applyAbilityScoreImprovements(classes, characterTemplate);

			return characterTemplate;
		} catch (error) {
			console.error(`Error applying class data:`, error);
			return characterTemplate;
		}
	}

	applyClassStartingEquipment(startingEquipment, characterTemplate) {
		if (!startingEquipment) return;

		// Process default equipment from defaultData if available
		if (startingEquipment.defaultData) {
			startingEquipment.defaultData.forEach(choiceGroup => {
				// For each choice group (a, b, c options), pick the first available option
				const choices = Object.values(choiceGroup);
				if (choices.length > 0) {
					const selectedChoice = choices[0]; // Pick first option
					if (Array.isArray(selectedChoice)) {
						selectedChoice.forEach(item => {
							this.addItemToCharacter(item, characterTemplate);
						});
					}
				}
			});
		}

		// If no defaultData, try to parse the default text descriptions
		if (startingEquipment.default && !startingEquipment.defaultData) {
			// This would require more complex parsing of the text descriptions
			// For now, we'll add basic items that every class gets
			this.addBasicStartingItems(characterTemplate);
		}
	}

	addItemToCharacter(itemString, characterTemplate) {
		if (!itemString || typeof itemString !== 'string') return;

		// Parse item string (e.g., "mace|phb" or just "shield|phb")
		const [itemName, source] = itemString.split('|');

		if (itemName) {
			// Ensure entries exist
			if (!characterTemplate.entries) characterTemplate.entries = [];

			// Find or create the Items section
			let itemsSection = characterTemplate.entries.find(entry =>
				entry.type === "section" && entry.name === "Items"
			);

			if (!itemsSection) {
				itemsSection = {
					type: "section",
					name: "Items",
					entries: []
				};
				characterTemplate.entries.push(itemsSection);
			}

			// Format item as 5etools item reference
			const formattedItem = `{@item ${itemName}|${source || 'PHB'}}`;

			// Check if item already exists in the Items section
			if (!itemsSection.entries.includes(formattedItem)) {
				itemsSection.entries.push(formattedItem);
			}
		}
	}

	// Helper method to migrate items from top-level items array to Items section
	migrateItemsToEntriesSection(characterTemplate) {
		if (!characterTemplate.items || !Array.isArray(characterTemplate.items)) return;

		// Convert each item in the top-level items array to the Items section
		characterTemplate.items.forEach(item => {
			if (item && item.name) {
				const itemString = `${item.name}|${item.source || 'PHB'}`;
				this.addItemToCharacter(itemString, characterTemplate);
			}
		});

		// Remove the top-level items array after migration
		delete characterTemplate.items;
	}

	addBasicStartingItems(characterTemplate) {
		// Add basic adventuring gear that most classes get
		const basicItems = [
			'backpack', 'bedroll', 'mess kit', 'tinderbox',
			'torch', 'rations', 'waterskin', 'hemp rope'
		];

		basicItems.forEach(item => {
			this.addItemToCharacter(`${item}|phb`, characterTemplate);
		});
	}

	async applyBackgroundDataToCharacter(background, characterTemplate) {
		try {
			// Load background data from 5etools JSON files
			const response = await fetch('data/backgrounds.json');
			if (!response.ok) {
				console.warn(`Could not load background data`);
				return characterTemplate;
			}

			const backgroundData = await response.json();

			// Find the specific background
			const backgroundInfo = backgroundData.background?.find(b =>
				b.name === background.name && (b.source === background.source || !background.source)
			);

			if (!backgroundInfo) {
				console.warn(`Background ${background.name} not found in data`);
				return characterTemplate;
			}

			// Apply skill proficiencies from background
			if (backgroundInfo.skillProficiencies) {
				if (!characterTemplate.skillProficiencies) characterTemplate.skillProficiencies = [];

				backgroundInfo.skillProficiencies.forEach(profSet => {
					Object.entries(profSet).forEach(([skill, isProficient]) => {
						if (isProficient === true) {
							// Add proficiency to skill list if not already present
							if (!characterTemplate.skillProficiencies.includes(skill)) {
								characterTemplate.skillProficiencies.push(skill);
							}
						}
					});
				});
			}

			// Apply language proficiencies from background
			if (backgroundInfo.languageProficiencies) {
				if (!characterTemplate.languages) characterTemplate.languages = [];

				backgroundInfo.languageProficiencies.forEach(langSet => {
					if (langSet.anyStandard) {
						// Add common languages for backgrounds that grant "any standard language"
						const commonLanguages = ['Common', 'Elvish', 'Dwarvish', 'Halfling', 'Orcish'];
						const languagesToAdd = Math.min(langSet.anyStandard, commonLanguages.length);
						for (let i = 0; i < languagesToAdd; i++) {
							if (!characterTemplate.languages.includes(commonLanguages[i])) {
								characterTemplate.languages.push(commonLanguages[i]);
							}
						}
					} else {
						Object.entries(langSet).forEach(([lang, isProficient]) => {
							if (isProficient === true && !characterTemplate.languages.includes(lang)) {
								characterTemplate.languages.push(lang);
							}
						});
					}
				});
			}

			// Apply starting equipment from background
			if (backgroundInfo.startingEquipment) {
				backgroundInfo.startingEquipment.forEach(equipmentGroup => {
					if (equipmentGroup._) {
						// Handle the main equipment list
						equipmentGroup._.forEach(item => {
							if (typeof item === 'string') {
								this.addItemToCharacter(item, characterTemplate);
							} else if (item.item) {
								this.addItemToCharacter(item.item, characterTemplate);
							} else if (item.special) {
								// Handle special items like "vestments" or "sticks of incense"
								// Create a formatted item string for special items
								this.addItemToCharacter(`${item.special}|PHB`, characterTemplate);
							}
						});
					}
				});
			}

			return characterTemplate;
		} catch (error) {
			console.error(`Error applying background data:`, error);
			return characterTemplate;
		}
	}

	getAbilityForSkill(skill) {
		const skillToAbility = {
			'acrobatics': 'dex',
			'animal_handling': 'wis',
			'arcana': 'int',
			'athletics': 'str',
			'deception': 'cha',
			'history': 'int',
			'insight': 'wis',
			'intimidation': 'cha',
			'investigation': 'int',
			'medicine': 'wis',
			'nature': 'int',
			'perception': 'wis',
			'performance': 'cha',
			'persuasion': 'cha',
			'religion': 'int',
			'sleight_of_hand': 'dex',
			'stealth': 'dex',
			'survival': 'wis'
		};
		return skillToAbility[skill] || 'wis'; // Default to wisdom
	}

	async loadSpellData() {
		if (this.spellDataCache) return this.spellDataCache;

		try {
			// Load main PHB spells
			const response = await fetch('data/spells/spells-phb.json');
			const data = await response.json();

			// Create a lookup map by spell name for quick access
			this.spellDataCache = {};
			if (data.spell) {
				data.spell.forEach(spell => {
					this.spellDataCache[spell.name.toLowerCase()] = spell;
				});
			}

			return this.spellDataCache;
		} catch (error) {
			console.error('Error loading spell data:', error);
			return {};
		}
	}

	async getSpellLevel(spellName) {
		const spellData = await this.loadSpellData();
		const spell = spellData[spellName.toLowerCase()];
		return spell ? spell.level.toString() : '1';
	}

	async getSpellsByLevel(level) {
		const spellData = await this.loadSpellData();
		return Object.values(spellData).filter(spell => spell.level === level);
	}

	async getSpellsForClass(className, subclass = null) {
		// Load all spells for now - this will be enhanced with proper class spell lists later
		const spellData = await this.loadSpellData();
		const allSpells = Object.values(spellData);

		// Basic filtering - ensure spells have required fields
		let filteredSpells = allSpells.filter(spell => {
			return spell.level !== undefined &&
				   spell.level >= 0 &&
				   spell.level <= 9 &&
				   spell.name &&
				   spell.school;
		});

		// Apply subclass restrictions for arcane subclasses
		if (subclass && this.isSubclassCaster(className, subclass)) {
			filteredSpells = this.filterSpellsForSubclass(filteredSpells, className, subclass);
		}

		return filteredSpells;
	}

	filterSpellsForSubclass(spells, className, subclass) {
		// Subclass casters typically use wizard spells with school restrictions
		const wizardSpells = spells.filter(spell =>
			spell.classes &&
			spell.classes.fromClassList &&
			spell.classes.fromClassList.some(cls => cls.name === 'Wizard')
		);

		if (className === 'Fighter' && subclass === 'Eldritch Knight') {
			// Eldritch Knights focus on abjuration and evocation
			// But can learn any school at levels 8, 14, and 20
			return wizardSpells.filter(spell =>
				spell.school === 'A' || // Abjuration
				spell.school === 'V' || // Evocation
				spell.level === 0       // All cantrips are allowed
			);
		}

		if (className === 'Rogue' && subclass === 'Arcane Trickster') {
			// Arcane Tricksters focus on enchantment and illusion
			// But can learn any school at levels 8, 14, and 20
			return wizardSpells.filter(spell =>
				spell.school === 'E' || // Enchantment
				spell.school === 'I' || // Illusion
				spell.level === 0       // All cantrips are allowed
			);
		}

		// Fallback to all wizard spells for other subclasses
		return wizardSpells;
	}

	async addClassSpells(className, classLevel, characterTemplate) {
		if (!characterTemplate.spells) characterTemplate.spells = {};
		if (!characterTemplate.spells.levels) characterTemplate.spells.levels = {};

		// For now, auto-select some basic spells, but this could be enhanced to show the spell selection modal
		// For level 0 character creation, we might want to show the modal
		const isLevel0Creation = this.levelUpState && this.levelUpState.currentLevel === 0;

		// Spell selection is now handled during the level up process, not here

		// Auto-select some basic spells for now
		const availableSpells = await this.getSpellsForClass(className);
		const spellsToAdd = await this.selectSpellsForClassLevel(className, classLevel, availableSpells);

		// Add the selected spells to the character using enhanced 5etools format
		for (const [spellLevel, spellObjects] of Object.entries(spellsToAdd)) {
			if (!characterTemplate.spells.levels[spellLevel]) {
				characterTemplate.spells.levels[spellLevel] = {
					maxSlots: spellLevel === '0' ? 0 : 0, // Will be set by class progression
					slotsUsed: 0,
					spells: []
				};
			}

			spellObjects.forEach(spellData => {
				// Check if spell already exists by name to avoid duplicates
				const spellName = typeof spellData === 'string' ? spellData : spellData.name;
				const existingSpell = characterTemplate.spells.levels[spellLevel].spells.find(s =>
					(typeof s === 'string' ? s : s.name) === spellName
				);

				if (!existingSpell) {
					console.log(`✨ Adding spell: ${spellName} (Level ${spellLevel})`);
					// Store spell with source for 5etools compatibility
					const spellEntry = {
						name: spellName,
						source: (typeof spellData === 'object' && spellData.source) ? spellData.source : "PHB"
					};
					characterTemplate.spells.levels[spellLevel].spells.push(spellEntry);
				}
			});
		}
	}

	async selectSpellsForClassLevel(className, classLevel, availableSpells) {
		const selectedSpells = {};

		// Enhanced spell selection logic with full spell data
		const spellsByLevel = {};
		availableSpells.forEach(spell => {
			const level = spell.level.toString();
			if (!spellsByLevel[level]) spellsByLevel[level] = [];
			spellsByLevel[level].push(spell); // Store full spell object, not just name
		});

		// Add cantrips for all spellcasters (with source for 5etools compatibility)
		if (spellsByLevel['0'] && spellsByLevel['0'].length > 0) {
			selectedSpells['0'] = [];
			const cantripCount = Math.min(3, spellsByLevel['0'].length);
			for (let i = 0; i < cantripCount; i++) {
				const spell = spellsByLevel['0'][i];
				selectedSpells['0'].push({
					name: spell.name,
					source: spell.source || "PHB"
				});
			}
		}

		// Add 1st level spells for level 1+ casters (with source for 5etools compatibility)
		if (classLevel >= 1 && spellsByLevel['1'] && spellsByLevel['1'].length > 0) {
			selectedSpells['1'] = [];
			const spellCount = Math.min(4, spellsByLevel['1'].length);
			for (let i = 0; i < spellCount; i++) {
				const spell = spellsByLevel['1'][i];
				selectedSpells['1'].push({
					name: spell.name,
					source: spell.source || "PHB"
				});
			}
		}

		// Add 2nd level spells for level 3+ casters (with source for 5etools compatibility)
		if (classLevel >= 3 && spellsByLevel['2'] && spellsByLevel['2'].length > 0) {
			selectedSpells['2'] = [];
			const spellCount = Math.min(2, spellsByLevel['2'].length);
			for (let i = 0; i < spellCount; i++) {
				const spell = spellsByLevel['2'][i];
				selectedSpells['2'].push({
					name: spell.name,
					source: spell.source || "PHB"
				});
			}
		}

		return selectedSpells;
	}

	async createStructuredSpellData(spellData) {
		console.log('🔮 Creating structured spell data for:', spellData.name);

		return {
			name: spellData.name,
			source: spellData.source || "PHB",
			level: spellData.level,
			school: spellData.school,
			time: spellData.time,
			range: spellData.range,
			components: spellData.components,
			duration: spellData.duration,
			entries: spellData.entries,
			damageInflict: spellData.damageInflict,
			savingThrow: spellData.savingThrow,
			scalingLevelDice: spellData.scalingLevelDice,
			ritual: spellData.ritual,
			concentration: spellData.concentration,
			page: spellData.page,
			spellAttack: spellData.spellAttack,
			dataType: 'spell'
		};
	}

	async createStructuredFeatureData(featureData, source = 'class', level = null) {
		console.log('⚔️ Creating structured feature data for:', featureData.name);

		const structuredFeature = {
			name: featureData.name,
			source: featureData.source || "PHB",
			className: featureData.className,
			classSource: featureData.classSource,
			level: level || featureData.level,
			entries: featureData.entries || [],
			page: featureData.page,
			featureType: source, // class, subclass, race, background, feat
			dataType: 'feature'
		};

		// Add additional structured data if available
		if (featureData.action) structuredFeature.action = featureData.action;
		if (featureData.activation) structuredFeature.activation = featureData.activation;
		if (featureData.recharge) structuredFeature.recharge = featureData.recharge;
		if (featureData.uses) structuredFeature.uses = featureData.uses;
		if (featureData.range) structuredFeature.range = featureData.range;
		if (featureData.duration) structuredFeature.duration = featureData.duration;
		if (featureData.components) structuredFeature.components = featureData.components;

		return structuredFeature;
	}

	async createStructuredAttackData(attackData, characterLevel = 1, proficiencyBonus = 2) {
		console.log('⚔️ Creating structured attack data for:', attackData.name);

		const structuredAttack = {
			name: attackData.name,
			type: attackData.type || 'weapon', // weapon, spell, natural
			attackType: attackData.attackType || 'melee', // melee, ranged, both
			properties: attackData.properties || [],
			damage: attackData.damage || '',
			damageType: attackData.damageType || 'slashing',
			range: attackData.range || 'melee',
			toHit: attackData.toHit || '+0',
			entries: attackData.entries || [],
			source: attackData.source || "PHB",
			dataType: 'attack'
		};

		// Calculate dynamic attack bonus if we have ability modifiers
		if (attackData.ability && this.currentCharacter) {
			const abilityScore = this.currentCharacter.abilities?.[attackData.ability] || 10;
			const abilityMod = Math.floor((abilityScore - 10) / 2);
			const attackBonus = proficiencyBonus + abilityMod;
			structuredAttack.toHit = `+${attackBonus}`;

			// Calculate damage with ability modifier if needed
			if (attackData.addAbilityToDamage) {
				const baseDamage = attackData.damage || '1d6';
				structuredAttack.damage = `${baseDamage} + ${abilityMod}`;
			}
		}

		return structuredAttack;
	}

	async loadSpellByName(spellName) {
		try {
			// Initialize spell data cache if needed
			if (!this._spellDataCache) {
				this._spellDataCache = {};
			}

			// Check cache first
			if (this._spellDataCache[spellName]) {
				return this._spellDataCache[spellName];
			}

			// Load all spell data if not already loaded
			if (!this._allSpellData) {
				console.log('🔮 Loading spell database for enhanced integration...');
				this._allSpellData = await DataUtil.spell.pLoadAll();
			}

			// Find the spell by name (case-insensitive)
			const spell = this._allSpellData.find(s =>
				s.name.toLowerCase() === spellName.toLowerCase()
			);

			if (spell) {
				this._spellDataCache[spellName] = spell;
				return spell;
			}

			console.warn(`Spell not found in database: ${spellName}`);
			return null;
		} catch (error) {
			console.error(`Error loading spell ${spellName}:`, error);
			return null;
		}
	}

	async showSpellSelectionModal(className, classLevel, characterTemplate, subclass = null) {
		const availableSpells = await this.getSpellsForClass(className, subclass);
		const spellsByLevel = {};

		// Organize spells by level
		availableSpells.forEach(spell => {
			const level = spell.level.toString();
			if (!spellsByLevel[level]) spellsByLevel[level] = [];
			spellsByLevel[level].push(spell);
		});

		// Calculate how many spells the character can know at this level
		const maxSpells = await this.getMaxSpellsForClassLevel(className, classLevel, subclass);

		const modalContent = `
			<div class="text-center mb-3">
				<h4>Select Spells for ${className}</h4>
				<p>Level ${classLevel} - Choose your spells</p>
				<div class="alert alert-info">
					Select spells from the lists below. You can change these during level up.
				</div>
			</div>

			<div class="row">
				${Object.entries(spellsByLevel).map(([level, spells]) => {
					if (parseInt(level) > Math.ceil(classLevel / 2)) return ''; // Don't show spells too high level

					const levelName = level === '0' ? 'Cantrips' : `Level ${level}`;
					const maxForLevel = maxSpells[level] || 0;

					if (maxForLevel === 0) return '';

					return `
						<div class="col-md-6 mb-4">
							<div class="card">
								<div class="card-header">
									<h6 class="mb-0">${levelName} (Choose ${maxForLevel})</h6>
								</div>
								<div class="card-body">
									${spells.slice(0, 15).map(spell => `
										<div class="form-check">
											<input class="form-check-input spell-checkbox"
												type="checkbox"
												data-spell-level="${level}"
												data-spell-name="${spell.name}"
												data-max-for-level="${maxForLevel}"
												id="spell-${spell.name.replace(/\s+/g, '-')}">
											<label class="form-check-label" for="spell-${spell.name.replace(/\s+/g, '-')}">
												<strong>${spell.name}</strong>
												<br><small class="text-muted">${this.getSpellSchoolName(spell.school)} • ${this.getSpellDescription(spell)}</small>
											</label>
										</div>
									`).join('')}
								</div>
							</div>
						</div>
					`;
				}).join('')}
			</div>
		`;

		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Spell Selection",
			hasFooter: true,
			isWidth100: true,
			isUncappedHeight: true,
			isHeaderBorder: true
		});

		$modalInner.html(modalContent);

		// Fix scrolling for spell selection modal
		$modalInner.css({
			'max-height': '70vh',
			'overflow-y': 'auto'
		});

		// Add footer buttons
		const $btnConfirm = $(`<button class="ve-btn ve-btn-primary" id="confirm-spell-selection">Confirm Spell Selection</button>`)
			.click(() => {
				const selectedSpells = this.collectSelectedSpells();
				this.applySelectedSpells(selectedSpells, characterTemplate);
				doClose();
			});

		const $btnCancel = $(`<button class="ve-btn ve-btn-default mr-2">Cancel</button>`)
			.click(() => doClose());

		$modalFooter.append($btnCancel, $btnConfirm);

		// Set up event handlers for spell selection
		this.setupSpellSelectionHandlers($modalInner);
	}

	async getMaxSpellsForClassLevel(className, level, subclass = null) {
		// Load actual class data to get spell progression
		try {
			const classData = await this.loadClassData(className);
			if (!classData) {
				return this.getDefaultSpellProgression(level);
			}

			// Check if this is a subclass that provides spellcasting
			if (subclass && this.isSubclassCaster(className, subclass)) {
				return await this.getSubclassSpellProgression(className, subclass, level);
			}

			const spellProgression = {};

			// Get cantrip progression
			if (classData.cantripProgression) {
				const cantripIndex = Math.min(level - 1, classData.cantripProgression.length - 1);
				spellProgression['0'] = cantripIndex >= 0 ? classData.cantripProgression[cantripIndex] : 0;
			}

			// Get spells known progression
			if (classData.spellsKnownProgressionFixed) {
				const spellsKnownIndex = Math.min(level - 1, classData.spellsKnownProgressionFixed.length - 1);
				const totalSpellsKnown = spellsKnownIndex >= 0 ? classData.spellsKnownProgressionFixed[spellsKnownIndex] : 0;

				// Distribute known spells across levels based on spell slots available
				const spellSlots = this.calculateSpellSlots(level, classData.casterProgression || 'full');
				this.distributeKnownSpells(totalSpellsKnown, spellSlots, spellProgression);
			} else {
				// For prepared casters (like Wizard, Cleric), base on spell slots but be more conservative
				const spellSlots = this.calculateSpellSlots(level, classData.casterProgression || 'full');
				Object.entries(spellSlots).forEach(([levelKey, slots]) => {
					const spellLevel = levelKey.replace('level', '');
					// For prepared casters, allow them to know/prepare spells equal to slots + a small buffer
					spellProgression[spellLevel] = Math.max(slots, Math.min(slots + 2, 6)); // More conservative
				});
			}

			return spellProgression;
		} catch (error) {
			console.error('Error loading class spell progression:', error);
			return this.getDefaultSpellProgression(level);
		}
	}

	isSubclassCaster(className, subclass) {
		const subclassCasters = {
			'Fighter': ['Eldritch Knight'],
			'Rogue': ['Arcane Trickster']
		};
		return subclassCasters[className]?.includes(subclass) || false;
	}

	async getSubclassSpellProgression(className, subclass, level) {
		try {
			const classData = await this.loadClassData(className);
			if (!classData || !classData.subclassTableGroups) {
				return this.getDefaultSpellProgression(level);
			}

			const spellProgression = {};

			// Find the relevant subclass table groups
			for (const tableGroup of classData.subclassTableGroups) {
				const matchingSubclass = tableGroup.subclasses?.find(sc =>
					sc.name === subclass || sc.shortName === subclass
				);

				if (!matchingSubclass) continue;

				// Handle cantrips and spells known table
				if (tableGroup.colLabels && tableGroup.rows) {
					const cantripCol = tableGroup.colLabels.findIndex(label =>
						label.toLowerCase().includes('cantrips known')
					);
					const spellsCol = tableGroup.colLabels.findIndex(label =>
						label.toLowerCase().includes('spells known')
					);

					const rowIndex = Math.min(level - 1, tableGroup.rows.length - 1);
					if (rowIndex >= 0 && tableGroup.rows[rowIndex]) {
						const row = tableGroup.rows[rowIndex];

						if (cantripCol >= 0 && cantripCol < row.length) {
							spellProgression['0'] = row[cantripCol] || 0;
						}

						if (spellsCol >= 0 && spellsCol < row.length) {
							const totalSpellsKnown = row[spellsCol] || 0;
							// For subclass casters, they typically learn fewer spells across more levels
							// Distribute based on available spell slots
							const spellSlots = this.getSubclassSpellSlots(className, subclass, level);
							this.distributeKnownSpells(totalSpellsKnown, spellSlots, spellProgression);
						}
					}
				}

				// Handle spell slots table if it exists
				if (tableGroup.title?.includes('Spell Slots') && tableGroup.rowsSpellProgression) {
					const rowIndex = Math.min(level - 1, tableGroup.rowsSpellProgression.length - 1);
					if (rowIndex >= 0 && tableGroup.rowsSpellProgression[rowIndex]) {
						const slotsRow = tableGroup.rowsSpellProgression[rowIndex];

						// Map spell slots to spell levels
						for (let i = 0; i < slotsRow.length && i < 4; i++) {
							const spellLevel = (i + 1).toString();
							const slots = slotsRow[i] || 0;
							if (slots > 0) {
								// Don't override spell counts, but ensure we have slots
								if (!spellProgression[spellLevel]) {
									spellProgression[spellLevel] = Math.min(slots, 3); // Conservative for subclass casters
								}
							}
						}
					}
				}
			}

			return Object.keys(spellProgression).length > 0 ? spellProgression : this.getDefaultSpellProgression(level);
		} catch (error) {
			console.error('Error loading subclass spell progression:', error);
			return this.getDefaultSpellProgression(level);
		}
	}

	getSubclassSpellSlots(className, subclass, level) {
		// Subclass casters (like Eldritch Knight, Arcane Trickster) start at level 3
		if (level < 3) return {};

		// They are 1/3 casters - their spell slot progression is slower
		const effectiveLevel = Math.floor((level - 2) / 3);

		const spellSlots = {};

		if (effectiveLevel >= 1) spellSlots["1"] = Math.min(effectiveLevel + 1, 4);
		if (effectiveLevel >= 3) spellSlots["2"] = Math.min(effectiveLevel - 2, 3);
		if (effectiveLevel >= 5) spellSlots["3"] = Math.min(effectiveLevel - 4, 3);
		if (effectiveLevel >= 7) spellSlots["4"] = Math.min(effectiveLevel - 6, 1);

		return spellSlots;
	}

	getDefaultSpellProgression(level) {
		// Fallback basic spell progression
		return {
			'0': Math.min(4, 2 + Math.floor(level / 4)), // Cantrips
			'1': Math.min(6, 2 + Math.floor(level / 2)), // 1st level spells
			'2': level >= 3 ? Math.min(4, 1 + Math.floor((level - 3) / 2)) : 0, // 2nd level spells
			'3': level >= 5 ? Math.min(3, 1 + Math.floor((level - 5) / 3)) : 0, // 3rd level spells
		};
	}

	async getSpellLearningRestrictions(primaryClass, characterLevel, currentSpells) {
		// Get data-driven spell learning restrictions based on class progression
		try {
			const classData = await this.loadClassData(primaryClass);
			if (!classData || !classData.class || !classData.class[0]) {
				return this.getDefaultSpellLearningRestrictions(characterLevel);
			}

			const classInfo = classData.class[0];
			const restrictions = {
				cantripsToLearn: 0,
				spellsPerLevel: {}, // e.g., { '1': 2, '2': 1 }
				maxSpellLevel: this.getMaxSpellLevelForCharacterLevel(characterLevel, primaryClass),
				allowedSchools: null, // For restricted casters like Eldritch Knight
				spellList: primaryClass.toLowerCase()
			};

			// Calculate cantrip learning
			if (classInfo.cantripProgression && characterLevel <= classInfo.cantripProgression.length) {
				const currentCantrips = classInfo.cantripProgression[characterLevel - 1] || 0;
				const previousCantrips = characterLevel > 1 ? (classInfo.cantripProgression[characterLevel - 2] || 0) : 0;
				restrictions.cantripsToLearn = Math.max(0, currentCantrips - previousCantrips);
			}

			// Calculate spell learning per level
			if (classInfo.spellsKnownProgressionFixed) {
				// For classes with fixed spells known (Sorcerer, Bard, Warlock, etc.)
				const currentTotal = classInfo.spellsKnownProgressionFixed[characterLevel - 1] || 0;
				const previousTotal = characterLevel > 1 ? (classInfo.spellsKnownProgressionFixed[characterLevel - 2] || 0) : 0;
				const newSpellsToLearn = Math.max(0, currentTotal - previousTotal);

				if (newSpellsToLearn > 0) {
					// Distribute new spells across available spell levels
					// Allow learning spells of any level up to max castable level
					for (let spellLevel = 1; spellLevel <= restrictions.maxSpellLevel; spellLevel++) {
						// Allow some flexibility in spell level choices
						const currentAtLevel = currentSpells && currentSpells[spellLevel.toString()] ? currentSpells[spellLevel.toString()].length : 0;
						restrictions.spellsPerLevel[spellLevel.toString()] = Math.min(newSpellsToLearn, 6 - currentAtLevel);
					}
				}
			} else if (classInfo.preparedSpells || classInfo.spellcastingAbility) {
				// For prepared casters (Cleric, Druid, Wizard, Paladin, Ranger)
				if (characterLevel === 1) {
					if (primaryClass.toLowerCase() === 'wizard') {
						restrictions.spellsPerLevel['1'] = 6; // Wizards start with 6 1st level spells
					} else {
						restrictions.spellsPerLevel['1'] = 2; // Other prepared casters start with fewer
					}
				} else if (primaryClass.toLowerCase() === 'wizard') {
					restrictions.spellsPerLevel['1'] = 2; // Wizards learn 2 spells per level
				}
			}

			return restrictions;
		} catch (error) {
			console.error('Error getting spell learning restrictions:', error);
			return this.getDefaultSpellLearningRestrictions(characterLevel);
		}
	}

	getDefaultSpellLearningRestrictions(characterLevel) {
		// Fallback restrictions
		return {
			cantripsToLearn: characterLevel === 1 ? 2 : 0,
			spellsPerLevel: characterLevel === 1 ? { '1': 2 } : {},
			maxSpellLevel: Math.ceil(characterLevel / 2),
			allowedSchools: null,
			spellList: 'wizard'
		};
	}

	distributeKnownSpells(totalSpellsKnown, spellSlots, spellProgression) {
		// Distribute known spells across levels based on available spell slots
		const availableLevels = Object.keys(spellSlots).map(k => parseInt(k.replace('level', ''))).filter(l => l > 0);

		if (availableLevels.length === 0) return;

		// Start with 1st level spells, then distribute to higher levels
		let remainingSpells = totalSpellsKnown;

		for (const spellLevel of availableLevels.sort((a, b) => a - b)) {
			if (remainingSpells <= 0) break;

			// Allocate more spells to lower levels, but ensure all levels get some
			const baseAllocation = Math.floor(remainingSpells / (availableLevels.length - availableLevels.indexOf(spellLevel)));
			const allocation = Math.max(1, Math.min(baseAllocation, Math.ceil(remainingSpells * 0.4)));

			spellProgression[spellLevel.toString()] = allocation;
			remainingSpells -= allocation;
		}
	}

	getSpellSchoolName(schoolCode) {
		const schools = {
			'A': 'Abjuration',
			'C': 'Conjuration',
			'D': 'Divination',
			'E': 'Enchantment',
			'V': 'Evocation',
			'I': 'Illusion',
			'N': 'Necromancy',
			'T': 'Transmutation'
		};
		return schools[schoolCode] || 'Unknown';
	}

	getSpellDescription(spell) {
		if (spell.entries && spell.entries[0]) {
			const desc = spell.entries[0];
			if (typeof desc === 'string') {
				return desc.length > 100 ? desc.substring(0, 100) + '...' : desc;
			}
		}
		return 'A spell.';
	}

	setupSpellSelectionHandlers($modal) {
		// Handle checkbox changes to enforce limits
		$modal.on('change', '.spell-checkbox', function() {
			const $checkbox = $(this);
			const spellLevel = $checkbox.data('spell-level');
			const maxForLevel = parseInt($checkbox.data('max-for-level'));

			const $levelCheckboxes = $modal.find(`.spell-checkbox[data-spell-level="${spellLevel}"]`);
			const checkedCount = $levelCheckboxes.filter(':checked').length;

			if (checkedCount > maxForLevel) {
				// Uncheck this one if we're over the limit
				$checkbox.prop('checked', false);
				alert(`You can only select ${maxForLevel} spells of this level.`);
			}
		});
	}

	collectSelectedSpells() {
		const selectedSpells = {};
		$('.spell-checkbox:checked').each(function() {
			const $checkbox = $(this);
			const spellLevel = $checkbox.data('spell-level');
			const spellName = $checkbox.val(); // Get spell name from value attribute

			if (!selectedSpells[spellLevel]) selectedSpells[spellLevel] = [];
			selectedSpells[spellLevel].push(spellName);
		});
		return selectedSpells;
	}

	applySelectedSpells(selectedSpells, characterTemplate) {
		if (!characterTemplate.spells) characterTemplate.spells = {};
		if (!characterTemplate.spells.levels) characterTemplate.spells.levels = {};

		// Apply the selected spells using correct 5etools format
		Object.entries(selectedSpells).forEach(([level, spells]) => {
			if (!characterTemplate.spells.levels[level]) {
				characterTemplate.spells.levels[level] = {
					maxSlots: level === '0' ? 0 : 0, // Will be set by class progression
					slotsUsed: 0,
					spells: []
				};
			}

			spells.forEach(spellName => {
				if (!characterTemplate.spells.levels[level].spells.includes(spellName)) {
					characterTemplate.spells.levels[level].spells.push(spellName);
				}
			});
		});

		// Update the character sheet
		this.ace.setValue(JSON.stringify(characterTemplate, null, 2), 1);
		this.renderCharacter();
	}

	async openSpellSelectionModal() {
		try {
			// Get current character data
			const character = JSON.parse(this.ace.getValue());

			// Check if character has spellcasting classes
			if (!character.class || character.class.length === 0) {
				alert('No classes found. Please add a spellcasting class first.');
				return;
			}

			// Find the primary spellcasting class (first class with spellcasting ability or subclass caster)
			let spellcastingClass = null;
			let classLevel = 0;
			let subclassName = null;

			for (const classEntry of character.class) {
				const classData = await this.loadClassData(classEntry.name);

				// Check for traditional spellcasting classes
				if (classData && classData.spellcastingAbility) {
					spellcastingClass = classEntry.name;
					classLevel = classEntry.level;
					subclassName = classEntry.subclass?.name || null;
					break;
				}

				// Check for subclass casters (Eldritch Knight, Arcane Trickster)
				if (classEntry.subclass?.name && this.isSubclassCaster(classEntry.name, classEntry.subclass.name)) {
					spellcastingClass = classEntry.name;
					classLevel = classEntry.level;
					subclassName = classEntry.subclass.name;
					break;
				}
			}

			if (!spellcastingClass) {
				alert('No spellcasting classes found. Only spellcasting classes can select spells.');
				return;
			}

			// Show spell selection modal
			await this.showSpellSelectionModal(spellcastingClass, classLevel, character, subclassName);

		} catch (error) {
			console.error('Error opening spell selection modal:', error);
			alert('Error opening spell selection. Please check that your character data is valid.');
		}
	}

	calculateSpellSlots(casterLevel, progression) {
		if (casterLevel <= 0) return {};

		// Spell slots table for full casters
		const fullCasterSlots = [
			[2, 0, 0, 0, 0, 0, 0, 0, 0], // Level 1
			[3, 0, 0, 0, 0, 0, 0, 0, 0], // Level 2
			[4, 2, 0, 0, 0, 0, 0, 0, 0], // Level 3
			[4, 3, 0, 0, 0, 0, 0, 0, 0], // Level 4
			[4, 3, 2, 0, 0, 0, 0, 0, 0], // Level 5
			[4, 3, 3, 0, 0, 0, 0, 0, 0], // Level 6
			[4, 3, 3, 1, 0, 0, 0, 0, 0], // Level 7
			[4, 3, 3, 2, 0, 0, 0, 0, 0], // Level 8
			[4, 3, 3, 3, 1, 0, 0, 0, 0], // Level 9
			[4, 3, 3, 3, 2, 0, 0, 0, 0], // Level 10
			[4, 3, 3, 3, 2, 1, 0, 0, 0], // Level 11
			[4, 3, 3, 3, 2, 1, 0, 0, 0], // Level 12
			[4, 3, 3, 3, 2, 1, 1, 0, 0], // Level 13
			[4, 3, 3, 3, 2, 1, 1, 0, 0], // Level 14
			[4, 3, 3, 3, 2, 1, 1, 1, 0], // Level 15
			[4, 3, 3, 3, 2, 1, 1, 1, 0], // Level 16
			[4, 3, 3, 3, 2, 1, 1, 1, 1], // Level 17
			[4, 3, 3, 3, 3, 1, 1, 1, 1], // Level 18
			[4, 3, 3, 3, 3, 2, 1, 1, 1], // Level 19
			[4, 3, 3, 3, 3, 2, 2, 1, 1]  // Level 20
		];

		// Handle different progression types
		let slots;
		if (progression === "full") {
			if (casterLevel > 20) casterLevel = 20;
			slots = fullCasterSlots[casterLevel - 1];
		} else if (progression === "half") {
			// Half-casters (Paladin/Ranger) start at level 2
			if (casterLevel < 2) return {};

			const halfCasterSlots = [
				[0, 0, 0, 0, 0, 0, 0, 0, 0], // Level 1 (no slots)
				[2, 0, 0, 0, 0, 0, 0, 0, 0], // Level 2
				[3, 0, 0, 0, 0, 0, 0, 0, 0], // Level 3
				[3, 0, 0, 0, 0, 0, 0, 0, 0], // Level 4
				[4, 2, 0, 0, 0, 0, 0, 0, 0], // Level 5
				[4, 2, 0, 0, 0, 0, 0, 0, 0], // Level 6
				[4, 3, 0, 0, 0, 0, 0, 0, 0], // Level 7
				[4, 3, 0, 0, 0, 0, 0, 0, 0], // Level 8
				[4, 3, 2, 0, 0, 0, 0, 0, 0], // Level 9
				[4, 3, 2, 0, 0, 0, 0, 0, 0], // Level 10
				[4, 3, 3, 0, 0, 0, 0, 0, 0], // Level 11
				[4, 3, 3, 0, 0, 0, 0, 0, 0], // Level 12
				[4, 3, 3, 1, 0, 0, 0, 0, 0], // Level 13
				[4, 3, 3, 1, 0, 0, 0, 0, 0], // Level 14
				[4, 3, 3, 2, 0, 0, 0, 0, 0], // Level 15
				[4, 3, 3, 2, 0, 0, 0, 0, 0], // Level 16
				[4, 3, 3, 3, 1, 0, 0, 0, 0], // Level 17
				[4, 3, 3, 3, 1, 0, 0, 0, 0], // Level 18
				[4, 3, 3, 3, 2, 0, 0, 0, 0], // Level 19
				[4, 3, 3, 3, 2, 0, 0, 0, 0]  // Level 20
			];

			if (casterLevel > 20) casterLevel = 20;
			slots = halfCasterSlots[casterLevel - 1];
		} else if (progression === "third") {
			// Third-casters start at level 3 and progress much slower
			const thirdLevel = Math.floor(casterLevel / 3);
			if (thirdLevel <= 0) return {};
			if (thirdLevel > 20) thirdLevel = 20;
			slots = fullCasterSlots[thirdLevel - 1];
		} else if (progression === "pact") {
			// Warlocks have special pact magic progression
			if (casterLevel >= 17) slots = [0, 0, 0, 0, 4, 0, 0, 0, 0];      // 4 level-5 slots
			else if (casterLevel >= 15) slots = [0, 0, 0, 0, 3, 0, 0, 0, 0]; // 3 level-5 slots
			else if (casterLevel >= 11) slots = [0, 0, 0, 0, 3, 0, 0, 0, 0]; // 3 level-5 slots
			else if (casterLevel >= 9) slots = [0, 0, 0, 0, 2, 0, 0, 0, 0];  // 2 level-5 slots
			else if (casterLevel >= 7) slots = [0, 0, 0, 2, 0, 0, 0, 0, 0];  // 2 level-4 slots
			else if (casterLevel >= 5) slots = [0, 0, 2, 0, 0, 0, 0, 0, 0];  // 2 level-3 slots
			else if (casterLevel >= 3) slots = [0, 2, 0, 0, 0, 0, 0, 0, 0];  // 2 level-2 slots
			else if (casterLevel >= 1) slots = [1, 0, 0, 0, 0, 0, 0, 0, 0];  // 1 level-1 slot
			else return {};
		} else {
			return {};
		}

		const spellSlots = {};
		for (let i = 0; i < slots.length; i++) {
			if (slots[i] > 0) {
				spellSlots[`${i + 1}`] = slots[i];
			}
		}

		return spellSlots;
	}

	populateSpellSlotsIntoLevels(spellSlots, characterTemplate) {
		if (!characterTemplate.spells.levels) characterTemplate.spells.levels = {};

		// Convert spellSlots format { "1": 2, "2": 1 } to levels structure
		Object.entries(spellSlots).forEach(([levelKey, maxSlots]) => {
			const spellLevel = levelKey;

			if (!characterTemplate.spells.levels[spellLevel]) {
				characterTemplate.spells.levels[spellLevel] = {
					maxSlots: 0,
					slotsUsed: 0,
					spells: []
				};
			}

			// Set the max slots but preserve existing slotsUsed and spells
			characterTemplate.spells.levels[spellLevel].maxSlots = maxSlots;
		});
	}

	applyAbilityScoreImprovements(classes, characterTemplate) {
		// In D&D 5e, classes get ability score improvements at certain levels
		// Fighter and Rogue get bonus ASIs, so we need class-specific calculations

		// Calculate total ASI points available based on class levels
		let totalASIPoints = 0;

		classes.forEach(classEntry => {
			const className = classEntry.name || classEntry.className || '';
			const classLevel = classEntry.level || 1;
			const asiLevels = this.getASILevelsForClass(className);

			// Count how many ASI levels this class has reached
			const availableASIs = asiLevels.filter(level => classLevel >= level).length;
			totalASIPoints += availableASIs * 2; // Each ASI gives 2 points to distribute
		});

		// Apply ASI improvements to existing ability scores
		if (totalASIPoints > 0) {
			// Prioritize improvements based on class needs
			const priorities = this.getClassAbilityPriorities(classes);

			// Convert priorities to sorted array
			const abilityOrder = Object.keys(priorities)
				.sort((a, b) => priorities[b] - priorities[a])
				.slice(0, 3); // Focus on top 3 abilities

			// Distribute ASI points intelligently
			let pointsToDistribute = totalASIPoints;

			while (pointsToDistribute > 0) {
				let improved = false;

				for (const ability of abilityOrder) {
					if (pointsToDistribute <= 0) break;

					// Don't go above 20 (racial bonuses might have pushed some scores higher)
					if (characterTemplate[ability] < 20) {
						characterTemplate[ability]++;
						pointsToDistribute--;
						improved = true;

						// Don't over-improve any single stat
						if (characterTemplate[ability] >= 18) {
							break;
						}
					}
				}

				// Safety check to prevent infinite loop
				if (!improved) break;
			}
		}

		return characterTemplate;
	}

	async getRacialTraits(race) {
		try {
			// Load race data from 5etools JSON files
			const raceFileName = `races.json`;
			const response = await fetch(`data/${raceFileName}`);

			if (!response.ok) {
				console.warn(`Could not load race data`);
				return [];
			}

			const raceData = await response.json();

			// Find the specific race
			const raceInfo = raceData.race?.find(r =>
				r.name === race.name && r.source === race.source
			);

			if (!raceInfo) {
				console.warn(`Race ${race.name} not found in data`);
				return [];
			}

			const traits = [];

			// Add main racial traits (excluding basic stats that are applied to character directly)
			const excludedTraitNames = ['Age', 'Size', 'Speed', 'Languages', 'Ability Score Increase', 'Alignment'];

			if (raceInfo.entries) {
				raceInfo.entries.forEach(entry => {
					if (typeof entry === 'object' && entry.name && !excludedTraitNames.includes(entry.name)) {
						traits.push({
							name: entry.name,
							entries: entry.entries || [entry.entry || 'Racial trait.']
						});
					}
				});
			}

			// Note: Ability Score Increase, Size, and Speed are excluded from traits
			// and should be extracted separately using getRacialStats method

			// Handle subraces
			if (race.subrace && raceInfo.subraces) {
				const subrace = raceInfo.subraces.find(sr => sr.name === race.subrace);
				if (subrace && subrace.entries) {
					subrace.entries.forEach(entry => {
						if (typeof entry === 'object' && entry.name) {
							traits.push({
								name: `${entry.name} (${race.subrace})`,
								entries: entry.entries || [entry.entry || 'Subrace trait.']
							});
						}
					});
				}
			}

			return traits;
		} catch (error) {
			console.error(`Error loading racial traits:`, error);
			return [];
		}
	}

	async getRacialStats(race) {
		try {
			// Load race data from 5etools JSON files
			const raceFileName = `races.json`;
			const response = await fetch(`data/${raceFileName}`);

			if (!response.ok) {
				console.warn(`Could not load race data`);
				return {};
			}

			const raceData = await response.json();

			// Find the specific race
			const raceInfo = raceData.race?.find(r =>
				r.name === race.name && r.source === race.source
			);

			if (!raceInfo) {
				console.warn(`Race ${race.name} not found in data`);
				return {};
			}

			const racialStats = {};

			// Extract Ability Score Increase
			if (raceInfo.ability && raceInfo.ability.length > 0) {
				const abilityText = raceInfo.ability.map(ab => {
					if (ab.choose) {
						return `Choose ${ab.choose.count || 1} ability score${(ab.choose.count || 1) > 1 ? 's' : ''} to increase by ${ab.choose.amount || 1}.`;
					} else {
						const abilities = Object.entries(ab)
							.filter(([key, value]) => key !== 'choose' && typeof value === 'number')
							.map(([ability, bonus]) => `${ability.toUpperCase()} +${bonus}`)
							.join(', ');
						return abilities;
					}
				}).filter(Boolean).join(' ');

				if (abilityText) {
					racialStats.abilityScoreIncrease = {
						name: "Ability Score Increase",
						description: abilityText,
						raw: raceInfo.ability
					};
				}
			}

			// Extract Size
			if (raceInfo.size) {
				const sizeText = Array.isArray(raceInfo.size)
					? raceInfo.size.map(s => s.toUpperCase()).join(' or ')
					: raceInfo.size.toUpperCase();
				racialStats.size = {
					name: "Size",
					description: `Your size is ${sizeText}.`,
					raw: raceInfo.size
				};
			}

			// Extract Speed
			if (raceInfo.speed) {
				let speedText = '';
				if (typeof raceInfo.speed === 'number') {
					speedText = `Your base walking speed is ${raceInfo.speed} feet.`;
				} else if (typeof raceInfo.speed === 'object') {
					const speeds = [];
					if (raceInfo.speed.walk) speeds.push(`walking speed ${raceInfo.speed.walk} feet`);
					if (raceInfo.speed.fly) speeds.push(`flying speed ${raceInfo.speed.fly} feet`);
					if (raceInfo.speed.swim) speeds.push(`swimming speed ${raceInfo.speed.swim} feet`);
					if (raceInfo.speed.climb) speeds.push(`climbing speed ${raceInfo.speed.climb} feet`);
					speedText = `Your base ${speeds.join(', ')}.`;
				}

				if (speedText) {
					racialStats.speed = {
						name: "Speed",
						description: speedText,
						raw: raceInfo.speed
					};
				}
			}

			// Handle subraces
			if (race.subrace && raceInfo.subraces) {
				const subrace = raceInfo.subraces.find(sr => sr.name === race.subrace);
				if (subrace) {
					// Check if subrace has additional ability score increases
					if (subrace.ability && subrace.ability.length > 0) {
						const subraceAbilityText = subrace.ability.map(ab => {
							if (ab.choose) {
								return `Choose ${ab.choose.count || 1} ability score${(ab.choose.count || 1) > 1 ? 's' : ''} to increase by ${ab.choose.amount || 1}.`;
							} else {
								const abilities = Object.entries(ab)
									.filter(([key, value]) => key !== 'choose' && typeof value === 'number')
									.map(([ability, bonus]) => `${ability.toUpperCase()} +${bonus}`)
									.join(', ');
								return abilities;
							}
						}).filter(Boolean).join(' ');

						if (subraceAbilityText) {
							if (racialStats.abilityScoreIncrease) {
								racialStats.abilityScoreIncrease.description += ` ${subraceAbilityText}`;
								racialStats.abilityScoreIncrease.raw = racialStats.abilityScoreIncrease.raw.concat(subrace.ability);
							} else {
								racialStats.abilityScoreIncrease = {
									name: "Ability Score Increase",
									description: subraceAbilityText,
									raw: subrace.ability
								};
							}
						}
					}

					// Check if subrace modifies speed
					if (subrace.speed) {
						let subraceSpeedText = '';
						if (typeof subrace.speed === 'number') {
							subraceSpeedText = `Your base walking speed is ${subrace.speed} feet.`;
						} else if (typeof subrace.speed === 'object') {
							const speeds = [];
							if (subrace.speed.walk) speeds.push(`walking speed ${subrace.speed.walk} feet`);
							if (subrace.speed.fly) speeds.push(`flying speed ${subrace.speed.fly} feet`);
							if (subrace.speed.swim) speeds.push(`swimming speed ${subrace.speed.swim} feet`);
							if (subrace.speed.climb) speeds.push(`climbing speed ${subrace.speed.climb} feet`);
							subraceSpeedText = `Your base ${speeds.join(', ')}.`;
						}

						if (subraceSpeedText) {
							racialStats.speed = {
								name: "Speed",
								description: subraceSpeedText,
								raw: subrace.speed
							};
						}
					}
				}
			}

			// Extract Age
			if (raceInfo.age) {
				let ageText = '';
				let randomAge = null;

				if (raceInfo.age.mature && raceInfo.age.max) {
					// Generate random age based on race maturity and max age
					const maturityAge = raceInfo.age.mature;
					const maxAge = raceInfo.age.max;

					// Most characters are young adults to middle-aged (mature age to 70% of max age)
					const youngAdultMax = Math.floor(maxAge * 0.7);
					randomAge = maturityAge + Math.floor(Math.random() * (youngAdultMax - maturityAge));

					ageText = `${randomAge} years old. Your people mature at ${maturityAge} and live up to ${maxAge} years.`;
				} else if (typeof raceInfo.age === 'string' || (raceInfo.age.entries && raceInfo.age.entries.length > 0)) {
					// Handle age descriptions without specific numbers
					const ageDescription = typeof raceInfo.age === 'string'
						? raceInfo.age
						: raceInfo.age.entries.join(' ');

					// Try to extract numbers for random generation
					const maturityMatch = ageDescription.match(/mature.*?(\d+)/i);
					const maxMatch = ageDescription.match(/live.*?(\d+)/i);

					if (maturityMatch && maxMatch) {
						const maturityAge = parseInt(maturityMatch[1]);
						const maxAge = parseInt(maxMatch[1]);
						const youngAdultMax = Math.floor(maxAge * 0.7);
						randomAge = maturityAge + Math.floor(Math.random() * (youngAdultMax - maturityAge));
						ageText = `${randomAge} years old. ${ageDescription}`;
					} else {
						// Fallback for races without clear age ranges
						randomAge = 20 + Math.floor(Math.random() * 30); // 20-49 years
						ageText = `${randomAge} years old. ${ageDescription}`;
					}
				} else {
					// Fallback for races without age data
					randomAge = 20 + Math.floor(Math.random() * 30); // 20-49 years
					ageText = `${randomAge} years old.`;
				}

				racialStats.age = {
					name: "Age",
					description: ageText,
					value: randomAge,
					raw: raceInfo.age
				};
			}

			return racialStats;
		} catch (error) {
			console.error(`Error loading racial stats:`, error);
			return {};
		}
	}

	async generateClassFeatureEntries(classes) {
		const featureEntries = [];

		for (const classInfo of classes) {
			const className = classInfo.name;
			const level = classInfo.level;
			const subclassName = classInfo.subclass?.name || classInfo.subclass?.shortName;

			// Get all class features for this level
			const classFeatures = await this.getClassFeaturesAtLevel(className, level);
			const subclassFeatures = subclassName ?
				await this.getSubclassFeaturesAtLevel(className, subclassName, level) : [];

			// Add class features
			classFeatures.forEach(feature => {
				featureEntries.push({
					name: feature.name,
					entries: feature.entries || [`${className} feature gained at ${feature.level}${this.getOrdinalSuffix(feature.level)} level.`]
				});
			});

			// Add subclass features
			subclassFeatures.forEach(feature => {
				featureEntries.push({
					name: feature.name,
					entries: feature.entries || [`${feature.subclass} feature gained at ${feature.level}${this.getOrdinalSuffix(feature.level)} level.`]
				});
			});
		}

		return featureEntries;
	}


	async generateRandomAC(classes, abilityScores, race = null) {
		const dexMod = Math.floor((abilityScores.dex - 10) / 2);
		const conMod = Math.floor((abilityScores.con - 10) / 2);
		const wisMod = Math.floor((abilityScores.wis - 10) / 2);


		// Default unarmored AC
		let computedAC = 10 + dexMod;
		let from = [];

		// Racial natural armor takes precedence
		if (race && race.name) {
			const racialAC = this.getRacialNaturalArmor(race.name, dexMod);
			if (racialAC) {
				return [{ ac: racialAC.ac, from: [racialAC.type] }];
			}
		}

		// Class-based unarmored defenses (Monk/Barbarian)
		const monkClass = classes.find(cls => cls.name === "Monk");
		const barbarianClass = classes.find(cls => cls.name === "Barbarian");

		if (monkClass && Math.random() < 0.6) {
			computedAC = 10 + dexMod + wisMod;
			from.push('Unarmored Defense (Monk)');
			return [{ ac: Math.max(computedAC, 10 + dexMod), from }];
		}
		if (barbarianClass && Math.random() < 0.6) {
			computedAC = 10 + dexMod + conMod;
			from.push('Unarmored Defense (Barbarian)');
			return [{ ac: Math.max(computedAC, 10 + dexMod), from }];
		}

		// Determine armor proficiencies and pick a concrete armor
		const hasHeavyArmor = await this.hasArmorProficiency(classes, 'heavy');
		const hasMediumArmor = await this.hasArmorProficiency(classes, 'medium');
		const hasLightArmor = await this.hasArmorProficiency(classes, 'light');

		// Helper to add shield
		const maybeAddShield = () => {
			// If class is likely to use shields (fighters, paladins, clerics, etc.) and has medium/heavy prof
			const primaryClass = classes[0]?.name || '';
			const shieldUsers = ['Fighter', 'Paladin', 'Cleric', 'Ranger'];
			if ((hasHeavyArmor || hasMediumArmor) && shieldUsers.includes(primaryClass) && Math.random() < 0.6) return true;
			// Small chance for others
			if ((hasHeavyArmor || hasMediumArmor) && Math.random() < 0.15) return true;
			return false;
		};

		if (hasHeavyArmor && Math.random() < 0.75) {
			// Pick a heavy armor
			const heavyOptions = [
				{ name: 'Plate', ac: 18 },
				{ name: 'Splint', ac: 17 },
				{ name: 'Chain Mail', ac: 16 }
			];
			const pick = heavyOptions[Math.floor(Math.random() * heavyOptions.length)];
			computedAC = pick.ac;
			from.push(pick.name);
			if (maybeAddShield()) {
				computedAC += 2;
				from.push('Shield');
			}
			return [{ ac: computedAC, from }];
		}

		if (hasMediumArmor && Math.random() < 0.7) {
			// Medium armor: AC = base + min(dexMod, 2)
			const mediumOptions = [
				{ name: 'Half-Plate', base: 15, stealthDisadvantage: true },
				{ name: 'Scale Mail', base: 14, stealthDisadvantage: true },
				{ name: 'Breastplate', base: 14, stealthDisadvantage: false },
				{ name: 'Hide', base: 12, stealthDisadvantage: false }
			];
			const pick = mediumOptions[Math.floor(Math.random() * mediumOptions.length)];
			computedAC = pick.base + Math.min(dexMod, 2);
			from.push(pick.name + (pick.stealthDisadvantage ? ' (disadv. Stealth)' : ''));
			if (maybeAddShield()) {
				computedAC += 2;
				from.push('Shield');
			}
			return [{ ac: computedAC, from }];
		}

		if (hasLightArmor || Math.random() < 0.6) {
			// Light armor: Leather (11 + Dex) or Studded Leather (12 + Dex)
			const lightOptions = [
				{ name: 'Leather', base: 11 },
				{ name: 'Studded Leather', base: 12 }
			];
			const pick = lightOptions[Math.floor(Math.random() * lightOptions.length)];
			computedAC = pick.base + dexMod;
			from.push(pick.name);
			// Light armor users rarely carry shields, but allow small chance
			if (maybeAddShield() && Math.random() < 0.2) {
				computedAC += 2;
				from.push('Shield');
			}
			return [{ ac: computedAC, from }];
		}

		// Default: unarmored
		from.push('Unarmored');
		return [{ ac: computedAC, from }];
	}

	getRacialNaturalArmor(raceName, dexMod) {
		const racialArmor = {
			"Lizardfolk": {
				ac: 13 + dexMod,
				type: "natural armor"
			},
			"Loxodon": {
				ac: 12 + dexMod,
				type: "natural armor"
			},
			"Tortle": {
				ac: 17, // Fixed AC, no Dex bonus
				type: "natural armor"
			},
			"Warforged": {
				ac: 11 + dexMod, // Base integrated protection
				type: "integrated protection"
			}
		};

		return racialArmor[raceName] || null;
	}

	async hasArmorProficiency(classes, armorType) {
		// Check each class for armor proficiency
		for (const cls of classes) {
			try {
				const response = await fetch(`data/class/class-${cls.name.toLowerCase()}.json`);
				if (response.ok) {
					const classData = await response.json();
					const classInfo = classData.class?.[0];
					if (classInfo?.startingProficiencies?.armor?.includes(armorType)) {
						return true;
					}
				}
			} catch (error) {
				console.warn(`Could not load class data for ${cls.name}:`, error);
			}
		}

		// Fallback to hardcoded data if file loading fails
		const fallbackProficiencies = {
			"heavy": ["Fighter", "Paladin", "Cleric"],
			"medium": ["Fighter", "Paladin", "Cleric", "Barbarian", "Ranger", "Druid"],
			"light": ["Fighter", "Paladin", "Cleric", "Barbarian", "Ranger", "Druid", "Bard", "Rogue", "Warlock"]
		};

		return classes.some(cls => fallbackProficiencies[armorType]?.includes(cls.name));
	}

	async generateRandomSaves(abilityScores, classes, profBonus) {
		// Instead of calculating final bonuses, just store which saves are proficient
		const proficientSaves = [];

		// In D&D 5e, you only get saving throw proficiencies from your FIRST class when multiclassing
		if (classes.length > 0) {
			const primaryClass = classes[0];
			try {
				const classData = await this.loadClassData(primaryClass.name);
				if (classData && classData.class && classData.class[0] && classData.class[0].proficiency) {
					// Add saving throw proficiencies from class data
					classData.class[0].proficiency.forEach(save => {
						if (!proficientSaves.includes(save)) {
							proficientSaves.push(save);
						}
					});
				}
			} catch (e) {
				console.warn(`Could not load saving throw proficiencies for ${primaryClass.name}:`, e);
			}
		}

		return proficientSaves;
	}

	// Standard D&D 5e proficiency bonus by total character level
	getProficiencyBonus(totalLevel) {
		return Math.ceil(totalLevel / 4) + 1;
	}

	/**
	 * Get the levels at which a class gains Ability Score Improvements
	 * Fighter gets bonus ASI at levels 6 and 14
	 * Rogue gets bonus ASI at level 10
	 * All other classes follow the standard progression
	 */
	getASILevelsForClass(className) {
		const classNameLower = (className || '').toLowerCase();

		if (classNameLower === 'fighter') {
			return [4, 6, 8, 12, 14, 16, 19]; // Fighter bonus ASI at 6, 14
		} else if (classNameLower === 'rogue') {
			return [4, 8, 10, 12, 16, 19]; // Rogue bonus ASI at 10
		} else {
			return [4, 8, 12, 16, 19]; // Standard ASI progression
		}
	}

	/**
	 * Check if a given level is an ASI level for any of the character's classes
	 */
	isASILevel(level, classes) {
		if (!classes || !Array.isArray(classes)) return false;

		return classes.some(classEntry => {
			const className = classEntry.name || classEntry.className || '';
			const classLevel = classEntry.level || 1;
			const asiLevels = this.getASILevelsForClass(className);

			// Check if this class has reached this ASI level
			return classLevel >= level && asiLevels.includes(level);
		});
	}

	async generateRandomSkills(abilityScores, classes, profBonus, race, background) {
		// Instead of calculating final bonuses, just store which skills are proficient
		const proficientSkills = [];

		// In D&D 5e, you only get skill proficiencies from your FIRST class when multiclassing
		if (classes.length > 0) {
			const primaryClass = classes[0];
			const classSkills = await this.getClassSkillProficiencies(primaryClass.name);
			const availableSkills = classSkills.choices || [];
			const automaticSkills = classSkills.automatic || [];
			const numChoices = classSkills.numChoices || 2;

			// Add automatic proficiencies from first class only
			automaticSkills.forEach(skill => {
				if (!proficientSkills.includes(skill)) {
					proficientSkills.push(skill);
				}
			});

			// Add random choices from first class only
			if (availableSkills.length > 0) {
				const selectedFromClass = this.selectWeightedSkills(availableSkills, numChoices, [primaryClass], race);
				selectedFromClass.forEach(skill => {
					if (!proficientSkills.includes(skill)) {
						proficientSkills.push(skill);
					}
				});
			}
		}

		// Add racial skill proficiencies (limited)
		const racialSkills = this.getRacialSkillProficiencies(race);
		racialSkills.forEach(skill => {
			if (!proficientSkills.includes(skill)) {
				proficientSkills.push(skill);
			}
		});

		// Add background skill proficiencies (should be exactly 2 for most backgrounds)
		if (background && typeof DataLoader !== 'undefined') {
			try {
				// Attempt to find canonical background entry by name
				await DataLoader.pCacheAndGetAllSite(UrlUtil.PG_BACKGROUNDS);
				const allBgs = (DataLoader._CACHE && DataLoader._CACHE.getAllSite) ? DataLoader._CACHE.getAllSite(UrlUtil.PG_BACKGROUNDS) : [];
				const found = (allBgs || []).find(b => (b.name || '').toLowerCase() === (background.name || '').toLowerCase());
				if (found && found.skill) {
					// `found.skill` may be an array of skill names or objects
					const skillsFromData = Array.isArray(found.skill) ? found.skill.map(s => typeof s === 'string' ? s : s.name).filter(Boolean) : [];
					skillsFromData.forEach(s => {
						if (!proficientSkills.includes(s)) {
							proficientSkills.push(s);
						}
					});
				} else {
					const backgroundSkills = this.generateBackgroundSkills(background);
					backgroundSkills.forEach(skill => {
						if (!proficientSkills.includes(skill)) {
							proficientSkills.push(skill);
						}
					});
				}
			} catch (e) {
				const backgroundSkills = this.generateBackgroundSkills(background);
				backgroundSkills.forEach(skill => {
					if (!proficientSkills.includes(skill)) {
						proficientSkills.push(skill);
					}
				});
			}
		} else if (background) {
			const backgroundSkills = this.generateBackgroundSkills(background);
			backgroundSkills.forEach(skill => {
				if (!proficientSkills.includes(skill)) {
					proficientSkills.push(skill);
				}
			});
		}

		return proficientSkills;
	}

	async getClassSkillProficiencies(className) {
		try {
			const classData = await this.loadClassData(className);
			if (!classData || !classData.class || !classData.class[0]) {
				console.warn(`Could not load class data for skill proficiencies: ${className}`);
				return { choices: [], numChoices: 0, automatic: [] };
			}

			const classInfo = classData.class[0];
			const skillProfs = classInfo.startingProficiencies?.skills?.[0];

			if (!skillProfs) {
				return { choices: [], numChoices: 0, automatic: [] };
			}

			// Convert skill names from JSON format (spaces) to internal format (underscores)
			const convertSkillName = (skill) => {
				return skill.replace(/\s+/g, '_').toLowerCase();
			};

			// Handle choose structure: { choose: { from: [...], count: N } }
			if (skillProfs.choose) {
				return {
					choices: (skillProfs.choose.from || []).map(convertSkillName),
					numChoices: skillProfs.choose.count || 2,
					automatic: []
				};
			}

			// Handle direct array of skills (automatic proficiencies)
			if (Array.isArray(skillProfs)) {
				return {
					choices: [],
					numChoices: 0,
					automatic: skillProfs.map(convertSkillName)
				};
			}

			return { choices: [], numChoices: 0, automatic: [] };
		} catch (e) {
			console.error(`Error loading skill proficiencies for ${className}:`, e);
			return { choices: [], numChoices: 0, automatic: [] };
		}
	}

	selectWeightedSkills(availableSkills, numChoices, classes, race) {
		const selected = [];
		const skillWeights = {};

		// Initialize all skills with base weight
		availableSkills.forEach(skill => {
			skillWeights[skill] = 1;
		});

		// Weight skills based on class synergy
		classes.forEach(cls => {
			const classWeights = this.getClassSkillWeights(cls.name);
			Object.keys(classWeights).forEach(skill => {
				if (skillWeights[skill] !== undefined) {
					skillWeights[skill] *= classWeights[skill];
				}
			});
		});

		// Weight skills based on racial traits
		const racialWeights = this.getRacialSkillWeights(race);
		Object.keys(racialWeights).forEach(skill => {
			if (skillWeights[skill] !== undefined) {
				skillWeights[skill] *= racialWeights[skill];
			}
		});

		// Select skills using weighted random selection
		for (let i = 0; i < numChoices && selected.length < availableSkills.length; i++) {
			const remainingSkills = availableSkills.filter(skill => !selected.includes(skill));
			if (remainingSkills.length === 0) break;

			const totalWeight = remainingSkills.reduce((sum, skill) => sum + skillWeights[skill], 0);
			let random = Math.random() * totalWeight;

			for (const skill of remainingSkills) {
				random -= skillWeights[skill];
				if (random <= 0) {
					selected.push(skill);
					break;
				}
			}
		}

		return selected;
	}

	getClassSkillWeights(className) {
		const weights = {
			"Barbarian": {
				"athletics": 3, "intimidation": 3, "survival": 2.5, "animal_handling": 2, "nature": 2, "perception": 2
			},
			"Bard": {
				"performance": 3, "persuasion": 2.5, "deception": 2, "history": 2, "insight": 2
			},
			"Cleric": {
				"religion": 3, "insight": 2.5, "medicine": 2, "history": 2, "persuasion": 2
			},
			"Druid": {
				"nature": 3, "survival": 2.5, "animal_handling": 2.5, "medicine": 2, "perception": 2
			},
			"Fighter": {
				"athletics": 3, "intimidation": 2, "history": 2, "perception": 2, "survival": 1.5
			},
			"Monk": {
				"acrobatics": 3, "athletics": 2.5, "stealth": 2, "insight": 2, "religion": 1.5
			},
			"Paladin": {
				"religion": 3, "athletics": 2.5, "intimidation": 2, "medicine": 2, "insight": 2
			},
			"Ranger": {
				"survival": 3, "perception": 3, "nature": 2.5, "stealth": 2, "animal_handling": 2
			},
			"Rogue": {
				"stealth": 3, "sleight_of_hand": 3, "perception": 2.5, "investigation": 2, "deception": 2
			},
			"Sorcerer": {
				"arcana": 3, "persuasion": 2, "deception": 2, "intimidation": 1.5
			},
			"Warlock": {
				"arcana": 3, "deception": 2.5, "intimidation": 2, "investigation": 2
			},
			"Wizard": {
				"arcana": 3, "investigation": 2.5, "history": 2.5, "religion": 2, "medicine": 1.5
			}
		};

		return weights[className] || {};
	}

	getRacialSkillWeights(race) {
		if (!race) return {};

		const weights = {
			"Elf": { "perception": 2 },
			"Half-Elf": { "persuasion": 2, "deception": 1.5 },
			"Human": {},
			"Dwarf": { "history": 2 },
			"Halfling": { "stealth": 2 },
			"Dragonborn": { "intimidation": 2 },
			"Gnome": { "arcana": 2 },
			"Half-Orc": { "intimidation": 2.5, "athletics": 1.5 },
			"Tiefling": { "deception": 2, "intimidation": 1.5 }
		};

		return weights[race.name] || {};
	}

	getRacialSkillProficiencies(race) {
		if (!race) return [];

		const racialSkills = {
			"Elf": ["perception"],
			"Half-Elf": Math.random() < 0.7 ? ["persuasion"] : [],
			"Variant Human": Math.random() < 0.5 ? [this.getRandomSkill()] : [],
			"Drow": ["perception"],
			"Wood Elf": ["perception"],
			"High Elf": ["perception"]
		};

		return racialSkills[race.name] || [];
	}

	generateBackgroundSkills(background) {
		// If a canonical background object is provided, map its name to the standard skill pair
		const map = {
			"Acolyte": ["history", "religion"],
			"Charlatan": ["deception", "sleight_of_hand"],
			"Criminal": ["deception", "stealth"],
			"Entertainer": ["performance", "persuasion"],
			"Folk Hero": ["animal_handling", "survival"],
			"Guild Artisan": ["insight", "persuasion"],
			"Hermit": ["medicine", "religion"],
			"Noble": ["history", "persuasion"],
			"Outlander": ["athletics", "survival"],
			"Sage": ["arcana", "history"],
			"Sailor": ["athletics", "perception"],
			"Soldier": ["athletics", "intimidation"],
			"Urchin": ["sleight_of_hand", "stealth"]
		};

		if (background && typeof background === 'object' && background.name && map[background.name]) {
			return map[background.name];
		}

		// Fallback: random pair from a curated list
		const backgroundSkillSets = [
			["history", "religion"], // Acolyte
			["deception", "sleight_of_hand"], // Criminal
			["insight", "persuasion"], // Folk Hero
			["athletics", "survival"], // Outlander
			["history", "persuasion"], // Noble
			["investigation", "nature"], // Hermit
			["performance", "persuasion"], // Entertainer
			["animal_handling", "survival"], // Folk Hero
			["arcana", "history"], // Sage
			["athletics", "intimidation"], // Soldier
			["deception", "stealth"], // Criminal
			["medicine", "religion"] // Acolyte
		];

		return backgroundSkillSets[Math.floor(Math.random() * backgroundSkillSets.length)];
	}

	getRandomSkill() {
		const skills = [
			"acrobatics", "animal_handling", "arcana", "athletics", "deception",
			"history", "insight", "intimidation", "investigation", "medicine",
			"nature", "perception", "performance", "persuasion", "religion",
			"sleight_of_hand", "stealth", "survival"
		];
		return skills[Math.floor(Math.random() * skills.length)];
	}

	generateToolProficiencies(classes, race, background) {
		const toolProficiencies = new Set();

		// Class-based tool proficiencies
		classes.forEach(cls => {
			const classTools = this.getClassToolProficiencies(cls.name);
			classTools.forEach(tool => toolProficiencies.add(tool));
		});

		// Racial tool proficiencies
		const racialTools = this.getRacialToolProficiencies(race);
		racialTools.forEach(tool => toolProficiencies.add(tool));

		// Background tool proficiencies (thematic selection)
		const backgroundTools = this.generateBackgroundTools(background);
		backgroundTools.forEach(tool => toolProficiencies.add(tool));

		return Array.from(toolProficiencies);
	}

	getClassToolProficiencies(className) {
		const classTools = {
			"Barbarian": [],
			"Bard": ["musical_instrument", "musical_instrument", "musical_instrument"], // 3 instruments
			"Cleric": [],
			"Druid": ["herbalism_kit"],
			"Fighter": Math.random() < 0.5 ? ["smith_tools"] : [],
			"Monk": Math.random() < 0.6 ? ["artisan_tools"] : [],
			"Paladin": [],
			"Ranger": [],
			"Rogue": ["thieves_tools"],
			"Sorcerer": [],
			"Warlock": [],
			"Wizard": []
		};

		return classTools[className] || [];
	}

	getRacialToolProficiencies(race) {
		if (!race) return [];

		const racialTools = {
			"Dwarf": ["smith_tools", "brewer_supplies", "mason_tools"],
			"Mountain Dwarf": ["smith_tools"],
			"Hill Dwarf": [],
			"Elf": [],
			"High Elf": [],
			"Wood Elf": [],
			"Drow": [],
			"Halfling": [],
			"Human": [],
			"Variant Human": Math.random() < 0.5 ? ["artisan_tools"] : [],
			"Dragonborn": [],
			"Gnome": ["tinker_tools"],
			"Forest Gnome": ["tinker_tools"],
			"Rock Gnome": ["tinker_tools", "artisan_tools"],
			"Half-Elf": [],
			"Half-Orc": [],
			"Tiefling": []
		};

		return racialTools[race.name] || [];
	}

	generateBackgroundTools(background) {
		const toolSets = [
			["gaming_set"], // Gambler
			["forgery_kit"], // Criminal
			["cartographer_tools"], // Outlander
			["artisan_tools"], // Guild Artisan
			["musical_instrument"], // Entertainer
			["herbalism_kit"], // Hermit
			["gaming_set"], // Noble
			["alchemist_supplies"], // Sage
			["smith_tools"], // Soldier
			["thieves_tools"], // Criminal
			["mason_tools"], // Guild Artisan
			["brewer_supplies"] // Tavern Keep
		];

		return toolSets[Math.floor(Math.random() * toolSets.length)];
	}

	generateLanguageProficiencies(classes, race, background) {
		const languages = new Set();

		// Common is always known
		languages.add("Common");

		// Racial languages
		const racialLanguages = this.getRacialLanguages(race);
		racialLanguages.forEach(lang => languages.add(lang));

		// Class languages
		const classLanguages = this.getClassLanguages(classes);
		classLanguages.forEach(lang => languages.add(lang));

		// Background languages (1-2 additional)
		const backgroundLanguages = this.generateBackgroundLanguages(background);
		backgroundLanguages.forEach(lang => languages.add(lang));

		return Array.from(languages);
	}

	getRacialLanguages(race) {
		if (!race) return [];

		const racialLanguages = {
			"Dwarf": ["Dwarvish"],
			"Elf": ["Elvish"],
			"Halfling": ["Halfling"],
			"Human": Math.random() < 0.8 ? [this.getRandomLanguage()] : [],
			"Variant Human": [this.getRandomLanguage()],
			"Dragonborn": ["Draconic"],
			"Gnome": ["Gnomish"],
			"Half-Elf": ["Elvish"],
			"Half-Orc": ["Orc"],
			"Tiefling": ["Infernal"]
		};

		return racialLanguages[race.name] || [];
	}

	getClassLanguages(classes) {
		const languages = [];

		classes.forEach(cls => {
			switch (cls.name) {
				case "Cleric":
				case "Paladin":
					if (Math.random() < 0.7) languages.push("Celestial");
					break;
				case "Druid":
					languages.push("Druidic");
					break;
				case "Warlock":
					if (Math.random() < 0.6) languages.push(Math.random() < 0.5 ? "Abyssal" : "Infernal");
					break;
			}
		});

		return languages;
	}

	generateBackgroundLanguages(background) {
		const languageOptions = ["Elvish", "Dwarvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orc"];
		const numLanguages = Math.random() < 0.6 ? 1 : 2;
		const selected = [];

		for (let i = 0; i < numLanguages; i++) {
			const lang = languageOptions[Math.floor(Math.random() * languageOptions.length)];
			if (!selected.includes(lang)) {
				selected.push(lang);
			}
		}

		return selected;
	}

	getRandomLanguage() {
		const languages = [
			"Elvish", "Dwarvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orc",
			"Abyssal", "Celestial", "Draconic", "Deep Speech", "Infernal", "Primordial", "Sylvan"
		];
		return languages[Math.floor(Math.random() * languages.length)];
	}

	hasSkillProficiency(skill, classes) {
		// Simple check - assume some classes are more likely to have perception
		return classes.some(cls => ["Ranger", "Druid", "Barbarian"].includes(cls.name));
	}

	calculateRandomHp(classes, conMod) {
		let totalHp = 0;
		let hitDice = [];
		let isFirstLevel = true;

		classes.forEach(cls => {
			const hitDieMap = {
				"Barbarian": 12, "Fighter": 10, "Paladin": 10, "Ranger": 10, "Artificer": 8,
				"Bard": 8, "Cleric": 8, "Druid": 8, "Monk": 8, "Rogue": 8, "Warlock": 8,
				"Sorcerer": 6, "Wizard": 6
			};

			const hitDie = hitDieMap[cls.name] || 8;
			let classHp = 0;

			// For each level in this class
			for (let level = 1; level <= cls.level; level++) {
				if (isFirstLevel) {
					// First character level ever: max hit die + CON mod
					classHp += hitDie + conMod;
					isFirstLevel = false;
				} else {
					// Subsequent levels: average hit die + CON mod
					classHp += Math.floor(hitDie / 2) + 1 + conMod;
				}
			}

			totalHp += classHp;
			hitDice.push(`${cls.level}d${hitDie}`);
		});

		// Ensure minimum 1 HP per level
		const totalLevel = classes.reduce((sum, cls) => sum + cls.level, 0);
		totalHp = Math.max(totalHp, totalLevel);

		return {
			average: totalHp,
			formula: hitDice.join(" + ") + (conMod !== 0 ? ` ${conMod >= 0 ? '+' : ''}${conMod * totalLevel}` : ''),
			current: totalHp,
			max: totalHp,
			temp: 0
		};
	}

	generateRandomTrackers(classes) {
		const trackers = [];

		// Class-specific trackers
		classes.forEach(cls => {
			switch (cls.name) {
				case "Barbarian":
					if (cls.level >= 1) {
						trackers.push({
							name: "Rage",
							type: "counter",
							current: Math.min(cls.level < 3 ? 2 : cls.level < 6 ? 3 : cls.level < 12 ? 4 : cls.level < 17 ? 5 : 6),
							max: Math.min(cls.level < 3 ? 2 : cls.level < 6 ? 3 : cls.level < 12 ? 4 : cls.level < 17 ? 5 : 6),
							description: "Bonus action to enter rage"
						});
					}
					break;
				case "Fighter":
					if (cls.level >= 2) {
						trackers.push({
							name: "Action Surge",
							type: "counter",
							current: cls.level >= 17 ? 2 : 1,
							max: cls.level >= 17 ? 2 : 1,
							description: "Additional action on your turn"
						});
					}
					break;
				case "Monk":
					if (cls.level >= 2) {
						trackers.push({
							name: "Ki Points",
							type: "counter",
							current: cls.level,
							max: cls.level,
							description: "Fuels various monk abilities"
						});
					}
					break;
			}
		});

		// Generic trackers
		if (Math.random() < 0.3) {
			trackers.push({
				name: "Magic Item Charges",
				type: "counter",
				current: Math.floor(Math.random() * 5) + 1,
				max: Math.floor(Math.random() * 5) + 3,
				description: "Charges remaining on magic item"
			});
		}

		return trackers;
	}

	generateRandomActions(classes, abilityScores) {
		const actions = [];
		const totalLevel = classes.reduce((sum, cls) => sum + cls.level, 0);
		const profBonus = this.getProficiencyBonus(totalLevel);
		const strMod = Math.floor((abilityScores.str - 10) / 2);
		const dexMod = Math.floor((abilityScores.dex - 10) / 2);
		const chaMod = Math.floor((abilityScores.cha - 10) / 2);
		const wisMod = Math.floor((abilityScores.wis - 10) / 2);
		const intMod = Math.floor((abilityScores.int - 10) / 2);

		// Weapon attacks based on class with more variety
		classes.forEach(cls => {
			switch (cls.name) {
				case "Fighter":
					// Main weapon attack with proper damage calculation
					const longswordDamage = Math.max(1, 4 + strMod); // Average of 1d8 + STR
					actions.push({
						name: "{@item Longsword|phb}",
						entries: [`{@atk rm} {@hit ${strMod + profBonus}} to hit, reach 5 ft., one target. {@h}${longswordDamage} ({@damage 1d8 + ${strMod}}) slashing damage.`]
					});
					// Ranged/thrown weapon option
					const javelinDamage = Math.max(1, 3 + strMod); // Average of 1d6 + STR
					actions.push({
						name: "{@item Javelin|phb}",
						entries: [`{@atk rm,rw} {@hit ${strMod + profBonus}} to hit, reach 5 ft. or range 30/120 ft., one target. {@h}${javelinDamage} ({@damage 1d6 + ${strMod}}) piercing damage.`]
					});
					if (cls.level >= 2) {
						actions.push({
							name: "Action Surge (Recharge 5-6)",
							entries: ["Take one additional action on your turn."]
						});
					}
					if (cls.level >= 5) {
						actions.push({
							name: "Extra Attack",
							entries: ["When you take the Attack action, you can attack twice instead of once."]
						});
					}
					break;

				case "Paladin":
					const paladinSwordDamage = Math.max(1, 4 + strMod); // Average of 1d8 + STR
					actions.push({
						name: "{@item Longsword|phb}",
						entries: [`{@atk rm} {@hit ${strMod + profBonus}} to hit, reach 5 ft., one target. {@h}${paladinSwordDamage} ({@damage 1d8 + ${strMod}}) slashing damage.`]
					});
					if (cls.level >= 2) {
						actions.push({
							name: "Divine Smite",
							entries: [`When you hit with a melee weapon attack, expend a spell slot to deal additional radiant damage: 2d8 + 1d8 per spell level above 1st.`]
						});
					}
					if (cls.level >= 3) {
						actions.push({
							name: "Lay on Hands",
							entries: [`Heal ${cls.level * 5} hit points per long rest, distributed as you choose. Can also cure disease or poison.`]
						});
					}
					break;

				case "Rogue":
					const shortbowDamage = Math.max(1, 3 + dexMod); // Average of 1d6 + DEX
					const daggerDamage = Math.max(1, 2 + dexMod); // Average of 1d4 + DEX
					actions.push({
						name: "{@item Shortbow|phb}",
						entries: [`{@atk rw} {@hit ${dexMod + profBonus}} to hit, range 80/320 ft., one target. {@h}${shortbowDamage} ({@damage 1d6 + ${dexMod}}) piercing damage.`]
					});
					actions.push({
						name: "{@item Dagger|phb}",
						entries: [`{@atk rm,rw} {@hit ${dexMod + profBonus}} to hit, reach 5 ft. or range 20/60 ft., one target. {@h}${daggerDamage} ({@damage 1d4 + ${dexMod}}) piercing damage.`]
					});
					actions.push({
						name: "Sneak Attack (1/Turn)",
						entries: [`Deal an extra ${Math.ceil(cls.level / 2)}d6 damage when you hit a target with a finesse or ranged weapon and have advantage, or when another enemy of the target is within 5 feet.`]
					});
					if (cls.level >= 2) {
						actions.push({
							name: "Cunning Action",
							entries: ["Take the Dash, Disengage, or Hide action as a bonus action."]
						});
					}
					break;

				case "Ranger":
					const longbowDamage = Math.max(1, 4 + dexMod); // Average of 1d8 + DEX
					const scimitarDamage = Math.max(1, 3 + dexMod); // Average of 1d6 + DEX
					actions.push({
						name: "{@item Longbow|phb}",
						entries: [`{@atk rw} {@hit ${dexMod + profBonus}} to hit, range 150/600 ft., one target. {@h}${longbowDamage} ({@damage 1d8 + ${dexMod}}) piercing damage.`]
					});
					actions.push({
						name: "{@item Scimitar|phb}",
						entries: [`{@atk rm} {@hit ${dexMod + profBonus}} to hit, reach 5 ft., one target. {@h}${scimitarDamage} ({@damage 1d6 + ${dexMod}}) slashing damage.`]
					});
					if (cls.level >= 3) {
						actions.push({
							name: "Hunter's Mark",
							entries: ["Choose a creature you can see within 90 feet. Deal an extra 1d6 damage when you hit it with a weapon attack."]
						});
					}
					break;

				case "Wizard":
					actions.push({
						name: "{@spell Fire Bolt}",
						entries: [`{@atk rs} {@hit ${intMod + profBonus}} to hit, range 120 ft., one target. {@h}${1 + Math.floor(totalLevel / 5)} ({@damage ${Math.ceil((totalLevel + 5) / 6)}d10}) fire damage.`]
					});
					const wizardDaggerDamage = Math.max(1, 2 + dexMod); // Average of 1d4 + DEX
					actions.push({
						name: "{@item Dagger|phb}",
						entries: [`{@atk rm,rw} {@hit ${dexMod + profBonus}} to hit, reach 5 ft. or range 20/60 ft., one target. {@h}${wizardDaggerDamage} ({@damage 1d4 + ${dexMod}}) piercing damage.`]
					});
					if (cls.level >= 2) {
						actions.push({
							name: "Arcane Recovery",
							entries: [`Once per day during a short rest, recover spell slots with a combined level of ${Math.ceil(cls.level / 2)}.`]
						});
					}
					break;

				case "Sorcerer":
					actions.push({
						name: "{@spell Fire Bolt}",
						entries: [`{@atk rs} {@hit ${chaMod + profBonus}} to hit, range 120 ft., one target. {@h}${1 + Math.floor(totalLevel / 5)} ({@damage ${Math.ceil((totalLevel + 5) / 6)}d10}) fire damage.`]
					});
					if (cls.level >= 3) {
						actions.push({
							name: "Metamagic",
							entries: [`Use sorcery points to modify spells. Known options vary by level.`]
						});
					}
					break;

				case "Warlock":
					actions.push({
						name: "{@spell Eldritch Blast}",
						entries: [`{@atk rs} {@hit ${chaMod + profBonus}} to hit, range 120 ft., one creature. {@h}${1 + chaMod} ({@damage 1d10 + ${chaMod}}) force damage. ${cls.level >= 5 ? 'Two beams.' : cls.level >= 11 ? 'Three beams.' : cls.level >= 17 ? 'Four beams.' : 'One beam.'}`]
					});
					if (cls.level >= 2) {
						actions.push({
							name: "Eldritch Invocations",
							entries: [`Various magical abilities known. Current invocations determined by level and patron.`]
						});
					}
					break;

				case "Cleric":
					const maceDamage = Math.max(1, 3 + strMod); // Average of 1d6 + STR
					actions.push({
						name: "{@item Mace|phb}",
						entries: [`{@atk rm} {@hit ${strMod + profBonus}} to hit, reach 5 ft., one target. {@h}${maceDamage} ({@damage 1d6 + ${strMod}}) bludgeoning damage.`]
					});
					actions.push({
						name: "{@spell Sacred Flame}",
						entries: [`Target must make a DC ${8 + profBonus + wisMod} Dexterity saving throw or take ${Math.ceil((totalLevel + 5) / 6)}d8 radiant damage.`]
					});
					if (cls.level >= 2) {
						actions.push({
							name: "Channel Divinity (1/Rest)",
							entries: [`Turn Undead or domain-specific effect. Save DC ${8 + profBonus + wisMod}.`]
						});
					}
					break;

				case "Druid":
					actions.push({
						name: "{@spell Druidcraft}",
						entries: [`Create various minor nature effects within 30 feet.`]
					});
					const druidScimitarDamage = Math.max(1, 3 + dexMod); // Average of 1d6 + DEX
					actions.push({
						name: "{@item Scimitar|phb}",
						entries: [`{@atk rm} {@hit ${dexMod + profBonus}} to hit, reach 5 ft., one target. {@h}${druidScimitarDamage} ({@damage 1d6 + ${dexMod}}) slashing damage.`]
					});
					if (cls.level >= 2) {
						actions.push({
							name: "Wild Shape (2/Rest)",
							entries: [`Transform into a beast for ${cls.level} hours. Beast CR limited by level.`]
						});
					}
					break;

				case "Barbarian":
					const greataxeDamage = Math.max(1, 6 + strMod); // Average of 1d12 + STR
					actions.push({
						name: "{@item Greataxe|phb}",
						entries: [`{@atk rm} {@hit ${strMod + profBonus}} to hit, reach 5 ft., one target. {@h}${greataxeDamage} ({@damage 1d12 + ${strMod}}) slashing damage.`]
					});
					actions.push({
						name: "Rage (Bonus Action)",
						entries: [`Gain resistance to bludgeoning, piercing, and slashing damage. +${Math.floor(cls.level / 9) + 2} damage on Strength-based attacks. Lasts 10 rounds.`]
					});
					if (cls.level >= 2) {
						actions.push({
							name: "Reckless Attack",
							entries: [`Gain advantage on Strength-based attack rolls, but enemies have advantage against you until your next turn.`]
						});
					}
					break;

				case "Bard":
					const rapierDamage = Math.max(1, 4 + dexMod); // Average of 1d8 + DEX
					actions.push({
						name: "{@item Rapier|phb}",
						entries: [`{@atk rm} {@hit ${dexMod + profBonus}} to hit, reach 5 ft., one target. {@h}${rapierDamage} ({@damage 1d8 + ${dexMod}}) piercing damage.`]
					});
					actions.push({
						name: "{@spell Vicious Mockery}",
						entries: [`Target must make a DC ${8 + profBonus + chaMod} Wisdom saving throw or take ${Math.ceil((totalLevel + 5) / 6)}d4 psychic damage and have disadvantage on next attack.`]
					});
					if (cls.level >= 3) {
						actions.push({
							name: "Bardic Inspiration (Bonus Action)",
							entries: [`Give an ally a d${cls.level < 5 ? 6 : cls.level < 10 ? 8 : cls.level < 15 ? 10 : 12} they can add to an attack, ability check, or saving throw. ${chaMod} uses per rest.`]
						});
					}
					break;

				case "Monk":
					const martialArtsHitDie = cls.level < 5 ? 4 : cls.level < 11 ? 6 : cls.level < 17 ? 8 : 10;
					const unarmedStrikeDamage = Math.max(1, Math.floor(martialArtsHitDie / 2) + 1 + dexMod); // Average of martial arts die + DEX
					actions.push({
						name: "Unarmed Strike",
						entries: [`{@atk rm} {@hit ${dexMod + profBonus}} to hit, reach 5 ft., one target. {@h}${unarmedStrikeDamage} ({@damage 1d${martialArtsHitDie} + ${dexMod}}) bludgeoning damage.`]
					});
					if (cls.level >= 2) {
						actions.push({
							name: "Flurry of Blows (1 Ki Point)",
							entries: [`After taking the Attack action, spend 1 ki point to make two unarmed strikes as a bonus action.`]
						});
						actions.push({
							name: "Patient Defense (1 Ki Point)",
							entries: [`Take the Dodge action as a bonus action.`]
						});
						actions.push({
							name: "Step of the Wind (1 Ki Point)",
							entries: [`Take Dash or Disengage as bonus action. Jump distance doubled for the turn.`]
						});
					}
					break;
			}
		});

		return actions;
	}

	generateRandomSpells(classes, totalLevel, abilityScores) {
		// Check if any class can cast spells
		const casterClasses = classes.filter(cls =>
			["Wizard", "Sorcerer", "Warlock", "Bard", "Cleric", "Druid", "Paladin", "Ranger"].includes(cls.name)
		);

		if (casterClasses.length === 0) return null;

		// Handle multiclass spellcasting
		if (casterClasses.length > 1) {
			return this.generateMulticlassSpellcasting(casterClasses, abilityScores);
		}

		const primaryCaster = casterClasses[0];
		const spellcastingInfo = this.getSpellcastingInfo(primaryCaster.name);

		if (!spellcastingInfo) return null;

		const spellcastingAbility = spellcastingInfo.ability;
		const abilityScore = spellcastingInfo.abilityKey;
		const actualAbilityScore = abilityScores[abilityScore];
		const spellMod = Math.floor((actualAbilityScore - 10) / 2);
		const profBonus = this.getProficiencyBonus(totalLevel);
		const spellDC = 8 + profBonus + spellMod;
		const spellAttack = profBonus + spellMod;

		return {
			dc: spellDC,
			attackBonus: spellAttack >= 0 ? `+${spellAttack}` : `${spellAttack}`,
			ability: spellcastingAbility,
			levels: this.generateSpellSlots(primaryCaster, abilityScores),
			spellsKnown: this.calculateSpellsKnown(primaryCaster)
		};
	}

	getSpellcastingInfo(className) {
		const spellcastingMap = {
			"Wizard": { ability: "Intelligence", abilityKey: "int", type: "prepared", ritual: true },
			"Sorcerer": { ability: "Charisma", abilityKey: "cha", type: "known", metamagic: true },
			"Warlock": { ability: "Charisma", abilityKey: "cha", type: "known", pact: true },
			"Bard": { ability: "Charisma", abilityKey: "cha", type: "known", ritual: true },
			"Cleric": { ability: "Wisdom", abilityKey: "wis", type: "prepared", ritual: true },
			"Druid": { ability: "Wisdom", abilityKey: "wis", type: "prepared", ritual: true },
			"Paladin": { ability: "Charisma", abilityKey: "cha", type: "prepared", divine: true },
			"Ranger": { ability: "Wisdom", abilityKey: "wis", type: "known", natural: true }
		};

		return spellcastingMap[className] || null;
	}

	generateMulticlassSpellcasting(casterClasses, abilityScores) {
		// Calculate multiclass spell slot levels
		let spellSlotLevel = 0;
		const casterLevels = {};

		casterClasses.forEach(cls => {
			const casterType = this.getCasterType(cls.name);
			if (casterType === "full") {
				spellSlotLevel += cls.level;
			} else if (casterType === "half") {
				spellSlotLevel += Math.floor(cls.level / 2);
			} else if (casterType === "third") {
				spellSlotLevel += Math.floor(cls.level / 3);
			}
			// Pact casters (Warlock) don't contribute to multiclass spell slots
			casterLevels[cls.name] = cls.level;
		});

		// Use primary caster for spell attack bonus and DC
		const primaryCaster = casterClasses.reduce((highest, current) =>
			current.level > highest.level ? current : highest
		);

		const spellcastingInfo = this.getSpellcastingInfo(primaryCaster.name);
		const actualAbilityScore = abilityScores[spellcastingInfo.abilityKey];
		const spellMod = Math.floor((actualAbilityScore - 10) / 2);
		const totalLevel = casterClasses.reduce((sum, cls) => sum + cls.level, 0);
		const profBonus = this.getProficiencyBonus(totalLevel);

		return {
			dc: 8 + profBonus + spellMod,
			attackBonus: (profBonus + spellMod) >= 0 ? `+${profBonus + spellMod}` : `${profBonus + spellMod}`,
			ability: spellcastingInfo.ability,
			levels: this.generateMulticlassSpellSlots(spellSlotLevel),
			multiclass: true,
			casterLevels: casterLevels
		};
	}

	getCasterType(className) {
		const fullCasters = ["Wizard", "Sorcerer", "Bard", "Cleric", "Druid"];
		const halfCasters = ["Paladin", "Ranger"];
		const thirdCasters = ["Eldritch Knight", "Arcane Trickster"];
		const pactCasters = ["Warlock"];

		if (fullCasters.includes(className)) return "full";
		if (halfCasters.includes(className)) return "half";
		if (thirdCasters.includes(className)) return "third";
		if (pactCasters.includes(className)) return "pact";
		return "none";
	}

	generateSpellSlots(casterClass, abilityScores) {
		const levels = {};
		const spellcastingInfo = this.getSpellcastingInfo(casterClass.name);

		if (!spellcastingInfo) return {};

		// Calculate spell preparation modifier for prepared casters
		const abilityMod = Math.floor((abilityScores[spellcastingInfo.abilityKey] - 10) / 2);
		const spellsPrepared = spellcastingInfo.type === "prepared" ?
			Math.max(1, abilityMod + casterClass.level) : null;

		// Cantrips
		const cantripCount = this.getCantripCount(casterClass.name, casterClass.level, casterClass.subclass?.name);
		levels["0"] = {
			spells: this.getRandomCantrips(casterClass, cantripCount)
		};

		// Spell slots based on class and level
		for (let level = 1; level <= 9; level++) {
			const maxSlots = this.getSpellSlotsForLevel(casterClass, level);
			if (maxSlots > 0) {
				levels[level] = {
					maxSlots: maxSlots,
					slotsUsed: maxSlots,
					spells: this.getRandomSpells(casterClass, level)
				};
			}
		}

		return levels;
	}

	getSpellSlotsForLevel(casterClass, spellLevel) {
		// Special handling for Warlock - they have unique slot mechanics
		if (casterClass.name === "Warlock") {
			const warlockLevel = casterClass.level;

			// Warlock slot progression
			let slotLevel, numSlots;
			if (warlockLevel >= 17) { slotLevel = 5; numSlots = 4; }
			else if (warlockLevel >= 15) { slotLevel = 5; numSlots = 3; }
			else if (warlockLevel >= 11) { slotLevel = 5; numSlots = 3; }
			else if (warlockLevel >= 9) { slotLevel = 5; numSlots = 2; }
			else if (warlockLevel >= 7) { slotLevel = 4; numSlots = 2; }
			else if (warlockLevel >= 5) { slotLevel = 3; numSlots = 2; }
			else if (warlockLevel >= 3) { slotLevel = 2; numSlots = 2; }
			else if (warlockLevel >= 1) { slotLevel = 1; numSlots = 1; }
			else return 0;

			// Warlocks only have slots at their highest available level
			return spellLevel === slotLevel ? numSlots : 0;
		}

		// Half-caster progression for Paladin and Ranger
		if (casterClass.name === "Paladin" || casterClass.name === "Ranger") {
			const halfCasterSlots = [
				[0, 0, 0, 0, 0, 0, 0, 0, 0], // Level 1
				[2, 0, 0, 0, 0, 0, 0, 0, 0], // Level 2
				[3, 0, 0, 0, 0, 0, 0, 0, 0], // Level 3
				[3, 0, 0, 0, 0, 0, 0, 0, 0], // Level 4
				[4, 2, 0, 0, 0, 0, 0, 0, 0], // Level 5
				[4, 2, 0, 0, 0, 0, 0, 0, 0], // Level 6
				[4, 3, 0, 0, 0, 0, 0, 0, 0], // Level 7
				[4, 3, 0, 0, 0, 0, 0, 0, 0], // Level 8
				[4, 3, 2, 0, 0, 0, 0, 0, 0], // Level 9
				[4, 3, 2, 0, 0, 0, 0, 0, 0], // Level 10
				[4, 3, 3, 0, 0, 0, 0, 0, 0], // Level 11
				[4, 3, 3, 0, 0, 0, 0, 0, 0], // Level 12
				[4, 3, 3, 1, 0, 0, 0, 0, 0], // Level 13
				[4, 3, 3, 1, 0, 0, 0, 0, 0], // Level 14
				[4, 3, 3, 2, 0, 0, 0, 0, 0], // Level 15
				[4, 3, 3, 2, 0, 0, 0, 0, 0], // Level 16
				[4, 3, 3, 3, 1, 0, 0, 0, 0], // Level 17
				[4, 3, 3, 3, 1, 0, 0, 0, 0], // Level 18
				[4, 3, 3, 3, 2, 0, 0, 0, 0], // Level 19
				[4, 3, 3, 3, 2, 0, 0, 0, 0]  // Level 20
			];

			const classLevel = Math.min(casterClass.level, 20);
			if (classLevel < 2 || spellLevel > 5) return 0; // Rangers/Paladins start at level 2 and max at 5th level spells

			return halfCasterSlots[classLevel - 1][spellLevel - 1] || 0;
		}

		// Regular full caster progression
		const fullCasterSlots = [
			[2, 0, 0, 0, 0, 0, 0, 0, 0], // Level 1
			[3, 0, 0, 0, 0, 0, 0, 0, 0], // Level 2
			[4, 2, 0, 0, 0, 0, 0, 0, 0], // Level 3
			[4, 3, 0, 0, 0, 0, 0, 0, 0], // Level 4
			[4, 3, 2, 0, 0, 0, 0, 0, 0], // Level 5
			[4, 3, 3, 0, 0, 0, 0, 0, 0], // Level 6
			[4, 3, 3, 1, 0, 0, 0, 0, 0], // Level 7
			[4, 3, 3, 2, 0, 0, 0, 0, 0], // Level 8
			[4, 3, 3, 3, 1, 0, 0, 0, 0], // Level 9
			[4, 3, 3, 3, 2, 0, 0, 0, 0], // Level 10
			[4, 3, 3, 3, 2, 1, 0, 0, 0], // Level 11
			[4, 3, 3, 3, 2, 1, 0, 0, 0], // Level 12
			[4, 3, 3, 3, 2, 1, 1, 0, 0], // Level 13
			[4, 3, 3, 3, 2, 1, 1, 0, 0], // Level 14
			[4, 3, 3, 3, 2, 1, 1, 1, 0], // Level 15
			[4, 3, 3, 3, 2, 1, 1, 1, 0], // Level 16
			[4, 3, 3, 3, 2, 1, 1, 1, 1], // Level 17
			[4, 3, 3, 3, 3, 1, 1, 1, 1], // Level 18
			[4, 3, 3, 3, 3, 2, 1, 1, 1], // Level 19
			[4, 3, 3, 3, 3, 2, 2, 1, 1]  // Level 20
		];

		const classLevel = Math.min(casterClass.level, 20);
		if (classLevel === 0 || spellLevel > 9) return 0;

		return fullCasterSlots[classLevel - 1][spellLevel - 1] || 0;
	}

	getCantripCount(className, classLevel, subclassName = null) {
		const cantripProgression = {
			"Wizard": [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
			"Sorcerer": [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
			"Warlock": [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
			"Bard": [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
			"Cleric": [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
			"Druid": [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
			"Paladin": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			"Ranger": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		};

		// Check for subclass-specific cantrip grants
		let bonusCantrips = 0;
		if (className === "Ranger" && subclassName && classLevel >= 3) {
			// Some Ranger subclasses get cantrips at 3rd level
			if (subclassName === "Fey Wanderer") {
				bonusCantrips = 1; // Gets 1 Druid cantrip
			} else if (subclassName === "Swarmkeeper") {
				bonusCantrips = 1; // Gets 1 Druid cantrip
			}
		} else if (className === "Fighter" && subclassName === "Eldritch Knight" && classLevel >= 3) {
			// Eldritch Knights get cantrips starting at 3rd level
			const ekProgression = [0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4];
			bonusCantrips = ekProgression[Math.min(classLevel - 1, 19)];
		} else if (className === "Rogue" && subclassName === "Arcane Trickster" && classLevel >= 3) {
			// Arcane Tricksters get cantrips starting at 3rd level
			const atProgression = [0, 0, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
			bonusCantrips = atProgression[Math.min(classLevel - 1, 19)];
		}

		const progression = cantripProgression[className];
		const baseCantrips = progression ? progression[Math.min(classLevel - 1, 19)] : 0;
		return baseCantrips + bonusCantrips;
	}

	getRandomCantrips(casterClass, cantripCount) {
		// Rangers and Paladins don't get cantrips unless specified by subclass features
		if (cantripCount === 0) {
			return [];
		}

		const classCantrips = {
			"Wizard": [
				"Acid Splash", "Blade Ward", "Chill Touch", "Dancing Lights", "Fire Bolt",
				"Friends", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion",
				"Poison Spray", "Prestidigitation", "Ray of Frost", "Shocking Grasp", "True Strike"
			],
			"Sorcerer": [
				"Acid Splash", "Blade Ward", "Chill Touch", "Dancing Lights", "Fire Bolt",
				"Friends", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion",
				"Poison Spray", "Prestidigitation", "Ray of Frost", "Shocking Grasp", "True Strike"
			],
			"Warlock": [
				"Blade Ward", "Chill Touch", "Create Bonfire", "Eldritch Blast", "Friends",
				"Frostbite", "Magic Stone", "Mage Hand", "Minor Illusion", "Poison Spray",
				"Prestidigitation", "Toll the Dead", "True Strike"
			],
			"Bard": [
				"Blade Ward", "Dancing Lights", "Friends", "Light", "Mage Hand", "Mending",
				"Message", "Minor Illusion", "Prestidigitation", "Thunderclap", "True Strike", "Vicious Mockery"
			],
			"Cleric": [
				"Guidance", "Light", "Mending", "Resistance", "Sacred Flame", "Spare the Dying",
				"Thaumaturgy", "Toll the Dead", "Word of Radiance"
			],
			"Druid": [
				"Create Bonfire", "Druidcraft", "Frostbite", "Guidance", "Magic Stone",
				"Mending", "Poison Spray", "Produce Flame", "Resistance", "Shillelagh",
				"Thorn Whip", "Thunderclap"
			]
		};

		// Handle subclass-specific cantrip lists
		let availableCantrips = classCantrips[casterClass.name] || [];
		if (casterClass.name === "Ranger" && casterClass.subclass?.name) {
			// Rangers with certain subclasses choose from Druid cantrips
			if (["Fey Wanderer", "Swarmkeeper"].includes(casterClass.subclass.name)) {
				availableCantrips = classCantrips["Druid"] || [];
			}
		} else if (casterClass.name === "Fighter" && casterClass.subclass?.name === "Eldritch Knight") {
			// Eldritch Knights choose from Wizard cantrips
			availableCantrips = classCantrips["Wizard"] || [];
		} else if (casterClass.name === "Rogue" && casterClass.subclass?.name === "Arcane Trickster") {
			// Arcane Tricksters choose from Wizard cantrips
			availableCantrips = classCantrips["Wizard"] || [];
		}
		const selectedCantrips = [];

		// Always include signature cantrips for certain classes
		const signatureCantrips = {
			"Warlock": ["Eldritch Blast"],
			"Cleric": ["Sacred Flame", "Guidance"],
			"Druid": ["Druidcraft"]
		};

		const signatures = signatureCantrips[casterClass.name] || [];
		signatures.forEach(cantrip => {
			if (selectedCantrips.length < cantripCount) {
				selectedCantrips.push(cantrip);
			}
		});

		// Fill remaining slots with random appropriate cantrips
		while (selectedCantrips.length < cantripCount && selectedCantrips.length < availableCantrips.length) {
			const randomCantrip = availableCantrips[Math.floor(Math.random() * availableCantrips.length)];
			if (!selectedCantrips.includes(randomCantrip)) {
				selectedCantrips.push(randomCantrip);
			}
		}

		return selectedCantrips;
	}

	generateMulticlassSpellSlots(totalCasterLevel) {
		const levels = {};

		// Multiclass spellcaster slot progression
		const multiclassSlots = [
			[2, 0, 0, 0, 0, 0, 0, 0, 0], // Level 1
			[3, 0, 0, 0, 0, 0, 0, 0, 0], // Level 2
			[4, 2, 0, 0, 0, 0, 0, 0, 0], // Level 3
			[4, 3, 0, 0, 0, 0, 0, 0, 0], // Level 4
			[4, 3, 2, 0, 0, 0, 0, 0, 0], // Level 5
			[4, 3, 3, 0, 0, 0, 0, 0, 0], // Level 6
			[4, 3, 3, 1, 0, 0, 0, 0, 0], // Level 7
			[4, 3, 3, 2, 0, 0, 0, 0, 0], // Level 8
			[4, 3, 3, 3, 1, 0, 0, 0, 0], // Level 9
			[4, 3, 3, 3, 2, 0, 0, 0, 0], // Level 10
			[4, 3, 3, 3, 2, 1, 0, 0, 0], // Level 11
			[4, 3, 3, 3, 2, 1, 0, 0, 0], // Level 12
			[4, 3, 3, 3, 2, 1, 1, 0, 0], // Level 13
			[4, 3, 3, 3, 2, 1, 1, 0, 0], // Level 14
			[4, 3, 3, 3, 2, 1, 1, 1, 0], // Level 15
			[4, 3, 3, 3, 2, 1, 1, 1, 0], // Level 16
			[4, 3, 3, 3, 2, 1, 1, 1, 1], // Level 17
			[4, 3, 3, 3, 3, 1, 1, 1, 1], // Level 18
			[4, 3, 3, 3, 3, 2, 1, 1, 1], // Level 19
			[4, 3, 3, 3, 3, 2, 2, 1, 1]  // Level 20
		];

		if (totalCasterLevel > 0 && totalCasterLevel <= 20) {
			const slotArray = multiclassSlots[totalCasterLevel - 1];
			for (let level = 1; level <= 9; level++) {
				const maxSlots = slotArray[level - 1];
				if (maxSlots > 0) {
					levels[level] = {
						maxSlots: maxSlots,
						slotsUsed: 0,
						spells: []
					};
				}
			}
		}

		return levels;
	}

	calculateSpellsKnown(casterClass) {
		const spellsKnownProgression = {
			"Sorcerer": [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
			"Bard": [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
			"Ranger": [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
			"Warlock": [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15]
		};

		const progression = spellsKnownProgression[casterClass.name];
		return progression ? progression[Math.min(casterClass.level - 1, 19)] : null;
	}

	getRandomSpells(casterClass, level) {
		const classSpellLists = this.getClassSpellList(casterClass.name, level);
		if (!classSpellLists || classSpellLists.length === 0) {
			return [];
		}

		// Calculate appropriate number of spells for this level
		const spellCount = this.getSpellCountForLevel(casterClass, level);
		const selectedSpells = [];

		// Always include signature/important spells for the class
		const signatureSpells = this.getSignatureSpells(casterClass.name, level);
		signatureSpells.forEach(spell => {
			if (selectedSpells.length < spellCount && classSpellLists.includes(spell)) {
				selectedSpells.push(spell);
			}
		});

		// Fill remaining slots with random appropriate spells
		const availableSpells = classSpellLists.filter(spell => !selectedSpells.includes(spell));
		while (selectedSpells.length < spellCount && availableSpells.length > 0) {
			const randomIndex = Math.floor(Math.random() * availableSpells.length);
			const randomSpell = availableSpells.splice(randomIndex, 1)[0];
			selectedSpells.push(randomSpell);
		}

		return selectedSpells;
	}

	getClassSpellList(className, level) {
		const spellLists = {
			"Wizard": {
				0: ["Acid Splash", "Chill Touch", "Dancing Lights", "Fire Bolt", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion", "Poison Spray", "Prestidigitation", "Ray of Frost", "Shocking Grasp", "True Strike"],
				1: ["Alarm", "Burning Hands", "Charm Person", "Color Spray", "Comprehend Languages", "Detect Magic", "Disguise Self", "Expeditious Retreat", "False Life", "Feather Fall", "Find Familiar", "Fog Cloud", "Grease", "Identify", "Illusory Script", "Jump", "Longstrider", "Mage Armor", "Magic Missile", "Protection from Evil and Good", "Shield", "Silent Image", "Sleep", "Thunderwave", "Unseen Servant"],
				2: ["Acid Arrow", "Alter Self", "Arcane Lock", "Blur", "Continual Flame", "Darkness", "Darkvision", "Detect Thoughts", "Enlarge/Reduce", "Flaming Sphere", "Gentle Repose", "Gust of Wind", "Hold Person", "Invisibility", "Knock", "Levitate", "Locate Object", "Magic Mouth", "Magic Weapon", "Mirror Image", "Misty Step", "Ray of Enfeeblement", "Rope Trick", "Scorching Ray", "See Invisibility", "Shatter", "Spider Climb", "Suggestion", "Web"],
				3: ["Animate Dead", "Bestow Curse", "Blink", "Clairvoyance", "Counterspell", "Daylight", "Dispel Magic", "Fear", "Fireball", "Fly", "Gaseous Form", "Glyph of Warding", "Haste", "Hypnotic Pattern", "Lightning Bolt", "Magic Circle", "Major Image", "Nondetection", "Phantom Steed", "Protection from Energy", "Remove Curse", "Sending", "Sleet Storm", "Slow", "Stinking Cloud", "Suggestion", "Tongues", "Vampiric Touch", "Water Breathing"],
				4: ["Arcane Eye", "Banishment", "Black Tentacles", "Blight", "Confusion", "Conjure Minor Elementals", "Control Water", "Dimension Door", "Fabricate", "Fire Shield", "Greater Invisibility", "Hallucinatory Terrain", "Ice Storm", "Locate Creature", "Phantasmal Killer", "Polymorph", "Private Sanctum", "Resilient Sphere", "Secret Chest", "Stone Shape", "Stoneskin", "Wall of Fire"],
				5: ["Animate Objects", "Bigby's Hand", "Cloudkill", "Cone of Cold", "Conjure Elemental", "Contact Other Plane", "Creation", "Dominate Person", "Dream", "Geas", "Hold Monster", "Legend Lore", "Modify Memory", "Passwall", "Planar Binding", "Scrying", "Seeming", "Telekinesis", "Telepathic Bond", "Teleportation Circle", "Wall of Force", "Wall of Stone"],
				6: ["Chain Lightning", "Circle of Death", "Contingency", "Create Undead", "Disintegrate", "Eyebite", "Flesh to Stone", "Globe of Invulnerability", "Guards and Wards", "Magic Jar", "Mass Suggestion", "Move Earth", "Otto's Irresistible Dance", "Programmed Illusion", "True Seeing", "Wall of Ice"],
				7: ["Delayed Blast Fireball", "Etherealness", "Finger of Death", "Forcecage", "Mirage Arcane", "Plane Shift", "Prismatic Spray", "Project Image", "Reverse Gravity", "Sequester", "Simulacrum", "Symbol", "Teleport"],
				8: ["Antipathy/Sympathy", "Clone", "Control Weather", "Demiplane", "Dominate Monster", "Feeblemind", "Incendiary Cloud", "Maze", "Mind Blank", "Power Word Stun", "Sunburst", "Telepathy"],
				9: ["Astral Projection", "Foresight", "Gate", "Imprisonment", "Meteor Swarm", "Power Word Kill", "Prismatic Wall", "Shapechange", "Time Stop", "True Polymorph", "Wish"]
			},
			"Sorcerer": {
				0: ["Acid Splash", "Chill Touch", "Dancing Lights", "Fire Bolt", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion", "Poison Spray", "Prestidigitation", "Ray of Frost", "Shocking Grasp", "True Strike"],
				1: ["Burning Hands", "Charm Person", "Color Spray", "Comprehend Languages", "Detect Magic", "Disguise Self", "Expeditious Retreat", "False Life", "Feather Fall", "Fog Cloud", "Jump", "Mage Armor", "Magic Missile", "Shield", "Silent Image", "Sleep", "Thunderwave"],
				2: ["Alter Self", "Blur", "Darkness", "Darkvision", "Detect Thoughts", "Enhance Ability", "Enlarge/Reduce", "Gust of Wind", "Hold Person", "Invisibility", "Knock", "Levitate", "Mirror Image", "Misty Step", "Scorching Ray", "See Invisibility", "Shatter", "Spider Climb", "Suggestion", "Web"],
				3: ["Blink", "Counterspell", "Daylight", "Dispel Magic", "Fear", "Fireball", "Fly", "Gaseous Form", "Haste", "Hypnotic Pattern", "Lightning Bolt", "Major Image", "Protection from Energy", "Sleet Storm", "Slow", "Stinking Cloud", "Tongues", "Water Breathing", "Water Walk"],
				4: ["Banishment", "Blight", "Confusion", "Dimension Door", "Greater Invisibility", "Ice Storm", "Polymorph", "Wall of Fire"],
				5: ["Animate Objects", "Cloudkill", "Cone of Cold", "Creation", "Dominate Person", "Hold Monster", "Insect Plague", "Seeming", "Telekinesis", "Wall of Stone"],
				6: ["Chain Lightning", "Circle of Death", "Disintegrate", "Eyebite", "Globe of Invulnerability", "Mass Suggestion", "Move Earth", "Sunbeam", "True Seeing"],
				7: ["Delayed Blast Fireball", "Etherealness", "Finger of Death", "Fire Storm", "Plane Shift", "Prismatic Spray", "Reverse Gravity", "Teleport"],
				8: ["Dominate Monster", "Earthquake", "Incendiary Cloud", "Power Word Stun", "Sunburst"],
				9: ["Gate", "Meteor Swarm", "Power Word Kill", "Time Stop", "Wish"]
			},
			"Bard": {
				0: ["Dancing Lights", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion", "Prestidigitation", "True Strike", "Vicious Mockery"],
				1: ["Animal Friendship", "Bane", "Charm Person", "Comprehend Languages", "Cure Wounds", "Detect Magic", "Disguise Self", "Dissonant Whispers", "Faerie Fire", "Feather Fall", "Healing Word", "Heroism", "Identify", "Illusory Script", "Longstrider", "Silent Image", "Sleep", "Speak with Animals", "Tasha's Hideous Laughter", "Thunderwave", "Unseen Servant"],
				2: ["Animal Messenger", "Blindness/Deafness", "Calm Emotions", "Cloud of Daggers", "Crown of Madness", "Detect Thoughts", "Enhance Ability", "Enthrall", "Heat Metal", "Hold Person", "Invisibility", "Knock", "Lesser Restoration", "Locate Animals or Plants", "Locate Object", "Magic Mouth", "See Invisibility", "Shatter", "Silence", "Suggestion", "Zone of Truth"],
				3: ["Bestow Curse", "Clairvoyance", "Counterspell", "Dispel Magic", "Fear", "Glyph of Warding", "Hypnotic Pattern", "Leomund's Tiny Hut", "Major Image", "Nondetection", "Plant Growth", "Sending", "Speak with Dead", "Speak with Plants", "Stinking Cloud", "Tongues"],
				4: ["Compulsion", "Confusion", "Dimension Door", "Freedom of Movement", "Greater Invisibility", "Hallucinatory Terrain", "Locate Creature", "Polymorph"],
				5: ["Animate Objects", "Awaken", "Dominate Person", "Dream", "Geas", "Greater Restoration", "Hold Monster", "Legend Lore", "Mass Cure Wounds", "Mislead", "Modify Memory", "Planar Binding", "Raise Dead", "Scrying", "Seeming", "Teleportation Circle"],
				6: ["Eyebite", "Find the Path", "Guards and Wards", "Mass Suggestion", "Otto's Irresistible Dance", "Programmed Illusion", "True Seeing"],
				7: ["Etherealness", "Forcecage", "Mirage Arcane", "Mordenkainen's Magnificent Mansion", "Plane Shift", "Project Image", "Regenerate", "Resurrection", "Symbol", "Teleport"],
				8: ["Dominate Monster", "Feeblemind", "Glibness", "Mind Blank", "Power Word Stun"],
				9: ["Foresight", "Power Word Kill", "True Polymorph"]
			},
			"Cleric": {
				0: ["Guidance", "Light", "Mending", "Resistance", "Sacred Flame", "Spare the Dying", "Thaumaturgy"],
				1: ["Bless", "Command", "Create or Destroy Water", "Cure Wounds", "Detect Evil and Good", "Detect Magic", "Detect Poison and Disease", "Guiding Bolt", "Healing Word", "Inflict Wounds", "Protection from Evil and Good", "Purify Food and Drink", "Sanctuary", "Shield of Faith"],
				2: ["Aid", "Augury", "Blindness/Deafness", "Calm Emotions", "Continual Flame", "Enhance Ability", "Find Traps", "Gentle Repose", "Hold Person", "Lesser Restoration", "Locate Object", "Prayer of Healing", "Protection from Poison", "Silence", "Spiritual Weapon", "Warding Bond", "Zone of Truth"],
				3: ["Animate Dead", "Beacon of Hope", "Bestow Curse", "Clairvoyance", "Create Food and Water", "Daylight", "Dispel Magic", "Glyph of Warding", "Magic Circle", "Mass Healing Word", "Meld into Stone", "Protection from Energy", "Remove Curse", "Revivify", "Sending", "Speak with Dead", "Spirit Guardians", "Tongues", "Water Walk"],
				4: ["Banishment", "Control Water", "Divination", "Freedom of Movement", "Guardian of Faith", "Locate Creature", "Stone Shape"],
				5: ["Commune", "Contagion", "Dispel Evil and Good", "Flame Strike", "Geas", "Greater Restoration", "Hallow", "Insect Plague", "Legend Lore", "Mass Cure Wounds", "Planar Binding", "Raise Dead", "Scrying"],
				6: ["Blade Barrier", "Create Undead", "Find the Path", "Forbiddance", "Harm", "Heal", "Heroes' Feast", "Planar Ally", "True Seeing", "Word of Recall"],
				7: ["Divine Word", "Etherealness", "Fire Storm", "Plane Shift", "Regenerate", "Resurrection", "Symbol"],
				8: ["Antimagic Field", "Control Weather", "Earthquake", "Holy Aura"],
				9: ["Astral Projection", "Gate", "Mass Heal", "True Resurrection"]
			},
			"Druid": {
				0: ["Druidcraft", "Guidance", "Mending", "Poison Spray", "Produce Flame", "Resistance", "Shillelagh", "Thorn Whip"],
				1: ["Animal Friendship", "Charm Person", "Create or Destroy Water", "Cure Wounds", "Detect Magic", "Detect Poison and Disease", "Entangle", "Faerie Fire", "Fog Cloud", "Goodberry", "Healing Word", "Jump", "Longstrider", "Purify Food and Drink", "Speak with Animals", "Thunderwave"],
				2: ["Animal Messenger", "Barkskin", "Beast Sense", "Darkvision", "Enhance Ability", "Find Traps", "Flame Blade", "Flaming Sphere", "Gust of Wind", "Heat Metal", "Hold Person", "Lesser Restoration", "Locate Animals or Plants", "Locate Object", "Moonbeam", "Pass without Trace", "Protection from Poison", "Spike Growth"],
				3: ["Call Lightning", "Conjure Animals", "Daylight", "Dispel Magic", "Meld into Stone", "Plant Growth", "Protection from Energy", "Sleet Storm", "Speak with Plants", "Stone Shape", "Wall of Wind", "Water Breathing", "Water Walk", "Wind Wall"],
				4: ["Blight", "Confusion", "Conjure Minor Elementals", "Conjure Woodland Beings", "Control Water", "Dominate Beast", "Freedom of Movement", "Giant Insect", "Hallucinatory Terrain", "Ice Storm", "Locate Creature", "Polymorph", "Stone Shape", "Stoneskin", "Wall of Fire"],
				5: ["Antilife Shell", "Awaken", "Commune with Nature", "Conjure Elemental", "Contagion", "Geas", "Greater Restoration", "Insect Plague", "Mass Cure Wounds", "Planar Binding", "Raise Dead", "Reincarnate", "Scrying", "Tree Stride", "Wall of Stone"],
				6: ["Conjure Fey", "Find the Path", "Heal", "Heroes' Feast", "Move Earth", "Sunbeam", "Transport via Plants", "Wall of Thorns", "Wind Walk"],
				7: ["Fire Storm", "Mirage Arcane", "Plane Shift", "Regenerate", "Reverse Gravity"],
				8: ["Animal Shapes", "Antipathy/Sympathy", "Control Weather", "Earthquake", "Feeblemind", "Sunburst"],
				9: ["Foresight", "Shapechange", "Storm of Vengeance", "True Resurrection"]
			},
			"Paladin": {
				1: ["Bless", "Command", "Compelled Duel", "Cure Wounds", "Detect Evil and Good", "Detect Magic", "Detect Poison and Disease", "Divine Favor", "Heroism", "Protection from Evil and Good", "Purify Food and Drink", "Sanctuary", "Searing Smite", "Shield of Faith", "Thunderous Smite", "Wrathful Smite"],
				2: ["Aid", "Branding Smite", "Find Steed", "Lesser Restoration", "Locate Object", "Magic Weapon", "Protection from Poison", "Zone of Truth"],
				3: ["Aura of Vitality", "Blinding Smite", "Create Food and Water", "Crusader's Mantle", "Daylight", "Dispel Magic", "Elemental Weapon", "Magic Circle", "Remove Curse", "Revivify"],
				4: ["Aura of Life", "Aura of Purity", "Banishment", "Death Ward", "Freedom of Movement", "Locate Creature", "Staggering Smite"],
				5: ["Banishing Smite", "Circle of Power", "Destructive Wave", "Dispel Evil and Good", "Geas", "Greater Restoration", "Hallow", "Raise Dead"]
			},
			"Ranger": {
				1: ["Alarm", "Animal Friendship", "Cure Wounds", "Detect Magic", "Detect Poison and Disease", "Ensnaring Strike", "Fog Cloud", "Goodberry", "Hail of Thorns", "Hunter's Mark", "Jump", "Longstrider", "Speak with Animals"],
				2: ["Animal Messenger", "Barkskin", "Beast Sense", "Cordon of Arrows", "Darkvision", "Find Traps", "Lesser Restoration", "Locate Animals or Plants", "Locate Object", "Pass without Trace", "Protection from Poison", "Silence", "Spike Growth"],
				3: ["Conjure Animals", "Conjure Barrage", "Daylight", "Lightning Arrow", "Nondetection", "Plant Growth", "Protection from Energy", "Speak with Plants", "Water Breathing", "Water Walk", "Wind Wall"],
				4: ["Conjure Woodland Beings", "Freedom of Movement", "Grasping Vine", "Locate Creature", "Stoneskin"],
				5: ["Commune with Nature", "Conjure Volley", "Swift Quiver", "Tree Stride"]
			},
			"Warlock": {
				0: ["Chill Touch", "Eldritch Blast", "Mage Hand", "Minor Illusion", "Poison Spray", "Prestidigitation", "True Strike"],
				1: ["Armor of Agathys", "Arms of Hadar", "Charm Person", "Comprehend Languages", "Expeditious Retreat", "Hellish Rebuke", "Hex", "Illusory Script", "Protection from Evil and Good", "Unseen Servant"],
				2: ["Cloud of Daggers", "Crown of Madness", "Darkness", "Enthrall", "Hold Person", "Invisibility", "Mirror Image", "Misty Step", "Ray of Enfeeblement", "Shatter", "Spider Climb", "Suggestion"],
				3: ["Counterspell", "Dispel Magic", "Fear", "Fireball", "Fly", "Gaseous Form", "Hunger of Hadar", "Hypnotic Pattern", "Magic Circle", "Major Image", "Remove Curse", "Tongues", "Vampiric Touch"],
				4: ["Banishment", "Blight", "Confusion", "Dimension Door", "Hallucinatory Terrain"],
				5: ["Contact Other Plane", "Dream", "Hold Monster", "Scrying"],
				6: ["Arcane Gate", "Circle of Death", "Conjure Fey", "Create Undead", "Eyebite", "Flesh to Stone", "Mass Suggestion", "True Seeing"],
				7: ["Etherealness", "Finger of Death", "Forcecage", "Plane Shift"],
				8: ["Demiplane", "Dominate Monster", "Feeblemind", "Glibness", "Power Word Stun"],
				9: ["Astral Projection", "Foresight", "Imprisonment", "Power Word Kill", "True Polymorph"]
			}
		};

		return spellLists[className]?.[level] || [];
	}

	getSignatureSpells(className, level) {
		const signatures = {
			"Wizard": {
				0: ["Fire Bolt", "Mage Hand"],
				1: ["Magic Missile", "Shield"],
				2: ["Misty Step", "Web"],
				3: ["Fireball", "Counterspell"],
				4: ["Greater Invisibility", "Polymorph"],
				5: ["Cone of Cold", "Telekinesis"],
				6: ["Disintegrate", "Chain Lightning"],
				7: ["Delayed Blast Fireball", "Teleport"],
				8: ["Mind Blank", "Power Word Stun"],
				9: ["Wish", "Time Stop"]
			},
			"Sorcerer": {
				0: ["Fire Bolt", "Minor Illusion"],
				1: ["Magic Missile", "Shield"],
				2: ["Misty Step", "Scorching Ray"],
				3: ["Fireball", "Haste"],
				4: ["Greater Invisibility", "Polymorph"],
				5: ["Cone of Cold", "Telekinesis"],
				6: ["Chain Lightning", "Disintegrate"],
				7: ["Delayed Blast Fireball", "Reverse Gravity"],
				8: ["Power Word Stun", "Sunburst"],
				9: ["Meteor Swarm", "Wish"]
			},
			"Warlock": {
				0: ["Eldritch Blast"],
				1: ["Hex", "Arms of Hadar"],
				2: ["Hold Person", "Invisibility"],
				3: ["Counterspell", "Fireball"],
				4: ["Dimension Door", "Banishment"],
				5: ["Hold Monster", "Scrying"],
				6: ["Mass Suggestion", "Circle of Death"],
				7: ["Finger of Death", "Plane Shift"],
				8: ["Dominate Monster", "Feeblemind"],
				9: ["Foresight", "Power Word Kill"]
			},
			"Bard": {
				0: ["Vicious Mockery", "Minor Illusion"],
				1: ["Healing Word", "Dissonant Whispers"],
				2: ["Heat Metal", "Suggestion"],
				3: ["Counterspell", "Hypnotic Pattern"],
				4: ["Greater Invisibility", "Polymorph"],
				5: ["Dominate Person", "Mass Cure Wounds"],
				6: ["Mass Suggestion", "Otto's Irresistible Dance"],
				7: ["Forcecage", "Mordenkainen's Magnificent Mansion"],
				8: ["Feeblemind", "Dominate Monster"],
				9: ["True Polymorph", "Foresight"]
			},
			"Cleric": {
				0: ["Sacred Flame", "Guidance"],
				1: ["Cure Wounds", "Guiding Bolt"],
				2: ["Spiritual Weapon", "Hold Person"],
				3: ["Spirit Guardians", "Dispel Magic"],
				4: ["Guardian of Faith", "Freedom of Movement"],
				5: ["Flame Strike", "Greater Restoration"],
				6: ["Heal", "Harm"],
				7: ["Fire Storm", "Resurrection"],
				8: ["Antimagic Field", "Holy Aura"],
				9: ["Mass Heal", "True Resurrection"]
			},
			"Druid": {
				0: ["Druidcraft", "Produce Flame"],
				1: ["Cure Wounds", "Faerie Fire"],
				2: ["Heat Metal", "Moonbeam"],
				3: ["Call Lightning", "Conjure Animals"],
				4: ["Ice Storm", "Polymorph"],
				5: ["Insect Plague", "Tree Stride"],
				6: ["Sunbeam", "Transport via Plants"],
				7: ["Fire Storm", "Reverse Gravity"],
				8: ["Earthquake", "Animal Shapes"],
				9: ["Shapechange", "Storm of Vengeance"]
			},
			"Paladin": {
				1: ["Cure Wounds", "Bless"],
				2: ["Aid", "Lesser Restoration"],
				3: ["Revivify", "Remove Curse"],
				4: ["Freedom of Movement", "Death Ward"],
				5: ["Greater Restoration", "Dispel Evil and Good"]
			},
			"Ranger": {
				1: ["Hunter's Mark", "Cure Wounds"],
				2: ["Pass without Trace", "Spike Growth"],
				3: ["Conjure Animals", "Lightning Arrow"],
				4: ["Freedom of Movement", "Locate Creature"],
				5: ["Swift Quiver", "Tree Stride"]
			}
		};

		return signatures[className]?.[level] || [];
	}

	getSpellCountForLevel(casterClass, level) {
		// Get appropriate spell count based on class type and character level
		const classLevel = casterClass.level;

		// For cantrips (level 0), use cantrip progression
		if (level === 0) {
			return this.getCantripCount(casterClass.name, classLevel, casterClass.subclass?.name);
		}

		// For spell levels, use different logic based on caster type
		const spellsKnownByClass = {
			// Prepared casters get more spells since they can change daily
			"Wizard": {
				1: Math.min(6 + Math.floor(classLevel / 2), 15),
				2: Math.min(4 + Math.floor(classLevel / 3), 10),
				3: Math.min(2 + Math.floor(classLevel / 4), 8),
				4: Math.min(2 + Math.floor(classLevel / 5), 6),
				5: Math.min(2 + Math.floor(classLevel / 6), 5),
				6: Math.min(1 + Math.floor(classLevel / 7), 4),
				7: Math.min(1 + Math.floor(classLevel / 8), 3),
				8: Math.min(1 + Math.floor(classLevel / 9), 3),
				9: Math.min(1 + Math.floor(classLevel / 10), 2)
			},
			"Cleric": {
				1: Math.min(4 + Math.floor(classLevel / 3), 12),
				2: Math.min(3 + Math.floor(classLevel / 4), 8),
				3: Math.min(2 + Math.floor(classLevel / 5), 6),
				4: Math.min(2 + Math.floor(classLevel / 6), 5),
				5: Math.min(2 + Math.floor(classLevel / 7), 4),
				6: Math.min(1 + Math.floor(classLevel / 8), 3),
				7: Math.min(1 + Math.floor(classLevel / 9), 3),
				8: Math.min(1 + Math.floor(classLevel / 10), 2),
				9: Math.min(1 + Math.floor(classLevel / 11), 2)
			},
			"Druid": {
				1: Math.min(4 + Math.floor(classLevel / 3), 12),
				2: Math.min(3 + Math.floor(classLevel / 4), 8),
				3: Math.min(2 + Math.floor(classLevel / 5), 6),
				4: Math.min(2 + Math.floor(classLevel / 6), 5),
				5: Math.min(2 + Math.floor(classLevel / 7), 4),
				6: Math.min(1 + Math.floor(classLevel / 8), 3),
				7: Math.min(1 + Math.floor(classLevel / 9), 3),
				8: Math.min(1 + Math.floor(classLevel / 10), 2),
				9: Math.min(1 + Math.floor(classLevel / 11), 2)
			},
			// Known casters have fewer spells but keep them permanently
			"Sorcerer": {
				1: Math.min(2 + Math.floor(classLevel / 4), 6),
				2: Math.min(1 + Math.floor(classLevel / 6), 4),
				3: Math.min(1 + Math.floor(classLevel / 8), 3),
				4: Math.min(1 + Math.floor(classLevel / 10), 2),
				5: Math.min(1 + Math.floor(classLevel / 12), 2),
				6: Math.min(1 + Math.floor(classLevel / 14), 2),
				7: Math.min(1 + Math.floor(classLevel / 16), 1),
				8: Math.min(1 + Math.floor(classLevel / 18), 1),
				9: Math.min(1 + Math.floor(classLevel / 20), 1)
			},
			"Bard": {
				1: Math.min(4 + Math.floor(classLevel / 3), 10),
				2: Math.min(2 + Math.floor(classLevel / 4), 6),
				3: Math.min(2 + Math.floor(classLevel / 5), 5),
				4: Math.min(1 + Math.floor(classLevel / 7), 3),
				5: Math.min(1 + Math.floor(classLevel / 9), 3),
				6: Math.min(1 + Math.floor(classLevel / 11), 2),
				7: Math.min(1 + Math.floor(classLevel / 13), 2),
				8: Math.min(1 + Math.floor(classLevel / 15), 1),
				9: Math.min(1 + Math.floor(classLevel / 17), 1)
			},
			// Pact magic caster
			"Warlock": {
				1: Math.min(2 + Math.floor(classLevel / 5), 5),
				2: Math.min(2 + Math.floor(classLevel / 6), 4),
				3: Math.min(2 + Math.floor(classLevel / 7), 3),
				4: Math.min(1 + Math.floor(classLevel / 8), 2),
				5: Math.min(1 + Math.floor(classLevel / 10), 2),
				6: Math.min(1 + Math.floor(classLevel / 12), 1),
				7: Math.min(1 + Math.floor(classLevel / 14), 1),
				8: Math.min(1 + Math.floor(classLevel / 16), 1),
				9: Math.min(1 + Math.floor(classLevel / 18), 1)
			},
			// Half-casters
			"Paladin": {
				1: Math.min(2 + Math.floor(classLevel / 6), 4),
				2: Math.min(2 + Math.floor(classLevel / 8), 3),
				3: Math.min(1 + Math.floor(classLevel / 10), 2),
				4: Math.min(1 + Math.floor(classLevel / 12), 1),
				5: Math.min(1 + Math.floor(classLevel / 16), 1)
			},
			"Ranger": {
				1: Math.min(2 + Math.floor(classLevel / 6), 4),
				2: Math.min(2 + Math.floor(classLevel / 8), 3),
				3: Math.min(1 + Math.floor(classLevel / 10), 2),
				4: Math.min(1 + Math.floor(classLevel / 12), 1),
				5: Math.min(1 + Math.floor(classLevel / 16), 1)
			}
		};

		return spellsKnownByClass[casterClass.name]?.[level] || Math.max(1, Math.floor(classLevel / 8));
	}

	async generateRandomEntries(race, classes, equipment, abilityScores, finalName, background = null, alignment = null) {
		// Generate background and personality section first (needs async)
		const tempAlignment = alignment || this.generateRandomAlignment();
		const tempBackground = background || await this.generateRandomBackground(race, tempAlignment);
		const totalLevel = classes.reduce((s, c) => s + (c.level || 1), 0) || 1;
		const depth = await this.generateCharacterDepth(tempBackground, race, classes, tempAlignment);

		// small helper to pick labeled depth entries
		const pick = (label, n = 1) => {
			if (!Array.isArray(depth)) return [];
			return depth.filter(d => d.startsWith(label + ':')).slice(0, n).map(d => d.replace(label + ':', '').trim());
		};

		// Build personality section content
		const backgroundPersonalityEntries = await this.generateBackgroundPersonalitySection(
			finalName, tempBackground, tempAlignment, depth, pick
		);

		const entries = [
			{
				type: "section",
				name: "Background & Personality",
				entries: backgroundPersonalityEntries
			},
			{
				type: "section",
				name: "Features & Traits",
				entries: await this.generateAllFeatureEntries(classes, race)
			},
			{
				type: "section",
				name: "Items",
				entries: equipment || []
			}
		];

		return entries;
	}

	getPersonalityTrait() {
		const traits = [
			"insatiable curiosity",
			"fierce determination",
			"protective nature",
			"thirst for knowledge",
			"desire for justice",
			"love of adventure",
			"quest for redemption",
			"need to prove themselves",
			"quietly sardonic humor",
			"unwavering loyalty to friends",
			"calm in the face of danger",
			"reckless bravado when provoked",
			"gentle compassion for the weak",
			"sly opportunism",
			"habitual honesty to a fault",
			"habitual exaggeration of stories",
			"melancholic nostalgia",
			"overly analytical mind",
			"childlike wonder",
			"a short temper that melts fast",
			"mischievous streak",
			"a tendency to brood",
			"affinity for animals",
			"a love of fine things",
			"a practical, matter-of-fact demeanor"
		];
		return traits[Math.floor(Math.random() * traits.length)];
	}

	getBackgroundStory(backgroundName) {
		// Return cinematic, long-form background vignettes for each background type
		const storyOptions = {
			"Acolyte": [
				"Their time in service to the divine has shaped their worldview and granted them insight into the mysteries of faith.",
				"Years of temple duties taught them that faith requires both devotion and action in the world.",
				"They discovered their calling through a divine vision that continues to guide their path.",
				"Sacred texts and rituals became their foundation, but experience taught them faith's true meaning.",
				"They served as a bridge between the mortal and divine realms in their religious community.",
				"They wrestle with the tension between doctrine and compassion, choosing people over rules when called to do so."
			]
		};

		// If we have a tailored cinematic vignette for this background, return one at random
		const options = storyOptions[backgroundName];
		if (options && options.length) return options[Math.floor(Math.random() * options.length)];

		// Very cinematic generic fallback
		const generic = [
			`They were born beneath a sliver of moonlight that seemed to mark them as different. The world they learned to navigate was harsh and beautiful in equal measure: the taste of cold iron, the hush of candlelit halls, the roar of storm-driven seas. Memory and rumor braided together until they became legend in the places they'd once called home. Now, they carry those echoes like armor — a fragile thing of memory that nevertheless steels them for whatever horrors and wonders the road might deliver.`,
			`Once, their life was a quiet rhythm of work and small affection; then everything changed in a single, terrible moment — a fire, a betrayal, a proclamation from a dying hand. That fracture marked them: everything before is dim, and everything after is the long, burning attempt to put the pieces back together in a world that insists on asking for more.`
		];

		return generic[Math.floor(Math.random() * generic.length)];
	}

	// DEPRECATED: Use generateAllFeatureEntries() instead - loads actual rule text from JSON data
	generateClassFeatures(classes, abilityScores) {
		const features = [];
		// This is a deprecated function - use generateAllFeatureEntries() instead
		return features;
	}

	// Rest of the class continues with working functions...
	/*
		COMMENTED OUT CORRUPTED CODE - PERSONALITY TRAIT ENHANCEMENT IS COMPLETE
					const ideals = pick('Ideal', 1);
					const flaws = pick('Flaw', 1);
					const personality = [];
					if (personalities.length) personality.push(`They are known for ${personalities.join(', ')}.`);
					if (ideals.length) personality.push(`An inner creed: ${ideals[0]}.`);
					if (flaws.length) personality.push(`A weakness haunts them: ${flaws[0]}.`);
					const personalityPara = personality.join(' ');

					// Party-joining reason — strongly alignment-aware and tied to hooks/bonds
					const bonds = pick('Bond', 1);
					const obsession = pick('Obsession', 1)[0] || '';
					const alignToString = (a) => {
						if (!a) return 'Neutral';
						if (Array.isArray(a)) {
							const axis = a[0];
							const moral = a[1] || 'N';
							const axisMap = { 'L': 'Lawful', 'N': 'Neutral', 'C': 'Chaotic' };
							const moralMap = { 'G': 'Good', 'N': 'Neutral', 'E': 'Evil' };
							return `${axisMap[axis] || 'Neutral'} ${moralMap[moral] || ''}`.trim();
						}
						return String(a);
					};
					const aStr = alignToString(tempAlignment);
					// More varied, alignment-biased party-joining reasons. Build a pool from applicable alignment traits
					// and pick one (occasionally two) sentences so characters with the same alignment vary.
					const reasonPools = {
						// Axis-level pools
						Good: [
							`They answer calls for aid—protecting the innocent, escorting the wounded, or standing against cruelty they cannot abide.`,
							`A sense of duty to others drives them; they cannot ignore pleas for help or leave injustice unchecked.`,
							`Having failed to save someone once, they now seek to make amends by defending those who cannot defend themselves.`,
							`They champion causes that lift others, from food and shelter drives to leading relief efforts when towns suffer.`,
							`They pursue a personal code of mercy—rescuing captives, uncovering abuses, and exposing corrupt power.`
						],
						Evil: [
							`They view the party as a means to private ends: riches, influence, or a path to settle old scores.`,
							`Pragmatic and ruthless, they tolerate companions who further their aims while keeping useful allies close.`,
							`They seek power or forbidden knowledge and will use the group's skills to get closer to what they desire.`,
							`A vendetta or a promised reward draws them—whatever benefits them most is worth the company of others.`,
							`They are opportunistic: the party is a tool to exploit weaknesses and open doors to darker gains.`
						],
						Lawful: [
							`Bound by oath, contract, or duty, they travel to uphold a promise or complete an assigned task.`,
							`They serve an order or authority and act to see plans through rather than chase personal whim.`,
							`A code guides them: justice, duty, or law compels their involvement with the group's objectives.`,
							`Procedure and precedent matter; they join to ensure tasks are handled correctly and records kept.`,
							`They pursue restitution or legal redress—bringing wrongdoers to justice through the party's effort.`
						],
						Chaotic: [
							`They hunger for change and the unpredictable—adventure, mischief, and chances to upend stale order.`,
							`Impulse and curiosity push them on; the party is simply the most interesting route to new horizons.`,
							`Escaping a past of control, they now ride with those who let them act freely and take risks.`,
							`They delight in shaking up the status quo; chaos is a tool to reveal truth or topple rot.`,
							`They chase rumor and sensation—where danger and novelty call, they will follow.`
						],
						Neutral: [
							`Pragmatic and adaptable, they join because it serves their goals—survival, profit, or learning.`,
							`They keep balance and avoid extremes; joining the group is a measured decision that benefits them.`,
							`A mixture of curiosity and convenience: the party offers resources or travel the character needs right now.`,
							`They pursue knowledge, trade, or a stable life—the party's opportunities fit those aims.`,
							`They prefer solving present problems and will aid others when it aligns with practical needs.`
						],
						// Combo-specific pools (finer-grained flavor)
						"Lawful Good": [
							`A paragon of duty and compassion, they travel to enforce mercy and uphold sacred oaths.`,
							`They lead by example—restoring order and setting right what regulations have bent under greed.`,
							`Sent forth by a temple or guild, they act to protect the vulnerable and bring calm to shaken places.`
						],
						"Neutral Good": [
							`They do what is right without dogma—help where needed and leave formalities to others.`,
							`Driven by compassion more than creed, they aid those in need and seek practical outcomes.`,
							`They carry quiet favors and debts; joining the party repays kindness or furthers relief efforts.`
						],
						"Chaotic Good": [
							`They break unjust laws to free the oppressed, using unpredictability as their ally.`,
							`A rebel at heart, they seek allies who will act boldly and refuse to be mired in red tape.`,
							`They pursue idealistic change—overthrowing corrupt rulers or starting revolutions that heal communities.`
						],
						"Lawful Neutral": [
							`Their loyalty is to system and stability; they join to ensure orders are fulfilled and records stay true.`,
							`They respect hierarchy and procedure and serve best when missions have clear rules and consequences.`,
							`They are an arbiter or investigator sent to observe, report, and correct failures of governance.`
						],
						"True Neutral": [
							`A pragmatist who keeps the scales even—they join when balance or survival is at stake.`,
							`They pursue harmony and will help whichever side prevents greater harm to the world.`,
							`They value stability and avoid crusades, joining only if it maintains or restores equilibrium.`
						],
						"Chaotic Neutral": [
							`They answer only to whim and chance; the party is simply the most entertaining company.`,
							`Unpredictable and free, they seek novelty and will abandon causes that feel stale.`,
							`They follow curiosity first—where a rumor leads, they will go, whether noble or profane.`
						],
						"Lawful Evil": [
							`They manipulate systems and contracts to their benefit, using law as a blade.`,
							`Ordered cruelty: they prefer schemes with rules because rules can be exploited reliably.`,
							`They seek allies who can provide plausible deniability while they expand influence through institutions.`
						],
						"Neutral Evil": [
							`Selfish and practical, they pursue personal gain with little concern for others.`,
							`They make deals that benefit them and betray when profitable; the party is one such expedient.`,
							`They prefer subtle gains—assets, contact networks, or secrets that increase their power.`
						],
						"Chaotic Evil": [
							`They revel in anarchy and terror; the party is a means to sow chaos or feed a destructive whim.`,
							`Violence and upheaval appeal; they ally with those who amplify their freedom to act without restraint.`,
							`They are driven by wanton ambition or bloodlust—companions are temporary tools for a dark agenda.`
						]
					};

					let pool = [];
					// If we have a two-word alignment (e.g., "Lawful Good"), prefer combo-specific pool first
					if (aStr.indexOf(' ') > -1 && reasonPools[aStr]) pool = pool.concat(reasonPools[aStr]);
					// Always include axis-level flavor so combos remain varied
					if (aStr.includes('Good')) pool = pool.concat(reasonPools.Good);
					if (aStr.includes('Evil')) pool = pool.concat(reasonPools.Evil);
					if (aStr.includes('Lawful')) pool = pool.concat(reasonPools.Lawful);
					if (aStr.includes('Chaotic')) pool = pool.concat(reasonPools.Chaotic);
					if (!pool.length) pool = pool.concat(reasonPools.Neutral);

					const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];
					let joinReason = choose(pool);
					// 20% chance to compound with a second, different reason for extra flavor
					if (Math.random() < 0.2) {
						let other = choose(pool);
						if (other !== joinReason) joinReason = `${joinReason} ${other}`;
					}
					// Tie to specific hooks or bonds if present
					const tieParts = [];
					if (bonds.length) tieParts.push(`A vow to ${bonds[0]} pulls them.`);
					if (relation) tieParts.push(`A connection to ${relation} complicates their path.`);
					if (contact) tieParts.push(`${contact} factors into their motives.`);
					if (obsession) tieParts.push(`An obsession — ${obsession} — colors their choices.`);
					if (hook) tieParts.push(`Rumors of ${hook} first drew them to travel.`);
					const joinPara = [joinReason].concat(tieParts).join(' ');

					// Return a concise set: backstory, personality, join reason
					const result = [backstory, personalityPara || `${self.getPersonalityTrait()}`, joinPara];
					return result;
				})(this, race, classes, abilityScores, background, alignment)
			},
			{
				type: "section",
				name: "Features & Traits",
				entries: await this.generateAllFeatureEntries(classes, race)
			},
			{
				type: "section",
				name: "Items",
				entries: equipment || []
			}
		];

		return entries;
	*/
	// END OF CORRUPTED CODE COMMENT BLOCK

	// DEPRECATED: Use generateAllFeatureEntries() instead - loads actual rule text from JSON data
	generateClassFeatures(classes, abilityScores) {
		const features = [];

		classes.forEach(cls => {
			switch (cls.name) {
				case "Fighter":
					features.push({
						type: "entries",
						name: "Fighting Style",
						entries: ["Choose a fighting style that defines your combat approach: Defense (+1 AC), Dueling (+2 damage with one-handed weapons), Great Weapon Fighting (reroll 1s and 2s on damage), or Archery (+2 attack with ranged weapons)."]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Action Surge",
							entries: [`Once per short rest, take an additional action on your turn. At 17th level, you can use this feature twice before a rest.`]
						});
					}
					if (cls.level >= 3) {
						features.push({
							type: "entries",
							name: "Martial Archetype",
							entries: ["Choose your specialization: Champion (improved critical hits), Battle Master (combat maneuvers), or Eldritch Knight (spellcasting)."]
						});
					}
					if (cls.level >= 4) {
						const asiLevels = this.getASILevelsForClass(cls.name);
						const levelsList = asiLevels.join(', ').replace(/, ([^,]*)$/, ', and $1');
						features.push({
							type: "entries",
							name: "Ability Score Improvement",
							entries: [`You have improved your abilities or gained a feat. This feature is gained at levels ${levelsList}.`]
						});
					}
					if (cls.level >= 5) {
						features.push({
							type: "entries",
							name: "Extra Attack",
							entries: [`When you take the Attack action, you can attack ${cls.level >= 20 ? 'four' : cls.level >= 11 ? 'three' : 'two'} times instead of once.`]
						});
					}
					if (cls.level >= 9) {
						features.push({
							type: "entries",
							name: "Indomitable",
							entries: [`Reroll a failed saving throw. You can use this feature ${cls.level >= 17 ? '3' : cls.level >= 13 ? '2' : '1'} time(s) per long rest.`]
						});
					}
					break;

				case "Paladin":
					features.push({
						type: "entries",
						name: "Divine Sense",
						entries: [`Detect celestials, fiends, and undead within 60 feet. ${1 + Math.floor((abilityScores?.cha - 10) / 2) || 3} uses per long rest.`]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Divine Smite",
							entries: ["When you hit with a melee weapon attack, you can expend a spell slot to deal 2d8 radiant damage, plus 1d8 for each spell level above 1st (max 5d8). +1d8 vs undead/fiends."]
						});
						features.push({
							type: "entries",
							name: "Lay on Hands",
							entries: [`Heal ${cls.level * 5} hit points per long rest, distributed as you choose. Can also cure one disease or neutralize one poison.`]
						});
					}
					if (cls.level >= 3) {
						features.push({
							type: "entries",
							name: "Sacred Oath",
							entries: ["Your sacred oath defines your purpose: Devotion (protection and honesty), Ancients (preserve life and joy), or Vengeance (punish wrongdoers)."]
						});
						features.push({
							type: "entries",
							name: "Channel Divinity",
							entries: ["Use your sacred oath's supernatural abilities once per rest. Options depend on your chosen oath."]
						});
					}
					if (cls.level >= 6) {
						features.push({
							type: "entries",
							name: "Aura of Protection",
							entries: [`You and friendly creatures within ${cls.level >= 18 ? '30' : '10'} feet add your Charisma modifier to saving throws.`]
						});
					}
					break;

				case "Wizard":
					features.push({
						type: "entries",
						name: "Spellbook",
						entries: ["Your spellbook contains the spells you have learned and can prepare. You can copy new spells into it from scrolls and other spellbooks."]
					});
					features.push({
						type: "entries",
						name: "Ritual Casting",
						entries: ["You can cast spells with the ritual tag as rituals if they're in your spellbook, without expending a spell slot but taking 10 minutes longer."]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Arcane Tradition",
							entries: ["Choose your school of magic: Evocation (destructive spells), Divination (foresight and knowledge), Enchantment (charm and control), or others."]
						});
						features.push({
							type: "entries",
							name: "Arcane Recovery",
							entries: [`Once per day during a short rest, recover spell slots with a combined level of ${Math.ceil(cls.level / 2)} or lower.`]
						});
					}
					if (cls.level >= 18) {
						features.push({
							type: "entries",
							name: "Spell Mastery",
							entries: ["Choose one 1st-level and one 2nd-level spell. You can cast them at will without expending spell slots."]
						});
					}
					break;

				case "Rogue":
					features.push({
						type: "entries",
						name: "Sneak Attack",
						entries: [`Deal an extra ${Math.ceil(cls.level / 2)}d6 damage when you have advantage on an attack with a finesse or ranged weapon, or when another enemy is within 5 feet of your target.`]
					});
					features.push({
						type: "entries",
						name: "Thieves' Cant",
						entries: ["You know the secret language of rogues, allowing you to hide messages in seemingly normal conversation."]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Cunning Action",
							entries: ["Use a bonus action to Dash, Disengage, or Hide."]
						});
					}
					if (cls.level >= 3) {
						features.push({
							type: "entries",
							name: "Roguish Archetype",
							entries: ["Your specialty: Thief (climbing and stealing), Assassin (stealth and poison), or Arcane Trickster (magic and misdirection)."]
						});
					}
					if (cls.level >= 5) {
						features.push({
							type: "entries",
							name: "Uncanny Dodge",
							entries: ["When an attacker you can see hits you, use your reaction to halve the damage."]
						});
					}
					if (cls.level >= 7) {
						features.push({
							type: "entries",
							name: "Evasion",
							entries: ["When you make a Dexterity saving throw against an effect that deals half damage on success, you take no damage on success and half on failure."]
						});
					}
					break;

				case "Cleric":
					features.push({
						type: "entries",
						name: "Divine Domain",
						entries: ["Your domain grants additional spells and abilities: Life (healing), Light (radiant damage), War (combat prowess), or others based on your deity."]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Channel Divinity",
							entries: [`Use divine energy to fuel magical effects. You can Turn Undead and use your domain feature ${cls.level >= 18 ? '3' : cls.level >= 6 ? '2' : '1'} time(s) per rest.`]
						});
					}
					if (cls.level >= 5) {
						features.push({
							type: "entries",
							name: "Destroy Undead",
							entries: [`When you turn undead, creatures of CR ${Math.floor((cls.level - 5) / 3) + 1/2} or lower are destroyed instead of turned.`]
						});
					}
					if (cls.level >= 10) {
						features.push({
							type: "entries",
							name: "Divine Intervention",
							entries: [`Once per day, call upon your deity for aid. Roll d100; success if you roll your cleric level or lower. On success, the DM chooses appropriate divine aid.`]
						});
					}
					break;

				case "Barbarian":
					features.push({
						type: "entries",
						name: "Rage",
						entries: [`Enter a battle fury ${cls.level < 3 ? '2' : cls.level < 6 ? '3' : cls.level < 12 ? '4' : cls.level < 17 ? '5' : '6'} times per long rest. Gain resistance to physical damage and +${Math.floor(cls.level / 9) + 2} damage on Strength attacks.`]
					});
					features.push({
						type: "entries",
						name: "Unarmored Defense",
						entries: ["While not wearing armor, your AC equals 10 + Dex modifier + Con modifier."]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Reckless Attack",
							entries: ["Gain advantage on Strength-based melee attacks, but enemies have advantage against you until your next turn."]
						});
						features.push({
							type: "entries",
							name: "Danger Sense",
							entries: ["Advantage on Dexterity saving throws against effects you can see (traps, spells, etc.) while not blinded, deafened, or incapacitated."]
						});
					}
					if (cls.level >= 3) {
						features.push({
							type: "entries",
							name: "Primal Path",
							entries: ["Your barbarian path: Path of the Berserker (frenzied combat), Path of the Totem Warrior (spiritual animals), or other primal traditions."]
						});
					}
					break;

				case "Ranger":
					features.push({
						type: "entries",
						name: "Favored Enemy",
						entries: ["Choose a creature type. You have advantage on Wisdom (Survival) checks to track them and Intelligence checks to recall information about them."]
					});
					features.push({
						type: "entries",
						name: "Natural Explorer",
						entries: ["Choose a favored terrain. You and your party move stealthily at normal pace and remain alert while tracking, foraging, or navigating."]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Fighting Style",
							entries: ["Choose Archery (+2 ranged attacks), Defense (+1 AC), Dueling (+2 one-handed damage), or Two-Weapon Fighting (add ability modifier to off-hand damage)."]
						});
					}
					if (cls.level >= 3) {
						features.push({
							type: "entries",
							name: "Hunter Conclave",
							entries: ["Your ranger specialization: Hunter (monster slaying), Beast Master (animal companion), or other ranger traditions."]
						});
					}
					break;

				case "Warlock":
					features.push({
						type: "entries",
						name: "Otherworldly Patron",
						entries: ["Your patron grants you power: The Fiend (hellish magic), The Great Old One (alien mysteries), The Archfey (fey magic), or others."]
					});
					features.push({
						type: "entries",
						name: "Pact Magic",
						entries: [`Your spell slots recharge on a short rest. You have ${cls.level < 2 ? '1' : cls.level < 11 ? '2' : cls.level < 17 ? '3' : '4'} spell slots of level ${cls.level < 3 ? '1' : cls.level < 5 ? '2' : cls.level < 7 ? '3' : cls.level < 9 ? '4' : '5'}.`]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Eldritch Invocations",
							entries: [`Learn ${Math.floor((cls.level + 1) / 3) + 1} magical abilities that enhance your warlock powers. These can be changed when you gain a level.`]
						});
					}
					if (cls.level >= 3) {
						features.push({
							type: "entries",
							name: "Pact Boon",
							entries: ["Choose your pact: Pact of the Chain (familiar), Pact of the Blade (weapon), Pact of the Tome (spells), or others depending on your patron."]
						});
					}
					break;

				case "Sorcerer":
					features.push({
						type: "entries",
						name: "Sorcerous Origin",
						entries: ["The source of your magic: Draconic Bloodline (dragon heritage), Wild Magic (chaotic surges), or other magical origins."]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Font of Magic",
							entries: [`You have ${cls.level} sorcery points that recharge on a long rest. Convert between sorcery points and spell slots as a bonus action.`]
						});
					}
					if (cls.level >= 3) {
						features.push({
							type: "entries",
							name: "Metamagic",
							entries: [`Learn ${Math.floor((cls.level - 1) / 4) + 2} ways to modify spells: Twinned (target two creatures), Quickened (cast as bonus action), Empowered (reroll damage), etc.`]
						});
					}
					break;

				case "Druid":
					features.push({
						type: "entries",
						name: "Druidcraft",
						entries: ["You know the druidcraft cantrip and can use it to create various minor nature effects."]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Wild Shape",
							entries: [`Transform into a beast ${cls.level < 20 ? '2' : 'unlimited'} times per rest. Beast CR and restrictions depend on your level.`]
						});
						features.push({
							type: "entries",
							name: "Druid Circle",
							entries: ["Your circle: Circle of the Land (bonus spells and recovery), Circle of the Moon (enhanced wild shape), or other druidic traditions."]
						});
					}
					if (cls.level >= 18) {
						features.push({
							type: "entries",
							name: "Timeless Body",
							entries: ["You age more slowly and can't be aged magically. For every 10 years that pass, your body ages only 1 year."]
						});
					}
					break;

				case "Bard":
					features.push({
						type: "entries",
						name: "Bardic Inspiration",
						entries: [`As a bonus action, give an ally a d${cls.level < 5 ? '6' : cls.level < 10 ? '8' : cls.level < 15 ? '10' : '12'} to add to an attack, ability check, or saving throw. ${Math.floor((abilityScores?.cha - 10) / 2) + 1 || 3} uses per rest.`]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Jack of All Trades",
							entries: ["Add half your proficiency bonus to any ability check that doesn't already include it."]
						});
					}
					if (cls.level >= 3) {
						features.push({
							type: "entries",
							name: "Bard College",
							entries: ["Your specialization: College of Lore (knowledge and skills), College of Valor (combat prowess), or other bardic traditions."]
						});
						features.push({
							type: "entries",
							name: "Expertise",
							entries: ["Double your proficiency bonus for two chosen skills. Gain two more at 10th level."]
						});
					}
					break;

				case "Monk":
					features.push({
						type: "entries",
						name: "Unarmored Defense",
						entries: ["While unarmored and not using a shield, AC = 10 + Dex modifier + Wis modifier."]
					});
					features.push({
						type: "entries",
						name: "Martial Arts",
						entries: [`Unarmed strikes and monk weapons use d${cls.level < 5 ? '4' : cls.level < 11 ? '6' : cls.level < 17 ? '8' : '10'} for damage and can use Dex instead of Str. When you attack with these, you can make an unarmed strike as a bonus action.`]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Ki",
							entries: [`You have ${cls.level} ki points. Spend 1 to use Flurry of Blows, Patient Defense, or Step of the Wind as bonus actions.`]
						});
						features.push({
							type: "entries",
							name: "Unarmored Movement",
							entries: [`Your speed increases by ${Math.floor(cls.level / 6) * 5 + 10} feet while unarmored.`]
						});
					}
					if (cls.level >= 3) {
						features.push({
							type: "entries",
							name: "Monastic Tradition",
							entries: ["Your path: Way of the Open Hand (combat techniques), Way of Shadow (stealth and infiltration), or other monastic traditions."]
						});
					}
					if (cls.level >= 4) {
						features.push({
							type: "entries",
							name: "Slow Fall",
							entries: [`Reduce falling damage by ${cls.level * 5} points as a reaction.`]
						});
					}
					break;
			}
		});

		return features;
	}

	getPersonalityTrait() {
		const traits = [
			"insatiable curiosity",
			"fierce determination",
			"protective nature",
			"thirst for knowledge",
			"desire for justice",
			"love of adventure",
			"quest for redemption",
			"need to prove themselves",
			"quietly sardonic humor",
			"unwavering loyalty to friends",
			"calm in the face of danger",
			"reckless bravado when provoked",
			"gentle compassion for the weak",
			"sly opportunism",
			"habitual honesty to a fault",
			"habitual exaggeration of stories",
			"melancholic nostalgia",
			"overly analytical mind",
			"childlike wonder",
			"a short temper that melts fast",
			"mischievous streak",
			"a tendency to brood",
			"affinity for animals",
			"a love of fine things",
			"a practical, matter-of-fact demeanor"
		];
		return traits[Math.floor(Math.random() * traits.length)];
	}

	getBackgroundStory(backgroundName) {
		// Return cinematic, long-form background vignettes for each background type
		const storyOptions = {
			"Acolyte": [
				"Their time in service to the divine has shaped their worldview and granted them insight into the mysteries of faith.",
				"Years of temple duties taught them that faith requires both devotion and action in the world.",
				"They discovered their calling through a divine vision that continues to guide their path.",
				"Sacred texts and rituals became their foundation, but experience taught them faith's true meaning.",
				"They served as a bridge between the mortal and divine realms in their religious community.",
				"They wrestle with the tension between doctrine and compassion, choosing people over rules when called to do so."
			],
			"Criminal": [
				"A past of shadows and questionable choices has taught them to think quickly and trust sparingly.",
				"The criminal underworld was their university, teaching lessons in survival and human nature.",
				"They learned that everyone has a price, but some things are worth more than money.",
				"A life of crime ended when they realized redemption was possible, but the skills remain.",
				"Streets and alleyways were their classroom, where they mastered reading people's true intentions.",
				"They still keep a few contacts in the old haunts, useful for information or a quick exit."
			],
			"Folk Hero": [
				"Standing up for the common people against tyranny has made them a symbol of hope in their homeland.",
				"A moment of courage in the face of injustice revealed their true character and destiny.",
				"They learned that heroism isn't about glory—it's about doing what's right when it matters most.",
				"Their actions inspired others to believe that one person can make a difference against overwhelming odds.",
				"They discovered that the greatest victories are won by those who fight for others, not themselves.",
				"Their legend is small-town sized but deeply felt: children still point to where they stood."
			],
			"Noble": [
				"Born to privilege, they seek to prove their worth beyond their bloodline and station.",
				"Court politics taught them that the most dangerous battles are fought with words and alliances.",
				"They rejected the comfortable life of nobility to forge their own path in the world.",
				"Family honor weighs heavily on their shoulders, driving them to exceed all expectations.",
				"They learned that true leadership means using privilege to serve those who have less.",
				"They keep a small memento from home—a reminder of promises made and debts unpaid."
			],
			"Hermit": [
				"Years of solitude and contemplation gave them unique insights into the nature of existence and truth.",
				"They withdrew from the world to study a great mystery that still drives their quest for answers.",
				"Isolation taught them that wisdom often comes from understanding what you don't know.",
				"Their hermitage became a place of pilgrimage for those seeking guidance and enlightenment.",
				"They discovered that sometimes you must lose yourself completely to find who you truly are.",
				"Loneliness and peace live side by side in their recollections; both shaped their courage."
			],
			"Entertainer": [
				"The stage taught them to read crowds and understand what moves the human heart.",
				"They learned that performance is a form of magic that can transform both actor and audience.",
				"Traveling from place to place, they collected stories and songs while spreading joy and news.",
				"They discovered that the best entertainment reveals truth about life through laughter and tears.",
				"Their art became their voice, speaking truths that ordinary conversation could never convey.",
				"They hide a private sorrow behind a practiced smile; it gives depth to every piece they perform."
			],
			"Sage": [
				"Years of study and research have filled their mind with esoteric knowledge and burning questions.",
				"They uncovered forgotten lore that changed their understanding of the world and their place in it.",
				"Ancient texts and modern theories became their passion, but experience taught them wisdom's true value.",
				"They learned that knowledge without wisdom is dangerous, but wisdom without knowledge is powerless.",
				"Their research revealed connections between disparate fields that others thought unrelated.",
				"They keep detailed notebooks—marginalia that sometimes reveal more about them than their publications."
			],
			"Soldier": [
				"Military service instilled discipline and tactical thinking that serves them well in any conflict.",
				"They learned leadership under fire and discovered they could inspire others in the darkest times.",
				"Battle taught them the difference between courage and fearlessness, and which one truly matters.",
				"They carry scars from conflicts that remind them why peace is worth fighting for.",
				"Military life showed them that victory often goes to those who adapt fastest to changing circumstances.",
				"They still follow a rigid routine—sleep, clean kit, train—because structure keeps fear at bay."
			],
			"Outlander": [
				"Raised beyond the edges of civilization, they learned to move quietly through wild places.",
				"The rhythms of seasons and animals shaped their skills and their sense of home.",
				"They can find food and water where others would perish, and they trust the land before strangers.",
				"They carry a keepsake from a late parent: a small bone bead or carved wooden token worn on a cord."
			],
			"Guild Artisan": [
				"Years apprenticed to a guild taught them pride in craft and the value of a steady hand.",
				"They know guild politics, tariffs, and the hidden markets where tradespeople make a living.",
				"Their work is their reputation; they guard it jealously and take insult to sloppy punishment.",
				"A secret inferior batch of work haunts them—a mistake they fear others will discover."
			],
			"Urchin": [
				"City smarts and nimble feet kept them alive when institutions failed them.",
				"They learned to survive by reading people and finding pockets of charity or opportunity.",
				"They treasure a single keepsake—a coin, a scrap of cloth, a folded note—that reminds them of someone kind."
			],
			"Sailor": [
				"Life at sea taught them to respect the weather and the crew that keeps a ship alive.",
				"They can splice a line, read stars, and tell tall tales of monstrous waves and distant ports.",
				"They still get the occasional restless itch for salt wind and horizon even on land."
			],
			"Charlatan": [
				"They made a living with smiles, sleight of hand, and carefully practiced lies.",
				"A false identity once saved them from ruin; part of them misses the cleverness of that life.",
				"They know how to spot marks and will avoid burning bridges that might be useful later."
			]
		};

		// If we have a tailored cinematic vignette for this background, return one at random
		const options = storyOptions[backgroundName];
		if (options && options.length) return options[Math.floor(Math.random() * options.length)];

		// Very cinematic generic fallback
		const generic = [
			`They were born beneath a sliver of moonlight that seemed to mark them as different. The world they learned to navigate was harsh and beautiful in equal measure: the taste of cold iron, the hush of candlelit halls, the roar of storm-driven seas. Memory and rumor braided together until they became legend in the places they’d once called home. Now, they carry those echoes like armor — a fragile thing of memory that nevertheless steels them for whatever horrors and wonders the road might deliver.`,
			`Once, their life was a quiet rhythm of work and small affection; then everything changed in a single, terrible moment — a fire, a betrayal, a proclamation from a dying hand. That fracture marked them: everything before is dim, and everything after is the long, burning attempt to put the pieces back together in a world that insists on asking for more.`
		];

		return generic[Math.floor(Math.random() * generic.length)];
	}

	async generateFluffEntries(name, totalLevel, classes, race, background, characterDepth, alignment = null) {
		const entries = [];

		// helper to pull depth entries by label prefix (e.g., 'Personality:', 'Ideal:')
		const getDepthByLabel = (label, count = 1) => {
			if (!Array.isArray(characterDepth)) return [];
			const matches = characterDepth.filter(d => d.startsWith(label + ':'));
			return matches.slice(0, count).map(m => m.replace(label + ':', '').trim());
		};

		// 1) Cinematic opening — establish tone and stakes
	entries.push(`${name} moves through the world like a story told in fragments: thunder at dusk, a handkerchief soaked with memory, the glint of steel in moonlight. ${totalLevel === 1 ? 'Their tale has only just begun' : totalLevel < 5 ? 'They are sharpening into something dangerous and true' : totalLevel < 10 ? 'They carry the weight of many trials' : 'They are a presence that reshapes the stories of those around them'}. Born of ${race.name} blood and honed by the discipline of ${classes.map(c => c.name).join(' and ')}, they travel with the quiet certainty of someone who has paid for what they know.`);

		// 2) Expansive background tableau with sensory detail
		const bg = this.getBackgroundStory(background.name);
		let bgExpansion = bg;
		// Pull origin and turning point from flat characterDepth entries if present
		const originParts = getDepthByLabel('Origin', 1);
		const turningParts = getDepthByLabel('TurningPoint', 1);
		if (originParts.length) bgExpansion += ` ${originParts[0]}`;
		if (turningParts.length) bgExpansion += ` ${turningParts[0]}`;
		// Add more sensory and cinematic flourishes
		bgExpansion += ` The memory of that place lingers in small things: a taste, a chord, the way light hits certain stones. It formed a map of desires and fears that they consult like an old friend.`;
		entries.push(bgExpansion);

		// 2b) Detailed background ledger — family, station, mentors, scars and skills
		const hooks = getDepthByLabel('Hook', 4);
		const relationships = getDepthByLabel('Relationship', 2);
		const familyParts = getDepthByLabel('Family', 2);
		const backgroundLedger = [];
		// Upbringing and station
		backgroundLedger.push(`Raised in the context of ${background.name.toLowerCase() || 'their background'}, their childhood shaped practical skills and expectations.`);
		if (familyParts.length) backgroundLedger.push(`Family ties: ${familyParts.join('; ')}.`);
		// Mentors and training
		const mentor = getDepthByLabel('Mentor', 1);
		if (mentor.length) backgroundLedger.push(`A mentor or teacher left a lasting mark: ${mentor[0]}.`);
		// Scars, marks and signatures
		const notable = getDepthByLabel('Notable', 2);
		if (notable.length) backgroundLedger.push(`Marked by ${notable.join('; ')}, they wear proof of their story on skin and manner.`);
		// Skills and craft
		backgroundLedger.push(`Years of practice gave them skills: ${classes.map(c => c.name).join(', ')} craft showing in small, everyday talents.`);
		// Hooks
		if (hooks.length) backgroundLedger.push(`Whispers follow them: ${hooks.slice(0,3).join('; ')}.`);
		if (relationships.length) backgroundLedger.push(`Connections: ${relationships.join('; ')}.`);
		entries.push(backgroundLedger.join(' '));

	// 3) Deep personality portrait — derive from flat characterDepth entries
	const personalityTraits = getDepthByLabel('Personality', 4);
	const ideals = getDepthByLabel('Ideal', 2);
	const flaws = getDepthByLabel('Flaw', 3);
	const mannerisms = getDepthByLabel('Mannerism', 3);
	const obsessions = getDepthByLabel('Obsession', 1);
	const bonds = getDepthByLabel('Bond', 2);
	const personalityParts = [];
	if (personalityTraits.length) personalityParts.push(`At their center is ${personalityTraits.join(', ')}.`);
	if (ideals.length) personalityParts.push(`Those impulses are guided by an inner creed: ${ideals.join('; ')}.`);
	if (flaws.length) personalityParts.push(`Yet for every nobility there is a shadow: ${flaws.join('; ')} — fissures that stories exploit and enemies pry at.`);
	// Mannerisms and coping
	if (mannerisms.length) personalityParts.push(`They show it in small rituals: ${mannerisms.join('; ')}.`);
	// Obsessions and bonds give impetus
	if (obsessions.length) personalityParts.push(`A single obsession colors many decisions: ${obsessions[0]}.`);
	if (bonds.length) personalityParts.push(`Loyalty tethers them: ${bonds.join('; ')}.`);
	// Strengths and reputation
	personalityParts.push(`They move through stress with particular tools — a calm word, a quick blade, a stubborn refusal — and are known for ${Math.random() < 0.5 ? 'steadfastness' : 'a wry, cutting wit'} among peers.`);
	personalityParts.push(`In the crucible of combat and council alike, these traits bloom into choices; sometimes brave, sometimes ruinous, always telling.`);
	entries.push(personalityParts.join(' '));


		// 5) Relationships, bonds and obsessions — theatrical and specific
		const relations = [];
	if (relationships.length) relations.push(`There is a figure who lives at the edge of their story: ${relationships.join('; ')}. This link pulls them toward both tenderness and ruin.`);
	if (bonds.length) relations.push(`Promises bind them to ${bonds.join(', ')} — oaths kept by blood and by debt.`);
	if (obsessions.length) relations.push(`A private obsession gnaws at them: ${obsessions.join('; ')}. It is a bright, terrible beacon that guides every perilous step.`);
	if (relations.length) entries.push(relations.join(' '));

		// 5) Secrets, prophecy, and supernatural hooks — dramatic tone
	const secrets = [];
	const secretEntries = getDepthByLabel('Secret', 2);
	const supernatural = getDepthByLabel('Supernatural', 1);
	if (secretEntries.length) secrets.push(`They carry a secret like a second heart: ${secretEntries.join('; ')}. It hums beneath their ribs and will not be quiet.`);
	if (supernatural.length) secrets.push(`Occasionally the ordinary fractures and something uncanny slips through: ${supernatural.join('; ')}. Those moments leave behind charred questions and glittering clues.`);
	if (secrets.length) entries.push(secrets.join(' '));

		// 6) Mannerisms and rituals — evocative, cinematic imagery
		const manners = [];
	if (mannerisms.length) manners.push(`They move with idiosyncrasies that betray their inner weather: ${mannerisms.join('; ')}.`);
	manners.push(`Small rituals — arranging a cup just so, whispering the same phrase into their palm, tracing a scar with a thoughtful finger — are how they speak when words are too dangerous.`);
	entries.push(manners.join(' '));

		// 7) Achievements and hooks — longer, adventure-ready seeds
		const hookText = hooks.length ? hooks.join('; ') : 'a string of rescues, betrayals, and bargains that will not stay buried';
	entries.push(`Rumors follow them: ${hookText}. Those whispers open doors and close them — rewards and threats braided together.`);

		// 8) Party-joining paragraphs (alignment-aware)
		const partyReasons = [];
		// Normalize alignment to string like 'Lawful Good', 'Neutral', etc.
		const alignToString = (a) => {
			if (!a) return 'Neutral';
			if (Array.isArray(a)) {
				const axis = a[0];
				const moral = a[1] || 'N';
				const axisMap = { 'L': 'Lawful', 'N': 'Neutral', 'C': 'Chaotic' };
				const moralMap = { 'G': 'Good', 'N': 'Neutral', 'E': 'Evil' };
				return `${axisMap[axis] || 'Neutral'} ${moralMap[moral] || ''}`.trim();
			}
			return String(a);
		};
		const alignStr = alignToString(alignment);
		// Build several possible party-joining rationales, biased by alignment
		if (alignStr.includes('Good')) {
			partyReasons.push(`They would join the party to relieve suffering and fight injustice; their conscience cannot ignore pleas for help.`);
		}
		if (alignStr.includes('Lawful')) {
			partyReasons.push(`Duty, oaths, or a contract bind them; they see strength in order and believe the group is the best instrument to achieve a right end.`);
		}
		if (alignStr.includes('Chaotic')) {
			partyReasons.push(`They crave the unpredictability of companionship and adventure; the party offers freedom, mischief, and a way to upend stifling structures.`);
		}
		if (alignStr.includes('Evil')) {
			partyReasons.push(`Personal gain, influence, or a hidden agenda guides them — they see the party as a useful tool to be wielded when necessary.`);
		}
		if (alignStr === 'Neutral' || alignStr.includes('Neutral')) {
			partyReasons.push(`Pragmatism and curiosity pull them toward the group: advantages, knowledge, and survival are neutral currencies worth pursuing.`);
		}
		// Tie party reason to hooks or bonds if available
		if (hooks.length) partyReasons.push(`A rumor tied to ${hooks[0]} is what first drew them to the company.`);
		if (bonds && bonds.length) partyReasons.push(`A vow to ${bonds[0]} compels them to travel with those who might help fulfill it.`);
		// Add 1-2 party paragraphs
		if (partyReasons.length) {
			entries.push(partyReasons.slice(0, 2).join(' '));
		}

		// 9) Concluding cinematic prophecy — future-facing and evocative
		entries.push(`Now they stand at a crossroads: the road behind is full of ghosts, the road ahead a maw of possibility. Every choice will echo, and somewhere beyond the next ridge waits the chapter that might finally name them.`);

		return entries;
	}

	/**
	 * Select an origin that fits the character's background and alignment for narrative consistency
	 */
	_selectThematicOrigin(originTemplates, background, alignment) {
		const pickFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

		// Map backgrounds to preferred origin categories
		const backgroundThemes = {
			"Acolyte": ["mystical", "scholarly", "noble"],
			"Criminal": ["urban", "tragic", "exotic"],
			"Folk Hero": ["rural", "artisan", "military"],
			"Noble": ["noble", "urban", "scholarly"],
			"Sage": ["scholarly", "mystical", "urban"],
			"Soldier": ["military", "urban", "tragic"],
			"Charlatan": ["urban", "exotic", "artisan"],
			"Entertainer": ["exotic", "urban", "artisan"],
			"Guild Artisan": ["artisan", "urban", "rural"],
			"Hermit": ["rural", "mystical", "scholarly"],
			"Outlander": ["rural", "exotic", "tragic"],
			"Sailor": ["artisan", "exotic", "urban"]
		};

		// Get alignment moral component for additional filtering
		const moral = (alignment && alignment[1]) || 'N';

		// Get preferred themes for this background
		const preferredThemes = backgroundThemes[background?.name] || ["rural", "urban", "artisan"];

		// Try to find origins that match the preferred themes
		let candidateOrigins = [];

		for (const theme of preferredThemes) {
			const themeOrigins = this._getOriginsByTheme(originTemplates, theme);
			candidateOrigins.push(...themeOrigins);
		}

		// If no themed matches, fall back to alignment-appropriate origins
		if (candidateOrigins.length === 0) {
			candidateOrigins = this._getOriginsByAlignment(originTemplates, moral);
		}

		// Final fallback: use all origins
		if (candidateOrigins.length === 0) {
			candidateOrigins = originTemplates;
		}

		return pickFrom(candidateOrigins);
	}

	/**
	 * Get origins that match a specific theme
	 */
	_getOriginsByTheme(originTemplates, theme) {
		const themeKeywords = {
			"rural": ["fields", "wild lands", "outskirts", "pastoral", "forest", "stream"],
			"urban": ["streets", "walls", "markets", "districts", "guildhalls", "crowds"],
			"noble": ["comfort", "grand halls", "towers", "estate", "privilege", "etiquette"],
			"mystical": ["magic", "feywild", "temples", "library-towers", "divine", "ancient"],
			"tragic": ["burned", "orphaned", "plague", "war", "famine", "disaster"],
			"artisan": ["forges", "merchants", "docks", "workshops", "sparks", "creating"],
			"scholarly": ["libraries", "halls of learning", "scholars", "philosophy", "books"],
			"military": ["garrison", "warrior", "training yards", "discipline", "courage"],
			"exotic": ["carnival", "road-folk", "underground", "festival", "traveling"]
		};

		const keywords = themeKeywords[theme] || [];
		return originTemplates.filter(origin =>
			keywords.some(keyword => origin.toLowerCase().includes(keyword))
		);
	}

	/**
	 * Get origins appropriate for alignment
	 */
	_getOriginsByAlignment(originTemplates, moral) {
		if (moral === 'G') {
			// Good characters: avoid the most tragic/dark origins
			return originTemplates.filter(origin =>
				!origin.toLowerCase().includes('burned') &&
				!origin.toLowerCase().includes('betrayal') &&
				!origin.toLowerCase().includes('plague')
			);
		} else if (moral === 'E') {
			// Evil characters: can have darker origins
			return originTemplates.filter(origin =>
				origin.toLowerCase().includes('shadow') ||
				origin.toLowerCase().includes('underground') ||
				origin.toLowerCase().includes('betrayal') ||
				origin.toLowerCase().includes('power')
			);
		}

		// Neutral: any origin works
		return originTemplates;
	}

	/**
	 * Generate background personality section content
	 */
	async generateBackgroundPersonalitySection(finalName, tempBackground, tempAlignment, depth, pick) {
		// Build a concise, consistent backstory paragraph
		const origin = pick('Origin', 1)[0] || '';
		const turning = pick('TurningPoint', 1)[0] || '';
		const hook = pick('Hook', 1)[0] || '';
		const relation = pick('Relationship', 1)[0] || '';
		const place = pick('Place', 1)[0] || '';
		const contact = pick('Contact', 1)[0] || '';
		const bgVignette = this.getBackgroundStory(tempBackground.name);
		const backstoryParts = [];
		backstoryParts.push(`${finalName} was shaped life as a ${tempBackground.name.toLowerCase()} ${place ? ' in ' + place : ''}.`);
		if (origin) backstoryParts.push(origin);
		if (turning) backstoryParts.push(turning);
		if (bgVignette) backstoryParts.push(bgVignette);
		if (contact) backstoryParts.push(`A central figure: ${contact} has left a mark on their life.`);

		if (hook) backstoryParts.push(`A notable episode: ${hook}.`);
		const backstory = backstoryParts.join(' ');

		// Personality paragraph (compact)
		const personalities = pick('Personality', 3);
		const ideals = pick('Ideal', 1);
		const flaws = pick('Flaw', 1);
		const personality = [];
		if (personalities.length) personality.push(`They are known for ${personalities.join(', ')}.`);
		if (ideals.length) personality.push(`An inner creed: ${ideals[0]}.`);
		if (flaws.length) personality.push(`A weakness haunts them: ${flaws[0]}.`);
		const personalityPara = personality.join(' ');

		// Party-joining reason — strongly alignment-aware and tied to hooks/bonds
		const bonds = pick('Bond', 1);
		const obsession = pick('Obsession', 1)[0] || '';
		const alignToString = (a) => {
			if (!a) return 'Neutral';
			if (Array.isArray(a)) {
				const axis = a[0];
				const moral = a[1] || 'N';
				const axisMap = { 'L': 'Lawful', 'N': 'Neutral', 'C': 'Chaotic' };
				const moralMap = { 'G': 'Good', 'N': 'Neutral', 'E': 'Evil' };
				return `${axisMap[axis] || 'Neutral'} ${moralMap[moral] || ''}`.trim();
			}
			return String(a);
		};
		const aStr = alignToString(tempAlignment);

		// Alignment-based party joining reasons
		const reasonPools = {
			Good: [
				`They stand against suffering and serve the defenseless—joining those who share their dedication.`,
				`Their heart demands action when the innocent are threatened; companions multiply their capacity for aid.`,
				`Compassion draws them to those who share their burdens and multiply their ability to heal the world.`,
				`They believe good achieved together echoes longer than solitary heroics ever could.`,
				`Mercy and justice drive them forward—the party offers a path toward meaningful service.`
			],
			Evil: [
				`They pursue dark ambitions that require allies; the party offers useful cover or leverage.`,
				`Power is best seized with accomplices—they see potential tools and future assets in their companions.`,
				`Their goals require expendable allies or scapegoats; the party provides exactly that.`,
				`Self-interest binds them; the party advances their agenda while providing plausible deniability.`,
				`They excel at manipulation and exploitation—fellow adventurers are simply the next marks.`
			],
			Lawful: [
				`They honor duty, contracts, and oaths; joining serves a larger obligation or sworn purpose.`,
				`Order and organization appeal to them—the party represents structure they can support and shape.`,
				`They follow laws, traditions, or codes; shared missions align with principles they hold sacred.`,
				`Hierarchies and chains of command appeal; they see potential for disciplined cooperation.`,
				`Rules and systems create stability; they join to enforce or benefit from the group's charter.`
			],
			Chaotic: [
				`They hunger for change and the unpredictable—adventure, mischief, and chances to upend stale order.`,
				`Impulse and curiosity push them on; the party is simply the most interesting route to new horizons.`,
				`Escaping a past of control, they now ride with those who let them act freely and take risks.`,
				`They delight in shaking up the status quo; chaos is a tool to reveal truth or topple rot.`,
				`They chase rumor and sensation—where danger and novelty call, they will follow.`
			],
			Neutral: [
				`Pragmatic and adaptable, they join because it serves their goals—survival, profit, or learning.`,
				`They keep balance and avoid extremes; joining the group is a measured decision that benefits them.`,
				`A mixture of curiosity and convenience: the party offers resources or travel the character needs right now.`,
				`They pursue knowledge, trade, or a stable life—the party's opportunities fit those aims.`,
				`They prefer solving present problems and will aid others when it aligns with practical needs.`
			],
			// Combo-specific pools (finer-grained flavor)
			"Lawful Good": [
				`A paragon of duty and compassion, they travel to enforce mercy and uphold sacred oaths.`,
				`They lead by example—restoring order and setting right what regulations have bent under greed.`,
				`Sent forth by a temple or guild, they act to protect the vulnerable and bring calm to shaken places.`
			],
			"Neutral Good": [
				`They do what is right without dogma—help where needed and leave formalities to others.`,
				`Driven by compassion more than creed, they aid those in need and seek practical outcomes.`,
				`They carry quiet favors and debts; joining the party repays kindness or furthers relief efforts.`
			],
			"Chaotic Good": [
				`They break unjust laws to free the oppressed, using unpredictability as their ally.`,
				`A rebel at heart, they seek allies who will act boldly and refuse to be mired in red tape.`,
				`They pursue idealistic change—overthrowing corrupt rulers or starting revolutions that heal communities.`
			],
			"Lawful Neutral": [
				`They serve institutions, contracts, or abstract principles with unwavering dedication.`,
				`Order itself is their goal; they ally with those who respect organization and hierarchical thinking.`,
				`They enforce agreements and treaties—the party becomes part of their broader systemic mission.`
			],
			"Chaotic Neutral": [
				`Freedom from constraints drives them; they partner with others who reject conventional limits.`,
				`They live by instinct and opportunity—the party offers excitement and unpredictable reward.`,
				`Independence guides them, but even rebels sometimes need the strength that numbers provide.`
			],
			"True Neutral": [
				`Balance guides their decisions; they seek moderation and oppose forces that tip toward extremes.`,
				`They adapt to circumstances—joining the party fits their current needs and avoids larger conflicts.`,
				`Neither idealistic nor ruthless, they value practical solutions to immediate problems.`
			],
			"Lawful Evil": [
				`They pursue dark goals through systematic, methodical means—the party provides organized strength.`,
				`Control and dominance drive them; alliances serve longer-term strategies for gaining power.`,
				`They honor twisted codes or corrupt hierarchies—companionship advances those twisted aims.`
			],
			"Neutral Evil": [
				`Selfish and practical, they pursue personal gain with little concern for others.`,
				`They make deals that benefit them and betray when profitable; the party is one such expedient.`,
				`They prefer subtle gains—assets, contact networks, or secrets that increase their power.`
			],
			"Chaotic Evil": [
				`They revel in anarchy and terror; the party is a means to sow chaos or feed a destructive whim.`,
				`Violence and upheaval appeal; they ally with those who amplify their freedom to act without restraint.`,
				`They are driven by wanton ambition or bloodlust—companions are temporary tools for a dark agenda.`
			]
		};

		let pool = [];
		// If we have a two-word alignment (e.g., "Lawful Good"), prefer combo-specific pool first
		if (aStr.indexOf(' ') > -1 && reasonPools[aStr]) pool = pool.concat(reasonPools[aStr]);
		// Always include axis-level flavor so combos remain varied
		if (aStr.includes('Good')) pool = pool.concat(reasonPools.Good);
		if (aStr.includes('Evil')) pool = pool.concat(reasonPools.Evil);
		if (aStr.includes('Lawful')) pool = pool.concat(reasonPools.Lawful);
		if (aStr.includes('Chaotic')) pool = pool.concat(reasonPools.Chaotic);
		if (!pool.length) pool = pool.concat(reasonPools.Neutral);

		const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];
		let joinReason = choose(pool);
		// 20% chance to compound with a second, different reason for extra flavor
		if (Math.random() < 0.2) {
			let other = choose(pool);
			if (other !== joinReason) joinReason = `${joinReason} ${other}`;
		}
		// Tie to specific hooks or bonds if present
		const tieParts = [];
		if (bonds.length) tieParts.push(`A vow to ${bonds[0]} pulls them.`);
		if (relation) tieParts.push(`A connection to ${relation} complicates their path.`);
		if (contact) tieParts.push(`${contact} factors into their motives.`);
		if (obsession) tieParts.push(`An obsession — ${obsession} — colors their choices.`);
		if (hook) tieParts.push(`Rumors of ${hook} first drew them to travel.`);
		const joinPara = [joinReason].concat(tieParts).join(' ');

		// Return a concise set: backstory, personality, join reason
		return [backstory, personalityPara || this.getPersonalityTrait(), joinPara];
	}

	/**
	 * Extract personality traits from background JSON data
	 */
	async extractBackgroundPersonalityTraits(background) {
		try {
			// Load the full background data to get personality trait tables
			const response = await fetch('data/backgrounds.json');
			const backgroundData = await response.json();
			const backgrounds = backgroundData.background || [];

			// Find the full background data for this background
			const fullBackground = backgrounds.find(bg => bg.name === background.name && bg.source === background.source);
			if (!fullBackground || !fullBackground.entries) {
				return null;
			}

			// Look for personality trait tables in the background entries
			const findPersonalityTraits = (entries) => {
				for (const entry of entries) {
					if (entry.type === 'table' && entry.caption &&
						entry.caption.toLowerCase().includes('personality trait')) {
						// Extract traits from table rows (skip header row)
						return entry.rows.map(row => row[1]).filter(trait => trait && typeof trait === 'string');
					}
					// Recursively search in nested entries
					if (entry.entries && Array.isArray(entry.entries)) {
						const found = findPersonalityTraits(entry.entries);
						if (found) return found;
					}
				}
				return null;
			};

			return findPersonalityTraits(fullBackground.entries);
		} catch (error) {
			console.warn('Could not load personality traits for background:', background.name, error);
			return null;
		}
	}

	async generateCharacterDepth(background, race, classes, alignment = null) {
		// Return a flat array of labeled depth strings (e.g., 'Personality: ...') for rendering
		const entries = [];

		// Try to get authentic personality traits from background JSON data
		const authenticTraits = await this.extractBackgroundPersonalityTraits(background);

		// Expanded background-based personality traits (fallback for backgrounds without JSON trait tables)
		const backgroundTraits = {
			"Acolyte": [
				"I idolize a particular hero of my faith and quote their teachings constantly.",
				"I can find common ground between the fiercest enemies through shared faith.",
				"I've memorized countless prayers and recite them in times of stress.",
				"I believe that suffering is a test of faith that must be endured.",
				"I see omens and divine signs everywhere I look.",
				"I'm haunted by visions that I believe are prophetic messages."
			],
			"Criminal": [
				"I always have a plan for what to do when things go wrong.",
				"I am incredibly slow to trust, but fiercely loyal once I do.",
				"I speak in code and cant, making references only other criminals understand.",
				"I can't resist taking something that isn't nailed down when no one's looking.",
				"I judge people by how useful they could be in a heist or con.",
				"I have a tell that reveals when I'm lying, but I don't know what it is."
			],
			"Folk Hero": [
				"I judge people by their actions, not their words or station.",
				"I have a family somewhere, but I have no idea where they are now.",
				"I stand up for the common folk against tyranny, no matter the cost.",
				"I'm always ready with a story about my heroic deeds to inspire others.",
				"I believe that everyone deserves a second chance at redemption.",
				"I can't resist helping someone who reminds me of my younger self."
			],
			"Noble": [
				"My eloquent flattery makes everyone I talk to feel like royalty.",
				"I hide a truly scandalous secret that would ruin my family name.",
				"I expect the finest accommodations wherever I go and get cranky without them.",
				"I was raised to believe I'm destined for greatness beyond my birthright.",
				"I unconsciously mimic the speech patterns of whoever I'm talking to.",
				"I collect trinkets and tokens from every place I visit to remember my travels."
			],
			"Sage": [
				"I am horribly awkward in social situations but brilliant in academic ones.",
				"I am convinced that I'm destined to discover something that will change the world.",
				"I quote obscure historical texts in normal conversation without realizing it.",
				"I become obsessively focused on puzzles and mysteries until I solve them.",
				"I believe that knowledge should be shared freely, regardless of consequences.",
				"I have theories about everything and love debating them with anyone who'll listen."
			],
			"Soldier": [
				"I can stare down a hell hound without flinching, but children make me nervous.",
				"I made a terrible mistake in battle that cost lives, and it haunts my dreams.",
				"I maintain my equipment with obsessive care, even in the safest circumstances.",
				"I use military jargon and tactical thinking in everyday situations.",
				"I have a lucky charm that I believe kept me alive through countless battles.",
				"I sleep lightly and wake at the slightest sound, always ready for danger."
			]
		};

		// Expanded background ideals
		const backgroundIdeals = {
			"Acolyte": [
				"Faith. I trust that my deity will guide my actions through any darkness.",
				"Tradition. The sacred texts and rituals must be preserved unchanged.",
				"Charity. I am called to ease suffering wherever I find it.",
				"Truth. Sacred knowledge must not be corrupted by mortal interpretation."
			],
			"Criminal": [
				"Freedom. Chains and rules are meant to be broken by those clever enough.",
				"Honor. Even among thieves, there must be codes we live by.",
				"Redemption. Everyone deserves a chance to atone for their past mistakes.",
				"Survival. In a harsh world, you do whatever it takes to stay alive."
			],
			"Folk Hero": [
				"Destiny. Nothing and no one can steer me away from my higher calling.",
				"Justice. The powerful should not prey upon the weak without consequence.",
				"Hope. I must be a beacon of inspiration for those who have given up.",
				"Legacy. My deeds will outlive me and inspire future generations."
			],
			"Noble": [
				"Responsibility. It is my duty to use my privilege to help those beneath me.",
				"Power. I am destined to rule, and others are destined to follow.",
				"Excellence. I must be the best at everything I attempt to maintain my reputation.",
				"Tradition. The old ways have worked for centuries and must be preserved."
			],
			"Sage": [
				"Knowledge. The path to power and enlightenment runs through understanding.",
				"Truth. Lies and deception corrupt the purity of knowledge itself.",
				"Discovery. Every mystery solved brings us closer to ultimate understanding.",
				"Teaching. Knowledge hoarded is knowledge wasted - it must be shared."
			],
			"Soldier": [
				"Greater Good. Our lot is to lay down our lives in defense of others.",
				"Duty. Orders must be followed, even when they lead to personal sacrifice.",
				"Brotherhood. My comrades-in-arms are closer than family to me.",
				"Victory. In war, there are no second places - only winners and casualties."
			]
		};

		// Universal personality traits (for variety) - Fantasy Enhanced
		const universalTraits = [
			"I have a habit of collecting small, seemingly worthless objects that I'm convinced are actually magical.",
			"I speak to animals, plants, and inanimate objects as if they can understand complex philosophical discussions.",
			"I keep a detailed journal of everyone I meet, rating their potential as allies, enemies, or magical beings in disguise.",
			"I'm convinced that certain numbers, colors, or celestial alignments control the fate of the universe.",
			"I unconsciously count things in ancient draconic numerals, which confuses most people.",
			"I have strong opinions about food and believe certain dishes can predict the future or ward off curses.",
			"I talk to myself constantly, but claim I'm actually consulting with my 'invisible advisor' from another plane.",
			"I always know exactly how much money I have because I believe coins whisper their values to me.",
			"I make up elaborate backstories for strangers, often involving secret royal bloodlines or hidden magical powers.",
			"I perform a complex ritual involving moon phases and herb burning before sleeping anywhere new.",
			"I'm fascinated by locks because I believe each one guards a portal to another dimension.",
			"I remember faces perfectly because I think everyone might be a shapeshifter, doppelganger, or reincarnated soul.",
			"I can instantly sense whether someone has been touched by magic, cursed, or blessed by the gods.",
			"I have an irrational fear of mirrors because I once saw something that wasn't my reflection.",
			"I collect stories and rumors because I believe they're prophecies waiting to unfold.",
			"I never sit with my back to a door because assassins from my past life might still be hunting me.",
			"I'm convinced that certain weather patterns are messages from my deceased grandmother's spirit.",
			"I taste everything before eating it, claiming I can detect poison, curses, or transmutation magic.",
			"I believe that shoes hold the memories of everywhere they've been, so I treat them with reverence.",
			"I'm obsessed with star patterns and insist they reveal the true names of everyone I meet.",
			"I collect different types of string and rope, convinced that the perfect knot can solve any problem.",
			"I speak in rhymes when nervous because I think it confuses evil spirits trying to curse me.",
			"I'm convinced that my shadow is actually my twin from an alternate reality trying to communicate.",
			"I believe that certain foods can only be eaten on specific days, or terrible luck will follow.",
			"I insist on learning at least one word in every language I encounter because 'words have power.'",
			"I'm fascinated by door hinges and believe they're actually tiny portals between worlds.",
			"I collect pressed flowers and leaves, claiming each one holds the essence of a different fae creature.",
			"I'm convinced that all cats are actually familiars reporting to a secret magical council.",
			"I believe that certain colors should never be worn together as they create 'chaos resonance.'",
			"I taste rainwater from different regions, convinced each drop carries messages from cloud spirits."
		];

		// Get background traits - prefer authentic traits from JSON data, fallback to hardcoded
		const bgTraits = authenticTraits || backgroundTraits[background.name] || [
			"My past shaped me in ways I'm still discovering.",
			"I carry the values of my upbringing even as I forge a new path.",
			"Experience has taught me to be cautious but not cynical."
		];

		// Add 1-3 background traits
		const numBgTraits = 1 + Math.floor(Math.random() * 3); // 1-3
		for (let i = 0; i < numBgTraits; i++) {
			const trait = bgTraits[Math.floor(Math.random() * bgTraits.length)];
			entries.push(`Personality: ${trait}`);
		}

		// Add universal traits
		const numUniversalTraits = 1 + Math.floor(Math.random() * 3); // 1-3
		const addedUniversal = new Set();
		for (let i = 0; i < numUniversalTraits; i++) {
			const trait = universalTraits[Math.floor(Math.random() * universalTraits.length)];
			if (!addedUniversal.has(trait)) {
				entries.push(`Personality: ${trait}`);
				addedUniversal.add(trait);
			}
		}

		// Get background ideals
		const bgIdeals = backgroundIdeals[background.name] || [
			"Purpose. I seek to understand my place in this vast world.",
			"Growth. Every challenge is an opportunity to become stronger.",
			"Balance. Extremes in any direction lead to suffering."
		];
	const chosenIdeal = bgIdeals[Math.floor(Math.random() * bgIdeals.length)];
	entries.push(`Ideal: ${chosenIdeal}`);

		// Build a cinematic origin blurb and a dramatic turning point
		// Generate an alignment-influenced small-world seed: compose place/contact so same alignment varies
		const normalizeAlign = (a) => {
			if (!a) return 'N';
			if (Array.isArray(a)) return a.join('');
			return String(a);
		};
		const aKey = normalizeAlign(alignment);

		// Prefix/suffix pools biased by alignment axis/moral
		const axis = (aKey[0] || 'N');
		const moral = (aKey[1] || 'N');

		const placeCores = [
			"hollow", "ford", "haven", "cross", "march", "hold", "barrow", "mire", "glen", "green"
		];
		const placePrefixes = {
			'L': ["High", "Iron", "Grey", "Stone", "Crown"],
			'N': ["Wind", "Ash", "Everg", "Dun", "Raven", 'Outer '],
			'C': ["Wild", "Crimson", "Feral", "Storm", "Briar"]
		};
		const placeSuffixes = {
			'G': ["ford", "stead", "port", "bridge", "vale", ' Castle'],
			'N': ["marsh", "well", "field", "grove", "wood"],
			'E': ["scar", "fen", "barrow", "reach"]
		};

		const pickFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

		const prefixPool = placePrefixes[axis] || placePrefixes['N'];
		const suffixPool = placeSuffixes[moral] || placeSuffixes['N'];
		const chosenPlace = `${pickFrom(prefixPool)}${pickFrom(placeCores)}${pickFrom(suffixPool)}`;

		// Contact/name pools vary by moral leaning to avoid repeats across same-alignment characters
		const namesByMoral = {
			'G': ["Alden", "Maera", "Edrin", "Serah", "Ithar"],
			'N': ["Corin", "Lys", "Borin", "Mira", "Joren"],
			'E': ["Sylas", "Riona", "Thesse", "Varr", "Neka"]
		};
		const chosenPerson = pickFrom(namesByMoral[moral] || namesByMoral['N']);

		entries.push(`Place: ${chosenPlace}`);
		entries.push(`Contact: ${chosenPerson}`);

		// Origin uses chosenPlace with much more variety and depth
		const originTemplates = [
			// Rural/wilderness upbringing
			`They learned early that survival meant reading the wind's warnings and the forest's whispers.`,
			`Childhood on dusty roads taught them to expect strangers and seize opportunity when it appeared.`,
			`Seasons marked their youth; hard work and long days carved character into bone.`,
			`Raised among pastoral rhythms, they knew every stream, hidden path, and the stories of three generations.`,
			`They grew up where nature's beauty and cruelty were often indistinguishable.`,

			// Urban/civilized upbringing
			`Crowded streets taught them lessons in survival that no academy could match.`,
			`They grew up amid the clash of commerce, politics, and a thousand different dreams.`,
			`Markets were their playground, where they learned to read faces, voices, and the weight of coin.`,
			`Growing up in the shadow districts taught them that reputation was currency and silence was sometimes golden.`,
			`Guildhalls shaped their youth, where tradition and innovation wrestled for the future's direction.`,

			// Noble/privileged upbringing
			`Born to comfort, they learned that privilege was both a gift and a burden that followed you everywhere.`,
			`Grand halls taught them that etiquette is armor and politics are played with smiles and daggers.`,
			`Books and tutors filled their childhood, yet the heart's questions remained unanswered.`,
			`Estate life taught them that power comes with expectations that can crush the soul.`,

			// Mystical/magical upbringing
			`They grew up feeling an old magic's pulse in their bones, like a second heartbeat.`,
			`A childhood touched by fey influence made reality feel negotiable and dreams weighty.`,
			`Temples filled their youth with incense, prayer, and the heavy attentions of the divine.`,
			`Library-towers taught them that knowledge can be more dangerous than steel.`,

			// Tragic/difficult upbringing
			`Their home burned when they were young, teaching them that safety is an illusion and home is what you carry within.`,
			`Orphaned during plague years, they learned that kindness from strangers could mean the difference between life and death.`,
			`War reached them in youth, showing how quickly civilization's veneer can crack and fall away.`,
			`Famine taught them to value every crust, every kindness, and every tomorrow not promised.`,

			// Artisan/trade upbringing
			`The forges sang childhood lullabies, where sparks flew like stars and pride was measured in perfect joints and keen edges.`,
			`Raised among merchants, they learned that everything had a price, but not everything should be for sale.`,
			`Docks and tales of distant shores taught them that horizons were meant to be chased.`,
			`Workshops showed them that creating something lasting is its own form of immortality.`,

			// Scholarly/learned upbringing
			`Ancient libraries became a second home where dusty tomes held more adventure than the world outside.`,
			`Halls of learning taught them that questions are often more valuable than answers.`,
			`Scholars filled their youth with philosophy, debate, and the dangerous idea that the world could be better.`,

			// Military/martial upbringing
			`Garrisons taught discipline, honor, and the knowledge that strength without wisdom is merely violence.`,
			`A warrior tradition showed them that true courage is action despite fear.`,
			`Training yards were childhood playgrounds where wooden swords taught lessons steel later tested.`,

			// Exotic/unusual upbringing
			`They came of age in traveling carnivals, where illusion and reality danced under painted canvas.`,
			`Raised by road-folk, home was wherever the wagon stopped and family whoever shared the fire.`,
			`Underground life made sunlight a rumor and survival a matter of knowing which shadows to trust.`,
			`Born during great festivals, they learned that celebration and sorrow are twin faces of the same truth.`
		];

		// Select origin based on background for better narrative consistency
		const origin = this._selectThematicOrigin(originTemplates, background, alignment);
		entries.push(`Origin: ${origin}`);

		// Turning point references chosenPerson or chosenPlace for consistency
		let turningPoint = '';
		if (Math.random() < 0.9) {
			const turningPointTemplates = [
				// Person-centered turning points
				`${chosenPerson} once saved them from a disaster that left scars and a promise to repay.`,
				`A chance meeting with ${chosenPerson} opened their eyes to possibilities they'd never imagined.`,
				`${chosenPerson}'s unexpected betrayal shattered their trust but taught them to rely on themselves.`,
				`When ${chosenPerson} died, they inherited not just grief but a mission that would define their path.`,
				`${chosenPerson}'s words of wisdom during their darkest hour became a guiding star they still follow.`,
				`A heated argument with ${chosenPerson} forced them to question everything they thought they believed.`,
				`${chosenPerson}'s act of selfless courage inspired them to seek something greater than comfort or safety.`,
				`The day ${chosenPerson} asked for their help was the day they discovered they were capable of more than they knew.`,

				// Place-centered turning points
				`A single night at ${chosenPlace} — a riot, a betrayal, a fire — broke the life they'd known and set them on a different road.`,
				`The day they decided to leave ${chosenPlace} forever was the day they truly began to live.`,
				`A hidden secret discovered in ${chosenPlace} changed not just their life, but their understanding of the world itself.`,
				`The festival at ${chosenPlace} should have been a celebration, but instead became a revelation that everything they knew was wrong.`,
				`When strangers arrived at ${chosenPlace} with news of the wider world, wanderlust struck like lightning.`,
				`The ancient ruins near ${chosenPlace} called to them one night, showing visions that demanded action.`,
				`A terrible storm that devastated ${chosenPlace} revealed both the fragility of civilization and their own inner strength.`,
				`The traveling merchant who stopped at ${chosenPlace} carried more than goods — they carried a destiny that would not be denied.`,

				// Internal/philosophical turning points
				`A moment of perfect clarity during meditation at ${chosenPlace} showed them their true purpose.`,
				`The book they found in ${chosenPlace}'s old library contained ideas that set their mind ablaze with possibility.`,
				`A prophetic dream while staying at ${chosenPlace} revealed a future they could either embrace or fight to change.`,
				`The simple act of showing mercy to an enemy near ${chosenPlace} taught them more about strength than years of training.`,
				`A conversation with ${chosenPerson} about the nature of justice planted seeds that would eventually reshape their entire worldview.`,

				// Mystical/supernatural turning points
				`The night the dead walked near ${chosenPlace}, they learned that death was not the ending they'd been taught.`,
				`When magic first manifested around them in ${chosenPlace}, reality became both more wonderful and more dangerous.`,
				`A divine vision experienced at ${chosenPlace} left them forever changed, marked by forces beyond mortal understanding.`,
				`The demon that appeared to them near ${chosenPlace} offered power, but their refusal taught them more about their own character than acceptance ever could.`,
				`During the eclipse visible from ${chosenPlace}, they felt something ancient stir within them — a calling that could not be ignored.`,

				// Achievement/discovery turning points
				`Their first real victory in ${chosenPlace} taught them that success was hollow without someone to share it with.`,
				`The failure that humiliated them before all of ${chosenPlace} became the foundation stone of their true strength.`,
				`Creating something beautiful for the first time in ${chosenPlace} showed them that legacy came from what you built, not what you conquered.`,
				`The test they failed in ${chosenPlace} revealed gifts they never knew they possessed.`,
				`Solving an ancient puzzle left behind in ${chosenPlace} unlocked not just secrets, but a passion for uncovering truth.`
			];

			turningPoint = pickFrom(turningPointTemplates);
			entries.push(`TurningPoint: ${turningPoint}`);
		}

		// Race-influenced traits and quirks
		const raceTraits = {
			"Human": [
				"I strive to prove that humans can achieve anything other races can.",
				"I'm fascinated by other cultures and try to learn their customs.",
				"I believe that human adaptability is our greatest strength.",
				"I work harder than others because I know my time is limited."
			],
			"Elf": [
				"I find beauty in the smallest details that others overlook.",
				"I have trouble relating to the urgency that shorter-lived races feel.",
				"I remember things from decades ago as if they happened yesterday.",
				"I prefer the company of books and nature to most people."
			],
			"Dwarf": [
				"I judge the quality of people by the quality of their craftsmanship.",
				"I have strong opinions about proper ale, stonework, and beard grooming.",
				"Family honor is worth more than gold or gems to me.",
				"I keep grudges the way others keep diaries - detailed and long-lasting."
			],
			"Halfling": [
				"A good meal and warm hearth can solve most of life's problems.",
				"I make friends easily but miss my homeland constantly.",
				"I believe luck is just as important as skill in any endeavor.",
				"I collect recipes and cooking techniques from every culture I encounter."
			],
			"Dragonborn": [
				"I carry the pride and dignity of dragons in everything I do.",
				"I have strong opinions about honor that others might find old-fashioned.",
				"I'm fascinated by draconic lore and history.",
				"I feel a deep connection to my draconic ancestry that influences my decisions."
			],
			"Gnome": [
				"Every mechanism, spell, or mystery demands investigation.",
				"I have at least three ongoing projects that seem unrelated to others.",
				"I find it hard to take threats seriously when there are puzzles to solve.",
				"I leave small improvements wherever I go - fixed locks, organized shelves, etc."
			],
			"Half-Elf": [
				"I often feel caught between worlds but have learned to make my own path.",
				"I'm unusually good at reading people and social situations.",
				"I collect stories about others who've found their place in the world.",
				"I sometimes feel like I'm performing a role rather than being myself."
			],
			"Half-Orc": [
				"I work twice as hard to overcome others' prejudices and expectations.",
				"I have a gentle side that surprises people who judge me by appearance.",
				"I'm protective of others who face discrimination or bullying.",
				"I've learned to channel my anger into productive pursuits."
			],
			"Tiefling": [
				"I've learned to be self-reliant because others often fear what they don't understand.",
				"I use humor and charm to disarm people's preconceptions about me.",
				"I'm fascinated by the nature of good and evil, choices and consequences.",
				"I keep detailed mental notes about who treats me fairly versus who doesn't."
			]
		};

		// Add racial trait
		const racialOptions = raceTraits[race.name] || [
			"My heritage influences how I see the world in subtle ways.",
			"I carry the strengths and struggles of my people with pride."
		];
		entries.push(`Personality: ${racialOptions[Math.floor(Math.random() * racialOptions.length)]}`);

		// Class-influenced bonds and motivations
		const classBonds = {
			"Fighter": [
				"I fight to protect those who cannot protect themselves.",
				"My weapons are extensions of my will and identity.",
				"I'm searching for a worthy opponent who can truly test my skills.",
				"I carry the memory of everyone I've failed to save."
			],
			"Wizard": [
				"My spellbook is my most treasured possession and greatest achievement.",
				"I'm seeking to unlock a particular magical mystery that obsesses me.",
				"My magical mentor's teachings guide me, even though they're gone.",
				"I believe magic is the key to solving the world's greatest problems."
			],
			"Rogue": [
				"I owe my life and skills to a mentor who saw potential in me.",
				"I'm working to uncover the truth behind a conspiracy that affected me personally.",
				"My reputation in certain circles is worth more than gold.",
				"I have a code of ethics that might surprise people who judge me by my methods."
			],
			"Cleric": [
				"My faith is the cornerstone of everything I am and do.",
				"I'm on a divine mission that I must complete, no matter the cost.",
				"My deity speaks to me through signs and dreams that guide my path.",
				"I must prove worthy of the divine power that flows through me."
			],
			"Ranger": [
				"The wilderness is my true home, and I'm its sworn protector.",
				"I'm tracking something or someone important across vast distances.",
				"My animal companion understands me better than most people do.",
				"I know secrets about the natural world that could change everything."
			],
			"Paladin": [
				"My oath defines who I am and gives meaning to every action.",
				"I must be a living example of the ideals I've sworn to uphold.",
				"I'm seeking to right a great wrong that haunts me.",
				"My divine purpose is clear, even when the path is not."
			],
			"Barbarian": [
				"My tribe and its traditions are the foundation of my identity.",
				"I'm on a quest to prove myself worthy of my ancestors' legacy.",
				"The rage within me is both my greatest strength and my biggest fear.",
				"I must find balance between my wild nature and civilized expectations."
			],
			"Bard": [
				"I seek to preserve the stories and songs that others have forgotten.",
				"My art is how I make sense of the world and share truth with others.",
				"I'm collecting material for the greatest work of my career.",
				"Every person I meet has a story worth telling, if I listen carefully."
			],
			"Druid": [
				"The natural world must be protected from those who would exploit it.",
				"I'm investigating an unnatural threat to the balance of nature.",
				"My connection to nature gives me perspective on mortal concerns.",
				"I must learn to bridge the gap between civilization and wilderness."
			],
			"Monk": [
				"My monastery's teachings guide me toward inner peace and understanding.",
				"I'm on a pilgrimage to test my discipline and spiritual growth.",
				"I seek to master not just martial arts, but the balance of body and soul.",
				"I must prove that my philosophy can withstand the challenges of the world."
			],
			"Sorcerer": [
				"I must learn to control the chaotic power that flows through my blood.",
				"My magical heritage connects me to forces beyond mortal understanding.",
				"I'm searching for others who share my unique magical nature.",
				"I fear what I might become if I lose control of my abilities."
			],
			"Warlock": [
				"My pact binds me to a destiny I'm still learning to understand.",
				"I must fulfill the terms of my agreement, willingly or not.",
				"I'm seeking a way to gain power without losing my soul.",
				"My patron's influence grows stronger, and I'm not sure I can resist it."
			]
		};

		// Add class bonds (prioritize first class as strongest bond)
		classes.forEach(cls => {
			const classOptions = classBonds[cls.name] || [
				`My training as a ${cls.name.toLowerCase()} has shaped my worldview.`,
				`I carry the responsibility of my class with honor and determination.`
			];
			const chosen = classOptions[Math.floor(Math.random() * classOptions.length)];
			entries.push(`Bond: ${chosen}`);
		});

		// Expanded universal flaws
		const universalFlaws = [
			"I can't resist a pretty face, even when I know it'll lead to trouble.",
			"My greed often overrides my better judgment.",
			"I can't keep a secret to save my life, literally.",
			"I have a weakness for gambling, drinking, or other vices.",
			"I speak without thinking and regularly put my foot in my mouth.",
			"I'm convinced that no one could ever fool me, making me an easy mark.",
			"I'm too curious for my own good and poke my nose where it doesn't belong.",
			"I have a crippling phobia that can paralyze me at the worst times.",
			"I'm terribly vain about my appearance or abilities.",
			"I can't resist showing off, even when it's dangerous or inappropriate.",
			"I hold grudges longer than most people think is reasonable.",
			"I'm painfully honest, even when lies would be kinder or safer.",
			"I trust too easily and get taken advantage of regularly.",
			"I'm haunted by nightmares or memories that affect my rest.",
			"I have a compulsion to correct others' mistakes or misstatements.",
			"I'm jealous of others' success and can't hide it well.",
			"I overthink every decision until I miss my opportunity to act.",
			"I'm stubborn to a fault and rarely admit when I'm wrong."
		];

		// Add 1-3 flaws
		const numFlaws = 1 + Math.floor(Math.random() * 3);
		for (let i = 0; i < numFlaws; i++) {
			const flaw = universalFlaws[Math.floor(Math.random() * universalFlaws.length)];
			entries.push(`Flaw: ${flaw}`);
		}

		// Fantasy Enhanced Mannerisms and Quirks
		const mannerismList = [
			"Taps fingers in complex patterns that supposedly channel arcane energy while thinking",
			"Always sits facing the door because 'you never know when a portal might open'",
			"Unconsciously touches a particular piece of jewelry while muttering protective wards",
			"Makes small talk with their weapons, thanking them for their service after battles",
			"Arranges their belongings in specific patterns that 'maintain cosmic balance'",
			"Quotes ancient proverbs in dead languages that they claim their ancestors whisper to them",
			"Changes their voice to match the last person they spoke to, claiming it helps them 'understand souls'",
			"Always knows exactly what time it is because they can hear the heartbeat of the world",
			"Compulsively organizes things by perceived magical properties rather than practical use",
			"Whistles or hums melodies they claim were taught to them by wind spirits when nervous",
			"Draws tiny protective symbols in the dirt wherever they sit or sleep",
			"Bows formally to every tree they pass, apologizing for disturbing the dryads",
			"Collects a small stone from every place they visit, building a 'memory cairn'",
			"Insists on tasting the air in new locations to 'detect magical residue'",
			"Braids small trinkets into their hair or beard as offerings to their ancestors",
			"Makes elaborate hand gestures when speaking, claiming it amplifies their words' power",
			"Sniffs people when first meeting them to determine their 'spiritual aura'",
			"Leaves small gifts (coins, flowers, food) at doorways to appease household spirits",
			"Counts their steps in groups of seven because it's a 'magically significant number'",
			"Spins around three times before entering any building to 'confuse malevolent spirits'",
			"Always eats dessert first because 'life is uncertain and sweetness should be savored'",
			"Talks to their reflection in still water, claiming it's their 'water-self' from another realm",
			"Collects interesting rocks and claims each one has a unique 'earth-song'",
			"Draws constellations in the air while stargazing, mapping invisible ley lines",
			"Sleeps with one foot outside their blankets because their 'dream-spirit needs an escape route'",
			"Names every horse, mule, or mount they encounter, believing names give animals power",
			"Builds tiny shrines from twigs and stones at campsites to honor local nature spirits",
			"Apologizes to their food before eating it, thanking the plant or animal for its sacrifice",
			"Keeps a different colored piece of cloth for each day of the week to 'align with cosmic forces'",
			"Whispers secrets to flowers, believing they'll carry messages to the fae courts"
		];

		const man1 = mannerismList[Math.floor(Math.random() * mannerismList.length)];
		entries.push(`Mannerism: ${man1}`);
		if (Math.random() < 0.5) {
			const man2 = mannerismList[Math.floor(Math.random() * mannerismList.length)];
			if (man2 !== man1) entries.push(`Mannerism: ${man2}`);
		}

		// Add amusing obsessions and habits
		const obsessions = [
			"Collects different types of buttons and sews them onto their clothing in meaningful patterns",
			"Believes that every tavern has a 'perfect seat' and spends time finding it",
			"Keeps a detailed log of every insult they've ever received and their planned comebacks",
			"Obsessed with finding the 'ultimate' recipe for their favorite dish",
			"Collects signatures from every person they meet, claiming it captures part of their soul",
			"Believes they can predict the weather by observing how people's eyebrows move",
			"Keeps detailed notes on the sleeping patterns of their companions",
			"Obsessed with symmetry and gets anxious when things are unbalanced",
			"Collects tears in tiny vials (their own and others') for different emotional states",
			"Believes they can determine someone's deepest fear by watching how they eat soup",
			"Keeps a record of every door they've walked through and rates them by 'mystical significance'",
			"Obsessed with finding their 'cosmic twin' - someone who shares their exact birthday and birthmark",
			"Collects dust from different regions, convinced it holds the essence of that place",
			"Believes they can communicate with the spirits of broken objects by fixing them",
			"Keeps detailed genealogies of every family they meet, looking for patterns in bloodlines"
		];

		// Add mysterious secrets and backstory elements
		const secrets = [
			"They once spoke to a dying dragon who whispered the location of their lost hoard",
			"They have a recurring dream about a tower that doesn't exist in any known realm",
			"They were present at a historical event but don't remember why or how",
			"They own an object that occasionally becomes warm for no apparent reason",
			"They can sometimes understand languages they've never studied when the moon is full",
			"They have a birthmark that perfectly matches a constellation that appears only once a century",
			"They occasionally find messages written in their own handwriting that they don't remember writing",
			"They once met their future self in a mysterious encounter they can't fully recall",
			"They have prophetic dreams about people they haven't met yet",
			"They were born during a magical phenomenon that the locals still discuss in whispers",
			"They carry a key that doesn't fit any lock they've found, but they know it's important",
			"They can sometimes see magical auras around certain people, but only in candlelight",
			"They were raised by beings who claimed to be their parents but looked nothing like them",
			"They have memories of a life that history books say never existed",
			"They sometimes speak in their sleep using the voice of someone else entirely"
		];

		// Add character relationships and connections
		const relationships = [
			"They owe a life debt to a mysterious figure who saved them from certain death",
			"They have a rival from their youth who always seems to appear at the worst possible moments",
			"They're secretly in love with someone they can never have due to social circumstances",
			"They have a mentor who communicates only through cryptic riddles and symbolic gifts",
			"They're being followed by someone who claims to be their sibling from another timeline",
			"They have a pen pal in another plane of existence who sends letters through magical means",
			"They're searching for their childhood imaginary friend who they now believe was real",
			"They have a standing bet with a powerful fae about the outcome of their adventures",
			"They're secretly nobility but renounced their title for reasons they won't discuss",
			"They have a twin who lives a completely opposite life in another city",
			"They're part of a secret organization that meets only during lunar eclipses",
			"They have a nemesis who is identical to them in every way except for moral alignment",
			"They're engaged to be married to someone they've never actually met",
			"They have a patron deity who occasionally possesses stray animals to give them advice",
			"They're the reincarnation of someone famous, but they're the only one who knows it"
		];

		// Add supernatural quirks and abilities
		const supernaturalQuirks = [
			"Plants grow slightly faster when they're happy",
			"Their sneezes are always in groups of three and seem to predict minor events",
			"They can taste colors when they're extremely focused",
			"Their hair changes color slightly based on the weather",
			"They can sense when someone is lying, but only if they're holding something made of wood",
			"Animals are either immediately drawn to them or completely terrified - there's no middle ground",
			"They can smell magic, but it always smells like their least favorite food",
			"Their dreams sometimes leak into reality as tiny, harmless illusions",
			"They can hear music that no one else can hear when they're in natural settings",
			"Their reflection in mirrors occasionally lags a few seconds behind their actual movements",
			"They can communicate basic emotions to insects through humming",
			"Their shadow sometimes points in directions that don't match the light source",
			"They can taste the emotional history of any food they eat",
			"Their footprints occasionally glow for a few minutes after they walk away",
			"They can sense the age of any wooden object by touching it"
		];

		// Randomly add these elements
	const selectedObsession = Math.random() < 0.8 ? obsessions[Math.floor(Math.random() * obsessions.length)] : null;
	const selectedSecret = Math.random() < 0.85 ? secrets[Math.floor(Math.random() * secrets.length)] : null;
	const selectedRelationship = Math.random() < 0.75 ? relationships[Math.floor(Math.random() * relationships.length)] : null;
	const selectedSupernatural = Math.random() < 0.5 ? supernaturalQuirks[Math.floor(Math.random() * supernaturalQuirks.length)] : null;

	// temporary hooks list we'll push into entries below
	const hooks = [];

	if (selectedObsession) entries.push(`Obsession: ${selectedObsession}`);
	if (selectedSecret) entries.push(`Secret: ${selectedSecret}`);
	if (selectedRelationship) entries.push(`Relationship: ${selectedRelationship}`);
	if (selectedSupernatural) entries.push(`Supernatural: ${selectedSupernatural}`);

	// Add some hooks for plot or accomplishments
	hooks.push(`${name} once ${Math.random() < 0.5 ? 'saved' : 'defeated'} ${Math.random() < 0.5 ? 'a local lord' : 'a band of raiders'} in a night that songs still whisper about`);
	hooks.push(`${Math.random() < 0.6 ? 'recovered' : 'nearly lost'} an artifact tied to their family or a vanished cult`);
	if (Math.random() < 0.5) hooks.push(`${name} maintains uneasy dealings with a shadowy contact whispered about as 'The Broker'`);
	hooks.forEach(h => entries.push(`Hook: ${h}`));

		// Shuffle entries slightly to vary ordering
		for (let i = entries.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[entries[i], entries[j]] = [entries[j], entries[i]];
		}

		return entries;
	}


	generateRandomCurrency(level) {
		const baseGold = 50 + (level * 30) + Math.floor(Math.random() * 100);
		return {
			cp: Math.floor(Math.random() * 50),
			sp: Math.floor(Math.random() * 20),
			gp: baseGold,
			pp: level > 5 ? Math.floor(Math.random() * 10) : 0
		};
	}

	generateRandomEquipment(classes, level, abilityScores, race) {
		const equipment = new Set();

		// Core adventuring gear for all characters - using valid item names
		equipment.add("{@item Backpack|PHB}");
		equipment.add("{@item Bedroll|PHB}");
		equipment.add("{@item Mess Kit|PHB}");
		equipment.add("{@item Tinderbox|PHB}");
		equipment.add("{@item Torch|PHB}");
		equipment.add("{@item Rations (1 day)|PHB}");
		equipment.add("{@item Waterskin|PHB}");
		equipment.add("{@item Hempen Rope (50 feet)|PHB}");

		// Add class-specific starting equipment only from primary class
		if (classes.length > 0) {
			const primaryClass = classes[0];
			const classEquipment = this.getClassEquipment(primaryClass.name, primaryClass.level, abilityScores);
			classEquipment.forEach(item => equipment.add(item));
		}

		// Add racial equipment bonuses
		const racialEquipment = this.getRacialEquipment(race);
		racialEquipment.forEach(item => equipment.add(item));

		// Add level-appropriate magical items (only for higher levels)
		if (level >= 5) {
			const magicalItems = this.generateMagicalItems(classes, level, abilityScores);
			magicalItems.forEach(item => equipment.add(item));
		}

		// Add consumables and utility items based on level
		const consumables = this.generateConsumables(level);
		consumables.forEach(item => equipment.add(item));

		// Add adventuring tools based on character build
		const adventuringGear = this.generateAdventuringGear(classes, level);
		adventuringGear.forEach(item => equipment.add(item));

		return Array.from(equipment);
	}

	getClassEquipment(className, classLevel, abilityScores) {
		const equipment = [];
		const strMod = Math.floor((abilityScores.str - 10) / 2);
		const dexMod = Math.floor((abilityScores.dex - 10) / 2);

		switch (className) {
			case "Barbarian":
				equipment.push("{@item Greataxe|PHB}");
				equipment.push("{@item Handaxe|PHB}");
				equipment.push("{@item Javelin|PHB}");
				equipment.push("{@item Explorer's Pack|PHB}");
				break;

			case "Bard":
				equipment.push("{@item Leather Armor|PHB}");
				equipment.push(dexMod > strMod ? "{@item Rapier|PHB}" : "{@item Longsword|PHB}");
				equipment.push("{@item Dagger|PHB}");
				equipment.push("{@item Entertainer's Pack|PHB}");
				equipment.push("{@item Lute|PHB}");
				break;

			case "Cleric":
				equipment.push(classLevel >= 5 ? "{@item Chain Mail|PHB}" : "{@item Scale Mail|PHB}");
				equipment.push("{@item Shield|PHB}");
				equipment.push(strMod >= 0 ? "{@item Warhammer|PHB}" : "{@item Mace|PHB}");
				equipment.push("{@item Light Crossbow|PHB}");
				equipment.push("{@item Crossbow Bolt|PHB} (20)");
				equipment.push("{@item Priest's Pack|PHB}");
				equipment.push("{@item Holy Symbol|PHB}");
				equipment.push("{@item Book|PHB}");
				equipment.push("{@item Holy Water (flask)|PHB}");
				break;

			case "Druid":
				equipment.push("{@item Leather Armor|phb}");
				equipment.push("{@item Shield|phb} (wooden)");
				equipment.push("{@item Scimitar|phb}");
				equipment.push("{@item Javelin|phb} (4)");
				equipment.push("{@item Druidcraft Focus|phb}");
				equipment.push("{@item Herbalism Kit|phb}");
				equipment.push("{@item Explorer's Pack|phb}");
				if (classLevel >= 2) equipment.push("{@item Component Pouch|phb}");
				if (classLevel >= 4) equipment.push("{@item Grove Guardian Charm|dmg}");
				break;

			case "Fighter":
				if (strMod >= dexMod) {
					equipment.push(classLevel >= 5 ? "{@item Plate Armor|phb}" : "{@item Chain Mail|phb}");
					equipment.push("{@item Shield|phb}");
					equipment.push("{@item Longsword|phb}");
					equipment.push("{@item Handaxe|phb} (2)");
				} else {
					equipment.push("{@item Leather Armor|phb}");
					equipment.push("{@item Longbow|phb}");
					equipment.push("{@item Arrow|phb} (20)");
					equipment.push("{@item Rapier|phb}");
					equipment.push("{@item Shortsword|phb}");
				}
				equipment.push("{@item Light Crossbow|phb}");
				equipment.push("{@item Crossbow Bolt|phb} (20)");
				equipment.push("{@item Dungeoneer's Pack|phb}");
				if (classLevel >= 3) equipment.push("{@item Masterwork Weapon|dmg}");
				if (classLevel >= 5) equipment.push("{@item +1 Weapon|dmg}");
				// Replace placeholder masterwork/magic entries with valid PHB weapons
				if (classLevel >= 3) {
					const fighterWeaponOptions = [
						"{@item Longsword|PHB}",
						"{@item Greatsword|PHB}",
						"{@item Battleaxe|PHB}",
						"{@item Warhammer|PHB}",
						"{@item Halberd|PHB}",
						"{@item Rapier|PHB}"
					];
					const pick = fighterWeaponOptions[Math.floor(Math.random() * fighterWeaponOptions.length)];
					equipment.push(pick);
				}
				if (classLevel >= 5) {
					// Add an additional weapon for higher level fighters instead of an undefined +1 weapon
					const extraOptions = ["{@item Maul|PHB}", "{@item Greatsword|PHB}", "{@item Glaive|PHB}"];
					const pickExtra = extraOptions[Math.floor(Math.random() * extraOptions.length)];
					equipment.push(pickExtra);
				}
				break;

			case "Monk":
				equipment.push("{@item Shortsword|phb}");
				equipment.push("{@item Dungeoneer's Pack|phb}");
				equipment.push("{@item Dart|phb} (10)");
				equipment.push("{@item Meditation Beads|phb}");
				equipment.push("{@item Incense|phb} (10)");
				// 'Ki Focus' was a non-standard/placeholder token. Replace with a supported DMG wondrous item.
				if (classLevel >= 3) equipment.push("{@item Amulet of Health|dmg}");
				if (classLevel >= 5) equipment.push("{@item Bracers of Defense|dmg}");
				break;

			case "Paladin":
				equipment.push(classLevel >= 5 ? "{@item Plate Armor|phb}" : "{@item Chain Mail|phb}");
				equipment.push("{@item Shield|phb}");
				equipment.push("{@item Longsword|phb}");
				equipment.push("{@item Javelin|phb} (5)");
				equipment.push("{@item Explorer's Pack|phb}");
				equipment.push("{@item Holy Symbol|phb}");
				// Use canonical PHB item tokens: Holy Water (flask) and Healer's Kit for paladin consumables/tools
				equipment.push("{@item Holy Water (flask)|phb} (2)");
				equipment.push("{@item Healer's Kit|phb}");
				equipment.push("Prayer Book");
				// 'Divine Weapon' is a class feature, not an item token — give concrete gear instead
				if (classLevel >= 3) {
					// Provide a small holy stash appropriate to a low-level paladin
					equipment.push("{@item Potion of Healing|dmg}");
					equipment.push("{@item Holy Water (flask)|phb} (1)");
				}
				if (classLevel >= 5) equipment.push("{@item +1 Shield|dmg}");
				break;

			case "Ranger":
				equipment.push("{@item Studded Leather Armor|phb}");
				equipment.push("{@item Shortsword|phb} (2)");
				equipment.push("{@item Longbow|phb}");
				equipment.push("{@item Arrow|phb} (20)");
				equipment.push("{@item Dungeoneer's Pack|phb}");
				equipment.push("{@item Hunting Trap|phb} (3)");
				if (classLevel >= 2) equipment.push("{@item Component Pouch|phb}");
				if (classLevel >= 3) equipment.push("{@item Cloak of Elvenkind|dmg}");
				break;

			case "Rogue":
				equipment.push("{@item Leather Armor|phb}");
				equipment.push("{@item Shortsword|phb} (2)");
				equipment.push("{@item Shortbow|phb}");
				equipment.push("{@item Arrow|phb} (20)");
				equipment.push("{@item Thieves' Tools|phb}");
				equipment.push("{@item Burglar's Pack|phb}");
				equipment.push("{@item Dagger|phb} (2)");
				equipment.push("{@item Caltrops (bag of 20)|phb}");
				equipment.push("{@item Ball Bearing|phb} (1000)");
				if (classLevel >= 3) equipment.push("{@item Poisoner's Kit|phb}");
				if (classLevel >= 5) equipment.push("{@item +1 Thieves' Tools|dmg}");
				break;

			case "Sorcerer":
				equipment.push("{@item Dagger|phb} (2)");
				equipment.push("{@item Component Pouch|phb}");
				equipment.push("{@item Light Crossbow|phb}");
				equipment.push("{@item Crossbow Bolt|phb} (20)");
				equipment.push("{@item Dungeoneer's Pack|phb}");
				equipment.push("{@item Arcane Focus|phb} (crystal)");
				// 'Metamagic Crystal' was a non-standard/placeholder token. Replace with a valid DMG wondrous item
				// that benefits spellcasters. Use Pearl of Power as a conservative, supported fallback.
				if (classLevel >= 3) equipment.push("{@item Pearl of Power|dmg}");
				if (classLevel >= 5) equipment.push("{@item Wand of Magic Missiles|dmg}");
				break;

			case "Warlock":
				equipment.push("{@item Leather Armor|phb}");
				equipment.push("{@item Light Crossbow|phb}");
				equipment.push("{@item Crossbow Bolt|phb} (20)");
				equipment.push("{@item Component Pouch|phb}");
				equipment.push("{@item Scholar's Pack|phb}");
				equipment.push("{@item Arcane Focus|phb} (rod)");
				equipment.push("{@item Dagger|phb} (2)");
				if (classLevel >= 3) {
					// 'Pact Weapon' is a feature, not an item token. Provide a sensible weapon choice instead.
					const warlockWeaponOptions = [
						"{@item Quarterstaff|phb}",
						"{@item Longsword|phb}",
						"{@item Shortsword|phb}",
						"{@item Scimitar|phb}",
						"{@item Mace|phb}"
					];
					equipment.push(warlockWeaponOptions[Math.floor(Math.random() * warlockWeaponOptions.length)]);
				}
				if (classLevel >= 5) equipment.push("{@item Rod of the Pact Keeper|dmg}");
				break;

			case "Wizard":
				equipment.push("{@item Dagger|phb}");
				equipment.push("{@item Component Pouch|phb}");
				equipment.push("{@item Scholar's Pack|phb}");
				equipment.push("{@item Spellbook|phb}");
				equipment.push("{@item Arcane Focus|phb} (orb)");
				equipment.push("{@item Ink|phb} (1 ounce bottle)");
				equipment.push("{@item Quill|phb}");
				equipment.push("{@item Parchment|phb} (10 sheets)");
				equipment.push("{@item Spell Scroll (1st level)|dmg} (2)");
				if (classLevel >= 3) equipment.push("{@item Pearl of Power|dmg}");
				if (classLevel >= 5) equipment.push("{@item Staff of the Magi|dmg}");
				break;
		}

		return equipment;
	}

	getRacialEquipment(race) {
		if (!race) return [];

		const racialEquipment = {
			"Dwarf": ["{@item Smith's Tools|phb}", "{@item Warhammer|phb}"],
			"Elf": ["{@item Longbow|phb}", "{@item Arrow|phb} (20)", "{@item Longsword|phb}"],
			"Halfling": ["{@item Sling|phb}", "{@item Sling Bullet|phb} (20)"],
			"Human": [],
			"Dragonborn": [],
			"Gnome": ["{@item Tinker's Tools|phb}"],
			"Half-Elf": ["{@item Musical Instrument|phb}"],
			"Half-Orc": ["{@item Greataxe|phb}"],
			"Tiefling": ["{@item Cloak of Protection|dmg}"]
		};

		return racialEquipment[race.name] || [];
	}

	generateMagicalItems(classes, level, abilityScores) {
		const items = [];

		// Always include healing potions
		const healingPotions = Math.max(1, Math.floor(level / 3));
		for (let i = 0; i < healingPotions; i++) {
			items.push(level >= 5 ? "{@item Potion of Greater Healing|dmg}" : "{@item Potion of Healing|dmg}");
		}

		if (level >= 3) {
			const uncommonItems = [
				"{@item Bag of Holding|dmg}",
				"{@item Cloak of Protection|dmg}",
				"{@item Boots of Elvenkind|dmg}",
				"{@item Gloves of Missile Snaring|dmg}",
				"{@item Bracers of Archery|dmg}",
				"{@item Eyes of the Eagle|dmg}"
			];
			items.push(uncommonItems[Math.floor(Math.random() * uncommonItems.length)]);
		}

		if (level >= 5) {
			const rareItems = [
				"{@item +1 Armor|dmg}",
				"{@item +1 Weapon|dmg}",
				"{@item Ring of Protection|dmg}",
				"{@item Cloak of Displacement|dmg}",
				"{@item Boots of Speed|dmg}",
				"{@item Amulet of Health|dmg}",
				"{@item Bag of Holding|dmg}",
				"{@item Necklace of Adaptation|dmg}",
				"{@item Boots of Elvenkind|dmg}",
				"{@item Bracers of Defense|dmg}"
			];
			items.push(rareItems[Math.floor(Math.random() * rareItems.length)]);
		}

		if (level >= 8) {
			const veryRareItems = [
				"{@item +2 Weapon|dmg}",
				"{@item +2 Armor|dmg}",
				"{@item Belt of Giant Strength|dmg}",
				"{@item Rod of Lordly Might|dmg}",
				"{@item Ring of Spell Storing|dmg}",
				"{@item Stone of Good Luck|dmg}",
				"{@item Sun Blade|dmg}",
				"{@item Scimitar of Speed|dmg}",
				"{@item Cloak of the Bat|dmg}"
			];
			items.push(veryRareItems[Math.floor(Math.random() * veryRareItems.length)]);
		}

		if (level >= 11) {
			const legendaryItems = [
				"{@item +3 Weapon|dmg}",
				"{@item +3 Armor|dmg}",
				"{@item Cloak of Invisibility|dmg}",
				"{@item Staff of Power|dmg}",
				"{@item Ring of Three Wishes|dmg}",
				"{@item Holy Avenger|dmg}",
				"{@item Robe of the Archmagi|dmg}",
				"{@item Vorpal Sword|dmg}",
				"{@item Luck Blade|dmg}",
				"{@item Ring of Regeneration|dmg}",
				"{@item Hammer of Thunderbolts|dmg}"
			];
			items.push(legendaryItems[Math.floor(Math.random() * legendaryItems.length)]);
		}

		return items;
	}

	generateConsumables(level) {
		const consumables = [];

		// Potions scale with level
		const potionCount = Math.min(5, 1 + Math.floor(level / 2));
		const potionTypes = [
			"{@item Potion of Climbing|dmg}",
			"{@item Potion of Fire Resistance|dmg}",
			"{@item Potion of Flying|dmg}",
			"{@item Potion of Invisibility|dmg}",
			"{@item Potion of Speed|dmg}",
			"{@item Potion of Water Breathing|dmg}",
			"{@item Antitoxin (vial)|phb}",
			"{@item Potion of Heroism|dmg}"
		];

		for (let i = 0; i < potionCount; i++) {
			consumables.push(potionTypes[Math.floor(Math.random() * potionTypes.length)]);
		}

		// Scrolls for spellcasters
		if (level >= 3) {
			const scrollCount = Math.floor(level / 3);
			for (let i = 0; i < scrollCount; i++) {
				const scrollLevel = Math.min(Math.floor(level / 3), 5);
				consumables.push(`{@item Spell Scroll (${scrollLevel}${this.getOrdinalSuffix(scrollLevel)} level)|dmg}`);
			}
		}

		return consumables;
	}

	generateAdventuringGear(classes, level) {
		const gear = [];

		// Basic adventuring tools
		const basicGear = [
			"{@item Crowbar|phb}",
			"{@item Hammer|phb}",
			"{@item Piton|phb} (10)",
			"{@item Grappling Hook|phb}",
			"{@item Manacles|phb}",
			"{@item Oil (flask)|phb}",
			"{@item Hooded Lantern|phb}",
			"{@item Chain (10 feet)|phb}",
			"{@item Magnifying Glass|phb}",
			"{@item Spyglass|phb}",
			"{@item Caltrops (bag of 20)|phb}",
			"Mirror"
		];

		// Add gear based on level
		const gearCount = Math.min(Math.floor(level / 2) + 2, basicGear.length);
		const selectedGear = [];

		while (selectedGear.length < gearCount && selectedGear.length < basicGear.length) {
			const randomGear = basicGear[Math.floor(Math.random() * basicGear.length)];
			if (!selectedGear.includes(randomGear)) {
				selectedGear.push(randomGear);
			}
		}

		return selectedGear;
	}

	getOrdinalSuffix(num) {
		const j = num % 10;
		const k = num % 100;
		if (j === 1 && k !== 11) return "st";
		if (j === 2 && k !== 12) return "nd";
		if (j === 3 && k !== 13) return "rd";
		return "th";
	}

	// Method to generate random character at specified level
	// Accept optional forcedBackground and forcedAlignment to honor user choices
	async generateRandomCharacterAtLevel(requestedLevel = 5, characterName = '', sourceName = 'RANDOM_GENERATED', baseClass = '', race = '', forcedBackground = null, forcedAlignment = null) {
		try {
			// Validate and sanitize parameters
			const finalLevel = Math.max(1, Math.min(20, parseInt(String(requestedLevel)) || 5));
			const finalName = (characterName && characterName.trim()) || this.generateRandomName();
			// Determine final source: prefer explicit parameter, otherwise detect from URL/localStorage/cached sources
			const finalSource = (sourceName && sourceName !== 'RANDOM_GENERATED') ? sourceName : (this.getCurrentSourceName({}) || 'MyCharacters');

			// If the caller didn't explicitly provide a source, persist the detected source for subsequent flows
			if (!sourceName || sourceName === 'RANDOM_GENERATED') {
				try {
					localStorage.setItem('newCharacterSource', finalSource);
				} catch (e) {
					// Ignore storage errors
				}
			}

			console.log(`Generating random character: Level ${finalLevel}, Name: ${finalName || 'random'}, Source: ${finalSource}`);

			// Use existing generation logic but with provided parameters
			const randomClasses = this.generateRandomClasses(finalLevel, baseClass);
			const randomRace = race ? this.generateForcedRace(race) : this.generateRandomRace(randomClasses);
			const randomAlignment = forcedAlignment || this.generateRandomAlignment();

			// If forcedBackground is a string, coerce to an object so downstream code can use .name/.source
			let resolvedForcedBackground = null;
			if (forcedBackground) {
				if (typeof forcedBackground === 'string') {
					// Try to resolve full background object from data file
					resolvedForcedBackground = await this._getBackgroundByName(forcedBackground);
				} else {
					resolvedForcedBackground = forcedBackground;
				}
			}

			const randomBackground = resolvedForcedBackground ? resolvedForcedBackground : await this.generateRandomBackground(randomRace, randomAlignment);
			const randomAbilityScores = await this.generateRandomAbilityScores(randomClasses, randomRace);
			const randomEquipment = this.generateRandomEquipment(randomClasses, finalLevel, randomAbilityScores, randomRace);
			const randomActions = this.generateRandomActions(randomClasses, randomAbilityScores);
			const randomSpells = this.generateRandomSpells(randomClasses, finalLevel, randomAbilityScores);

			// Calculate derived stats
			const totalLevel = randomClasses.reduce((sum, cls) => sum + cls.level, 0);
			const profBonus = this.getProficiencyBonus(totalLevel);
			const conMod = Math.floor((randomAbilityScores.con - 10) / 2);
			const randomHp = this.calculateRandomHp(randomClasses, conMod);

			// Create character template
			const characterDepth = await this.generateCharacterDepth(randomBackground, randomRace, randomClasses, randomAlignment);

			let template = {
				name: finalName,
				source: finalSource,
			race: randomRace,
			class: randomClasses,
			background: {
				name: randomBackground.name,
				source: randomBackground.source
			},
			alignment: randomAlignment,
			ac: await this.generateRandomAC(randomClasses, randomAbilityScores, randomRace),
			hp: randomHp,
			size: randomRace.size || "M",
			speed: {
				walk: 30 // Default speed, will be overridden by race data
			},
			...randomAbilityScores,
			passive: 10 + Math.floor((randomAbilityScores.wis - 10) / 2) + (this.hasSkillProficiency("perception", randomClasses) ? profBonus : 0),
			saveProficiencies: await this.generateRandomSaves(randomAbilityScores, randomClasses, profBonus),
			skillProficiencies: await this.generateRandomSkills(randomAbilityScores, randomClasses, profBonus, randomRace, randomBackground),
			proficiencyBonus: `+${profBonus}`,
			deathSaves: {
				successes: 0,
				failures: 0
			},
			customTrackers: this.generateRandomTrackers(randomClasses),
			action: randomActions,
			...(randomSpells && { spells: randomSpells }),
			currency: this.generateRandomCurrency(totalLevel),
			entries: [...await this.generateRandomEntries(randomRace, randomClasses, randomEquipment, randomAbilityScores, finalName, randomBackground, randomAlignment)],
			// characterDepth intentionally not stored as a top-level field; include depth info in fluff
			fluff: {
				entries: [
					'write notes here'
				]
			},
		};

		// Apply race data to set actual character stats
		template = await this.applyRaceDataToCharacter(randomRace, template);

		// Apply class data to set spellcasting and other class features
		template = await this.applyClassDataToCharacter(randomClasses, template, totalLevel);

		// Apply background data to set skills, equipment, and features
		template = await this.applyBackgroundDataToCharacter(randomBackground, template);

		// Ensure source is set to the detected/selected source (avoid keeping placeholder values)
		if (!template.source || template.source === 'RANDOM_GENERATED' || template.source === 'MyCharacters' || template.source === 'ADD_YOUR_NAME_HERE') {
			template.source = finalSource || 'MyCharacters';
		}
		try {
			localStorage.setItem('newCharacterSource', template.source);
		} catch (e) {}

		// Normalize AC into expected array-of-entries format
		if (template.ac == null) {
			template.ac = [{ ac: 10, from: ['Default'] }];
		} else if (typeof template.ac === 'number') {
			template.ac = [{ ac: template.ac, from: ['Calculated'] }];
		} else if (Array.isArray(template.ac)) {
			template.ac = template.ac.map(entry => {
				if (typeof entry === 'number') return { ac: entry, from: ['Calculated'] };
				if (entry && typeof entry === 'object' && entry.ac != null) return entry;
				return { ac: 10, from: ['Default'] };
			});
		} else if (template.ac && typeof template.ac === 'object' && template.ac.ac != null) {
			template.ac = [{ ac: template.ac.ac, from: template.ac.from || ['Calculated'] }];
		}

		// Normalize HP into expected object shape
		if (!template.hp || typeof template.hp === 'number') {
			const hpVal = typeof template.hp === 'number' ? template.hp : (template.hp && template.hp.average) || 1;
			template.hp = { average: hpVal, formula: `${hpVal}`, current: hpVal, max: hpVal, temp: 0 };
		} else {
			template.hp.average = template.hp.average || template.hp.max || template.hp.current || 1;
			template.hp.current = template.hp.current || template.hp.average;
			template.hp.max = template.hp.max || template.hp.average;
			template.hp.formula = template.hp.formula || `${template.hp.average}`;
			template.hp.temp = template.hp.temp || 0;
		}

		// Update the editor with the new character
		this.ace.setValue(JSON.stringify(template, null, 2), 1);

		// Automatically render the character
		setTimeout(() => {
			this.renderCharacter();
		}, 100);

		// Show success message
		const messageEl = document.getElementById('message');
		if (messageEl) {
			messageEl.textContent = `Generated level ${totalLevel} ${finalName}!`;
			messageEl.style.color = 'green';
		}

		console.log(`Successfully generated level ${totalLevel} character: ${finalName}`);

			// Return the generated character template so callers receive the object
			return template;

		} catch (error) {
			console.error('Error generating random character:', error);

			// Show error message if possible
			const messageEl = document.getElementById('message');
			if (messageEl) {
				messageEl.textContent = `Error generating character: ${error.message}`;
				messageEl.style.color = 'red';
			}

			// Re-throw for upstream handling
			throw error;
		}
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

	/**
	 * Normalize alignment input into the shape Parser expects.
	 * Accepts strings like "NG", "N G", single-letter abbrs, arrays, or parser-style objects.
	 */
	_normalizeAlignment(raw) {
		if (!raw) return raw;
		// If it's an array already, ensure elements are strings/trimmed
		if (Array.isArray(raw)) return raw.map(it => (typeof it === 'string' ? it.trim().toUpperCase() : it));
		// If it's an object with an `alignment` property, normalize that property
		if (typeof raw === 'object') {
			// Clone to avoid mutating caller's object
			const out = Object.assign({}, raw);
			if (out.alignment) out.alignment = this._normalizeAlignment(out.alignment);
			return out;
		}
		// If it's a simple string like "NG" or "N G" or "N", convert to array of abbrs
		if (typeof raw === 'string') {
			const s = raw.trim();
			if (s.indexOf(' ') > -1) return s.split(/\s+/).map(it => it.trim().toUpperCase()).filter(Boolean);
			if (s.length === 2) return [s.charAt(0).toUpperCase(), s.charAt(1).toUpperCase()];
			return [s.toUpperCase()];
		}
		return raw;
	}

	// Debounced render method
	debouncedRenderCharacter = this.debounce(this.renderCharacter, 300);

	bindEvents() {
		// Render button
		const charRenderBtn = document.getElementById('charRender');
		if (charRenderBtn) {
			charRenderBtn.addEventListener('click', () => {
				this.renderCharacter();
			});
		}

		// Save button
		const saveBtn = document.getElementById('saveCharacter');
		if (saveBtn) {
			saveBtn.addEventListener('click', () => {
				this.saveCharacter();
			});
		}

		// Delete button with triple confirmation
		const deleteBtn = document.getElementById('deleteCharacter');
		if (deleteBtn) {
			deleteBtn.addEventListener('click', () => {
				this.deleteCharacter();
			});
		}

		// Level Up button
		const levelUpBtn = document.getElementById('levelUpCharacter');
		if (levelUpBtn) {
			console.log('✅ Level Up button found and event listener added');
			levelUpBtn.addEventListener('click', () => {
				console.log('🎯 Level Up button clicked!');
				this.initiateLevelUp();
			});
		} else {
			console.log('❌ Level Up button not found in DOM');
		}

		// Spell selection is now part of the level up process

		// Set up listener for character updates from WebSocket/P2P sync
		if (typeof CharacterManager !== 'undefined' && CharacterManager.addListener) {
			CharacterManager.addListener((characters) => {
				// Check if the currently loaded character was updated
				if (currentCharacterData && currentCharacterData.id) {
					const updatedCharacter = characters.find(c => c.id === currentCharacterData.id);
					if (updatedCharacter) {
						// Update the JSON editor with the new data (preserving scroll position)
						const currentScrollPos = this.ace.session.getScrollTop();
						this.ace.setValue(JSON.stringify(updatedCharacter, null, 2), 1);
						this.ace.session.setScrollTop(currentScrollPos);

						// Update our local reference
						currentCharacterData = updatedCharacter;

						// Re-render the character preview (with scroll preservation)
						this.renderCharacter();
					}
				}
			});
		}

		// Set up listener for cross-tab sync via localStorage events
		window.addEventListener('storage', (event) => {
			if (event.key === 'editingCharacter' && event.newValue && currentCharacterData) {
				try {
					const updatedCharacter = JSON.parse(event.newValue);
					// Only update if it's the same character we're editing
					if (updatedCharacter.id === currentCharacterData.id) {
						// Update the JSON editor with the new data (preserving scroll position)
						const currentScrollPos = this.ace.session.getScrollTop();
						this.ace.setValue(JSON.stringify(updatedCharacter, null, 2), 1);
						this.ace.session.setScrollTop(currentScrollPos);

						// Update our local reference
						currentCharacterData = updatedCharacter;

						// Re-render the character preview (with scroll preservation)
						this.renderCharacter();
					}
				} catch (e) {
					console.warn('Error handling cross-tab character sync:', e);
				}
			}
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

			// Migrate items from top-level items array to Items section if needed
			let migrationPerformed = false;
			if (characterData.items && Array.isArray(characterData.items) && characterData.items.length > 0) {
				this.migrateItemsToEntriesSection(characterData);
				migrationPerformed = true;
			}

			// Update the editor content if migration was performed
			if (migrationPerformed) {
				this.ace.setValue(JSON.stringify(characterData, null, 2), 1);
			}

			// Process the character data first to add computed fields
			this._processCharacterData(characterData);

			// Use the existing 5etools character rendering system
			let renderedContent;
			try {
				const fn = Renderer.hover.getFnRenderCompact(UrlUtil.PG_CHARACTERS);
				renderedContent = fn(characterData);
			} catch (renderError) {
				console.error('Character rendering error:', renderError);
				// Fallback to basic character display
				renderedContent = this._createFallbackCharacterDisplay(characterData);
			}

			// Save scroll position before content replacement
			const $output = $('#pagecontent');
			const scrollPosition = $output.scrollTop();

			// Clear and populate the output area using the same structure as characters page
			$output.empty().append(renderedContent);

			// Restore scroll position after content is rendered
			// Use requestAnimationFrame to ensure DOM is updated before restoring scroll
			requestAnimationFrame(() => {
				if (scrollPosition > 0) {
					$output.scrollTop(scrollPosition);
				}
			});

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

		// Update button visibility after rendering
		this.updateButtonVisibility();
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

		// Normalize alignment into the shape Parser expects (usually an array of abbrs or an object)
		if (character.alignment) {
			try {
				character.alignment = this._normalizeAlignment(character.alignment);
			} catch (e) {
				// If normalization fails, leave the original value but avoid breaking the renderer
				console.warn('Could not normalize alignment:', e, character.alignment);
			}
		}

		// Ensure we have the standard character structure for rendering
		// If the character uses the 'entries' format, convert some fields back to standard format
		if (character.entries && !character.trait && !character.action) {
			this._convertEntriesFormat(character);
		}

		// Normalize AC 'from' text so the player sees something meaningful
		try {
			if (character.ac && Array.isArray(character.ac)) {
				character.ac = character.ac.map(entry => {
					if (!entry || typeof entry !== 'object') return entry;
					const from = entry.from;
					if (Array.isArray(from) && from.some(f => String(f).toLowerCase().includes('calculated'))) {
						// Replace 'Calculated' with a friendlier description
						const friendly = this._deriveAcFromText(character, entry);
						return Object.assign({}, entry, { from: friendly });
					}
					return entry;
				});
			}
		} catch (e) {
			// Don't let this break rendering; log for debugging
			console.warn('Error normalizing AC from-text:', e);
		}
	}

	_convertEntriesFormat(character) {
		// Convert from structured entries format to flat format for compatibility
		if (!character.entries) return;

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

	// Try to produce a player-friendly description for AC entries that were auto-calculated
	_deriveAcFromText(character, acEntry) {
		// If items exist, try to find armor or shield names
		try {
			const armor = this._findArmorInItems(character);
			if (armor) return [armor];

			// If class has unarmored defence-like features, try to detect common cases
			if (character.class && Array.isArray(character.class)) {
				const clsNames = character.class.map(c => (c && c.name) ? c.name.toLowerCase() : '');
				if (clsNames.includes('barbarian')) return ['Unarmored (Barbarian)'];
				if (clsNames.includes('monk')) return ['Unarmored (Monk)'];
				if (clsNames.includes('druid')) {
					// Druids typically avoid wearing metal armour; only mention unarmored if no armour found
					return ['Unarmored (Druid)'];
				}
			}

			// If entry.ac appears to equal 10 + Dex, make that explicit
			if (acEntry && typeof acEntry.ac === 'number') {
				// No perfect way to check dex here; just provide a helpful default
				return [`Unarmored (10 + Dex) (${acEntry.ac})`];
			}
		} catch (e) {
			console.warn('Error deriving AC friendly text', e);
		}
		return ['Calculated'];
	}

	// Search character.items for likely armor/shield names and return a short label
	_findArmorInItems(character) {
		if (!character || !character.items || !Array.isArray(character.items)) return null;
		const lower = name => (name || '').toLowerCase();
		for (const it of character.items) {
			if (!it || !it.name) continue;
			const n = lower(it.name);
			if (n.includes('chain') || n.includes('plate') || n.includes('scale') || n.includes('splint') || n.includes('half plate') || n.includes('breastplate') || n.includes('studded') || n.includes('leather') || n.includes('hide')) {
				return `Wearing: ${it.name}`;
			}
			if (n.includes('shield')) return `Shield: ${it.name}`;
		}
		return null;
	}

	async saveCharacter() {
		try {
			const jsonText = this.ace.getValue();
			const characterData = JSON.parse(jsonText);

			// Prevent name changes in edit mode to avoid creating duplicate characters
			if (isEditMode && currentCharacterData && characterData.name !== currentCharacterData.name) {
				document.getElementById('message').textContent = `Error: Cannot change character name from "${currentCharacterData.name}" to "${characterData.name}". Renaming creates duplicate characters. Please revert the name change.`;
				document.getElementById('message').style.color = 'red';
				return;
			}

			// Auto-set source if missing or default
			const currentSource = this.getCurrentSourceName(characterData);
			if (!characterData.source || characterData.source === 'MyCharacters' || characterData.source === 'ADD_YOUR_NAME_HERE') {
				characterData.source = currentSource;
				// Update the JSON in the editor to reflect the change
				this.ace.setValue(JSON.stringify(characterData, null, 2));
			}

			// Use CharacterManager for centralized permission checking
			if (!CharacterManager.canEditCharacter(characterData)) {
				document.getElementById('message').textContent = 'Access denied: Invalid or missing password for this source';
				document.getElementById('message').style.color = 'red';
				return;
			}

			// Use CharacterManager for all save operations
			const success = await CharacterManager.saveCharacter(characterData, isEditMode && currentCharacterData);

			if (success) {
				if (isEditMode && currentCharacterData) {
					document.getElementById('message').textContent = 'Character updated successfully';
				} else {
					document.getElementById('message').textContent = 'Character saved successfully';
					// Update local state for potential future edits
					currentCharacterData = characterData;
					isEditMode = true;
					currentCharacterId = characterData.id || CharacterManager._generateCompositeId(characterData.name, characterData.source);
					localStorage.setItem('editingCharacter', JSON.stringify(characterData));
					// Update button visibility to show delete button
					this.updateButtonVisibility();
				}

				// Ask if user wants to view the character on the characters page
				setTimeout(() => {
					if (confirm('Character saved successfully! Would you like to view it on the characters page?')) {
						const src = characterData.source || this.getCurrentSourceName(characterData) || 'mycharacters';
						const characterAnchor = this.generateCharacterAnchor(characterData.name, src);
						window.location.href = `characters.html${characterAnchor}`;
					}
				}, 1000);
			} else {
				throw new Error('Failed to save character via CharacterManager');
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

	// REMOVED: updateCharacterInAPI - now handled by CharacterManager.saveCharacter()


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
			// Generate a unique ID for new character using name + source
			const characterId = CharacterManager._generateCompositeId(characterData.name, characterData.source);
			const apiUrl = `${API_BASE_URL}/characters`;

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

			// Update current character data for local editing (construct a local fallback payload)
			const fallbackPayload = {
				...characterData,
				id: CharacterManager._generateCompositeId(characterData.name, characterData.source),
				created: new Date().toISOString(),
				lastModified: new Date().toISOString()
			};
			currentCharacterData = fallbackPayload;
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
		const levelUpButton = document.getElementById('levelUpCharacter');

		if (deleteButton) {
			deleteButton.style.display = isEditMode ? 'inline-block' : 'none';
		}

		if (levelUpButton) {
			// Show level up button if we have character data with classes
			let showLevelUp = false;
			try {
				const jsonText = this.ace.getValue();
				const characterData = JSON.parse(jsonText);
				if (characterData.class && Array.isArray(characterData.class) && characterData.class.length > 0) {
					const currentLevel = CharacterEditorPage.getCharacterLevel(characterData);
					showLevelUp = currentLevel < 20; // Can level up if under max level
				}
			} catch (e) {
				// Invalid JSON, don't show level up button
				showLevelUp = false;
			}
			levelUpButton.style.display = showLevelUp ? 'inline-block' : 'none';
		}
	}

	hasSpellcastingClass(characterData) {
		// Check if any class has spellcasting ability
		// This is a synchronous check using known spellcasting classes
		const spellcastingClasses = [
			'Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard',
			'Artificer', 'Eldritch Knight', 'Arcane Trickster'
		];

		return characterData.class.some(classEntry => {
			// Check main class
			if (spellcastingClasses.some(sc => classEntry.name.toLowerCase().includes(sc.toLowerCase()))) {
				return true;
			}

			// Check subclass for spellcasting archetypes
			if (classEntry.subclass) {
				const subclassName = classEntry.subclass.name || classEntry.subclass.shortName || '';
				return spellcastingClasses.some(sc => subclassName.toLowerCase().includes(sc.toLowerCase()));
			}

			return false;
		});
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
		const password = CharacterSourcePasswordManager.getCachedPassword(sanitizedSource);

		if (!password) {
			const cachedSources = Object.keys(CharacterSourcePasswordManager.getCachedPasswords());
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
			const characterId = currentCharacterId || CharacterManager._generateCompositeId(characterName, currentCharacterData.source);
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

			// Inform CharacterManager so it can remove from its in-memory cache and localStorage
			try {
				if (typeof CharacterManager !== 'undefined' && CharacterManager.removeCharacter) {
					CharacterManager.removeCharacter(characterId);
				}
			} catch (e) {
				console.warn('Error notifying CharacterManager of deletion:', e);
			}

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
			await this.loadTemplate();

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

	generateCharacterId(name, source) {
		// Updated to use composite ID approach (name + source)
		return CharacterManager._generateCompositeId(name, source);
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
		const cachedPasswords = CharacterSourcePasswordManager.getCachedPasswords();
		const availableSources = Object.keys(cachedPasswords);
		if (availableSources.length > 0) {
			return availableSources[0];
		}

		// Fallback to 'MyCharacters'
		return 'MyCharacters';
	}

	getWizardSourceName() {
		// Get the source from URL params for wizard flows
		const urlParams = new URLSearchParams(window.location.search);
		const sourceFromUrl = urlParams.get('source');
		if (sourceFromUrl) {
			return sourceFromUrl;
		}

		// Check localStorage for cached source
		const newCharacterSource = localStorage.getItem('newCharacterSource');
		if (newCharacterSource) {
			return newCharacterSource;
		}

		// Check for any cached sources - use the first one
		const cachedPasswords = CharacterSourcePasswordManager.getCachedPasswords();
		const availableSources = Object.keys(cachedPasswords);
		if (availableSources.length > 0) {
			return availableSources[0];
		}

		// Fallback to 'MyCharacters'
		return 'MyCharacters';
	}

	generateCharacterAnchor(characterName, characterSource) {
		// Use the canonical composite id generator so anchors match IDs used by CharacterManager
		const id = CharacterManager._generateCompositeId(characterName, characterSource);
		return id ? `#${id}` : '#';
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
			const cachedSources = Object.keys(CharacterSourcePasswordManager.getCachedPasswords());

		if (!currentSource) {
			currentSource = detectedSource;
		}

		// Check if this source has a cached password (using sanitized name)
		const sanitizedDetectedSource = this.sanitizeSourceName(detectedSource);
			const cachedPassword = CharacterSourcePasswordManager.getCachedPassword(sanitizedDetectedSource);
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
			const cachedPassword = CharacterSourcePasswordManager.getCachedPassword(sanitizedSource);
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
		if (window['characterCache']) {
			window['characterCache'] = null;
		}

		// Trigger a custom event that other parts of the app can listen to
		window.dispatchEvent(new CustomEvent('characterDataUpdated', {
			detail: { timestamp: Date.now() }
		}));
	}

	// === LEVEL UP SYSTEM ===

	async initiateLevelUp() {
		console.log('=== INITIATE LEVEL UP CALLED ===');
		try {
			const jsonText = this.ace.getValue();
			const characterData = JSON.parse(jsonText);
			console.log('Character data for level up:', characterData);

			// Validate character has required data - allow empty class array for level 0 characters
			if (!characterData.class || !Array.isArray(characterData.class)) {
				// Initialize empty class array for level 0 characters
				characterData.class = [];
			}

			// Calculate current total level
			const currentLevel = CharacterEditorPage.getCharacterLevel(characterData);
			const newLevel = currentLevel + 1;

			if (newLevel > 20) {
				document.getElementById('message').textContent = 'Character is already at maximum level (20)';
				document.getElementById('message').style.color = 'orange';
				return;
			}

			console.log(`Starting level up: ${currentLevel} -> ${newLevel}`);

			// Initialize simple level uitemsp state
			this.levelUpState = {
				originalCharacter: JSON.parse(JSON.stringify(characterData)), // Original backup
				characterData: JSON.parse(JSON.stringify(characterData)), // Working copy
				currentLevel,
				newLevel,
				changes: {
					classLevels: [],
					features: [],
					abilityScores: [],
					hitPoints: 0,
					spellSlots: []
				}
			};

			// Show simple level up options
			await this.showSimpleLevelUpModal();

		} catch (e) {
			console.error('❌ Error initiating level up:', e);
			console.error('Error stack:', e.stack);
			document.getElementById('message').textContent = 'Error reading character data: ' + e.message;
			document.getElementById('message').style.color = 'red';
		}
	}

	async showSimpleLevelUpModal() {
		const character = this.levelUpState.characterData;
		const currentClasses = character.class || [];

		let modalContent = `
			<p><strong>Current Level:</strong> ${this.levelUpState.currentLevel} → <strong>New Level:</strong> ${this.levelUpState.newLevel}</p>

			<div class="mb-4">
				<h6>Choose class to level up:</h6>

				${currentClasses.length > 0 ? `
					${currentClasses.map((cls, index) => `
						<div class="mb-2">
							<button type="button" class="ve-btn ve-btn-success btn-block level-existing-class" data-class-index="${index}">
								Level up ${cls.name} (Level ${cls.level} → ${cls.level + 1})
								${cls.subclass ? ` (${cls.subclass.name})` : ''}
							</button>
						</div>
					`).join('')}

					<hr class="my-3">
					<h6 class="text-secondary mb-2">Or Multiclass:</h6>
				` : `<h6 class="text-secondary mb-2">Add First Class:</h6>`}

				<div class="mb-2">
					<button type="button" class="ve-btn ve-btn-default btn-block" id="add-multiclass">
						Add Level 1 of a New Class
					</button>
				</div>
			</div>
		`;

		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Level Up Character",
			hasFooter: true
		});

		$modalInner.html(modalContent);

		const $btnCancel = $(`<button class="ve-btn ve-btn-default mr-2 pb-2">Cancel</button>`)
			.click(() => doClose(false));

		$modalFooter.append($btnCancel);

		// Handle existing class level up
		$modalInner.find('.level-existing-class').click((e) => {
			const classIndex = parseInt(e.target.getAttribute('data-class-index'));
			doClose(true);
			this.levelUpExistingClass(classIndex);
		});

		// Handle multiclass
		$modalInner.find('#add-multiclass').click(() => {
			doClose(true);
			this.showMulticlassSelection();
		});

		this.levelUpModalClose = doClose;
	}

	async levelUpExistingClass(classIndex) {
		console.log(`Leveling up existing class at index ${classIndex}`);

		const character = this.levelUpState.characterData;
		const classEntry = character.class[classIndex];

		if (!classEntry) {
			document.getElementById('message').textContent = 'Error: Invalid class selection';
			document.getElementById('message').style.color = 'red';
			return;
		}

		// Increase class level
		const oldLevel = classEntry.level;
		const newLevel = oldLevel + 1;
		classEntry.level = newLevel;

		console.log(`${classEntry.name}: Level ${oldLevel} → ${newLevel}`);

		// Record the change
		this.levelUpState.changes.classLevels.push({
			className: classEntry.name,
			oldLevel,
			newLevel,
			isNew: false
		});

		// Add hit points (simple: average + CON mod)
		const hitDie = this.getClassHitDie(classEntry.name);
		const conMod = this.getAbilityModifier(character, 'con');
		const hpGain = Math.floor(hitDie / 2) + 1 + conMod;

		this.addHitPoints(hpGain);

		// Check for spell selection using data-driven detection
		console.log(`🔍 LEVEL UP FLOW - Checking spell capability for ${classEntry.name} at level ${newLevel}`);

		// Create character object for spell detection (include ALL classes for multiclassing)
		const characterForSpellCheck = {
			class: character.class || [classEntry], // Use full class array for multiclass detection
			race: character.race,
			// Include any existing spells to help with detection
			spells: character.spells,
			spell: character.spell
		};

		const spellResult = await this.canCharacterSelectSpells(characterForSpellCheck, newLevel);
		const isSpellcaster = spellResult.canSelect;
		console.log(`🎯 LEVEL UP FLOW - spell detection result:`, spellResult);
		if (isSpellcaster) {
			console.log(`📝 LEVEL UP FLOW - Reasons: ${spellResult.reasons.join(", ")}`);
		}

		if (isSpellcaster) {
			// For spellcasters, show spell selection before other features
			console.log(`✅ Adding spell selection for ${classEntry.name} level ${newLevel}`);

			// Initialize spells structure if it doesn't exist (for first-time spellcasters/multiclass)
			if (!character.spells) {
				console.log(`🔧 Initializing spells structure for new spellcaster`);
				character.spells = {
					levels: {},
					spellcastingAbility: null,
					dc: 8,
					attackBonus: "+0"
				};
				// Calculate correct spell DC immediately for new spellcasters
				const totalLevel = CharacterEditorPage.getCharacterLevel(character);
				const profBonus = this.getProficiencyBonus(totalLevel);
				await this.updateSpellcastingStats(character, profBonus);

				// Update the editor with the new spell structure
				this.ace.setValue(JSON.stringify(character, null, 2));
			}

			this.levelUpState.pendingFeatures = [{
				type: 'spells',
				feature: {
					name: 'Spell Selection',
					entries: [`Choose spells for your ${classEntry.name} spell list. You can learn new spells and replace existing ones when leveling up.`],
					requiresChoice: true,
					choiceType: 'spells'
				},
				className: classEntry.name,
				classLevel: newLevel
			}];
			this.levelUpState.currentFeatureIndex = 0;
			this.levelUpState.choices = [];

			// Set flag to continue with other level up features after spell selection
			this.levelUpState.continueAfterSpells = true;

			// Show spell selection first
			await this.showNextFeatureChoice();
			return;
		}

		// Check for class-specific ASI levels (Fighter gets bonus at 6,14; Rogue at 10)
		if (this.isASILevel(newLevel, [classEntry])) {
			this.showASIChoice();
			return;
		}

		// Add any class features for this level
		await this.addClassFeatures(classEntry, newLevel);

		// Show completion
		this.showLevelUpComplete();
	}

	async showMulticlassSelection() {
		const character = this.levelUpState.characterData;
		const allClasses = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
		const currentClasses = character.class.map(c => c.name);
		const notCurrentlyTaken = allClasses.filter(c => !currentClasses.includes(c));

		// Categorize classes by eligibility
		const eligibleClasses = [];
		const ineligibleClasses = [];

		notCurrentlyTaken.forEach(className => {
			const multiclassCheck = this.canMulticlassInto(character, className);
			if (multiclassCheck.canMulticlass) {
				eligibleClasses.push(className);
			} else {
				ineligibleClasses.push({
					name: className,
					reason: multiclassCheck.reason
				});
			}
		});

		// Build modal content
		let modalContent = `
			<h5>Add New Class (Multiclass)</h5>
			<p class="mb-3">Select a class to add at Level 1. Multiclassing requires specific ability score minimums.</p>
		`;

		// Show eligible classes
		if (eligibleClasses.length > 0) {
			modalContent += `
				<div class="form-group">
					<label for="newClassSelect"><strong>Eligible Classes:</strong></label>
					<select class="form-control" id="newClassSelect">
						<option value="">-- Select a Class --</option>
						${eligibleClasses.map(className =>
							`<option value="${className}">${className}</option>`
						).join('')}
					</select>
				</div>

				<div id="subclass-selection" class="form-group" style="display: none;">
					<label for="subclassSelect"><strong>Subclass:</strong></label>
					<select class="form-control" id="subclassSelect">
						<option value="">-- Select a Subclass --</option>
					</select>
					<small class="form-text text-muted">Choose your starting subclass for this class.</small>
				</div>
			`;
		}

		// Show ineligible classes in a warning box
		if (ineligibleClasses.length > 0) {
			modalContent += `
				<div class="alert alert-warning mt-3">
					<h6><strong>Ineligible Classes:</strong></h6>
					<ul class="mb-0">
						${ineligibleClasses.map(classInfo =>
							`<li><strong>${classInfo.name}:</strong> ${classInfo.reason}</li>`
						).join('')}
					</ul>
				</div>
			`;
		}

		if (eligibleClasses.length === 0) {
			modalContent += `
				<div class="alert alert-info">
					<strong>No classes available for multiclassing.</strong><br>
					You either have all classes or don't meet the ability score requirements for the remaining classes.
				</div>
			`;
		}

		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Multiclass Selection",
			hasFooter: true,
			isWidth100: true
		});

		$modalInner.html(modalContent);

		const $btnCancel = $(`<button class="ve-btn ve-btn-default mr-2">Cancel</button>`)
			.click(() => doClose(false));

		const $btnConfirm = $(`<button class="ve-btn ve-btn-primary" disabled>Add Class</button>`)
			.click(() => {
				const selectedClass = $modalInner.find('#newClassSelect').val();
				const selectedSubclass = $modalInner.find('#subclassSelect').val();

				if (selectedClass) {
					doClose(true);
					this.addNewClass(selectedClass, selectedSubclass);
				}
			});

		$modalFooter.append($btnCancel, $btnConfirm);

		// Handle class selection changes
		// Use an arrow function so `this` refers to the CharacterEditorPage instance
		$modalInner.find('#newClassSelect').change((evt) => {
			const selectedClass = $(evt.target).val();
			const $btnConfirm = $modalFooter.find('.ve-btn-primary');
			const $subclassDiv = $modalInner.find('#subclass-selection');
			const $subclassSelect = $modalInner.find('#subclassSelect');

			if (selectedClass) {
				// Get subclasses for the selected class (uses CharacterEditorPage method)
				const subclasses = this.getBasicSubclasses(selectedClass);

				if (subclasses && subclasses.length > 0) {
					// Show subclass selection
					$subclassDiv.show();

					// Populate subclass options
					$subclassSelect.html(`
						<option value="">-- Select a Subclass --</option>
						${subclasses.map(subclass =>
							`<option value="${subclass.name}" data-short-name="${subclass.shortName}" data-source="${subclass.source}">
								${subclass.name} (${subclass.source})
							</option>`
						).join('')}
					`);

					// Require subclass selection
					$btnConfirm.prop('disabled', true);
				} else {
					// No subclasses needed, enable confirm immediately
					$subclassDiv.hide();
					$btnConfirm.prop('disabled', false);
				}
			} else {
				$subclassDiv.hide();
				$btnConfirm.prop('disabled', true);
			}
		});

		// Handle subclass selection changes
		$modalInner.find('#subclassSelect').change(function() {
			const selectedClass = $modalInner.find('#newClassSelect').val();
			const selectedSubclass = this.value;
			const $btnConfirm = $modalFooter.find('.ve-btn-primary');

			// Enable confirm if both class and subclass are selected (when subclass is required)
			const needsSubclass = $modalInner.find('#subclass-selection').is(':visible');
			$btnConfirm.prop('disabled', !selectedClass || (needsSubclass && !selectedSubclass));
		});
	}

	async addNewClass(className, subclassName = null) {
		console.log(`Adding new class: ${className} at level 1${subclassName ? ` (${subclassName})` : ''}`);

		const character = this.levelUpState.characterData;

		// Add new class entry
		const newClassEntry = {
			name: className,
			source: 'PHB',
			level: 1,
			hitDie: this.getClassHitDie(className)
		};

		// Add subclass information if provided
		if (subclassName) {
			const subclasses = this.getBasicSubclasses(className);
			const subclassInfo = subclasses.find(sc => sc.name === subclassName);

			if (subclassInfo) {
				newClassEntry.subclass = {
					name: subclassInfo.name,
					shortName: subclassInfo.shortName,
					source: subclassInfo.source
				};
				console.log(`Added subclass: ${subclassInfo.name} (${subclassInfo.shortName})`);
			}
		}

		character.class.push(newClassEntry);

		// Record the change
		this.levelUpState.changes.classLevels.push({
			className: className,
			oldLevel: 0,
			newLevel: 1,
			isNew: true,
			subclass: newClassEntry.subclass || null
		});

		// Add hit points for level 1 (max hit die + CON mod)
		const hitDie = this.getClassHitDie(className);
		const conMod = this.getAbilityModifier(character, 'con');
		const hpGain = hitDie + conMod;

		this.addHitPoints(hpGain);

		// Add level 1 features for this class
		await this.addClassFeatures(newClassEntry, 1, true);

		// Show completion
		this.showLevelUpComplete();
	}

	// Helper methods for simplified level up
	getAbilityModifier(character, ability) {
		const score = character.abilities?.[ability] || character[ability] || 10;
		return Math.floor((score - 10) / 2);
	}

	// Consolidated function to ensure only one Features & Traits section exists
	ensureSingleFeaturesSection(character) {
		if (!character.entries) character.entries = [];

		// Find all Features & Traits sections (there might be duplicates)
		const featuresSections = character.entries.filter(entry =>
			entry.name === "Features & Traits" || entry.name === "Class Features"
		);

		if (featuresSections.length === 0) {
			// Create new section if none exists
			const featuresSection = {
				type: "section",
				name: "Features & Traits",
				entries: []
			};
			character.entries.push(featuresSection);
			return featuresSection;
		} else if (featuresSections.length === 1) {
			// Only one section exists, return it
			return featuresSections[0];
		} else {
			// Multiple sections exist - consolidate them
			const primarySection = featuresSections[0];
			primarySection.name = "Features & Traits"; // Normalize name

			// Merge all entries from duplicate sections into the primary one
			for (let i = 1; i < featuresSections.length; i++) {
				const duplicateSection = featuresSections[i];
				if (duplicateSection.entries && Array.isArray(duplicateSection.entries)) {
					// Add entries that don't already exist in the primary section
					duplicateSection.entries.forEach(entry => {
						const existsInPrimary = primarySection.entries.some(existingEntry =>
							existingEntry.name === entry.name ||
							(existingEntry.name && entry.name && existingEntry.name.toLowerCase() === entry.name.toLowerCase())
						);
						if (!existsInPrimary) {
							primarySection.entries.push(entry);
						}
					});
				}

				// Remove the duplicate section from character.entries
				const indexToRemove = character.entries.indexOf(duplicateSection);
				if (indexToRemove !== -1) {
					character.entries.splice(indexToRemove, 1);
				}
			}

			console.log(`Consolidated ${featuresSections.length} Features & Traits sections into one`);
			return primarySection;
		}
	}

	// D&D 5e Multiclassing Requirements
	getMulticlassRequirements() {
		return {
			'Barbarian': { str: 13 },
			'Bard': { cha: 13 },
			'Cleric': { wis: 13 },
			'Druid': { wis: 13 },
			'Fighter': { str: 13, dex: 13, operation: 'OR' }, // STR 13 OR DEX 13
			'Monk': { dex: 13, wis: 13 },
			'Paladin': { str: 13, cha: 13 },
			'Ranger': { dex: 13, wis: 13 },
			'Rogue': { dex: 13 },
			'Sorcerer': { cha: 13 },
			'Warlock': { cha: 13 },
			'Wizard': { int: 13 }
		};
	}

	canMulticlassInto(character, className) {
		// In D&D 5e, you need minimum ability scores for BOTH current classes AND new class
		const allRequirements = this.getMulticlassRequirements();
		const targetRequirements = allRequirements[className];
		if (!targetRequirements) return { canMulticlass: false, reason: 'Unknown class' };

		// Get character abilities
		const getScore = (ability) => character.abilities?.[ability] || character[ability] || 10;

		// First, check if character meets requirements for their current classes
		if (character.class && character.class.length > 0) {
			for (const classEntry of character.class) {
				const currentClassReqs = allRequirements[classEntry.name];
				if (currentClassReqs) {
					const currentCheck = this.checkClassRequirements(getScore, currentClassReqs, classEntry.name);
					if (!currentCheck.meets) {
						return {
							canMulticlass: false,
							reason: `Cannot multiclass: current class ${classEntry.name} ${currentCheck.reason}`
						};
					}
				}
			}
		}

		// Then check if character meets requirements for the new class
		const targetCheck = this.checkClassRequirements(getScore, targetRequirements, className);
		if (!targetCheck.meets) {
			return {
				canMulticlass: false,
				reason: targetCheck.reason
			};
		}

		return { canMulticlass: true };
	}

	checkClassRequirements(getScore, requirements, className) {
		if (requirements.operation === 'OR') {
			// Special case for Fighter: STR 13 OR DEX 13
			const meetsStr = getScore('str') >= requirements.str;
			const meetsDex = getScore('dex') >= requirements.dex;
			if (meetsStr || meetsDex) {
				return { meets: true };
			} else {
				return {
					meets: false,
					reason: `requires STR 13 OR DEX 13 (you have STR ${getScore('str')}, DEX ${getScore('dex')})`
				};
			}
		} else {
			// Normal case: all requirements must be met
			const unmetRequirements = [];
			for (const [ability, minScore] of Object.entries(requirements)) {
				if (ability !== 'operation' && getScore(ability) < minScore) {
					unmetRequirements.push(`${ability.toUpperCase()} ${minScore} (you have ${getScore(ability)})`);
				}
			}

			if (unmetRequirements.length === 0) {
				return { meets: true };
			} else {
				return {
					meets: false,
					reason: `requires ${unmetRequirements.join(' and ')}`
				};
			}
		}
	}

	getBasicSubclasses(className) {
		// Basic subclasses from PHB for each class
		const basicSubclasses = {
			'Barbarian': [
				{ name: 'Path of the Berserker', shortName: 'Berserker', source: 'PHB' },
				{ name: 'Path of the Totem Warrior', shortName: 'Totem Warrior', source: 'PHB' }
			],
			'Bard': [
				{ name: 'College of Lore', shortName: 'Lore', source: 'PHB' },
				{ name: 'College of Valor', shortName: 'Valor', source: 'PHB' }
			],
			'Cleric': [
				{ name: 'Knowledge Domain', shortName: 'Knowledge', source: 'PHB' },
				{ name: 'Life Domain', shortName: 'Life', source: 'PHB' },
				{ name: 'Light Domain', shortName: 'Light', source: 'PHB' },
				{ name: 'Nature Domain', shortName: 'Nature', source: 'PHB' },
				{ name: 'Tempest Domain', shortName: 'Tempest', source: 'PHB' },
				{ name: 'Trickery Domain', shortName: 'Trickery', source: 'PHB' },
				{ name: 'War Domain', shortName: 'War', source: 'PHB' }
			],
			'Druid': [
				{ name: 'Circle of the Land', shortName: 'Land', source: 'PHB' },
				{ name: 'Circle of the Moon', shortName: 'Moon', source: 'PHB' }
			],
			'Fighter': [
				{ name: 'Champion', shortName: 'Champion', source: 'PHB' },
				{ name: 'Battle Master', shortName: 'Battle Master', source: 'PHB' },
				{ name: 'Eldritch Knight', shortName: 'Eldritch Knight', source: 'PHB' }
			],
			'Monk': [
				{ name: 'Way of the Open Hand', shortName: 'Open Hand', source: 'PHB' },
				{ name: 'Way of Shadow', shortName: 'Shadow', source: 'PHB' },
				{ name: 'Way of the Four Elements', shortName: 'Four Elements', source: 'PHB' }
			],
			'Paladin': [
				{ name: 'Oath of Devotion', shortName: 'Devotion', source: 'PHB' },
				{ name: 'Oath of the Ancients', shortName: 'Ancients', source: 'PHB' },
				{ name: 'Oath of Vengeance', shortName: 'Vengeance', source: 'PHB' }
			],
			'Ranger': [
				{ name: 'Beast Master', shortName: 'Beast Master', source: 'PHB' },
				{ name: 'Hunter', shortName: 'Hunter', source: 'PHB' }
			],
			'Rogue': [
				{ name: 'Arcane Trickster', shortName: 'Arcane Trickster', source: 'PHB' },
				{ name: 'Assassin', shortName: 'Assassin', source: 'PHB' },
				{ name: 'Thief', shortName: 'Thief', source: 'PHB' }
			],
			'Sorcerer': [
				{ name: 'Draconic Bloodline', shortName: 'Draconic', source: 'PHB' },
				{ name: 'Wild Magic', shortName: 'Wild', source: 'PHB' }
			],
			'Warlock': [
				{ name: 'The Archfey', shortName: 'Archfey', source: 'PHB' },
				{ name: 'The Fiend', shortName: 'Fiend', source: 'PHB' },
				{ name: 'The Great Old One', shortName: 'Great Old One', source: 'PHB' }
			],
			'Wizard': [
				{ name: 'School of Abjuration', shortName: 'Abjuration', source: 'PHB' },
				{ name: 'School of Conjuration', shortName: 'Conjuration', source: 'PHB' },
				{ name: 'School of Divination', shortName: 'Divination', source: 'PHB' },
				{ name: 'School of Enchantment', shortName: 'Enchantment', source: 'PHB' },
				{ name: 'School of Evocation', shortName: 'Evocation', source: 'PHB' },
				{ name: 'School of Illusion', shortName: 'Illusion', source: 'PHB' },
				{ name: 'School of Necromancy', shortName: 'Necromancy', source: 'PHB' },
				{ name: 'School of Transmutation', shortName: 'Transmutation', source: 'PHB' }
			]
		};

		return basicSubclasses[className] || [];
	}

	addHitPoints(hpGain) {
		const character = this.levelUpState.characterData;

		// Find HP in various formats
		if (character.hitPoints) {
			character.hitPoints.max = (character.hitPoints.max || 0) + hpGain;
			character.hitPoints.current = character.hitPoints.max;
		} else if (character.hp) {
			// Ensure hp is an object, not a number
			if (typeof character.hp === 'number') {
				const currentHp = character.hp;
				character.hp = { 
					max: currentHp + hpGain, 
					current: currentHp + hpGain,
					average: currentHp + hpGain,
					formula: `${currentHp}+${hpGain}`,
					temp: 0
				};
			} else {
				character.hp.max = (character.hp.max || 0) + hpGain;
				character.hp.current = character.hp.max;
			}
		} else {
			character.hp = { max: hpGain, current: hpGain, average: hpGain, formula: String(hpGain), temp: 0 };
		}

		this.levelUpState.changes.hitPoints += hpGain;
		console.log(`Added ${hpGain} hit points`);
	}

	async addClassFeatures(classEntry, level, isNewClass = false) {
		console.log(`Adding ${classEntry.name} features for level ${level}${isNewClass ? ' (new class)' : ''}`);

		try {
			// Load the actual class data using existing method
			const classData = await this.loadClassData(classEntry.name);
			if (!classData || !classData.class || !classData.class[0]) {
				console.warn(`Could not load class data for ${classEntry.name}`);
				// Fallback to placeholder behavior
				this.levelUpState.changes.features.push({
					name: `${classEntry.name} (Level ${level} Features)`,
					description: `Could not load specific features for ${classEntry.name} level ${level}`,
					level: level,
					className: classEntry.name
				});
				return;
			}

			const classInfo = classData.class[0];

			// Get features for this specific level using existing method
			const newFeatures = await this.getNewFeaturesForLevel(classInfo, classData, classEntry, level);

			const character = this.levelUpState.characterData;

			// Ensure character has required arrays
			if (!character.entries) character.entries = [];
			if (!character.trait) character.trait = [];

			// Ensure single Features & Traits section exists
			const featuresSection = this.ensureSingleFeaturesSection(character);

			let addedFeatureCount = 0;

			// Process each feature found for this level
			for (const featureData of newFeatures) {
				if (featureData.feature) {
					const featureName = featureData.feature.name || 'Unknown Feature';
					const featureEntries = featureData.feature.entries || [`${featureName} - Gained at level ${level}.`];

					// Create feature entry for the Features & Traits section
					const featureEntry = {
						type: "entries",
						name: featureName,
						entries: featureEntries
					};

					// Add to the Features & Traits section
					featuresSection.entries.push(featureEntry);

					// Add to changes tracking for level up summary
					this.levelUpState.changes.features.push({
						name: featureName,
						description: this.getFeatureDescription(featureData.feature),
						level: level,
						className: classEntry.name,
						type: featureData.type // 'class' or 'subclass'
					});

					addedFeatureCount++;
					console.log(`Added ${featureData.type} feature "${featureName}" for ${classEntry.name} level ${level}`);
				}
			}

			// If no specific features were found, add a general note
			if (addedFeatureCount === 0) {
				const featureName = isNewClass
					? `${classEntry.name} (Level 1 Features)`
					: `${classEntry.name} (Level ${level} Features)`;

				this.levelUpState.changes.features.push({
					name: featureName,
					description: `No specific features gained for ${classEntry.name} at level ${level}`,
					level: level,
					className: classEntry.name
				});
				console.log(`No specific features found for ${classEntry.name} level ${level}`);
			} else {
				console.log(`Successfully added ${addedFeatureCount} features for ${classEntry.name} level ${level}`);
			}

		} catch (error) {
			console.error(`Error adding class features for ${classEntry.name} level ${level}:`, error);

			// Fallback to placeholder behavior on error
			this.levelUpState.changes.features.push({
				name: `${classEntry.name} (Level ${level} Features)`,
				description: `Error loading specific features for ${classEntry.name} level ${level}`,
				level: level,
				className: classEntry.name
			});
		}
	}

	// Helper method to get a readable description from feature data
	getFeatureDescription(feature) {
		if (!feature) return 'Feature gained.';

		// If feature has entries, try to extract first meaningful text
		if (feature.entries && feature.entries.length > 0) {
			const firstEntry = feature.entries[0];
			if (typeof firstEntry === 'string') {
				// Limit description length for summary display
				return firstEntry.length > 100 ? firstEntry.substring(0, 97) + '...' : firstEntry;
			}
		}

		return feature.name ? `${feature.name} feature gained.` : 'Class feature gained.';
	}

	showASIChoice() {
		console.log('Showing ASI choice');

		const character = this.levelUpState.characterData;
		const abilities = character.abilities || {
			str: character.str || 10,
			dex: character.dex || 10,
			con: character.con || 10,
			int: character.int || 10,
			wis: character.wis || 10,
			cha: character.cha || 10
		};

		const modalContent = `
			<h5>Ability Score Improvement</h5>
			<p>Choose two ability scores to increase by +1 each (or the same ability twice for +2):</p>

			<div class="row">
				<div class="col-md-6">
					<div class="form-group">
						<label for="firstAbility">First ability (+1):</label>
						<select class="form-control" id="firstAbility">
							<option value="">Select ability...</option>
							${Object.entries(abilities).map(([ability, score]) =>
								`<option value="${ability}" ${score >= 20 ? 'disabled' : ''}>${ability.toUpperCase()} (${score}${score >= 20 ? ' - Max' : ''})</option>`
							).join('')}
						</select>
					</div>
				</div>
				<div class="col-md-6">
					<div class="form-group">
						<label for="secondAbility">Second ability (+1):</label>
						<select class="form-control" id="secondAbility">
							<option value="">Select ability...</option>
							${Object.entries(abilities).map(([ability, score]) =>
								`<option value="${ability}" ${score >= 20 ? 'disabled' : ''}>${ability.toUpperCase()} (${score}${score >= 20 ? ' - Max' : ''})</option>`
							).join('')}
						</select>
					</div>
				</div>
			</div>
		`;

		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Ability Score Improvement",
			hasFooter: true
		});

		$modalInner.html(modalContent);

		const $btnCancel = $(`<button class="ve-btn ve-btn-default mr-2">Cancel</button>`)
			.click(() => doClose(false));

		const $btnConfirm = $(`<button class="ve-btn ve-btn-primary mb-2" disabled>Confirm</button>`)
			.click(() => {
				const first = $modalInner.find('#firstAbility').val();
				const second = $modalInner.find('#secondAbility').val();

				if (first && second) {
					this.applyASI(first, second);
					doClose(true);
					this.showLevelUpComplete();
				}
			});

		$modalFooter.append($btnCancel, $btnConfirm);

		// Validation
		const validate = () => {
			const first = $modalInner.find('#firstAbility').val();
			const second = $modalInner.find('#secondAbility').val();
			$btnConfirm.prop('disabled', !first || !second);
		};

		$modalInner.find('#firstAbility, #secondAbility').change(validate);
	}

	applyASI(firstAbility, secondAbility) {
		const character = this.levelUpState.characterData;

		// Apply ability score increases
		const changes = {};
		if (firstAbility === secondAbility) {
			changes[firstAbility] = 2;
		} else {
			changes[firstAbility] = 1;
			changes[secondAbility] = 1;
		}

		// Apply to character
		Object.entries(changes).forEach(([ability, increase]) => {
			if (character.abilities) {
				character.abilities[ability] = Math.min(20, (character.abilities[ability] || 10) + increase);
			} else {
				character[ability] = Math.min(20, (character[ability] || 10) + increase);
			}
		});

		// Record changes
		Object.entries(changes).forEach(([ability, increase]) => {
			this.levelUpState.changes.abilityScores.push({
				ability: ability.toUpperCase(),
				increase: increase
			});
		});

		console.log('Applied ASI:', changes);
	}

	async showLevelUpComplete() {
		const changes = this.levelUpState.changes;
		const character = this.levelUpState.characterData;

		// Run comprehensive D&D 5e rule validation
		console.log('🔍 Running D&D 5e rule validation after level up...');
		const validationResults = await this.validateCharacterRules(character, 'strict');

		// Show validation status in the summary
		const validationSection = this.createValidationSummaryHTML(validationResults);

		let summaryHTML = `
			<p class="text-success">Successfully leveled up from ${this.levelUpState.currentLevel} to ${this.levelUpState.newLevel}!</p>

			${validationSection}

			<div class="mb-4">
				<h6>Changes Made:</h6>

				${changes.classLevels.length > 0 ? `
					<div class="mb-3">
						<strong>Class Levels:</strong>
						<ul>
							${changes.classLevels.map(change =>
								`<li>${change.className}: ${change.isNew ? 'Added at Level 1' : `Level ${change.oldLevel} → ${change.newLevel}`}</li>`
							).join('')}
						</ul>
					</div>
				` : ''}

				${changes.hitPoints > 0 ? `
					<div class="mb-3">
						<strong>Hit Points:</strong> +${changes.hitPoints}
					</div>
				` : ''}

				${changes.abilityScores.length > 0 ? `
					<div class="mb-3">
						<strong>Ability Score Increases:</strong>
						<ul>
							${changes.abilityScores.map(change =>
								`<li>${change.ability}: +${change.increase}</li>`
							).join('')}
						</ul>
					</div>
				` : ''}

				${changes.features.length > 0 ? `
					<div class="mb-3">
						<strong>Features Added:</strong>
						<ul>
							${changes.features.map(feature =>
								`<li>${feature.name}</li>`
							).join('')}
						</ul>
					</div>
				` : ''}
			</div>
		`;

		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Level Up Complete!",
			hasFooter: true
		});

		$modalInner.html(summaryHTML);

		const $btnFinish = $(`<button class="ve-btn ve-btn-success mb-2">Apply Changes</button>`)
			.click(async () => {
				console.log('=== APPLY CHANGES BUTTON CLICKED ===');
				console.log('About to call doClose and finalizeLevelUp');
				doClose(true);
				await this.finalizeLevelUp();
			});

		$modalFooter.append($btnFinish);
	}

	// Removed duplicate finalizeLevelUp method - using comprehensive version later in file

	async showClassSelectionModal() {
		try {
			// Load all available classes
			const allClasses = await this.loadAllClasses();
			const currentClasses = this.levelUpState.characterData.class || [];

			// Create modal content
			const modalContent = `
				<p class="mb-3"><strong>Current Level:</strong> ${this.levelUpState.currentLevel}</p>
				<p class="mb-3"><strong>New Level:</strong> ${this.levelUpState.newLevel}</p>
				<h6>Choose which class to add a level to:</h6>
				<p class="text-muted mb-3"><small>You can level up existing classes or multiclass into new ones.</small></p>

				${currentClasses.length > 0 ? `
				<h6 class="text-primary">Current Classes:</h6>
				<div class="list-group mb-3">
					${currentClasses.map((cls, index) => {
						const classData = allClasses.find(c => c.name === cls.name);
						if (!classData) return '';

						return `
							<button type="button" class="list-group-item list-group-item-action list-group-item-success" data-action="level-existing" data-class-index="${index}">
								<div class="d-flex justify-content-between align-items-start">
									<div>
										<strong>${cls.name}</strong>
										${cls.subclass ? `<span class="text-muted">(${cls.subclass.name})</span>` : ''}
										<span class="badge badge-success ml-2">Level ${cls.level || 1} → ${(cls.level || 1) + 1}</span>
										<br>
										<small class="text-muted">Hit Die: d${classData.hd.faces} | ${this.getNextLevelFeaturePreview(cls)}</small>
									</div>
								</div>
							</button>
						`;
					}).join('')}
				</div>
				` : ''}

				<h6 class="text-info">${this.levelUpState.currentLevel === 0 ? 'Choose Your First Class:' : 'Available Classes for Multiclassing:'}</h6>
				<div class="form-group">
					<label for="multiclass-dropdown"><strong>Select Class & Subclass:</strong></label>
					<select class="form-control" id="multiclass-dropdown">
						<option value="">-- Select a Class --</option>
						${allClasses.map(classData => {
							const character = this.levelUpState.characterData;

							// Handle both nested abilities object and direct properties
							const abilities = character.abilities || {
								str: character.str || 10,
								dex: character.dex || 10,
								con: character.con || 10,
								int: character.int || 10,
								wis: character.wis || 10,
								cha: character.cha || 10
							};

							// For level 0 characters (first class), bypass multiclassing requirements
							const isFirstClass = this.levelUpState.currentLevel === 0;
							const eligibility = isFirstClass ? { eligible: true, reason: '' } : this.checkMulticlassingEligibility(classData.name, abilities);

							// Create options for each subclass (or just the base class if no subclasses)
							if (classData.availableSubclasses && classData.availableSubclasses.length > 0) {
								return classData.availableSubclasses.map(subclass => {
									const optionValue = `${classData.name}|${subclass.name}`;
									const requirementText = eligibility.eligible ? '' : ` (${eligibility.reason})`;
									return `<option value="${optionValue}" ${!eligibility.eligible ? 'disabled' : ''}>${classData.name}: ${subclass.name}${requirementText}</option>`;
								}).join('');
							} else {
								const optionValue = `${classData.name}|`;
								const requirementText = eligibility.eligible ? '' : ` (${eligibility.reason})`;
								return `<option value="${optionValue}" ${!eligibility.eligible ? 'disabled' : ''}>${classData.name}${requirementText}</option>`;
							}
						}).join('')}
					</select>
					<small class="form-text text-muted">${this.levelUpState.currentLevel === 0 ? 'Choose your first class - all options are available!' : 'Disabled options don\'t meet multiclassing ability score requirements.'}</small>
				</div>
				<div class="form-group">
					<button type="button" class="ve-btn ve-btn-primary" id="add-multiclass-btn" disabled>
						Add Level 1 of Selected Class
					</button>
				</div>
			`;

			// Create 5etools native modal
			const isLevel0 = this.levelUpState.currentLevel === 0;
			const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
				title: isLevel0 ? "Choose Your First Class" : "Level Up Character - Choose Class",
				hasFooter: true,
				isWidth100: true,
				...(isLevel0 && {
					backdrop: 'static', // Prevent dismissal for level 0
					keyboard: false     // Prevent escape key dismissal for level 0
				})
			});

			// Store modal close function
			this.levelUpModalClose = doClose;

			// Add content to modal
			$modalInner.html(modalContent);

			// Create footer buttons
			const $btnCancel = $(`<button class="ve-btn ve-btn-default mb-2">Cancel</button>`)
				.click(() => doClose(false));

			$modalFooter.append($btnCancel);

			// Add click handlers
			$modalInner.find('[data-action="level-existing"]').click((e) => {
				const classIndex = parseInt(e.currentTarget.dataset.classIndex);
				doClose(true);
				this.processClassLevelUp(currentClasses[classIndex], classIndex);
			});

			// Handle dropdown selection and enable/disable button
			$modalInner.find('#multiclass-dropdown').on('change', function() {
				const $addBtn = $modalInner.find('#add-multiclass-btn');
				$addBtn.prop('disabled', !this.value);
			});

			// Handle multiclass addition
			$modalInner.find('#add-multiclass-btn').click(() => {
				const selectedValue = $modalInner.find('#multiclass-dropdown').val();
				console.log('=== MULTICLASS DROPDOWN SELECTION DEBUG ===');
				console.log('Selected dropdown value:', selectedValue);

				if (!selectedValue) return;

				const [className, subclassName] = selectedValue.split('|');
				console.log('Parsed className:', className);
				console.log('Parsed subclassName:', subclassName);

				doClose(true);
				this.selectNewClassForMulticlass(className, allClasses, subclassName);
			});

		} catch (e) {
			console.error('Error showing class selection modal:', e);
			document.getElementById('message').textContent = 'Error loading class data';
			document.getElementById('message').style.color = 'red';
		}
	}

	async loadAllClasses() {
		// Load class data from JSON files
		const classNames = ['artificer', 'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];
		const allClasses = [];

		for (const className of classNames) {
			try {
				const response = await fetch(`data/class/class-${className}.json`);
				if (response.ok) {
					const classData = await response.json();
					if (classData.class && classData.class[0]) {
						// Include subclass data from the same file
						const classInfo = classData.class[0];
						classInfo.availableSubclasses = classData.subclass || [];
						allClasses.push(classInfo);
					}
				}
			} catch (e) {
				console.warn(`Could not load class data for ${className}:`, e);
			}
		}

		return allClasses;
	}

	// Multiclassing ability score requirements from PHB
	getMulticlassingRequirements() {
		return {
			'Barbarian': [{ ability: 'str', minimum: 13 }],
			'Bard': [{ ability: 'cha', minimum: 13 }],
			'Cleric': [{ ability: 'wis', minimum: 13 }],
			'Druid': [{ ability: 'wis', minimum: 13 }],
			'Fighter': [{ ability: 'str', minimum: 13, alternative: { ability: 'dex', minimum: 13 } }],
			'Monk': [{ ability: 'dex', minimum: 13 }, { ability: 'wis', minimum: 13 }],
			'Paladin': [{ ability: 'str', minimum: 13 }, { ability: 'cha', minimum: 13 }],
			'Ranger': [{ ability: 'dex', minimum: 13 }, { ability: 'wis', minimum: 13 }],
			'Rogue': [{ ability: 'dex', minimum: 13 }],
			'Sorcerer': [{ ability: 'cha', minimum: 13 }],
			'Warlock': [{ ability: 'cha', minimum: 13 }],
			'Wizard': [{ ability: 'int', minimum: 13 }]
		};
	}

	checkMulticlassingEligibility(className, characterAbilities) {
		const requirements = this.getMulticlassingRequirements()[className];
		if (!requirements) return { eligible: true, reason: '' };

		for (const req of requirements) {
			if (req.alternative) {
				// Either/or requirement (e.g., Fighter needs STR 13 OR DEX 13)
				const mainReqMet = (characterAbilities[req.ability] || 10) >= req.minimum;
				const altReqMet = (characterAbilities[req.alternative.ability] || 10) >= req.alternative.minimum;
				if (!mainReqMet && !altReqMet) {
					return {
						eligible: false,
						reason: `Requires ${req.ability.toUpperCase()} ${req.minimum} or ${req.alternative.ability.toUpperCase()} ${req.alternative.minimum}`
					};
				}
			} else {
				// Standard requirement
				if ((characterAbilities[req.ability] || 10) < req.minimum) {
					return {
						eligible: false,
						reason: `Requires ${req.ability.toUpperCase()} ${req.minimum} (you have ${characterAbilities[req.ability] || 10})`
					};
				}
			}
		}

		return { eligible: true, reason: '' };
	}

	async selectNewClassForMulticlass(className, allClasses, subclassName = null) {
		const classData = allClasses.find(c => c.name === className);
		if (!classData) {
			document.getElementById('message').textContent = 'Could not find class data';
			document.getElementById('message').style.color = 'red';
			return;
		}

		// For level 0 characters (first class), bypass multiclassing requirements and regenerate ability scores
		const isFirstClass = this.levelUpState.currentLevel === 0;

		if (!isFirstClass) {
			// Check multiclassing requirements for existing characters
			const character = JSON.parse(this.ace.getValue());

			// Handle both nested abilities object and direct properties
			const abilities = character.abilities || {
				str: character.str || 10,
				dex: character.dex || 10,
				con: character.con || 10,
				int: character.int || 10,
				wis: character.wis || 10,
				cha: character.cha || 10
			};

			const eligibility = this.checkMulticlassingEligibility(className, abilities);

			if (!eligibility.eligible) {
				document.getElementById('message').textContent = `Cannot multiclass into ${className}: ${eligibility.reason}`;
				document.getElementById('message').style.color = 'red';
				return;
			}
		}

		// For level 0 characters, we'll handle ability scores as part of the level up feature flow

		// If subclass was already selected from dropdown, use it directly
		if (subclassName) {
			console.log('=== MULTICLASS SUBCLASS SELECTION DEBUG ===');
			console.log('Selected subclass name:', subclassName);
			console.log('Class data availableSubclasses:', classData.availableSubclasses);

			// Find the full subclass object from the class data
			const subclassObj = classData.availableSubclasses?.find(sc => sc.name === subclassName);
			console.log('Found subclass object:', subclassObj);

			await this.addNewClassToCharacter(className, subclassObj || { name: subclassName }, classData);
			return;
		}

		// Check if this class has subclasses and requires selection at level 3 or lower
		const hasSubclasses = classData.availableSubclasses && classData.availableSubclasses.length > 0;

		if (hasSubclasses) {
			// Show subclass selection modal
			this.showSubclassSelectionModal(classData);
		} else {
			// Add the class directly
			await this.addNewClassToCharacter(className, null, classData);
		}
	}

	async regenerateAbilityScoresForClass(className) {
		// Instead of auto-generating, show ability score assignment modal
		await this.showAbilityScoreAssignmentModal(className);
	}

	async showAbilityScoreAssignmentModal(className) {
		const character = this.levelUpState.characterData;

		// Generate smart defaults based on class but let user modify them
		const classPriorities = this.getClassAbilityPriorityArrays([{ name: className }]);
		const suggestedScores = this.generatePointBuyStats([{ name: className }]);

		// Get racial bonuses to show what they'll add
		const racialBonuses = await this.getRacialAbilityBonuses(character.race);

		const modalContent = `
			<div class="text-center mb-3">
				<p>${character.name} (${className})</p>
			</div>

			<div class="row">
				<div class="col-md-8">
					${['str', 'dex', 'con', 'int', 'wis', 'cha'].map(ability => {
						const bonus = racialBonuses[ability] || 0;
						const suggested = Math.min(13, suggestedScores[ability] || 8);
						const abilityName = {
							str: 'Strength',
							dex: 'Dexterity',
							con: 'Constitution',
							int: 'Intelligence',
							wis: 'Wisdom',
							cha: 'Charisma'
						}[ability];

						const isRecommended = classPriorities.primary?.includes(ability) || classPriorities.secondary?.includes(ability);
						const priorityLabel = classPriorities.primary?.includes(ability) ? ' ⭐ (Primary)' :
											 classPriorities.secondary?.includes(ability) ? ' ⚡ (Important)' : '';

						return `
							<div class="form-group mb-3">
								<div class="row align-items-center">
									<div class="col-sm-3">
										<label class="form-label mb-0">
											<strong>${abilityName}${priorityLabel}</strong>
											${bonus > 0 ? `<br><small class="text-success">+${bonus} racial</small>` : ''}
										</label>
									</div>
									<div class="col-sm-3">
										<div class="input-group">
											<button class="ve-btn ve-btn-primary btn-sm ability-minus" type="button" data-ability="${ability}">−</button>
											<input type="number" class="form-control text-center ability-score"
												id="${ability}-score" min="8" max="15" value="${suggested}"
												data-ability="${ability}" data-racial-bonus="${bonus}">
											<button class="ve-btn ve-btn-primary btn-sm ability-plus" type="button" data-ability="${ability}">+</button>
										</div>
									</div>
								</div>
							</div>
						`;
					}).join('')}
				</div>

				<div class="col-md-4">
					<div class="card">
						<div class="card-body text-center">
							<p class="text-muted">Points Remaining</p>

							<div class="progress mb-3" style="height: 20px;">
								<div id="points-progress" class="progress-bar bg-info" style="width: 0%">
									<span id="points-used-text">0/27</span>
								</div>
							</div>

							<div id="validation-message" class="text-muted mb-3">Assign your ability scores</div>



							<button type="button" class="ve-btn ve-btn-success btn-sm btn-block" id="optimize-for-class">
								Auto-Optimize for ${className}
							</button>
						</div>
					</div>

					<div class="card mt-3">
						<div class="card-header">
							<h6 class="mb-0">${className} Tips</h6>
						</div>
						<div class="card-body">
							<small class="text-muted">${this.getAbilityRecommendationsForClass(className)}</small>
						</div>
					</div>
				</div>
			</div>
		`;

		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Assign Ability Scores",
			hasFooter: true,
			isWidth100: true,
			isUncappedHeight: true,
			isHeaderBorder: true,
			backdrop: 'static', // Prevent dismissal by clicking outside
			keyboard: false     // Prevent dismissal by escape key
		});

		$modalInner.html(modalContent);

		// Add footer buttons (no cancel button for required level 0 setup)
		const $btnConfirm = $(`<button class="ve-btn ve-btn-primary" id="confirm-ability-scores" disabled>Confirm Ability Scores</button>`)
			.click(() => {
				const finalScores = this.collectAbilityScores();
				console.log('=== ABILITY SCORES CONFIRMED ===');
				console.log('Final scores:', finalScores);

				// Close the ability score modal first
				doClose(false); // Use false to indicate we're continuing the flow

				// Then continue with the level up process
				this.applyAbilityScores(finalScores);
			});

		$modalFooter.append($btnConfirm);

		// Set up event handlers
		this.setupAbilityScoreModalHandlers($modalInner);

		// Initialize point buy calculation
		this.updatePointBuyCalculation();
	}

	getAbilityRecommendationsForClass(className) {
		const recommendations = {
			"Fighter": "Prioritize Strength for melee attacks and Constitution for survivability.",
			"Wizard": "Intelligence is crucial for spellcasting. Dexterity and Constitution are secondary.",
			"Rogue": "Dexterity is essential for attacks and AC. Constitution helps with survivability.",
			"Cleric": "Wisdom powers your spells. Constitution and Strength/Dexterity for defense.",
			"Ranger": "Dexterity for attacks and AC, Wisdom for spells and survival skills.",
			"Paladin": "Strength for combat, Charisma for spells and divine abilities.",
			"Barbarian": "Strength and Constitution are most important. Dexterity helps with AC.",
			"Bard": "Charisma powers all your abilities. Dexterity helps with AC and skills.",
			"Druid": "Wisdom for spellcasting and abilities. Constitution for survivability.",
			"Monk": "Dexterity and Wisdom are equally important. Constitution for health.",
			"Sorcerer": "Charisma for spellcasting. Constitution and Dexterity for survival.",
			"Warlock": "Charisma is primary. Constitution and Dexterity for defense.",
			"Artificer": "Intelligence for spellcasting and abilities. Constitution is secondary."
		};
		return recommendations[className] || "Focus on your class's primary abilities.";
	}

	setupAbilityScoreModalHandlers($modal) {
		const self = this;

		// Handle input changes
		$modal.find('.ability-score').on('input', function() {
			self.updatePointBuyCalculation();
		});

		// Handle plus buttons
		$modal.find('.ability-plus').click(function() {
			const ability = $(this).data('ability');
			const $input = $modal.find(`#${ability}-score`);
			const currentScore = parseInt($input.val()) || 8;
			if (currentScore < 15) {
				// Ensure we have enough remaining points for the incremental cost
				try {
					// Update calculation to ensure used/remaining are current
					self.updatePointBuyCalculation();
					const usedText = $('#points-used-text').text() || '0/27';
					const used = parseInt(usedText.split('/')[0], 10) || 0;
					const remaining = 27 - used;
					const incrementalCost = self.getPointBuyCost(8, currentScore + 1) - self.getPointBuyCost(8, currentScore);
					if (remaining >= incrementalCost) {
						$input.val(currentScore + 1).trigger('input');
					} else {
						// Briefly flash a helpful message
						const $vm = $('#validation-message');
						const prev = $vm.text();
						$vm.text(`Not enough points for +1 (cost ${incrementalCost})`).removeClass('text-muted text-success text-warning text-danger').addClass('text-danger');
						setTimeout(() => $vm.text(prev).removeClass('text-danger').addClass('text-muted'), 1400);
					}
				} catch (e) {
					// If anything goes wrong, fall back to previous behavior
					$input.val(currentScore + 1).trigger('input');
				}
			}
		});

		// Handle minus buttons
		$modal.find('.ability-minus').click(function() {
			const ability = $(this).data('ability');
			const $input = $modal.find(`#${ability}-score`);
			const currentScore = parseInt($input.val()) || 8;
			if (currentScore > 8) {
				$input.val(currentScore - 1).trigger('input');
			}
		});

		// Handle auto-optimize button
		$modal.find('#optimize-for-class').click(function() {
			self.autoOptimizeAbilityScores($modal);
		});
	}

	updatePointBuyCalculation() {
		const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
		let totalCost = 0;

		// Calculate total cost (based on base scores only) and update final scores
		abilities.forEach(ability => {
			const $input = $(`#${ability}-score`);
			const baseScore = parseInt($input.val()) || 8; // Base score the user is buying
			const racialBonus = parseInt($input.data('racial-bonus')) || 0;

			// Cost is computed from base 8 to the user's chosen base score.
			const cost = this.getPointBuyCost(8, baseScore);
			totalCost += cost;

			// Update cost display
			$(`#${ability}-cost`).text(cost);

			// Update final score (base + racial bonus) shown to user
			$(`#${ability}-final`).text(baseScore + racialBonus);
		});

		const remaining = 27 - totalCost;
		const used = totalCost;
		const $progress = $('#points-progress');
		const $usedText = $('#points-used-text');
		const $validationMessage = $('#validation-message');
		const $confirmButton = $('#confirm-ability-scores');

		// Update displays
		$usedText.text(`${used}/27`);

		// Debug: log breakdown of point buy costs to aid diagnosis
		try {
			const breakdown = abilities.map(a => {
				const $input = $(`#${a}-score`);
				const base = parseInt($input.val()) || 8;
				const racial = parseInt($input.data('racial-bonus')) || 0;
				const cost = this.getPointBuyCost(8, base);
				return { ability: a, base, racial, cost };
			});
			console.debug('Point-buy breakdown:', breakdown, 'totalCost=', totalCost, 'remaining=', remaining);
			// (points-breakdown removed)
		} catch (e) {
			console.warn('Error logging point-buy breakdown', e);
		}

		// Update progress bar
		const progressPercent = Math.min((used / 27) * 100, 100);
		$progress.css('width', `${progressPercent}%`);

		// Color coding and validation
		let isValid = true;
		let statusMessage = '';

		if (remaining < 0) {
			$progress.removeClass('bg-success bg-warning bg-info').addClass('bg-danger');
			statusMessage = `Over budget by ${Math.abs(remaining)} points!`;
			$validationMessage.text(statusMessage).removeClass('text-muted text-success').addClass('text-danger');
			isValid = false;
		} else if (remaining === 0) {
			$progress.removeClass('bg-warning bg-danger bg-info').addClass('bg-success');
			statusMessage = 'Perfect! All points spent.';
			$validationMessage.text(statusMessage).removeClass('text-muted text-danger').addClass('text-success');
			isValid = true;
		} else if (remaining <= 5) {
			$progress.removeClass('bg-success bg-danger bg-info').addClass('bg-warning');
			statusMessage = `${remaining} points remaining`;
			$validationMessage.text(statusMessage).removeClass('text-muted text-success text-danger').addClass('text-warning');
			isValid = false; // Must spend all points
		} else {
			$progress.removeClass('bg-success bg-danger bg-warning').addClass('bg-info');
			statusMessage = `${remaining} points remaining`;
			$validationMessage.text(statusMessage).removeClass('text-success text-danger text-warning').addClass('text-muted');
			isValid = false; // Must spend all points
		}

		// Enable/disable confirm button based on validation
		if (isValid) {
			$confirmButton.prop('disabled', false)
				.removeClass('ve-btn-default')
				.addClass('ve-btn-primary')
				.text('Confirm Ability Scores ✓');
		} else {
			$confirmButton.prop('disabled', true)
				.removeClass('ve-btn-primary')
				.addClass('ve-btn-default')
				.text(`Cannot Confirm - ${statusMessage}`);
		}
	}

	autoOptimizeAbilityScores($modal) {
		console.log('Auto-optimizing ability scores for class using standard array...');

		// Standard array values: 15, 14, 13, 12, 10, 8
		const standardScores = [15, 14, 13, 12, 10, 8];
		const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

		// Get class priorities from the levelUpState
		const className = this.levelUpState?.characterData?.class?.[0]?.name || 'Fighter';
		const numericPriorities = this.getClassAbilityPriorities([{ name: className }]);

		// Sort abilities by priority (highest priority first)
		const orderedAbilities = Object.entries(numericPriorities)
			.sort(([, a], [, b]) => b - a)
			.map(([ability]) => ability);

		// Assign standard array scores to abilities based on priority
		// Highest priority gets 15, next gets 14, etc.
		abilities.forEach(ability => {
			const priorityIndex = orderedAbilities.indexOf(ability);
			const score = standardScores[priorityIndex];
			$modal.find(`#${ability}-score`).val(score);
		});

		// Update the calculation and trigger input events
		abilities.forEach(ability => {
			$modal.find(`#${ability}-score`).trigger('input');
		});

		console.log('Auto-optimization complete');
	}

	collectAbilityScores() {
		const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
		const scores = {};

		abilities.forEach(ability => {
			const baseScore = parseInt(String($(`#${ability}-score`).val())) || 8;
			const racialBonus = parseInt(String($(`#${ability}-score`).data('racial-bonus'))) || 0;
			scores[ability] = baseScore + racialBonus;
		});

		return scores;
	}

	async applyAbilityScores(scores) {
		console.log('=== APPLYING ABILITY SCORES AND GENERATING COMPLETE CHARACTER ===');
		console.log('Ability scores to apply:', scores);

		// For level 0 characters, generate the complete character immediately
		if (this.levelUpState.currentLevel === 0) {
			
			// Use the comprehensive character generation but with user's specific choices
			const finalName = this.levelUpState.characterData.name;
			const forcedRace = this.level0WizardData?.race || null;
			const forcedAlignment = this.level0WizardData?.alignment || null;
			const forcedBackground = this.level0WizardData?.background || null;
			const forcedClass = this.levelUpState.characterData.class?.[0]?.name || null;
			
			console.log('Generating level 1 character with user choices:', {
				name: finalName,
				race: forcedRace,
				alignment: forcedAlignment, 
				background: forcedBackground,
				class: forcedClass,
				scores: scores
			});
			
			// Generate complete character using the same system as random generation
			const completeCharacter = await this.generateRandomCharacterAtLevel(
				1, // level
				finalName, // character name
				this.getWizardSourceName(), // source name
				forcedClass, // base class
				forcedRace?.name, // race
				forcedBackground, // background
				forcedAlignment // alignment
			);
			
			// Apply the user's chosen ability scores
			if (completeCharacter && scores) {
				Object.keys(scores).forEach(ability => {
					if (completeCharacter[ability] !== undefined) {
						completeCharacter[ability] = scores[ability];
					}
				});
				
				// Recalculate derived stats with new ability scores
				const dexMod = Math.floor((scores.dex - 10) / 2);
				const wisMod = Math.floor((scores.wis - 10) / 2);
				const conMod = Math.floor((scores.con - 10) / 2);
				const profBonus = this.getProficiencyBonus(1);
				
				// Update AC 
				if (completeCharacter.ac && completeCharacter.ac[0]) {
					completeCharacter.ac[0].ac = 10 + dexMod + (completeCharacter.ac[0].ac - 10 - dexMod); // Preserve any non-dex bonuses
				}
				
				// Update passive perception
				const perceptionBonus = this.hasSkillProficiency("perception", completeCharacter.class) ? profBonus : 0;
				completeCharacter.passive = 10 + wisMod + perceptionBonus;
				
				// Update HP with new CON modifier
				if (completeCharacter.hp && completeCharacter.class?.[0]) {
					const hitDie = this.getClassHitDie(completeCharacter.class[0].name) || 8;
					const hpVal = Math.max(1, hitDie + conMod);
					completeCharacter.hp.average = hpVal;
					completeCharacter.hp.current = hpVal;
					completeCharacter.hp.max = hpVal;
					completeCharacter.hp.formula = `${hitDie}+${conMod}`;
				}
			}

			// Check if this is a spellcasting class and we need spell selection
			console.log('=== LEVEL 0→1 CHARACTER CREATION SPELL CHECK ===');
			console.log('Complete character:', completeCharacter);
			const className = completeCharacter.class?.[0]?.name;
			console.log('Character class name:', className);
			console.log('Character class object:', completeCharacter.class?.[0]);
			let isSpellcaster = this.isSpellcastingClass(className);
			console.log('Is spellcaster:', isSpellcaster);
			console.log('Spellcasting classes list:', ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Warlock', 'Wizard', 'Paladin', 'Ranger']);

			// AGGRESSIVE FALLBACK: If not detected as spellcaster, try more checks
			if (!isSpellcaster) {
				console.log('=== AGGRESSIVE FALLBACK DETECTION FOR LEVEL 0→1 ===');
				const classNameLower = (className || '').toLowerCase();
				const spellTerms = ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard', 'paladin', 'ranger', 'artificer'];
				const isLikelySpellcaster = spellTerms.some(term => classNameLower.includes(term));

				console.log('Aggressive check - class name lower:', classNameLower);
				console.log('Aggressive check - is likely spellcaster:', isLikelySpellcaster);

				if (isLikelySpellcaster) {
					console.log('🚨 FORCING spell selection via aggressive fallback for level 0→1');
					isSpellcaster = true;
				}
			}

			if (isSpellcaster) {
				// For spellcasting classes, let the user choose their level 1 spells
				console.log('Level 1 spellcasting character detected, showing spell selection');

				// Update the ACE editor with the character first
				this.ace.setValue(JSON.stringify(completeCharacter, null, 2), 1);
				this.renderCharacter();

				// Set up level up state for spell selection only
				this.levelUpState = {
					characterData: completeCharacter,
					targetLevel: 1,
					currentLevel: 0,
					newLevel: 1,
					pendingFeatures: [{
						type: 'spells',
						feature: {
							name: 'Level 1 Spell Selection',
							entries: [`Choose your starting spells for your ${completeCharacter.class[0].name} spell list.`],
							requiresChoice: true,
							choiceType: 'spells'
						},
						className: completeCharacter.class[0].name,
						classLevel: 1
					}],
					currentFeatureIndex: 0,
					choices: []
				};

				// Show spell selection modal
				this.showNextFeatureChoice();
				return;
			}

			// For non-spellcasting classes, spells are already included from generateRandomCharacterAtLevel

			// Update the ACE editor with the complete character
			console.log('Setting complete character in editor');
			this.ace.setValue(JSON.stringify(completeCharacter, null, 2), 1);

			// Re-render character
			this.renderCharacter();

			// Update button visibility now that editor content changed
			this.updateButtonVisibility();

			// Show success message
			document.getElementById('message').textContent = 'Level 1 character created successfully!';
			document.getElementById('message').style.color = 'green';

			// Clear level up state since we're done
			this.levelUpState = null;

			// Recalculate button visibility after clearing level up state
			this.updateButtonVisibility();

			console.log('=== LEVEL 0 CHARACTER CREATION COMPLETE ===');
			return;
		}

		// For regular level ups (non-level 0), continue with the normal flow
	Object.assign(this.levelUpState.characterData, scores);
	// Normalize AC into array shape
	const computedAc = 10 + Math.floor((scores.dex - 10) / 2);
	this.levelUpState.characterData.ac = [{ ac: computedAc, from: ['Calculated'] }];
	this.levelUpState.characterData.passive = 10 + Math.floor((scores.wis - 10) / 2);

		this.levelUpState.choices.push({
			type: 'abilityScores',
			scores: scores,
			feature: {
				name: 'Ability Score Assignment',
				entries: ['Assigned ability scores for character creation.']
			}
		});

		this.levelUpState.currentFeatureIndex++;
		setTimeout(() => {
			this.showNextFeatureChoice();
		}, 500);
	}

	showSubclassSelectionModal(classData) {
		const modalContent = `
			<p class="mb-3"><strong>Current Level:</strong> ${this.levelUpState.currentLevel}</p>
			<p class="mb-3"><strong>New Level:</strong> ${this.levelUpState.newLevel}</p>
			<h6>Choose a ${classData.name} subclass:</h6>
			<p class="text-muted mb-3"><small>This will add level 1 of ${classData.name} with the selected subclass.</small></p>

			<div class="form-group">
				<label for="subclass-select"><strong>Available ${classData.name} Subclasses:</strong></label>
				<select class="form-control" id="subclass-select">
					<option value="">-- Select a Subclass --</option>
					${classData.availableSubclasses.map(subclass => `
						<option value="${subclass.name}" data-short-name="${subclass.shortName || subclass.name}" data-source="${subclass.source}">
							${subclass.name} (${subclass.source})
						</option>
					`).join('')}
				</select>
			</div>

			<div id="subclass-description" class="text-muted mt-3" style="display: none;">
				<small id="subclass-info"></small>
			</div>
		`;

		// Create 5etools native modal
		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: `Choose ${classData.name} Subclass`,
			hasFooter: true,
			isWidth100: true
		});

		// Store modal close function
		this.levelUpModalClose = doClose;

		// Add content to modal
		$modalInner.html(modalContent);

		// Create footer buttons
		const $btnCancel = $(`<button class="ve-btn ve-btn-default">Cancel</button>`)
			.click(() => doClose(false));

		const $btnConfirm = $(`<button class="ve-btn ve-btn-primary" disabled>Select Subclass</button>`)
			.click(async () => {
				const selectedValue = $modalInner.find('#subclass-select').val();
				if (selectedValue) {
					const selectedSubclass = classData.availableSubclasses.find(sc => sc.name === selectedValue);
					doClose(true);
					await this.addNewClassToCharacter(classData.name, selectedSubclass, classData);
				}
			});

		$modalFooter.append($btnCancel).append($btnConfirm);

		// Add change handler for subclass selection
		$modalInner.find('#subclass-select').change((e) => {
			const selectedValue = e.target.value;
			const $btnConfirm = $modalFooter.find('.ve-btn-primary');

			if (selectedValue) {
				$btnConfirm.prop('disabled', false);
				const selectedSubclass = classData.availableSubclasses.find(sc => sc.name === selectedValue);

				// Show subclass info
				$modalInner.find('#subclass-description').show();
				$modalInner.find('#subclass-info').text(
					`${selectedSubclass.shortName || selectedSubclass.name} from ${selectedSubclass.source}`
				);
			} else {
				$btnConfirm.prop('disabled', true);
				$modalInner.find('#subclass-description').hide();
			}
		});
	}

	async addNewClassToCharacter(className, subclass, classData) {
		// Add the new class to the character's class array
		if (!this.levelUpState.characterData.class) {
			this.levelUpState.characterData.class = [];
		}

		const isMulticlassing = this.levelUpState.characterData.class.length > 0;

		const newClassEntry = {
			name: className,
			source: classData.source || 'PHB',
			level: 1,
			hitDie: classData.hitDie || 'd8'
		};

		if (subclass) {
			console.log('=== ADDING SUBCLASS TO NEW CLASS ENTRY ===');
			console.log('Subclass parameter:', subclass);
			newClassEntry.subclass = {
				name: subclass.name,
				shortName: subclass.shortName || subclass.name,
				source: subclass.source || 'PHB'
			};
			console.log('New class entry with subclass:', newClassEntry);
		} else {
			console.log('=== NO SUBCLASS PROVIDED ===');
			console.log('Subclass parameter was null/undefined');
		}

		this.levelUpState.characterData.class.push(newClassEntry);
		const newClassIndex = this.levelUpState.characterData.class.length - 1;

		console.log(`Adding ${isMulticlassing ? 'multiclass' : 'first'} level 1 of ${className}`);

		// Load the class data to get level 1 features
		const fullClassData = await this.loadClassData(className);
		if (!fullClassData || !fullClassData.class || !fullClassData.class[0]) {
			console.error(`Could not load class data for ${className}`);
			this.processClassLevelUp(newClassEntry, newClassIndex, classData);
			return;
		}

		const classInfo = fullClassData.class[0];

		// Get level 1 features for the new class
		const level1Features = await this.getNewFeaturesForLevel(classInfo, fullClassData, newClassEntry, 1);

		console.log(`Found ${level1Features.length} level 1 features for ${className}:`, level1Features.map(f => f.feature?.name));

		// Add multiclass-specific adjustments (limited proficiencies, etc.)
		if (isMulticlassing) {
			// Apply multiclassing restrictions to features
			this.applyMulticlassingRestrictions(level1Features, className);
		}

		// Store the selected class info for processing
		this.levelUpState.selectedClassIndex = newClassIndex;

		// For level 0 characters (first class), add ability score selection as first step
		const isFirstClass = this.levelUpState.currentLevel === 0;
		const allFeatures = [];

		if (isFirstClass) {
			// Add ability score selection as the first "feature"
			allFeatures.push({
				type: 'abilityScores',
				feature: {
					name: 'Ability Score Assignment',
					entries: ['Assign your ability scores for your character.']
				},
				className: className,
				isMulticlass: false
			});

			// Add skill selection as the second feature for first class
			allFeatures.push({
				type: 'skillSelection',
				feature: {
					name: 'Skill Proficiencies',
					entries: [`Choose your skill proficiencies from the ${className} class list.`]
				},
				className: className,
				isMulticlass: false
			});
		} else if (isMulticlassing) {
			// For multiclassing, check if this class grants any limited proficiencies
			const multiclassProfs = this.getMulticlassProficiencies(className, classInfo);
			if (multiclassProfs.skills.length > 0) {
				allFeatures.push({
					type: 'multiclassSkillSelection',
					feature: {
						name: 'Multiclass Skill Proficiencies',
						entries: [`Choose limited skill proficiencies available when multiclassing into ${className}.`]
					},
					className: className,
					isMulticlass: true,
					multiclassOptions: multiclassProfs
				});
			}
		}

		// Add the class features
		if (level1Features.length > 0) {
			// Add class name to features for better tracking
			level1Features.forEach(feature => {
				feature.className = className;
				feature.isMulticlass = isMulticlassing;
			});
			allFeatures.push(...level1Features);
		}

		// Process all features (ability scores + level 1 features)
		if (allFeatures.length > 0) {
			this.levelUpState.pendingFeatures = allFeatures;
			this.levelUpState.currentFeatureIndex = 0;

			// Show feature choices starting with ability scores for level 0
			await this.showNextFeatureChoice();
		} else {
			// No features to choose, apply changes directly
			await this.finalizeLevelUp();
		}
	}

	applyMulticlassingRestrictions(features, className) {
		// In D&D 5e, when multiclassing, you get limited proficiencies
		console.log(`Applying multiclassing restrictions for ${className}`);

		features.forEach(feature => {
			if (feature.feature && feature.feature.name) {
				const featureName = feature.feature.name.toLowerCase();

				// Restrict proficiencies when multiclassing
				if (featureName.includes('proficienc') || featureName.includes('starting equipment')) {
					feature.multiclassRestricted = true;

					// Add multiclass proficiency rules
					if (featureName.includes('proficienc')) {
						feature.feature.multiclassNote = this.getMulticlassProficiencies(className);
					}
				}
			}
		});
	}

	getMulticlassProficiencies(className) {
		// D&D 5e multiclassing proficiency rules
		const multiclassProficiencies = {
			"Barbarian": "Shields, simple weapons, martial weapons",
			"Bard": "Light armor, one skill of your choice, one musical instrument of your choice",
			"Cleric": "Light armor, medium armor, shields",
			"Druid": "Light armor, medium armor, shields (non-metal only)",
			"Fighter": "Light armor, medium armor, heavy armor, shields, simple weapons, martial weapons",
			"Monk": "Simple weapons, shortswords",
			"Paladin": "Light armor, medium armor, heavy armor, shields, simple weapons, martial weapons",
			"Ranger": "Light armor, medium armor, shields, simple weapons, martial weapons, one skill from the class's skill list",
			"Rogue": "Light armor, one skill from the class's skill list, thieves' tools",
			"Sorcerer": "No additional proficiencies",
			"Warlock": "Light armor, simple weapons",
			"Wizard": "No additional proficiencies"
		};

		return multiclassProficiencies[className] || "Limited proficiencies when multiclassing";
	}

	showMulticlassChoice(classes) {
		// Find the suggested class (highest level, or most recently added if tied)
		const suggestedIndex = this.findSuggestedClassIndex(classes);

		// Create modal content with improved class information
		const modalContent = `
			<p class="mb-3"><strong>Current Level:</strong> ${this.levelUpState.currentLevel}</p>
			<p class="mb-3"><strong>New Level:</strong> ${this.levelUpState.newLevel}</p>
			<h6>Choose which class to level up:</h6>
			<p class="text-muted mb-3"><small>The suggested class is highlighted. You can level up any class you have.</small></p>
			<div class="list-group">
				${classes.map((cls, index) => {
					const isSuggested = index === suggestedIndex;
					const hitDie = this.getClassHitDie(cls.name, this.levelUpState?.characterData);
					const nextFeatures = this.getNextLevelFeaturePreview(cls);

					return `
						<button type="button" class="list-group-item list-group-item-action ${isSuggested ? 'list-group-item-primary' : ''}" data-class-index="${index}">
							<div class="d-flex justify-content-between align-items-start">
								<div>
									<strong>${cls.name}</strong>
									${cls.subclass ? `<span class="text-muted">(${cls.subclass.name})</span>` : ''}
									${isSuggested ? '<span class="badge badge-primary ml-2">Suggested</span>' : ''}
									<br>
									<small class="text-muted">
										Level ${cls.level || 1} → ${(cls.level || 1) + 1}
										| Hit Die: d${hitDie}
										${nextFeatures ? ` | ${nextFeatures}` : ''}
									</small>
								</div>
							</div>
						</button>
					`;
				}).join('')}
			</div>
		`;

		// Create 5etools native modal
		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Level Up Character - Choose Class",
			hasFooter: true
		});

		// Store modal close function
		this.levelUpModalClose = doClose;

		// Add content to modal
		$modalInner.html(modalContent);

		// Create footer buttons
		const $btnCancel = $(`<button class="ve-btn ve-btn-default">Cancel</button>`)
			.click(() => doClose(false));

		$modalFooter.append($btnCancel);

		// Add click handlers to class choices
		$modalInner.find('.list-group-item').each((index, item) => {
			$(item).click(() => {
				const classIndex = parseInt(item.dataset.classIndex);
				doClose(true); // Close the modal first
				this.processClassLevelUp(classes[classIndex], classIndex);
			});
		});
	}

	findSuggestedClassIndex(classes) {
		// Suggest the class with the highest level, or the last one added if tied
		let suggestedIndex = 0;
		let highestLevel = classes[0]?.level || 1;

		for (let i = 1; i < classes.length; i++) {
			const classLevel = classes[i]?.level || 1;
			if (classLevel >= highestLevel) {
				highestLevel = classLevel;
				suggestedIndex = i; // This will favor the last one added if levels are tied
			}
		}

		return suggestedIndex;
	}

	getNextLevelFeaturePreview(classEntry) {
		// This would ideally load class data and check what features are gained at next level
		// For now, return a generic preview based on common level milestones
		const nextLevel = (classEntry.level || 1) + 1;
		const className = classEntry.name;

		// Check if next level is an ASI level for this class
		const isASI = this.isASILevel(nextLevel, [classEntry]);

		// Common feature milestones across classes
		const commonMilestones = {
			2: "Class feature",
			3: "Subclass choice/feature",
			5: "Major class feature"
		};

		// Add ASI dynamically if applicable
		if (isASI) {
			commonMilestones[nextLevel] = "Ability Score Improvement";
		}

		// Class-specific notable levels
		const classMilestones = {
			'Fighter': { 5: "Extra Attack", 11: "Extra Attack (2)", 20: "Extra Attack (3)" },
			'Rogue': { 3: "Archetype", 5: "Uncanny Dodge", 7: "Evasion" },
			'Wizard': { 2: "School feature", 6: "School feature", 10: "School feature" },
			'Cleric': { 2: "Channel Divinity", 5: "Destroy Undead", 8: "Divine Strike" }
		};

		return classMilestones[className]?.[nextLevel] || commonMilestones[nextLevel] || "New abilities";
	}

	async processClassLevelUp(classEntry, classIndex, providedClassData = null) {
		try {
			// Use provided class data or load it
			let classData;
			if (providedClassData) {
				classData = { class: [providedClassData] };
			} else {
				classData = await this.loadClassData(classEntry.name);
				if (!classData || !classData.class || !classData.class[0]) {
					throw new Error(`Could not load class data for ${classEntry.name}`);
				}
			}

			const classInfo = classData.class[0];
			const currentClassLevel = classEntry.level || 1;
			const newClassLevel = currentClassLevel + 1;

			// Update class level
			this.levelUpState.characterData.class[classIndex].level = newClassLevel;
			this.levelUpState.selectedClassIndex = classIndex;

			// Get new features for this level
			const newFeatures = await this.getNewFeaturesForLevel(classInfo, classData, classEntry, newClassLevel);


			if (newFeatures.length > 0) {
				await this.processLevelUpFeatures(newFeatures);
			} else {
				// No choices needed, just apply automatic benefits
				await this.finalizeLevelUp();
			}

		} catch (e) {
			console.error('Error processing class level up:', e);
			document.getElementById('message').textContent = 'Error processing level up';
			document.getElementById('message').style.color = 'red';
		}
	}

	async getNewFeaturesForLevel(classInfo, classData, classEntry, newLevel) {
		console.log('=== getNewFeaturesForLevel CALLED ===');
		console.log('classInfo:', classInfo);
		console.log('classEntry:', classEntry);
		console.log('newLevel:', newLevel);

		const features = [];

		// Check class features
		if (classInfo.classFeatures) {
			for (const featureRef of classInfo.classFeatures) {
				const featureLevel = this.extractFeatureLevel(featureRef);
				if (featureLevel === newLevel) {
					const featureData = await this.loadFeatureData(featureRef, classData);
					if (featureData) {
						features.push({
							type: 'class',
							feature: featureData,
							featureRef,
							source: classInfo
						});
					}
				}
			}
		}

		// Check subclass features
		if (classEntry.subclass && classData.subclass) {
			const subclass = classData.subclass.find(sc =>
				sc.name === classEntry.subclass.name ||
				sc.shortName === classEntry.subclass.name
			);

			if (subclass && subclass.subclassFeatures) {
				for (const featureRef of subclass.subclassFeatures) {
					const featureLevel = this.extractFeatureLevel(featureRef);
					if (featureLevel === newLevel) {
						const featureData = await this.loadFeatureData(featureRef, classData);
						if (featureData) {
							features.push({
								type: 'subclass',
								feature: featureData,
								featureRef,
								source: subclass
							});
						}
					}
				}
			}
		}

		// Check optional features
		if (classInfo.optionalfeatureProgression) {
			for (const optFeature of classInfo.optionalfeatureProgression) {
				if (optFeature.progression && optFeature.progression[newLevel]) {
					features.push({
						type: 'optional',
						feature: optFeature,
						count: optFeature.progression[newLevel]
					});
				}
			}
		}

		// Add spell selection for spellcasting classes
		console.log('=== CHECKING FOR SPELL SELECTION IN getNewFeaturesForLevel ===');
		console.log('Class info:', classInfo);
		console.log('Class name:', classInfo.name);
		console.log('Has spellcastingAbility:', !!classInfo.spellcastingAbility);
		console.log('isSpellcastingClass result:', this.isSpellcastingClass(classInfo.name));
		console.log('New level:', newLevel);

		// Enhanced spellcasting detection - prioritize known class names over data properties
		const isKnownSpellcaster = this.isSpellcastingClass(classInfo.name);
		const hasSpellcastingAbility = !!classInfo.spellcastingAbility;

		console.log(`Spellcasting detection for ${classInfo.name}:`);
		console.log(`- isKnownSpellcaster: ${isKnownSpellcaster}`);
		console.log(`- hasSpellcastingAbility: ${hasSpellcastingAbility}`);

		if (isKnownSpellcaster || hasSpellcastingAbility) {
			console.log(`✅ Adding spell selection feature for ${classInfo.name} at level ${newLevel}`);
			// This is a spellcasting class, add spell selection feature
			features.push({
				type: 'spells',
				feature: {
					name: 'Spell Selection',
					entries: [`Choose spells for your ${classInfo.name} spell list. You can learn new spells and replace existing ones.`],
					requiresChoice: true,
					choiceType: 'spells'
				},
				className: classInfo.name,
				classLevel: newLevel
			});
		} else {
			console.log(`❌ No spell selection for ${classInfo.name} - not detected as spellcaster`);
		}

		// COMPREHENSIVE FALLBACK: If we didn't add spell selection above, force it for any possible spellcaster
		const hasSpellFeature = features.some(f => f.type === 'spells');
		if (!hasSpellFeature) {
			console.log('=== FALLBACK SPELL DETECTION ===');
			// Check class name with more aggressive matching
			const className = classInfo.name || classEntry?.name || 'Unknown';
			const classNameLower = className.toLowerCase();

			// Very broad detection - if ANY of these terms appear in the class name
			const spellTerms = ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard', 'paladin', 'ranger', 'artificer'];
			const isLikelySpellcaster = spellTerms.some(term => classNameLower.includes(term));

			console.log(`🚨 FALLBACK DETECTION FOR: "${className}"`);
			console.log(`🚨 Class name lower: "${classNameLower}"`);
			console.log(`🚨 Spell terms: ${spellTerms.join(", ")}`);
			console.log(`🚨 Is likely spellcaster: ${isLikelySpellcaster}`);

			// Also check if the character already has spells (indicating they're a spellcaster)
			const character = this.levelUpState?.characterData;
			const hasExistingSpells = character?.spells || character?.spell;

			console.log('Class name for fallback:', className);
			console.log('Is likely spellcaster:', isLikelySpellcaster);
			console.log('Has existing spells:', !!hasExistingSpells);

			if (isLikelySpellcaster || hasExistingSpells) {
				console.log('🚨 FORCING spell selection via fallback detection');
				features.push({
					type: 'spells',
					feature: {
						name: 'Spell Selection (Fallback)',
						entries: [`Choose spells for your ${className} spell list.`],
						requiresChoice: true,
						choiceType: 'spells'
					},
					className: className,
					classLevel: newLevel,
					isFallback: true
				});
			}
		}

		console.log('Final features array:', features);

		console.log('=== FEATURES FOR LEVEL UP SUMMARY ===');
		console.log('Total features found:', features.length);
		features.forEach((feature, index) => {
			console.log(`Feature ${index}:`, {
				type: feature.type,
				name: feature.feature?.name,
				choiceType: feature.feature?.choiceType,
				requiresChoice: feature.feature?.requiresChoice
			});
		});
		console.log('==================');

		return features;
	}

	extractFeatureLevel(feature) {
		if (typeof feature === 'string') {
			// Format: "Feature Name|Class||Level" or "Feature Name|Class||Level|Source"
			const parts = feature.split('|');
			return parseInt(parts[3]) || 1;
		} else if (feature.classFeature) {
			// Format: { classFeature: "Feature Name|Class||Level", ... }
			const parts = feature.classFeature.split('|');
			return parseInt(parts[3]) || 1;
		}
		return 1;
	}

	enhanceFeatureWithChoices(feature) {
		// Create a copy to avoid mutating the original
		const enhancedFeature = { ...feature };

		// Detect if this feature requires user choices
		if (feature.name === 'Ability Score Improvement') {
			enhancedFeature.requiresChoice = true;
			enhancedFeature.choiceType = 'abilityScoreImprovement';
		} else if (feature.name === 'Fighting Style' || feature.name.includes('Fighting Style')) {
			enhancedFeature.requiresChoice = true;
			enhancedFeature.choiceType = 'fightingStyle';
		} else if (feature.name === 'Metamagic' || feature.name.includes('Metamagic')) {
			enhancedFeature.requiresChoice = true;
			enhancedFeature.choiceType = 'metamagic';
		} else if (feature.name === 'Draconic Ancestry' || feature.name.includes('Draconic Ancestry')) {
			enhancedFeature.requiresChoice = true;
			enhancedFeature.choiceType = 'dragonbornAncestry';
		} else if (feature.name === 'Expertise' || feature.name.includes('Expertise')) {
			enhancedFeature.requiresChoice = true;
			enhancedFeature.choiceType = 'expertise';
		} else if (feature.name === 'Maneuvers' || feature.name.includes('Maneuver')) {
			enhancedFeature.requiresChoice = true;
			enhancedFeature.choiceType = 'maneuvers';
		} else if (feature.name.includes('Invocation') || feature.name === 'Eldritch Invocations') {
			enhancedFeature.requiresChoice = true;
			enhancedFeature.choiceType = 'invocation';
		} else if (feature.name === 'Pact Boon' || feature.name.includes('Pact Boon')) {
			enhancedFeature.requiresChoice = true;
			enhancedFeature.choiceType = 'pactBoon';
		} else if (feature.entries && Array.isArray(feature.entries)) {
			// Check entries for choice indicators
			const entriesText = feature.entries.join(' ').toLowerCase();

			if (entriesText.includes('choose') || entriesText.includes('select') || entriesText.includes('pick')) {
				enhancedFeature.requiresChoice = true;
				enhancedFeature.choiceType = 'generic';

				// More specific detection based on content
				if (entriesText.includes('fighting style')) {
					enhancedFeature.choiceType = 'fightingStyle';
				} else if (entriesText.includes('metamagic')) {
					enhancedFeature.choiceType = 'metamagic';
				} else if (entriesText.includes('draconic ancestry') || entriesText.includes('dragon ancestry')) {
					enhancedFeature.choiceType = 'dragonbornAncestry';
				} else if (entriesText.includes('spell') && (entriesText.includes('learn') || entriesText.includes('know'))) {
					enhancedFeature.choiceType = 'spells';
				} else if (entriesText.includes('expertise') || (entriesText.includes('proficiency bonus') && entriesText.includes('double'))) {
					enhancedFeature.choiceType = 'expertise';
				} else if (entriesText.includes('invocation')) {
					enhancedFeature.choiceType = 'invocation';
				} else if (entriesText.includes('pact boon')) {
					enhancedFeature.choiceType = 'pactBoon';
				} else if (entriesText.includes('cantrip') && entriesText.includes('learn')) {
					enhancedFeature.choiceType = 'spells';
				}
			}
		}

		return enhancedFeature;
	}

	async loadFeatureData(featureRef, classData) {
		// Handle both string and object feature references
		let featureString;
		if (typeof featureRef === 'string') {
			featureString = featureRef;
		} else if (featureRef.classFeature) {
			featureString = featureRef.classFeature;
		} else {
			console.warn('Unknown featureRef format:', featureRef);
			return null;
		}

		// Parse the feature reference format: "FeatureName|Class|Subclass|Level|Source"
		if (featureString) {
			const parts = featureString.split('|');
			const featureName = parts[0];
			const className = parts[1];
			const subclassName = parts[2] || '';
			const level = parseInt(parts[3]) || 1;
			const source = parts[4] || 'PHB';

			console.log(`Loading feature data for: ${featureName}, Class: ${className}, Level: ${level}, Source: ${source}`);

			// First try to find the feature in the provided class data
			if (classData && classData.classFeature) {
				console.log(`Searching in classFeature array with ${classData.classFeature.length} features`);
				const feature = classData.classFeature.find(f => {
					const nameMatch = f.name === featureName;
					const classMatch = f.className === className;
					const levelMatch = f.level === level;
					// Be more flexible with source matching
					const sourceMatch = !source || f.source === source || source === 'PHB';

					console.log(`Checking feature: ${f.name}, nameMatch: ${nameMatch}, classMatch: ${classMatch}, levelMatch: ${levelMatch}, sourceMatch: ${sourceMatch}`);

					return nameMatch && classMatch && levelMatch && sourceMatch;
				});

				if (feature) {
					console.log(`Found feature in classFeature array: ${feature.name}`);
					// Enhance the feature with choice detection
					return this.enhanceFeatureWithChoices(feature);
				} else {
					console.log(`Feature not found in classFeature array`);
				}
			}

			// If not found, try to load the specific class file
			try {
				const classFileName = className.toLowerCase();
				const response = await fetch(`data/class/class-${classFileName}.json`);
				if (response.ok) {
					const classFileData = await response.json();

					// Find the matching feature
					if (classFileData.classFeature) {
						const feature = classFileData.classFeature.find(f =>
							f.name === featureName &&
							f.className === className &&
							(subclassName === '' || f.subclassShortName === subclassName) &&
							f.level === level &&
							f.source === source
						);

						if (feature) {
							return this.enhanceFeatureWithChoices(feature);
						}
					}
				}
			} catch (e) {
				console.warn('Could not load class file for feature data:', e);
			}

			// Special handling for common features
			if (featureName === 'Ability Score Improvement') {
				return {
					name: featureName,
					level,
					className,
					entries: [
						"When you reach this level, you can increase one ability score of your choice by 2, or you can increase two ability scores of your choice by 1. As normal, you can't increase an ability score above 20 using this feature.",
						"If your DM allows the use of feats, you may instead take a feat."
					],
					requiresChoice: true,
					choiceType: 'abilityScoreImprovement'
				};
			}

			// Fighting Style detection
			if (featureName === 'Fighting Style' || featureName.includes('Fighting Style')) {
				return {
					name: featureName,
					level,
					className,
					entries: [
						"You adopt a particular style of fighting as your specialty. Choose one of the available fighting styles."
					],
					requiresChoice: true,
					choiceType: 'fightingStyle'
				};
			}

			// Expertise detection (for Rogues, Bards, etc.)
			if (featureName === 'Expertise' || featureName.includes('Expertise')) {
				return {
					name: featureName,
					level,
					className,
					entries: [
						"Choose two of your skill proficiencies. Your proficiency bonus is doubled for any ability check you make that uses either of the chosen proficiencies."
					],
					requiresChoice: true,
					choiceType: 'expertise'
				};
			}

			// Spell learning detection
			if (featureName.toLowerCase().includes('spells known') ||
				featureName.toLowerCase().includes('learn spells') ||
				featureName.toLowerCase().includes('additional magical secrets')) {
				return {
					name: featureName,
					level,
					className,
					entries: [
						"You learn additional spells. Choose from the appropriate spell list."
					],
					requiresChoice: true,
					choiceType: 'spells'
				};
			}

			// Battle Master maneuvers
			if (featureName === 'Maneuvers' || featureName.includes('Maneuver')) {
				return {
					name: featureName,
					level,
					className,
					entries: [
						"You learn maneuvers that are fueled by special dice called superiority dice."
					],
					requiresChoice: true,
					choiceType: 'maneuvers'
				};
			}

			// Fallback - create basic feature data
			return {
				name: featureName,
				entries: [`${featureName} feature gained at level ${level}.`],
				level,
				className,
				subclassShortName: subclassName
			};

		} else if (typeof featureRef === 'object' && featureRef.classFeature) {
			// Handle object format like { "classFeature": "...", "gainSubclassFeature": true }
			return await this.loadFeatureData(featureRef.classFeature, classData);
		}

		return null;
	}

	getRacialSpells(race) {
		const raceName = race?.name || race;
		const racialSpells = {
			'Githyanki': ['mage hand'],
			'Tiefling': ['thaumaturgy'],
			'High Elf': [], // They get a free cantrip choice
			'Drow': ['dancing lights'],
			'Forest Gnome': ['minor illusion']
		};
		return racialSpells[raceName] || [];
	}

	async processLevelUpFeatures(features) {
		this.levelUpState.pendingFeatures = features;
		this.levelUpState.currentFeatureIndex = 0;

		await this.showNextFeatureChoice();
	}

	async showNextFeatureChoice() {
		console.log('=== SHOW NEXT FEATURE CHOICE CALLED ===');
		const { pendingFeatures, currentFeatureIndex } = this.levelUpState;
		console.log('Current feature index:', currentFeatureIndex);
		console.log('Pending features length:', pendingFeatures?.length);
		console.log('Pending features:', pendingFeatures);

		if (currentFeatureIndex >= pendingFeatures.length) {
			// All features processed, apply changes directly
			console.log('All features processed, applying level up changes');
			await this.finalizeLevelUp();
			return;
		}

		const feature = pendingFeatures[currentFeatureIndex];

		if (feature.type === 'abilityScores') {
			// Handle ability score assignment for level 0 characters
			await this.showAbilityScoreAssignmentModal(feature.className);
		} else if (feature.type === 'skillSelection') {
			// Handle class skill selection for first class
			await this.showClassSkillSelectionForLevelUp(feature.className);
		} else if (feature.type === 'multiclassSkillSelection') {
			// Handle multiclass skill selection
			await this.showMulticlassSkillSelectionForLevelUp(feature.className, feature.multiclassOptions);
		} else if (feature.type === 'optional') {
			await this.showOptionalFeatureChoice(feature);
		} else if (feature.feature.requiresChoice) {
			// Handle features that require choices (like ASI)
			await this.showFeatureChoiceModal(feature);
		} else {
			// Automatic feature - just add it and continue
			this.levelUpState.choices.push({
				type: feature.type,
				feature: feature.feature,
				automatic: true
			});
			this.levelUpState.currentFeatureIndex++;
			await this.showNextFeatureChoice();
		}
	}

	async showFeatureChoiceModal(featureData) {
		const feature = featureData.feature;
		const featureName = feature.name?.toLowerCase() || '';

		// Check if this is an ASI level that can take feats instead
		if (feature.choiceType === 'abilityScoreImprovement') {
			this.showFeatOrAsiChoiceModal(feature);
		} else if (feature.choiceType === 'fightingStyle' || featureName.includes('fighting style')) {
			await this.showFightingStyleChoiceModal(feature, featureData);
		} else if (feature.choiceType === 'metamagic' || featureName.includes('metamagic')) {
			await this.showMetamagicChoiceModal(feature, featureData);
		} else if (feature.choiceType === 'dragonbornAncestry' || featureName.includes('draconic ancestry')) {
			await this.showDragonbornAncestryChoice(feature, featureData);
		} else if (feature.choiceType === 'expertise' || featureName.includes('expertise')) {
			this.showExpertiseChoiceModal(feature, featureData);
		} else if (feature.choiceType === 'spells' || featureName.includes('spells known') || featureName.includes('learn spells')) {
			this.showSpellChoiceModal(feature, featureData);
		} else if (feature.choiceType === 'maneuvers' || featureName.includes('maneuver')) {
			this.showManeuverChoiceModal(feature, featureData);
		} else if (feature.choiceType === 'invocation' || featureName.includes('invocation')) {
			this.showEldritchInvocationChoiceModal(feature, featureData);
		} else if (feature.choiceType === 'pactBoon' || featureName.includes('pact boon')) {
			this.showPactBoonChoiceModal(feature, featureData);
		} else if (featureName.includes('cantrip') && featureName.includes('learn')) {
			this.showFeatureSpellChoiceModal(feature, featureData);
		} else {
			// Use the enhanced class feature choice system for features that require choices
			if (feature.requiresChoice || featureData.requiresChoice) {
				await this.showClassFeatureChoiceModal(feature, featureData);
			} else {
				// Generic fallback for unrecognized choice types
				this.showGenericFeatureChoiceModal(feature, featureData);
			}
		}
	}

	showFeatOrAsiChoiceModal(feature) {
		// Get the CURRENT character data from the editor, not from levelUpState
		const editorText = this.ace.getValue();
		console.log('ASI Modal - Raw editor text length:', editorText.length);
		console.log('ASI Modal - First 200 chars of editor:', editorText.substring(0, 200));

		const currentCharacterData = JSON.parse(editorText);
		console.log('ASI Modal - Full character data:', currentCharacterData);
		console.log('ASI Modal - Abilities field exists?', 'abilities' in currentCharacterData);
		console.log('ASI Modal - Raw abilities field:', currentCharacterData.abilities);

		// Check if abilities are stored elsewhere in the character
		console.log('ASI Modal - Character keys:', Object.keys(currentCharacterData));
		console.log('ASI Modal - STR field exists?', 'str' in currentCharacterData);
		console.log('ASI Modal - Direct str value:', currentCharacterData.str);

		// Check if abilities are in nested object or as direct properties
		const abilities = currentCharacterData.abilities || {
			str: currentCharacterData.str || 10,
			dex: currentCharacterData.dex || 10,
			con: currentCharacterData.con || 10,
			int: currentCharacterData.int || 10,
			wis: currentCharacterData.wis || 10,
			cha: currentCharacterData.cha || 10
		};

		console.log('ASI Modal - Final abilities used for modal:', abilities);

		const modalContent = `
			<p class="mb-3"><strong>Current Level:</strong> ${this.levelUpState.currentLevel}</p>
			<p class="mb-3"><strong>New Level:</strong> ${this.levelUpState.newLevel}</p>
			<h6>Ability Score Improvement or Feat</h6>
			<p class="text-muted mb-3">You can increase your ability scores or choose a feat instead.</p>

			<div class="form-group">
				<label><strong>Choose one:</strong></label>
				<div class="form-check">
					<input class="form-check-input" type="radio" name="asiOrFeat" id="chooseAsi" value="asi">
					<label class="form-check-label" for="chooseAsi">
						Ability Score Improvement
					</label>
				</div>
				<div class="form-check">
					<input class="form-check-input" type="radio" name="asiOrFeat" id="chooseFeat" value="feat">
					<label class="form-check-label" for="chooseFeat">
						Feat (if your DM allows)
					</label>
				</div>
			</div>

			<div id="asi-options" style="display: none;">
				<div class="row">
					<div class="col-md-12">
						<h6>Choose Two Ability Improvements (+1 each)</h6>
						<p class="text-muted mb-3">You can choose the same ability twice to get +2 to one ability, or choose two different abilities to get +1 to each.</p>
					</div>
					<div class="col-md-6">
						<div class="form-group">
							<label for="firstAbility">First ability:</label>
							<select class="form-control" id="firstAbility">
								<option value="">Select an ability...</option>
								${Object.entries(abilities).map(([ability, score]) =>
									`<option value="${ability}" ${score >= 20 ? 'disabled' : ''}>${ability.toUpperCase()} (${score}${score >= 20 ? ' - Max' : ''})</option>`
								).join('')}
							</select>
						</div>
						<div class="form-group">
							<label for="secondAbility">Second ability:</label>
							<select class="form-control" id="secondAbility">
								<option value="">Select an ability...</option>
								${Object.entries(abilities).map(([ability, score]) =>
									`<option value="${ability}" ${score >= 20 ? 'disabled' : ''}>${ability.toUpperCase()} (${score}${score >= 20 ? ' - Max' : ''})</option>`
								).join('')}
							</select>
						</div>
				</div>
			</div>

			<div id="feat-options" style="display: none;">
				<div class="form-group">
					<label for="featSearch">Search Feats:</label>
					<input type="text" class="form-control" id="featSearch" placeholder="Type to search feats...">
				</div>
				<div class="form-group">
					<label for="featSelect">Available Feats:</label>
					<select class="form-control" id="featSelect" size="8">
						<option value="">Loading feats...</option>
					</select>
				</div>
				<div class="form-group" id="featDetails" style="display: none;">
					<h6>Feat Details:</h6>
					<div id="selectedFeatName" class="font-weight-bold mb-2"></div>
					<div id="selectedFeatSource" class="text-muted mb-2"></div>
					<div id="selectedFeatPrerequisites" class="mb-2"></div>
					<div id="selectedFeatDescription" class="border p-3 bg-light"></div>
				</div>
			</div>
		`;

		// Create 5etools native modal
		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Level Up Character - Ability Score Improvement or Feat",
			hasFooter: true
		});

		// Store modal close function
		this.levelUpModalClose = doClose;

		// Add content to modal
		$modalInner.html(modalContent);

		// Create footer buttons
		const $btnCancel = $(`<button class="ve-btn ve-btn-default mr-2">Cancel</button>`)
			.click(() => doClose(false));

		const $btnConfirm = $(`<button class="ve-btn ve-btn-primary" disabled>Confirm Selection</button>`)
			.click(async () => {
				const choice = $modalInner.find('input[name="asiOrFeat"]:checked').val();

				if (choice === 'asi') {
					const firstAbility = $modalInner.find('#firstAbility').val();
					const secondAbility = $modalInner.find('#secondAbility').val();

					let abilityChanges = {};

					if (firstAbility && secondAbility) {
						// Handle both same ability (resulting in +2) or different abilities (resulting in +1 each)
						if (firstAbility === secondAbility) {
							abilityChanges[firstAbility] = 2;
						} else {
							abilityChanges[firstAbility] = 1;
							abilityChanges[secondAbility] = 1;
						}
					}

					// Store the ASI choice
					this.levelUpState.choices.push({
						type: 'abilityScoreImprovement',
						feature: feature,
						abilityChanges: abilityChanges
					});

					// Immediately apply ASI changes to the character in the editor
					this.applyASIChangesToEditor(abilityChanges);
				} else if (choice === 'feat') {
					const selectedFeatName = $modalInner.find('#featSelect').val();
					const featData = await this.loadFeatData();
					const selectedFeat = featData.feat.find(feat => feat.name === selectedFeatName);

					// Store the feat choice with full feat data
					this.levelUpState.choices.push({
						type: 'feat',
						feature: feature,
						featName: selectedFeatName,
						featData: selectedFeat,
						featDescription: this.formatFeatDescription(selectedFeat)
					});
				}

				// Continue to next feature
				this.levelUpState.currentFeatureIndex++;
				doClose(true);
				this.showNextFeatureChoice();
			});

		$modalFooter.append($btnCancel, $btnConfirm);

		// Handle radio button changes
		$modalInner.find('input[name="asiOrFeat"]').change(async () => {
			const choice = $modalInner.find('input[name="asiOrFeat"]:checked').val();

			if (choice === 'asi') {
				$modalInner.find('#asi-options').show();
				$modalInner.find('#feat-options').hide();
			} else if (choice === 'feat') {
				$modalInner.find('#feat-options').show();
				$modalInner.find('#asi-options').hide();

				// Load feat data when feat option is selected
				await this.loadAndDisplayFeats($modalInner, currentCharacterData);
			}

			validateSelection();
		});

		// Validation logic
		const validateSelection = () => {
			const choice = $modalInner.find('input[name="asiOrFeat"]:checked').val();
			let isValid = false;

			if (choice === 'asi') {
				const firstAbility = $modalInner.find('#firstAbility').val();
				const secondAbility = $modalInner.find('#secondAbility').val();

				// Both abilities must be selected and under 20
				isValid = firstAbility && secondAbility &&
						  abilities[firstAbility] < 20 && abilities[secondAbility] < 20;
			} else if (choice === 'feat') {
				const selectedFeat = $modalInner.find('#featSelect').val();
				isValid = selectedFeat && selectedFeat !== '';
			}

			$btnConfirm.prop('disabled', !isValid);
		};

		// Add change listeners for validation
		$modalInner.find('#singleAbility, #firstAbility, #secondAbility, #featSelect').change(validateSelection);

		// Clear selections when switching between options
		$modalInner.find('#chooseAsi').change(() => {
			if ($modalInner.find('#chooseAsi').is(':checked')) {
				$modalInner.find('#featSelect').val('');
				$modalInner.find('#featDetails').hide();
			}
		});

		$modalInner.find('#chooseFeat').change(() => {
			if ($modalInner.find('#chooseFeat').is(':checked')) {
				$modalInner.find('#singleAbility, #firstAbility, #secondAbility').val('');
			}
		});
	}

	characterMeetsFeatPrerequisites(feat, character) {
		// If feat has no prerequisites, character can take it
		if (!feat.prerequisite || feat.prerequisite.length === 0) {
			return true;
		}

		// Get character abilities - check both nested and direct properties
		const abilities = character.abilities || {
			str: character.str || 10,
			dex: character.dex || 10,
			con: character.con || 10,
			int: character.int || 10,
			wis: character.wis || 10,
			cha: character.cha || 10
		};

		// Calculate character level
		const characterLevel = character.class ?
			character.class.reduce((total, cls) => total + (cls.level || 1), 0) : 1;

		// Get character feats (if any)
		const characterFeats = character.feats || [];

		// Check each prerequisite - all must be met
		for (const prereq of feat.prerequisite) {
			// Check ability score prerequisites
			if (prereq.ability) {
				for (const abilityReq of prereq.ability) {
					for (const [ability, requiredScore] of Object.entries(abilityReq)) {
						if (abilities[ability] < requiredScore) {
							return false;
						}
					}
				}
			}

			// Check level prerequisites
			if (prereq.level && characterLevel < prereq.level) {
				return false;
			}

			// Check feat prerequisites
			if (prereq.feat) {
				for (const requiredFeat of prereq.feat) {
					// Extract feat name (handle format "feat name|source|variant")
					const featName = requiredFeat.split('|')[0].toLowerCase();
					const hasRequiredFeat = characterFeats.some(feat =>
						feat.name && feat.name.toLowerCase() === featName
					);
					if (!hasRequiredFeat) {
						return false;
					}
				}
			}

			// Check "other" prerequisites - we'll allow these for now with a warning
			if (prereq.other) {
				console.warn(`Feat ${feat.name} has special prerequisite: ${prereq.other}`);
				// For now, assume player will manually verify special prerequisites
			}
		}

		return true;
	}

	async loadAndDisplayFeats($modalInner, character) {
		const featData = await this.loadFeatData();
		if (!featData || !featData.feat) {
			$modalInner.find('#featSelect').html('<option value="">Error loading feats</option>');
			return;
		}

		const feats = featData.feat;
		// Filter feats to only show those the character meets prerequisites for
		let filteredFeats = feats.filter(feat => this.characterMeetsFeatPrerequisites(feat, character));

		// Populate the select with all feats initially
		this.populateFeatSelect($modalInner, filteredFeats, character);

		// Set up search functionality
		$modalInner.find('#featSearch').on('input', (e) => {
			const searchTerm = e.target.value.toLowerCase();
			if (searchTerm) {
				filteredFeats = feats.filter(feat =>
					feat.name.toLowerCase().includes(searchTerm) &&
					this.characterMeetsFeatPrerequisites(feat, character)
				);
			} else {
				filteredFeats = feats.filter(feat => this.characterMeetsFeatPrerequisites(feat, character));
			}
			this.populateFeatSelect($modalInner, filteredFeats, character);
		});

		// Set up feat selection change handler
		$modalInner.find('#featSelect').change((e) => {
			const selectedFeatName = e.target.value;
			if (selectedFeatName) {
				const selectedFeat = feats.find(feat => feat.name === selectedFeatName);
				this.displayFeatDetails($modalInner, selectedFeat, character);
			} else {
				$modalInner.find('#featDetails').hide();
			}
		});
	}

	populateFeatSelect($modalInner, feats, character) {
		const $featSelect = $modalInner.find('#featSelect');
		$featSelect.empty();
		$featSelect.append('<option value="">Select a feat...</option>');

		feats.forEach(feat => {
			const meetsPrereqs = this.checkFeatPrerequisites(feat, character);
			const disabled = !meetsPrereqs ? 'disabled' : '';
			const prereqText = !meetsPrereqs ? ' (Prerequisites not met)' : '';

			$featSelect.append(
				`<option value="${feat.name}" ${disabled}>${feat.name}${prereqText}</option>`
			);
		});
	}

	displayFeatDetails($modalInner, feat, character) {
		if (!feat) return;

		$modalInner.find('#selectedFeatName').text(feat.name);
		$modalInner.find('#selectedFeatSource').text(`Source: ${feat.source}${feat.page ? `, p. ${feat.page}` : ''}`);

		// Display prerequisites
		let prereqText = '';
		if (feat.prerequisite && feat.prerequisite.length > 0) {
			const meetsPrereqs = this.checkFeatPrerequisites(feat, character);
			const prereqColor = meetsPrereqs ? 'text-success' : 'text-danger';
			const prereqStatus = meetsPrereqs ? '✓' : '✗';

			prereqText = feat.prerequisite.map(prereq => {
				return this.formatPrerequisite(prereq);
			}).join(', ');

			$modalInner.find('#selectedFeatPrerequisites').html(
				`<span class="${prereqColor}"><strong>Prerequisites:</strong> ${prereqStatus} ${prereqText}</span>`
			);
		} else {
			$modalInner.find('#selectedFeatPrerequisites').html('<span class="text-success"><strong>Prerequisites:</strong> ✓ None</span>');
		}

		// Display description
		let description = '';
		if (feat.entries) {
			description = feat.entries.map(entry => {
				if (typeof entry === 'string') {
					return entry;
				} else if (entry.type === 'list' && entry.items) {
					return '<ul><li>' + entry.items.join('</li><li>') + '</li></ul>';
				}
				return JSON.stringify(entry);
			}).join('<br><br>');
		}

		// Display ability improvements if any
		if (feat.ability && feat.ability.length > 0) {
			const abilityText = feat.ability.map(ab => {
				const abilities = Object.keys(ab).map(key => `${key.toUpperCase()} +${ab[key]}`);
				return abilities.join(', ');
			}).join(', ');
			description = `<strong>Ability Score Increase:</strong> ${abilityText}<br><br>` + description;
		}

		$modalInner.find('#selectedFeatDescription').html(description);
		$modalInner.find('#featDetails').show();
	}

	checkFeatPrerequisites(feat, character) {
		if (!feat.prerequisite || feat.prerequisite.length === 0) {
			return true; // No prerequisites
		}

		// Get character abilities
		const abilities = character.abilities || {
			str: character.str || 10,
			dex: character.dex || 10,
			con: character.con || 10,
			int: character.int || 10,
			wis: character.wis || 10,
			cha: character.cha || 10
		};

		return feat.prerequisite.every(prereq => {
			// Check ability score requirements
			for (const [ability, minScore] of Object.entries(prereq)) {
				if (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(ability)) {
					if (abilities[ability] < minScore) {
						return false;
					}
				}
			}

			// Check other requirements (simplified for now)
			if (prereq.other) {
				// For now, assume other prerequisites are met
				// You could expand this to check class, level, spell, etc.
				return true;
			}

			return true;
		});
	}

	formatPrerequisite(prereq) {
		const parts = [];

		// Format ability requirements
		for (const [ability, minScore] of Object.entries(prereq)) {
			if (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(ability)) {
				parts.push(`${ability.toUpperCase()} ${minScore}+`);
			}
		}

		// Format other requirements
		if (prereq.other) {
			parts.push(prereq.other);
		}

		return parts.join(', ') || 'None';
	}

	formatFeatDescription(feat) {
		if (!feat || !feat.entries) return '';

		return feat.entries.map(entry => {
			if (typeof entry === 'string') {
				return entry;
			} else if (entry.type === 'list' && entry.items) {
				return entry.items.join('; ');
			}
			return '';
		}).join(' ');
	}

	showAbilityScoreImprovementModal(feature) {
		// This method is kept for backward compatibility but now redirects to the enhanced version
		this.showFeatOrAsiChoiceModal(feature);
	}

	async showFightingStyleChoiceModal(feature, featureData) {
		// Determine available fighting styles based on class
		const character = this.levelUpState.characterData;
		const currentClass = character.class?.[this.levelUpState.selectedClassIndex]?.name || 'Fighter';

		// Common fighting styles for Fighter, Paladin, Ranger
		const allFightingStyles = [
			{ name: "Archery", description: "+2 bonus to ranged weapon attack rolls", classes: ["Fighter", "Paladin", "Ranger"] },
			{ name: "Defense", description: "+1 bonus to AC while wearing armor", classes: ["Fighter", "Paladin", "Ranger"] },
			{ name: "Dueling", description: "+2 damage when wielding a one-handed weapon with no other weapons", classes: ["Fighter", "Paladin", "Ranger"] },
			{ name: "Great Weapon Fighting", description: "Reroll 1s and 2s on damage dice with two-handed weapons", classes: ["Fighter", "Paladin", "Ranger"] },
			{ name: "Protection", description: "Use reaction and shield to impose disadvantage on attacks against nearby allies", classes: ["Fighter", "Paladin"] },
			{ name: "Two-Weapon Fighting", description: "Add ability modifier to damage of second attack when fighting with two weapons", classes: ["Fighter", "Ranger"] },
			{ name: "Blessed Warrior", description: "Learn two cantrips from the cleric spell list", classes: ["Paladin"] },
			{ name: "Blind Fighting", description: "See in darkness within 10 feet", classes: ["Fighter", "Paladin", "Ranger"] },
			{ name: "Interception", description: "Reduce damage to nearby allies", classes: ["Fighter", "Paladin"] },
			{ name: "Superior Technique", description: "Learn one maneuver and gain a superiority die", classes: ["Fighter"] },
			{ name: "Thrown Weapon Fighting", description: "Draw and add +2 damage to thrown weapon attacks", classes: ["Fighter", "Ranger"] },
			{ name: "Unarmed Fighting", description: "Deal 1d4 + STR damage with unarmed strikes", classes: ["Fighter"] },
			{ name: "Druidcraft", description: "Natural magic and wild fighting techniques", classes: ["Ranger"] },
			{ name: "Hunter's Mark", description: "Enhanced tracking and hunting abilities", classes: ["Ranger"] }
		];

		// Filter fighting styles available to the current class
		const availableStyles = allFightingStyles.filter(style =>
			style.classes.includes(currentClass)
		);

		// Check for already selected fighting styles to avoid duplicates
		const existingStyles = character.entries?.filter(entry =>
			entry.name?.includes('Fighting Style')
		).map(entry => entry.name) || [];

		const modalContent = `
			<p class="mb-3"><strong>Current Level:</strong> ${this.levelUpState.currentLevel}</p>
			<p class="mb-3"><strong>New Level:</strong> ${this.levelUpState.newLevel}</p>
			<h6>Choose Fighting Style (${currentClass})</h6>
			<p class="text-muted mb-3">Select a fighting style that matches your combat preferences. You cannot change this later.</p>

			<div class="form-group">
				<label for="fighting-style-select"><strong>Available Fighting Styles:</strong></label>
				<select class="form-control" id="fighting-style-select">
					<option value="">-- Select a Fighting Style --</option>
					${availableStyles.map(style => {
						const isAlreadySelected = existingStyles.some(existing => existing.includes(style.name));
						return `<option value="${style.name}" ${isAlreadySelected ? 'disabled' : ''}>${style.name}${isAlreadySelected ? ' (Already Selected)' : ''}</option>`;
					}).join('')}
				</select>
			</div>

			<div id="fighting-style-description" class="alert alert-info" style="display: none;">
				<strong id="style-name"></strong>
				<p id="style-description" class="mb-0 mt-2"></p>
			</div>
		`;

		// Create 5etools native modal
		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Level Up Character - Fighting Style",
			hasFooter: true
		});

		// Store modal close function
		this.levelUpModalClose = doClose;

		// Add content to modal
		$modalInner.html(modalContent);

		// Create footer buttons
		const $btnCancel = $(`<button class="ve-btn ve-btn-default mr-2">Cancel</button>`)
			.click(() => doClose(false));

		const $btnConfirm = $(`<button class="ve-btn ve-btn-primary" disabled>Select Fighting Style</button>`)
			.click(() => {
				const selectedStyle = $modalInner.find('#fighting-style-select').val();
				const styleData = fightingStyles.find(s => s.name === selectedStyle);

				// Store the fighting style choice
				this.levelUpState.choices.push({
					type: 'fightingStyle',
					feature: feature,
					styleName: selectedStyle,
					styleDescription: styleData.description
				});

				// Continue to next feature
				this.levelUpState.currentFeatureIndex++;
				doClose(true);
				this.showNextFeatureChoice();
			});

		$modalFooter.append($btnCancel, $btnConfirm);

		// Add change handler for fighting style selection
		$modalInner.find('#fighting-style-select').change((e) => {
			const selectedValue = e.target.value;
			const $btnConfirm = $modalFooter.find('.ve-btn-primary');

			if (selectedValue) {
				$btnConfirm.prop('disabled', false);
				const styleData = fightingStyles.find(s => s.name === selectedValue);

				// Show fighting style description
				$modalInner.find('#fighting-style-description').show();
				$modalInner.find('#style-name').text(styleData.name);
				$modalInner.find('#style-description').text(styleData.description);
			} else {
				$btnConfirm.prop('disabled', true);
				$modalInner.find('#fighting-style-description').hide();
			}
		});
	}

	// Metamagic choice for Sorcerers
	async showMetamagicChoiceModal(feature, featureData) {
		const character = this.levelUpState.characterData;

		const metamagicOptions = [
			{ name: "Careful Spell", description: "Protect allies from your area effect spells", cost: "1 sorcery point" },
			{ name: "Distant Spell", description: "Double a spell's range", cost: "1 sorcery point" },
			{ name: "Empowered Spell", description: "Reroll damage dice", cost: "1 sorcery point" },
			{ name: "Extended Spell", description: "Double a spell's duration", cost: "1 sorcery point" },
			{ name: "Heightened Spell", description: "Force disadvantage on a saving throw", cost: "3 sorcery points" },
			{ name: "Quickened Spell", description: "Cast a spell as a bonus action", cost: "2 sorcery points" },
			{ name: "Subtle Spell", description: "Cast without verbal or somatic components", cost: "1 sorcery point" },
			{ name: "Twinned Spell", description: "Target two creatures with a single-target spell", cost: "varies" }
		];

		// Check for already known metamagic options
		const existingMetamagic = character.entries?.filter(entry =>
			entry.name?.includes('Metamagic')
		).map(entry => entry.name) || [];

		// Determine how many options to choose (typically 2 at level 3, +1 more at levels 10, 17)
		const sorcererLevel = character.class?.find(cls => cls.name === 'Sorcerer')?.level || 1;
		const choiceCount = sorcererLevel >= 17 ? 1 : sorcererLevel >= 10 ? 1 : 2;

		const modalContent = `
			<p class="mb-3"><strong>Current Level:</strong> ${this.levelUpState.currentLevel}</p>
			<p class="mb-3"><strong>New Level:</strong> ${this.levelUpState.newLevel}</p>
			<h6>Choose Metamagic Options</h6>
			<p class="text-muted mb-3">Select ${choiceCount} metamagic option${choiceCount > 1 ? 's' : ''} to enhance your spellcasting.</p>

			<div class="row">
				${metamagicOptions.map(option => {
					const isAlreadyKnown = existingMetamagic.some(existing => existing.includes(option.name));
					return `
						<div class="col-md-6 mb-3">
							<div class="card ${isAlreadyKnown ? 'border-secondary' : ''}">
								<div class="card-body">
									<div class="form-check">
										<input class="form-check-input metamagic-checkbox"
											type="checkbox"
											value="${option.name}"
											id="metamagic-${option.name.replace(/\s+/g, '-')}"
											${isAlreadyKnown ? 'disabled' : ''}
											data-max-choices="${choiceCount}">
										<label class="form-check-label" for="metamagic-${option.name.replace(/\s+/g, '-')}">
											<strong>${option.name}</strong>
											${isAlreadyKnown ? '<span class="text-muted">(Known)</span>' : ''}
											<br><small class="text-muted">Cost: ${option.cost}</small>
											<br><span class="text-secondary">${option.description}</span>
										</label>
									</div>
								</div>
							</div>
						</div>
					`;
				}).join('')}
			</div>
		`;

		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Metamagic Selection",
			hasFooter: true,
			isWidth100: true
		});

		this.levelUpModalClose = doClose;
		$modalInner.html(modalContent);

		const $btnCancel = $(`<button class="ve-btn ve-btn-default mr-2">Cancel</button>`)
			.click(() => doClose(false));

		const $btnConfirm = $(`<button class="ve-btn ve-btn-primary" disabled>Confirm Selection</button>`)
			.click(() => {
				const selectedOptions = [];
				$modalInner.find('.metamagic-checkbox:checked').each(function() {
					const optionName = $(this).val();
					const optionData = metamagicOptions.find(opt => opt.name === optionName);
					selectedOptions.push(optionData);
				});

				this.levelUpState.choices.push({
					type: 'metamagic',
					feature: feature,
					selections: selectedOptions,
					count: choiceCount
				});

				this.levelUpState.currentFeatureIndex++;
				doClose(true);
				this.showNextFeatureChoice();
			});

		$modalFooter.append($btnCancel, $btnConfirm);

		// Handle checkbox validation
		$modalInner.find('.metamagic-checkbox').change(function() {
			const maxChoices = parseInt($(this).data('max-choices'));
			const checkedCount = $modalInner.find('.metamagic-checkbox:checked').length;
			const $confirmBtn = $modalFooter.find('.ve-btn-primary');

			// Disable other checkboxes if max reached
			if (checkedCount >= maxChoices) {
				$modalInner.find('.metamagic-checkbox:not(:checked)').prop('disabled', true);
			} else {
				$modalInner.find('.metamagic-checkbox:not(:disabled)').prop('disabled', false);
			}

			$confirmBtn.prop('disabled', checkedCount !== maxChoices);
		});
	}

	// Dragonborn ancestry choice
	async showDragonbornAncestryChoice(feature, raceData) {
		const dragonAncestries = [
			{ name: "Black", damageType: "Acid", breathWeapon: "5 by 30 ft. line (Dex. save)", resistance: "Acid" },
			{ name: "Blue", damageType: "Lightning", breathWeapon: "5 by 30 ft. line (Dex. save)", resistance: "Lightning" },
			{ name: "Brass", damageType: "Fire", breathWeapon: "5 by 30 ft. line (Dex. save)", resistance: "Fire" },
			{ name: "Bronze", damageType: "Lightning", breathWeapon: "5 by 30 ft. line (Dex. save)", resistance: "Lightning" },
			{ name: "Copper", damageType: "Acid", breathWeapon: "5 by 30 ft. line (Dex. save)", resistance: "Acid" },
			{ name: "Gold", damageType: "Fire", breathWeapon: "15 ft. cone (Dex. save)", resistance: "Fire" },
			{ name: "Green", damageType: "Poison", breathWeapon: "15 ft. cone (Con. save)", resistance: "Poison" },
			{ name: "Red", damageType: "Fire", breathWeapon: "15 ft. cone (Dex. save)", resistance: "Fire" },
			{ name: "Silver", damageType: "Cold", breathWeapon: "15 ft. cone (Con. save)", resistance: "Cold" },
			{ name: "White", damageType: "Cold", breathWeapon: "15 ft. cone (Con. save)", resistance: "Cold" }
		];

		const modalContent = `
			<h6>Choose Draconic Ancestry</h6>
			<p class="text-muted mb-3">Select your draconic heritage, which determines your breath weapon and damage resistance.</p>

			<div class="row">
				${dragonAncestries.map(ancestry => `
					<div class="col-md-6 mb-2">
						<div class="card">
							<div class="card-body p-2">
								<div class="form-check">
									<input class="form-check-input ancestry-radio"
										type="radio"
										name="dragonAncestry"
										value="${ancestry.name}"
										id="ancestry-${ancestry.name.toLowerCase()}">
									<label class="form-check-label" for="ancestry-${ancestry.name.toLowerCase()}">
										<strong>${ancestry.name} Dragon</strong>
										<br><small class="text-muted">
											${ancestry.damageType} damage • ${ancestry.breathWeapon}
											<br>Resistance: ${ancestry.resistance}
										</small>
									</label>
								</div>
							</div>
						</div>
					</div>
				`).join('')}
			</div>
		`;

		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Dragonborn Ancestry",
			hasFooter: true,
			isWidth100: true
		});

		this.levelUpModalClose = doClose;
		$modalInner.html(modalContent);

		const $btnCancel = $(`<button class="ve-btn ve-btn-default mr-2">Cancel</button>`)
			.click(() => doClose(false));

		const $btnConfirm = $(`<button class="ve-btn ve-btn-primary" disabled>Confirm Selection</button>`)
			.click(() => {
				const selectedAncestry = $modalInner.find('input[name="dragonAncestry"]:checked').val();
				const ancestryData = dragonAncestries.find(a => a.name === selectedAncestry);

				this.levelUpState.choices.push({
					type: 'dragonbornAncestry',
					feature: feature,
					ancestry: ancestryData
				});

				this.levelUpState.currentFeatureIndex++;
				doClose(true);
				this.showNextFeatureChoice();
			});

		$modalFooter.append($btnCancel, $btnConfirm);

		// Handle selection validation
		$modalInner.find('.ancestry-radio').change(() => {
			const hasSelection = $modalInner.find('input[name="dragonAncestry"]:checked').length > 0;
			$modalFooter.find('.ve-btn-primary').prop('disabled', !hasSelection);
		});
	}

	showExpertiseChoiceModal(feature, featureData) {
		// This would show skills available for expertise
		// For now, just show a generic choice modal
		this.showGenericFeatureChoiceModal(featureData);
	}

	showManeuverChoiceModal(feature, featureData) {
		// This would show available Battle Master maneuvers
		// For now, just show a generic choice modal
		this.showGenericFeatureChoiceModal(featureData);
	}

	showEldritchInvocationChoiceModal(feature, featureData) {
		// This would show available Warlock invocations
		// For now, just show a generic choice modal
		this.showGenericFeatureChoiceModal(featureData);
	}

	showPactBoonChoiceModal(feature, featureData) {
		// This would show Warlock pact boon choices
		// For now, just show a generic choice modal
		this.showGenericFeatureChoiceModal(featureData);
	}

	showFeatureSpellChoiceModal(feature, featureData) {
		// This would show spell choices for features that grant spells
		// For now, just show a generic choice modal
		this.showGenericFeatureChoiceModal(featureData);
	}

	showGenericFeatureChoiceModal(feature, featureData) {
		// Generic modal for features that have choices but aren't specifically implemented yet
		const modalContent = `
			<p class="mb-3"><strong>Current Level:</strong> ${this.levelUpState.currentLevel}</p>
			<p class="mb-3"><strong>New Level:</strong> ${this.levelUpState.newLevel}</p>
			<h6>Feature Choice Required</h6>
			<p class="text-muted mb-3">This feature requires choices that are not yet fully implemented in the UI.</p>
			<div class="alert alert-info">
				<strong>Feature:</strong> ${featureData.feature.name}<br>
				<strong>Action Required:</strong> Please manually add your choices to the character after creation.
			</div>
		`;

		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Feature Choice - Manual Selection Required",
			hasFooter: true
		});

		this.levelUpModalClose = doClose;
		$modalInner.html(modalContent);

		const $btnContinue = $(`<button class="ve-btn ve-btn-primary">Continue</button>`)
			.click(() => {
				// Just continue without storing specific choices
				this.levelUpState.currentFeatureIndex++;
				doClose(true);
				this.showNextFeatureChoice();
			});

		$modalFooter.append($btnContinue);
	}

	showGenericRacialChoiceModal(feature, raceData) {
		// Generic modal for racial choices
		this.showGenericFeatureChoiceModal(feature, { feature: { name: "Racial Feature Choice" } });
	}

	showGenericBackgroundChoiceModal(feature, backgroundData) {
		// Generic modal for background choices
		this.showGenericFeatureChoiceModal(feature, { feature: { name: "Background Feature Choice" } });
	}

	async showSpellChoiceModal(feature, featureData) {
		console.log('=== SPELL CHOICE MODAL CALLED ===');
		console.log('Feature:', feature);
		console.log('FeatureData:', featureData);
		console.log('Level up state:', this.levelUpState);

		// Show spell selection modal for spellcasting features
		const character = this.levelUpState.characterData;
		const classes = character.class || [];

		// Get current character data from editor to access known spells
		const editorText = this.ace.getValue();
		const currentCharacterData = JSON.parse(editorText);
		const currentSpells = currentCharacterData.spells?.levels || {};

		// Determine what spells to offer based on class/subclass
		let spellList = 'wizard'; // Default to wizard spells
		let schoolRestrictions = [];
		let cantripsToLearn = 0;
		let spellsToLearn = 0;

		// Check if this is an Eldritch Knight
		const hasEldritchKnight = classes.some(cls =>
			cls.subclass && cls.subclass.name === 'Eldritch Knight'
		);

		if (hasEldritchKnight) {
			spellList = 'wizard';
			schoolRestrictions = ['A', 'V']; // Abjuration and Evocation

			// Eldritch Knight spell progression based on Fighter level
			const fighterLevel = this.levelUpState.newLevel;
			if (fighterLevel === 3) {
				cantripsToLearn = 2;
				spellsToLearn = 3;
			} else if (fighterLevel === 4) {
				spellsToLearn = 1;
			} else if (fighterLevel === 7) {
				spellsToLearn = 1;
			} else if (fighterLevel === 8) {
				spellsToLearn = 1;
			} else if (fighterLevel === 10) {
				cantripsToLearn = 1;
				spellsToLearn = 1;
			} else if (fighterLevel === 11) {
				spellsToLearn = 1;
			} else if (fighterLevel === 13) {
				spellsToLearn = 1;
			} else if (fighterLevel === 14) {
				spellsToLearn = 1;
			} else if (fighterLevel === 16) {
				spellsToLearn = 1;
			} else if (fighterLevel === 19) {
				spellsToLearn = 1;
			} else if (fighterLevel === 20) {
				spellsToLearn = 1;
			}
		} else {
			// Handle primary spellcasting classes
			const primaryClass = (classes[0] && classes[0].name) ? classes[0].name : null;

			// Load class data to get proper spell progression
			try {
				const classData = await this.loadClassData(primaryClass);
				if (classData && classData.class && classData.class[0]) {
					const classInfo = classData.class[0];
					const level = this.levelUpState.newLevel;

					// Set spell list
					spellList = primaryClass.toLowerCase();

					// Calculate cantrips progression
					if (classInfo.cantripProgression && level <= classInfo.cantripProgression.length) {
						const currentCantrips = classInfo.cantripProgression[level - 1] || 0;
						const previousCantrips = level > 1 ? (classInfo.cantripProgression[level - 2] || 0) : 0;
						cantripsToLearn = Math.max(0, currentCantrips - previousCantrips);
					}

					// Calculate spells progression
					if (classInfo.spellsKnownProgressionFixed && level <= classInfo.spellsKnownProgressionFixed.length) {
						const currentSpells = classInfo.spellsKnownProgressionFixed[level - 1] || 0;
						const previousSpells = level > 1 ? (classInfo.spellsKnownProgressionFixed[level - 2] || 0) : 0;
						spellsToLearn = Math.max(0, currentSpells - previousSpells);
					} else if (classInfo.preparedSpells) {
						// For prepared spell casters like Cleric, Druid, Wizard at level 1
						if (level === 1) {
							if (primaryClass === 'Wizard') {
								spellsToLearn = 6; // Wizards start with 6 spells in spellbook
							} else {
								spellsToLearn = 2; // Base preparation for other prepared casters
							}
						} else if (primaryClass === 'Wizard' && level > 1) {
							// Wizards learn 2 spells per level from leveling up
							spellsToLearn = 2;
						}
					}

					// Handle half-casters that start spellcasting at level 2
					if ((primaryClass === 'Paladin' || primaryClass === 'Ranger') && level === 2) {
						if (classInfo.spellsKnownProgressionFixed) {
							spellsToLearn = classInfo.spellsKnownProgressionFixed[1] || 2; // Level 2 index
						} else {
							spellsToLearn = 2; // Default for half-casters starting
						}
					}
				} else {
					// Fallback for classes without data
					spellList = primaryClass ? primaryClass.toLowerCase() : 'wizard';

					if (primaryClass === 'Wizard' && this.levelUpState.newLevel === 1) {
						cantripsToLearn = 3;
						spellsToLearn = 6;
					} else if ((primaryClass === 'Sorcerer' || primaryClass === 'Bard') && this.levelUpState.newLevel === 1) {
						cantripsToLearn = 4;
						spellsToLearn = 2;
					} else if (primaryClass === 'Warlock' && this.levelUpState.newLevel === 1) {
						cantripsToLearn = 2;
						spellsToLearn = 2;
					}
				}
			} catch (error) {
				console.error('Error loading class data for spell progression:', error);
				// Use old hardcoded fallback
				spellList = primaryClass ? primaryClass.toLowerCase() : 'wizard';
				if (this.levelUpState.newLevel === 1) {
					cantripsToLearn = 2;
					spellsToLearn = 2;
				}
			}
		}

		// Gather available spells based on current character classes/subclasses
		const primaryClass = (classes[0] && classes[0].name) ? classes[0].name : null;
		const primarySubclass = (classes[0] && classes[0].subclass && classes[0].subclass.name) ? classes[0].subclass.name : null;

		// Determine max spell level based on character level using proper D&D 5e progression
		const maxSpellLevel = this.getMaxSpellLevelForCharacterLevel(this.levelUpState.newLevel, primaryClass);

		console.log("🔍 Spell Selection Debug:");
		console.log("- Primary Class:", primaryClass);
		console.log("- Character Level:", this.levelUpState.newLevel);
		console.log("- Max Spell Level:", maxSpellLevel);
		console.log("- Cantrips to Learn:", cantripsToLearn);
		console.log("- Spells to Learn:", spellsToLearn);
		console.log("- Spell List:", spellList);
		console.log("- School Restrictions:", schoolRestrictions);

		// Fix: Ensure level 1 full casters always get spells to learn if they have access to level 1 spells
		if (this.levelUpState.newLevel === 1 && maxSpellLevel >= 1 && spellsToLearn === 0) {
			console.log("🔧 FIXING: Level 1 character should be able to select spells but spellsToLearn is 0");
			const fullCasters = ["Bard", "Cleric", "Druid", "Sorcerer", "Warlock", "Wizard"];
			if (fullCasters.includes(primaryClass)) {
				if (primaryClass === "Wizard") {
					spellsToLearn = 6; // Wizards start with 6 spells in spellbook
				} else {
					spellsToLearn = 2; // Other full casters typically start with 2 spells known
				}
				console.log(`🔧 FIXED: Set spellsToLearn to ${spellsToLearn} for ${primaryClass}`);
			}
		}

		// Fix: Ensure wizards at any level > 1 get spells to learn
		if (primaryClass === 'Wizard' && this.levelUpState.newLevel > 1 && spellsToLearn === 0) {
			console.log("🔧 FIXING: Wizard above level 1 should learn 2 spells per level");
			spellsToLearn = 2;
			console.log(`🔧 FIXED: Set spellsToLearn to ${spellsToLearn} for ${primaryClass} level ${this.levelUpState.newLevel}`);
		}

		// Fetch lists of available spells for the expected spell list (e.g. wizard)
		const availableSpellsByLevel = {};
		try {
			const spellListClass = spellList; // e.g. 'wizard'

			// For cantrips and all available spell levels, pre-fetch lists
			for (let lvl = 0; lvl <= maxSpellLevel; lvl++) {
				availableSpellsByLevel[lvl] = await this.pGetAvailableSpellsForClass(spellListClass, primaryClass, primarySubclass, lvl, schoolRestrictions, character);
			}
		} catch (e) {
			// If fetching fails, fall back to simplified behaviour
			console.warn('Could not load spell lists for modal:', e);
		}

		console.log("📚 Available Spells by Level:");
		for (let lvl = 0; lvl <= maxSpellLevel; lvl++) {
			const spells = availableSpellsByLevel[lvl] || [];
			console.log(`- Level ${lvl}: ${spells.length} spells available`);
		}

		// Helper functions for spell formatting (since PageFilterSpells might not be available)
		const formatSpellTime = (timeObj) => {
			if (!timeObj) return "—";
			const unit = timeObj.unit || "";
			const number = timeObj.number || 1;

			// Handle special cases
			if (unit === "action") return "Action";
			if (unit === "bonus") return "Bonus";
			if (unit === "reaction") return "Reaction";
			if (unit === "minute" && number === 1) return "1 Min";
			if (unit === "hour" && number === 1) return "1 Hr";

			return `${number} ${unit}${number > 1 ? 's' : ''}`;
		};

		const formatSpellLevel = (spell) => {
			if (!spell) return "—";
			const level = spell.level || 0;
			if (level === 0) return "Cantrip";

			let levelStr = "";
			if (level === 1) levelStr = "1st";
			else if (level === 2) levelStr = "2nd";
			else if (level === 3) levelStr = "3rd";
			else levelStr = `${level}th`;

			// Add ritual indicator
			if (spell.meta && spell.meta.ritual) levelStr += " (rit.)";

			return levelStr;
		};

		// Track pre-selected spells to enforce limits
		const preSelectedCantrips = new Set();
		const preSelectedSpells = new Set();

		// Helper function to determine if a spell should be pre-selected
		const shouldPreSelectSpell = (spell, isCantrip, spellLevel = null) => {
			const actualSpellLevel = isCantrip ? 0 : (spellLevel || spell.level || 1);
			const isCurrentlyKnown = currentSpells[actualSpellLevel]?.spells?.includes(spell.name) || false;

			if (!isCurrentlyKnown) return false;

			// For spell swapping mode (no new spells to learn), pre-select existing spells
			if (cantripsToLearn === 0 && spellsToLearn === 0) return true;

			// For normal level up, respect slot limits
			if (isCantrip) {
				if (preSelectedCantrips.size < cantripsToLearn) {
					preSelectedCantrips.add(spell.name);
					return true;
				}
			} else {
				if (preSelectedSpells.size < spellsToLearn) {
					preSelectedSpells.add(spell.name);
					return true;
				}
			}
			return false;
		};

		// Helper function to build spell list item like spells page
		const buildSpellListItem = (spell, isCantrip, spellLevel = null) => {
			const school = Parser.spSchoolAndSubschoolsAbvsShort ?
				Parser.spSchoolAndSubschoolsAbvsShort(spell.school, spell.subschools) :
				(spell.school || "—");
			const time = formatSpellTime(spell.time?.[0]);
			const concentration = spell._isConc ? "×" : "";
			const range = Parser.spRangeToFull ?
				Parser.spRangeToFull(spell.range, {isDisplaySelfArea: true}) :
				(spell.range?.distance?.amount ? `${spell.range.distance.amount} ${spell.range.distance.type}` : "—");
			const levelText = formatSpellLevel(spell);
			const checkboxClass = isCantrip ? 'cantrip-checkbox' : 'spell-checkbox';
			const actualSpellLevel = isCantrip ? 0 : (spellLevel || spell.level || 1);

			// Use smart pre-selection that respects slot limits
			const checkedAttr = shouldPreSelectSpell(spell, isCantrip, spellLevel) ? 'checked' : '';

			// Get school style safely
			const schoolStyle = Parser.spSchoolAbvToStylePart ?
				Parser.spSchoolAbvToStylePart(spell.school) : "";
			const schoolTitle = Parser.spSchoolAndSubschoolsAbvsToFull ?
				Parser.spSchoolAndSubschoolsAbvsToFull(spell.school, spell.subschools) :
				school;

			// Create spell hash for hover functionality
			const spellHash = `${spell.name.toLowerCase().replace(/[^a-z0-9]/g, '')}|${spell.source}`;

			return `
				<div class="lst__row lst__row--sublist lst__row-border lst__row-inner clickable" data-spell-name="${spell.name}">
					<span class="ve-col-0-5 px-1 ve-text-center">
						<input type="checkbox" class="${checkboxClass}" value="${spell.name}" data-spell-level="${actualSpellLevel}" ${checkedAttr}>
					</span>
					<span class="bold ve-col-2-4 pl-0 pr-1 spell-name-hover" data-spell-hash="${spellHash}" data-spell-source="${spell.source}">${spell.name}</span>
					<span class="ve-col-1-5 px-1 ve-text-center">${levelText}</span>
					<span class="ve-col-1-7 px-1 ve-text-center">${time}</span>
					<span class="ve-col-1-2 px-1 sp__school-${spell.school} ve-text-center"
						  title="${schoolTitle}"
						  style="${schoolStyle}">${school}</span>
					<span class="ve-col-0-6 px-1 ve-text-center" title="Concentration">${concentration}</span>
					<span class="ve-col-2-4 px-1 ve-text-right">${range}</span>
				</div>
			`;
		};

		// Build spell lists dynamically using 5etools styling
		let modalContent = `
			<div class="mb-4 p-3 ve-flex-col">
				<h5 class="mb-2">${primaryClass} Spell Selection</h5>
				<p class="mb-1"><strong>Level:</strong> ${this.levelUpState.currentLevel} → <strong>${this.levelUpState.newLevel}</strong></p>
				<p class="mb-0"><strong>Spell List:</strong> ${spellList} • <strong>Max Spell Level:</strong> ${this.getMaxSpellLevelForCharacterLevel(this.levelUpState.newLevel, primaryClass)}</p>
			</div>
		`;

		// Add cantrips section if needed
		if (cantripsToLearn > 0) {
			const cantrips = availableSpellsByLevel[0] || [];
			modalContent += `
				<div class="mb-4 p-3 border rounded" >
					<div class="ve-flex-v-center mb-3">
						<h5 class="mr-auto mb-0 text-success"><i class="fa fa-magic" aria-hidden="true"></i> Cantrips - Choose ${cantripsToLearn}</h5>
						<div class="badge badge-success badge-pill px-3 py-2">
							<span class="cantrip-count">0</span>/${cantripsToLearn} Selected
						</div>
					</div>

					<!-- Header row matching spells page -->
					<div class="lst__row lst__row--sublist-header">
						<span class="ve-col-0-5 px-1"></span>
						<span class="bold ve-col-2-4 pl-0 pr-1">Name</span>
						<span class="ve-col-1-5 px-1 ve-text-center">Level</span>
						<span class="ve-col-1-7 px-1 ve-text-center">Time</span>
						<span class="ve-col-1-2 px-1 ve-text-center">School</span>
						<span class="ve-col-0-6 px-1 ve-text-center" title="Concentration">C.</span>
						<span class="ve-col-2-4 px-1 ve-text-right">Range</span>
					</div>

					<div class="lst__wrp-rows">
						${cantrips.map(spell => buildSpellListItem(spell, true)).join('')}
					</div>
				</div>
			`;
		}

		// Add spell sections for available spell levels
		if (spellsToLearn > 0) {

			// Show spells for levels 1 through maxSpellLevel
			for (let spellLevel = 1; spellLevel <= maxSpellLevel; spellLevel++) {
				const spellsAtLevel = availableSpellsByLevel[spellLevel] || [];
				if (spellsAtLevel.length > 0) {
					const levelName = spellLevel === 1 ? '1st' : spellLevel === 2 ? '2nd' : spellLevel === 3 ? '3rd' : `${spellLevel}th`;
					modalContent += `
						<div class="mb-4 p-3 border rounded" >
							<div class="ve-flex-v-center mb-3">
								<h5 class="mr-auto mb-0 text-primary"><i class="fa fa-star" aria-hidden="true"></i> ${levelName} Level Spells</h5>
								<div class="badge badge-primary badge-pill px-3 py-2">
									${spellsAtLevel.length} Available
								</div>
							</div>

							<!-- Header row matching spells page -->
							<div class="lst__row lst__row--sublist-header">
								<span class="ve-col-0-5 px-1"></span>
								<span class="bold ve-col-2-4 pl-0 pr-1">Name</span>
								<span class="ve-col-1-5 px-1 ve-text-center">Level</span>
								<span class="ve-col-1-7 px-1 ve-text-center">Time</span>
								<span class="ve-col-1-2 px-1 ve-text-center">School</span>
								<span class="ve-col-0-6 px-1 ve-text-center" title="Concentration">C.</span>
								<span class="ve-col-2-4 px-1 ve-text-right">Range</span>
							</div>

							<div class="lst__wrp-rows">
								${spellsAtLevel.map(spell => buildSpellListItem(spell, false, spellLevel)).join('')}
							</div>
						</div>
					`;
				}
			}

			// Add selection counter info
			modalContent += `
				<div class="alert alert-info">
					<div class="ve-flex-v-center">
						<div class="mr-auto">
							<h6 class="mb-1"><i class="fa fa-info-circle" aria-hidden="true"></i> Spell Selection Instructions</h6>
							<p class="mb-0">Select <strong>${spellsToLearn} spell${spellsToLearn > 1 ? 's' : ''}</strong> from any available level above.</p>
						</div>
						<div class="badge badge-info badge-pill px-3 py-2">
							<span class="spell-count">0</span>/${spellsToLearn} Selected
						</div>
					</div>
				</div>
			`;
		}

		if (cantripsToLearn === 0 && spellsToLearn === 0) {
			modalContent += `
				<div class="alert alert-warning">
					<div class="ve-flex-v-center">
						<div class="mr-auto">
							<h6 class="mb-1"><i class="fa fa-exchange-alt" aria-hidden="true"></i> Spell Management</h6>
							<p class="mb-0">No new spells gained this level, but you can <strong>replace existing spells</strong> with others of the same level or lower.</p>
						</div>
					</div>
				</div>
			`;

			// Always show available spells for replacement, even if no new spells are gained
			// First show cantrips for swapping
			const cantrips = availableSpellsByLevel[0] || [];
			if (cantrips.length > 0) {
				modalContent += `
					<div class="mb-4 p-3 border rounded" >
						<div class="ve-flex-v-center mb-3">
							<h5 class="mr-auto mb-0 text-secondary"><i class="fa fa-magic" aria-hidden="true"></i> Cantrips</h5>
							<div class="badge badge-secondary badge-pill px-3 py-2">
								${cantrips.length} Available for Replacement
							</div>
						</div>

						<!-- Header row matching spells page -->
						<div class="lst__row lst__row--sublist-header">
							<span class="ve-col-0-5 px-1"></span>
							<span class="bold ve-col-2-4 pl-0 pr-1">Name</span>
							<span class="ve-col-1-5 px-1 ve-text-center">Level</span>
							<span class="ve-col-1-7 px-1 ve-text-center">Time</span>
							<span class="ve-col-1-2 px-1 ve-text-center">School</span>
							<span class="ve-col-0-6 px-1 ve-text-center" title="Concentration">C.</span>
							<span class="ve-col-2-4 px-1 ve-text-right">Range</span>
						</div>

						<div class="lst__wrp-rows">
							${cantrips.map(spell => buildSpellListItem(spell, true)).join('')}
						</div>
					</div>
				`;
			}

			// Then show spells for swapping
			for (let spellLevel = 1; spellLevel <= this.getMaxSpellLevelForCharacterLevel(this.levelUpState.newLevel, primaryClass); spellLevel++) {
				const spellsAtLevel = availableSpellsByLevel[spellLevel] || [];
				if (spellsAtLevel.length > 0) {
					const levelName = spellLevel === 1 ? '1st' : spellLevel === 2 ? '2nd' : spellLevel === 3 ? '3rd' : `${spellLevel}th`;
					modalContent += `
						<div class="mb-4 p-3 border rounded" >
							<div class="ve-flex-v-center mb-3">
								<h5 class="mr-auto mb-0 text-secondary"><i class="fa fa-star" aria-hidden="true"></i> ${levelName} Level Spells</h5>
								<div class="badge badge-secondary badge-pill px-3 py-2">
									${spellsAtLevel.length} Available for Replacement
								</div>
							</div>

							<!-- Header row matching spells page -->
							<div class="lst__row lst__row--sublist-header">
								<span class="ve-col-0-5 px-1"></span>
								<span class="bold ve-col-2-4 pl-0 pr-1">Name</span>
								<span class="ve-col-1-5 px-1 ve-text-center">Level</span>
								<span class="ve-col-1-7 px-1 ve-text-center">Time</span>
								<span class="ve-col-1-2 px-1 ve-text-center">School</span>
								<span class="ve-col-0-6 px-1 ve-text-center" title="Concentration">C.</span>
								<span class="ve-col-2-4 px-1 ve-text-right">Range</span>
							</div>

							<div class="lst__wrp-rows">
								${spellsAtLevel.map(spell => buildSpellListItem(spell, false, spellLevel)).join('')}
							</div>
						</div>
					`;
				}
			}
		}

		// Create 5etools native modal with lower z-index to allow tooltips to appear above
		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Level Up Character - Spell Selection",
			hasFooter: true,
			isWidth100: true,
			isUncappedHeight: true,
			isHeaderBorder: true,
			isMinHeight0: true,
			zIndex: 999
		});

		// Store modal close function
		this.levelUpModalClose = doClose;

		// Add content to modal
		$modalInner.html(modalContent);

		// Note: Spell hover functionality is now handled automatically by the 5etools renderer

		// Create footer buttons with enhanced styling
		const $btnCancel = $(`<button class="ve-btn ve-btn-default ve-btn-lg mr-3" style="min-width: 120px;">
			<i class="fa fa-times" aria-hidden="true"></i> Cancel
		</button>`)
			.click(() => doClose(false));

		const hasNewSpells = cantripsToLearn > 0 || spellsToLearn > 0;
		const buttonText = hasNewSpells ? "Confirm Spell Selection" : "Confirm Spell Changes";
		const $btnConfirm = $(`<button class="ve-btn ve-btn-success ve-btn-lg" style="min-width: 180px;" ${hasNewSpells ? 'disabled' : ''}>
			<i class="fa fa-check" aria-hidden="true"></i> ${buttonText}
		</button>`)
			.click(() => {
				// Collect spell selections from checkboxes by their actual spell levels
				const spellSelections = {};

				// Collect selected cantrips (level 0)
				$modalInner.find('.cantrip-checkbox:checked').each((i, el) => {
					if (!spellSelections['0']) spellSelections['0'] = [];
					spellSelections['0'].push($(el).val());
				});

				// Collect selected spells by their actual levels
				$modalInner.find('.spell-checkbox:checked').each((i, el) => {
					const $checkbox = $(el);
					const spellLevel = $checkbox.data('spell-level') || '1';
					if (!spellSelections[spellLevel]) spellSelections[spellLevel] = [];
					spellSelections[spellLevel].push($checkbox.val());
				});

				// For backward compatibility, also populate the old format
				const legacySpellSelections = {
					cantrips: spellSelections['0'] || [],
					spells: []
				};
				// Flatten all non-cantrip spells into the generic 'spells' array for legacy code
				Object.keys(spellSelections).forEach(level => {
					if (level !== '0') {
						legacySpellSelections.spells.push(...spellSelections[level]);
					}
				});

				// Validate selection counts using legacy format for compatibility
				const cantripsSelected = legacySpellSelections.cantrips.length;
				const spellsSelected = legacySpellSelections.spells.length;

				if (cantripsToLearn > 0 && cantripsSelected !== cantripsToLearn) {
					alert(`Please select exactly ${cantripsToLearn} cantrip${cantripsToLearn > 1 ? 's' : ''}. You have selected ${cantripsSelected}.`);
					return;
				}

				if (spellsToLearn > 0 && spellsSelected !== spellsToLearn) {
					alert(`Please select exactly ${spellsToLearn} spell${spellsToLearn > 1 ? 's' : ''}. You have selected ${spellsSelected}.`);
					return;
				}

				// Store the spell choices
				this.levelUpState.choices.push({
					type: 'spells',
					feature: feature,
					selections: spellSelections,
					spellList: spellList,
					schoolRestrictions: schoolRestrictions
				});

				// Continue to next feature
				this.levelUpState.currentFeatureIndex++;
				doClose(true);
				this.showNextFeatureChoice();
			});

		$modalFooter.append($btnCancel, $btnConfirm);

		// Add spell row interaction (clicking row toggles checkbox)
		$modalInner.find('.lst__row.clickable').on('click', function(e) {
			if (e.target.type === 'checkbox') return; // Don't double-toggle
			const $checkbox = $(this).find('input[type="checkbox"]');
			if (!$checkbox.prop('disabled')) {
				$checkbox.prop('checked', !$checkbox.prop('checked')).trigger('change');
			}
		});

		// Add checkbox interaction logic
		const updateCounters = () => {
			const cantripCount = $modalInner.find('.cantrip-checkbox:checked').length;
			const spellCount = $modalInner.find('.spell-checkbox:checked').length;

			$modalInner.find('.cantrip-count').text(cantripCount);
			$modalInner.find('.spell-count').text(spellCount);

			// Handle cantrip limits - allow deselection and reselection up to the limit
			if (cantripsToLearn > 0) {
				if (cantripCount >= cantripsToLearn) {
					// At limit: disable only unchecked checkboxes, allow deselecting checked ones
					$modalInner.find('.cantrip-checkbox:not(:checked)').prop('disabled', true);
					$modalInner.find('.cantrip-checkbox:not(:checked)').closest('.lst__row').addClass('lst__row--disabled');
					$modalInner.find('.cantrip-checkbox:checked').prop('disabled', false);
				} else {
					// Under limit: enable all cantrip checkboxes
					$modalInner.find('.cantrip-checkbox').prop('disabled', false);
					$modalInner.find('.cantrip-checkbox').closest('.lst__row').removeClass('lst__row--disabled');
				}
			}

			// Handle spell limits - allow deselection and reselection up to the limit
			if (spellsToLearn > 0) {
				if (spellCount >= spellsToLearn) {
					// At limit: disable only unchecked checkboxes, allow deselecting checked ones
					$modalInner.find('.spell-checkbox:not(:checked)').prop('disabled', true);
					$modalInner.find('.spell-checkbox:not(:checked)').closest('.lst__row').addClass('lst__row--disabled');
					$modalInner.find('.spell-checkbox:checked').prop('disabled', false);
				} else {
					// Under limit: enable all spell checkboxes
					$modalInner.find('.spell-checkbox').prop('disabled', false);
					$modalInner.find('.spell-checkbox').closest('.lst__row').removeClass('lst__row--disabled');
				}
			}

			// For spell swapping mode (no new spells), always enable all checkboxes
			if (cantripsToLearn === 0 && spellsToLearn === 0) {
				$modalInner.find('.cantrip-checkbox, .spell-checkbox').prop('disabled', false);
				$modalInner.find('.lst__row').removeClass('lst__row--disabled');
			}

			// Highlight selected rows
			$modalInner.find('.cantrip-checkbox:checked, .spell-checkbox:checked').closest('.lst__row').addClass('lst__row--selected');
			$modalInner.find('.cantrip-checkbox:not(:checked), .spell-checkbox:not(:checked)').closest('.lst__row').removeClass('lst__row--selected');

			// Update confirm button state
			// Allow confirmation if:
			// 1. New spells are required and correct counts are selected, OR
			// 2. No new spells required (spell swapping mode) - always allow
			const hasNewSpellsToLearn = cantripsToLearn > 0 || spellsToLearn > 0;
			const isValid = hasNewSpellsToLearn ?
				((cantripsToLearn === 0 || cantripCount === cantripsToLearn) &&
				 (spellsToLearn === 0 || spellCount === spellsToLearn)) :
				true; // Always valid for spell swapping
			$btnConfirm.prop('disabled', !isValid);
		};

		// Add event listeners for checkboxes
		$modalInner.find('.cantrip-checkbox, .spell-checkbox').on('change', updateCounters);
		updateCounters(); // Initial update
	}

	/**
	 * Return a list of available spells (names) for a given class/subclass and spell level.
	 * This uses the site's Renderer.spell lookup helpers to derive spells available to a class.
	 */
	async pGetAvailableSpellsForClass(classTag, className, subclassName, level, schoolRestrictions = [], character = null) {
		// COMPREHENSIVE spell loading - includes ALL sources: class, subclass, race, background
		try {
			const allSpells = await DataLoader.pCacheAndGetAllSite(UrlUtil.PG_SPELLS);
			console.log(`Loading spells for ${className || classTag}, level ${level}, found ${allSpells.length} total spells`);

			// Filter spells by ALL sources and return full spell objects
			const filteredSpells = allSpells
				.filter(sp => sp.level === level)
				.filter(sp => {
					// Check ALL combined spell sources
					const fromClasses = Renderer.spell.getCombinedClasses(sp, 'fromClassList') || [];
					const fromSubclasses = Renderer.spell.getCombinedClasses(sp, 'fromSubclass') || [];
					const fromVariantClasses = Renderer.spell.getCombinedClasses(sp, 'fromClassListVariant') || [];
					const fromRaces = Renderer.spell.getCombinedClasses(sp, 'fromRaces') || [];
					const fromBackgrounds = Renderer.spell.getCombinedClasses(sp, 'fromBackgrounds') || [];

					// Check if spell is available to this class
					const targetClass = (className || classTag).toLowerCase();
					let matchesClass = fromClasses.some(c => c.name && c.name.toLowerCase() === targetClass) ||
					                  fromVariantClasses.some(c => c.name && c.name.toLowerCase() === targetClass);

					// Check subclass expanded spells if subclass is specified
					if (!matchesClass && subclassName) {
						const targetSubclass = subclassName.toLowerCase();
						matchesClass = fromSubclasses.some(sc =>
							sc.subclass && sc.subclass.name && sc.subclass.name.toLowerCase() === targetSubclass &&
							sc.class && sc.class.name && sc.class.name.toLowerCase() === targetClass
						);
					}

					// Check racial spells if character data provided
					if (!matchesClass && character && character.race) {
						const raceName = typeof character.race === 'string' ? character.race : character.race.name;
						if (raceName) {
							matchesClass = fromRaces.some(r => r.name && r.name.toLowerCase().includes(raceName.toLowerCase()));
						}
					}

					// Check background spells if character data provided
					if (!matchesClass && character && character.background) {
						const backgroundName = typeof character.background === 'string' ? character.background : character.background.name;
						if (backgroundName) {
							matchesClass = fromBackgrounds.some(b => b.name && b.name.toLowerCase().includes(backgroundName.toLowerCase()));
						}
					}

					// If no match from any source, exclude this spell
					if (!matchesClass) return false;

					// Apply school restrictions if provided (schoolRestrictions are school initials)
					if (schoolRestrictions && schoolRestrictions.length) {
						const sch = sp.school ? sp.school.charAt(0).toUpperCase() : '';
						if (!schoolRestrictions.includes(sch)) return false;
					}

					return true;
				})
				.sort((a, b) => a.name.localeCompare(b.name));

			console.log(`Found ${filteredSpells.length} spells for ${className || classTag} at level ${level} (including ALL sources):`, filteredSpells.slice(0, 5).map(sp => sp.name));
			return filteredSpells; // Return full spell objects, not just names
		} catch (e) {
			console.warn('pGetAvailableSpellsForClass failed', e);
			return [];
		}
	}

	showManeuverChoiceModal(feature, featureData) {
		// This would show Battle Master maneuver choices
		// For now, just show a generic choice modal
		this.showGenericFeatureChoiceModal(featureData);
	}

	showGenericFeatureChoiceModal(featureData) {
		const feature = featureData.feature;

		// Create a generic modal for features that have choices but aren't specifically handled yet
		const modalContent = `
			<p class="mb-3"><strong>Current Level:</strong> ${this.levelUpState.currentLevel}</p>
			<p class="mb-3"><strong>New Level:</strong> ${this.levelUpState.newLevel}</p>
			<h6>${feature.name}</h6>
			<div class="mb-3">
				${feature.entries ? feature.entries.map(entry => `<p>${entry}</p>`).join('') : '<p>This feature requires a choice.</p>'}
			</div>

			<div class="alert alert-info">
				<strong>Note:</strong> This feature contains choices that need to be implemented.
				For now, the feature will be added automatically. Please consult your DM or the Player's Handbook for the specific choices available.
			</div>

			<div class="form-group">
				<label for="feature-notes">Optional Notes:</label>
				<textarea class="form-control" id="feature-notes" rows="3" placeholder="Add any notes about your choice (e.g., 'Selected Archery fighting style')"></textarea>
			</div>
		`;

		// Create 5etools native modal
		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: `Level Up Character - ${feature.name}`,
			hasFooter: true
		});

		// Store modal close function
		this.levelUpModalClose = doClose;

		// Add content to modal
		$modalInner.html(modalContent);

		// Create footer buttons
		const $btnCancel = $(`<button class="ve-btn ve-btn-default mr-2">Cancel</button>`);
		const $btnConfirm = $(`<button class="ve-btn ve-btn-primary">Add Feature</button>`);

		$modalFooter.append($btnCancel, $btnConfirm);

		// Add event handlers after buttons are added to DOM
		$btnCancel.click(() => {
			console.log('Generic feature modal: Cancel clicked');
			doClose(false);
		});

		$btnConfirm.click(() => {
			console.log('Generic feature modal: Add Feature clicked');
			const notes = $modalInner.find('#feature-notes').val().trim();

			// Store the choice (even if it's just a note)
			this.levelUpState.choices.push({
				type: 'generic',
				feature: feature,
				notes: notes || 'Feature added automatically'
			});

			// Continue to next feature
			this.levelUpState.currentFeatureIndex++;
			doClose(true);

			// Use setTimeout to ensure modal is properly closed before next one opens
			setTimeout(() => {
				this.showNextFeatureChoice();
			}, 100);
		});
	}

	// Keep the old method name for compatibility
	showOldAbilityScoreImprovementModal(feature) {
		const character = this.levelUpState.characterData;
		const abilities = character.abilities || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

		const modalContent = `
			<p class="mb-3"><strong>Current Level:</strong> ${this.levelUpState.currentLevel}</p>
			<p class="mb-3"><strong>New Level:</strong> ${this.levelUpState.newLevel}</p>
			<h6>Ability Score Improvement</h6>
			<p class="text-muted mb-3">${feature.entries[0]}</p>

			<div class="row">
				<div class="col-md-6">
					<h6>Option 1: Increase one ability by 2</h6>
					<div class="form-group">
						<label for="singleAbility">Choose ability:</label>
						<select class="form-control" id="singleAbility">
							<option value="">Select an ability...</option>
							${Object.entries(abilities).map(([ability, score]) =>
								`<option value="${ability}" ${score >= 20 ? 'disabled' : ''}>${ability.toUpperCase()} (${score}${score >= 20 ? ' - Max' : ''})</option>`
							).join('')}
						</select>
					</div>
				</div>
				<div class="col-md-6">
					<h6>Option 2: Increase two abilities by 1 each</h6>
					<div class="form-group">
						<label for="firstAbility">First ability:</label>
						<select class="form-control" id="firstAbility">
							<option value="">Select an ability...</option>
							${Object.entries(abilities).map(([ability, score]) =>
								`<option value="${ability}" ${score >= 20 ? 'disabled' : ''}>${ability.toUpperCase()} (${score}${score >= 20 ? ' - Max' : ''})</option>`
							).join('')}
						</select>
					</div>
					<div class="form-group">
						<label for="secondAbility">Second ability:</label>
						<select class="form-control" id="secondAbility">
							<option value="">Select an ability...</option>
							${Object.entries(abilities).map(([ability, score]) =>
								`<option value="${ability}" ${score >= 20 ? 'disabled' : ''}>${ability.toUpperCase()} (${score}${score >= 20 ? ' - Max' : ''})</option>`
							).join('')}
						</select>
					</div>
				</div>
			</div>
		`;

		// Create 5etools native modal
		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: "Level Up Character - Ability Score Improvement",
			hasFooter: true
		});

		// Store modal close function
		this.levelUpModalClose = doClose;

		// Add content to modal
		$modalInner.html(modalContent);

		// Create footer buttons
		const $btnCancel = $(`<button class="ve-btn ve-btn-default mr-2">Cancel</button>`)
			.click(() => doClose(false));

		const $btnConfirm = $(`<button class="ve-btn ve-btn-primary" disabled>Confirm Selection</button>`)
			.click(() => {
				const singleAbility = $modalInner.find('#singleAbility').val();
				const firstAbility = $modalInner.find('#firstAbility').val();
				const secondAbility = $modalInner.find('#secondAbility').val();

				let abilityChanges = {};

				if (singleAbility) {
					abilityChanges[singleAbility] = 2;
				} else if (firstAbility && secondAbility && firstAbility !== secondAbility) {
					abilityChanges[firstAbility] = 1;
					abilityChanges[secondAbility] = 1;
				}

				// Store the ASI choice
				this.levelUpState.choices.push({
					type: 'abilityScoreImprovement',
					feature: feature,
					abilityChanges: abilityChanges
				});

				// Immediately apply ASI changes to the character in the editor
				this.applyASIChangesToEditor(abilityChanges);

				// Continue to next feature
				this.levelUpState.currentFeatureIndex++;
				doClose(true);
				this.showNextFeatureChoice();
			});

		$modalFooter.append($btnCancel, $btnConfirm);

		// Validation logic
		const validateSelection = () => {
			const firstAbility = $modalInner.find('#firstAbility').val();
			const secondAbility = $modalInner.find('#secondAbility').val();

			// Both abilities must be selected and under 20
			const isValid = firstAbility && secondAbility &&
				abilities[firstAbility] < 20 &&
				abilities[secondAbility] < 20;

			$btnConfirm.prop('disabled', !isValid);
		};

		// Add event listeners
		$modalInner.find('#firstAbility, #secondAbility').on('change', validateSelection);

		// No need for clearing logic since we only have the two-ability selection now
	}

	async showOptionalFeatureChoice(featureData) {
		try {
			// Load optional features based on feature type
			const optionalFeatures = await this.loadOptionalFeatures(featureData.feature.featureType);

			// Create modal content
			const modalContent = `
				<p class="mb-3"><strong>Current Level:</strong> ${this.levelUpState.currentLevel}</p>
				<p class="mb-3"><strong>New Level:</strong> ${this.levelUpState.newLevel}</p>
				<h6>Choose ${featureData.feature.name} (${featureData.count} selection${featureData.count > 1 ? 's' : ''}):</h6>
				<div class="row">
					${optionalFeatures.map((opt, index) => `
						<div class="col-md-6 mb-2">
							<div class="card">
								<div class="card-body">
									<h6 class="card-title">${opt.name}</h6>
									<p class="card-text small">${opt.entries ? opt.entries.slice(0, 2).join(' ') : 'No description available'}</p>
									<button type="button" class="ve-btn ve-btn-xs ve-btn-outline-primary" data-feature-index="${index}">
										Select
									</button>
								</div>
							</div>
						</div>
					`).join('')}
				</div>
				<div class="mt-3">
					<strong>Selected (<span id="selectedCount">0</span>/${featureData.count}):</strong>
					<ul id="selectedFeaturesList"></ul>
				</div>
			`;

			// Create 5etools native modal
			const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
				title: "Level Up Character - Choose Features",
				hasFooter: true
			});

			// Store modal close function
			this.levelUpModalClose = doClose;

			// Add content to modal
			$modalInner.html(modalContent);

			// Initialize selection state
			this.selectedOptionalFeatures = [];
			this.maxOptionalFeatures = featureData.count;
			this.currentOptionalFeatures = optionalFeatures;

			// Create footer buttons
			const $btnCancel = $(`<button class="ve-btn ve-btn-default mr-2">Cancel</button>`)
				.click(() => doClose(false));

			const $btnConfirm = $(`<button class="ve-btn ve-btn-primary" disabled>Confirm Selection</button>`)
				.click(() => {
					// Save selections
					this.levelUpState.choices.push({
						type: 'optional',
						selections: [...this.selectedOptionalFeatures]
					});

					// Continue to next feature
					this.levelUpState.currentFeatureIndex++;
					doClose(true);
					this.showNextFeatureChoice();
				});

			$modalFooter.append($btnCancel, $btnConfirm);

			// Add selection handlers using the modal context
			$modalInner.find('button[data-feature-index]').each((index, btn) => {
				$(btn).click(() => {
					const featureIndex = parseInt(btn.dataset.featureIndex);
					this.selectOptionalFeatureInModal(optionalFeatures[featureIndex], $(btn), $modalInner, $btnConfirm);
				});
			});

		} catch (e) {
			console.error('Error showing optional feature choice:', e);
			// Skip this feature and continue
			this.levelUpState.currentFeatureIndex++;
			await this.showNextFeatureChoice();
		}
	}

	applyASIChangesToEditor(abilityChanges) {
		// Apply changes to levelUpState.characterData instead of reading from editor
		// This preserves all other level up changes (like class level increases)
		const currentCharacterData = this.levelUpState.characterData;

		// Check if character uses nested abilities object or direct properties
		const hasNestedAbilities = 'abilities' in currentCharacterData;

		console.log('Applying ASI changes to levelUpState.characterData:');
		console.log('Character format - has nested abilities:', hasNestedAbilities);

		if (hasNestedAbilities) {
			// Handle nested abilities format
			if (!currentCharacterData.abilities) {
				currentCharacterData.abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
			}

			console.log('Before (nested):', JSON.stringify(currentCharacterData.abilities));

			Object.entries(abilityChanges).forEach(([ability, increase]) => {
				const oldValue = currentCharacterData.abilities[ability] || 10;
				const newValue = Math.min(20, oldValue + increase);
				console.log(`ASI: ${ability} ${oldValue} -> ${newValue} (+${increase})`);
				currentCharacterData.abilities[ability] = newValue;
			});

			console.log('After (nested):', JSON.stringify(currentCharacterData.abilities));
		} else {
			// Handle direct properties format
			const beforeAbilities = {
				str: currentCharacterData.str || 10,
				dex: currentCharacterData.dex || 10,
				con: currentCharacterData.con || 10,
				int: currentCharacterData.int || 10,
				wis: currentCharacterData.wis || 10,
				cha: currentCharacterData.cha || 10
			};

			console.log('Before (direct):', JSON.stringify(beforeAbilities));

			Object.entries(abilityChanges).forEach(([ability, increase]) => {
				const oldValue = currentCharacterData[ability] || 10;
				const newValue = Math.min(20, oldValue + increase);
				console.log(`ASI: ${ability} ${oldValue} -> ${newValue} (+${increase})`);
				currentCharacterData[ability] = newValue;
			});

			const afterAbilities = {
				str: currentCharacterData.str || 10,
				dex: currentCharacterData.dex || 10,
				con: currentCharacterData.con || 10,
				int: currentCharacterData.int || 10,
				wis: currentCharacterData.wis || 10,
				cha: currentCharacterData.cha || 10
			};

			console.log('After (direct):', JSON.stringify(afterAbilities));
		}

		// Update the editor with modified character data from levelUpState
		this.ace.setValue(JSON.stringify(currentCharacterData, null, 2), 1);

		// Re-render the character to show updated stats immediately
		this.renderCharacter();
	}

	async loadOptionalFeatures(featureTypes) {
		// This would load from 5etools optional feature data
		// For now, return some basic Fighting Style examples
		if (featureTypes && featureTypes.includes('FS:F')) {
			return [
				{
					name: "Archery",
					entries: ["You gain a +2 bonus to attack rolls you make with ranged weapons."]
				},
				{
					name: "Defense",
					entries: ["While you are wearing armor, you gain a +1 bonus to AC."]
				},
				{
					name: "Dueling",
					entries: ["When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon."]
				},
				{
					name: "Great Weapon Fighting",
					entries: ["When you roll a 1 or 2 on a damage die for an attack you make with a melee weapon that you are wielding with two hands, you can reroll the die and must use the new roll."]
				}
			];
		}
		return [];
	}

	selectOptionalFeatureInModal(feature, $buttonElement, $modalInner, $btnConfirm) {
		if (this.selectedOptionalFeatures.length >= this.maxOptionalFeatures) {
			return;
		}

		this.selectedOptionalFeatures.push(feature);
		$buttonElement.prop('disabled', true);
		$buttonElement.text('Selected');
		$buttonElement.removeClass('ve-btn-outline-primary');
		$buttonElement.addClass('ve-btn-success');

		// Update selected list within modal
		const $selectedList = $modalInner.find('#selectedFeaturesList');
		const $selectedCount = $modalInner.find('#selectedCount');

		$selectedList.html(this.selectedOptionalFeatures.map(f => `<li>${f.name}</li>`).join(''));
		$selectedCount.text(this.selectedOptionalFeatures.length);

		// Enable confirm button if we have enough selections
		if (this.selectedOptionalFeatures.length === this.maxOptionalFeatures) {
			$btnConfirm.prop('disabled', false);
		}
	}

	showLevelUpSummary() {
		// Calculate what will change with this level up
		const character = this.levelUpState.characterData;
		const oldTotalLevel = this.levelUpState.currentLevel;
		const newTotalLevel = this.levelUpState.newLevel;

		// Calculate HP gain
		let hpGain = 0;
		const selectedClassIndex = this.levelUpState.selectedClassIndex;
		if (selectedClassIndex !== undefined && character.class && character.class[selectedClassIndex]) {
			const cls = character.class[selectedClassIndex];
			const hitDie = this.getClassHitDie(cls.name, character);
			const conMod = Math.floor(((character.abilities?.con || character.con || 10) - 10) / 2);

			// Calculate expected HP gain (average)
			const dieAverage = Math.floor(hitDie / 2) + 1;
			hpGain = dieAverage + conMod;
		}

		// Get current character HP
		let currentMaxHP = 0;
		if (character.hitPoints?.max) {
			currentMaxHP = character.hitPoints.max;
		} else if (character.hp?.max) {
			currentMaxHP = character.hp.max;
		}

		// Collect features being gained
		const newFeatures = [];
		if (this.levelUpState.pendingFeatures) {
			this.levelUpState.pendingFeatures.forEach(featureData => {
				newFeatures.push({
					name: featureData.feature.name,
					description: featureData.feature.entries?.[0] || 'New feature gained',
					source: featureData.className
				});
			});
		}

		// Collect all changes made during level up
		const changes = {
			abilityScores: [],
			spellSlots: [],
			spellsKnown: [],
			actionsAdded: [],
			featuresAdded: [],
			choicesMade: []
		};

		// Track ability score changes
		if (this.levelUpState.choices) {
			this.levelUpState.choices.forEach(choice => {
				if (choice.type === 'abilityScoreImprovement' && choice.abilityChanges) {
					Object.entries(choice.abilityChanges).forEach(([ability, increase]) => {
						const oldValue = this.getOriginalAbilityScore(ability);
						const newValue = oldValue + increase;
						changes.abilityScores.push({
							ability: ability.toUpperCase(),
							oldValue,
							newValue,
							increase
						});
					});
				} else if (choice.type === 'feat') {
					changes.choicesMade.push({
						type: 'Feat Selected',
						description: `${choice.featName}${choice.featData?.entries?.[0] ? ' - ' + choice.featData.entries[0].substring(0, 80) + '...' : ''}`
					});
				} else if (choice.type === 'fightingStyle') {
					changes.choicesMade.push({
						type: 'Fighting Style',
						description: `${choice.styleName} - ${choice.styleDescription}`
					});
				} else if (choice.type === 'spells' && choice.spells) {
					if (choice.spells.cantrips?.length > 0) {
						changes.spellsKnown.push({
							type: 'Cantrips',
							spells: choice.spells.cantrips.map(s => s.name)
						});
					}
					if (choice.spells.spells?.length > 0) {
						changes.spellsKnown.push({
							type: 'Spells',
							spells: choice.spells.spells.map(s => s.name)
						});
					}
				}
			});
		}

		// Track spell slot changes if character is a caster
		const classEntry = character.class?.[selectedClassIndex];
		if (classEntry && this.isSpellcastingClass(classEntry.name, classEntry)) {
			const oldSpellSlots = this.getSpellSlotsForClass(classEntry.name, classEntry.level - 1, classEntry);
			const newSpellSlots = this.getSpellSlotsForClass(classEntry.name, classEntry.level, classEntry);

			for (let level = 1; level <= 9; level++) {
				const oldSlots = oldSpellSlots[level] || 0;
				const newSlots = newSpellSlots[level] || 0;
				if (newSlots > oldSlots) {
					changes.spellSlots.push({
						level,
						oldSlots,
						newSlots,
						gain: newSlots - oldSlots
					});
				}
			}
		}

		// Track new actions from class abilities
		if (this.levelUpState.pendingFeatures) {
			this.levelUpState.pendingFeatures.forEach(featureData => {
				if (featureData.feature.entries) {
					const hasActionKeywords = featureData.feature.entries.some(entry =>
						typeof entry === 'string' &&
						(entry.includes('as an action') || entry.includes('bonus action') || entry.includes('reaction'))
					);

					if (hasActionKeywords) {
						changes.actionsAdded.push({
							name: featureData.feature.name,
							description: featureData.feature.entries[0]?.substring(0, 100) + '...'
						});
					}
				}

				changes.featuresAdded.push({
					name: featureData.feature.name,
					description: featureData.feature.entries?.[0]?.substring(0, 80) + '...' || 'New class feature',
					source: featureData.className
				});
			});
		}

		// Build enhanced summary modal content
		let summaryContent = `
			<h5>Level Up Complete - All Changes</h5>
			<div class="row">
				<div class="col-md-6">
					<h6>Character Progression</h6>
					<ul class="list-group list-group-flush mb-3">
						<li class="list-group-item d-flex justify-content-between">
							<span>Level:</span>
							<span><strong>${oldTotalLevel} → ${newTotalLevel}</strong></span>
						</li>
						<li class="list-group-item d-flex justify-content-between">
							<span>Hit Points:</span>
							<span><strong>${currentMaxHP} → ${currentMaxHP + hpGain}</strong> <small class="text-success">(+${hpGain})</small></span>
						</li>
						<li class="list-group-item d-flex justify-content-between">
							<span>Proficiency Bonus:</span>
							<span><strong>+${this.getProficiencyBonus(newTotalLevel)}</strong></span>
						</li>
					</ul>`;

		// Add ability score changes
		if (changes.abilityScores.length > 0) {
			summaryContent += `
					<h6>Ability Score Changes</h6>
					<ul class="list-group list-group-flush mb-3">`;
			changes.abilityScores.forEach(change => {
				summaryContent += `
						<li class="list-group-item d-flex justify-content-between">
							<span>${change.ability}:</span>
							<span><strong>${change.oldValue} → ${change.newValue}</strong> <small class="text-success">(+${change.increase})</small></span>
						</li>`;
			});
			summaryContent += `</ul>`;
		}

		summaryContent += `</div><div class="col-md-6">`;

		// Add spell slot changes
		if (changes.spellSlots.length > 0) {
			summaryContent += `
					<h6>Spell Slot Changes</h6>
					<ul class="list-group list-group-flush mb-3">`;
			changes.spellSlots.forEach(change => {
				const levelText = this.getOrdinalNumber(change.level);
				summaryContent += `
						<li class="list-group-item d-flex justify-content-between">
							<span>${levelText} Level:</span>
							<span><strong>${change.oldSlots} → ${change.newSlots}</strong> <small class="text-success">(+${change.gain})</small></span>
						</li>`;
			});
			summaryContent += `</ul>`;
		}

		// Add spells known
		if (changes.spellsKnown.length > 0) {
			summaryContent += `
					<h6>Spells Learned</h6>
					<ul class="list-group list-group-flush mb-3">`;
			changes.spellsKnown.forEach(spellGroup => {
				summaryContent += `
						<li class="list-group-item">
							<strong>${spellGroup.type}:</strong>
							<small class="d-block">${spellGroup.spells.join(', ')}</small>
						</li>`;
			});
			summaryContent += `</ul>`;
		}

		// Add new actions
		if (changes.actionsAdded.length > 0) {
			summaryContent += `
					<h6>New Actions Available</h6>
					<ul class="list-group list-group-flush mb-3">`;
			changes.actionsAdded.forEach(action => {
				summaryContent += `
						<li class="list-group-item">
							<strong>${action.name}</strong>
							<small class="text-muted d-block">${action.description}</small>
						</li>`;
			});
			summaryContent += `</ul>`;
		}

		summaryContent += `</div></div><div class="row"><div class="col-12">`;

		// Add new features
		if (changes.featuresAdded.length > 0) {
			summaryContent += `
					<h6>New Features & Traits</h6>
					<ul class="list-group list-group-flush mb-3">`;
			changes.featuresAdded.forEach(feature => {
				summaryContent += `
						<li class="list-group-item">
							<strong>${feature.name}</strong>
							<small class="text-muted">(from ${feature.source})</small>
							<small class="text-muted d-block">${feature.description}</small>
						</li>`;
			});
			summaryContent += `</ul>`;
		}

		// Add choices made
		if (changes.choicesMade.length > 0) {
			summaryContent += `
					<h6>Choices Made</h6>
					<ul class="list-group list-group-flush mb-3">`;
			changes.choicesMade.forEach(choice => {
				summaryContent += `
						<li class="list-group-item">
							<strong>${choice.type}:</strong> ${choice.description}
						</li>`;
			});
			summaryContent += `</ul>`;
		}

		summaryContent += `
				</div>
			</div>
			<div class="text-center mt-4">
				<p class="text-success mb-3"><strong>Level up successful!</strong> All changes above will be applied to your character sheet.</p>
				<p class="text-muted mb-3">Click "Apply Level Up" to finalize these changes.</p>
			</div>`;

		const { doClose, $modalFooter } = UiUtil.getShowModal({
			title: "Level Up Complete!",
			bodyElement: summaryContent,
			hasFooter: true,
			cbClose: async (isDataEntered) => {
				console.log('=== MODAL CBCLOSE CALLED ===');
				console.log('isDataEntered:', isDataEntered);
				if (isDataEntered) {
					console.log('About to call finalizeLevelUp from cbClose');
					await this.finalizeLevelUp();
				}
			},
			isUncappedHeight: true
		});

		// Create custom footer with Apply and Cancel buttons
		console.log('Modal footer from UiUtil:', $modalFooter);
		if ($modalFooter) {
			$modalFooter.html(`
				<button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel Level Up</button>
				<button type="button" class="btn btn-primary" id="applyLevelUp">Apply Level Up</button>
			`);

			// Use jQuery to find and attach event handler since we're using jQuery objects
			const $applyButton = $modalFooter.find('#applyLevelUp');
			console.log('Apply button found:', $applyButton.length > 0);

			$applyButton.click(() => {
				console.log('=== APPLY LEVEL UP BUTTON CLICKED ===');
				console.log('Calling doClose(true)');
				doClose(true);
			});
		}

		this.levelUpModalClose = doClose;
	}

	getOriginalAbilityScore(ability) {
		// Get the original ability score before ASI was applied
		const editorText = this.ace.getValue();
		const characterData = JSON.parse(editorText);

		if (characterData.abilities && characterData.abilities[ability]) {
			return characterData.abilities[ability];
		}
		return characterData[ability] || 10;
	}

	isSpellcastingClass(className, classEntry = null) {
		console.log('=== isSpellcastingClass DEBUG ===');
		console.log('Input className:', className, typeof className);
		console.log('Input classEntry:', classEntry);

		if (!className) {
			console.log('❌ No class name provided');
			return false;
		}

		// Check if this is a third-caster subclass first
		if (classEntry && this.isThirdCasterClass(classEntry)) {
			console.log('✅ Third-caster subclass detected');
			return true;
		}

		// Comprehensive list including variations
		const spellcastingClasses = [
			'Bard', 'Cleric', 'Druid', 'Sorcerer', 'Warlock', 'Wizard', 'Paladin', 'Ranger',
			// Add lowercase versions
			'bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard', 'paladin', 'ranger'
		];

		const normalizedClassName = className.toString().trim();

		// Check exact match first
		let result = spellcastingClasses.includes(normalizedClassName);

		// If no exact match, try case-insensitive
		if (!result) {
			result = spellcastingClasses.some(cls => cls.toLowerCase() === normalizedClassName.toLowerCase());
		}

		// If still no match, try partial matching
		if (!result) {
			const lowerClassName = normalizedClassName.toLowerCase();
			result = ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard', 'paladin', 'ranger']
				.some(cls => lowerClassName.includes(cls) || cls.includes(lowerClassName));
		}

		console.log('Normalized class name:', normalizedClassName);
		console.log('Spellcasting classes:', spellcastingClasses);
		console.log('Final result:', result);
		console.log('========================');

		return result;
	}

	getMaxSpellLevelForCharacterLevel(characterLevel, className) {
		// Handle special cases for different caster types
		const classNameLower = (className || '').toLowerCase();

		// Warlocks have their own spell progression
		if (classNameLower.includes('warlock')) {
			if (characterLevel >= 17) return 5;
			if (characterLevel >= 15) return 5;
			if (characterLevel >= 13) return 5;
			if (characterLevel >= 11) return 5;
			if (characterLevel >= 9) return 5;
			if (characterLevel >= 7) return 4;
			if (characterLevel >= 5) return 3;
			if (characterLevel >= 3) return 2;
			if (characterLevel >= 1) return 1;
			return 0;
		}

		// Half-casters (Paladin, Ranger) start at level 2
		if (classNameLower.includes('paladin') || classNameLower.includes('ranger')) {
			if (characterLevel < 2) return 0;
			if (characterLevel >= 17) return 5;
			if (characterLevel >= 13) return 4;
			if (characterLevel >= 9) return 3;
			if (characterLevel >= 5) return 2;
			if (characterLevel >= 2) return 1;
			return 0;
		}

		// Third-casters (Eldritch Knight, Arcane Trickster) start at level 3
		if (characterLevel < 3) {
			// Check if this might be a third-caster subclass
			// For now, assume full caster if we're at this point
		}

		// Full casters (Bard, Cleric, Druid, Sorcerer, Wizard)
		if (characterLevel >= 17) return 9;
		if (characterLevel >= 15) return 8;
		if (characterLevel >= 13) return 7;
		if (characterLevel >= 11) return 6;
		if (characterLevel >= 9) return 5;
		if (characterLevel >= 7) return 4;
		if (characterLevel >= 5) return 3;
		if (characterLevel >= 3) return 2;
		if (characterLevel >= 1) return 1;
		return 0;
	}

	getOrdinalNumber(num) {
		const suffixes = ['th', 'st', 'nd', 'rd'];
		const mod = num % 100;
		return num + (suffixes[(mod - 20) % 10] || suffixes[mod] || suffixes[0]);
	}

	async finalizeLevelUp() {
		console.log('=== COMPREHENSIVE FINALIZE LEVEL UP CALLED ===');
		console.log('LevelUpState:', this.levelUpState);
		console.log('Choices:', this.levelUpState?.choices);
		console.log('Current character data:', this.levelUpState?.characterData);

		// Check if we just completed spell selection and need to continue with other level up features
		if (this.levelUpState?.continueAfterSpells) {
			console.log('🔄 Spell selection complete, continuing with other level up features...');
			this.levelUpState.continueAfterSpells = false;

			// Continue with the rest of the level up process
			const character = this.levelUpState.characterData;
			const classEntry = character.class[0]; // Assuming single class for now
			const newLevel = classEntry.level;

			// Check for class-specific ASI levels (Fighter gets bonus at 6,14; Rogue at 10)
			if (this.isASILevel(newLevel, [classEntry])) {
				this.showASIChoice();
				return;
			}

			// Add any class features for this level
			await this.addClassFeatures(classEntry, newLevel);

			// Show completion
			this.showLevelUpComplete();
			return;
		}

		// Apply all level up changes to character
		const updatedCharacter = this.levelUpState.characterData;

		// Check if this is a level 0->1 character creation
		const isFirstLevelCreation = this.levelUpState.currentLevel === 0;

		// Update total character level in computed fields
		const newTotalLevel = CharacterEditorPage.getCharacterLevel(updatedCharacter);

		// Update proficiency bonus
		const newProfBonus = this.getProficiencyBonus(newTotalLevel);
		updatedCharacter.proficiencyBonus = `+${newProfBonus}`;

		// Apply feature choices to character data
		await this.applyLevelUpFeaturesToCharacter(updatedCharacter);

		// For level 0->1 characters, generate a complete character using existing generation code
		if (isFirstLevelCreation) {
			console.log('=== GENERATING COMPLETE LEVEL 1 CHARACTER WITH USER CHOICES ===');

			// Extract user choices from the level up process
			const userChoices = this.extractUserChoicesFromLevelUpState();
			console.log('User choices extracted:', userChoices);

			// Build character directly from levelUpState to preserve subclass selection
			console.log('Building character from levelUpState data to preserve subclass selection');

			// Normalize race to proper format { name: <VALUE>, source: <VALUE> }
			let normalizedRace;
			if (userChoices.characterRace) {
				if (typeof userChoices.characterRace === 'string') {
					// If it's just a string, create proper race object
					normalizedRace = { name: userChoices.characterRace, source: 'PHB' };
				} else if (userChoices.characterRace.name) {
					// If it's already an object with name/source, use it
					normalizedRace = {
						name: userChoices.characterRace.name,
						source: userChoices.characterRace.source || 'PHB'
					};
				} else {
					// Fallback to random race
					normalizedRace = this.generateRandomNonHumanRace();
				}
			} else {
				normalizedRace = this.generateRandomNonHumanRace();
			}

			// Normalize background to proper format { name: <VALUE>, source: <VALUE> }
			let normalizedBackground;
			const backgroundChoice = userChoices.characterBackground || this.level0WizardData?.background;
			if (backgroundChoice) {
				if (typeof backgroundChoice === 'string') {
					// If it's just a string, create proper background object
					normalizedBackground = { name: backgroundChoice, source: 'PHB' };
				} else if (backgroundChoice.name) {
					// If it's already an object with name/source, use it
					normalizedBackground = {
						name: backgroundChoice.name,
						source: backgroundChoice.source || 'PHB'
					};
				} else {
					// Fallback to random background
					normalizedBackground = await this.generateRandomBackground();
				}
			} else {
				normalizedBackground = await this.generateRandomBackground();
			}

			// Normalize alignment to proper format (array like ["L", "G"] or ["N"])
			let normalizedAlignment;
			const alignmentChoice = userChoices.characterAlignment || this.level0WizardData?.alignment;
			if (alignmentChoice) {
				if (Array.isArray(alignmentChoice)) {
					// If it's already an array, use it directly
					normalizedAlignment = alignmentChoice;
				} else if (typeof alignmentChoice === 'string') {
					// If it's a string like "Lawful Good", convert to array format
					const alignmentMap = {
						'Lawful Good': ['L', 'G'],
						'Neutral Good': ['N', 'G'],
						'Chaotic Good': ['C', 'G'],
						'Lawful Neutral': ['L', 'N'],
						'True Neutral': ['N'],
						'Neutral': ['N'],
						'Chaotic Neutral': ['C', 'N'],
						'Lawful Evil': ['L', 'E'],
						'Neutral Evil': ['N', 'E'],
						'Chaotic Evil': ['C', 'E']
					};
					normalizedAlignment = alignmentMap[alignmentChoice] || this.generateRandomAlignment();
				} else {
					// Fallback to random alignment
					normalizedAlignment = this.generateRandomAlignment();
				}
			} else {
				normalizedAlignment = this.generateRandomAlignment();
			}

			let completeCharacter = {
				name: userChoices.characterName || updatedCharacter.name || 'Adventurer',
				source: this.getWizardSourceName(),
				race: normalizedRace,
				class: JSON.parse(JSON.stringify(updatedCharacter.class || [])), // Deep copy with subclass preserved
				background: {
					name: normalizedBackground.name,
					source: normalizedBackground.source || 'PHB'
				},
				alignment: normalizedAlignment,
				...userChoices.abilityScores,
				hp: 1, // Will be calculated properly
				ac: [{ ac: 10, from: ['Base'] }], // Will be calculated properly
				passive: 10,
				proficiencyBonus: '+2',
				deathSaves: { successes: 0, failures: 0 },
				currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
				fluff: { entries: ['write notes here'] }
			};

			// Calculate derived stats
			if (userChoices.abilityScores) {
				const dexMod = Math.floor((userChoices.abilityScores.dex - 10) / 2);
				const wisMod = Math.floor((userChoices.abilityScores.wis - 10) / 2);
				const conMod = Math.floor((userChoices.abilityScores.con - 10) / 2);

				completeCharacter.ac = [{ ac: 10 + dexMod, from: ['Base', 'Dex'] }];
				completeCharacter.passive = 10 + wisMod;

				if (completeCharacter.class?.[0]) {
					const hitDie = this.getClassHitDie(completeCharacter.class[0].name) || 8;
					const hpVal = Math.max(1, hitDie + conMod);
					completeCharacter.hp = { average: hpVal, formula: `${hitDie}+${conMod}`, current: hpVal, max: hpVal, temp: 0 };
				}
			}

			console.log('Generated complete character:', completeCharacter);
			if (completeCharacter) {
				console.log('Character keys:', Object.keys(completeCharacter));
			} else {
				console.error('generateRandomCharacterAtLevel returned null/undefined. Creating fallback completeCharacter object.');
				const fallbackHpVal = Math.max(1, (this.getClassHitDie(userChoices.selectedClass) || 8) + Math.floor(((userChoices.abilityScores?.con || 10) - 10) / 2));
				completeCharacter = {
					name: userChoices.characterName || updatedCharacter.name || 'Adventurer',
					class: [{ name: userChoices.selectedClass || 'Fighter', level: 1 }],
					race: userChoices.characterRace || 'Human',
					ac: [{ ac: 10, from: ['Default'] }],
					passive: 10,
					hp: { average: fallbackHpVal, formula: `${fallbackHpVal}`, current: fallbackHpVal, max: fallbackHpVal, temp: 0 }
				};
			}

			// Override the randomly generated ability scores with user's choices
			if (userChoices.abilityScores) {
				console.log('Applying user ability scores:', userChoices.abilityScores);
				if (completeCharacter) Object.assign(completeCharacter, userChoices.abilityScores);

				// Recalculate derived stats with user's ability scores
				const dexMod = Math.floor((userChoices.abilityScores.dex - 10) / 2);
				const wisMod = Math.floor((userChoices.abilityScores.wis - 10) / 2);
				const conMod = Math.floor((userChoices.abilityScores.con - 10) / 2);

				// Update AC, passive perception, and HP
				completeCharacter.ac = Math.max(completeCharacter.ac || 0, 10 + dexMod);
				const profBonus = this.getProficiencyBonus(1);
				const perceptionBonus = this.hasSkillProficiency("perception", completeCharacter?.class) ? profBonus : 0;
				completeCharacter.passive = 10 + wisMod + perceptionBonus;

				// Update HP with new CON modifier
				if (completeCharacter.class?.[0]) {
					const hitDie = this.getClassHitDie(completeCharacter.class[0].name) || 8;
					completeCharacter.hp = Math.max(1, hitDie + conMod);
				}
			}

			// Add any additional user choices (fighting styles, feats, spells) to the complete character
			this.addUserChoicesToCompleteCharacter(completeCharacter, userChoices);

			// Replace the character data with the complete generated character
			console.log('About to replace character data...');
			console.log('updatedCharacter before replacement:', updatedCharacter);
			console.log('completeCharacter to assign:', completeCharacter);

			Object.keys(updatedCharacter).forEach(key => delete updatedCharacter[key]);
			if (completeCharacter) Object.assign(updatedCharacter, completeCharacter);

			// Recalculate button visibility after replacing character data
			this.updateButtonVisibility();

			console.log('updatedCharacter after replacement:', updatedCharacter);
			console.log('=== COMPLETE CHARACTER GENERATED WITH USER CHOICES ===');
		}

		// Update all character stats based on new level
		await this.updateCharacterStatsForLevel(updatedCharacter);

		// Final consolidation to ensure no duplicate Features & Traits sections
		this.ensureSingleFeaturesSection(updatedCharacter);

		// Update the editor with new character data
		console.log('Setting ACE editor value with character data:', updatedCharacter);
		console.log('Character JSON string length:', JSON.stringify(updatedCharacter, null, 2).length);
		this.ace.setValue(JSON.stringify(updatedCharacter, null, 2), 1);

		// Re-render character
		this.renderCharacter();

		// Close modal and show success message
		if (this.levelUpModalClose) {
			this.levelUpModalClose(true);
			this.levelUpModalClose = null;
		}

		document.getElementById('message').textContent = `Character leveled up to level ${newTotalLevel}!`;
		document.getElementById('message').style.color = 'green';

		// Clear level up state
		this.levelUpState = null;
	}

	async generateCompleteCharacterFromChoices(basicCharacter) {
		try {
			console.log('Generating complete character from user choices...');

			// Extract user choices from level up state
			const userChoices = this.extractUserChoicesFromLevelUpState();
			console.log('User choices extracted:', userChoices);

			// Get character details from basic character
			const characterName = basicCharacter.name || 'Adventurer';
			const characterRace = basicCharacter.race?.name || this.generateRandomNonHumanRace().name;
			const characterClass = userChoices.selectedClass || 'Fighter';

			// Generate a complete random level 1 character with specified class and race
			console.log(`Generating base character: ${characterName}, ${characterRace} ${characterClass}`);
			const completeCharacter = await this.generateRandomCharacterAtLevel(
				1,
				characterName,
				this.getWizardSourceName(),
				characterClass,
				characterRace,
				userChoices.characterBackground || this.level0WizardData?.background || null,
				userChoices.characterAlignment || this.level0WizardData?.alignment || null
			);

			// Apply user's specific choices to the complete character
			this.applyUserChoicesToCompleteCharacter(completeCharacter, userChoices, basicCharacter);

			console.log('Complete character generated with user choices applied');
			return completeCharacter;

		} catch (error) {
			console.error('Error generating complete character from choices:', error);
			// Fallback to original approach if generation fails
			await this.addStartingCharacterSections(basicCharacter);
			return basicCharacter;
		}
	}

	extractUserChoicesFromLevelUpState() {
		console.log('=== EXTRACTING USER CHOICES ===');

		const choices = {
			characterName: null,
			characterRace: null,
			characterBackground: null,
			characterAlignment: null,
			selectedClass: null,
			selectedSubclass: null,
			abilityScores: null,
			fightingStyle: null,
			spells: null,
			feats: null,
			skills: null
		};

		// Extract basic character info
		if (this.levelUpState?.characterData) {
			choices.characterName = this.levelUpState.characterData.name;
			choices.characterRace = this.levelUpState.characterData.race?.name || this.levelUpState.characterData.race;
		}

		// For level 0 characters, prioritize the race from URL parameters stored in level0WizardData
		if (this.level0WizardData?.race) {
			console.log('Using race from level0WizardData:', this.level0WizardData.race);
			choices.characterRace = this.level0WizardData.race;
		}

		// Also pull background/alignment choices from level0WizardData if present
		if (this.level0WizardData?.background) {
			choices.characterBackground = this.level0WizardData.background;
		}
		if (this.level0WizardData?.alignment) {
			choices.characterAlignment = this.level0WizardData.alignment;
		}

		console.log('Character race from extraction:', choices.characterRace);

		if (!this.levelUpState?.choices) {
			return choices;
		}

		// Extract class selection from character data
		if (this.levelUpState.characterData?.class?.[0]) {
			const classData = this.levelUpState.characterData.class[0];
			choices.selectedClass = classData.name;
			choices.selectedSubclass = classData.subclass?.name;
		}

		// Extract other choices from the choices array
		this.levelUpState.choices.forEach(choice => {
			switch (choice.type) {
				case 'abilityScores':
					choices.abilityScores = choice.scores;
					break;
				case 'fightingStyle':
					choices.fightingStyle = {
						name: choice.styleName,
						description: choice.styleDescription
					};
					break;
				case 'spells':
					choices.spells = choice.selections;
					break;
				case 'feat':
					choices.feats = choices.feats || [];
					choices.feats.push({
						name: choice.featName,
						data: choice.featData
					});
					break;
				case 'skillSelection':
					choices.skills = choices.skills || [];
					choices.skills.push({
						className: choice.className,
						selectedSkills: choice.selectedSkills
					});
					break;
				case 'skills':
					// Handle legacy skill format
					choices.skills = choices.skills || [];
					if (choice.selections && Array.isArray(choice.selections)) {
						choices.skills.push({
							className: choice.className || 'Class',
							selectedSkills: choice.selections
						});
					}
					break;
			}
		});

		return choices;
	}

	addUserChoicesToCompleteCharacter(completeCharacter, userChoices) {
		console.log('Adding user choices to already complete character...');

		// Add fighting style if selected
		if (userChoices.fightingStyle) {
			this.addFightingStyleToCharacter(completeCharacter, userChoices.fightingStyle);
		}

		// Add feats if selected
		if (userChoices.feats?.length > 0) {
			userChoices.feats.forEach(feat => {
				this.addFeatToCharacter(completeCharacter, feat);
			});
		}

		// Add spells if selected (this might override some random spells, which is fine)
		if (userChoices.spells) {
			this.addSpellsToCharacter(completeCharacter, userChoices.spells);
		}

		console.log('User choices added to complete character');
	}

	applyUserChoicesToCompleteCharacter(completeCharacter, userChoices, basicCharacter) {
		console.log('Applying user choices to complete character...');

		// 1. Apply user's ability scores if they chose them
		if (userChoices.abilityScores) {
			console.log('Applying user ability scores:', userChoices.abilityScores);
			Object.assign(completeCharacter, userChoices.abilityScores);

			// Recalculate derived stats with new ability scores
			const dexMod = Math.floor((userChoices.abilityScores.dex - 10) / 2);
			const wisMod = Math.floor((userChoices.abilityScores.wis - 10) / 2);
			const conMod = Math.floor((userChoices.abilityScores.con - 10) / 2);

			// Update AC (base 10 + dex mod, may be overridden by armor later)
			const baseAC = 10 + dexMod;
			if (completeCharacter.ac < baseAC) {
				completeCharacter.ac = baseAC;
			}

			// Update passive perception
			const profBonus = this.getProficiencyBonus(1);
			const perceptionBonus = this.hasSkillProficiency("perception", completeCharacter.class) ? profBonus : 0;
			completeCharacter.passive = 10 + wisMod + perceptionBonus;

			// Update HP with new CON modifier
			if (completeCharacter.class?.[0]) {
				const classData = completeCharacter.class[0];
				const hitDie = this.getClassHitDie(classData.name) || 8;
				completeCharacter.hp = Math.max(1, hitDie + conMod);
			}
		}

		// 2. Apply user's class and subclass selection
		if (userChoices.selectedClass && completeCharacter.class?.[0]) {
			completeCharacter.class[0].name = userChoices.selectedClass;
			if (userChoices.selectedSubclass) {
				completeCharacter.class[0].subclass = {
					name: userChoices.selectedSubclass,
					shortName: userChoices.selectedSubclass,
					source: "PHB"
				};
			}
		}

		// 3. Add fighting style if selected
		if (userChoices.fightingStyle) {
			this.addFightingStyleToCharacter(completeCharacter, userChoices.fightingStyle);
		}

		// 4. Add feats if selected
		if (userChoices.feats?.length > 0) {
			userChoices.feats.forEach(feat => {
				this.addFeatToCharacter(completeCharacter, feat);
			});
		}

		// 5. Add skill proficiencies if selected
		if (userChoices.skills?.length > 0) {
			console.log('Applying user skill selections:', userChoices.skills);
			userChoices.skills.forEach(skillChoice => {
				if (skillChoice.selectedSkills?.length > 0) {
					skillChoice.selectedSkills.forEach(skillName => {
						this.addSingleSkillProficiency(completeCharacter, skillName, `Class (${skillChoice.className})`);
					});
				}
			});
		}

		// 6. Replace spells if selected
		if (userChoices.spells) {
			console.log('Replacing character spells with user selections:', userChoices.spells);
			this.replaceCharacterSpells(completeCharacter, userChoices.spells);
		}

		console.log('User choices applied to complete character');
	}

	addFightingStyleToCharacter(character, fightingStyle) {
		// Add fighting style to features section
		if (!character.entries) character.entries = [];

		const featuresSection = this.ensureSingleFeaturesSection(character);
		featuresSection.entries.push({
			type: "entries",
			name: `Fighting Style: ${fightingStyle.name}`,
			entries: [fightingStyle.description]
		});
	}

	addFeatToCharacter(character, feat) {
		// Add feat to features section
		if (!character.entries) character.entries = [];

		const featuresSection = this.ensureSingleFeaturesSection(character);
		featuresSection.entries.push({
			type: "entries",
			name: `Feat: ${feat.name}`,
			entries: feat.data?.entries || [`${feat.name} feat selected.`]
		});
	}

	addSpellsToCharacter(character, spells) {
		// Add spells to character's spell sections
		if (spells.cantrips?.length > 0 || spells.spells?.length > 0) {
			if (!character.entries) character.entries = [];

			const spellEntries = [];
			if (spells.cantrips?.length > 0) {
				spellEntries.push(`**Cantrips Known:** ${spells.cantrips.join(', ')}`);
			}
			if (spells.spells?.length > 0) {
				spellEntries.push(`**Spells Known:** ${spells.spells.join(', ')}`);
			}

			character.entries.push({
				type: "entries",
				name: "Spells",
				entries: spellEntries
			});
		}
	}

	replaceCharacterSpells(character, userSpells) {
		console.log('=== REPLACING CHARACTER SPELLS ===');
		console.log('Current character.spells:', character.spells);
		console.log('User spell selections:', userSpells);

		if (!character.spells) {
			console.log('Character has no spells object, nothing to replace');
			return;
		}

		// Replace cantrips (level 0)
		if (userSpells.cantrips?.length > 0 && character.spells.levels?.["0"]) {
			console.log(`Replacing ${character.spells.levels["0"].spells.length} cantrips with ${userSpells.cantrips.length} user-selected cantrips`);
			character.spells.levels["0"].spells = [...userSpells.cantrips];
		}

		// Replace level 1 spells
		if (userSpells.spells?.length > 0 && character.spells.levels?.["1"]) {
			console.log(`Replacing ${character.spells.levels["1"].spells.length} level 1 spells with ${userSpells.spells.length} user-selected spells`);
			character.spells.levels["1"].spells = [...userSpells.spells];
		}

		// Also update the text entries to reflect the correct spells
		this.addSpellsToCharacter(character, userSpells);

		console.log('Updated character.spells:', character.spells);
	}

	async addStartingCharacterSections(character) {
		try {
			console.log('Adding starting character sections for level 1 character creation');

			// Set proper level 1 HP
			await this.setStartingHitPoints(character);

			// Add starting equipment based on class and background
			await this.addStartingEquipment(character);

			// Add detailed background features and traits
			await this.addBackgroundFeatures(character);

			// Add racial traits to Features & Traits section
			await this.addRacialTraitsToFeatures(character);

			// Add starting proficiencies and skills
			await this.addStartingProficiencies(character);

			// Add starting spells if the class is a spellcaster
			await this.addStartingSpells(character);

			// Ensure character has all the entries structure of a complete level 1 character
			await this.finalizeLevel1CharacterStructure(character);

			console.log('Completed adding starting character sections');

		} catch (error) {
			console.error('Error adding starting character sections:', error);
		}
	}

	async setStartingHitPoints(character) {
		const primaryClass = character.class[0];
		if (!primaryClass) return;

		// Get hit die from class data
		const classData = await this.loadClassData(primaryClass.name);
		const hitDie = classData?.class?.[0]?.hd?.faces || 8;

		// Level 1 HP = max hit die + CON modifier
		const conMod = Math.floor((character.con - 10) / 2);
		const maxHP = hitDie + conMod;

		character.hp = Math.max(1, maxHP); // Minimum 1 HP

		console.log(`Set starting HP to ${character.hp} (d${hitDie} + ${conMod} CON mod)`);
	}

	async addStartingSpells(character) {
		const primaryClass = character.class[0];
		if (!primaryClass) return;

		// Check if the class is a spellcaster
		const classData = await this.loadClassData(primaryClass.name);
		const classInfo = classData?.class?.[0];

		if (classInfo?.spellcastingAbility) {
			// Add spellcasting section
			if (!character.spells) {
				character.spells = {
					spellcastingAbility: classInfo.spellcastingAbility,
					spells: {}
				};
			}

			// Add starting cantrips and spells based on class
			const startingSpells = await this.getStartingSpellsForClass(primaryClass.name, character);
			if (startingSpells.cantrips?.length > 0) {
				character.spells.spells['0'] = startingSpells.cantrips.map(name => ({
					name,
					source: "PHB"
				}));
			}
			if (startingSpells.level1?.length > 0) {
				character.spells.spells['1'] = startingSpells.level1.map(name => ({
					name,
					source: "PHB"
				}));
			}

			console.log('Added starting spells for spellcaster');
		}
	}

	async getStartingSpellsForClass(className, character) {
		const startingSpells = {
			"Wizard": {
				cantrips: ["Mage Hand", "Prestidigitation", "Light"],
				level1: ["Magic Missile", "Shield", "Detect Magic", "Sleep", "Identify", "Burning Hands"]
			},
			"Cleric": {
				cantrips: ["Sacred Flame", "Guidance", "Light"],
				level1: ["Cure Wounds", "Guiding Bolt", "Bless"]
			},
			"Sorcerer": {
				cantrips: ["Fire Bolt", "Mage Hand", "Prestidigitation", "Light"],
				level1: ["Magic Missile", "Shield"]
			},
			"Warlock": {
				cantrips: ["Eldritch Blast", "Mage Hand"],
				level1: ["Hex", "Armor of Agathys"]
			},
			"Bard": {
				cantrips: ["Vicious Mockery", "Mage Hand"],
				level1: ["Healing Word", "Thunderwave", "Faerie Fire", "Dissonant Whispers"]
			},
			"Druid": {
				cantrips: ["Druidcraft", "Guidance"],
				level1: ["Cure Wounds", "Entangle"]
			}
		};

		return startingSpells[className] || { cantrips: [], level1: [] };
	}

	async finalizeLevel1CharacterStructure(character) {
		// Ensure the character has the same structure as a generated level 1 character
		if (!character.entries) character.entries = [];

		// Add any missing standard sections that a level 1 character should have
		const hasFeatureSection = character.entries.some(entry =>
			entry.name?.toLowerCase().includes('feature') ||
			entry.name?.toLowerCase().includes('trait')
		);

		if (!hasFeatureSection && character.class.length > 0) {
			// Add a basic class features section
			const primaryClass = character.class[0];
			character.entries.push({
				type: "entries",
				name: `${primaryClass.name} Features`,
				entries: [
					`Level 1 ${primaryClass.name} features and abilities.`,
					`Hit Die: d${primaryClass.hitDie || '8'}`,
					`Proficiency Bonus: +2`
				]
			});
		}

		// Ensure we have a fluff section
		if (!character.fluff) {
			character.fluff = {
				entries: [{
					type: "entries",
					name: "Character Background",
					entries: [
						`${character.name} is a level 1 ${character.race.name} ${character.class[0].name}.`,
						`Background: ${character.background.name}`
					]
				}]
			};
		}

		console.log('Finalized level 1 character structure');
	}

	async addStartingEquipment(character) {
		// Generate basic starting equipment based on class and background
		const primaryClass = character.class[0];
		if (!primaryClass) return;

		const startingEquipment = await this.generateStartingEquipmentForClass(primaryClass.name, character.background);

		// Add equipment to character entries
		if (!character.entries) character.entries = [];

		character.entries.push({
			type: "entries",
			name: "Starting Equipment",
			entries: [
				"Equipment gained from your class and background:",
				...startingEquipment.map(item => `• ${item}`)
			]
		});

		console.log('Added starting equipment');
	}

	async addBackgroundFeatures(character) {
		if (!character.background) return;

		try {
			// Load background data to get detailed features
			const backgroundData = await this.loadBackgroundData(character.background.name);

			if (backgroundData) {
				// Add background features to the Features & Traits section
				const featuresSection = this.ensureSingleFeaturesSection(character);

				// Add the background feature
				if (backgroundData.entries) {
					// Find the feature entry (usually the first entry with a name)
					const featureEntry = backgroundData.entries.find(entry =>
						entry.type === 'entries' && entry.name
					);

					if (featureEntry) {
						featuresSection.entries.push({
							type: "entries",
							name: `${featureEntry.name} (Background)`,
							entries: featureEntry.entries || [`Background feature from ${character.background.name}.`]
						});
					}
				}

				// Add skill proficiencies from background
				if (backgroundData.skillProficiencies) {
					this.addSkillProficiencies(character, backgroundData.skillProficiencies, 'Background');
				}

				// Add tool proficiencies from background
				if (backgroundData.toolProficiencies) {
					this.addToolProficiencies(character, backgroundData.toolProficiencies, 'Background');
				}

				// Add languages from background
				if (backgroundData.languageProficiencies) {
					this.addLanguageProficiencies(character, backgroundData.languageProficiencies, 'Background');
				}

				// Add starting equipment from background
				if (backgroundData.startingEquipment) {
					this.addBackgroundEquipment(character, backgroundData.startingEquipment);
				}
			}

			console.log('Added background features');
		} catch (error) {
			console.error('Error loading background data:', error);
		}
	}

	addSkillProficiencies(character, skillProfs, source) {
		// Note: We no longer add character.skill or character._skillProficiencies to keep character sheets clean
		// Skills will be calculated dynamically from proficiencies by 5etools

		// Handle skill proficiency arrays from background data
		if (Array.isArray(skillProfs)) {
			skillProfs.forEach(skillEntry => {
				if (typeof skillEntry === 'string') {
					// Direct skill name - just add to proficiencies array, no calculated values
					if (!character.skillProficiencies) character.skillProficiencies = [];
					if (!character.skillProficiencies.includes(skillEntry)) {
						character.skillProficiencies.push(skillEntry);
					}
				} else if (skillEntry.choose && skillEntry.choose.from) {
					// Choose X from Y format - for simplicity, take the first ones
					const count = skillEntry.choose.count || 1;
					const available = skillEntry.choose.from.slice(0, count);
					available.forEach(skill => {
						if (!character.skillProficiencies) character.skillProficiencies = [];
						if (!character.skillProficiencies.includes(skill)) {
							character.skillProficiencies.push(skill);
						}
					});
				}
			});
		}
	}

	updateSingleSkillModifier(character, skillName) {
		const totalLevel = CharacterEditorPage.getCharacterLevel(character);
		const profBonus = this.getProficiencyBonus(totalLevel);
		const abilityScore = this.getAbilityScoreForSkill(character, skillName);
		const abilityMod = Math.floor((abilityScore - 10) / 2);

		// Ensure _skillProficiencies is a Set
		if (!character._skillProficiencies || !(character._skillProficiencies instanceof Set)) {
			character._skillProficiencies = new Set();
		}

		const hasProficiency = character._skillProficiencies.has(skillName) || false;
		const hasExpertise = this.characterHasSkillExpertise(character, skillName);

		// Only set skill modifier if character has proficiency or expertise
		if (hasProficiency || hasExpertise) {
			let modifier = abilityMod;
			if (hasExpertise) {
				modifier += profBonus * 2; // Expertise doubles proficiency bonus
			} else if (hasProficiency) {
				modifier += profBonus;
			}

			character.skill[skillName] = modifier;
		}
	}

	async initializeSkillProficiencies(character) {
		// Initialize skill proficiency tracking with D&D 5e rule validation
		if (!character._skillProficiencies) character._skillProficiencies = new Set();
		if (!character._proficiencySources) character._proficiencySources = {};

		console.log('🎯 Initializing skill proficiencies following D&D 5e rules');

		// Step 1: Add racial skill proficiencies (automatic, no choices)
		await this.addRacialSkillProficiencies(character);

		// Step 2: Add background skill proficiencies (automatic, predefined)
		await this.addBackgroundSkillProficiencies(character);

		// Step 3: Add class skill proficiencies (requires user choice)
		// Note: This only handles automatic proficiencies
		// User choices are handled separately in the character creation wizard
		await this.addAutomaticClassSkillProficiencies(character);

		console.log('✅ Skill proficiencies initialized:', {
			skills: Array.from(character._skillProficiencies),
			sources: character._proficiencySources
		});
	}

	async addRacialSkillProficiencies(character) {
		if (!character.race) return;

		try {
			const raceName = typeof character.race === 'string' ? character.race : character.race.name;
			const raceData = await this.loadRaceData(raceName);

			if (raceData?.race?.[0]?.skillProficiencies) {
				raceData.race[0].skillProficiencies.forEach(proficiencySet => {
					Object.keys(proficiencySet).forEach(skillName => {
						const normalizedSkill = skillName.toLowerCase().replace(/\s+/g, '');
						this.addSingleSkillProficiency(character, normalizedSkill, 'Race');
					});
				});
			}
		} catch (error) {
			console.warn(`Could not load racial skill proficiencies for ${character.race}:`, error);
		}
	}

	async addBackgroundSkillProficiencies(character) {
		if (!character.background) return;

		try {
			const backgroundName = typeof character.background === 'string' ? character.background : character.background.name;
			const backgroundData = await this.loadBackgroundData(backgroundName);

			if (backgroundData?.background?.[0]?.skillProficiencies) {
				backgroundData.background[0].skillProficiencies.forEach(proficiencySet => {
					Object.keys(proficiencySet).forEach(skillName => {
						const normalizedSkill = skillName.toLowerCase().replace(/\s+/g, '');
						this.addSingleSkillProficiency(character, normalizedSkill, 'Background');
					});
				});
			}
		} catch (error) {
			console.warn(`Could not load background skill proficiencies for ${character.background}:`, error);
		}
	}

	async addAutomaticClassSkillProficiencies(character) {
		if (!character.class || character.class.length === 0) return;

		// Only first class grants skill proficiencies in D&D 5e multiclassing
		const primaryClass = character.class[0];

		try {
			const classData = await this.loadClassData(primaryClass.name);

			if (classData?.class?.[0]?.startingProficiencies?.skills) {
				const skillProfs = classData.class[0].startingProficiencies.skills;

				// Only add automatic skill proficiencies, not choices
				skillProfs.forEach(skillEntry => {
					if (typeof skillEntry === 'string') {
						// Direct skill proficiency (automatic)
						const normalizedSkill = skillEntry.toLowerCase().replace(/\s+/g, '');
						this.addSingleSkillProficiency(character, normalizedSkill, 'Class');
					}
					// Skip choice-based proficiencies - these need user input
				});
			}
		} catch (error) {
			console.warn(`Could not load class skill proficiencies for ${primaryClass.name}:`, error);
		}
	}

	addSingleSkillProficiency(character, skillName, source) {
		// Initialize tracking objects if missing
		if (!character._skillProficiencies || !(character._skillProficiencies instanceof Set)) {
			character._skillProficiencies = new Set();
		}
		if (!character._proficiencySources) character._proficiencySources = {};

		// Normalize skill name for consistency
		const normalizedSkill = this.normalizeSkillName(skillName);

		// Validate against D&D 5e rules - no duplicate proficiencies
		if (character._skillProficiencies.has(normalizedSkill)) {
			console.log(`⚠️ Character already has ${normalizedSkill} proficiency from ${character._proficiencySources[normalizedSkill]}, skipping ${source}`);
			return false;
		}

		// Add the proficiency
		character._skillProficiencies.add(normalizedSkill);
		character._proficiencySources[normalizedSkill] = source;

		// Calculate and set the skill modifier
		this.updateSingleSkillModifier(character, normalizedSkill);

		console.log(`✅ Added ${normalizedSkill} proficiency from ${source}`);
		return true;
	}

	async showClassSkillSelectionModal(character, className) {
		console.log(`🎯 Showing skill selection modal for ${className}`);

		try {
			const classData = await this.loadClassData(className);
			if (!classData?.class?.[0]?.startingProficiencies?.skills) {
				console.log(`No skill choices for ${className}`);
				return { success: true, selectedSkills: [] };
			}

			const skillChoices = classData.class[0].startingProficiencies.skills.find(
				entry => entry.choose && entry.choose.from
			);

			if (!skillChoices) {
				console.log(`No skill choices found for ${className}`);
				return { success: true, selectedSkills: [] };
			}

			const availableSkills = skillChoices.choose.from;
			const maxCount = skillChoices.choose.count || 2;
			const alreadyProficient = Array.from(character._skillProficiencies || []);

			// Filter out skills the character already has proficiency in
			const selectableSkills = availableSkills.filter(skill => {
				const normalizedSkill = skill.toLowerCase().replace(/\s+/g, '');
				return !alreadyProficient.includes(normalizedSkill);
			});

			if (selectableSkills.length === 0) {
				console.log(`All ${className} skills already known`);
				return { success: true, selectedSkills: [] };
			}

			// Create modal content
			const modalContent = `
				<div class="mb-3">
					<h5>Choose ${maxCount} Skills for ${className}</h5>
					<p class="text-muted">Select ${maxCount} skill proficiencies from the ${className} class list:</p>

					${alreadyProficient.length > 0 ? `
						<div class="alert alert-info">
							<strong>Already Proficient:</strong> ${alreadyProficient.join(', ')}
						</div>
					` : ''}
				</div>

				<div class="row">
					${selectableSkills.map((skill, index) => `
						<div class="col-md-6 mb-2">
							<label class="ve-flex-v-center">
								<input type="checkbox" class="skill-choice mr-2" value="${skill}" data-skill="${skill.toLowerCase().replace(/\s+/g, '')}">
								<strong>${skill}</strong>
								<small class="text-muted ml-1">(${this.getSkillAbility(skill)})</small>
							</label>
						</div>
					`).join('')}
				</div>

				<div class="mt-3">
					<small class="text-muted">
						<strong>Note:</strong> You must select exactly ${maxCount} skills.
						In D&D 5e, you cannot gain proficiency in a skill you're already proficient in.
					</small>
				</div>
			`;

			return new Promise((resolve) => {
				const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
					title: `${className} - Skill Selection`,
					hasFooter: true,
					backdrop: 'static',
					keyboard: false
				});

				$modalInner.html(modalContent);

				// Update button state based on selection count
				const updateButtonState = () => {
					const selected = $modalInner.find('.skill-choice:checked').length;
					$btnConfirm.prop('disabled', selected !== maxCount);
					$selectionCount.text(`${selected}/${maxCount} selected`);
				};

				// Add selection counter
				const $selectionCount = $('<span class="mr-3 badge badge-info">0/' + maxCount + ' selected</span>');

				// Handle skill selection with max count validation
				$modalInner.find('.skill-choice').on('change', function() {
					const selected = $modalInner.find('.skill-choice:checked').length;

					if (selected > maxCount) {
						$(this).prop('checked', false);
						return;
					}

					updateButtonState();
				});

				const $btnCancel = $('<button class="ve-btn ve-btn-default mr-2">Cancel</button>')
					.click(() => {
						doClose();
						resolve({ success: false, selectedSkills: [] });
					});

				const $btnConfirm = $('<button class="ve-btn ve-btn-primary">Confirm Selection</button>')
					.prop('disabled', true)
					.click(() => {
						const selectedSkills = [];
						$modalInner.find('.skill-choice:checked').each(function() {
							selectedSkills.push($(this).data('skill'));
						});

						doClose();
						resolve({ success: true, selectedSkills });
					});

				$modalFooter.append($selectionCount, $btnCancel, $btnConfirm);
				updateButtonState();
			});

		} catch (error) {
			console.error('Error in skill selection modal:', error);
			return { success: false, selectedSkills: [] };
		}
	}

	getSkillAbility(skillName) {
		const skillAbilityMap = {
			'Acrobatics': 'DEX', 'Animal Handling': 'WIS', 'Arcana': 'INT',
			'Athletics': 'STR', 'Deception': 'CHA', 'History': 'INT',
			'Insight': 'WIS', 'Intimidation': 'CHA', 'Investigation': 'INT',
			'Medicine': 'WIS', 'Nature': 'INT', 'Perception': 'WIS',
			'Performance': 'CHA', 'Persuasion': 'CHA', 'Religion': 'INT',
			'Sleight of Hand': 'DEX', 'Stealth': 'DEX', 'Survival': 'WIS'
		};
		return skillAbilityMap[skillName] || 'Unknown';
	}

	getMulticlassProficiencies(className, classInfo) {
		// D&D 5e multiclassing proficiency rules - very limited compared to starting with the class
		const multiclassProfs = {
			skills: [],
			armor: [],
			weapons: [],
			tools: []
		};

		// Most classes don't grant skill proficiencies when multiclassing
		// Only specific cases allow it (like Ranger and Rogue)
		switch (className.toLowerCase()) {
			case 'ranger':
				multiclassProfs.skills = ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'];
				break;
			case 'rogue':
				multiclassProfs.skills = ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'];
				break;
			// Most other classes don't grant skills when multiclassing
			default:
				break;
		}

		// Add armor/weapon proficiencies based on multiclassing rules
		switch (className.toLowerCase()) {
			case 'fighter':
				multiclassProfs.armor = ['Light armor', 'Medium armor', 'Shields'];
				multiclassProfs.weapons = ['Simple weapons', 'Martial weapons'];
				break;
			case 'paladin':
				multiclassProfs.armor = ['Light armor', 'Medium armor', 'Shields'];
				multiclassProfs.weapons = ['Simple weapons', 'Martial weapons'];
				break;
			case 'ranger':
				multiclassProfs.armor = ['Light armor', 'Medium armor', 'Shields'];
				multiclassProfs.weapons = ['Simple weapons', 'Martial weapons'];
				break;
			case 'barbarian':
				multiclassProfs.armor = ['Medium armor', 'Shields'];
				multiclassProfs.weapons = ['Simple weapons', 'Martial weapons'];
				break;
			case 'cleric':
				multiclassProfs.armor = ['Light armor', 'Medium armor', 'Shields'];
				break;
			case 'druid':
				multiclassProfs.armor = ['Light armor', 'Medium armor', 'Shields (non-metal)'];
				break;
			case 'bard':
				multiclassProfs.weapons = ['Simple weapons', 'Hand crossbows', 'Longswords', 'Rapiers', 'Shortswords'];
				break;
			case 'warlock':
				multiclassProfs.armor = ['Light armor'];
				multiclassProfs.weapons = ['Simple weapons'];
				break;
		}

		return multiclassProfs;
	}

	async showClassSkillSelectionForLevelUp(className) {
		const character = this.levelUpState.characterData;

		const result = await this.showClassSkillSelectionModal(character, className);

		if (result.success && result.selectedSkills.length > 0) {
			// Store the skill selection in choices
			this.levelUpState.choices.push({
				type: 'skillSelection',
				className: className,
				selectedSkills: result.selectedSkills
			});
		}

		// Move to next feature
		this.levelUpState.currentFeatureIndex++;
		await this.showNextFeatureChoice();
	}

	async showMulticlassSkillSelectionForLevelUp(className, multiclassOptions) {
		const character = this.levelUpState.characterData;

		if (!multiclassOptions.skills || multiclassOptions.skills.length === 0) {
			// No skill choices for this multiclass, just continue
			this.levelUpState.currentFeatureIndex++;
			await this.showNextFeatureChoice();
			return;
		}

		// Create a simplified skill selection for multiclass (usually just 1 skill)
		const modalContent = `
			<div class="mb-3">
				<h5>Multiclass Skill Selection - ${className}</h5>
				<p class="text-muted">When multiclassing into ${className}, you can choose 1 skill from a limited list:</p>
			</div>

			<div class="row">
				${multiclassOptions.skills.map(skill => {
					const normalizedSkill = skill.toLowerCase().replace(/\s+/g, '');
					const isAlreadyProficient = character._skillProficiencies && character._skillProficiencies.has(normalizedSkill);

					return `
						<div class="col-md-6 mb-2">
							<label class="ve-flex-v-center ${isAlreadyProficient ? 'text-muted' : ''}">
								<input type="radio" name="multiclass-skill" class="mr-2" value="${skill}"
									data-skill="${normalizedSkill}" ${isAlreadyProficient ? 'disabled' : ''}>
								<strong>${skill}</strong>
								<small class="text-muted ml-1">(${this.getSkillAbility(skill)})</small>
								${isAlreadyProficient ? '<small class="text-muted ml-2">[Already Proficient]</small>' : ''}
							</label>
						</div>
					`;
				}).join('')}
			</div>

			<div class="mt-3">
				<small class="text-muted">
					<strong>Note:</strong> Multiclassing grants limited proficiencies compared to starting with a class.
				</small>
			</div>
		`;

		const {$modalInner, $modalFooter, doClose} = UiUtil.getShowModal({
			title: `${className} - Multiclass Proficiencies`,
			hasFooter: true,
			backdrop: 'static',
			keyboard: false
		});

		$modalInner.html(modalContent);

		const $btnCancel = $('<button class="ve-btn ve-btn-default mr-2">Skip</button>')
			.click(() => {
				doClose();
				this.levelUpState.currentFeatureIndex++;
				this.showNextFeatureChoice();
			});

		const $btnConfirm = $('<button class="ve-btn ve-btn-primary">Confirm</button>')
			.click(() => {
				const selectedSkill = $modalInner.find('input[name="multiclass-skill"]:checked').data('skill');

				if (selectedSkill) {
					this.levelUpState.choices.push({
						type: 'multiclassSkillSelection',
						className: className,
						selectedSkills: [selectedSkill]
					});
				}

				doClose();
				this.levelUpState.currentFeatureIndex++;
				this.showNextFeatureChoice();
			});

		$modalFooter.append($btnCancel, $btnConfirm);
	}

	addToolProficiencies(character, toolProfs, source) {
		if (!character.tool) character.tool = [];

		// Add tool proficiencies - simplified implementation
		if (Array.isArray(toolProfs)) {
			toolProfs.forEach(toolEntry => {
				if (typeof toolEntry === 'string') {
					character.tool.push(toolEntry);
				}
			});
		}
	}

	addLanguageProficiencies(character, langProfs, source) {
		if (!character.languages) character.languages = [];

		// Add language proficiencies
		if (Array.isArray(langProfs)) {
			langProfs.forEach(langEntry => {
				if (typeof langEntry === 'string') {
					character.languages.push(langEntry);
				} else if (langEntry.choose && langEntry.choose.from) {
					// Choose languages - take first available
					const count = langEntry.choose.count || 1;
					const available = langEntry.choose.from.slice(0, count);
					available.forEach(lang => character.languages.push(lang));
				}
			});
		}
	}

	addBackgroundEquipment(character, equipment) {
		// Background equipment is typically handled during character generation
		// This is a placeholder for future equipment system enhancement
		console.log('Background equipment to add:', equipment);
	}

	async addRacialTraitsToFeatures(character) {
		if (!character.race) return;

		// Get racial traits using existing method
		const racialTraits = await this.getRacialTraits(character.race);

		if (racialTraits.length > 0) {
			if (!character.entries) character.entries = [];

			character.entries.push({
				type: "entries",
				name: `${character.race.name} Racial Traits`,
				entries: [
					`As a ${character.race.name}, you have the following racial traits:`,
					...racialTraits.map(trait => ({
						type: "entries",
						name: trait.name,
						entries: trait.entries
					}))
				]
			});
		}

		console.log('Added racial traits to features');
	}

	async addStartingProficiencies(character) {
		const primaryClass = character.class[0];
		if (!primaryClass) return;

		// Add proficiency information
		if (!character.entries) character.entries = [];

		const proficiencies = await this.getStartingProficienciesForClass(primaryClass.name);

		if (proficiencies.length > 0) {
			character.entries.push({
				type: "entries",
				name: "Proficiencies",
				entries: [
					"You are proficient with the following:",
					...proficiencies
				]
			});
		}

		console.log('Added starting proficiencies');
	}

	async generateStartingEquipmentForClass(className, background) {
		// Basic starting equipment by class
		const classEquipment = {
			"Fighter": [
				"Leather armor (AC 11 + Dex modifier)",
				"Shield (+2 AC)",
				"Longsword",
				"Javelin (×4)",
				"Dungeoneer's pack",
				"Chain mail (AC 16) or leather armor"
			],
			"Wizard": [
				"Spellbook",
				"Dagger",
				"Component pouch or arcane focus",
				"Scholar's pack",
				"Leather armor (AC 11 + Dex modifier)",
				"Simple weapon"
			],
			"Rogue": [
				"Leather armor (AC 11 + Dex modifier)",
				"Shortsword (×2) or shortsword and simple weapon",
				"Burglar's pack or dungeoneer's pack",
				"Thieves' tools",
				"Dagger (×2)"
			],
			"Cleric": [
				"Scale mail (AC 14 + Dex modifier) or leather armor",
				"Shield (+2 AC)",
				"Simple weapon",
				"Holy symbol",
				"Priest's pack"
			]
		};

		const equipment = classEquipment[className] || [
			"Basic starting equipment for " + className,
			"Simple weapon",
			"Basic armor",
			"Adventuring gear"
		];

		// Add background-specific equipment
		if (background && background.name) {
			equipment.push(`Equipment from ${background.name} background`);
		}

		return equipment;
	}

	async getStartingProficienciesForClass(className) {
		const classProficiencies = {
			"Fighter": [
				"Armor: All armor, shields",
				"Weapons: Simple weapons, martial weapons",
				"Saving Throws: Strength, Constitution"
			],
			"Wizard": [
				"Armor: None",
				"Weapons: Daggers, darts, slings, quarterstaffs, light crossbows",
				"Saving Throws: Intelligence, Wisdom"
			],
			"Rogue": [
				"Armor: Light armor",
				"Weapons: Simple weapons, hand crossbows, longswords, rapiers, shortswords",
				"Tools: Thieves' tools",
				"Saving Throws: Dexterity, Intelligence"
			],
			"Cleric": [
				"Armor: Light armor, medium armor, shields",
				"Weapons: Simple weapons",
				"Saving Throws: Wisdom, Charisma"
			]
		};

		return classProficiencies[className] || [
			`Proficiencies for ${className}`,
			"Class-specific armor and weapons",
			"Two saving throws"
		];
	}

	async loadBackgroundData(backgroundName) {
		try {
			const response = await fetch('data/backgrounds.json');
			if (!response.ok) return null;

			const data = await response.json();
			// Return the background in the 5etools format with background array
			const background = data.background?.find(bg => bg.name === backgroundName);
			return background ? { background: [background] } : null;
		} catch (error) {
			console.error('Error loading background data:', error);
			return null;
		}
	}

	async loadRaceData(raceName) {
		try {
			const response = await fetch('data/races.json');
			if (!response.ok) return null;

			const data = await response.json();
			// Return the race in the 5etools format with race array
			const race = data.race?.find(race => race.name === raceName);
			return race ? { race: [race] } : null;
		} catch (error) {
			console.error('Error loading race data:', error);
			return null;
		}
	}

	async updateCharacterStatsForLevel(character) {
		if (!character.class || !character.class.length) return;

		const totalLevel = CharacterEditorPage.getCharacterLevel(character);
		const profBonus = this.getProficiencyBonus(totalLevel);

		// Update spell save DCs and attack bonuses for all caster classes
		await this.updateSpellcastingStats(character, profBonus);

		// Update spell slots and progression for caster classes
		await this.updateSpellProgression(character);

		// Update actions with new abilities
		await this.updateCharacterActions(character, profBonus);

		// Update speeds from class/racial features
		await this.updateCharacterSpeeds(character);

		// Update any other stats that scale with level
		await this.updateScalingStats(character, profBonus);

		// Ensure all new class features are reflected in Features & Traits
		await this.syncActionsToFeatures(character);
	}

	async updateSpellcastingStats(character, profBonus) {
		if (!character.spells) return;

		// Update spell DC and attack bonus for spellcasting classes and subclasses
		for (const classEntry of character.class) {
			try {
				let spellAbility = null;

				// Check if this is a full spellcasting class
				const classData = await this.loadClassData(classEntry.name);
				if (classData && classData.class && classData.class[0]) {
					const classInfo = classData.class[0];
					if (classInfo.spellcastingAbility) {
						spellAbility = classInfo.spellcastingAbility;
					}
				}

				// Check if this is a subclass spellcaster (Arcane Trickster, Eldritch Knight)
				if (!spellAbility && classEntry.subclass?.name) {
					if (classEntry.name === 'Rogue' && classEntry.subclass.name === 'Arcane Trickster' && classEntry.level >= 3) {
						spellAbility = 'int';
					} else if (classEntry.name === 'Fighter' && classEntry.subclass.name === 'Eldritch Knight' && classEntry.level >= 3) {
						spellAbility = 'int';
					}
				}

				if (spellAbility) {
					const abilityScore = character.abilities?.[spellAbility] || character[spellAbility] || 10;
					const abilityMod = Math.floor((abilityScore - 10) / 2);

					// Update spell DC and attack bonus
					const newDC = 8 + profBonus + abilityMod;
					const newAttackBonus = profBonus + abilityMod;

					console.log(`🔮 Updating spell DC: ${spellAbility.toUpperCase()} ${abilityScore} (mod ${abilityMod}) + prof ${profBonus} = DC ${newDC}`);

					character.spells.dc = newDC;
					character.spells.attackBonus = `+${newAttackBonus}`;
					character.spells.ability = spellAbility.charAt(0).toUpperCase() + spellAbility.slice(1);
					character.spells.spellcastingAbility = spellAbility;

					break; // Use the first spellcasting class found
				}
			} catch (e) {
				console.warn(`Could not update spellcasting for class ${classEntry.name}:`, e);
			}
		}
	}

	async updateSpellProgression(character) {
		if (!character.spells) return;

		// Calculate spell slots for each caster class and subclass
		for (const classEntry of character.class) {
			try {
				let hasSpellcasting = false;
				let classInfo = null;

				// Check if this is a full spellcasting class
				const classData = await this.loadClassData(classEntry.name);
				if (classData && classData.class && classData.class[0]) {
					classInfo = classData.class[0];
					if (classInfo.spellcastingAbility) {
						hasSpellcasting = true;
					}
				}

				// Check if this is a subclass spellcaster (Arcane Trickster, Eldritch Knight)
				if (!hasSpellcasting && classEntry.subclass?.name) {
					if ((classEntry.name === 'Rogue' && classEntry.subclass.name === 'Arcane Trickster' && classEntry.level >= 3) ||
					    (classEntry.name === 'Fighter' && classEntry.subclass.name === 'Eldritch Knight' && classEntry.level >= 3)) {
						hasSpellcasting = true;
					}
				}

				if (hasSpellcasting) {
					const classLevel = classEntry.level || 1;
					await this.updateSpellSlotsForClass(character, classEntry, classInfo, classLevel);
				}
			} catch (e) {
				console.warn(`Could not update spell progression for class ${classEntry.name}:`, e);
			}
		}
	}

	async updateSpellSlotsForClass(character, classEntry, classInfo, classLevel) {
		const className = classEntry.name;

		// Get spell slot progression table
		const spellSlots = this.getSpellSlotsForClass(className, classLevel);

		// Update spell slots for each level
		for (let spellLevel = 1; spellLevel <= 9; spellLevel++) {
			const slots = spellSlots[spellLevel] || 0;

			if (slots > 0) {
				// Initialize spell level if it doesn't exist
				if (!character.spells.levels[spellLevel.toString()]) {
					character.spells.levels[spellLevel.toString()] = {
						maxSlots: 0,
						slotsUsed: 0,
						spells: []
					};
				}

				// Update max slots (don't reduce existing slots)
				const currentMax = character.spells.levels[spellLevel.toString()].maxSlots || 0;
				character.spells.levels[spellLevel.toString()].maxSlots = Math.max(currentMax, slots);
			}
		}
	}

	isThirdCasterClass(classEntry) {
		// Check if a class entry represents a third-caster
		if (!classEntry) return false;

		const className = classEntry.name;
		const subclassName = classEntry.subclass?.name;

		// Direct third-caster subclasses
		if (subclassName === "Eldritch Knight" && className === "Fighter") {
			return true;
		}
		if (subclassName === "Arcane Trickster" && className === "Rogue") {
			return true;
		}

		return false;
	}

	getSpellSlotsForClass(className, level, classEntry = null) {
		// Standard D&D 5e spell slot progression tables
		const fullCasters = {
			"Bard": true, "Cleric": true, "Druid": true, "Sorcerer": true, "Wizard": true, "Warlock": false // Warlock is special
		};

		const halfCasters = {
			"Paladin": true, "Ranger": true
		};

		const thirdCasters = {
			"Eldritch Knight": true, "Arcane Trickster": true
		};

		if (fullCasters[className]) {
			return this.getFullCasterSlots(level);
		} else if (halfCasters[className]) {
			return this.getHalfCasterSlots(level);
		} else if (className === "Warlock") {
			return this.getWarlockSlots(level);
		} else if (thirdCasters[className] || (classEntry && this.isThirdCasterClass(classEntry))) {
			// Third-caster subclasses (Eldritch Knight, Arcane Trickster)
			return this.getThirdCasterSlots(level);
		}

		return {}; // No spell slots
	}

	getFullCasterSlots(level) {
		const slots = {
			1: [0, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
			2: [0, 0, 0, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
			3: [0, 0, 0, 0, 0, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
			4: [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
			5: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3],
			6: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2],
			7: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2],
			8: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2],
			9: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]
		};

		const result = {};
		for (let spellLevel = 1; spellLevel <= 9; spellLevel++) {
			result[spellLevel] = slots[spellLevel][level] || 0;
		}
		return result;
	}

	getHalfCasterSlots(level) {
		// Half casters start getting spells at level 2
		if (level < 2) return {};

		const effectiveLevel = Math.floor(level / 2);
		return this.getFullCasterSlots(effectiveLevel);
	}

	getThirdCasterSlots(level) {
		// Third casters start getting spells at level 3
		if (level < 3) return {};

		const effectiveLevel = Math.floor(level / 3);
		return this.getFullCasterSlots(effectiveLevel);
	}

	getWarlockSlots(level) {
		// Warlock Pact Magic progression - different from other casters
		let slots, slotLevel;

		if (level >= 17) {
			slots = 4;
			slotLevel = 5;
		} else if (level >= 11) {
			slots = 3;
			slotLevel = 5;
		} else if (level >= 9) {
			slots = 2;
			slotLevel = 5;
		} else if (level >= 7) {
			slots = 2;
			slotLevel = 4;
		} else if (level >= 5) {
			slots = 2;
			slotLevel = 3;
		} else if (level >= 3) {
			slots = 2;
			slotLevel = 2;
		} else if (level >= 2) {
			slots = 2;
			slotLevel = 1;
		} else if (level >= 1) {
			slots = 1;
			slotLevel = 1;
		} else {
			return {};
		}

		return { [slotLevel]: slots };
	}

	async updateCharacterActions(character, profBonus) {
		if (!character.action) character.action = [];

		// Check each class for new actions that should be available at this level
		for (const classEntry of character.class) {
			try {
				const classData = await this.loadClassData(classEntry.name);
				if (classData && classData.class && classData.class[0]) {
					const classInfo = classData.class[0];

					// Add spellcasting attacks if this is a caster class
					if (classInfo.spellcastingAbility) {
						await this.updateSpellcastingActions(character, classEntry, classInfo, profBonus);
					}

					// Add class-specific actions based on level
					await this.updateClassActions(character, classEntry, classInfo, profBonus);
				}
			} catch (e) {
				console.warn(`Could not update actions for class ${classEntry.name}:`, e);
			}
		}
	}

	async updateSpellcastingActions(character, classEntry, classInfo, profBonus) {
		const spellAbility = classInfo.spellcastingAbility;
		const abilityScore = character.abilities?.[spellAbility] || character[spellAbility] || 10;
		const abilityMod = Math.floor((abilityScore - 10) / 2);
		const attackBonus = profBonus + abilityMod;

		// Add or update spell attack if character has offensive cantrips
		if (character.spells && character.spells.levels && character.spells.levels['0']) {
			const cantrips = character.spells.levels['0'].spells || [];

			// Check for common offensive cantrips
			const offensiveCantrips = ['eldritch blast', 'fire bolt', 'ray of frost', 'sacred flame', 'toll the dead'];
			const hasOffensiveCantrip = cantrips.some(cantrip =>
				typeof cantrip === 'string' ?
					offensiveCantrips.includes(cantrip.toLowerCase()) :
					offensiveCantrips.includes(cantrip.name?.toLowerCase())
			);

			if (hasOffensiveCantrip) {
				// Update or add spell attack action
				const spellAttackName = "Spell Attack";
				const existingIndex = character.action.findIndex(action =>
					action.name === spellAttackName || action.name.includes("Spell Attack")
				);

				const spellAttackAction = {
					name: spellAttackName,
					entries: [
						`{@atk rs} {@hit ${attackBonus}} to hit, spell damage varies by cantrip. DC ${8 + profBonus + abilityMod} for saving throw spells.`
					]
				};

				if (existingIndex >= 0) {
					character.action[existingIndex] = spellAttackAction;
				} else {
					character.action.push(spellAttackAction);
				}
			}
		}
	}

	async updateClassActions(character, classEntry, classInfo, profBonus) {
		// Add class-specific actions based on current level
		const classLevel = classEntry.level || 1;
		const className = classEntry.name;

		// Get ability modifiers for calculations
		const getAbilityMod = (ability) => {
			const score = character.abilities?.[ability] || character[ability] || 10;
			return Math.floor((score - 10) / 2);
		};

		switch (className) {
			case "Fighter":
				if (classLevel >= 1) {
					// Second Wind
					this.addOrUpdateAction(character, "Second Wind", [
						`Regain ${Math.floor(classLevel / 2) + 1}d10 + ${classLevel} hit points as a bonus action (1/short rest).`
					]);
				}
				if (classLevel >= 2) {
					// Action Surge
					this.addOrUpdateAction(character, "Action Surge", [
						"Take one additional action on your turn (1/short rest)."
					]);
				}
				break;

			case "Barbarian":
				if (classLevel >= 1) {
					// Rage
					const rageCount = classLevel < 3 ? 2 : classLevel < 6 ? 3 : classLevel < 12 ? 4 : classLevel < 17 ? 5 : 6;
					const rageDamage = classLevel < 9 ? 2 : classLevel < 16 ? 3 : 4;
					this.addOrUpdateAction(character, "Rage", [
						`Enter rage for ${rageDamage} bonus melee damage, advantage on STR checks/saves, resistance to bludgeoning/piercing/slashing. ${rageCount} uses per long rest.`
					]);
				}
				if (classLevel >= 2) {
					// Reckless Attack
					this.addOrUpdateAction(character, "Reckless Attack", [
						"Attack with advantage, but all attacks against you have advantage until your next turn."
					]);
				}
				break;

			case "Rogue":
				if (classLevel >= 1) {
					// Sneak Attack
					const sneakDice = Math.ceil(classLevel / 2);
					this.addOrUpdateAction(character, "Sneak Attack", [
						`Deal an extra ${sneakDice}d6 damage when you have advantage or an ally is adjacent to target.`
					]);
				}
				if (classLevel >= 2) {
					// Cunning Action
					this.addOrUpdateAction(character, "Cunning Action", [
						"Dash, Disengage, or Hide as a bonus action."
					]);
				}
				break;

			case "Paladin":
				if (classLevel >= 1) {
					// Divine Sense
					const uses = 1 + getAbilityMod("cha");
					this.addOrUpdateAction(character, "Divine Sense", [
						`Detect celestials, fiends, and undead within 60 feet. ${uses} uses per long rest.`
					]);
				}
				if (classLevel >= 2) {
					// Divine Smite
					this.addOrUpdateAction(character, "Divine Smite", [
						"Expend a spell slot to deal extra 1d8 radiant damage per spell level (2d8 vs undead/fiends)."
					]);
				}
				if (classLevel >= 3) {
					// Divine Health
					this.addOrUpdateAction(character, "Divine Health", [
						"Immune to disease."
					]);
				}
				break;

			case "Cleric":
				if (classLevel >= 1) {
					// Turn Undead
					const dc = 8 + profBonus + getAbilityMod("wis");
					this.addOrUpdateAction(character, "Turn Undead", [
						`Force undead within 30 feet to make DC ${dc} Wisdom save or be turned. Channel Divinity use.`
					]);
				}
				break;

			case "Monk":
				if (classLevel >= 1) {
					// Martial Arts
					const martialDie = classLevel < 5 ? 4 : classLevel < 11 ? 6 : classLevel < 17 ? 8 : 10;
					this.addOrUpdateAction(character, "Martial Arts", [
						`Unarmed strikes use 1d${martialDie} + DEX. Bonus action unarmed strike after Attack action.`
					]);
				}
				if (classLevel >= 2) {
					// Ki points
					this.addOrUpdateAction(character, "Ki", [
						`${classLevel} ki points per short rest. Spend for Flurry of Blows, Patient Defense, or Step of the Wind.`
					]);
				}
				break;

			case "Ranger":
				if (classLevel >= 1) {
					// Favored Enemy (simplified)
					this.addOrUpdateAction(character, "Favored Enemy", [
						"Advantage on Wisdom (Survival) checks to track favored enemies and Intelligence checks to recall information."
					]);
				}
				if (classLevel >= 3 && character.spells) {
					// Hunter's Mark (if they have spells)
					this.addOrUpdateAction(character, "Hunter's Mark", [
						"Mark a creature for 1d6 bonus damage and advantage on tracking checks."
					]);
				}
				break;
		}
	}

	addOrUpdateAction(character, actionName, entries, actionData = null) {
		const existingIndex = character.action.findIndex(action =>
			action.name === actionName || action.name.includes(actionName)
		);

		let action;
		if (actionData) {
			// Use structured action data if provided
			action = {
				name: actionName,
				entries: entries,
				...actionData,
				dataType: 'action'
			};
		} else {
			// Fallback to simple action format
			action = {
				name: actionName,
				entries: entries
			};
		}

		if (existingIndex >= 0) {
			character.action[existingIndex] = action;
		} else {
			character.action.push(action);
		}

		console.log(`✨ ${existingIndex >= 0 ? 'Updated' : 'Added'} action: ${actionName} ${actionData ? '(structured)' : '(basic)'}`);
	}

	async addOrUpdateFeature(character, featureName, entries, featureData = null, source = 'class') {
		const featuresSection = this.ensureSingleFeaturesSection(character);

		// Check if feature already exists
		const existingIndex = featuresSection.entries.findIndex(entry =>
			entry.name === featureName || entry.name.includes(featureName)
		);

		let featureEntry;
		if (featureData) {
			// Use structured feature data if provided
			featureEntry = await this.createStructuredFeatureData({
				name: featureName,
				entries: entries,
				...featureData
			}, source);
		} else {
			// Fallback to simple feature format
			featureEntry = {
				type: "entries",
				name: featureName,
				entries: entries
			};
		}

		if (existingIndex >= 0) {
			featuresSection.entries[existingIndex] = featureEntry;
		} else {
			featuresSection.entries.push(featureEntry);
		}

		console.log(`✨ ${existingIndex >= 0 ? 'Updated' : 'Added'} feature: ${featureName} ${featureData ? '(structured)' : '(basic)'}`);
	}

	async validateCharacterRules(character, validationLevel = 'strict') {
		console.log('🔍 Starting comprehensive D&D 5e rule validation...');
		const validationResults = {
			valid: true,
			warnings: [],
			errors: [],
			suggestions: []
		};

		try {
			// Core D&D 5e rule validations
			await this.validateAbilityScores(character, validationResults);
			await this.validateClassRequirements(character, validationResults);
			await this.validateProficiencyRules(character, validationResults);
			await this.validateSpellcastingRules(character, validationResults);
			await this.validateEquipmentRules(character, validationResults);
			await this.validateFeatureCompatibility(character, validationResults);

			// Set overall validity
			validationResults.valid = validationResults.errors.length === 0;

			if (validationResults.valid) {
				console.log('✅ Character passes all D&D 5e rule validations');
			} else {
				console.log(`❌ Character has ${validationResults.errors.length} rule violations`);
			}

			return validationResults;
		} catch (error) {
			console.error('Error during rule validation:', error);
			validationResults.valid = false;
			validationResults.errors.push('Validation system error occurred');
			return validationResults;
		}
	}

	async validateAbilityScores(character, results) {
		// Handle both nested (character.abilities.str) and direct (character.str) formats
		const abilities = character.abilities || character;
		const requiredAbilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

		// Check all abilities are present and valid
		for (const ability of requiredAbilities) {
			const score = abilities[ability];
			if (score === undefined || score === null) {
				results.errors.push(`Missing ${ability.toUpperCase()} ability score`);
			} else if (score < 3 || score > 20) {
				results.errors.push(`${ability.toUpperCase()} score ${score} is outside valid range (3-20)`);
			} else if (score < 8) {
				results.warnings.push(`${ability.toUpperCase()} score ${score} is very low - consider point buy or rolling method`);
			}
		}

		// Validate ability score generation method compliance
		const totalPoints = Object.values(abilities).reduce((sum, score) => sum + (score || 0), 0);
		if (totalPoints < 45) {
			results.warnings.push('Total ability scores seem low - verify generation method');
		} else if (totalPoints > 108) {
			results.warnings.push('Total ability scores seem high - verify generation method');
		}
	}

	async validateClassRequirements(character, results) {
		if (!character.class || character.class.length === 0) {
			results.errors.push('Character must have at least one class');
			return;
		}

		for (const classEntry of character.class) {
			const className = classEntry.name;
			const classLevel = classEntry.level;

			// Validate multiclass requirements
			if (character.class.length > 1) {
				await this.validateMulticlassRequirements(character, classEntry, results);
			}

			// Validate class level progression
			if (classLevel < 1 || classLevel > 20) {
				results.errors.push(`Invalid level ${classLevel} for ${className} (must be 1-20)`);
			}

			// Validate subclass selection timing
			await this.validateSubclassRequirements(classEntry, results);
		}

		// Validate total character level
		const totalLevel = character.class.reduce((sum, cls) => sum + cls.level, 0);
		if (totalLevel > 20) {
			results.errors.push(`Total character level ${totalLevel} exceeds maximum of 20`);
		}
	}

	async validateMulticlassRequirements(character, classEntry, results) {
		const className = classEntry.name;
		const abilities = character.abilities || {};

		// D&D 5e multiclass ability score requirements
		const multiclassRequirements = {
			'Barbarian': {str: 13},
			'Bard': {cha: 13},
			'Cleric': {wis: 13},
			'Druid': {wis: 13},
			'Fighter': {str: 13, dex: 13}, // Either STR or DEX 13+
			'Monk': {dex: 13, wis: 13},
			'Paladin': {str: 13, cha: 13},
			'Ranger': {dex: 13, wis: 13},
			'Rogue': {dex: 13},
			'Sorcerer': {cha: 13},
			'Warlock': {cha: 13},
			'Wizard': {int: 13}
		};

		const requirements = multiclassRequirements[className];
		if (requirements) {
			for (const [ability, minScore] of Object.entries(requirements)) {
				const score = abilities[ability] || 0;

				// Special case for Fighter - need either STR OR DEX 13+
				if (className === 'Fighter') {
					const strScore = abilities.str || 0;
					const dexScore = abilities.dex || 0;
					if (strScore < 13 && dexScore < 13) {
						results.errors.push(`Multiclass Fighter requires STR 13+ OR DEX 13+ (have STR ${strScore}, DEX ${dexScore})`);
					}
				} else if (score < minScore) {
					results.errors.push(`Multiclass ${className} requires ${ability.toUpperCase()} ${minScore}+ (have ${score})`);
				}
			}
		}
	}

	async validateSubclassRequirements(classEntry, results) {
		const className = classEntry.name;
		const classLevel = classEntry.level;
		const hasSubclass = classEntry.subclass && classEntry.subclass.name;

		// Subclass selection levels by class
		const subclassLevels = {
			'Barbarian': 3, 'Bard': 3, 'Cleric': 1, 'Druid': 2,
			'Fighter': 3, 'Monk': 3, 'Paladin': 3, 'Ranger': 3,
			'Rogue': 3, 'Sorcerer': 1, 'Warlock': 1, 'Wizard': 2
		};

		const requiredLevel = subclassLevels[className];
		if (requiredLevel) {
			if (classLevel >= requiredLevel && !hasSubclass) {
				results.errors.push(`${className} level ${classLevel} must have a subclass selected (required at level ${requiredLevel})`);
			} else if (classLevel < requiredLevel && hasSubclass) {
				results.warnings.push(`${className} has subclass selected before level ${requiredLevel} requirement`);
			}
		}
	}

	async validateProficiencyRules(character, results) {
		// Validate skill proficiencies follow D&D rules
		// Count skills from both the rendered character.skill and internal _skillProficiencies
		let skillCount = 0;

		// Count from _proficiencySources which tracks actual proficiencies
		if (character._proficiencySources) {
			skillCount += Object.keys(character._proficiencySources).length;
		}

		// Also count from internal _skillProficiencies Set if it exists
		if (character._skillProficiencies && character._skillProficiencies instanceof Set) {
			// Add any internal proficiencies not already counted in _proficiencySources
			const sourcedSkills = new Set(Object.keys(character._proficiencySources || {}));
			for (const skill of character._skillProficiencies) {
				if (!sourcedSkills.has(skill)) {
					skillCount++;
				}
			}
		}

		console.log(`Skill proficiency count: ${skillCount} (sources: ${Object.keys(character._proficiencySources || {}).join(', ')})`);

		if (skillCount > 0) {
			const expectedSkills = this.calculateExpectedSkillProficiencies(character);

			if (skillCount > expectedSkills.max) {
				results.errors.push(`Too many skill proficiencies: ${skillCount} (expected max: ${expectedSkills.max})`);
			} else if (skillCount < expectedSkills.min) {
				results.warnings.push(`Few skill proficiencies: ${skillCount} (expected min: ${expectedSkills.min})`);
			}
		}

		// Validate saving throw proficiencies
		if (character.save) {
			for (const classEntry of character.class || []) {
				const expectedSaves = this.getClassSavingThrows(classEntry.name);
				for (const save of expectedSaves) {
					if (!character.save[save]) {
						results.errors.push(`Missing required ${save.toUpperCase()} saving throw proficiency for ${classEntry.name}`);
					}
				}
			}
		}
	}

	calculateExpectedSkillProficiencies(character) {
		// Calculate expected skill proficiencies based on D&D 5e rules
		let min = 0;
		let max = 0;

		// Base class skills
		for (const classEntry of character.class || []) {
			const classSkills = this.getClassSkillAllowance(classEntry.name);
			min += classSkills.min;
			max += classSkills.max;
		}

		// Background skills (typically 2)
		if (character.background) {
			min += 2;
			max += 2;
		}

		// Racial skills (varies by race)
		if (character.race) {
			const raceName = typeof character.race === 'string' ? character.race : character.race.name;
			const racialSkills = this.getRaceSkillCount(raceName);
			min += racialSkills.min;
			max += racialSkills.max;
		}

		return { min: Math.max(min, 2), max: Math.min(max, 18) }; // Reasonable bounds
	}

	getClassSkillCount(className) {
		// Standard skill proficiencies granted by each class
		const classSkills = {
			'Barbarian': { min: 2, max: 2 },
			'Bard': { min: 3, max: 3 },
			'Cleric': { min: 2, max: 2 },
			'Druid': { min: 2, max: 2 },
			'Fighter': { min: 2, max: 2 },
			'Monk': { min: 2, max: 2 },
			'Paladin': { min: 2, max: 2 },
			'Ranger': { min: 3, max: 3 },
			'Rogue': { min: 4, max: 4 },
			'Sorcerer': { min: 2, max: 2 },
			'Warlock': { min: 2, max: 2 },
			'Wizard': { min: 2, max: 2 }
		};

		return classSkills[className] || { min: 2, max: 2 };
	}

	getRaceSkillCount(raceName) {
		// Races that grant skill proficiencies
		const raceSkills = {
			'Half-Elf': { min: 2, max: 2 },
			'Human': { min: 1, max: 1 }, // Variant Human
			'Elf': { min: 1, max: 1 }, // Keen Senses (Perception)
			'Half-Orc': { min: 1, max: 1 }, // Menacing (Intimidation)
			default: { min: 0, max: 1 } // Most races don't grant skills
		};

		return raceSkills[raceName] || raceSkills.default;
	}


	getClassSkillAllowance(className) {
		const skillAllowances = {
			'Barbarian': {min: 2, max: 2},
			'Bard': {min: 3, max: 3},
			'Cleric': {min: 2, max: 2},
			'Druid': {min: 2, max: 2},
			'Fighter': {min: 2, max: 2},
			'Monk': {min: 2, max: 2},
			'Paladin': {min: 2, max: 2},
			'Ranger': {min: 3, max: 3},
			'Rogue': {min: 4, max: 4},
			'Sorcerer': {min: 2, max: 2},
			'Warlock': {min: 2, max: 2},
			'Wizard': {min: 2, max: 2}
		};
		return skillAllowances[className] || {min: 2, max: 2};
	}

	getClassSavingThrows(className) {
		const classSaves = {
			'Barbarian': ['str', 'con'],
			'Bard': ['dex', 'cha'],
			'Cleric': ['wis', 'cha'],
			'Druid': ['int', 'wis'],
			'Fighter': ['str', 'con'],
			'Monk': ['str', 'dex'],
			'Paladin': ['wis', 'cha'],
			'Ranger': ['str', 'dex'],
			'Rogue': ['dex', 'int'],
			'Sorcerer': ['con', 'cha'],
			'Warlock': ['wis', 'cha'],
			'Wizard': ['int', 'wis']
		};
		return classSaves[className] || [];
	}

	getRacialSkillCount(raceName) {
		const racialSkills = {
			'Human': 1, // Variant Human
			'Half-Elf': 2,
			'Elf': 1, // Perception typically
			"Bugbear": 1, // Stealth proficiency
			'Dwarf': 0,
			'Halfling': 0,
			'Dragonborn': 0,
			'Gnome': 0,
			'Half-Orc': 0,
			'Tiefling': 0
		};
		return racialSkills[raceName] || 0;
	}

	async validateSpellcastingRules(character, results) {
		if (!character.spells) return; // Non-spellcasters don't need spell validation

		const spellcastingClasses = character.class.filter(cls =>
			this.isSpellcastingClass(cls.name)
		);

		if (spellcastingClasses.length === 0) {
			results.warnings.push('Character has spells but no spellcasting classes');
			return;
		}

		// Validate spell slot progression
		await this.validateSpellSlots(character, spellcastingClasses, results);

		// Validate spell lists by class
		await this.validateSpellLists(character, spellcastingClasses, results);

		// Validate spellcasting ability and DC
		await this.validateSpellcastingStats(character, spellcastingClasses, results);
	}

	async validateSpellSlots(character, spellcastingClasses, results) {
		if (!character.spells.levels) return;

		// Calculate expected spell slots based on class levels
		let expectedSlots = {};
		for (const classEntry of spellcastingClasses) {
			const progression = this.getSpellcastingProgression(classEntry.name);
			const slots = this.calculateSpellSlots(classEntry.level, progression);

			for (const [level, count] of Object.entries(slots)) {
				expectedSlots[level] = (expectedSlots[level] || 0) + count;
			}
		}

		// Check actual vs expected
		for (const [level, spellLevel] of Object.entries(character.spells.levels)) {
			const actualSlots = spellLevel.maxSlots || 0;
			const expected = expectedSlots[level] || 0;

			if (actualSlots > expected) {
				results.warnings.push(`Too many level ${level} spell slots: ${actualSlots} (expected: ${expected})`);
			} else if (actualSlots < expected && level !== '0') {
				results.warnings.push(`Too few level ${level} spell slots: ${actualSlots} (expected: ${expected})`);
			}
		}
	}

	async validateSpellLists(character, spellcastingClasses, results) {
		if (!character.spells.levels) return;

		for (const [level, spellLevel] of Object.entries(character.spells.levels)) {
			if (!spellLevel.spells) continue;

			for (const spell of spellLevel.spells) {
				const spellName = typeof spell === 'string' ? spell : spell.name;

				// Check if spell is valid for character's classes
				let validForAnyClass = false;
				for (const classEntry of spellcastingClasses) {
					if (await this.isSpellValidForClass(spellName, classEntry.name, classEntry.subclass?.name, character)) {
						validForAnyClass = true;
						break;
					}
				}

				if (!validForAnyClass) {
					results.warnings.push(`Spell "${spellName}" may not be available to character's classes`);
				}
			}
		}
	}

	async validateSpellcastingStats(character, spellcastingClasses, results) {
		if (!character.spells.dc || !character.spells.attackBonus) {
			results.warnings.push('Missing spell DC or attack bonus calculation');
			return;
		}

		// Calculate expected DC based on primary spellcasting class
		const primaryClass = spellcastingClasses[0]; // Use first spellcasting class
		const spellAbility = this.getSpellcastingAbility(primaryClass.name);
		const abilityScore = character.abilities?.[spellAbility] || character[spellAbility] || 10;
		const abilityMod = Math.floor((abilityScore - 10) / 2);
		const totalLevel = CharacterEditorPage.getCharacterLevel(character);
		const profBonus = this.getProficiencyBonus(totalLevel);

		const expectedDC = 8 + profBonus + abilityMod;
		const expectedAttack = profBonus + abilityMod;

		if (character.spells.dc !== expectedDC) {
			results.warnings.push(`Spell DC ${character.spells.dc} doesn't match expected ${expectedDC} (${spellAbility.toUpperCase()} ${abilityScore})`);
		}

		const attackBonus = parseInt(character.spells.attackBonus.replace('+', ''));
		if (attackBonus !== expectedAttack) {
			results.warnings.push(`Spell attack ${character.spells.attackBonus} doesn't match expected +${expectedAttack}`);
		}
	}

	async validateEquipmentRules(character, results) {
		// Validate armor proficiency vs equipped armor
		if (character.ac && character.ac.from) {
			const armorType = this.determineArmorType(character.ac.from);
			if (armorType && !this.hasArmorProficiency(character, armorType)) {
				results.errors.push(`Character lacks proficiency for ${armorType} armor but has AC from armor`);
			}
		}

		// Validate weapon proficiency vs attacks
		if (character.action) {
			for (const action of character.action) {
				if (this.isWeaponAttack(action)) {
					const weaponType = this.determineWeaponType(action.name);
					if (weaponType && !this.hasWeaponProficiency(character, weaponType)) {
						results.warnings.push(`Character may lack proficiency with ${action.name}`);
					}
				}
			}
		}
	}

	async validateFeatureCompatibility(character, results) {
		// Check for conflicting or redundant features
		const features = this.getAllCharacterFeatures(character);
		const featureNames = features.map(f => f.name);

		// Check for duplicate features
		const duplicates = featureNames.filter((name, index) =>
			featureNames.indexOf(name) !== index
		);

		for (const duplicate of duplicates) {
			results.warnings.push(`Duplicate feature detected: ${duplicate}`);
		}

		// Validate class feature prerequisites
		for (const classEntry of character.class || []) {
			await this.validateClassFeaturePrerequisites(character, classEntry, results);
		}
	}

	async validateClassFeaturePrerequisites(character, classEntry, results) {
		// Validate that high-level features have prerequisites met
		const className = classEntry.name;
		const level = classEntry.level;

		// Example: Barbarian Brutal Critical requires Rage
		if (className === 'Barbarian' && level >= 9) {
			const hasRage = this.characterHasFeature(character, 'Rage');
			if (!hasRage) {
				results.errors.push('Barbarian level 9+ requires Rage feature');
			}
		}

		// Example: Fighter Extra Attack progression
		if (className === 'Fighter' && level >= 5) {
			const hasExtraAttack = this.characterHasFeature(character, 'Extra Attack');
			if (!hasExtraAttack) {
				results.warnings.push('Fighter level 5+ should have Extra Attack feature');
			}
		}
	}

	// Helper methods for validation
	isSpellcastingClass(className) {
		const fullCasters = ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Warlock', 'Wizard'];
		const halfCasters = ['Paladin', 'Ranger'];
		const thirdCasters = ['Fighter', 'Rogue']; // Eldritch Knight, Arcane Trickster

		return fullCasters.includes(className) || halfCasters.includes(className) || thirdCasters.includes(className);
	}

	async canCharacterSelectSpells(character, level) {
		console.log('=== CHECKING IF CHARACTER CAN SELECT SPELLS ===');
		console.log('Character:', character);
		console.log('Level:', level);

		const reasons = [];
		let canSelect = false;

		// Check each class for spellcasting ability
		for (const classEntry of character.class || []) {
			const className = classEntry.name;
			console.log(`Checking class: ${className}`);

			// Check if it's a known spellcasting class
			if (this.isSpellcastingClass(className)) {
				reasons.push(`${className} is a spellcasting class`);

				// Check level requirements for spellcasting
				const classLevel = classEntry.level || 1;
				if (className === 'Paladin' && classLevel >= 2) {
					canSelect = true;
					reasons.push(`${className} gains spells at level 2`);
				} else if (className === 'Ranger' && classLevel >= 2) {
					canSelect = true;
					reasons.push(`${className} gains spells at level 2`);
				} else if (['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Warlock', 'Wizard'].includes(className)) {
					canSelect = true;
					reasons.push(`${className} is a full caster from level 1`);
				} else if (className === 'Fighter' && classEntry.subclass?.name === 'Eldritch Knight' && classLevel >= 3) {
					canSelect = true;
					reasons.push(`Eldritch Knight Fighter gains spells at level 3`);
				} else if (className === 'Rogue' && classEntry.subclass?.name === 'Arcane Trickster' && classLevel >= 3) {
					canSelect = true;
					reasons.push(`Arcane Trickster Rogue gains spells at level 3`);
				}
			}
		}

		// Check racial spellcasting (if any)
		if (character.race) {
			const raceName = character.race.name || character.race;
			// Some races get innate spellcasting
			const spellcastingRaces = ['Tiefling', 'Drow', 'High Elf', 'Forest Gnome'];
			if (spellcastingRaces.includes(raceName)) {
				reasons.push(`${raceName} race has innate spellcasting`);
				// Don't set canSelect for racial spells alone, only class-based spell selection
			}
		}

		console.log(`Spell selection result: ${canSelect ? 'YES' : 'NO'}`);
		console.log(`Reasons: ${reasons.join(', ')}`);

		return {
			canSelect,
			reasons
		};
	}

	async isSpellValidForClass(spellName, className, subclassName = null, character = null) {
		console.log(`Checking if ${spellName} is valid for ${className} ${subclassName ? `(${subclassName})` : ''}`);

		// Check all spell levels for the spell using the existing function
		for (let level = 0; level <= 9; level++) {
			const spellsAtLevel = this.getClassSpellList(className, level);
			if (spellsAtLevel.includes(spellName)) {
				console.log(`✅ ${spellName} found in ${className} level ${level} spells`);
				return true;
			}
		}

		// Check subclass-specific spell lists if applicable
		if (subclassName) {
			// Some subclasses get expanded spell lists (like Warlock patrons)
			const expandedSpells = this.getSubclassExpandedSpells(className, subclassName);
			if (expandedSpells) {
				for (let level = 0; level <= 9; level++) {
					const spellsAtLevel = expandedSpells[level] || [];
					if (spellsAtLevel.includes(spellName)) {
						console.log(`✅ ${spellName} found in ${className} ${subclassName} expanded spells level ${level}`);
						return true;
					}
				}
			}
		}

		// Check racial spells if character provided
		if (character) {
			const racialSpells = this.getRacialSpells(character.race);
			if (racialSpells.includes(spellName)) {
				console.log(`✅ ${spellName} found in racial spells for ${character.race?.name || character.race}`);
				return true;
			}
		}

		console.log(`❌ ${spellName} not found in ${className} spell list`);
		return false;
	}

	getSubclassExpandedSpells(className, subclassName) {
		// Handle expanded spell lists for subclasses like Warlock patrons
		if (className === 'Warlock') {
			const patronSpells = {
				'The Fiend': {
					1: ['Burning Hands', 'Command'],
					2: ['Blindness/Deafness', 'Scorching Ray'],
					3: ['Fireball', 'Stinking Cloud'],
					4: ['Fire Shield', 'Wall of Fire'],
					5: ['Flame Strike', 'Hallow']
				},
				'The Great Old One': {
					1: ['Dissonant Whispers', 'Tasha\'s Hideous Laughter'],
					2: ['Calm Emotions', 'Detect Thoughts'],
					3: ['Clairvoyance', 'Sending'],
					4: ['Dominate Beast', 'Evard\'s Black Tentacles'],
					5: ['Dominate Person', 'Telekinesis']
				},
				'The Genie': {
					1: ['Detect Evil and Good'],
					2: ['Phantasmal Force'],
					3: ['Create Food and Water'],
					4: ['Phantasmal Killer'],
					5: ['Creation'],
					9: ['Wish']
				},
				'The Celestial': {
					1: ['Cure Wounds', 'Guiding Bolt'],
					2: ['Flaming Sphere', 'Lesser Restoration'],
					3: ['Daylight', 'Revivify'],
					4: ['Guardian of Faith', 'Wall of Fire'],
					5: ['Flame Strike', 'Greater Restoration']
				}
			};
			return patronSpells[subclassName] || null;
		}

		// Add other subclass expanded spells as needed
		return null;
	}

	getSpellcastingProgression(className) {
		const progressions = {
			'Bard': 'full', 'Cleric': 'full', 'Druid': 'full',
			'Sorcerer': 'full', 'Wizard': 'full',
			'Paladin': 'half', 'Ranger': 'half',
			'Warlock': 'pact',
			'Fighter': 'third', 'Rogue': 'third'
		};
		return progressions[className] || 'none';
	}

	getSpellcastingAbility(className) {
		const abilities = {
			'Bard': 'cha', 'Cleric': 'wis', 'Druid': 'wis',
			'Paladin': 'cha', 'Ranger': 'wis', 'Sorcerer': 'cha',
			'Warlock': 'cha', 'Wizard': 'int',
			'Fighter': 'int', 'Rogue': 'int'
		};
		return abilities[className] || 'int';
	}

	isWeaponAttack(action) {
		if (!action || !action.entries) return false;

		// Check if the action contains attack roll indicators
		const actionText = action.entries.join(' ').toLowerCase();
		const attackIndicators = [
			'@atk', // 5etools attack notation
			'to hit',
			'attack roll',
			'melee weapon attack',
			'ranged weapon attack',
			'weapon attack'
		];

		return attackIndicators.some(indicator => actionText.includes(indicator));
	}

	determineWeaponType(weaponName) {
		// Remove 5etools notation and get clean weapon name
		const cleanName = weaponName.replace(/\{@[^}]+\}/g, '').trim().toLowerCase();

		const weaponTypes = {
			// Simple Melee Weapons
			'club': 'simple',
			'dagger': 'simple',
			'dart': 'simple',
			'javelin': 'simple',
			'mace': 'simple',
			'quarterstaff': 'simple',
			'sickle': 'simple',
			'spear': 'simple',
			'crossbow, light': 'simple',
			'light crossbow': 'simple',
			'shortbow': 'simple',
			'sling': 'simple',

			// Martial Melee Weapons
			'battleaxe': 'martial',
			'flail': 'martial',
			'glaive': 'martial',
			'greataxe': 'martial',
			'greatsword': 'martial',
			'halberd': 'martial',
			'lance': 'martial',
			'longsword': 'martial',
			'maul': 'martial',
			'morningstar': 'martial',
			'pike': 'martial',
			'rapier': 'martial',
			'scimitar': 'martial',
			'shortsword': 'martial',
			'trident': 'martial',
			'war pick': 'martial',
			'warhammer': 'martial',
			'whip': 'martial',
			'crossbow, hand': 'martial',
			'hand crossbow': 'martial',
			'crossbow, heavy': 'martial',
			'heavy crossbow': 'martial',
			'longbow': 'martial',
			'net': 'martial'
		};

		return weaponTypes[cleanName] || null;
	}

	hasWeaponProficiency(character, weaponType) {
		if (!character.class || !weaponType) return false;

		// Check class weapon proficiencies
		for (const classEntry of character.class) {
			const classProficiencies = this.getClassWeaponProficiencies(classEntry.name);
			if (classProficiencies.includes(weaponType) || classProficiencies.includes('all')) {
				return true;
			}
		}

		// Check racial weapon proficiencies
		if (character.race) {
			const raceName = character.race.name || character.race;
			const racialProficiencies = this.getRacialWeaponProficiencies(raceName);
			if (racialProficiencies.includes(weaponType) || racialProficiencies.includes('all')) {
				return true;
			}
		}

		return false;
	}

	getClassWeaponProficiencies(className) {
		const classProficiencies = {
			'Barbarian': ['simple', 'martial'],
			'Bard': ['simple', 'hand crossbow', 'longsword', 'rapier', 'shortsword'],
			'Cleric': ['simple'],
			'Druid': ['club', 'dagger', 'dart', 'javelin', 'mace', 'quarterstaff', 'scimitar', 'shield', 'sickle', 'sling', 'spear'],
			'Fighter': ['simple', 'martial'],
			'Monk': ['simple', 'shortsword'],
			'Paladin': ['simple', 'martial'],
			'Ranger': ['simple', 'martial'],
			'Rogue': ['simple', 'hand crossbow', 'longsword', 'rapier', 'shortsword'],
			'Sorcerer': ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow'],
			'Warlock': ['simple'],
			'Wizard': ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow']
		};

		return classProficiencies[className] || [];
	}

	getRacialWeaponProficiencies(raceName) {
		const racialProficiencies = {
			'Dwarf': ['battleaxe', 'handaxe', 'light hammer', 'warhammer'],
			'Elf': ['longsword', 'shortsword', 'shortbow', 'longbow'],
			'High Elf': ['longsword', 'shortsword', 'shortbow', 'longbow'],
			'Wood Elf': ['longsword', 'shortsword', 'shortbow', 'longbow'],
			'Dark Elf': ['rapier', 'shortsword', 'hand crossbow'],
			'Drow': ['rapier', 'shortsword', 'hand crossbow'],
			'Hobgoblin': ['simple', 'martial'] // Some races get broad proficiencies
		};

		return racialProficiencies[raceName] || [];
	}

	characterHasFeature(character, featureName) {
		// Check in Features & Traits section
		const featuresSection = character.entries?.find(e => e.name === 'Features & Traits');
		if (featuresSection) {
			return featuresSection.entries.some(entry =>
				entry.name === featureName || entry.name.includes(featureName)
			);
		}

		// Check legacy feature array
		if (character.feature) {
			return character.feature.some(f => f.name === featureName || f.name.includes(featureName));
		}

		return false;
	}

	getAllCharacterFeatures(character) {
		const features = [];

		// Get from Features & Traits section
		const featuresSection = character.entries?.find(e => e.name === 'Features & Traits');
		if (featuresSection) {
			features.push(...featuresSection.entries);
		}

		// Get from legacy feature array
		if (character.feature) {
			features.push(...character.feature);
		}

		return features;
	}

	determineArmorType(acFrom) {
		if (Array.isArray(acFrom)) {
			const armorSource = acFrom.find(ac => ac.from && typeof ac.from === 'string');
			if (armorSource) {
				if (armorSource.from.includes('leather')) return 'light';
				if (armorSource.from.includes('chain') || armorSource.from.includes('scale')) return 'medium';
				if (armorSource.from.includes('plate') || armorSource.from.includes('splint')) return 'heavy';
			}
		}
		return null;
	}

	hasArmorProficiency(character, armorType) {
		// Check class proficiencies
		for (const classEntry of character.class || []) {
			const proficiencies = this.getClassArmorProficiencies(classEntry.name);
			if (proficiencies.includes(armorType)) return true;
		}
		return false;
	}

	getClassArmorProficiencies(className) {
		const armorProfs = {
			'Barbarian': ['light', 'medium', 'shield'],
			'Bard': ['light'],
			'Cleric': ['light', 'medium', 'shield'],
			'Druid': ['light', 'medium', 'shield'], // non-metal
			'Fighter': ['light', 'medium', 'heavy', 'shield'],
			'Monk': [], // Unarmored typically
			'Paladin': ['light', 'medium', 'heavy', 'shield'],
			'Ranger': ['light', 'medium', 'shield'],
			'Rogue': ['light'],
			'Sorcerer': [],
			'Warlock': ['light'],
			'Wizard': []
		};
		return armorProfs[className] || [];
	}

	createValidationSummaryHTML(validationResults) {
		if (validationResults.valid && validationResults.warnings.length === 0) {
			return `
				<div class="alert alert-success mb-3">
					<strong>✅ Character Validation Passed!</strong> Your character follows all D&D 5e rules.
				</div>
			`;
		}

		let html = '';

		// Show errors if any
		if (validationResults.errors.length > 0) {
			html += `
				<div class="alert alert-danger mb-3">
					<strong>❌ Rule Violations Found:</strong>
					<ul class="mb-0 mt-2">
						${validationResults.errors.map(error => `<li>${error}</li>`).join('')}
					</ul>
				</div>
			`;
		}

		// Show warnings if any
		if (validationResults.warnings.length > 0) {
			html += `
				<div class="alert alert-warning mb-3">
					<strong>⚠️ Rule Warnings:</strong>
					<ul class="mb-0 mt-2">
						${validationResults.warnings.map(warning => `<li>${warning}</li>`).join('')}
					</ul>
				</div>
			`;
		}

		// Show suggestions if any
		if (validationResults.suggestions.length > 0) {
			html += `
				<div class="alert alert-info mb-3">
					<strong>💡 Suggestions:</strong>
					<ul class="mb-0 mt-2">
						${validationResults.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
					</ul>
				</div>
			`;
		}

		return html;
	}

	async updateCharacterSpeeds(character) {
		// Ensure basic speed structure exists
		if (!character.speed) {
			character.speed = {};
		}

		// Set base speed from race if not already set
		if (!character.speed.walk) {
			const baseSpeed = await this.getRacialBaseSpeed(character.race);
			character.speed.walk = baseSpeed;
		}

		// Store base speed for calculations
		const baseWalkSpeed = await this.getRacialBaseSpeed(character.race);
		let currentWalkSpeed = baseWalkSpeed;

		// Check for class features that modify speed
		for (const classEntry of character.class) {
			const className = classEntry.name;
			const classLevel = classEntry.level || 1;

			if (className === "Monk" && classLevel >= 2) {
				// Monk Unarmored Movement - increases every 4 levels starting at 2
				const monkLevels = [2, 6, 10, 14, 18];
				let bonusSpeed = 0;
				for (const level of monkLevels) {
					if (classLevel >= level) bonusSpeed += 5;
				}
				currentWalkSpeed = baseWalkSpeed + bonusSpeed;
			}

			if (className === "Barbarian" && classLevel >= 5) {
				// Barbarian Fast Movement - +10 speed at 5th level
				currentWalkSpeed = Math.max(currentWalkSpeed, baseWalkSpeed + 10);
			}

			if (className === "Rogue" && classEntry.subclass?.name === "Scout" && classLevel >= 3) {
				// Scout Skirmisher - +10 speed
				currentWalkSpeed = Math.max(currentWalkSpeed, baseWalkSpeed + 10);
			}
		}

		// Update the final speed
		character.speed.walk = currentWalkSpeed;

		// Add racial special speeds
		await this.addRacialSpeeds(character);
	}

	async getRacialBaseSpeed(race) {
		if (!race || !race.name) return 30;

		try {
			// Load race data from 5etools JSON files
			const response = await fetch('data/races.json');
			if (!response.ok) {
				console.warn('Could not load race data for speed calculation');
				return 30;
			}

			const raceData = await response.json();
			const raceInfo = raceData.race?.find(r =>
				r.name === race.name && r.source === race.source
			);

			if (!raceInfo || !raceInfo.speed) {
				console.warn(`Speed data not found for race: ${race.name}`);
				return 30; // Default speed
			}

			// Handle both numeric and object speed formats
			if (typeof raceInfo.speed === 'number') {
				return raceInfo.speed;
			} else if (raceInfo.speed.walk) {
				return raceInfo.speed.walk;
			}

			return 30; // Fallback
		} catch (error) {
			console.error('Error loading racial speed data:', error);
			return 30; // Fallback to default
		}
	}

	async addRacialSpeeds(character) {
		if (!character.race || !character.race.name) return;

		try {
			// Load race data from 5etools JSON files
			const response = await fetch('data/races.json');
			if (!response.ok) {
				console.warn('Could not load race data for speed calculation');
				return;
			}

			const raceData = await response.json();
			const raceInfo = raceData.race?.find(r =>
				r.name === character.race.name && r.source === character.race.source
			);

			if (!raceInfo || !raceInfo.speed) {
				return; // No special speeds to add
			}

			// Add special movement speeds from race data
			if (typeof raceInfo.speed === 'object') {
				if (raceInfo.speed.fly && typeof raceInfo.speed.fly === 'number') {
					character.speed.fly = raceInfo.speed.fly;
				}
				if (raceInfo.speed.swim && typeof raceInfo.speed.swim === 'number') {
					character.speed.swim = raceInfo.speed.swim;
				}
				if (raceInfo.speed.climb && typeof raceInfo.speed.climb === 'number') {
					character.speed.climb = raceInfo.speed.climb;
				}
				if (raceInfo.speed.burrow && typeof raceInfo.speed.burrow === 'number') {
					character.speed.burrow = raceInfo.speed.burrow;
				}
			}

			// Remove speeds that are 0 or undefined
			Object.keys(character.speed).forEach(speedType => {
				if (!character.speed[speedType]) {
					delete character.speed[speedType];
				}
			});

		} catch (error) {
			console.error('Error loading racial speed data:', error);
		}
	}

	async updateScalingStats(character, profBonus) {
		// Update any other stats that scale with level or proficiency bonus
		const totalLevel = CharacterEditorPage.getCharacterLevel(character);

		// Update passive perception
		const wisScore = character.abilities?.wis || character.wis || 10;
		const wisMod = Math.floor((wisScore - 10) / 2);
		const hasPerceptionProf = this.characterHasSkillProficiency(character, "perception");
		character.passive = 10 + wisMod + (hasPerceptionProf ? profBonus : 0);

		// Note: Removed skill and save object creation to keep character sheets clean
		// 5etools will calculate skill/save modifiers dynamically from proficiencies
		// await this.initializeSkillProficiencies(character);
		// await this.updateSkillModifiers(character, profBonus);
		// await this.updateSavingThrows(character, profBonus);

		// Update class feature DCs that scale with proficiency bonus
		await this.updateClassFeatureDCs(character, profBonus, totalLevel);

		// Update weapon attack bonuses with proficiency
		await this.updateWeaponProficiencies(character, profBonus);
	}

	async updateSkillModifiers(character, profBonus) {
		if (!character.skill) character.skill = {};

		const skillToAbility = {
			'acrobatics': 'dex',
			'animalhandling': 'wis',
			'arcana': 'int',
			'athletics': 'str',
			'deception': 'cha',
			'history': 'int',
			'insight': 'wis',
			'intimidation': 'cha',
			'investigation': 'int',
			'medicine': 'wis',
			'nature': 'int',
			'perception': 'wis',
			'performance': 'cha',
			'persuasion': 'cha',
			'religion': 'int',
			'sleightofhand': 'dex',
			'stealth': 'dex',
			'survival': 'wis'
		};

		// Calculate modifiers for all skills, but only add proficiency bonus where character has proficiency
		for (const [skill, ability] of Object.entries(skillToAbility)) {
			const abilityScore = character.abilities?.[ability] || character[ability] || 10;
			const abilityMod = Math.floor((abilityScore - 10) / 2);

			// Check proficiency using only the internal tracking and data sources (not existing modifiers)
			const hasProficiency = this.characterHasSkillProficiencyFromSources(character, skill);
			const hasExpertise = this.characterHasSkillExpertise(character, skill);

			let modifier = abilityMod;
			if (hasExpertise) {
				modifier += profBonus * 2; // Expertise doubles proficiency bonus
			} else if (hasProficiency) {
				modifier += profBonus;
			}

			character.skill[skill] = modifier;
		}
	}

	async updateSavingThrows(character, profBonus) {
		if (!character.save) character.save = {};

		const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

		// Calculate modifiers for all saving throws, but only add proficiency bonus where character has proficiency
		for (const ability of abilities) {
			const abilityScore = character.abilities?.[ability] || character[ability] || 10;
			const abilityMod = Math.floor((abilityScore - 10) / 2);

			const hasProficiency = await this.characterHasSavingThrowProficiency(character, ability);

			let modifier = abilityMod;
			if (hasProficiency) {
				modifier += profBonus;
			}

			character.save[ability] = modifier;
		}
	}

	async updateClassFeatureDCs(character, profBonus, totalLevel) {
		// Update class feature DCs that scale with proficiency bonus
		for (const classEntry of character.class) {
			try {
				const classData = await this.loadClassData(classEntry.name);
				if (classData && classData.class && classData.class[0]) {
					const classInfo = classData.class[0];

					// Update Ki save DC for Monks
					if (classEntry.name.toLowerCase() === 'monk') {
						const wisScore = character.abilities?.wis || character.wis || 10;
						const wisMod = Math.floor((wisScore - 10) / 2);
						const kiDC = 8 + profBonus + wisMod;

						// Update existing Ki features with correct DC
						if (character.feature) {
							character.feature.forEach(feature => {
								if (feature.name === 'Ki' || (feature.entries && feature.entries.some(e =>
									typeof e === 'string' && e.includes('Ki')
								))) {
									feature.entries = feature.entries.map(entry => {
										if (typeof entry === 'string' && entry.includes('DC')) {
											return entry.replace(/DC \d+/, `DC ${kiDC}`);
										}
										return entry;
									});
								}
							});
						}
					}

					// Update Channel Divinity DC for Clerics and Paladins
					if (['cleric', 'paladin'].includes(classEntry.name.toLowerCase())) {
						const chaScore = character.abilities?.cha || character.cha || 10;
						const chaMod = Math.floor((chaScore - 10) / 2);
						const channelDC = 8 + profBonus + chaMod;

						// Update existing Channel Divinity features
						if (character.feature) {
							character.feature.forEach(feature => {
								if (feature.name.includes('Channel Divinity') || feature.name.includes('Turn Undead')) {
									feature.entries = feature.entries.map(entry => {
										if (typeof entry === 'string' && entry.includes('DC')) {
											return entry.replace(/DC \d+/, `DC ${channelDC}`);
										}
										return entry;
									});
								}
							});
						}
					}
				}
			} catch (e) {
				console.warn(`Could not update class feature DCs for ${classEntry.name}:`, e);
			}
		}
	}

	async updateWeaponProficiencies(character, profBonus) {
		if (!character.action) return;

		// Update weapon attacks with proficiency bonuses
		character.action.forEach(action => {
			if (action.entries && action.entries.some(e =>
				typeof e === 'string' && e.includes('weapon attack')
			)) {
				action.entries = action.entries.map(entry => {
					if (typeof entry === 'string' && entry.includes('+')) {
						// Update attack bonus to include proficiency
						// This is a simplified approach - in a full implementation,
						// you'd check weapon proficiencies from class data
						return entry.replace(/\+(\d+) to hit/, `+${profBonus + parseInt(RegExp.$1) || profBonus} to hit`);
					}
					return entry;
				});
			}
		});
	}

	characterHasSkillExpertise(character, skillName) {
		// Check if character has expertise in a skill (doubles proficiency bonus)
		// This would need to be implemented based on how expertise is stored
		// For now, check for rogue's "Expertise" feature or similar
		if (character.feature) {
			return character.feature.some(feature =>
				feature.name === 'Expertise' &&
				feature.entries.some(entry =>
					typeof entry === 'string' && entry.toLowerCase().includes(skillName.toLowerCase())
				)
			);
		}
		return false;
	}

	async characterHasSavingThrowProficiency(character, ability) {
		// In D&D 5e, you only get saving throw proficiencies from your FIRST class when multiclassing
		if (!character.class || character.class.length === 0) {
			return false;
		}

		const primaryClass = character.class[0]; // First class only
		try {
			const classData = await this.loadClassData(primaryClass.name);
			if (classData && classData.class && classData.class[0] && classData.class[0].proficiency) {
				const proficiencies = classData.class[0].proficiency;
				// Check if the ability is in the proficiency array
				return proficiencies.includes(ability);
			}
		} catch (e) {
			console.warn(`Could not load saving throw proficiencies for ${primaryClass.name}:`, e);
		}

		return false;
	}

	characterHasSkillProficiencyFromSources(character, skillName) {
		// Check proficiency from sources only (no circular logic with existing modifiers)

		// First check the internal proficiency tracking set
		if (character._skillProficiencies && character._skillProficiencies instanceof Set && character._skillProficiencies.has(skillName)) {
			return true;
		}

		return false;
	}

	async characterHasSkillProficiency(character, skillName) {
		// Check if character has proficiency in a skill from multiple sources

		// First check the internal proficiency tracking set
		if (character._skillProficiencies && character._skillProficiencies instanceof Set && character._skillProficiencies.has(skillName)) {
			return true;
		}

		// Check class skill proficiencies (only first class due to multiclassing rules)
		if (character.class && character.class.length > 0) {
			const hasProficiency = await this.classGrantsSkillProficiency(character.class[0].name, skillName);
			if (hasProficiency) return true;
		}

		// Check background skill proficiencies
		if (character.background) {
			const hasProficiency = await this.backgroundGrantsSkillProficiency(character.background, skillName);
			if (hasProficiency) return true;
		}

		// Check racial skill proficiencies
		if (character.race) {
			const hasProficiency = await this.raceGrantsSkillProficiency(character.race, skillName);
			if (hasProficiency) return true;
		}

		return false;
	}

	normalizeSkillName(skillName) {
		// Normalize skill names to lowercase with no spaces for consistency
		return skillName.toLowerCase().replace(/\s+/g, '').replace(/[^\w]/g, '');
	}

	getAbilityScoreForSkill(character, skillName) {
		const skillToAbility = {
			'acrobatics': 'dex',
			'animalhandling': 'wis',
			'arcana': 'int',
			'athletics': 'str',
			'deception': 'cha',
			'history': 'int',
			'insight': 'wis',
			'intimidation': 'cha',
			'investigation': 'int',
			'medicine': 'wis',
			'nature': 'int',
			'perception': 'wis',
			'performance': 'cha',
			'persuasion': 'cha',
			'religion': 'int',
			'sleightofhand': 'dex',
			'stealth': 'dex',
			'survival': 'wis'
		};

		const normalizedSkillName = this.normalizeSkillName(skillName);
		const ability = skillToAbility[normalizedSkillName];
		if (!ability) return 10;

		return character.abilities?.[ability] || character[ability] || 10;
	}

	async classGrantsSkillProficiency(className, skillName) {
		try {
			const classData = await this.loadClassData(className);
			if (classData && classData.class && classData.class[0] && classData.class[0].startingProficiencies) {
				const proficiencies = classData.class[0].startingProficiencies;
				if (proficiencies.skills) {
					// Handle different skill proficiency formats
					if (Array.isArray(proficiencies.skills)) {
						return proficiencies.skills.some(skill =>
							skill.toLowerCase().includes(skillName.toLowerCase())
						);
					} else if (proficiencies.skills.choose && proficiencies.skills.choose.from) {
						return proficiencies.skills.choose.from.some(skill =>
							skill.toLowerCase().includes(skillName.toLowerCase())
						);
					}
				}
			}
		} catch (e) {
			// Continue checking
		}
		return false;
	}

	async backgroundGrantsSkillProficiency(backgroundName, skillName) {
		try {
			const backgroundData = await this.loadBackgroundData(backgroundName);
			if (backgroundData && backgroundData.background && backgroundData.background[0] && backgroundData.background[0].skillProficiencies) {
				const skillProfs = backgroundData.background[0].skillProficiencies;
				return skillProfs.some(profSet =>
					Object.keys(profSet).some(skill =>
						skill.toLowerCase().includes(skillName.toLowerCase())
					)
				);
			}
		} catch (e) {
			// Continue checking
		}
		return false;
	}

	async raceGrantsSkillProficiency(raceName, skillName) {
		try {
			const raceData = await this.loadRaceData(raceName);
			if (raceData && raceData.race && raceData.race[0] && raceData.race[0].skillProficiencies) {
				const skillProfs = raceData.race[0].skillProficiencies;
				return skillProfs.some(profSet =>
					Object.keys(profSet).some(skill =>
						skill.toLowerCase().includes(skillName.toLowerCase())
					)
				);
			}
		} catch (e) {
			// Continue checking
		}
		return false;
	}

	async syncActionsToFeatures(character) {
		// Ensure single Features & Traits section exists
		const featuresSection = this.ensureSingleFeaturesSection(character);

		// Sync important actions to Features & Traits if they're not already there
		if (character.action && character.action.length > 0) {
			const importantActions = [
				"Second Wind", "Action Surge", "Rage", "Reckless Attack",
				"Sneak Attack", "Cunning Action", "Divine Sense", "Divine Smite",
				"Turn Undead", "Martial Arts", "Ki", "Hunter's Mark"
			];

			character.action.forEach(action => {
				if (importantActions.includes(action.name)) {
					// Check if this feature already exists in Features & Traits
					const featureExists = featuresSection.entries.some(entry =>
						entry.name === action.name || (entry.entries && entry.entries.some(e =>
							typeof e === 'string' && e.includes(action.name)
						))
					);

					if (!featureExists) {
						// Add to Features & Traits
						featuresSection.entries.push({
							type: "entries",
							name: action.name,
							entries: action.entries || [`${action.name} class feature.`]
						});
					}
				}
			});
		}
	}

	_createFallbackCharacterDisplay(character) {
		// Create a simple fallback display when the main renderer fails
		const name = character.name || "Unnamed Character";
		const level = character._fLevel || 1;
		const race = character.race?.name || "Unknown Race";
		const classes = character._fClass || "Unknown Class";
		const background = character.background?.name || "Unknown Background";

		return $(`
			<div class="ve-flex-col w-100">
				<h3>${name}</h3>
				<p><strong>Level ${level} ${race} ${classes}</strong></p>
				<p><strong>Background:</strong> ${background}</p>
				<h4>Abilities</h4>
				<ul>
					<li>STR: ${character.abilities?.str || 10}</li>
					<li>DEX: ${character.abilities?.dex || 10}</li>
					<li>CON: ${character.abilities?.con || 10}</li>
					<li>INT: ${character.abilities?.int || 10}</li>
					<li>WIS: ${character.abilities?.wis || 10}</li>
					<li>CHA: ${character.abilities?.cha || 10}</li>
				</ul>
				<p><em>Character rendering is using fallback display due to error.</em></p>
			</div>
		`);
	}

	async applyLevelUpFeaturesToCharacter(character) {
		// Initialize both entries and trait arrays if they don't exist
		if (!character.entries) {
			character.entries = [];
		}
		if (!character.trait) {
			character.trait = [];
		}

		// Ensure single Features & Traits section exists
		const featuresSection = this.ensureSingleFeaturesSection(character);
		console.log('Features & Traits section has', featuresSection.entries.length, 'entries');

		// Apply automatic features from levelUpState.pendingFeatures
		if (this.levelUpState && this.levelUpState.pendingFeatures) {
			this.levelUpState.pendingFeatures.forEach((featureData, index) => {
				console.log(`Processing pending feature ${index + 1}:`, featureData);

				if (featureData.type !== 'optional') {
					// Add features to the existing Features & Traits section
					const featureName = featureData.feature.name || 'Unknown Feature';
					const featureEntries = featureData.feature.entries || [`${featureName} - Gained at level ${this.levelUpState.newLevel}.`];

					// Skip spell selection for non-spellcasters
					if (featureName.includes('Spell Selection') && character.class) {
						const isAnyClassSpellcaster = character.class.some(cls =>
							this.isSpellcastingClass(cls.name, cls)
						);
						if (!isAnyClassSpellcaster) {
							console.log(`Skipped "${featureName}" for non-spellcaster`);
							return; // Skip this feature
						}
					}

					// Check for duplicate features before adding (more robust check)
					const existingFeature = featuresSection.entries.find(entry => {
						// Check exact name match
						if (entry.name === featureName) return true;

						// Check if it's a string entry that contains the feature name
						if (typeof entry === 'string' && entry.includes(featureName)) return true;

						// Check nested entries for the feature name
						if (entry.entries && Array.isArray(entry.entries)) {
							return entry.entries.some(e =>
								typeof e === 'string' && e.includes(featureName)
							);
						}

						// Check for similar names (handles cases like "Eldritch Invocations" vs "Eldritch Invocations (Level X)")
						if (entry.name && featureName) {
							const normalizedExisting = entry.name.toLowerCase().replace(/\s*\([^)]*\)|\s*-.*$/g, '').trim();
							const normalizedNew = featureName.toLowerCase().replace(/\s*\([^)]*\)|\s*-.*$/g, '').trim();
							if (normalizedExisting === normalizedNew) return true;
						}

						return false;
					});
					if (!existingFeature) {
						// Create feature entry for the Features & Traits section
						const featureEntry = {
							type: "entries",
							name: featureName,
							entries: featureEntries
						};

						// Add to the existing Features & Traits section
						featuresSection.entries.push(featureEntry);

						console.log(`Added feature "${featureName}" to Features & Traits section`);
					} else {
						console.log(`Skipped duplicate feature: ${featureName}`);
					}
				}
			});
		}

		// Apply chosen features from levelUpState.choices
		if (this.levelUpState && this.levelUpState.choices) {
			for (const choice of this.levelUpState.choices) {
				if (choice.type === 'abilityScores' && choice.scores) {
					// Apply initial ability score assignment for level 0 characters
					console.log('Applying initial ability scores:', choice.scores);
					Object.assign(character, choice.scores);

					// Also ensure AC and passive perception are updated
					character.ac = 10 + Math.floor((choice.scores.dex - 10) / 2);
					character.passive = 10 + Math.floor((choice.scores.wis - 10) / 2);

				} else if (choice.type === 'abilityScoreImprovement' && choice.abilityChanges) {
					// Apply ability score improvements
					// Check if character uses nested abilities object or direct properties
					const hasNestedAbilities = 'abilities' in character;

					if (hasNestedAbilities) {
						// Handle nested abilities format
						if (!character.abilities) {
							character.abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
						}

						console.log('Before ASI application (nested):', JSON.stringify(character.abilities));
						Object.entries(choice.abilityChanges).forEach(([ability, increase]) => {
							const oldValue = character.abilities[ability] || 10;
							const newValue = Math.min(20, oldValue + increase);
							console.log(`ASI: ${ability} ${oldValue} -> ${newValue} (+${increase})`);
							character.abilities[ability] = newValue;
						});
						console.log('After ASI application (nested):', JSON.stringify(character.abilities));
					} else {
						// Handle direct properties format
						const beforeAbilities = {
							str: character.str || 10,
							dex: character.dex || 10,
							con: character.con || 10,
							int: character.int || 10,
							wis: character.wis || 10,
							cha: character.cha || 10
						};

						console.log('Before ASI application (direct):', JSON.stringify(beforeAbilities));
						Object.entries(choice.abilityChanges).forEach(([ability, increase]) => {
							const oldValue = character[ability] || 10;
							const newValue = Math.min(20, oldValue + increase);
							console.log(`ASI: ${ability} ${oldValue} -> ${newValue} (+${increase})`);
							character[ability] = newValue;
						});

						const afterAbilities = {
							str: character.str || 10,
							dex: character.dex || 10,
							con: character.con || 10,
							int: character.int || 10,
							wis: character.wis || 10,
							cha: character.cha || 10
						};
						console.log('After ASI application (direct):', JSON.stringify(afterAbilities));
					}

					// Add entry describing the improvement
					const improvementText = Object.entries(choice.abilityChanges)
						.map(([ability, increase]) => `${ability.toUpperCase()} +${increase}`)
						.join(', ');

					const improvementDescription = [`Increased ability scores: ${improvementText}`];
					const featureName = `Ability Score Improvement (Level ${this.levelUpState.newLevel})`;

					// Check for duplicate features before adding (using level-specific name)
					const existingFeature = featuresSection.entries.find(entry => entry.name === featureName);
					if (!existingFeature) {
						const featureEntry = {
							type: "entries",
							name: featureName,
							entries: improvementDescription
						};
						featuresSection.entries.push(featureEntry);
					} else {
						console.log(`Skipped duplicate ASI for level ${this.levelUpState.newLevel}`);
					}

					console.log(`Applied ASI: ${improvementText} at level ${this.levelUpState.newLevel}`);

					// Recalculate derived stats after ability changes
					this.recalculateDerivedStats(character);

				} else if (choice.type === 'feat' && choice.featName) {
					// Apply feat choice
					const featDescription = [choice.featDescription || `${choice.featName} feat selected at level ${this.levelUpState.newLevel}.`];
					const featureName = `Feat: ${choice.featName}`;

					// Check for duplicate features before adding
					const existingFeature = featuresSection.entries.find(entry => entry.name === featureName);
					if (!existingFeature) {
						const featureEntry = {
							type: "entries",
							name: featureName,
							entries: featDescription
						};
						featuresSection.entries.push(featureEntry);
						console.log(`Applied feat: ${choice.featName} at level ${this.levelUpState.newLevel}`);
					} else {
						console.log(`Skipped duplicate feat: ${choice.featName}`);
					}

				} else if (choice.type === 'fightingStyle' && choice.styleName) {
					// Apply fighting style choice
					const styleDescription = [choice.styleDescription || `${choice.styleName} fighting style selected.`];
					const featureName = `Fighting Style: ${choice.styleName}`;

					// Check for duplicate features before adding
					const existingFeature = featuresSection.entries.find(entry => entry.name === featureName);
					if (!existingFeature) {
						const featureEntry = {
							type: "entries",
							name: featureName,
							entries: styleDescription
						};
						featuresSection.entries.push(featureEntry);
						console.log(`Applied fighting style: ${choice.styleName} at level ${this.levelUpState.newLevel}`);
					} else {
						console.log(`Skipped duplicate fighting style: ${choice.styleName}`);
					}

				} else if (choice.type === 'metamagic' && choice.selections) {
					// Apply metamagic choices
					for (const selection of choice.selections) {
						const featureName = `Metamagic: ${selection.name}`;

						// Check for duplicate features before adding
						const existingFeature = featuresSection.entries.find(entry => entry.name === featureName);
						if (!existingFeature) {
							const featureEntry = {
								type: "entries",
								name: featureName,
								entries: [selection.description, `Cost: ${selection.cost}`]
							};
							featuresSection.entries.push(featureEntry);
						} else {
							console.log(`Skipped duplicate metamagic: ${selection.name}`);
						}
					}
					console.log(`Applied ${choice.selections.length} metamagic options at level ${this.levelUpState.newLevel}`);

				} else if (choice.type === 'dragonbornAncestry' && choice.ancestry) {
					// Apply dragonborn ancestry choice
					const ancestry = choice.ancestry;
					const featureName = `Draconic Ancestry: ${ancestry.name} Dragon`;

					// Check for duplicate features before adding
					const existingFeature = featuresSection.entries.find(entry => entry.name === featureName);
					if (!existingFeature) {
						const featureEntry = {
							type: "entries",
							name: featureName,
							entries: [
								`Damage Type: ${ancestry.damageType}`,
								`Breath Weapon: ${ancestry.breathWeapon}`,
								`Damage Resistance: ${ancestry.resistance}`
							]
						};
						featuresSection.entries.push(featureEntry);

						// Add damage resistance to character
						if (!character.resist) character.resist = [];
						if (!character.resist.includes(ancestry.resistance.toLowerCase())) {
							character.resist.push(ancestry.resistance.toLowerCase());
						}

						console.log(`Applied dragonborn ancestry: ${ancestry.name} at level ${this.levelUpState.newLevel}`);
					} else {
						console.log(`Skipped duplicate dragonborn ancestry: ${ancestry.name}`);
					}

				} else if (choice.type === 'classFeature' && choice.featureName) {
					// Apply general class feature choices
					const featureName = choice.featureName;

					// Check for duplicate features before adding
					const existingFeature = featuresSection.entries.find(entry => entry.name === featureName);
					if (!existingFeature) {
						const featureEntry = {
							type: "entries",
							name: featureName,
							entries: choice.featureDescription ? [choice.featureDescription] : [`${featureName} class feature selected.`]
						};
						featuresSection.entries.push(featureEntry);
						console.log(`Applied class feature: ${featureName} at level ${this.levelUpState.newLevel}`);
					} else {
						console.log(`Skipped duplicate class feature: ${featureName}`);
					}

				} else if (choice.type === 'racialFeature' && choice.featureName) {
					// Apply racial feature choices
					const featureEntry = {
						type: "entries",
						name: choice.featureName,
						entries: choice.featureDescription ? [choice.featureDescription] : [`${choice.featureName} racial feature selected.`]
					};
					featuresSection.entries.push(featureEntry);

					console.log(`Applied racial feature: ${choice.featureName} at level ${this.levelUpState.newLevel}`);

				} else if (choice.type === 'optional' && choice.selections) {
					// Apply optional feature selections
					choice.selections.forEach(selection => {
						const selectionDescription = selection.entries || [`${selection.name} - Selected at level ${this.levelUpState.newLevel}.`];

						const featureEntry = {
							type: "entries",
							name: selection.name,
							entries: selectionDescription
						};
						featuresSection.entries.push(featureEntry);
					});
				} else if (choice.type === 'generic' && choice.feature) {
					// Apply generic feature choices
					const featureName = choice.feature.name || 'Unknown Feature';
					const featureDescription = choice.feature.entries || [`${featureName} - ${choice.notes || 'Selected at level ' + this.levelUpState.newLevel}.`];

					const featureEntry = {
						type: "entries",
						name: featureName,
						entries: featureDescription
					};
					featuresSection.entries.push(featureEntry);

					console.log(`Applied generic feature: ${featureName} with notes: ${choice.notes}`);

				} else if (choice.type === 'skillSelection' && choice.selectedSkills) {
					// Apply skill proficiency selections
					console.log('Applying skill proficiencies:', choice.selectedSkills);

					choice.selectedSkills.forEach(skillName => {
						this.addSingleSkillProficiency(character, skillName, 'Class');
					});

					// Update skill modifiers to include the new proficiencies
					// Note: Removed skill modifier updates to keep character sheets clean
					// const totalLevel = CharacterEditorPage.getCharacterLevel(character);
					// const profBonus = this.getProficiencyBonus(totalLevel);
					// await this.updateSkillModifiers(character, profBonus);

					console.log(`Applied ${choice.selectedSkills.length} skill proficiencies from class selection`);

				} else if (choice.type === 'multiclassSkillSelection' && choice.selectedSkills) {
					// Apply multiclass skill proficiency selections
					console.log('Applying multiclass skill proficiencies:', choice.selectedSkills);

					choice.selectedSkills.forEach(skillName => {
						this.addSingleSkillProficiency(character, skillName, 'Multiclass');
					});

					// Update skill modifiers to include the new proficiencies
					// Note: Removed skill modifier updates to keep character sheets clean
					// const totalLevel = CharacterEditorPage.getCharacterLevel(character);
					// const profBonus = this.getProficiencyBonus(totalLevel);
					// await this.updateSkillModifiers(character, profBonus);

					console.log(`Applied ${choice.selectedSkills.length} multiclass skill proficiencies`);

				} else if (choice.type === 'spells' && choice.selections) {
					// Apply spell selections to proper spell level slots
					const spells = choice.selections;

					// Initialize spells structure if it doesn't exist
					if (!character.spells) character.spells = {};
					if (!character.spells.levels) character.spells.levels = {};

					// Process spells by their actual spell levels
					for (const spellLevel of Object.keys(spells)) {
						const spellsAtLevel = spells[spellLevel];
						if (spellsAtLevel && spellsAtLevel.length > 0) {
							// Initialize the spell level if it doesn't exist
							if (!character.spells.levels[spellLevel]) {
								character.spells.levels[spellLevel] = {
									maxSlots: spellLevel === '0' ? 0 : 0, // Will be updated by spell slot progression
									slotsUsed: 0,
									spells: []
								};
							}

							// Add spells to the correct level, avoiding duplicates
							for (const spellName of spellsAtLevel) {
								// Check if spell already exists (handle both string and object formats)
								const existingSpell = character.spells.levels[spellLevel].spells.find(s =>
									(typeof s === 'string' ? s : s.name) === spellName
								);

								if (!existingSpell) {
									// Store spell as string only (per user requirement)
									character.spells.levels[spellLevel].spells.push(spellName);
									console.log(`✨ Added spell to character: ${spellName} (Level ${spellLevel})`);
								}
							}
						}
					}

					// Create feature entry for display
					const spellEntries = [];
					for (const spellLevel of Object.keys(spells)) {
						const spellsAtLevel = spells[spellLevel];
						if (spellsAtLevel && spellsAtLevel.length > 0) {
							const levelName = spellLevel === '0' ? 'Cantrips Known' : `Level ${spellLevel} Spells Known`;
							spellEntries.push(`**${levelName}:** ${spellsAtLevel.join(', ')}`);
						}
					}

					if (spellEntries.length > 0) {
						const featureEntry = {
							type: "entries",
							name: "Spellcasting",
							entries: spellEntries
						};
						featuresSection.entries.push(featureEntry);

						const totalSpells = Object.values(spells).reduce((sum, arr) => sum + arr.length, 0);
						console.log(`Applied ${totalSpells} spell selections across ${Object.keys(spells).length} spell levels`);
					}

				} else if (choice.selectedOption) {
					// Apply other feature choices
					const optionName = choice.selectedOption.name || 'Unknown Option';
					const optionDescription = choice.selectedOption.entries || choice.selectedOption.description || [`${optionName} - Selected at level ${this.levelUpState.newLevel}.`];

					const featureEntry = {
						type: "entries",
						name: optionName,
						entries: optionDescription
					};
					featuresSection.entries.push(featureEntry);
				}
			}
		}

		// Apply optional feature choice if it exists
		if (this.levelUpState && this.levelUpState.optionalFeatureChoice) {
			const choice = this.levelUpState.optionalFeatureChoice;
			const featureEntry = {
				type: "entries",
				name: choice.choice.name,
				entries: choice.choice.entries || [`${choice.choice.name} - Selected at level ${this.levelUpState.newLevel}.`]
			};
			featuresSection.entries.push(featureEntry);
		}

		// Show HP choice modal and update hit points based on user choice
		this.showHPChoiceModal(character);

		// Update spell slots if character is a spellcaster
		this.updateSpellSlotsForLevelUp(character);
	}

	recalculateDerivedStats(character) {
		// Recalculate all stats that depend on ability scores after ASI
		console.log('Recalculating derived stats after ability score changes...');

		// Calculate ability modifiers (handle both nested and direct formats)
		const getModifier = (score) => Math.floor((score - 10) / 2);
		const strMod = getModifier(character.abilities?.str || character.str || 10);
		const dexMod = getModifier(character.abilities?.dex || character.dex || 10);
		const conMod = getModifier(character.abilities?.con || character.con || 10);
		const intMod = getModifier(character.abilities?.int || character.int || 10);
		const wisMod = getModifier(character.abilities?.wis || character.wis || 10);
		const chaMod = getModifier(character.abilities?.cha || character.cha || 10);

		// Update proficiency bonus based on total character level
		const totalLevel = character.level || 1;
		character.profBonus = this.getProficiencyBonus(totalLevel);

		// Update hit points if CON changed
		if (character.hitPoints && character.hitPoints.max) {
			const classes = character.class || [];
			let totalHitDice = 0;

			classes.forEach(cls => {
				totalHitDice += cls.level || 0;
			});

			// Simple HP recalculation - update based on CON modifier change
			// This is a simplified version - real D&D HP calculation is more complex
			const oldConMod = Math.floor(((character.hitPoints.max - 8) / totalHitDice - 1) / 1); // Estimate old CON mod
			const hpIncrease = (conMod - oldConMod) * totalHitDice;

			if (hpIncrease !== 0) {
				character.hitPoints.max += hpIncrease;
				character.hitPoints.current += hpIncrease;
			}
		}

		// Update spellcasting stats if character has spells
		if (character.spells) {
			this.updateSpellcastingStats(character, character.profBonus);
		}

		console.log('Derived stats recalculated:', {
			profBonus: character.profBonus,
			hitPoints: character.hitPoints,
			modifiers: { str: strMod, dex: dexMod, con: conMod, int: intMod, wis: wisMod, cha: chaMod }
		});
	}

	showHPChoiceModal(character) {
		const classes = character.class;
		if (!classes || !Array.isArray(classes)) {
			return;
		}

		const selectedClassIndex = this.levelUpState.selectedClassIndex;
		if (selectedClassIndex === undefined || !classes[selectedClassIndex]) {
			return;
		}

		const selectedClass = classes[selectedClassIndex];
		const className = selectedClass.name;
		const hitDie = this.getClassHitDie(className, character);

		// Handle both nested abilities object and direct properties for CON
		const conScore = character.abilities ? character.abilities.con : character.con || 10;
		const conMod = Math.floor((conScore - 10) / 2);

		// Calculate average HP gain
		const averageGain = Math.floor(hitDie / 2) + 1 + conMod;
		const maxPossibleGain = hitDie + conMod;
		const minPossibleGain = 1 + conMod;

		// Simulate a dice roll
		const rolledValue = Math.floor(Math.random() * hitDie) + 1;
		const rolledGain = rolledValue + conMod;

		const modalContent = `
			<p class="mb-3"><strong>Leveling up ${className}</strong></p>
			<p class="mb-3">Hit Die: d${hitDie} + CON modifier (${conMod >= 0 ? '+' : ''}${conMod})</p>

			<h6>Choose HP Gain Method:</h6>
			<div class="form-group">
				<div class="form-check mb-3">
					<input class="form-check-input" type="radio" name="hpChoice" id="takeAverage" value="average" checked>
					<label class="form-check-label" for="takeAverage">
						<strong>Take Average: ${averageGain} HP</strong>
						<small class="text-muted d-block">Safe choice - always get the average value</small>
					</label>
				</div>
				<div class="form-check mb-3">
					<input class="form-check-input" type="radio" name="hpChoice" id="rollDice" value="roll">
					<label class="form-check-label" for="rollDice">
						<strong>Roll Dice: ${rolledGain} HP</strong>
						<small class="text-muted d-block">You rolled ${rolledValue} on d${hitDie} + ${conMod} CON = ${rolledGain} HP</small>
						<small class="text-muted d-block">Range: ${minPossibleGain}-${maxPossibleGain} HP</small>
					</label>
				</div>
			</div>

			<div id="rollResult" class="alert alert-info" style="display: none;">
				<strong>New Roll:</strong> <span id="newRollValue"></span> HP
			</div>
		`;

		const $modal = UiUtil.getModal({
			title: "Hit Point Increase",
			cbClose: () => {
				// If modal is closed without selection, default to average
				this.updateHitPointsForLevelUp(character, averageGain);
			}
		});

		const $modalInner = $modal.find('.modal-dialog');
		$modalInner.addClass('modal-lg');

		const $modalBody = $modal.find('.modal-body');
		$modalBody.html(modalContent);

		const $modalFooter = $modal.find('.modal-footer');
		$modalFooter.empty();

		const $btnReroll = $('<button class="btn btn-secondary mr-2">Roll Again</button>');
		const $btnConfirm = $('<button class="btn btn-primary">Confirm Choice</button>');
		const $btnCancel = $('<button class="btn btn-outline-secondary">Cancel</button>');

		// Reroll functionality
		$btnReroll.click(() => {
			const newRoll = Math.floor(Math.random() * hitDie) + 1;
			const newGain = newRoll + conMod;

			// Update the roll option label
			$modalInner.find('#rollDice').next('label').html(`
				<strong>Roll Dice: ${newGain} HP</strong>
				<small class="text-muted d-block">You rolled ${newRoll} on d${hitDie} + ${conMod} CON = ${newGain} HP</small>
				<small class="text-muted d-block">Range: ${minPossibleGain}-${maxPossibleGain} HP</small>
			`);

			// Update the roll option value
			$modalInner.find('#rollDice').val(newGain);

			// Show roll result
			$modalInner.find('#newRollValue').text(`${newRoll} + ${conMod} = ${newGain}`);
			$modalInner.find('#rollResult').show().fadeTo(100, 0.1).fadeTo(200, 1.0);
		});

		// Cancel functionality
		$btnCancel.click(() => {
			$modal.modal('hide');
		});

		// Confirm functionality
		$btnConfirm.click(() => {
			const choice = $modalInner.find('input[name="hpChoice"]:checked').val();
			let hpGain;

			if (choice === 'average') {
				hpGain = averageGain;
			} else {
				// Get the current roll value from the radio button value or calculate from label
				const rollValue = parseInt($modalInner.find('#rollDice').val()) || rolledGain;
				hpGain = rollValue;
			}

			this.updateHitPointsForLevelUp(character, hpGain);
			$modal.modal('hide');
		});

		// Show/hide reroll button based on choice
		$modalInner.find('input[name="hpChoice"]').change(() => {
			const choice = $modalInner.find('input[name="hpChoice"]:checked').val();
			if (choice === 'roll') {
				$btnReroll.show();
			} else {
				$btnReroll.hide();
			}
		});

		$modalFooter.append($btnCancel, $btnReroll, $btnConfirm);

		// Initially hide reroll button since average is selected by default
		$btnReroll.hide();

		$modal.modal('show');
	}

	updateHitPointsForLevelUp(character, providedHpGain = null) {
		// Calculate new hit points based on class hit die
		const classes = character.class;
		if (!classes || !Array.isArray(classes)) {
			return;
		}

		const selectedClassIndex = this.levelUpState.selectedClassIndex;
		console.log('Selected class index:', selectedClassIndex);
		console.log('Available classes:', classes);

		if (selectedClassIndex !== undefined && classes[selectedClassIndex]) {
			const selectedClass = classes[selectedClassIndex];
			const className = selectedClass.name;
			console.log('Leveling up class:', className);

			// Use provided HP gain if available, otherwise calculate default (average)
			let finalHpGain;
			if (providedHpGain !== null) {
				finalHpGain = providedHpGain;
				console.log('Using provided HP gain:', finalHpGain);
			} else {
				// Fallback: calculate average HP gain
				const hitDie = this.getClassHitDie(className, character);
				const conScore = character.abilities ? character.abilities.con : character.con || 10;
				const conMod = Math.floor((conScore - 10) / 2);
				finalHpGain = Math.floor(hitDie / 2) + 1 + conMod;
				console.log('Calculated average HP gain:', finalHpGain);
			}

			// Use hitPoints field (consistent with 5etools format) instead of hp

			if (character.hitPoints && typeof character.hitPoints.max === 'number') {
				const oldMaxHP = character.hitPoints.max;
				character.hitPoints.max += finalHpGain;
				character.hitPoints.current = Math.min(character.hitPoints.current + finalHpGain, character.hitPoints.max);
				console.log(`HP updated: ${oldMaxHP} -> ${character.hitPoints.max} (+${finalHpGain})`);
			} else if (character.hp && typeof character.hp.max === 'number') {
				// Handle alternate HP format
				const oldMaxHP = character.hp.max;
				character.hp.max += finalHpGain;
				character.hp.current = Math.min(character.hp.current + finalHpGain, character.hp.max);
				console.log(`HP updated (alt format): ${oldMaxHP} -> ${character.hp.max} (+${finalHpGain})`);
			} else {
				// Initialize hitPoints if not present - use fallback calculation
				const hitDie = this.getClassHitDie(className, character);
				const conScore = character.abilities ? character.abilities.con : character.con || 10;
				const conMod = Math.floor((conScore - 10) / 2);
				const baseHP = hitDie + conMod;
				const totalLevel = CharacterEditorPage.getCharacterLevel(character);
				const estimatedHP = baseHP + ((totalLevel - 1) * finalHpGain);
				character.hitPoints = {
					max: estimatedHP,
					current: estimatedHP
				};
				console.log(`HP initialized: ${estimatedHP} (base: ${baseHP}, levels: ${totalLevel-1} x ${finalHpGain})`);
			}

			// Also update proficiency bonus
			const totalLevel = CharacterEditorPage.getCharacterLevel(character);
			character.profBonus = this.getProficiencyBonus(totalLevel);
		}
	}

	updateSpellSlotsForLevelUp(character) {
		// Update spell slots based on class progression
		const classes = character.class || [];

		// Check for Eldritch Knight (1/3 caster)
		const eldritchKnight = classes.find(cls =>
			cls.subclass && cls.subclass.name === 'Eldritch Knight'
		);

		if (eldritchKnight && eldritchKnight.level >= 3) {
			if (!character.spellcasting) {
				character.spellcasting = {};
			}

			// Eldritch Knight spell slot progression (1/3 caster)
			const fighterLevel = eldritchKnight.level;
			const spellSlots = this.calculateEldritchKnightSpellSlots(fighterLevel);

			if (spellSlots) {
				character.spellcasting.spells = spellSlots;
			}
		}

		// Add other spellcasting classes as needed
		classes.forEach(cls => {
			const fullCasters = ['Wizard', 'Sorcerer', 'Cleric', 'Druid', 'Bard'];
			const halfCasters = ['Paladin', 'Ranger'];

			if (fullCasters.includes(cls.name)) {
				// Full caster progression - would need more complex implementation
				console.log(`${cls.name} is a full spellcaster - spell slot calculation not fully implemented`);
			} else if (halfCasters.includes(cls.name)) {
				// Half caster progression - would need more complex implementation
				console.log(`${cls.name} is a half spellcaster - spell slot calculation not fully implemented`);
			}
		});
	}

	calculateEldritchKnightSpellSlots(fighterLevel) {
		// Eldritch Knight spell slot progression (1/3 caster)
		const spellSlotsByLevel = {
			3: { 1: 2 },
			4: { 1: 3 },
			7: { 1: 4, 2: 2 },
			8: { 1: 4, 2: 3 },
			10: { 1: 4, 2: 3, 3: 2 },
			11: { 1: 4, 2: 3, 3: 3 },
			13: { 1: 4, 2: 3, 3: 3, 4: 1 },
			14: { 1: 4, 2: 3, 3: 3, 4: 1 },
			16: { 1: 4, 2: 3, 3: 3, 4: 2 },
			19: { 1: 4, 2: 3, 3: 3, 4: 3 },
			20: { 1: 4, 2: 3, 3: 3, 4: 3 }
		};

		return spellSlotsByLevel[fighterLevel] || null;
	}

	getClassHitDie(className, characterData = null) {
		// Try to get hit die from character's class data first
		if (characterData && characterData.class) {
			const classEntry = characterData.class.find(cls => cls.name === className);
			if (classEntry && classEntry.hitDie) {
				// Extract number from hitDie string (e.g., "d10" -> 10)
				const match = classEntry.hitDie.match(/d?(\d+)/);
				if (match) {
					return parseInt(match[1]);
				}
			}
		}

		// Fallback to standard D&D hit dice if no data available
		const standardHitDice = {
			'Barbarian': 12,
			'Fighter': 10,
			'Paladin': 10,
			'Ranger': 10,
			'Bard': 8,
			'Cleric': 8,
			'Druid': 8,
			'Monk': 8,
			'Rogue': 8,
			'Warlock': 8,
			'Sorcerer': 6,
			'Wizard': 6
		};
		return standardHitDice[className] || 8; // Default to d8 if unknown
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
