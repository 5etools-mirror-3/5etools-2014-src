// User Authentication Page - User registration and login system
"use strict";

// API configuration - pointing to new Cloudflare backend
let API_BASE_URL = "https://5etools-character-sync.thesamueljim.workers.dev/api";

class UserAuthManager {
	static SESSION_TOKEN_KEY = "sessionToken";
	static USER_DATA_KEY = "currentUser";

	// Get current session token
	static getSessionToken () {
		try {
			return localStorage.getItem(this.SESSION_TOKEN_KEY);
		} catch (e) {
			console.error("Error loading session token:", e);
			return null;
		}
	}

	// Set session token
	static setSessionToken (token) {
		try {
			if (token) {
				localStorage.setItem(this.SESSION_TOKEN_KEY, token);
			} else {
				localStorage.removeItem(this.SESSION_TOKEN_KEY);
			}
			return true;
		} catch (e) {
			console.error("Error saving session token:", e);
			return false;
		}
	}

	// Get current user data
	static getCurrentUser () {
		try {
			const stored = localStorage.getItem(this.USER_DATA_KEY);
			return stored ? JSON.parse(stored) : null;
		} catch (e) {
			console.error("Error loading user data:", e);
			return null;
		}
	}

	// Set current user data
	static setCurrentUser (user) {
		try {
			if (user) {
				localStorage.setItem(this.USER_DATA_KEY, JSON.stringify(user));
			} else {
				localStorage.removeItem(this.USER_DATA_KEY);
			}
			return true;
		} catch (e) {
			console.error("Error saving user data:", e);
			return false;
		}
	}

	// Check if user is currently logged in
	static isLoggedIn () {
		return !!(this.getSessionToken() && this.getCurrentUser());
	}

	// Register new user
	static async register (username, email, password) {
		try {
			const response = await fetch(`${API_BASE_URL}/auth/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, email, password }),
			});

			const result = await response.json();
			if (result.success) {
				const sessionToken = response.headers.get("X-Session-Token");
				if (sessionToken) {
					this.setSessionToken(sessionToken);
					this.setCurrentUser(result.user);
				}
				return { success: true, user: result.user };
			} else {
				return { success: false, error: result.error };
			}
		} catch (e) {
			console.error("Error registering user:", e);
			return { success: false, error: e.message };
		}
	}

	// Login user
	static async login (username, password) {
		try {
			const response = await fetch(`${API_BASE_URL}/auth/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});

			const result = await response.json();
			if (result.success) {
				const sessionToken = response.headers.get("X-Session-Token");
				if (sessionToken) {
					this.setSessionToken(sessionToken);
					this.setCurrentUser(result.user);
				}
				return { success: true, user: result.user };
			} else {
				return { success: false, error: result.error };
			}
		} catch (e) {
			console.error("Error logging in:", e);
			return { success: false, error: e.message };
		}
	}

	// Logout user
	static async logout () {
		try {
			const sessionToken = this.getSessionToken();
			if (sessionToken) {
				// Try to logout on server
				await fetch(`${API_BASE_URL}/auth/logout`, {
					method: "POST",
					headers: { "X-Session-Token": sessionToken },
				});
			}
		} catch (e) {
			console.warn("Server logout failed (proceeding with local logout):", e);
		}

		// Always clear local session
		this.setSessionToken(null);
		this.setCurrentUser(null);
		return true;
	}

	// Get user info from server
	static async getUserInfo () {
		try {
			const sessionToken = this.getSessionToken();
			if (!sessionToken) return { success: false, error: "Not logged in" };

			const response = await fetch(`${API_BASE_URL}/auth/me`, {
				headers: { "X-Session-Token": sessionToken },
			});

			const result = await response.json();
			if (result.success) {
				this.setCurrentUser(result.user);
				return { success: true, user: result.user };
			} else {
				// Session expired, clear local data
				this.setSessionToken(null);
				this.setCurrentUser(null);
				return { success: false, error: result.error };
			}
		} catch (e) {
			console.error("Error getting user info:", e);
			return { success: false, error: e.message };
		}
	}
}

// User Management Page Controller
class UserManager {
	constructor () {
		this.init();
	}

	init () {
		this.setupEventListeners();
		// Check if already logged in
		setTimeout(() => this.checkLoginStatus(), 0);
	}

	setupEventListeners () {
		// Register button
		document.getElementById("create-source-btn").addEventListener("click", () => {
			this.register();
		});

		// Login button
		document.getElementById("login-source-btn").addEventListener("click", () => {
			this.login();
		});

		// Enter key support for inputs
		document.getElementById("new-source-name").addEventListener("keypress", (e) => {
			if (e.key === "Enter") this.register();
		});

		document.getElementById("confirm-source-password").addEventListener("keypress", (e) => {
			if (e.key === "Enter") this.register();
		});

		document.getElementById("login-source-password").addEventListener("keypress", (e) => {
			if (e.key === "Enter") this.login();
		});
	}

