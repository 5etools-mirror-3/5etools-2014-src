"use strict";

/**
 * 3D Dice Manager using dice-box library
 * Integrates with 5etools existing dice rolling system
 */
class DiceBoxManager {
	static _instance = null;
	static _isInitialized = false;
	static _diceBox = null;
	static _isEnabled = false;

	static async getInstance() {
		if (!this._instance) {
			this._instance = new DiceBoxManager();
		}
		return this._instance;
	}

	static async init() {
		if (this._isInitialized) return;

		try {
			// Load dice-box library from CDN
			await this._loadDiceBoxLibrary();

			// Wait for the library to fully load
			await new Promise(resolve => setTimeout(resolve, 500));

			// Check if DiceBox is now available
			if (!window.DiceBox) {
				throw new Error("DiceBox library failed to load properly");
			}

			// Initialize dice-box with full screen configuration
			this._diceBox = new window.DiceBox("#dice-box", {
				assetPath: "/lib/dice-box-assets/",
				origin: window.location.origin,
				scale: 12,  // Larger dice for better visibility
				gravity: 1,
				mass: 1,
				friction: 0.8,
				restitution: 0.5,
				shadowIntensity: 0.6,
				lightIntensity: 0.9,
				spinForce: 1,  
				throwForce: 6, // Stronger throw for full screen
				enableShadows: true,
				lightPosition: { x: -10, y: 30, z: 20 },
				width: window.innerWidth,  // Full window width
				height: window.innerHeight, // Full window height
				container: "#dice-box"  // Make sure container is properly set
			});

			await this._diceBox.init();
			this._isInitialized = true;

			// Add window resize handler to keep dice-box full screen
			window.addEventListener('resize', () => {
				if (this._diceBox && this._diceBox.resize) {
					this._diceBox.resize(window.innerWidth, window.innerHeight);
				}
				// Also update the container styles
				const container = document.getElementById('dice-box');
				if (container) {
					container.style.width = '100vw';
					container.style.height = '100vh';
				}
			});

		} catch (error) {
			console.error("Failed to initialize dice-box:", error);
			this._isInitialized = false;
		}
	}

	static async _loadDiceBoxLibrary() {
		return new Promise(async (resolve, reject) => {
			// Check if already loaded
			if (window.DiceBox) {
				console.log("DiceBox already loaded");
				resolve();
				return;
			}

			try {
				// Try to import DiceBox as ES module from local copy first
				const { default: DiceBox } = await import("../lib/dice-box-assets/dice-box.es.min.js");

				// Make it available globally
				window.DiceBox = DiceBox;

				// Add the dice-box container if it doesn't exist
				if (!document.getElementById('dice-box')) {
					const diceContainer = document.createElement('div');
					diceContainer.id = 'dice-box';
					// Style the container to be full screen
					diceContainer.style.position = 'fixed';
					diceContainer.style.top = '0';
					diceContainer.style.left = '0';
					diceContainer.style.width = '100vw';
					diceContainer.style.height = '100vh';
					diceContainer.style.pointerEvents = 'none'; // Don't block clicks
					diceContainer.style.zIndex = '1000'; // Above other content
					document.body.appendChild(diceContainer);
					console.log("Created dice-box container");
				}

				resolve();
			} catch (error) {
				console.error("Failed to load DiceBox from local assets:", error);

				// Fallback to CDN
				try {
					const { default: DiceBox } = await import("https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/dice-box.es.min.js");
					window.DiceBox = DiceBox;
					console.log("DiceBox loaded from CDN fallback");

					if (!document.getElementById('dice-box')) {
						const diceContainer = document.createElement('div');
						diceContainer.id = 'dice-box';
						// Style the container to be full screen
						diceContainer.style.position = 'fixed';
						diceContainer.style.top = '0';
						diceContainer.style.left = '0';
						diceContainer.style.width = '100vw';
						diceContainer.style.height = '100vh';
						diceContainer.style.pointerEvents = 'none'; // Don't block clicks
						diceContainer.style.zIndex = '1000'; // Above other content
						document.body.appendChild(diceContainer);
						console.log("Created dice-box container");
					}

					resolve();
				} catch (cdnError) {
					console.error("Failed to load DiceBox from CDN:", cdnError);
					reject(new Error('Failed to load dice-box library from local assets or CDN'));
				}
			}
		});
	}	static async enable() {
		if (!this._isInitialized) {
			await this.init();
		}
		this._isEnabled = this._isInitialized;
		return this._isEnabled;
	}

	static disable() {
		this._isEnabled = false;
	}

	static isEnabled() {
		return this._isEnabled && this._isInitialized;
	}

