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
				console.log(`DiceConfig: 3D dice setting changed to: ${enabled}`);
				
				if (window.Renderer && window.Renderer.dice) {
					window.Renderer.dice.set3dDiceEnabled(enabled);
					console.log(`DiceConfig: Set 3D dice enabled to: ${enabled}`);
				}

				// Initialize or enable DiceBoxManager if toggling on
				if (enabled && window.DiceBoxManager) {
					try {
						if (!window.DiceBoxManager.isInitialized()) {
							console.log("DiceConfig: Initializing DiceBoxManager on toggle...");
							await window.DiceBoxManager.init();
						}
						if (!window.DiceBoxManager.isEnabled()) {
							await window.DiceBoxManager.enable();
						}
						console.log("DiceConfig: DiceBoxManager enabled via toggle");
					} catch (error) {
						console.error("Failed to enable 3D dice via toggle:", error);
					}
				}
			});

			comp._addHookBase("dice_theme3d", () => {
				const theme = window.VetoolsConfig.get("dice", "theme3d");
				console.log(`DiceConfig: 3D dice theme changed to: ${theme}`);
				if (window.DiceBoxManager && window.DiceBoxManager.isEnabled()) {
					window.DiceBoxManager.setTheme(theme).catch(console.error);
					console.log(`DiceConfig: Set 3D dice theme to: ${theme}`);
				}
			});
		}
	}

	static async _initializeDice() {
		console.log("DiceConfig: Starting dice initialization...");
		
		// Wait for other scripts to load
		await this._waitForDependencies();
		console.log("DiceConfig: Dependencies loaded");

		// Always apply current configuration first, regardless of 3D dice availability
		this._applyCurrentConfig();

		// Always initialize DiceBoxManager for seamless toggling
		if (window.DiceBoxManager) {
			try {
				console.log("DiceConfig: Initializing DiceBoxManager...");
				await window.DiceBoxManager.init();
				console.log("DiceConfig: DiceBoxManager initialized successfully");

				// Enable it only if user preference is set
				const enabled = window.VetoolsConfig ? window.VetoolsConfig.get("dice", "enable3dDice") : false;
				console.log(`DiceConfig: 3D dice setting is: ${enabled}`);

				if (enabled) {
					await window.DiceBoxManager.enable();
					console.log("DiceConfig: 3D dice system enabled based on user preference");
				} else {
					console.log("DiceConfig: 3D dice system initialized but not enabled (user preference)");
				}
			} catch (error) {
				console.error("Failed to initialize 3D dice system:", error);
				// Disable 3D dice if initialization failed
				if (window.Renderer && window.Renderer.dice) {
					window.Renderer.dice.set3dDiceEnabled(false);
				}
			}
		} else {
			console.log("DiceConfig: DiceBoxManager not found - 3D dice unavailable");
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
