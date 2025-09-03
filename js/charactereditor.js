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
			
			// Clear the generation flags
			localStorage.removeItem('generateRandomCharacter');
			localStorage.removeItem('randomCharacterLevel');
			localStorage.removeItem('randomCharacterSource');
			localStorage.removeItem('randomCharacterName');
			
			// Generate random character
			console.log(`Generating random level ${level} character for source: ${sourceName}`);
			await this.generateRandomCharacterAtLevel(level, characterName, sourceName);
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
		const randomRace = this.generateRandomRace();
		const randomClasses = this.generateRandomClasses(requestedLevel);
		const randomBackground = this.generateRandomBackground();
		const randomAbilityScores = this.generateRandomAbilityScores(randomClasses);
		const randomEquipment = this.generateRandomEquipment(randomClasses, requestedLevel);
		const randomActions = this.generateRandomActions(randomClasses, randomAbilityScores);
		const randomSpells = this.generateRandomSpells(randomClasses, requestedLevel);

		// Calculate derived stats
		const totalLevel = randomClasses.reduce((sum, cls) => sum + cls.level, 0);
		const profBonus = Math.ceil(totalLevel / 4) + 1;
		const conMod = Math.floor((randomAbilityScores.con - 10) / 2);
		const randomHp = this.calculateRandomHp(randomClasses, conMod);

		// Default character template with random content
		const template = {
			name: randomName,
			source: requestedSource || "ADD_YOUR_NAME_HERE",
			race: randomRace,
			class: randomClasses,
			background: randomBackground,
			alignment: this.generateRandomAlignment(),
			ac: this.generateRandomAC(randomClasses, randomAbilityScores),
			hp: randomHp,
			speed: {
				walk: 30 + (randomRace.name === "Wood Elf" ? 5 : 0) // Some races get speed bonuses
			},
			...randomAbilityScores,
			passive: 10 + Math.floor((randomAbilityScores.wis - 10) / 2) + (this.hasSkillProficiency("perception", randomClasses) ? profBonus : 0),
			save: this.generateRandomSaves(randomAbilityScores, randomClasses, profBonus),
			skill: this.generateRandomSkills(randomAbilityScores, randomClasses, profBonus),
			proficiencyBonus: `+${profBonus}`,
			deathSaves: {
				successes: 0,
				failures: 0
			},
			customTrackers: this.generateRandomTrackers(randomClasses),
			action: randomActions,
			...(randomSpells && { spells: randomSpells }),
			entries: this.generateRandomEntries(randomRace, randomClasses),
			fluff: {
				entries: [
					`${randomName} is a ${totalLevel === 1 ? 'beginning' : totalLevel < 5 ? 'novice' : totalLevel < 10 ? 'experienced' : 'veteran'} adventurer with a ${this.getPersonalityTrait()}.`,
					`Their journey has led them to master ${randomClasses.length === 1 ? 'the ways of the ' + randomClasses[0].name.toLowerCase() : 'multiple disciplines'}.`,
					this.getBackgroundStory(randomBackground.name)
				]
			},
			equipment: randomEquipment,
			languages: this.generateRandomLanguages(randomRace, randomClasses),
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
			subclass: randomSubclass,
			currentHitDice: 1
		};
	}

	// Generate multiple classes with levels distributed across them
	generateRandomClasses(totalLevel) {
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

		for (let i = 0; i < classCount; i++) {
			const className = availableClasses.splice(Math.floor(Math.random() * availableClasses.length), 1)[0];
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

			classes.push({
				name: className,
				source: classTemplate.source,
				level: levelsForThisClass,
				subclass: this.getSubclassForClass(className),
				currentHitDice: Math.max(1, Math.floor(levelsForThisClass * (0.5 + Math.random() * 0.5))) // Random hit dice between 50-100% of level
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

	generateRandomAbilityScores(classes) {
		// Point buy system with some randomization
		const baseStats = {
			str: 8 + Math.floor(Math.random() * 8),
			dex: 8 + Math.floor(Math.random() * 8),
			con: 10 + Math.floor(Math.random() * 6), // Slightly higher CON
			int: 8 + Math.floor(Math.random() * 8),
			wis: 8 + Math.floor(Math.random() * 8),
			cha: 8 + Math.floor(Math.random() * 8)
		};

		// Boost primary stats based on classes
		classes.forEach(cls => {
			switch (cls.name) {
				case "Fighter":
				case "Paladin":
				case "Barbarian":
					baseStats.str = Math.max(baseStats.str, 13 + Math.floor(Math.random() * 5));
					break;
				case "Rogue":
				case "Ranger":
				case "Monk":
					baseStats.dex = Math.max(baseStats.dex, 13 + Math.floor(Math.random() * 5));
					break;
				case "Wizard":
					baseStats.int = Math.max(baseStats.int, 13 + Math.floor(Math.random() * 5));
					break;
				case "Cleric":
				case "Druid":
					baseStats.wis = Math.max(baseStats.wis, 13 + Math.floor(Math.random() * 5));
					break;
				case "Bard":
				case "Sorcerer":
				case "Warlock":
					baseStats.cha = Math.max(baseStats.cha, 13 + Math.floor(Math.random() * 5));
					break;
			}
		});

		return baseStats;
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
		
		// Determine proficient saves based on class
		const proficientSaves = new Set();
		classes.forEach(cls => {
			switch (cls.name) {
				case "Fighter":
					proficientSaves.add("str").add("con");
					break;
				case "Barbarian":
					proficientSaves.add("str").add("con");
					break;
				case "Bard":
				case "Paladin":
					proficientSaves.add("wis").add("cha");
					break;
				case "Cleric":
				case "Druid":
				case "Monk":
					proficientSaves.add("wis").add("con");
					break;
				case "Ranger":
					proficientSaves.add("str").add("dex");
					break;
				case "Rogue":
					proficientSaves.add("dex").add("int");
					break;
				case "Sorcerer":
				case "Warlock":
					proficientSaves.add("wis").add("cha");
					break;
				case "Wizard":
					proficientSaves.add("int").add("wis");
					break;
			}
		});

		allSaves.forEach(save => {
			const modifier = Math.floor((abilityScores[save] - 10) / 2);
			const total = modifier + (proficientSaves.has(save) ? profBonus : 0);
			if (total !== 0 || proficientSaves.has(save)) {
				saves[save] = total >= 0 ? `+${total}` : `${total}`;
			}
		});

		return saves;
	}

	generateRandomSkills(abilityScores, classes, profBonus) {
		const skills = {};
		const skillList = [
			"acrobatics", "animal_handling", "arcana", "athletics", "deception",
			"history", "insight", "intimidation", "investigation", "medicine",
			"nature", "perception", "performance", "persuasion", "religion",
			"sleight_of_hand", "stealth", "survival"
		];

		// Randomly select 3-6 skills to be proficient in
		const numSkills = 3 + Math.floor(Math.random() * 4);
		const selectedSkills = [];
		
		for (let i = 0; i < numSkills; i++) {
			const skill = skillList[Math.floor(Math.random() * skillList.length)];
			if (!selectedSkills.includes(skill)) {
				selectedSkills.push(skill);
			}
		}

		selectedSkills.forEach(skill => {
			const abilityMap = {
				"acrobatics": "dex", "animal_handling": "wis", "arcana": "int",
				"athletics": "str", "deception": "cha", "history": "int",
				"insight": "wis", "intimidation": "cha", "investigation": "int",
				"medicine": "wis", "nature": "int", "perception": "wis",
				"performance": "cha", "persuasion": "cha", "religion": "int",
				"sleight_of_hand": "dex", "stealth": "dex", "survival": "wis"
			};

			const ability = abilityMap[skill];
			const modifier = Math.floor((abilityScores[ability] - 10) / 2);
			const total = modifier + profBonus;
			skills[skill] = total >= 0 ? `+${total}` : `${total}`;
		});

		return skills;
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
		const profBonus = Math.ceil(totalLevel / 4) + 1;

		// Weapon attacks based on class
		classes.forEach(cls => {
			switch (cls.name) {
				case "Fighter":
				case "Paladin":
					const strMod = Math.floor((abilityScores.str - 10) / 2);
					actions.push({
						name: "{@item Longsword|phb}",
						entries: [`{@atk rm} {@hit ${strMod + profBonus}} ({@damage 1d8 + ${strMod}})`]
					});
					break;
				case "Rogue":
				case "Ranger":
					const dexMod = Math.floor((abilityScores.dex - 10) / 2);
					actions.push({
						name: "{@item Shortbow|phb}",
						entries: [`{@atk rw} {@hit ${dexMod + profBonus}} ({@damage 1d6 + ${dexMod}})`]
					});
					break;
				case "Wizard":
				case "Sorcerer":
				case "Warlock":
					actions.push({
						name: "{@spell Fire Bolt}",
						entries: [`{@atk rs} {@hit ${profBonus + Math.floor((abilityScores.cha - 10) / 2)}} ({@damage 1d10})`]
					});
					break;
			}
		});

		// Special abilities
		if (classes.some(cls => cls.name === "Rogue" && cls.level >= 1)) {
			actions.push({
				name: "Sneak Attack",
				entries: [`Once per turn, add ${Math.ceil(classes.find(cls => cls.name === "Rogue").level / 2)}d6 damage when you have advantage`]
			});
		}

		return actions;
	}

	generateRandomSpells(classes, totalLevel) {
		// Check if any class can cast spells
		const casterClasses = classes.filter(cls => 
			["Wizard", "Sorcerer", "Warlock", "Bard", "Cleric", "Druid", "Paladin", "Ranger"].includes(cls.name)
		);

		if (casterClasses.length === 0) return null;

		const primaryCaster = casterClasses.reduce((highest, current) => 
			current.level > highest.level ? current : highest
		);

		const spellcastingAbility = {
			"Wizard": "Intelligence", "Sorcerer": "Charisma", "Warlock": "Charisma",
			"Bard": "Charisma", "Cleric": "Wisdom", "Druid": "Wisdom",
			"Paladin": "Charisma", "Ranger": "Wisdom"
		}[primaryCaster.name];

		const abilityScore = {
			"Intelligence": "int", "Charisma": "cha", "Wisdom": "wis"
		}[spellcastingAbility];

		// Use moderate spell ability score
		const spellMod = Math.floor((15 - 10) / 2); // Assume 15 in casting stat
		const profBonus = Math.ceil(totalLevel / 4) + 1;
		const spellDC = 8 + profBonus + spellMod;
		const spellAttack = profBonus + spellMod;

		return {
			dc: spellDC,
			attackBonus: spellAttack >= 0 ? `+${spellAttack}` : `${spellAttack}`,
			ability: spellcastingAbility,
			levels: this.generateSpellSlots(primaryCaster)
		};
	}

	generateSpellSlots(casterClass) {
		const levels = {};
		
		// Cantrips
		levels["0"] = {
			spells: this.getRandomCantrips(casterClass)
		};

		// Spell slots based on class and level
		for (let level = 1; level <= 9; level++) {
			const maxSlots = this.getSpellSlotsForLevel(casterClass, level);
			if (maxSlots > 0) {
				levels[level] = {
					maxSlots: maxSlots,
					slotsUsed: Math.floor(Math.random() * (maxSlots + 1)),
					spells: this.getRandomSpells(casterClass, level)
				};
			}
		}

		return levels;
	}

	getSpellSlotsForLevel(casterClass, spellLevel) {
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

	getRandomCantrips(casterClass) {
		const cantrips = {
			"Wizard": ["fire bolt", "mage hand", "prestidigitation"],
			"Sorcerer": ["fire bolt", "light", "minor illusion"],
			"Warlock": ["eldritch blast", "minor illusion", "prestidigitation"],
			"Bard": ["vicious mockery", "minor illusion", "mage hand"],
			"Cleric": ["sacred flame", "guidance", "thaumaturgy"],
			"Druid": ["druidcraft", "guidance", "produce flame"]
		};

		return cantrips[casterClass.name] || ["fire bolt", "mage hand", "prestidigitation"];
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

	generateRandomEntries(race, classes) {
		const entries = [
			{
				type: "entries",
				name: "Background & Personality",
				entries: [
					`This ${race.name} has dedicated their life to mastering ${classes.length === 1 ? 'the ' + classes[0].name.toLowerCase() + ' arts' : 'multiple combat disciplines'}.`,
					`${this.getPersonalityTrait()} drives them to seek adventure and challenge.`
				]
			},
			{
				type: "section",
				name: "Features & Traits",
				entries: this.generateClassFeatures(classes)
			}
		];

		return entries;
	}

	generateClassFeatures(classes) {
		const features = [];

		classes.forEach(cls => {
			switch (cls.name) {
				case "Fighter":
					features.push({
						type: "entries",
						name: "Fighting Style",
						entries: ["Choose a fighting style that defines your combat approach."]
					});
					if (cls.level >= 2) {
						features.push({
							type: "entries",
							name: "Action Surge",
							entries: ["Once per short rest, take an additional action on your turn."]
						});
					}
					break;
				case "Wizard":
					features.push({
						type: "entries",
						name: "Spellbook",
						entries: ["Your spellbook contains the spells you have learned and can prepare."]
					});
					break;
				case "Rogue":
					features.push({
						type: "entries",
						name: "Sneak Attack",
						entries: [`Deal an extra ${Math.ceil(cls.level / 2)}d6 damage when you have advantage on an attack.`]
					});
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
			"need to prove themselves"
		];
		return traits[Math.floor(Math.random() * traits.length)];
	}

	getBackgroundStory(backgroundName) {
		const stories = {
			"Acolyte": "Their time in service to the divine has shaped their worldview and granted them insight into the mysteries of faith.",
			"Criminal": "A past of shadows and questionable choices has taught them to think quickly and trust sparingly.",
			"Folk Hero": "Standing up for the common people against tyranny has made them a symbol of hope in their homeland.",
			"Noble": "Born to privilege, they seek to prove their worth beyond their bloodline and station.",
			"Sage": "Years of study and research have filled their mind with esoteric knowledge and burning questions.",
			"Soldier": "Military service instilled discipline and tactical thinking that serves them well in any conflict."
		};
		return stories[backgroundName] || "Their unique background has prepared them for the challenges ahead.";
	}

	generateRandomLanguages(race, classes) {
		const languages = ["Common"];
		
		// Add racial languages
		const racialLanguages = {
			"Elf": "Elvish",
			"Dwarf": "Dwarvish", 
			"Halfling": "Halfling",
			"Dragonborn": "Draconic",
			"Gnome": "Gnomish",
			"Half-Orc": "Orcish",
			"Tiefling": "Infernal"
		};

		if (racialLanguages[race.name]) {
			languages.push(racialLanguages[race.name]);
		}

		// Add bonus languages
		const bonusLanguages = ["Celestial", "Abyssal", "Giant", "Primordial", "Sylvan"];
		const numBonus = Math.floor(Math.random() * 3);
		for (let i = 0; i < numBonus; i++) {
			const lang = bonusLanguages[Math.floor(Math.random() * bonusLanguages.length)];
			if (!languages.includes(lang)) {
				languages.push(lang);
			}
		}

		return languages;
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

	generateRandomEquipment(classes, level) {
		const equipment = ["Explorer's Pack", "Bedroll", "Rope (50 feet)", "Tinderbox"];
		
		// Add class-specific equipment
		classes.forEach(cls => {
			switch (cls.name) {
				case "Fighter":
				case "Paladin":
					equipment.push("Plate Armor", "Longsword", "Shield");
					break;
				case "Rogue":
				case "Ranger":
					equipment.push("Leather Armor", "Shortbow", "Thieves' Tools");
					break;
				case "Wizard":
					equipment.push("Spellbook", "Component Pouch", "Dagger");
					break;
				case "Cleric":
					equipment.push("Chain Mail", "Holy Symbol", "Mace");
					break;
			}
		});

		// Add random magic items for higher levels
		if (level >= 5) {
			const magicItems = ["Potion of Healing", "Bag of Holding", "Cloak of Protection"];
			equipment.push(magicItems[Math.floor(Math.random() * magicItems.length)]);
		}

		return equipment;
	}

	// Method to generate random character at specified level
	generateRandomCharacterAtLevel(requestedLevel = 5, characterName = '', sourceName = 'RANDOM_GENERATED') {
		// Use existing generation logic but with provided parameters
		const randomName = characterName || this.generateRandomName();
		const randomRace = this.generateRandomRace();
		const randomClasses = this.generateRandomClasses(requestedLevel);
		const randomBackground = this.generateRandomBackground();
		const randomAbilityScores = this.generateRandomAbilityScores(randomClasses);
		const randomEquipment = this.generateRandomEquipment(randomClasses, requestedLevel);
		const randomActions = this.generateRandomActions(randomClasses, randomAbilityScores);
		const randomSpells = this.generateRandomSpells(randomClasses, requestedLevel);

		// Calculate derived stats
		const totalLevel = randomClasses.reduce((sum, cls) => sum + cls.level, 0);
		const profBonus = Math.ceil(totalLevel / 4) + 1;
		const conMod = Math.floor((randomAbilityScores.con - 10) / 2);
		const randomHp = this.calculateRandomHp(randomClasses, conMod);

		// Create character template
		const template = {
			name: randomName,
			source: sourceName,
			race: randomRace,
			class: randomClasses,
			background: randomBackground,
			alignment: this.generateRandomAlignment(),
			ac: this.generateRandomAC(randomClasses, randomAbilityScores),
			hp: randomHp,
			speed: {
				walk: 30 + (randomRace.name === "Wood Elf" ? 5 : 0) // Some races get speed bonuses
			},
			...randomAbilityScores,
			passive: 10 + Math.floor((randomAbilityScores.wis - 10) / 2) + (this.hasSkillProficiency("perception", randomClasses) ? profBonus : 0),
			save: this.generateRandomSaves(randomAbilityScores, randomClasses, profBonus),
			skill: this.generateRandomSkills(randomAbilityScores, randomClasses, profBonus),
			proficiencyBonus: `+${profBonus}`,
			deathSaves: {
				successes: 0,
				failures: 0
			},
			customTrackers: this.generateRandomTrackers(randomClasses),
			action: randomActions,
			...(randomSpells && { spells: randomSpells }),
			entries: this.generateRandomEntries(randomRace, randomClasses),
			fluff: {
				entries: [
					`${randomName} is a ${totalLevel === 1 ? 'beginning' : totalLevel < 5 ? 'novice' : totalLevel < 10 ? 'experienced' : 'veteran'} adventurer with a ${this.getPersonalityTrait()}.`,
					`Their journey has led them to master ${randomClasses.length === 1 ? 'the ways of the ' + randomClasses[0].name.toLowerCase() : 'multiple disciplines'}.`,
					this.getBackgroundStory(randomBackground.name)
				]
			},
			equipment: randomEquipment,
			languages: this.generateRandomLanguages(randomRace, randomClasses),
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
			messageEl.textContent = `Generated level ${totalLevel} ${randomName}!`;
			messageEl.style.color = 'green';
		}
		
		console.log(`Successfully generated level ${totalLevel} character: ${randomName}`);
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
						const characterAnchor = this.generateCharacterAnchor(characterData.name);
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
