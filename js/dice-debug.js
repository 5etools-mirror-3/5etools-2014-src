/**
 * Debug utilities for 3D Dice integration
 * Add this script to test dice functionality
 */

// Add a debug button to test dice functionality
function addDiceDebugButton() {
	// Don't add if already exists
	if (document.getElementById('dice-debug-btn')) return;

	const debugBtn = document.createElement('button');
	debugBtn.id = 'dice-debug-btn';
	debugBtn.textContent = 'Test 3D Dice';
	debugBtn.style.cssText = `
		position: fixed;
		top: 10px;
		left: 10px;
		z-index: 10001;
		background: #28a745;
		color: white;
		border: none;
		padding: 8px 12px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
	`;

	debugBtn.onclick = async () => {
		console.log('Testing 3D dice...');

		// Test if DiceBoxManager is available
		if (!window.DiceBoxManager) {
			console.error('DiceBoxManager not found!');
			alert('DiceBoxManager not loaded!');
			return;
		}

		try {
			// Initialize if not already done
			await window.DiceBoxManager.init();

			// Enable dice
			await window.DiceBoxManager.enable();

			// Test roll
			const result = await window.DiceBoxManager.rollDice('1d20', 'Debug Test');
			console.log('Dice roll result:', result);

		} catch (error) {
			console.error('Error testing dice:', error);
			alert('Error: ' + error.message);
		}
	};

	document.body.appendChild(debugBtn);
}

// Add debug info function
function showDiceDebugInfo() {
	const info = {
		DiceBoxManager: !!window.DiceBoxManager,
		DiceBox: !!window.DiceBox,
		diceBoxElement: !!document.getElementById('dice-box'),
		Renderer: !!window.Renderer,
		RendererDice: !!(window.Renderer && window.Renderer.dice),
		VetoolsConfig: !!window.VetoolsConfig,
	};

	console.log('🎲 Dice Debug Info:', info);

	// Show as notification too
	const notification = document.createElement('div');
	notification.style.cssText = `
		position: fixed;
		top: 50px;
		left: 10px;
		background: rgba(0,0,0,0.8);
		color: white;
		padding: 10px;
		border-radius: 5px;
		z-index: 10002;
		font-family: monospace;
		font-size: 11px;
		max-width: 300px;
	`;

	notification.innerHTML = `
		<strong>🎲 Dice Debug Info:</strong><br>
		${Object.entries(info).map(([key, value]) =>
			`${key}: ${value ? '✅' : '❌'}`
		).join('<br>')}
	`;

	document.body.appendChild(notification);

	setTimeout(() => {
		if (notification.parentNode) {
			notification.remove();
		}
	}, 5000);
}

// Initialize debug tools when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		setTimeout(() => {
			addDiceDebugButton();
			showDiceDebugInfo();
		}, 1000);
	});
} else {
	setTimeout(() => {
		addDiceDebugButton();
		showDiceDebugInfo();
	}, 1000);
}

// Make functions available globally for console testing
window.diceDebug = {
	addButton: addDiceDebugButton,
	showInfo: showDiceDebugInfo,
	testRoll: async (notation = '1d20') => {
		if (window.DiceBoxManager) {
			try {
				await window.DiceBoxManager.init();
				await window.DiceBoxManager.enable();
				return await window.DiceBoxManager.rollDice(notation, 'Console Test');
			} catch (error) {
				console.error('Error in test roll:', error);
				throw error;
			}
		} else {
			console.error('DiceBoxManager not available');
		}
	}
};
