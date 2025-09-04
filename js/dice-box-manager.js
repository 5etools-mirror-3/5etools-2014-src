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
	static _activeRolls = new Set(); // Track active roll IDs
	static _rollCounter = 0; // Generate unique roll IDs

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

			// Initialize dice-box with full screen configuration using new v1.1.0 API
			this._diceBox = new window.DiceBox({
				id: "dice-box",
				assetPath: "/lib/dice-box-assets/",
				origin: window.location.origin,
				scale: 4,  // Smaller dice for better visibility and less clutter
				gravity: 0.8,  // Slightly reduced gravity for more natural rolling
				mass: 1.2,  // Slightly heavier dice for more stable rolling
				friction: 0.9,  // Higher friction for less sliding around
				restitution: 0.3,  // Lower bounce for more realistic settling
				shadowIntensity: 0.4,  // Lighter shadows for cleaner look
				lightIntensity: 0.8,  // Balanced lighting
				spinForce: 0.6,  // Reduced spin for more predictable rolls
				throwForce: 3.5,  // Gentler throw force for better control
				enableShadows: true,
				lightPosition: { x: -10, y: 30, z: 20 },
				// Explicit sizing to force full screen
				width: window.innerWidth,
				height: window.innerHeight,
				container: "#dice-box",
				// Force canvas to fill container
				canvas: {
					width: window.innerWidth,
					height: window.innerHeight
				}
			});

			await this._diceBox.init();
			this._isInitialized = true;

			// Ensure container is properly configured after initialization
			this._ensureContainerReady();

			// Add window resize handler to keep dice-box full screen
			window.addEventListener('resize', () => {
				// Re-ensure container is properly configured on resize
				this._ensureContainerReady();
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
				const { default: DiceBox } = await import("/lib/dice-box-assets/dice-box.es.min.js");

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
					diceContainer.style.zIndex = '10000'; // Above other content
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
						diceContainer.style.zIndex = '10000'; // Above other content
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
	}

	static async enable() {
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
	 * @returns {Promise<Object>} Roll result with unique roll ID
	 */
	static async rollDice(diceNotation, label = "Roll") {
		if (!this.isEnabled()) {
			throw new Error("Dice-box not initialized or enabled");
		}

		// Generate unique roll ID for concurrent roll tracking
		const rollId = `roll_${++this._rollCounter}_${Date.now()}`;
		this._activeRolls.add(rollId);

		try {
			// Ensure dice container exists and is properly sized
			this._ensureContainerReady();

			// Clean the dice notation for dice-box (remove spaces, ensure proper format)
			const cleanNotation = diceNotation.replace(/\s+/g, '');
			console.debug("DiceBoxManager.rollDice input", {diceNotation, cleanNotation, label});

			// Validate that it's a proper dice notation
			if (!cleanNotation.match(/\d*d\d+/)) {
				throw new Error(`Invalid dice notation: ${diceNotation}`);
			}

			// Roll the dice using dice-box with the notation string directly
			const rollResult = await this._diceBox.roll(cleanNotation);

			// Process results
			const results = this._processRollResults(rollResult, diceNotation);
			results.rollId = rollId; // Add roll ID to results

			// Wait for dice to settle completely, then fade out smoothly
			// Only clear after we have confirmed results
			if (results && results.individual && results.individual.length > 0) {
				setTimeout(() => {
					this._fadeOutSpecificRoll(rollId);
				}, 3000); // Longer delay to ensure user sees results
			}

			return results;
		} catch (error) {
			// Remove from active rolls on error
			this._activeRolls.delete(rollId);
			console.error("Error rolling 3D dice:", error);
			throw error;
		}
	}

	/**
	 * Parse dice notation into dice array for diagnostics (not used by main flow)
	 * @param {string} notation
	 * @returns {Array}
	 */
	static _parseDiceNotation(notation) {
		const diceArray = [];
		const clean = (notation || "").replace(/\s+/g, '').toLowerCase();
		const diceRegex = /(\d+)?d(\d+)/g;
		let match;
		while ((match = diceRegex.exec(clean)) !== null) {
			const count = parseInt(match[1] || '1');
			const sides = parseInt(match[2]);
			for (let i = 0; i < count; i++) {
				diceArray.push({sides});
			}
		}
		console.debug("DiceBoxManager._parseDiceNotation", {notation, diceArray});
		return diceArray;
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

		// Ensure proper styling for full-screen dice with important declarations
		container.style.cssText = `
			position: fixed !important;
			top: 0 !important;
			left: 0 !important;
			width: 100vw !important;
			height: 100vh !important;
			pointer-events: none !important;
			z-index: 10000 !important;
			background: transparent !important;
			margin: 0 !important;
			padding: 0 !important;
			border: none !important;
			box-sizing: border-box !important;
			overflow: hidden !important;
		`;

		// Also ensure any canvas inside is properly sized
		const canvas = container.querySelector('canvas');
		if (canvas) {
			canvas.style.cssText = `
				width: 100% !important;
				height: 100% !important;
				display: block !important;
			`;
		}

		// Debug logging
		console.log(`DiceBox container dimensions: ${container.offsetWidth}x${container.offsetHeight}`);
		console.log(`Window dimensions: ${window.innerWidth}x${window.innerHeight}`);

		// Ensure the dice-box takes full window dimensions
		if (this._diceBox && this._diceBox.resize) {
			this._diceBox.resize(window.innerWidth, window.innerHeight);
		}
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

		// Generate unique roll ID for concurrent roll tracking
		const rollId = `single_roll_${++this._rollCounter}_${Date.now()}`;
		this._activeRolls.add(rollId);

		try {
			// Ensure dice container exists and is properly sized
			this._ensureContainerReady();

			// Create dice notation for a single die
			const diceNotation = `1d${faces}`;

			// Roll the die using dice-box with proper notation
			const rollResult = await this._diceBox.roll(diceNotation);

			// Only clear after we have a valid result
			if (rollResult && rollResult[0] && typeof rollResult[0].value === 'number') {
				setTimeout(() => {
					this._fadeOutSpecificRoll(rollId);
				}, 2500); // Longer delay for single die
			}

			return rollResult[0].value;
		} catch (error) {
			// Remove from active rolls on error
			this._activeRolls.delete(rollId);
			console.error("Error rolling single 3D die:", error);
			throw error;
		}
	}

	/**
	 * Fade out a specific roll by ID (for concurrent roll support)
	 */
	static async _fadeOutSpecificRoll(rollId) {
		// Remove from active rolls tracking
		this._activeRolls.delete(rollId);

		// If this is the last active roll, fade out all dice
		if (this._activeRolls.size === 0) {
			this.fadeOutDice();
		}
		// For concurrent rolls, we don't fade individual dice since dice-box
		// doesn't support selective clearing. Instead, we wait for all rolls
		// to complete before fading
	}

	/**
	 * Clear all dice from the scene with smooth fade out
	 */
	static async fadeOutDice() {
		const container = document.getElementById('dice-box');
		if (container && this._diceBox) {
			// Clear all active roll tracking
			this._activeRolls.clear();

			// Add fade out transition
			container.style.transition = 'opacity 1s ease-out';
			container.style.opacity = '0';

			// Wait for fade to complete, then actually clear dice
			setTimeout(async () => {
				await this._diceBox.clear();
				// Reset opacity for next roll
				container.style.opacity = '1';
				container.style.transition = '';
			}, 1000);
		}
	}

	/**
	 * Immediately clear all dice from the scene (for emergency/manual clearing)
	 */
	static async clearDice() {
		if (this._diceBox) {
			await this._diceBox.clear();
			const container = document.getElementById('dice-box');
			if (container) {
				container.style.opacity = '1';
				container.style.transition = '';
			}
		}
	}
}

// Export for global use
window.DiceBoxManager = DiceBoxManager;
