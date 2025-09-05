// CharacterManager is available globally via character-manager.js script tag

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

		// Check for random character generation from sources.html
		const shouldGenerateRandom = localStorage.getItem('generateRandomCharacter') === 'true';
		if (shouldGenerateRandom && !isEditMode) {
			// Get generation parameters
			const level = parseInt(localStorage.getItem('randomCharacterLevel') || '5');
			const sourceName = localStorage.getItem('randomCharacterSource') || '';
			const characterName = localStorage.getItem('randomCharacterName') || '';
			// Prefer explicit URL param 'baseClass' if present, otherwise fall back to localStorage
			const urlParams = new URLSearchParams(window.location.search);
			const baseClass = urlParams.get('baseClass') || localStorage.getItem('randomCharacterBaseClass') || '';

			// Clear the generation flags
			localStorage.removeItem('generateRandomCharacter');
			localStorage.removeItem('randomCharacterLevel');
			localStorage.removeItem('randomCharacterSource');
			localStorage.removeItem('randomCharacterName');
			// Also clear optional base class so it doesn't persist
			localStorage.removeItem('randomCharacterBaseClass');

			// Generate random character
			console.log(`Generating random level ${level} character for source: ${sourceName}`);
			await this.generateRandomCharacterAtLevel(level, characterName, sourceName, baseClass);
		} else if (isEditMode) {
			// Load character data if in edit mode
			this.loadCharacterForEdit();
		} else {
			// Load default template
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
				throw new Error('Character not found');
			}
		} catch (error) {
			console.error('Error loading character from API:', error);
			document.getElementById('message').textContent = 'Error loading character from API';
		}
	}

	loadTemplate() {
		// Get URL parameters
		const urlParams = new URLSearchParams(window.location.search);
		const requestedSource = urlParams.get('source') || localStorage.getItem('newCharacterSource');
		const requestedLevel = parseInt(urlParams.get('level')) || parseInt(localStorage.getItem('newCharacterLevel')) || Math.floor(Math.random() * 10) + 1;

		// Clear the source from localStorage if it exists
		if (localStorage.getItem('newCharacterSource')) {
			localStorage.removeItem('newCharacterSource');
		}
		if (localStorage.getItem('newCharacterLevel')) {
			localStorage.removeItem('newCharacterLevel');
		}

		// Generate random character data
		const randomName = this.generateRandomName();
		const randomClasses = this.generateRandomClasses(requestedLevel);
		const randomRace = this.generateRandomRace(randomClasses);
		const randomBackground = this.generateRandomBackground();
		const randomAlignment = this.generateRandomAlignment();
		const randomAbilityScores = this.generateRandomAbilityScores(randomClasses, randomRace);
		const randomEquipment = this.generateRandomEquipment(randomClasses, requestedLevel, randomAbilityScores, randomRace);
		const randomActions = this.generateRandomActions(randomClasses, randomAbilityScores);
		const randomSpells = this.generateRandomSpells(randomClasses, requestedLevel, randomAbilityScores);

		// Calculate derived stats
		const totalLevel = randomClasses.reduce((sum, cls) => sum + cls.level, 0);
		const profBonus = Math.floor((totalLevel - 1) / 4) + 2;
		const conMod = Math.floor((randomAbilityScores.con - 10) / 2);
		const randomHp = this.calculateRandomHp(randomClasses, conMod);

	// Generate character depth first so we can use it in fluff (store as fluff, not as a top-level field)
		const characterDepth = this.generateCharacterDepth(randomBackground, randomRace, randomClasses, randomAlignment);
		const depthFluff = this.generateFluffEntries(randomName, totalLevel, randomClasses, randomRace, randomBackground, characterDepth, randomAlignment);
		// Default character template with random content
		const template = {
			name: randomName,
			source: requestedSource || "ADD_YOUR_NAME_HERE",
			race: randomRace,
			class: randomClasses,
			background: randomBackground,
			alignment: randomAlignment,
			ac: this.generateRandomAC(randomClasses, randomAbilityScores),
			hp: randomHp,
			speed: {
				walk: 30 + (randomRace.name === "Wood Elf" ? 5 : 0) // Some races get speed bonuses
			},
			...randomAbilityScores,
			passive: 10 + Math.floor((randomAbilityScores.wis - 10) / 2) + (this.hasSkillProficiency("perception", randomClasses) ? profBonus : 0),
			save: this.generateRandomSaves(randomAbilityScores, randomClasses, profBonus),
			skill: this.generateRandomSkills(randomAbilityScores, randomClasses, profBonus, randomRace, null),
			proficiencyBonus: `+${profBonus}`,
			deathSaves: {
				successes: 0,
				failures: 0
			},
			customTrackers: this.generateRandomTrackers(randomClasses),
			action: randomActions,
			...(randomSpells && { spells: randomSpells }),
			entries: this.generateRandomEntries(randomRace, randomClasses, randomEquipment, randomAbilityScores, randomBackground, randomAlignment),
			fluff: {
				entries: depthFluff
			},
			languages: this.generateLanguageProficiencies(randomClasses, randomRace, null),
			toolProficiencies: this.generateToolProficiencies(randomClasses, randomRace, null),
			currency: this.generateRandomCurrency(totalLevel)
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

	generateRandomRace(classes) {
		// Enhanced race selection with class synergy considerations
		const raceOptions = [
			{ name: "Human", source: "PHB", subraces: ["Standard", "Variant"] },
			{ name: "Elf", source: "PHB", subraces: ["High Elf", "Wood Elf", "Dark Elf (Drow)"] },
			{ name: "Dwarf", source: "PHB", subraces: ["Hill Dwarf", "Mountain Dwarf"] },
			{ name: "Halfling", source: "PHB", subraces: ["Lightfoot", "Stout"] },
			{ name: "Dragonborn", source: "PHB", subraces: ["Standard"] },
			{ name: "Gnome", source: "PHB", subraces: ["Forest Gnome", "Rock Gnome"] },
			{ name: "Half-Elf", source: "PHB", subraces: ["Standard"] },
			{ name: "Half-Orc", source: "PHB", subraces: ["Standard"] },
			{ name: "Tiefling", source: "PHB", subraces: ["Standard"] }
		];

		// If classes are provided, weight races that synergize well
		let weightedRaces = [];
		if (classes && classes.length > 0) {
			raceOptions.forEach(raceOption => {
				const synergy = this.calculateRaceClassSynergy(raceOption, classes);
				const weight = Math.max(1, synergy);
				for (let i = 0; i < weight; i++) {
					weightedRaces.push(raceOption);
				}
			});
		} else {
			weightedRaces = [...raceOptions];
		}

		const selectedRaceOption = weightedRaces[Math.floor(Math.random() * weightedRaces.length)];
		const selectedSubrace = selectedRaceOption.subraces[
			Math.floor(Math.random() * selectedRaceOption.subraces.length)
		];

		const race = {
			name: selectedRaceOption.name,
			source: selectedRaceOption.source
		};

		if (selectedSubrace !== "Standard") {
			race.subrace = selectedSubrace;
		}

		return race;
	}

	calculateRaceClassSynergy(race, classes) {
		let synergy = 3; // Base weight

		classes.forEach(cls => {
			switch (cls.name) {
				case "Fighter":
				case "Paladin":
					if (race.name === "Dragonborn" || race.name === "Half-Orc" ||
						(race.name === "Dwarf" && race.subraces.includes("Mountain Dwarf"))) {
						synergy += 2;
					}
					break;
				case "Wizard":
					if (race.name === "High Elf" || race.name === "Gnome" ||
						(race.name === "Human" && race.subraces.includes("Variant"))) {
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
						race.subraces.includes("Hill Dwarf")) || race.name === "Half-Elf") {
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
			"Barbarian", "Bard", "Druid", "Monk", "Sorcerer", "Warlock"
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
			classes.push({
				name: className,
				source: classTemplate.source,
				level: levelsForThisClass,
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
				{ name: "Champion", shortName: "Champion", source: "PHB" },
				{ name: "Battle Master", shortName: "Battle Master", source: "PHB" },
				{ name: "Eldritch Knight", shortName: "Eldritch Knight", source: "PHB" }
			],
			"Wizard": [
				{ name: "School of Evocation", shortName: "Evocation", source: "PHB" },
				{ name: "School of Abjuration", shortName: "Abjuration", source: "PHB" },
				{ name: "School of Divination", shortName: "Divination", source: "PHB" }
			],
			"Rogue": [
				{ name: "Thief", shortName: "Thief", source: "PHB" },
				{ name: "Assassin", shortName: "Assassin", source: "PHB" },
				{ name: "Arcane Trickster", shortName: "Arcane Trickster", source: "PHB" }
			],
			"Cleric": [
				{ name: "Life Domain", shortName: "Life", source: "PHB" },
				{ name: "Light Domain", shortName: "Light", source: "PHB" },
				{ name: "War Domain", shortName: "War", source: "PHB" }
			],
			"Ranger": [
				{ name: "Hunter", shortName: "Hunter", source: "PHB" },
				{ name: "Beast Master", shortName: "Beast Master", source: "PHB" }
			],
			"Paladin": [
				{ name: "Oath of Devotion", shortName: "Devotion", source: "PHB" },
				{ name: "Oath of the Ancients", shortName: "Ancients", source: "PHB" },
				{ name: "Oath of Vengeance", shortName: "Vengeance", source: "PHB" }
			],
			"Barbarian": [
				{ name: "Path of the Berserker", shortName: "Berserker", source: "PHB" },
				{ name: "Path of the Totem Warrior", shortName: "Totem Warrior", source: "PHB" }
			],
			"Bard": [
				{ name: "College of Lore", shortName: "Lore", source: "PHB" },
				{ name: "College of Valor", shortName: "Valor", source: "PHB" }
			],
			"Druid": [
				{ name: "Circle of the Land", shortName: "Land", source: "PHB" },
				{ name: "Circle of the Moon", shortName: "Moon", source: "PHB" }
			],
			"Monk": [
				{ name: "Way of the Open Hand", shortName: "Open Hand", source: "PHB" },
				{ name: "Way of Shadow", shortName: "Shadow", source: "PHB" },
				{ name: "Way of the Four Elements", shortName: "Four Elements", source: "PHB" }
			],
			"Sorcerer": [
				{ name: "Draconic Bloodline", shortName: "Draconic", source: "PHB" },
				{ name: "Wild Magic", shortName: "Wild Magic", source: "PHB" }
			],
			"Warlock": [
				{ name: "The Fiend", shortName: "Fiend", source: "PHB" },
				{ name: "The Great Old One", shortName: "Great Old One", source: "PHB" },
				{ name: "The Archfey", shortName: "Archfey", source: "PHB" }
			]
		};

		const availableSubclasses = subclasses[className] || [];
		return availableSubclasses[Math.floor(Math.random() * availableSubclasses.length)];
	}

	generateRandomBackground() {
		const backgrounds = [
			{ name: "Acolyte", source: "PHB" },
			{ name: "Criminal", source: "PHB" },
			{ name: "Folk Hero", source: "PHB" },
			{ name: "Noble", source: "PHB" },
			{ name: "Sage", source: "PHB" },
			{ name: "Soldier", source: "PHB" },
			{ name: "Charlatan", source: "PHB" },
			{ name: "Entertainer", source: "PHB" },
			{ name: "Guild Artisan", source: "PHB" },
			{ name: "Hermit", source: "PHB" },
			{ name: "Outlander", source: "PHB" },
			{ name: "Sailor", source: "PHB" }
		];
		return backgrounds[Math.floor(Math.random() * backgrounds.length)];
	}

	generateRandomAbilityScores(classes, race) {
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

		// Apply racial bonuses
		baseStats = this.applyRacialAbilityBonuses(baseStats, race);

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
				const pointsNeeded = Math.min(points, Math.max(0, targetMin - stats[ability]));
				const actualPoints = Math.min(pointsNeeded, this.getPointBuyCost(stats[ability], stats[ability] + pointsNeeded));
				stats[ability] += actualPoints;
				points -= actualPoints;
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
		const priorities = { str: 0, dex: 0, con: 1, int: 0, wis: 0, cha: 0 }; // Base CON priority

		classes.forEach(cls => {
			switch (cls.name) {
				case "Fighter":
					if (cls.subclass?.shortName === "Eldritch Knight") {
						priorities.int += 2;
						priorities.str += 3;
					} else {
						priorities.str += 3;
						priorities.dex += 1;
					}
					break;
				case "Barbarian":
					priorities.str += 3;
					priorities.con += 2;
					break;
				case "Paladin":
					priorities.str += 3;
					priorities.cha += 2;
					break;
				case "Ranger":
					priorities.dex += 3;
					priorities.wis += 2;
					break;
				case "Rogue":
					priorities.dex += 3;
					if (cls.subclass?.shortName === "Arcane Trickster") {
						priorities.int += 1;
					}
					break;
				case "Monk":
					priorities.dex += 3;
					priorities.wis += 2;
					break;
				case "Bard":
					priorities.cha += 3;
					priorities.dex += 1;
					break;
				case "Cleric":
					priorities.wis += 3;
					if (cls.subclass?.shortName === "War") {
						priorities.str += 1;
					}
					break;
				case "Druid":
					priorities.wis += 3;
					break;
				case "Sorcerer":
					priorities.cha += 3;
					priorities.con += 1;
					break;
				case "Warlock":
					priorities.cha += 3;
					break;
				case "Wizard":
					priorities.int += 3;
					priorities.dex += 1;
					break;
			}
		});

		return priorities;
	}

	applyRacialAbilityBonuses(stats, race) {
		const bonuses = this.getRacialAbilityBonuses(race);
		const newStats = { ...stats };

		Object.entries(bonuses).forEach(([ability, bonus]) => {
			newStats[ability] = (newStats[ability] || 8) + bonus;
		});

		return newStats;
	}

	getRacialAbilityBonuses(race) {
		const bonuses = {};

		switch (race.name) {
			case "Human":
				if (race.subrace === "Variant") {
					// Variant human gets +1 to two different abilities
					const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
					const chosen = [];
					while (chosen.length < 2) {
						const ability = abilities[Math.floor(Math.random() * abilities.length)];
						if (!chosen.includes(ability)) {
							chosen.push(ability);
							bonuses[ability] = 1;
						}
					}
				} else {
					// Standard human gets +1 to all abilities
					['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
						bonuses[ability] = 1;
					});
				}
				break;
			case "Dwarf":
				bonuses.con = 2;
				if (race.subrace === "Mountain Dwarf") {
					bonuses.str = 2;
				} else if (race.subrace === "Hill Dwarf") {
					bonuses.wis = 1;
				}
				break;
			case "Elf":
				bonuses.dex = 2;
				if (race.subrace === "High Elf") {
					bonuses.int = 1;
				} else if (race.subrace === "Wood Elf") {
					bonuses.wis = 1;
				} else if (race.subrace === "Dark Elf (Drow)") {
					bonuses.cha = 1;
				}
				break;
			case "Halfling":
				bonuses.dex = 2;
				if (race.subrace === "Lightfoot") {
					bonuses.cha = 1;
				} else if (race.subrace === "Stout") {
					bonuses.con = 1;
				}
				break;
			case "Dragonborn":
				bonuses.str = 2;
				bonuses.cha = 1;
				break;
			case "Gnome":
				bonuses.int = 2;
				if (race.subrace === "Forest Gnome") {
					bonuses.dex = 1;
				} else if (race.subrace === "Rock Gnome") {
					bonuses.con = 1;
				}
				break;
			case "Half-Elf":
				bonuses.cha = 2;
				// Choose two other abilities for +1 each
				const abilities = ['str', 'dex', 'con', 'int', 'wis'];
				const chosen = [];
				while (chosen.length < 2) {
					const ability = abilities[Math.floor(Math.random() * abilities.length)];
					if (!chosen.includes(ability)) {
						chosen.push(ability);
						bonuses[ability] = 1;
					}
				}
				break;
			case "Half-Orc":
				bonuses.str = 2;
				bonuses.con = 1;
				break;
			case "Tiefling":
				bonuses.int = 1;
				bonuses.cha = 2;
				break;
		}

		return bonuses;
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
			"Fighter": { str: 13, dex: 13 }, // Either STR or DEX 13
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
				Object.entries(reqs).forEach(([ability, minScore]) => {
					if (cls.name === "Fighter" && (newStats.str >= 13 || newStats.dex >= 13)) {
						return; // Fighter only needs STR OR DEX
					}
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

	generateRandomAC(classes, abilityScores) {
		const dexMod = Math.floor((abilityScores.dex - 10) / 2);
		let baseAC = 10 + dexMod;
		let armorType = "natural";

		// Determine armor based on class
		const hasHeavyArmor = classes.some(cls => ["Fighter", "Paladin", "Cleric"].includes(cls.name));
		const hasMediumArmor = classes.some(cls => ["Barbarian", "Ranger", "Druid"].includes(cls.name));

		if (hasHeavyArmor && Math.random() < 0.7) {
			baseAC = 16 + Math.floor(Math.random() * 3); // Chain mail to plate
			armorType = "heavy armor";
		} else if (hasMediumArmor && Math.random() < 0.6) {
			baseAC = 12 + Math.min(dexMod, 2) + Math.floor(Math.random() * 3); // Leather to scale mail
			armorType = "medium armor";
		} else if (Math.random() < 0.5) {
			baseAC = 11 + dexMod + Math.floor(Math.random() * 2); // Leather or studded leather
			armorType = "light armor";
		}

		return [{
			ac: baseAC,
			from: [armorType]
		}];
	}

	generateRandomSaves(abilityScores, classes, profBonus) {
		const saves = {};
		const allSaves = ["str", "dex", "con", "int", "wis", "cha"];

		// In D&D 5e, you only get saving throw proficiencies from your FIRST class when multiclassing
		const proficientSaves = new Set();
		if (classes.length > 0) {
			const primaryClass = classes[0];
			switch (primaryClass.name) {
				case "Fighter":
				case "Barbarian":
					proficientSaves.add("str").add("con");
					break;
				case "Bard":
				case "Paladin":
					proficientSaves.add("wis").add("cha");
					break;
				case "Cleric":
				case "Druid":
					proficientSaves.add("wis").add("con");
					break;
				case "Monk":
					proficientSaves.add("str").add("dex");
					break;
				case "Ranger":
					proficientSaves.add("str").add("dex");
					break;
				case "Rogue":
					proficientSaves.add("dex").add("int");
					break;
				case "Sorcerer":
				case "Warlock":
					proficientSaves.add("con").add("cha");
					break;
				case "Wizard":
					proficientSaves.add("int").add("wis");
					break;
			}
		}

		// Only include saves where the character has proficiency
		proficientSaves.forEach(save => {
			const modifier = Math.floor((abilityScores[save] - 10) / 2);
			const total = modifier + profBonus;
			saves[save] = total >= 0 ? `+${total}` : `${total}`;
		});

		return saves;
	}

	generateRandomSkills(abilityScores, classes, profBonus, race, background) {
		const skills = {};
		const skillAbilityMap = {
			"acrobatics": "dex", "animal_handling": "wis", "arcana": "int",
			"athletics": "str", "deception": "cha", "history": "int",
			"insight": "wis", "intimidation": "cha", "investigation": "int",
			"medicine": "wis", "nature": "int", "perception": "wis",
			"performance": "cha", "persuasion": "cha", "religion": "int",
			"sleight_of_hand": "dex", "stealth": "dex", "survival": "wis"
		};

		const proficientSkills = new Set();

		// In D&D 5e, you only get skill proficiencies from your FIRST class when multiclassing
		if (classes.length > 0) {
			const primaryClass = classes[0];
			const classSkills = this.getClassSkillProficiencies(primaryClass.name);
			const availableSkills = classSkills.choices || [];
			const automaticSkills = classSkills.automatic || [];
			const numChoices = classSkills.numChoices || 2;

			// Add automatic proficiencies from first class only
			automaticSkills.forEach(skill => proficientSkills.add(skill));

			// Add random choices from first class only
			if (availableSkills.length > 0) {
				const selectedFromClass = this.selectWeightedSkills(availableSkills, numChoices, [primaryClass], race);
				selectedFromClass.forEach(skill => proficientSkills.add(skill));
			}
		}

		// Add racial skill proficiencies (limited)
		const racialSkills = this.getRacialSkillProficiencies(race);
		racialSkills.forEach(skill => proficientSkills.add(skill));

		// Add background skill proficiencies (should be exactly 2 for most backgrounds)
		if (background) {
			const backgroundSkills = this.generateBackgroundSkills(background);
			backgroundSkills.forEach(skill => proficientSkills.add(skill));
		}

		// Only include skills where the character has proficiency
		proficientSkills.forEach(skill => {
			if (skillAbilityMap[skill]) {
				const ability = skillAbilityMap[skill];
				const abilityMod = Math.floor((abilityScores[ability] - 10) / 2);
				const total = abilityMod + profBonus;
				skills[skill] = total >= 0 ? `+${total}` : `${total}`;
			}
		});

		return skills;
	}

	getClassSkillProficiencies(className) {
		const classSkills = {
			"Barbarian": {
				choices: ["animal_handling", "athletics", "intimidation", "nature", "perception", "survival"],
				numChoices: 2
			},
			"Bard": {
				automatic: ["performance"],
				choices: Object.keys({
					"acrobatics": true, "animal_handling": true, "arcana": true, "athletics": true,
					"deception": true, "history": true, "insight": true, "intimidation": true,
					"investigation": true, "medicine": true, "nature": true, "perception": true,
					"persuasion": true, "religion": true, "sleight_of_hand": true, "stealth": true, "survival": true
				}),
				numChoices: 3
			},
			"Cleric": {
				choices: ["history", "insight", "medicine", "persuasion", "religion"],
				numChoices: 2
			},
			"Druid": {
				choices: ["arcana", "animal_handling", "insight", "medicine", "nature", "perception", "religion", "survival"],
				numChoices: 2
			},
			"Fighter": {
				choices: ["acrobatics", "animal_handling", "athletics", "history", "insight", "intimidation", "perception", "survival"],
				numChoices: 2
			},
			"Monk": {
				choices: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"],
				numChoices: 2
			},
			"Paladin": {
				choices: ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"],
				numChoices: 2
			},
			"Ranger": {
				choices: ["animal_handling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"],
				numChoices: 3
			},
			"Rogue": {
				automatic: ["sleight_of_hand", "stealth"],
				choices: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "performance", "persuasion"],
				numChoices: 2
			},
			"Sorcerer": {
				choices: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"],
				numChoices: 2
			},
			"Warlock": {
				choices: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"],
				numChoices: 2
			},
			"Wizard": {
				choices: ["arcana", "history", "insight", "investigation", "medicine", "religion"],
				numChoices: 2
			}
		};

		return classSkills[className] || { choices: [], numChoices: 0 };
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
		// Generate 2 background skills that make thematic sense
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

		classes.forEach(cls => {
			const hitDieMap = {
				"Barbarian": 12, "Fighter": 10, "Paladin": 10, "Ranger": 10,
				"Bard": 8, "Cleric": 8, "Druid": 8, "Monk": 8, "Rogue": 8, "Warlock": 8,
				"Sorcerer": 6, "Wizard": 6
			};

			const hitDie = hitDieMap[cls.name] || 8;
			const classHp = hitDie + (cls.level - 1) * (Math.floor(hitDie / 2) + 1 + conMod);
			totalHp += classHp;
			hitDice.push(`${cls.level}d${hitDie}`);
		});

		totalHp += conMod * classes.reduce((sum, cls) => sum + cls.level, 0);

		return {
			average: totalHp,
			formula: hitDice.join(" + "),
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
		const profBonus = Math.floor((totalLevel - 1) / 4) + 2;
		const strMod = Math.floor((abilityScores.str - 10) / 2);
		const dexMod = Math.floor((abilityScores.dex - 10) / 2);
		const chaMod = Math.floor((abilityScores.cha - 10) / 2);
		const wisMod = Math.floor((abilityScores.wis - 10) / 2);
		const intMod = Math.floor((abilityScores.int - 10) / 2);

		// Weapon attacks based on class with more variety
		classes.forEach(cls => {
			switch (cls.name) {
				case "Fighter":
					actions.push({
						name: "{@item Longsword|phb}",
						entries: [`{@atk rm} {@hit ${strMod + profBonus}} to hit, reach 5 ft., one target. {@h}${1 + strMod + (cls.level >= 11 ? 2 : cls.level >= 5 ? 1 : 0)} ({@damage 1d8 + ${strMod}}) slashing damage.`]
					});
					actions.push({
						name: "{@item Javelin|phb}",
						entries: [`{@atk rm,rw} {@hit ${strMod + profBonus}} to hit, reach 5 ft. or range 30/120 ft., one target. {@h}${1 + strMod} ({@damage 1d6 + ${strMod}}) piercing damage.`]
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
					actions.push({
						name: "{@item Longsword|phb}",
						entries: [`{@atk rm} {@hit ${strMod + profBonus}} to hit, reach 5 ft., one target. {@h}${1 + strMod} ({@damage 1d8 + ${strMod}}) slashing damage.`]
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
					actions.push({
						name: "{@item Shortbow|phb}",
						entries: [`{@atk rw} {@hit ${dexMod + profBonus}} to hit, range 80/320 ft., one target. {@h}${1 + dexMod} ({@damage 1d6 + ${dexMod}}) piercing damage.`]
					});
					actions.push({
						name: "{@item Dagger|phb}",
						entries: [`{@atk rm,rw} {@hit ${dexMod + profBonus}} to hit, reach 5 ft. or range 20/60 ft., one target. {@h}${1 + dexMod} ({@damage 1d4 + ${dexMod}}) piercing damage.`]
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
					actions.push({
						name: "{@item Longbow|phb}",
						entries: [`{@atk rw} {@hit ${dexMod + profBonus}} to hit, range 150/600 ft., one target. {@h}${1 + dexMod} ({@damage 1d8 + ${dexMod}}) piercing damage.`]
					});
					actions.push({
						name: "{@item Scimitar|phb}",
						entries: [`{@atk rm} {@hit ${dexMod + profBonus}} to hit, reach 5 ft., one target. {@h}${1 + dexMod} ({@damage 1d6 + ${dexMod}}) slashing damage.`]
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
					actions.push({
						name: "{@item Dagger|phb}",
						entries: [`{@atk rm,rw} {@hit ${dexMod + profBonus}} to hit, reach 5 ft. or range 20/60 ft., one target. {@h}${1 + dexMod} ({@damage 1d4 + ${dexMod}}) piercing damage.`]
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
					actions.push({
						name: "{@item Mace|phb}",
						entries: [`{@atk rm} {@hit ${strMod + profBonus}} to hit, reach 5 ft., one target. {@h}${1 + strMod} ({@damage 1d6 + ${strMod}}) bludgeoning damage.`]
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
					actions.push({
						name: "{@item Scimitar|phb}",
						entries: [`{@atk rm} {@hit ${dexMod + profBonus}} to hit, reach 5 ft., one target. {@h}${1 + dexMod} ({@damage 1d6 + ${dexMod}}) slashing damage.`]
					});
					if (cls.level >= 2) {
						actions.push({
							name: "Wild Shape (2/Rest)",
							entries: [`Transform into a beast for ${cls.level} hours. Beast CR limited by level.`]
						});
					}
					break;

				case "Barbarian":
					actions.push({
						name: "{@item Greataxe|phb}",
						entries: [`{@atk rm} {@hit ${strMod + profBonus}} to hit, reach 5 ft., one target. {@h}${1 + strMod} ({@damage 1d12 + ${strMod}}) slashing damage.`]
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
					actions.push({
						name: "{@item Rapier|phb}",
						entries: [`{@atk rm} {@hit ${dexMod + profBonus}} to hit, reach 5 ft., one target. {@h}${1 + dexMod} ({@damage 1d8 + ${dexMod}}) piercing damage.`]
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
					actions.push({
						name: "Unarmed Strike",
						entries: [`{@atk rm} {@hit ${dexMod + profBonus}} to hit, reach 5 ft., one target. {@h}${1 + dexMod} ({@damage 1d${cls.level < 5 ? 4 : cls.level < 11 ? 6 : cls.level < 17 ? 8 : 10} + ${dexMod}}) bludgeoning damage.`]
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
		const profBonus = Math.floor((totalLevel - 1) / 4) + 2;
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
		const profBonus = Math.floor((totalLevel - 1) / 4) + 2;

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
		const fullCasters = ["Wizard", "Sorcerer", "Warlock", "Bard", "Cleric", "Druid"];
		const halfCasters = ["Paladin", "Ranger"];
		const thirdCasters = ["Eldritch Knight", "Arcane Trickster"];

		if (fullCasters.includes(className)) return "full";
		if (halfCasters.includes(className)) return "half";
		if (thirdCasters.includes(className)) return "third";
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
		const cantripCount = this.getCantripCount(casterClass.name, casterClass.level);
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
			[4, 3, 3, 3, 2, 0, 0, 0, 0]  // Level 10
		];

		const classLevel = Math.min(casterClass.level, 10);
		if (classLevel === 0 || spellLevel > 9) return 0;

		return fullCasterSlots[classLevel - 1][spellLevel - 1] || 0;
	}

	getCantripCount(className, classLevel) {
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

		const progression = cantripProgression[className];
		return progression ? progression[Math.min(classLevel - 1, 19)] : 0;
	}

	getRandomCantrips(casterClass, cantripCount) {
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

		const availableCantrips = classCantrips[casterClass.name] || [];
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
		const spellLists = {
			1: ["magic missile", "shield", "cure wounds", "healing word", "burning hands"],
			2: ["misty step", "scorching ray", "spiritual weapon", "hold person"],
			3: ["fireball", "counterspell", "spirit guardians", "fly"]
		};

		const spells = spellLists[level] || [];
		return spells.slice(0, 2 + Math.floor(Math.random() * 3));
	}

	generateRandomEntries(race, classes, equipment, abilityScores, background = null, alignment = null) {
		const entries = [
			{
				type: "section",
				name: "Background & Personality",
				entries: (function(self, race, classes, abilityScores, providedBackground, providedAlignment){
					// Use provided background/alignment when available, otherwise pick randomly
					const tempBackground = providedBackground || self.generateRandomBackground();
					const tempAlignment = providedAlignment || self.generateRandomAlignment();
					const totalLevel = classes.reduce((s, c) => s + (c.level || 1), 0) || 1;
					const previewName = `${race.name} adventurer`;
					const depth = self.generateCharacterDepth(tempBackground, race, classes, tempAlignment);

					// small helper to pick labeled depth entries
					const pick = (label, n = 1) => {
						if (!Array.isArray(depth)) return [];
						return depth.filter(d => d.startsWith(label + ':')).slice(0, n).map(d => d.replace(label + ':', '').trim());
					};

					// Build a concise, consistent backstory paragraph
					const origin = pick('Origin', 1)[0] || '';
					const turning = pick('TurningPoint', 1)[0] || '';
					const hook = pick('Hook', 1)[0] || '';
					const relation = pick('Relationship', 1)[0] || '';
					const place = pick('Place', 1)[0] || '';
					const contact = pick('Contact', 1)[0] || '';
					const bgVignette = self.getBackgroundStory(tempBackground.name);
					const backstoryParts = [];
					backstoryParts.push(`${previewName} was shaped by ${tempBackground.name.toLowerCase()} life${place ? ' in ' + place : ''}.`);
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
				entries: this.generateClassFeatures(classes, abilityScores)
			},
			{
				type: "section",
				name: "Items",
				entries: equipment || []
			}
		];

		return entries;
	}

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
						features.push({
							type: "entries",
							name: "Ability Score Improvement",
							entries: [`You have improved your abilities or gained a feat. This feature is gained at levels 4, 6, 8, 12, 14, 16, and 19.`]
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

	generateFluffEntries(name, totalLevel, classes, race, background, characterDepth, alignment = null) {
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

		// 4) Relationships, bonds and obsessions — theatrical and specific
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

	generateCharacterDepth(background, race, classes, alignment = null) {
		// Return a flat array of labeled depth strings (e.g., 'Personality: ...') for rendering
		const entries = [];

		// Expanded background-based personality traits
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

		// Get background traits
		const bgTraits = backgroundTraits[background.name] || [
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
			"Hollow", "Vale", "Ford", "Haven", "Cross", "March", "Hold", "Barrow", "Mire", "Glen"
		];
		const placePrefixes = {
			'L': ["High", "Iron", "Grey", "Stone", "Crown"],
			'N': ["Wind", "Ash", "Everg", "Dun", "Raven"],
			'C': ["Wild", "Crimson", "Feral", "Storm", "Briar"]
		};
		const placeSuffixes = {
			'G': ["ford", "stead", "port", "bridge"],
			'N': ["marsh", "well", "field", "grove"],
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

		// Origin uses chosenPlace
		const origin = Math.random() < 0.5
			? `They were raised in ${chosenPlace}, where horizon and hardship braided together and small mercies mattered.`
			: `They grew up near ${chosenPlace}, amid candlelit halls and carved stone, where duty was spoken like prayer.`;
		entries.push(`Origin: ${origin}`);

		// Turning point references chosenPerson or chosenPlace for consistency
		let turningPoint = '';
		if (Math.random() < 0.9) {
			turningPoint = Math.random() < 0.5
				? `${chosenPerson} once saved them from a disaster that left scars and a promise to repay.`
				: `A single night at ${chosenPlace} — a riot, a betrayal, a fire — broke the life they'd known and set them on a different road.`;
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
					equipment.push("{@item Arrows|phb} (20)");
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
				if (classLevel >= 3) equipment.push("{@item Ki Focus|dmg}");
				if (classLevel >= 5) equipment.push("{@item Bracers of Defense|dmg}");
				break;

			case "Paladin":
				equipment.push(classLevel >= 5 ? "{@item Plate Armor|phb}" : "{@item Chain Mail|phb}");
				equipment.push("{@item Shield|phb}");
				equipment.push("{@item Longsword|phb}");
				equipment.push("{@item Javelin|phb} (5)");
				equipment.push("{@item Explorer's Pack|phb}");
				equipment.push("{@item Holy Symbol|phb}");
				equipment.push("{@item Prayer Book|phb}");
				equipment.push("{@item Holy Water|phb} (4)");
				equipment.push("{@item Blessed Oil|phb} (2)");
				if (classLevel >= 3) equipment.push("{@item Divine Weapon|dmg}");
				if (classLevel >= 5) equipment.push("{@item +1 Shield|dmg}");
				break;

			case "Ranger":
				equipment.push("{@item Studded Leather Armor|phb}");
				equipment.push("{@item Shortsword|phb} (2)");
				equipment.push("{@item Longbow|phb}");
				equipment.push("{@item Arrow|phb} (20)");
				equipment.push("{@item Dungeoneer's Pack|phb}");
				equipment.push("{@item Survival Kit|phb}");
				equipment.push("{@item Hunting Trap|phb} (3)");
				if (classLevel >= 2) equipment.push("{@item Component Pouch|phb}");
				if (classLevel >= 3) equipment.push("{@item Ranger's Cloak|dmg}");
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
				equipment.push("{@item Simple Weapon|phb}");
				if (classLevel >= 3) equipment.push("{@item Pact Weapon|dmg}");
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
			"Halfling": ["{@item Sling|phb}", "{@item Sling Bullets|phb} (20)"],
			"Human": [],
			"Dragonborn": [],
			"Gnome": ["{@item Tinker's Tools|phb}"],
			"Half-Elf": ["{@item Musical Instrument|phb}"],
			"Half-Orc": ["{@item Greataxe|phb}"],
			"Tiefling": ["{@item Infernal Contract|phb}"]
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
				"{@item Amulet of Health|dmg}"
			];
			items.push(rareItems[Math.floor(Math.random() * rareItems.length)]);
		}

		if (level >= 8) {
			const veryRareItems = [
				"{@item +2 Weapon|dmg}",
				"{@item +2 Armor|dmg}",
				"{@item Belt of Giant Strength|dmg}",
				"{@item Rod of Lordly Might|dmg}",
				"{@item Ring of Spell Storing|dmg}"
			];
			items.push(veryRareItems[Math.floor(Math.random() * veryRareItems.length)]);
		}

		if (level >= 11) {
			const legendaryItems = [
				"{@item +3 Weapon|dmg}",
				"{@item +3 Armor|dmg}",
				"{@item Cloak of Invisibility|dmg}",
				"{@item Staff of Power|dmg}",
				"{@item Ring of Three Wishes|dmg}"
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
			"{@item Chain|phb} (10 feet)",
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
	async generateRandomCharacterAtLevel(requestedLevel = 5, characterName = '', sourceName = 'RANDOM_GENERATED', baseClass = '') {
		try {
			// Validate and sanitize parameters
			const finalLevel = Math.max(1, Math.min(20, parseInt(String(requestedLevel)) || 5));
			const finalName = (characterName && characterName.trim()) || this.generateRandomName();
			const finalSource = sourceName || 'RANDOM_GENERATED';

			console.log(`Generating random character: Level ${finalLevel}, Name: ${finalName || 'random'}, Source: ${finalSource}`);

			// Use existing generation logic but with provided parameters
			const randomClasses = this.generateRandomClasses(finalLevel, baseClass);
			const randomRace = this.generateRandomRace(randomClasses);
			const randomBackground = this.generateRandomBackground();
			const randomAlignment = this.generateRandomAlignment();
			const randomAbilityScores = this.generateRandomAbilityScores(randomClasses, randomRace);
			const randomEquipment = this.generateRandomEquipment(randomClasses, finalLevel, randomAbilityScores, randomRace);
			const randomActions = this.generateRandomActions(randomClasses, randomAbilityScores);
			const randomSpells = this.generateRandomSpells(randomClasses, finalLevel, randomAbilityScores);

			// Calculate derived stats
			const totalLevel = randomClasses.reduce((sum, cls) => sum + cls.level, 0);
			const profBonus = Math.floor((totalLevel - 1) / 4) + 2;
			const conMod = Math.floor((randomAbilityScores.con - 10) / 2);
			const randomHp = this.calculateRandomHp(randomClasses, conMod);

			// Create character template
			const characterDepth = this.generateCharacterDepth(randomBackground, randomRace, randomClasses, randomAlignment);
			const depthFluff = this.generateFluffEntries(finalName, totalLevel, randomClasses, randomRace, randomBackground, characterDepth, randomAlignment);

			const template = {
				name: finalName,
				source: finalSource,
			race: randomRace,
			class: randomClasses,
			background: randomBackground,
			alignment: randomAlignment,
			ac: this.generateRandomAC(randomClasses, randomAbilityScores),
			hp: randomHp,
			speed: {
				walk: 30 + (randomRace.name === "Wood Elf" ? 5 : 0) // Some races get speed bonuses
			},
			...randomAbilityScores,
			passive: 10 + Math.floor((randomAbilityScores.wis - 10) / 2) + (this.hasSkillProficiency("perception", randomClasses) ? profBonus : 0),
			save: this.generateRandomSaves(randomAbilityScores, randomClasses, profBonus),
			skill: this.generateRandomSkills(randomAbilityScores, randomClasses, profBonus, randomRace, null),
			proficiencyBonus: `+${profBonus}`,
			deathSaves: {
				successes: 0,
				failures: 0
			},
			customTrackers: this.generateRandomTrackers(randomClasses),
			action: randomActions,
			...(randomSpells && { spells: randomSpells }),
			entries: this.generateRandomEntries(randomRace, randomClasses, randomEquipment, randomAbilityScores, randomBackground, randomAlignment),
			// characterDepth intentionally not stored as a top-level field; include depth info in fluff
			fluff: {
				entries: [
					`${finalName} is a ${totalLevel === 1 ? 'beginning' : totalLevel < 5 ? 'novice' : totalLevel < 10 ? 'experienced' : 'veteran'} adventurer.`,
					`Their journey has led them to master ${randomClasses.length === 1 ? 'the ways of the ' + randomClasses[0].name.toLowerCase() : 'multiple disciplines'}.`,
					this.getBackgroundStory(randomBackground.name),
					...this.generateFluffEntries(finalName, totalLevel, randomClasses, randomRace, randomBackground, this.generateCharacterDepth(randomBackground, randomRace, randomClasses), null)
				]
			},
			languages: this.generateLanguageProficiencies(randomClasses, randomRace, null),
			toolProficiencies: this.generateToolProficiencies(randomClasses, randomRace, null),
			currency: this.generateRandomCurrency(totalLevel)
		};

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
		const cachedPasswords = SourcePasswordManager.getCachedPasswords();
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
		if (window['characterCache']) {
			window['characterCache'] = null;
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
