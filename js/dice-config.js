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
			comp._addHookBase("dice_enable3dDice", async () => {
				const enabled = window.VetoolsConfig.get("dice", "enable3dDice");
				
				if (window.Renderer && window.Renderer.dice) {
					window.Renderer.dice.set3dDiceEnabled(enabled);
				}

				// Initialize or enable DiceBoxManager if toggling on
				if (enabled && window.DiceBoxManager) {
					try {
						if (!window.DiceBoxManager.isInitialized()) {
							await window.DiceBoxManager.init();
						}
						if (!window.DiceBoxManager.isEnabled()) {
							await window.DiceBoxManager.enable();
						}
					} catch (error) {
						console.error("Failed to enable 3D dice via toggle:", error);
					}
				}
			});

			comp._addHookBase("dice_theme3d", () => {
				const theme = window.VetoolsConfig.get("dice", "theme3d");
				if (window.DiceBoxManager && window.DiceBoxManager.isEnabled()) {
					window.DiceBoxManager.setTheme(theme).catch(console.error);
				}
			});
		}
	}

	static async _initializeDice() {
		
		// Wait for other scripts to load
		await this._waitForDependencies();

		// Always apply current configuration first, regardless of 3D dice availability
		this._applyCurrentConfig();

		// Always initialize DiceBoxManager for seamless toggling
		if (window.DiceBoxManager) {
			try {
				await window.DiceBoxManager.init();

				// Enable it only if user preference is set
				const enabled = window.VetoolsConfig ? window.VetoolsConfig.get("dice", "enable3dDice") : false;

				if (enabled) {
					await window.DiceBoxManager.enable();
				}
			} catch (error) {
				console.error("Failed to initialize 3D dice system:", error);
				// Disable 3D dice if initialization failed
				if (window.Renderer && window.Renderer.dice) {
					window.Renderer.dice.set3dDiceEnabled(false);
				}
			}
		}
	}

	static _applyCurrentConfig() {
		if (window.VetoolsConfig && window.Renderer && window.Renderer.dice) {
			const enabled = window.VetoolsConfig.get("dice", "enable3dDice");
			const theme = window.VetoolsConfig.get("dice", "theme3d") || "default";

			window.Renderer.dice.set3dDiceEnabled(enabled);
			
			// Apply theme if DiceBoxManager is available and enabled
			if (enabled && window.DiceBoxManager && window.DiceBoxManager.isEnabled()) {
				window.DiceBoxManager.setTheme(theme).catch(console.error);
			}
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