	async register () {
		const usernameInput = document.getElementById("new-source-name");
		const passwordInput = document.getElementById("new-source-password");
		const confirmPasswordInput = document.getElementById("confirm-source-password");
		const messageDiv = document.getElementById("create-message");

		const username = usernameInput.value.trim();
		const password = passwordInput.value;
		const confirmPassword = confirmPasswordInput.value;

		// Clear previous messages
		messageDiv.textContent = "";
		messageDiv.style.color = "";

		// Validation
		if (!username) {
			this.showMessage("create-message", "Please enter a username", "red");
			usernameInput.focus();
			return;
		}

		if (username.length < 3) {
			this.showMessage("create-message", "Username must be at least 3 characters long", "red");
			usernameInput.focus();
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

		if (password.length < 6) {
			this.showMessage("create-message", "Password must be at least 6 characters long", "red");
			passwordInput.focus();
			return;
		}

		try {
			this.showMessage("create-message", "Creating account...", "blue");

			// Use a dummy email since the API requires it
			const email = `${username}@example.com`;
			const result = await UserAuthManager.register(username, email, password);

			if (result.success) {
				// Clear form
				usernameInput.value = "";
				passwordInput.value = "";
				confirmPasswordInput.value = "";

				// Update login status
				this.updateLoginStatus();

				this.showMessage("create-message", `Account "${username}" created successfully!`, "green");
			} else {
				this.showMessage("create-message", result.error || "Failed to create account.", "red");
			}
		} catch (e) {
			console.error("Error creating account:", e);
			this.showMessage("create-message", `Error creating account: ${e.message}`, "red");
		}
	}

	async login () {
		const usernameInput = document.getElementById("login-source-name");
		const passwordInput = document.getElementById("login-source-password");
		const messageDiv = document.getElementById("login-message");

		const username = usernameInput.value.trim();
		const password = passwordInput.value;

		// Clear previous messages
		messageDiv.textContent = "";
		messageDiv.style.color = "";

		if (!username) {
			this.showMessage("login-message", "Please enter a username", "red");
			usernameInput.focus();
			return;
		}

		if (!password) {
			this.showMessage("login-message", "Please enter a password", "red");
			passwordInput.focus();
			return;
		}

		try {
			this.showMessage("login-message", "Logging in...", "blue");

			const result = await UserAuthManager.login(username, password);

			if (result.success) {
				// Clear form
				usernameInput.value = "";
				passwordInput.value = "";

				// Update login status
				this.updateLoginStatus();

				this.showMessage("login-message", `Welcome back, ${result.user.username}!`, "green");
			} else {
				this.showMessage("login-message", result.error || "Login failed.", "red");
			}
		} catch (e) {
			console.error("Error logging in:", e);
			this.showMessage("login-message", `Login error: ${e.message}`, "red");
		}
	}

	async checkLoginStatus () {
		if (UserAuthManager.isLoggedIn()) {
			// Verify session with server
			const result = await UserAuthManager.getUserInfo();
			if (result.success) {
				this.updateLoginStatus();
			} else {
				// Session expired or invalid
				this.updateLoginStatus();
			}
		} else {
			this.updateLoginStatus();
		}
	}

	updateLoginStatus () {
		const listDiv = document.getElementById("cached-sources-list");
		const currentUser = UserAuthManager.getCurrentUser();

		if (currentUser) {
			// User is logged in
			listDiv.innerHTML = `
				<div class="list-group">
					<div class="list-group-item d-flex justify-content-between align-items-center">
						<div>
							<strong>${this.escapeHtml(currentUser.username)}</strong>
							<small class="text-muted d-block">Logged in</small>
						</div>
						<div>
							<button class="ve-btn ve-btn-xs ve-btn-danger" onclick="userManager.logout()">
								Logout
							</button>
							<a class="ve-btn ve-btn-xs ve-btn-primary" href="charactereditor.html?level=0&source=${encodeURIComponent(currentUser.username)}" style="margin-left:8px;">Create Character</a>
						</div>
					</div>
				</div>
			`;
		} else {
			// User is not logged in
			listDiv.innerHTML = "<p class=\"text-muted\"><em>Please log in or create an account to manage characters</em></p>";
		}
	}

	async logout () {
		const result = await UserAuthManager.logout();
		this.updateLoginStatus();
		this.showMessage("login-message", "Logged out successfully", "green");
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

// Initialize the user manager when the page loads
let userManager;

window.addEventListener("load", () => {
	userManager = new UserManager();
	// Make userManager available globally immediately
	window.userManager = userManager;
});

// Export for global access
window.UserAuthManager = UserAuthManager;
