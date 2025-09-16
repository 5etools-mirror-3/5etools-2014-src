// Source Management Page - Dedicated source creation and management
"use strict";

// API configuration
const API_BASE_URL = window.location.origin.includes("localhost")
	? "http://localhost:3000/api"
	: "/api";

// Source Password Management (moved from charactereditor.js)
class SourcePasswordManager {
	static STORAGE_KEY = "sourcePasswords";

	// Get all cached passwords from localStorage
	static getCachedPasswords () {
		try {
			const stored = localStorage.getItem(this.STORAGE_KEY);
			return stored ? JSON.parse(stored) : {};
		} catch (e) {
			console.error("Error loading cached passwords:", e);
			return {};
		}
	}

	// Cache a password for a source
	static cachePassword (sourceName, password) {
		try {
			const passwords = this.getCachedPasswords();
			passwords[sourceName] = password;
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(passwords));
			return true;
		} catch (e) {
			console.error("Error caching password:", e);
			return false;
		}
	}

	// Get cached password for a source
	static getCachedPassword (sourceName) {
		const passwords = this.getCachedPasswords();
		return passwords[sourceName] || null;
	}

	// Remove cached password for a source
	static removeCachedPassword (sourceName) {
		try {
			const passwords = this.getCachedPasswords();
			delete passwords[sourceName];
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(passwords));
			return true;
		} catch (e) {
			console.error("Error removing cached password:", e);
			return false;
		}
	}

	// Check if password is valid for a source
	static async validatePassword (sourceName, password) {
		try {
			const response = await fetch(`${API_BASE_URL}/sources/validate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: sourceName, password }),
			});

			if (response.ok) {
				const result = await response.json();
				return result.valid === true;
			}
			return false;
		} catch (e) {
			console.error("Error validating password:", e);
			return false;
		}
	}

	// Create a new source with password
	static async createSource (sourceName, password) {
		try {
			const response = await fetch(`${API_BASE_URL}/sources/create`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: sourceName, password }),
			});

			if (response.ok) {
				const result = await response.json();
				return result.success === true;
			}
			return false;
		} catch (e) {
			console.error("Error creating source:", e);
			return false;
		}
	}
}

// Source Management Page Controller
class SourceManager {
	constructor () {
		this.init();
	}

	init () {
		this.setupEventListeners();
		// Delay updateCachedSourcesList until after sourceManager is globally available
		setTimeout(() => this.updateCachedSourcesList(), 0);
	}

	setupEventListeners () {
		// Create source button
		document.getElementById("create-source-btn").addEventListener("click", () => {
			this.createNewSource();
		});

		// Login button
		document.getElementById("login-source-btn").addEventListener("click", () => {
			this.loginToSource();
		});


		// Test access button (optional)
		const testAccessBtn = document.getElementById("test-access-btn");
		if (testAccessBtn) {
			testAccessBtn.addEventListener("click", () => {
				this.testSourceAccess();
			});
		}

		// Enter key support for inputs
		document.getElementById("new-source-name").addEventListener("keypress", (e) => {
			if (e.key === "Enter") this.createNewSource();
		});

		document.getElementById("confirm-source-password").addEventListener("keypress", (e) => {
			if (e.key === "Enter") this.createNewSource();
		});

		// Test source password element is not present in HTML, skip event listener

		document.getElementById("login-source-password").addEventListener("keypress", (e) => {
			if (e.key === "Enter") this.loginToSource();
		});
	}

	async createNewSource () {
		const sourceNameInput = document.getElementById("new-source-name");
		const passwordInput = document.getElementById("new-source-password");
		const confirmPasswordInput = document.getElementById("confirm-source-password");
		const messageDiv = document.getElementById("create-message");

		const sourceName = sourceNameInput.value.trim().toLocaleString();
		const password = passwordInput.value;
		const confirmPassword = confirmPasswordInput.value;

		// Clear previous messages
		messageDiv.textContent = "";
		messageDiv.style.color = "";

		// Validation
		if (!sourceName) {
			this.showMessage("create-message", "Please enter a source name", "red");
			sourceNameInput.focus();
			return;
		}

		const cleanSourceName = sourceName.replace(/[^a-zA-Z0-9_-]/g, "");
		if (cleanSourceName !== sourceName) {
			this.showMessage("create-message", `Source name contains invalid characters. Using: ${cleanSourceName}`, "orange");
			sourceNameInput.value = cleanSourceName;
		}

		if (cleanSourceName === "") {
			this.showMessage("create-message", "Invalid source name after cleaning", "red");
			return;
		}

		if (!password) {
			this.showMessage("create-message", "Please enter a password", "red");
			passwordInput.focus();
			return;
		}

		if (password !== confirmPassword) {
			this.showMessage("create-message", "Passwords do not match", "red");
			confirmPasswordInput.focus();
			return;
		}

		if (password.length < 4) {
			this.showMessage("create-message", "Password must be at least 4 characters long", "red");
			passwordInput.focus();
			return;
		}

		try {
			this.showMessage("create-message", "Creating source...", "blue");

			const success = await SourcePasswordManager.createSource(cleanSourceName, password);

			if (success) {
				// Cache the password
				SourcePasswordManager.cachePassword(cleanSourceName, password);

				// Clear form
				sourceNameInput.value = "";
				passwordInput.value = "";
				confirmPasswordInput.value = "";

				// Update cached sources list
				this.updateCachedSourcesList();

				this.showMessage("create-message", `Source "${cleanSourceName}" created successfully!`, "green");
			} else {
				this.showMessage("create-message", "Failed to create source. It may already exist.", "red");
			}
		} catch (e) {
			console.error("Error creating source:", e);
			this.showMessage("create-message", `Error creating source: ${e.message}`, "red");
		}
	}

	async loginToSource () {
		const sourceNameInput = document.getElementById("login-source-name");
		const passwordInput = document.getElementById("login-source-password");
		const messageDiv = document.getElementById("login-message");

		const sourceName = sourceNameInput.value.trim().toLowerCase();
		const password = passwordInput.value;

		// Clear previous messages
		messageDiv.textContent = "";
		messageDiv.style.color = "";

		if (!sourceName) {
			this.showMessage("login-message", "Please enter a source name", "red");
			sourceNameInput.focus();
			return;
		}

		if (!password) {
			this.showMessage("login-message", "Please enter a password", "red");
			passwordInput.focus();
			return;
		}

		try {
			this.showMessage("login-message", "Logging in...", "blue");

			const isValid = await SourcePasswordManager.validatePassword(sourceName, password);

			if (isValid) {
				// Cache the password if valid
				SourcePasswordManager.cachePassword(sourceName, password);
				this.updateCachedSourcesList();

				// Clear form
				sourceNameInput.value = "";
				passwordInput.value = "";

				this.showMessage("login-message", `Successfully logged in to source "${sourceName}"!`, "green");
			} else {
				this.showMessage("login-message", "Login failed. Invalid source name or password.", "red");
			}
		} catch (e) {
			console.error("Error logging in to source:", e);
			this.showMessage("login-message", `Login error: ${e.message}`, "red");
		}
	}

	async testSourceAccess () {
		const sourceNameInput = document.getElementById("test-source-name");
		const passwordInput = document.getElementById("test-source-password");
		const messageDiv = document.getElementById("test-message");

		const sourceName = sourceNameInput.value.trim().toLocaleString();
		const password = passwordInput.value;

		// Clear previous messages
		messageDiv.textContent = "";
		messageDiv.style.color = "";

		if (!sourceName) {
			this.showMessage("test-message", "Please enter a source name", "red");
			sourceNameInput.focus();
			return;
		}

		if (!password) {
			this.showMessage("test-message", "Please enter a password", "red");
			passwordInput.focus();
			return;
		}

		try {
			this.showMessage("test-message", "Testing access...", "blue");

			const isValid = await SourcePasswordManager.validatePassword(sourceName, password);

			if (isValid) {
				// Do NOT cache the password for testing - this is just verification
				this.showMessage("test-message", `Access test successful for source "${sourceName}" (credentials not cached)`, "green");
			} else {
				this.showMessage("test-message", "Access denied. Invalid source name or password.", "red");
			}
		} catch (e) {
			console.error("Error testing source access:", e);
			this.showMessage("test-message", `Error testing access: ${e.message}`, "red");
		}
	}

	updateCachedSourcesList () {
		const listDiv = document.getElementById("cached-sources-list");
		const sourceInput = document.getElementById("character-source-input");
		const sourceList = document.getElementById("character-source-list");
		const generateBtn = document.getElementById("generate-random-character");
		const cachedPasswords = SourcePasswordManager.getCachedPasswords();
		const sourceNames = Object.keys(cachedPasswords);

		// Update the cached sources display
		if (sourceNames.length === 0) {
			listDiv.innerHTML = "<p class=\"text-muted\"><em>No accounts found</em></p>";
		} else {
			let html = "<div class=\"list-group\">";
			sourceNames.forEach(sourceName => {
				html += `
					<div class="list-group-item d-flex justify-content-between align-items-center flex-column">
						<div>
								<strong>${this.escapeHtml(sourceName)}</strong>
						</div>
						<div>
								<button class="ve-btn ve-btn-xs ve-btn-danger" onclick="sourceManager.removeCachedSource('${this.escapeHtml(sourceName)}')">
									Logout
								</button>
								<a class="ve-btn ve-btn-xs ve-btn-primary" href="charactereditor.html?level=0&source=${encodeURIComponent(sourceName)}" style="margin-left:8px;">Create Character</a>
						</div>
					</div>
				`;
			});
			html += "</div>";
			listDiv.innerHTML = html;
		}

		// Update character source input/datalist
		if (sourceInput && sourceList) {
			// Clear existing datalist
			sourceList.innerHTML = "";
			if (sourceNames.length === 0) {
				sourceInput.value = "";
				if (generateBtn) generateBtn.disabled = true;
			} else {
				// Populate datalist and set the input to the first cached source
				sourceNames.forEach(sourceName => {
					const option = document.createElement("option");
					option.value = sourceName;
					sourceList.appendChild(option);
				});
				// Default to first source
				sourceInput.value = sourceNames[0];
				if (generateBtn) generateBtn.disabled = false;
			}
		}
	}

	createCharacterForSource (sourceName) {
		// Navigate to the character editor for creating a new character.
		// Use level=0 and pass only the source; the editor will manage all form defaults.
		window.location.href = `charactereditor.html?level=0&source=${encodeURIComponent(sourceName)}`;
	}

	removeCachedSource (sourceName) {
		if (confirm(`Remove cached password for source "${sourceName}"?`)) {
			SourcePasswordManager.removeCachedPassword(sourceName);
			this.updateCachedSourcesList();
		}
	}

	showMessage (elementId, message, color) {
		const element = document.getElementById(elementId);
		element.textContent = message;
		element.style.color = color;

		// Auto-clear success messages after 5 seconds
		if (color === "green") {
			setTimeout(() => {
				if (element.textContent === message) {
					element.textContent = "";
					element.style.color = "";
				}
			}, 5000);
		}
	}

			// Character generation UI removed; per-source Create Character links are used instead.

	escapeHtml (unsafe) {
		return unsafe
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}
}

// Initialize the source manager when the page loads
let sourceManager;

window.addEventListener("load", () => {
	sourceManager = new SourceManager();
	// Make sourceManager available globally immediately
	window.sourceManager = sourceManager;
});

// Export for global access
window.SourcePasswordManager = SourcePasswordManager;
