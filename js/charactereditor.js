let editor;
let currentCharacterData = null;
let isEditMode = false;

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

	loadCharacterForEdit() {
		const characterData = localStorage.getItem('editingCharacter');
		if (characterData) {
			try {
				currentCharacterData = JSON.parse(characterData);
				this.ace.setValue(JSON.stringify(currentCharacterData, null, 2), 1);
				document.getElementById('message').textContent = 'Loaded character for editing';
			} catch (e) {
				console.error('Error loading character data:', e);
				document.getElementById('message').textContent = 'Error loading character data';
			}
		}
	}

	loadTemplate() {
		// Default character template with custom content example
		const template = {
			name: "New Character",
			source: "Custom",
			page: 1,
			level: 1,
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
			}
		};
		this.ace.setValue(JSON.stringify(template, null, 2), 1);
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
				await this.updateCharacterInDataSource(characterData);
				document.getElementById('message').textContent = 'Character updated successfully';
			} else {
				// Save new character
				await this.saveNewCharacter(characterData);
				document.getElementById('message').textContent = 'Character saved successfully';
			}
			document.getElementById('message').style.color = 'green';
		} catch (e) {
			console.error('Save error:', e);
			document.getElementById('message').textContent = 'Save Error: ' + e.message;
			document.getElementById('message').style.color = 'red';
		}
	}

	async updateCharacterInDataSource(updatedCharacter) {
		// Update localStorage with the edited character
		localStorage.setItem('editingCharacter', JSON.stringify(updatedCharacter));
		
		// Log what would be saved in a real implementation
		console.log('Character updated:', updatedCharacter);
		
		// In a real implementation, this would save to the actual data source
		return true;
	}

	async saveNewCharacter(characterData) {
		// Generate a unique ID/filename for new character
		const characterId = this.generateCharacterId(characterData.name);
		console.log('Would save new character with ID:', characterId);
		console.log('Character data:', characterData);
		
		// In a real implementation, this would create a new file or database entry
		return true;
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