/**
 * Configuration manager for 3D dice integration
 * Handles the connection between preferences and dice system
 */
class DiceConfig {
	static init() {
		// Set up listeners for configuration changes
		if (window.VetoolsConfig) {
			this._setupConfigListeners();
		}

		// Initialize 3D dice on page load
		this._initializeDice();
	}

	static _setupConfigListeners() {
		// Listen for dice configuration changes
		const comp = window.VetoolsConfig.getConfigComp();
		if (comp) {
			comp._addHookBase("dice_enable3dDice", () => {
				const enabled = window.VetoolsConfig.get("dice", "enable3dDice");
				if (window.Renderer && window.Renderer.dice) {
					window.Renderer.dice.set3dDiceEnabled(enabled);
				}
			});
		}
	}

	static async _initializeDice() {
		// Wait for other scripts to load
		await this._waitForDependencies();

		// Always apply current configuration first, regardless of 3D dice availability
		this._applyCurrentConfig();

		// Initialize DiceBoxManager only if enabled
		const enabled = window.VetoolsConfig ? window.VetoolsConfig.get("dice", "enable3dDice") : false;
		
		if (enabled && window.DiceBoxManager) {
			try {
				await window.DiceBoxManager.init();
				console.log("DiceConfig: 3D dice system initialized successfully");
			} catch (error) {
				console.error("Failed to initialize 3D dice system:", error);
				// Disable 3D dice if initialization failed
				if (window.Renderer && window.Renderer.dice) {
					window.Renderer.dice.set3dDiceEnabled(false);
				}
			}
		} else {
			console.log("DiceConfig: 3D dice disabled or DiceBoxManager not found");
		}
	}

	static _applyCurrentConfig() {
		if (window.VetoolsConfig && window.Renderer && window.Renderer.dice) {
			const enabled = window.VetoolsConfig.get("dice", "enable3dDice");

			window.Renderer.dice.set3dDiceEnabled(enabled);
		}
	}

	static async _waitForDependencies() {
		return new Promise((resolve) => {
			const checkDependencies = () => {
				if (window.Renderer &&
					window.Renderer.dice &&
					window.DiceBoxManager &&
					window.VetoolsConfig) {
					resolve();
				} else {
					setTimeout(checkDependencies, 100);
				}
			};
			checkDependencies();
		});
	}
}

// Initialize when the page loads
if (typeof window !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			DiceConfig.init();
		});
	} else {
		DiceConfig.init();
	}
}

// Export for global use
window.DiceConfig = DiceConfig;