	/**
	 * Parse dice notation and roll 3D dice
	 * @param {string} diceNotation - Dice notation like "1d20+5" or "2d6"
	 * @param {string} label - Label for the roll
	 * @returns {Promise<Object>} Roll result
	 */
	static async rollDice(diceNotation, label = "Roll") {
		if (!this.isEnabled()) {
			throw new Error("Dice-box not initialized or enabled");
		}

		try {
			// Ensure dice container exists and is properly sized
			this._ensureContainerReady();

			// Parse the dice notation to extract individual dice
			const diceArray = this._parseDiceNotation(diceNotation);

			if (diceArray.length === 0) {
				throw new Error(`Invalid dice notation: ${diceNotation}`);
			}

			// Roll the dice using dice-box
			const rollResult = await this._diceBox.roll(diceArray);

			// Process results
			const results = this._processRollResults(rollResult, diceNotation);

			// Auto-clear dice after 2 seconds
			setTimeout(() => {
				this.clearDice();
			}, 2000);

			return results;
		} catch (error) {
			console.error("Error rolling 3D dice:", error);
			throw error;
		}
	}

	/**
	 * Ensure the dice container exists and is properly configured
	 */
	static _ensureContainerReady() {
		let container = document.getElementById('dice-box');
		if (!container) {
			container = document.createElement('div');
			container.id = 'dice-box';
			document.body.appendChild(container);
		}
		
		// Ensure proper styling for full-screen dice
		container.style.position = 'fixed';
		container.style.top = '0';
		container.style.left = '0';
		container.style.width = '100vw';
		container.style.height = '100vh';
		container.style.pointerEvents = 'none';
		container.style.zIndex = '10000'; // Higher than modals
		container.style.background = 'transparent';
		
		// Ensure the dice-box takes full window dimensions
		if (this._diceBox && this._diceBox.resize) {
			this._diceBox.resize(window.innerWidth, window.innerHeight);
		}
	}

	/**
	 * Parse dice notation into dice-box format
	 * @param {string} notation - Dice notation like "1d20+5", "2d6", etc.
	 * @returns {Array} Array of dice objects for dice-box
	 */
	static _parseDiceNotation(notation) {
		const diceArray = [];

		// Remove spaces and convert to lowercase
		const clean = notation.replace(/\s+/g, '').toLowerCase();

		// Match dice patterns like "2d6", "1d20", etc.
		const diceRegex = /(\d+)?d(\d+)/g;
		let match;

		while ((match = diceRegex.exec(clean)) !== null) {
			const count = parseInt(match[1] || '1');
			const sides = parseInt(match[2]);

			// Add dice to array
			for (let i = 0; i < count; i++) {
				diceArray.push({
					sides: sides,
					themeColor: this._getDiceTheme(sides)
				});
			}
		}

		return diceArray;
	}

	/**
	 * Get appropriate theme color for dice type
	 * @param {number} sides - Number of sides on the die
	 * @returns {string} Theme color
	 */
	static _getDiceTheme(sides) {
		const themes = {
			4: '#ff6b6b',    // Red for d4
			6: '#4ecdc4',    // Teal for d6
			8: '#45b7d1',    // Blue for d8
			10: '#f9ca24',   // Yellow for d10
			12: '#f0932b',   // Orange for d12
			20: '#eb4d4b',   // Dark red for d20
			100: '#6c5ce7'   // Purple for d100
		};
		return themes[sides] || '#95a5a6'; // Default gray
	}

	/**
	 * Process roll results from dice-box
	 * @param {Array} rollResult - Results from dice-box
	 * @param {string} originalNotation - Original dice notation
	 * @returns {Object} Processed results
	 */
	static _processRollResults(rollResult, originalNotation) {
		const diceResults = rollResult.map(die => die.value);
		const total = diceResults.reduce((sum, val) => sum + val, 0);

		// Parse modifiers from original notation
		const modifierMatch = originalNotation.match(/([+-]\d+)/g);
		let modifierTotal = 0;

		if (modifierMatch) {
			modifierTotal = modifierMatch.reduce((sum, mod) => sum + parseInt(mod), 0);
		}

		return {
			diceResults,
			diceTotal: total,
			modifier: modifierTotal,
			total: total + modifierTotal,
			notation: originalNotation,
			individual: diceResults,
			rolls: rollResult
		};
	}

	/**
	 * Roll a single die and return the result
	 * @param {number} faces - Number of sides on the die
	 * @returns {Promise<number>} The rolled value
	 */
	static async rollSingleDie(faces) {
		if (!this.isEnabled()) {
			throw new Error("Dice-box not initialized or enabled");
		}

		try {
			// Ensure dice container exists and is properly sized
			this._ensureContainerReady();

			// Create a single die
			const diceArray = [{
				sides: faces,
				themeColor: this._getDiceTheme(faces)
			}];

			// Roll the die using dice-box
			const rollResult = await this._diceBox.roll(diceArray);

			// Auto-clear dice after 1.5 seconds for single die rolls
			setTimeout(() => {
				this.clearDice();
			}, 1500);

			return rollResult[0].value;
		} catch (error) {
			console.error("Error rolling single 3D die:", error);
			throw error;
		}
	}

	/**
	 * Clear all dice from the scene
	 */
	static async clearDice() {
		if (this._diceBox) {
			await this._diceBox.clear();
		}
	}
}

// Export for global use
window.DiceBoxManager = DiceBoxManager;
