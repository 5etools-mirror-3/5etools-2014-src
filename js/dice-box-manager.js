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
	static _currentTheme = "default"; // Current theme
	static _availableThemes = new Set(["default", "blueGreenMetal", "diceOfRolling", "diceOfRolling-fate", "gemstone", "rock", "rust", "wooden"]); // Available themes

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

			// Get user's preferred theme before initialization
			const preferredTheme = window.VetoolsConfig ?
				(window.VetoolsConfig.get("dice", "theme3d") || "default") :
				"default";

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
				// Theme configuration - use user's preference from start
				theme: preferredTheme,
				themeColor: "#4a7c59", // Default theme color
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

			// Detect available themes
			await this.detectAvailableThemes();

			// Set current theme to match what was initialized
			this._currentTheme = preferredTheme;
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
				}

				resolve();
			} catch (error) {
				console.error("Failed to load DiceBox from local assets:", error);

				// Fallback to CDN
				try {
					const { default: DiceBox } = await import("https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/dice-box.es.min.js");
					window.DiceBox = DiceBox;

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

	static isInitialized() {
		return this._isInitialized;
	}

	/**
	 * Parse dice notation and roll 3D dice
	 * @param {string} diceNotation - Dice notation like "1d20+5" or "2d6" or "2d8+1d6"
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

			// Validate that it's a proper dice notation - support pools, complex expressions, and modifiers
			// Examples: "1d20", "2d8+1d6", "1d20+5", "3d6+2d4+1"
			if (!cleanNotation.match(/\d*d\d+([+-]\d*d\d+|[+-]\d+)*/)) {
				throw new Error(`Invalid dice notation: ${diceNotation}`);
			}

			// Check if this is a pool notation (multiple different dice types like "2d8+1d6")
			const diceComponents = this._splitDiceNotation(cleanNotation);

			if (diceComponents.length > 1) {
				// Handle pool dice by rolling each component separately
				return await this._rollPoolDice(diceComponents, rollId, diceNotation);
			} else {
				// Handle single dice notation (includes modifiers like "2d6+4")
				return await this._rollSingleNotation(cleanNotation, rollId, diceNotation);
			}
		} catch (error) {
			// Remove from active rolls on error
			this._activeRolls.delete(rollId);
			throw error;
		}
	}

	/**
	 * Split dice notation into components (separating different dice types)
	 * @param {string} notation - Like "2d8+1d6+3" or "1d20+5"
	 * @returns {Array} Array of {type: 'dice'|'modifier', notation: string, value?: number}
	 */
	static _splitDiceNotation(notation) {
		const components = [];
		const parts = notation.split(/([+-])/);

		let currentSign = '+';
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i].trim();
			if (part === '+' || part === '-') {
				currentSign = part;
			} else if (part) {
				if (part.match(/\d*d\d+/)) {
					// This is a dice component
					components.push({
						type: 'dice',
						notation: (currentSign === '-' ? '-' : '') + part
					});
				} else if (part.match(/^\d+$/)) {
					// This is a numeric modifier
					components.push({
						type: 'modifier',
						notation: currentSign + part,
						value: parseInt(currentSign + part)
					});
				}
			}
		}

		return components;
	}

	/**
	 * Roll pool dice (multiple different dice types)
	 * @param {Array} diceComponents - Array of dice and modifier components
	 * @param {string} rollId - Roll ID for tracking
	 * @param {string} originalNotation - Original notation
	 * @returns {Promise<Object>} Combined results
	 */
	static async _rollPoolDice(diceComponents, rollId, originalNotation) {
		const allResults = [];
		const diceResults = [];
		let modifierTotal = 0;

		// Roll each dice component separately
		for (const component of diceComponents) {
			if (component.type === 'dice') {
				// Roll this dice notation using dice-box
				const rollResult = await this._diceBox.roll(component.notation.replace(/^-/, ''));
				const results = rollResult.map(die => die.value);

				// If negative dice (shouldn't happen in normal usage), negate results
				if (component.notation.startsWith('-')) {
					results.forEach((val, idx) => results[idx] = -val);
				}

				allResults.push(...results);
				diceResults.push(...results);
			} else if (component.type === 'modifier') {
				modifierTotal += component.value;
			}
		}

		const diceTotal = diceResults.reduce((sum, val) => sum + val, 0);
		const results = {
			diceResults,
			diceTotal,
			modifier: modifierTotal,
			total: diceTotal + modifierTotal,
			notation: originalNotation,
			individual: diceResults,
			rollId
		};

		// Wait for dice to settle before starting fade countdown
		if (results.individual && results.individual.length > 0) {
			this._waitForSettlingThenFade(rollId);
		} else {
			this._waitForSettlingThenFade(rollId);
		}

		return results;
	}

	/**
	 * Roll single dice notation (may include numeric modifiers)
	 * @param {string} cleanNotation - Clean notation like "2d6+4"
	 * @param {string} rollId - Roll ID for tracking
	 * @param {string} originalNotation - Original notation
	 * @returns {Promise<Object>} Results
	 */
	static async _rollSingleNotation(cleanNotation, rollId, originalNotation) {
		// Roll the dice using dice-box with the notation string directly
		const rollResult = await this._diceBox.roll(cleanNotation);

		// Process results immediately - don't wait for settling
		const results = this._processRollResults(rollResult, originalNotation);
		results.rollId = rollId; // Add roll ID to results

		// Wait for dice to settle before starting fade countdown
		if (results && results.individual && results.individual.length > 0) {
			this._waitForSettlingThenFade(rollId);
		} else {
			this._waitForSettlingThenFade(rollId);
		}

		return results;
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
		// DISABLED: This method can cause infinite loops when used as fallback
		// Always use mathematical randomization for single die fallbacks
		console.warn("rollSingleDie called but disabled to prevent loops, using mathematical roll");
		return RollerUtil.randomise(faces);
	}

	/**
	 * Wait for dice to settle by monitoring their movement, then start fade countdown
	 * @param {string} rollId - The roll ID to fade after settling
	 */
	static _waitForSettlingThenFade(rollId) {
		// Simplified approach: just wait a fixed time and then fade
		// Most dice settle within 3-4 seconds with realistic physics
		setTimeout(() => {
			// Check if this roll ID is still active
			if (this._activeRolls.has(rollId)) {
				this._fadeOutSpecificRoll(rollId);
			}
		}, 4000); // Simple 4 second delay
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
		// Clear all active roll tracking
		this._activeRolls.clear();
	}


	/**
	 * Set the current theme for 3D dice
	 * @param {string} theme - Theme name (default, rust, gemstone, rock, smooth, wooden)
	 * @returns {Promise<void>}
	 */
	static async setTheme(theme) {
		if (!this.isEnabled()) {
			console.warn("DiceBoxManager: Cannot set theme - not initialized or enabled");
			return;
		}


		try {
			// First clear any existing dice - themes only apply before/after rolls
			if (this._diceBox.clear) {
				await this._diceBox.clear();
			}

			// Use dice-box's updateConfig method which is the correct way to change themes
			if (this._diceBox.updateConfig) {
				this._diceBox.updateConfig({theme: theme});
				this._currentTheme = theme;

				// Store theme preference
				if (window.VetoolsConfig) {
					window.VetoolsConfig.set("dice", "theme3d", theme);
				}
			} else {
				// Try alternative: reinitialize DiceBox with new theme
				console.warn(`DiceBoxManager: updateConfig method not available, reinitializing DiceBox with new theme`);
				await this._reinitializeWithTheme(theme);
			}
		} catch (error) {
			console.warn(`DiceBoxManager: Theme ${theme} failed to load, trying reinitialization approach.`, error);
			try {
				await this._reinitializeWithTheme(theme);
			} catch (reinitError) {
				console.error(`DiceBoxManager: Failed to apply theme ${theme}:`, reinitError);
				this._currentTheme = "default";
			}
		}
	}

	/**
	 * Reinitialize DiceBox with a new theme (fallback method)
	 * @param {string} theme - Theme name
	 * @returns {Promise<void>}
	 */
	static async _reinitializeWithTheme(theme) {

		// Store current state
		const wasEnabled = this._isEnabled;

		// Destroy current instance if it exists
		if (this._diceBox) {
			try {
				if (this._diceBox.clear) await this._diceBox.clear();
			} catch (e) {
				console.warn("Error clearing dice during reinitialization:", e);
			}
			this._diceBox = null;
		}

		// Clear active rolls
		this._activeRolls.clear();

		// Reinitialize with new theme
		this._diceBox = new window.DiceBox({
			id: "dice-box",
			assetPath: "/lib/dice-box-assets/",
			origin: window.location.origin,
			scale: 4,
			gravity: 0.8,
			mass: 1.2,
			friction: 0.9,
			restitution: 0.3,
			shadowIntensity: 0.4,
			lightIntensity: 0.8,
			spinForce: 0.6,
			throwForce: 3.5,
			enableShadows: true,
			lightPosition: { x: -10, y: 30, z: 20 },
			// Set the theme during initialization
			theme: theme,
			themeColor: "#4a7c59", // Default theme color
			width: window.innerWidth,
			height: window.innerHeight,
			container: "#dice-box",
			canvas: {
				width: window.innerWidth,
				height: window.innerHeight
			}
		});

		await this._diceBox.init();
		this._currentTheme = theme;
		this._isEnabled = wasEnabled;

		// Ensure container is ready
		this._ensureContainerReady();

	}


	/**
	 * Get the current theme
	 * @returns {string} Current theme name
	 */
	static getCurrentTheme() {
		return this._currentTheme;
	}

	/**
	 * Get list of available themes
	 * @returns {Array<string>} Available theme names
	 */
	static getAvailableThemes() {
		return Array.from(this._availableThemes).sort();
	}

	/**
	 * Detect available themes by checking the themes directory
	 * @returns {Promise<Array<string>>} Available theme names
	 */
	static async detectAvailableThemes() {
		const themes = new Set(["default"]); // Always include default

		try {
			// Try to fetch the themes directory listing
			const response = await fetch("/lib/dice-box-assets/themes/");
			if (response.ok) {
				const html = await response.text();
				// Parse directory listing for theme folders
				const themeMatches = html.match(/href="([^"]+)\/"/g) || [];
				themeMatches.forEach(match => {
					const themeName = match.replace(/href="|\/"/g, "");
					if (themeName && themeName !== ".." && themeName !== ".") {
						themes.add(themeName);
					}
				});
			}
		} catch (error) {
			console.warn("DiceBoxManager: Could not detect available themes:", error);
		}

		this._availableThemes = themes;
		return Array.from(themes);
	}

}

// Export for global use
window.DiceBoxManager = DiceBoxManager;
