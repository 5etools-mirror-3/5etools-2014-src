/**
 * Centralized Character Manager - Single Source of Truth for Character Data
 * Integrates with 5etools DataLoader system to prevent character duplication
 */

/*
 * Cloudflare Real-time Character Sync
 * - Connects all users to a shared session via Cloudflare SFU
 * - Automatically broadcasts character updates to all connected users
 * - No WebRTC complexity - just works across all devices and networks
 * - Uses SFU_APP_ID and SFU_APP_TOKEN environment variables
 *
 * Usage:
 *  CharacterP2P.init(); // Automatically connects to Cloudflare session
 *  // Character updates are automatically broadcast to all users
 */
let API_BASE_URL = "https://5etools-character-sync.thesamueljim.workers.dev/api";

class CharacterP2P {
	static _ws = null;
	static _pc = null; // RTCPeerConnection for WebRTC
	static _dc = null; // RTCDataChannel for messaging
	static _sessionId = null;
	static clientId = Math.random().toString(36).slice(2, 10);
	static _onOpen = [];
	static _connectionState = "disconnected"; // disconnected, connecting, connected
	static _reconnectAttempts = 0;
	static _reconnectTimer = null;
	static _maxReconnectAttempts = 5;
	static _connectedUsers = new Set();
	static _heartbeatInterval = null;

	/**
	 * Setup BroadcastChannel for tab-to-tab signaling
	 */
	static _setupBroadcastChannel () {
		if (!this._broadcastChannel) {
			this._broadcastChannel = new BroadcastChannel("character-p2p-signaling");
			this._broadcastChannel.onmessage = (event) => this._handleSignalingMessage(event.data);
		}
	}

	/**
	 * Handle signaling messages from other tabs
	 */
	static _handleSignalingMessage (message) {
		if (message.clientId === this.clientId) {
			// Ignore messages from self
			return;
		}

		switch (message.type) {
			case "PEER_DISCOVERY":
				this._handlePeerDiscovery(message);
				break;
			case "OFFER":
				this._handleIncomingOffer(message);
				break;
			case "ANSWER":
				this._handleIncomingAnswer(message);
				break;
			case "ICE_CANDIDATE":
				this._handleIncomingIceCandidate(message);
				break;
			default:
				console.debug("CharacterP2P: Unknown signaling message type:", message.type);
		}
	}

	/**
	 * Start automatic peer discovery (local tabs + local network)
	 */
	static _startAutoDiscovery () {
		if (this._autoDiscoveryInterval) {
			return;
		}

		this._setupBroadcastChannel();

		// Send initial discovery message for local tabs
		this._sendDiscoveryMessage();

		// Start local network discovery
		this._startLocalNetworkDiscovery();

		// Set up periodic discovery messages
		this._autoDiscoveryInterval = setInterval(() => {
			if (this._connectionState === "disconnected") {
				this._sendDiscoveryMessage();
				this._attemptLocalNetworkConnections();
				this._checkLocalNetworkMessages(); // Check for local network signaling
			}
		}, this._autoDiscoveryTimeout);
	}

	/**
	 * Stop automatic peer discovery
	 */
	static _stopAutoDiscovery () {
		if (this._autoDiscoveryInterval) {
			clearInterval(this._autoDiscoveryInterval);
			this._autoDiscoveryInterval = null;
		}
	}

	/**
	 * Send discovery message to other tabs and register for cross-machine signaling
	 */
	static _sendDiscoveryMessage () {
		// Send to local tabs via BroadcastChannel
		if (this._broadcastChannel) {
			this._broadcastChannel.postMessage({
				type: "PEER_DISCOVERY",
				clientId: this.clientId,
				connectionState: this._connectionState,
				timestamp: Date.now(),
			});
		}

		// Also register for cross-machine signaling (non-blocking)
		this._registerForSignaling().catch(() => {});
	}

	/**
	 * Get cached WebRTC credentials from localStorage
	 * @returns {Object|null} Cached credentials or null if expired/not found
	 */
	static _getCachedCredentials () {
		try {
			const cached = localStorage.getItem(this._CREDENTIALS_CACHE_KEY);
			if (!cached) {
				return null;
			}

			const data = JSON.parse(cached);
			const now = Date.now();

			// Check if credentials are still valid
			if (now - data.timestamp > this._CREDENTIALS_CACHE_TTL) {
				localStorage.removeItem(this._CREDENTIALS_CACHE_KEY);
				return null;
			}

			return data.credentials;
		} catch (error) {
			console.warn("CharacterP2P: Error reading cached credentials:", error);
			localStorage.removeItem(this._CREDENTIALS_CACHE_KEY);
			return null;
		}
	}

	/**
	 * Cache WebRTC credentials in localStorage
	 * @param {Object} credentials - The credentials object to cache
	 */
	static _cacheCredentials (credentials) {
		try {
			const cacheData = {
				credentials: credentials,
				timestamp: Date.now(),
			};

			localStorage.setItem(this._CREDENTIALS_CACHE_KEY, JSON.stringify(cacheData));
		} catch (error) {
			console.warn("CharacterP2P: Failed to cache credentials:", error);
		}
	}

	/**
	 * Clear cached WebRTC credentials
	 */
	static _clearCachedCredentials () {
		try {
			localStorage.removeItem(this._CREDENTIALS_CACHE_KEY);
		} catch (error) {
			console.warn("CharacterP2P: Error clearing cached credentials:", error);
		}
	}

	/**
	 * Start local network discovery using browser-based techniques
	 */
	static _startLocalNetworkDiscovery () {
		// Use localStorage as a cross-origin local network signal
		// This works when multiple devices access the same local server
		this._registerLocalNetworkPresence();

		// Set up WebRTC-based local network scanning
		this._setupLocalNetworkScanning();
	}

	/**
	 * Register our presence for local network discovery
	 */
	static _registerLocalNetworkPresence () {
		try {
			const networkPeers = JSON.parse(localStorage.getItem("character_p2p_local_peers") || "[]");

			// Add or update our entry
			const ourEntry = {
				clientId: this.clientId,
				timestamp: Date.now(),
				userAgent: navigator.userAgent.substring(0, 100), // For identification
				connectionState: this._connectionState,
			};

			// Remove old entries (older than 30 seconds) and our old entries
			const cutoff = Date.now() - 30000;
			const cleanedPeers = networkPeers.filter(peer =>
				peer.timestamp > cutoff && peer.clientId !== this.clientId,
			);

			// Add our current entry
			cleanedPeers.push(ourEntry);

			localStorage.setItem("character_p2p_local_peers", JSON.stringify(cleanedPeers));
		} catch (error) {
			console.debug("CharacterP2P: Local network presence registration failed:", error.message);
		}
	}

	/**
	 * Set up WebRTC-based local network scanning
	 */
	static _setupLocalNetworkScanning () {
		// This creates temporary peer connections to discover local network interfaces
		// and helps WebRTC understand the local network topology
		try {
			const tempPc = new RTCPeerConnection({
				iceServers: [
					{ urls: "stun:stun.l.google.com:19302" }, // Basic STUN for local discovery
				],
			});

			// Create a temporary data channel to trigger ICE gathering
			const tempDc = tempPc.createDataChannel("discovery", { ordered: false });

			tempPc.onicecandidate = (event) => {
				if (event.candidate) {
					const candidate = event.candidate;
					// Log local network candidates for debugging
					if (candidate.candidate.includes("typ host")) {
						console.debug("CharacterP2P: Found local network interface:",
							candidate.candidate.split(" ")[4], // IP address
							candidate.candidate.split(" ")[5], // Port
						);
					}
				}
			};

			// Create offer to start ICE gathering
			tempPc.createOffer().then(offer => {
				return tempPc.setLocalDescription(offer);
			}).then(() => {
				// Clean up after 5 seconds
				setTimeout(() => {
					tempPc.close();
				}, 5000);
			}).catch(error => {
				console.debug("CharacterP2P: Local network scanning failed:", error.message);
				tempPc.close();
			});
		} catch (error) {
			console.debug("CharacterP2P: WebRTC local network scanning not available:", error.message);
		}
	}

	/**
	 * Attempt to connect to local network peers
	 */
	static _attemptLocalNetworkConnections () {
		try {
			// Update our presence
			this._registerLocalNetworkPresence();

			// Check for other local peers
			const networkPeers = JSON.parse(localStorage.getItem("character_p2p_local_peers") || "[]");
			const availablePeers = networkPeers.filter(peer =>
				peer.clientId !== this.clientId
				&& peer.connectionState === "disconnected"
				&& !this._knownPeers.has(peer.clientId),
			);

			if (availablePeers.length > 0) {
				// Try to connect to peers (use clientId comparison to avoid duplicate connections)
				for (const peer of availablePeers) {
					if (this.clientId > peer.clientId) {
						this._knownPeers.add(peer.clientId);

						// Create connection using localStorage signaling
						this._connectionState = "connecting";
						this._isInitiator = true;
						this._createLocalNetworkOffer(peer.clientId);
					}
				}
			}
		} catch (error) {
			console.debug("CharacterP2P: Local network connection attempt failed:", error.message);
		}
	}

	/**
	 * Create and send offer for local network connection using localStorage signaling
	 */
	static async _createLocalNetworkOffer (targetClientId) {
		try {
			if (!this._pc) {
				await this.init();
			}

			// Create data channel (we're the initiator)
			const dc = this._pc.createDataChannel("character-sync", {
				ordered: true,
				maxRetransmits: 3,
			});
			this._setupDataChannel(dc);

			const offer = await this._pc.createOffer();
			await this._pc.setLocalDescription(offer);

			// Wait for ICE candidates to be gathered
			await new Promise(resolve => {
				if (this._pc.iceGatheringState === "complete") {
					resolve();
				} else {
					const timeout = setTimeout(resolve, 3000); // Wait up to 3 seconds
					const onicechange = () => {
						if (this._pc.iceGatheringState === "complete") {
							clearTimeout(timeout);
							this._pc.removeEventListener("icegatheringstatechange", onicechange);
							resolve();
						}
					};
					this._pc.addEventListener("icegatheringstatechange", onicechange);
				}
			});

			// Store offer in localStorage for target peer to find
			const offerMessage = {
				type: "OFFER",
				from: this.clientId,
				to: targetClientId,
				offer: this._pc.localDescription,
				timestamp: Date.now(),
				id: `offer_${this.clientId}_${targetClientId}_${Date.now()}`,
			};

			this._storeLocalNetworkMessage(offerMessage);
		} catch (error) {
			console.error("CharacterP2P: Error creating local network offer:", error);
			this._connectionState = "disconnected";
		}
	}

	/**
	 * Store signaling message in localStorage for local network peers
	 */
	static _storeLocalNetworkMessage (message) {
		try {
			const messages = JSON.parse(localStorage.getItem("character_p2p_local_messages") || "[]");

			// Clean old messages (older than 1 minute)
			const cutoff = Date.now() - 60000;
			const cleanMessages = messages.filter(msg => msg.timestamp > cutoff);

			// Add new message
			cleanMessages.push(message);

			localStorage.setItem("character_p2p_local_messages", JSON.stringify(cleanMessages));
		} catch (error) {
			console.debug("CharacterP2P: Failed to store local network message:", error.message);
		}
	}

	/**
	 * Check for local network signaling messages addressed to us
	 */
	static _checkLocalNetworkMessages () {
		try {
			const messages = JSON.parse(localStorage.getItem("character_p2p_local_messages") || "[]");
			const ourMessages = messages.filter(msg => msg.to === this.clientId && msg.from !== this.clientId);

			for (const message of ourMessages) {
				// Process message and then remove it
				this._handleLocalNetworkMessage(message);
				this._removeLocalNetworkMessage(message.id);
			}
		} catch (error) {
			console.debug("CharacterP2P: Failed to check local network messages:", error.message);
		}
	}

	/**
	 * Remove processed message from localStorage
	 */
	static _removeLocalNetworkMessage (messageId) {
		try {
			const messages = JSON.parse(localStorage.getItem("character_p2p_local_messages") || "[]");
			const filteredMessages = messages.filter(msg => msg.id !== messageId);
			localStorage.setItem("character_p2p_local_messages", JSON.stringify(filteredMessages));
		} catch (error) {
			console.debug("CharacterP2P: Failed to remove local network message:", error.message);
		}
	}

	/**
	 * Handle local network signaling messages
	 */
	static async _handleLocalNetworkMessage (message) {
		try {
			switch (message.type) {
				case "OFFER":
					await this._handleLocalNetworkOffer(message);
					break;
				case "ANSWER":
					await this._handleLocalNetworkAnswer(message);
					break;
				case "ICE_CANDIDATE":
					await this._handleLocalNetworkIceCandidate(message);
					break;
			}
		} catch (error) {
			console.error("CharacterP2P: Error handling local network message:", error);
		}
	}

	/**
	 * Handle local network offer
	 */
	static async _handleLocalNetworkOffer (message) {
		if (this._connectionState !== "disconnected") {
			console.debug("CharacterP2P: Ignoring local network offer, already connecting/connected");
			return;
		}

		this._connectionState = "connecting";
		this._isInitiator = false;

		if (!this._pc) {
			await this.init();
		}

		// Set remote description
		await this._pc.setRemoteDescription(message.offer);

		// Create answer
		const answer = await this._pc.createAnswer();
		await this._pc.setLocalDescription(answer);

		// Wait for ICE candidates
		await new Promise(resolve => setTimeout(resolve, 500));

		// Send answer back via localStorage
		const answerMessage = {
			type: "ANSWER",
			from: this.clientId,
			to: message.from,
			answer: this._pc.localDescription,
			timestamp: Date.now(),
			id: `answer_${this.clientId}_${message.from}_${Date.now()}`,
		};

		this._storeLocalNetworkMessage(answerMessage);
	}

	/**
	 * Handle local network answer
	 */
	static async _handleLocalNetworkAnswer (message) {
		if (!this._pc) {
			console.error("CharacterP2P: No peer connection to handle local network answer");
			return;
		}

		await this._pc.setRemoteDescription(message.answer);
	}

	/**
	 * Handle local network ICE candidate
	 */
	static async _handleLocalNetworkIceCandidate (message) {
		if (!this._pc) {
			return;
		}

		await this._pc.addIceCandidate(message.candidate);
	}

	/**
 * Send ICE candidate via localStorage for local network connections
 */
	static _sendLocalNetworkIceCandidate (candidate, targetClientId = null) {
		try {
			const iceCandidateMessage = {
				type: "ICE_CANDIDATE",
				from: this.clientId,
				to: targetClientId || "broadcast", // Send to specific peer or broadcast
				candidate: candidate,
				timestamp: Date.now(),
				id: `ice_${this.clientId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
			};

			this._storeLocalNetworkMessage(iceCandidateMessage);
		} catch (error) {
			console.debug("CharacterP2P: Failed to send local network ICE candidate:", error.message);
		}
	}

	/**
	 * Handle peer discovery message from another tab
	 */
	static _handlePeerDiscovery (message) {
		this._knownPeers.add(message.clientId);

		// If both peers are disconnected and we haven't initiated a connection yet,
		// determine who should create the offer (use clientId comparison for consistency)
		if (this._connectionState === "disconnected"
			&& message.connectionState === "disconnected"
			&& this.clientId > message.clientId) { // Higher clientId initiates
			this._connectionState = "connecting";
			this._isInitiator = true;
			this._createAndSendOffer();
		}
	}

	/**
	 * Create and send offer automatically
	 */
	static async _createAndSendOffer () {
		try {
			if (!this._pc) {
				await this.init();
			}

			// Create data channel (we're the initiator)
			const dc = this._pc.createDataChannel("character-sync", {
				ordered: true,
				maxRetransmits: 3,
			});
			this._setupDataChannel(dc);

			const offer = await this._pc.createOffer();
			await this._pc.setLocalDescription(offer);

			// Wait for ICE candidates to be gathered
			await new Promise(resolve => {
				if (this._pc.iceGatheringState === "complete") {
					resolve();
				} else {
					const timeout = setTimeout(resolve, 1000);
					const onicechange = () => {
						if (this._pc.iceGatheringState === "complete") {
							clearTimeout(timeout);
							this._pc.removeEventListener("icegatheringstatechange", onicechange);
							resolve();
						}
					};
					this._pc.addEventListener("icegatheringstatechange", onicechange);
				}
			});

			// Send offer via BroadcastChannel
			if (this._broadcastChannel) {
				this._broadcastChannel.postMessage({
					type: "OFFER",
					clientId: this.clientId,
					offer: this._pc.localDescription,
					timestamp: Date.now(),
				});
			}
		} catch (error) {
			console.error("CharacterP2P: Error creating automatic offer:", error);
			this._connectionState = "disconnected";
		}
	}

	/**
	 * Handle incoming offer from another tab
	 */
	static async _handleIncomingOffer (message) {
		try {
			if (this._connectionState !== "disconnected") {
				console.debug("CharacterP2P: Ignoring offer, already connecting/connected");
				return;
			}

			this._connectionState = "connecting";
			this._isInitiator = false;

			if (!this._pc) {
				await this.init();
			}

			// Set remote description
			await this._pc.setRemoteDescription(message.offer);

			// Create answer
			const answer = await this._pc.createAnswer();
			await this._pc.setLocalDescription(answer);

			// Wait for ICE candidates
			await new Promise(resolve => setTimeout(resolve, 200));

			// Send answer back
			if (this._broadcastChannel) {
				this._broadcastChannel.postMessage({
					type: "ANSWER",
					clientId: this.clientId,
					targetClientId: message.clientId,
					answer: this._pc.localDescription,
					timestamp: Date.now(),
				});
			}
		} catch (error) {
			console.error("CharacterP2P: Error handling offer:", error);
			this._connectionState = "disconnected";
		}
	}

	/**
	 * Handle incoming answer from another tab
	 */
	static async _handleIncomingAnswer (message) {
		try {
			// Only handle answers meant for us
			if (message.targetClientId !== this.clientId) {
				return;
			}

			if (!this._pc) {
				console.error("CharacterP2P: No peer connection to handle answer");
				return;
			}

			await this._pc.setRemoteDescription(message.answer);
		} catch (error) {
			console.error("CharacterP2P: Error handling answer:", error);
			this._connectionState = "disconnected";
		}
	}

	/**
	 * Handle incoming ICE candidate from another tab
	 */
	static async _handleIncomingIceCandidate (message) {
		try {
			if (!this._pc) {
				return;
			}

			await this._pc.addIceCandidate(message.candidate);
			console.debug("CharacterP2P: Added ICE candidate from:", message.clientId);
		} catch (error) {
			console.debug("CharacterP2P: Error adding ICE candidate:", error);
		}
	}

	/**
	 * Initialize Cloudflare real-time connection for character sync.
	 * Connects to a shared session where all users can receive character updates.
	 */
	static async init () {
		// Prevent multiple simultaneous initialization attempts
		if (this._connectionState === "connecting") {
			return;
		}

		if (this._connectionState === "connected") {
			return;
		}

		try {
			// Connect to Cloudflare session
			await this._connectToCloudflare();
		} catch (error) {
			console.error("CharacterP2P: Failed to connect to Cloudflare:", error);
			this._scheduleReconnect();
		}

		// Auto-initialize character indexing site-wide. This triggers a background
		// load of character summaries so other pages can access basic character info
		// without requiring the user to visit `characters.html`. Uses lazy loading
		// architecture for better performance.
		(function () {
		    try {
		        // Run after a short delay to avoid delaying initial page rendering
		        setTimeout(() => {
		            try {
		                const CM = CharacterManager;
		                // Load character summaries in the background (lightweight)
		                // This populates the summary cache for lists/search without downloading full JSONs
		                if (!navigator.onLine) {
		                    // Offline: try to load any cached summaries
		                    CM.loadCharacterSummaries().catch(() => {});
		                } else {
		                    // Online: load fresh summaries in background
		                    CM.loadCharacterSummaries().catch(() => {});
		                }
		            } catch (e) {
		                console.warn("CharacterManager: Auto-init failed:", e);
		            }
		        }, 250);
		    } catch (e) {
		        /* swallow */
		    }
		})();
	}

	/**
	 * Connect to Cloudflare Workers WebSocket for cross-device real-time communication
	 */
	static async _connectToCloudflare () {
		this._connectionState = "connecting";

		try {
			// Replace with your actual Cloudflare Worker URL
			// Deploy the worker and update this URL
			const workerUrl = "wss://5etools-character-sync.thesamueljim.workers.dev";
			const wsUrl = `${workerUrl}?room=character-sync&userId=${this.clientId}`;

			// Create WebSocket connection to Cloudflare Worker
			this._ws = new WebSocket(wsUrl);

			this._ws.onopen = () => {
				this._connectionState = "connected";
				this._reconnectAttempts = 0;

				// Start heartbeat to keep connection alive
				this._startHeartbeat();

				// Reconcile local cache with server source of truth on (re)connect
				if (typeof CharacterManager !== "undefined") {
					CharacterManager.reconcileWithServer()
						.catch(err => console.warn("CharacterManager: Reconcile on open failed:", err));
				}

				// Notify listeners
				this._onOpen.forEach(fn => fn());
				this._onOpen = [];
			};

			this._ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					this._handleMessage(data);
				} catch (error) {
					console.warn("CharacterP2P: Failed to parse WebSocket message:", error);
				}
			};

			this._ws.onclose = (event) => {
				this._connectionState = "disconnected";
				this._scheduleReconnect();
			};

			this._ws.onerror = (error) => {
				console.error("CharacterP2P: WebSocket error:", error);
				this._connectionState = "disconnected";
			};
		} catch (error) {
			this._connectionState = "disconnected";
			throw error;
		}
	}

	/**
	 * Handle incoming messages from server (server-centric model)
	 */
	static _handleMessage (data) {
		switch (data.type) {
			// P2P user join/leave messages no longer used in server-centric model

			case "CHARACTER_UPDATED":
			case "CHARACTER_CREATED":
				if (typeof CharacterManager !== "undefined" && data.characterId) {
					CharacterManager._applyRemoteBroadcast(data)
						.catch(err => console.error("CharacterP2P: Failed to apply remote broadcast:", err));
				}
				break;

			case "CHARACTER_DELETED":
				// Server notifies us of character deletion - remove from local cache
				if (typeof CharacterManager !== "undefined" && data.characterId) {
					console.log(`CharacterP2P: Character ${data.characterId} deleted by server`);
					CharacterManager._markTombstone(data.characterName, data.username || null, data.characterId);
					CharacterManager.removeCharacter(data.characterId);
					CharacterManager._removeCharacterFromCache(data.characterId);
					if (data.characterName) {
						CharacterManager._purgeLocalByNameAndSource(data.characterName, data.username || null);
					}
					CharacterManager._clearSummariesCache();
					CharacterManager._notifyListeners();
				}
				break;

			case "CONNECTED":
				console.log(`CharacterP2P: Connected to character sync server`);
				// Reconcile is triggered from WebSocket onopen to avoid double-runs
				break;

			case "HEARTBEAT_ACK":
				// Server heartbeat acknowledgment, ignore
				break;

			default:
				console.debug("CharacterP2P: Unknown message type:", data.type, data);
		}
	}

	/**
	 * Update UI components when a character is updated via WebSocket
	 * @param {Object} updatedCharacter - The updated character data
	 * @param {string} characterId - The character ID
	 */
	static _updateUIComponentsWithCharacter (updatedCharacter, characterId) {
		// Skip character editor updates - user should manually refresh if needed
		if (window.location.pathname.includes("charactereditor.html")) {
			console.log(`CharacterP2P: ⏭️ Skipping character editor update - user is editing manually`);
			// Character editor gets no automatic updates to avoid interrupting manual editing
			// User can use the refresh button if they want to see updates
		}

		// Update characters.html page if currently displaying this character
		if (window.location.pathname.includes("characters.html")) {
			try {
				if (typeof window.charactersPage !== "undefined" && window.charactersPage._currentCharacter) {
					if (window.charactersPage._currentCharacter.id === characterId) {
						// Update the current character reference and re-render
						window.charactersPage._currentCharacter = updatedCharacter;
						window.charactersPage._renderStats_doBuildStatsTab({ent: updatedCharacter});
						console.log(`CharacterP2P: ✅ Updated displayed character ${updatedCharacter.name} in characters page`);
					}
				}
			} catch (e) {
				console.warn("Failed to update characters page display:", e);
			}
		}

		// Update any other pages/components that might display characters
		try {
			// Dispatch a global event that any component can listen to
			if (typeof window.dispatchEvent === "function") {
				window.dispatchEvent(new CustomEvent("characterUpdatedGlobally", {
					detail: {
						character: updatedCharacter,
						characterId: characterId,
						updateType: "websocket_broadcast_with_data",
					},
				}));
			}
		} catch (e) {
			console.warn("Failed to dispatch global character update event:", e);
		}
	}

	/**
	 * Send a message to all users via data channel
	 */
	static _sendMessage (data) {
		if (this._ws && this._ws.readyState === WebSocket.OPEN) {
			const message = {
				...data,
				userId: this.clientId,
				timestamp: Date.now(),
			};

			try {
				this._ws.send(JSON.stringify(message));
				return true;
			} catch (error) {
				console.warn("CharacterP2P: Failed to send message via WebSocket:", error);
			}
		} else {
			console.warn("CharacterP2P: Cannot send message, WebSocket not open. State:", this._ws ? this._ws.readyState : "null");
		}
		return false;
	}

	/**
	 * Start heartbeat to keep connection alive
	 */
	static _startHeartbeat () {
		this._heartbeatInterval = setInterval(() => {
			this._sendMessage({ type: "HEARTBEAT" });
		}, 30000); // Every 30 seconds
	}

	/**
	 * Stop heartbeat
	 */
	static _stopHeartbeat () {
		if (this._heartbeatInterval) {
			clearInterval(this._heartbeatInterval);
			this._heartbeatInterval = null;
		}
	}

	/**
	 * Schedule reconnection attempt
	 */
	static _scheduleReconnect () {
		if (this._reconnectTimer) {
			return;
		}

		if (this._reconnectAttempts >= this._maxReconnectAttempts) {
			console.error("CharacterP2P: Max reconnection attempts reached");
			return;
		}

		this._reconnectAttempts++;
		const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 30000);

		this._reconnectTimer = setTimeout(() => {
			this._reconnectTimer = null;
			this.init();
		}, delay);
	}

	/**
	 * Send character update notifications (server-centric model)
	 * Note: In server-centric model, we don't broadcast client-to-client
	 * Instead, the server API handles sync and sends updates via WebSocket
	 */
	static send (data) {
		// In server-centric model, we don't send client updates directly
		// The server API will handle character saves and broadcast updates
		console.log(`CharacterP2P: Server-centric sync - ${data.type} will be handled by server`);
		return true; // Always return true since server handles sync
	}

	/**
	 * Register callback for when connection is established
	 */
	static onOpen (callback) {
		if (this._connectionState === "connected") {
			callback();
		} else {
			this._onOpen.push(callback);
		}
	}

	/**
	 * Get connection status
	 */
	static getStatus () {
		return {
			clientId: this.clientId,
			connectionState: this._connectionState,
			sessionId: this._sessionId,
			connectedUsers: this._connectedUsers.size,
			reconnectAttempts: this._reconnectAttempts,
		};
	}

	/**
	 * Cleanup connection
	 */
	static cleanup () {
		// Send leave message before disconnecting
		if (this._connectionState === "connected") {
			this._sendMessage({
				type: "USER_LEFT",
				userId: this.clientId,
			});
		}

		// Clean up WebSocket connection
		if (this._ws) {
			this._ws.close();
			this._ws = null;
		}

		// Clean up any WebRTC components (if they exist)
		if (this._dc) {
			this._dc.close();
			this._dc = null;
		}

		if (this._pc) {
			this._pc.close();
			this._pc = null;
		}

		this._stopHeartbeat();

		if (this._reconnectTimer) {
			clearTimeout(this._reconnectTimer);
			this._reconnectTimer = null;
		}

		this._connectionState = "disconnected";
		this._connectedUsers.clear();
		this._reconnectAttempts = 0;
	}
}

// Expose globally for backward compatibility
globalThis.CharacterP2P = CharacterP2P;

// Debugging helpers
globalThis.p2pStatus = () => CharacterP2P.getStatus();
globalThis.p2pInit = () => CharacterP2P.init();

// Auto-initialization in browser environment
try {
	if (typeof document !== "undefined" && typeof window !== "undefined") {
		// Initialize P2P connection after a short delay
		setTimeout(() => {
			try {
				const CM = window["CharacterManager"];
				if (CM && typeof CM.p2pInit === "function") {
					try {
						CharacterP2P.init();
					} catch (e) {
					}
				}
			} catch (e) {
			}
		}, 500);
	}
} catch (e) {
	// ignore in non-browser contexts
}

class CharacterManager {
	static _instance = null;
	static _characters = new Map(); // Map<id, character> for fast lookups
	static _charactersArray = []; // Array for list operations
	static _isLoaded = false;
	static _isLoading = false;
	static _loadPromise = null;
	static _listeners = new Set();
	static _refreshInterval = null;
	static _blobCache = new Map(); // Map<id, {blob, character, lastFetched}> for caching with timestamps
	static _freshnessThreshold = 10 * 60 * 1000; // 10 minutes in milliseconds (localStorage staleness threshold)
	// If localStorage JSON for a character is newer than this, avoid re-fetching the
	// character blob on page load to reduce unnecessary network calls.
	static _LOCAL_JSON_FRESH_MS = 1 * 60 * 1000; // 1 minute
	static _STORAGE_KEY = "VeTool_CharacterManager_Cache";
	// Client-side cache for character summaries (lightweight data for lists/search)
	static _SUMMARIES_CACHE_KEY = "VeTool_CharacterManager_Summaries";
	// Client-side cache for the blob list (metadata returned by /api/characters/load)
	static _LIST_CACHE_KEY = "VeTool_CharacterManager_ListCache";
	static _LAST_BLOBS_FETCH_TS_KEY = "VeTool_CharacterManager_LastBlobFetchTs";
	static _SUMMARIES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours for summaries

	static _getLastBlobsFetchTs () {
		try {
			const raw = localStorage.getItem(this._LAST_BLOBS_FETCH_TS_KEY);
			if (!raw) return 0;
			return Number(raw) || 0;
		} catch (e) { return 0; }
	}

	static _setLastBlobsFetchTs (ts) {
		try { localStorage.setItem(this._LAST_BLOBS_FETCH_TS_KEY, String(ts)); } catch (e) { /* ignore */ }
	}

	/**
	 * Extract character summary from full character data
	 * @param {Object} character - Full character object
	 * @returns {Object} Character summary with essential fields
	 */
	static _extractCharacterSummary (character) {
		if (!character || !character.name) return null;

		// If character has already been processed for display, use those fields
		// Otherwise, fallback to raw extraction
		const characterClass = character._fClass || this._extractClassFromRaw(character);
		const characterRace = character._fRace || this._extractRaceFromRaw(character);
		const characterLevel = character._fLevel || this._extractLevelFromRaw(character);
		const characterBackground = character._fBackground || this._extractBackgroundFromRaw(character);

		return {
			id: character.id || this._generateCompositeId(character.name, character.source),
			name: character.name,
			source: character.source || "Unknown",
			_fClass: characterClass,
			_fRace: characterRace,
			_fLevel: characterLevel,
			_fBackground: characterBackground,
			updatedAt: character._serverUpdatedAt || character._lastModified || character._localVersion || Date.now(),
			_serverUpdatedAt: character._serverUpdatedAt || null,
			_isLocallyModified: character._isLocallyModified || false,
		};
	}

	/**
	 * Helper methods for extracting data from raw character objects
	 */
	static _extractClassFromRaw (character) {
		if (!character.class) return "Unknown";

		if (Array.isArray(character.class) && character.class.length > 0) {
			// Find highest level class or first class
			const primaryClass = character.class.reduce((prev, current) => {
				return (current.level || 1) > (prev.level || 1) ? current : prev;
			}, character.class[0]);
			return primaryClass.name || "Unknown";
		} else if (typeof character.class === "string") {
			return character.class;
		}

		return "Unknown";
	}

	static _extractRaceFromRaw (character) {
		if (!character.race) return "Unknown";

		if (typeof character.race === "string") {
			return character.race;
		} else if (character.race.name) {
			return character.race.name;
		}

		return "Unknown";
	}

	static _extractLevelFromRaw (character) {
		if (character.class && Array.isArray(character.class)) {
			return character.class.reduce((total, cls) => total + (cls.level || 1), 0);
		} else if (character.level) {
			return character.level;
		}
		return 1; // Default level
	}

	static _extractBackgroundFromRaw (character) {
		if (!character.background) return null;

		if (typeof character.background === "string") {
			return character.background;
		} else if (character.background.name) {
			return character.background.name;
		}

		return null;
	}

	/**
	 * Load character summaries from localStorage cache
	 * @returns {Array} Array of cached character summaries
	 */
	static _loadSummariesFromCache () {
		try {
			const stored = localStorage.getItem(this._SUMMARIES_CACHE_KEY);
			if (!stored) return { summaries: [], timestamp: 0 };

			const data = JSON.parse(stored);
			if (!data || !Array.isArray(data.summaries)) return { summaries: [], timestamp: 0 };

			return {
				summaries: data.summaries,
				timestamp: data.timestamp || 0,
			};
		} catch (e) {
			console.warn("CharacterManager: Failed to load summaries from cache:", e);
			return { summaries: [], timestamp: 0 };
		}
	}

	/**
	 * Save character summaries to localStorage cache
	 * @param {Array} summaries - Array of character summaries to cache
	 */
	static _saveSummariesToCache (summaries) {
		try {
			const data = {
				summaries: summaries || [],
				timestamp: Date.now(),
			};
			localStorage.setItem(this._SUMMARIES_CACHE_KEY, JSON.stringify(data));
		} catch (e) {
			console.warn("CharacterManager: Failed to save summaries to cache:", e);
		}
	}

	/**
	 * Add or update a character in the summaries cache for immediate visibility
	 * @param {Object} character - Character to add/update in summaries cache
	 */
	static _addCharacterToSummariesCache (character) {
		try {
			if (!character || !character.name) {
				return;
			}

			// Extract character summary
			const summary = this._extractCharacterSummary(character);
			if (!summary) {
				return;
			}

			// Load existing summaries
			const { summaries } = this._loadSummariesFromCache();

			// Find existing summary and update or add new one
			const existingIndex = summaries.findIndex(s => s.id === summary.id);
			if (existingIndex >= 0) {
				// Update existing summary
				summaries[existingIndex] = summary;
			} else {
				// Add new summary
				summaries.push(summary);
			}

			// Save updated summaries
			this._saveSummariesToCache(summaries);

			console.log(`CharacterManager: Added/updated character ${character.name} in summaries cache`);
		} catch (e) {
			console.warn("CharacterManager: Failed to add character to summaries cache:", e);
		}
	}

	/**
	 * Clear summaries cache to force reload
	 */
	static _clearSummariesCache () {
		try {
			localStorage.removeItem(this._SUMMARIES_CACHE_KEY);
			console.log("CharacterManager: Summaries cache cleared");
		} catch (e) {
			console.warn("CharacterManager: Failed to clear summaries cache:", e);
		}
	}

	/**
	 * Remove character from all local caches
	 * @param {string} characterId - Character ID to remove
	 */
	static _removeCharacterFromCache (characterId) {
		try {
			// Remove from in-memory caches
			this._characters.delete(characterId);
			this._blobCache.delete(characterId);

			// Remove from array cache
			const arrayIndex = this._charactersArray.findIndex(c => c && c.id === characterId);
			if (arrayIndex >= 0) {
				this._charactersArray.splice(arrayIndex, 1);
			}

			// Remove from localStorage
			const stored = this._loadFromLocalStorage();
			const filtered = stored.filter(c => c && c.id !== characterId);
			this._saveToLocalStorage(filtered);

			// Remove from summary cache
			const { summaries } = this._loadSummariesFromCache();
			const filteredSummaries = summaries.filter(s => s.id !== characterId);
			this._saveSummariesToCache(filteredSummaries);

			// Notify listeners
			this._notifyListeners();

			console.log(`CharacterManager: Removed character ${characterId} from all caches`);
		} catch (e) {
			console.warn(`CharacterManager: Failed to remove character ${characterId} from cache:`, e);
		}
	}
	// Only refresh the `/characters/list` from server if the cached blob list
	// is older than 24 hours. We rely on WebSocket/P2P notifications for
	// near-real-time updates; use the 24h TTL to avoid excessive list fetches
	// on simple page navigations.
	static _LIST_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
	// Version tracking and offline sync
	static _offlineQueue = []; // Queue for changes made while offline
	static _OFFLINE_QUEUE_KEY = "VeTool_CharacterManager_OfflineQueue";
	static _listFetchInProgress = false; // Prevent concurrent forced list fetches
	static _suppressBackgroundChecksUntil = 0; // Timestamp to suppress background staleness checks
	static _conflictResolver = null; // Function to handle conflicts
	static _onlineListenerSet = false; // Flag to prevent duplicate listeners
	static _reconcileInProgress = false;
	static _TOMBSTONE_KEY = "VeTool_CharacterManager_Tombstones";
	static _TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

	/** Convert ISO string or epoch ms to comparable ms; 0 if unknown */
	static _toTimestampMs (value) {
		if (value == null || value === "") return 0;
		if (typeof value === "number" && Number.isFinite(value)) return value;
		const parsed = Date.parse(String(value));
		return Number.isFinite(parsed) ? parsed : 0;
	}

	/**
	 * Effective local edit/sync clock for LWW comparisons.
	 * Dirty locals prefer _lastModified; clean copies prefer _serverUpdatedAt.
	 */
	static _getLocalEffectiveTs (character) {
		if (!character) return 0;
		if (character._isLocallyModified) {
			return Math.max(
				this._toTimestampMs(character._lastModified),
				this._toTimestampMs(character._localVersion),
				this._toTimestampMs(character._serverUpdatedAt),
			);
		}
		return Math.max(
			this._toTimestampMs(character._serverUpdatedAt),
			this._toTimestampMs(character._lastModified),
			this._toTimestampMs(character._remoteVersion),
		);
	}

	/** Stamp server authoritative updated_at onto a character without inventing clocks */
	static _applyServerTimestamp (character, serverUpdatedAt) {
		if (!character || !serverUpdatedAt) return character;
		character._serverUpdatedAt = serverUpdatedAt;
		const ms = this._toTimestampMs(serverUpdatedAt);
		character._remoteVersion = ms;
		if (!character._isLocallyModified) {
			character._lastModified = ms;
		}
		return character;
	}

	/** Look up a character from memory or localStorage by id */
	static _getCachedCharacterById (id) {
		if (!id) return null;
		const mem = this._characters.get(id);
		if (mem) return mem;
		try {
			return (this._loadFromLocalStorage() || []).find(c => c && c.id === id) || null;
		} catch (e) {
			return null;
		}
	}

	static _loadTombstones () {
		try {
			const raw = localStorage.getItem(this._TOMBSTONE_KEY);
			const data = raw ? JSON.parse(raw) : {};
			const now = Date.now();
			const cleaned = {};
			for (const [key, ts] of Object.entries(data || {})) {
				if (now - Number(ts) < this._TOMBSTONE_TTL_MS) cleaned[key] = ts;
			}
			return cleaned;
		} catch (e) {
			return {};
		}
	}

	static _saveTombstones (map) {
		try {
			localStorage.setItem(this._TOMBSTONE_KEY, JSON.stringify(map || {}));
		} catch (e) { /* ignore */ }
	}

	static _tombstoneKey (name, source, id = null) {
		if (id) return `id:${id}`;
		if (name) return `ns:${this._generateCompositeId(name, source)}`;
		return null;
	}

	static _markTombstone (name, source, id = null) {
		const map = this._loadTombstones();
		const now = Date.now();
		const idKey = this._tombstoneKey(null, null, id);
		const nsKey = this._tombstoneKey(name, source);
		if (idKey) map[idKey] = now;
		if (nsKey) map[nsKey] = now;
		this._saveTombstones(map);
	}

	static _clearTombstone (name, source, id = null) {
		const map = this._loadTombstones();
		const idKey = this._tombstoneKey(null, null, id);
		const nsKey = this._tombstoneKey(name, source);
		let changed = false;
		if (idKey && map[idKey]) { delete map[idKey]; changed = true; }
		if (nsKey && map[nsKey]) { delete map[nsKey]; changed = true; }
		if (changed) this._saveTombstones(map);
	}

	static _isTombstoned (characterOrId, source = null) {
		const map = this._loadTombstones();
		if (!map || !Object.keys(map).length) return false;
		if (typeof characterOrId === "string") {
			if (map[`id:${characterOrId}`]) return true;
			if (source != null && map[`ns:${this._generateCompositeId(characterOrId, source)}`]) return true;
			return false;
		}
		const c = characterOrId;
		if (!c) return false;
		if (c.id && map[`id:${c.id}`]) return true;
		if (c.name && map[`ns:${this._generateCompositeId(c.name, c.source)}`]) return true;
		return false;
	}

	/**
	 * Resolve the canonical server character id for save/delete to avoid duplicate rows.
	 * Prefers exact preferredId if it exists on the server, else name match, else composite.
	 */
	static async _resolveCanonicalCharacterId (characterData, preferredId = null) {
		const preferred = preferredId || characterData?.id || null;
		const composite = characterData?.name
			? this._generateCompositeId(characterData.name, characterData.source)
			: null;

		try {
			const blobs = await this._getBlobList(null, true);
			const ids = new Set((blobs || []).map(b => b?.id).filter(Boolean));

			if (preferred && ids.has(preferred)) return preferred;

			const nameLc = (characterData?.name || "").toLowerCase();
			if (nameLc) {
				const nameMatch = (blobs || []).find(b => {
					const blobName = (b.character_name || b.name || "").toLowerCase();
					return blobName === nameLc;
				});
				if (nameMatch?.id) return nameMatch.id;

				const nameSlug = nameLc.replace(/[^a-z0-9_-]/g, "");
				const prefixMatch = (blobs || []).find(b => String(b.id || "").toLowerCase().startsWith(nameSlug));
				if (prefixMatch?.id) return prefixMatch.id;
			}

			if (composite && ids.has(composite)) return composite;
		} catch (e) {
			console.warn("CharacterManager: Canonical ID resolve failed, using local id:", e);
		}

		return preferred || composite || null;
	}

	static getInstance () {
		if (!this._instance) {
			this._instance = new CharacterManager();
		}
		return this._instance;
	}

	/**
	 * Set the freshness threshold for character data
	 * @param {number} milliseconds - How long to consider character data fresh
	 */
	static setFreshnessThreshold (milliseconds) {
		this._freshnessThreshold = milliseconds;
	}

	/**
	 * Force refresh characters by clearing their lastFetched timestamps
	 * @param {Array<string>} [characterIds] - Specific characters to refresh, or all if not specified
	 */
	static forceRefreshCharacters (characterIds = null) {
		if (characterIds) {
			for (const id of characterIds) {
				const cached = this._blobCache.get(id);
				if (cached) {
					cached.lastFetched = 0; // Force stale
				}
			}
		} else {
			// Clear all lastFetched timestamps
			for (const [id, cached] of this._blobCache.entries()) {
				cached.lastFetched = 0;
			}
		}
	}

	/**
	 * Force complete refresh of character by clearing all cached data
	 * @param {string} characterId - Character ID to completely refresh
	 */
	static forceCompleteRefresh (characterId) {
		console.log(`CharacterManager: Force complete refresh for ${characterId}`);

		// Remove from in-memory caches
		this._characters.delete(characterId);
		this._blobCache.delete(characterId);

		// Remove from array cache
		const arrayIndex = this._charactersArray.findIndex(c => c && c.id === characterId);
		if (arrayIndex >= 0) {
			this._charactersArray.splice(arrayIndex, 1);
		}

		// Remove from localStorage
		try {
			const stored = this._loadFromLocalStorage();
			const filtered = stored.filter(c => c && c.id !== characterId);
			this._saveToLocalStorage(filtered);
		} catch (e) {
			console.warn(`CharacterManager: Error removing ${characterId} from localStorage:`, e);
		}

		// Clear summary cache to force rebuild
		this._clearSummariesCache();

		// Clear DataLoader cache
		if (typeof DataLoader !== "undefined") {
			try {
				// Force DataLoader to refresh
				const formattedData = { character: [...this._charactersArray] };
				DataLoader._pCache_addToCache({
					allDataMerged: formattedData,
					propAllowlist: new Set(["character"]),
				});
			} catch (e) {
				console.warn("CharacterManager: Error updating DataLoader cache:", e);
			}
		}

		console.log(`CharacterManager: Complete refresh cache cleared for ${characterId}`);
	}

	/**
	 * Load characters from localStorage cache
	 * @returns {Array} Array of cached characters
	 */
	static _loadFromLocalStorage () {
		try {
			const stored = localStorage.getItem(this._STORAGE_KEY);
			if (!stored) return [];

			const data = JSON.parse(stored);
			if (!Array.isArray(data)) return [];

			return data;
		} catch (e) {
			console.warn("CharacterManager: Failed to load from localStorage:", e);
			return [];
		}
	}

	/**
	 * Save characters to localStorage cache
	 * @param {Array} characters - Characters to cache
	 */
	static _saveToLocalStorage (characters) {
		try {
			// Be defensive: merge incoming characters with any existing stored characters
			// to avoid accidental overwrites when callers pass partial lists.
			const incoming = Array.isArray(characters) ? characters : [];
			const existing = this._loadFromLocalStorage();
			const map = new Map();
			for (const c of existing) {
				if (c && c.id) map.set(c.id, c);
			}
			for (const c of incoming) {
				if (c && c.id) map.set(c.id, c);
			}
			const merged = Array.from(map.values());
			localStorage.setItem(this._STORAGE_KEY, JSON.stringify(merged));
		} catch (e) {
			console.warn("CharacterManager: Failed to save to localStorage:", e);
		}
	}

	/**
	 * Register a listener for character data changes
	 * @param {Function} callback - Called when characters are loaded/updated
	 */
	static addListener (callback) {
		this._listeners.add(callback);
	}

	/**
	 * Remove a listener
	 * @param {Function} callback - The callback to remove
	 */
	static removeListener (callback) {
		this._listeners.delete(callback);
	}

	/**
	 * Notify all listeners of character data changes
	 */
	static _notifyListeners () {
		this._listeners.forEach(callback => {
			try {
				callback(this._charactersArray);
			} catch (e) {
				console.warn("Error in character manager listener:", e);
			}
		});
	}

	/**
	 * Load character summaries (lightweight data for lists/search/DM screen)
	 * Uses 24-hour cache, hits /api/characters/list daily to detect new/deleted characters
	 * @param {Array<string>} [sources] - Optional list of sources to filter by
	 * @param {boolean} [forceRefresh] - Force refresh from server (cache busting)
	 * @returns {Promise<Array>} Array of character summaries
	 */
	static async loadCharacterSummaries (sources = null, forceRefresh = false) {
		try {
			// Check cache first unless forcing refresh
			if (!forceRefresh) {
				const { summaries, timestamp } = this._loadSummariesFromCache();
				const age = Date.now() - timestamp;

				if (summaries.length > 0 && age < this._SUMMARIES_CACHE_TTL) {
					console.log(`CharacterManager: Using cached summaries (age: ${Math.round(age / 60000)} minutes)`);
					// Apply source filter if requested
					if (sources) {
						const sourceList = Array.isArray(sources) ? sources : [sources];
						return summaries.filter(s => sourceList.includes(s.source));
					}
					return [...summaries]; // Return copy to avoid mutation
				}
			}

			console.log(`CharacterManager: Loading character summaries from server${forceRefresh ? " (forced)" : ""}`);

			// Get blob list from server (this handles caching and purging internally)
			const blobs = await this._getBlobList(null, forceRefresh); // Always get full list for proper deletion detection

			if (!blobs || blobs.length === 0) {
				console.log("CharacterManager: No character blobs available, using any cached summaries");
				const { summaries } = this._loadSummariesFromCache();
				return sources ? summaries.filter(s => sources.includes(s.source)) : summaries;
			}

			// Build summaries from available data sources:
			// 1. Existing full characters in memory/localStorage (most accurate)
			// 2. Blob metadata (fallback with placeholders)
			const summaries = [];
			const fullCharacters = this._loadFromLocalStorage();
			const fullCharMap = new Map();

			// Index full characters by ID for quick lookup
			for (const char of fullCharacters) {
				if (char && char.id) {
					fullCharMap.set(char.id, char);
				}
			}

			for (const blob of blobs) {
				const fullChar = fullCharMap.get(blob.id);

				if (fullChar) {
					// We have full character data - extract accurate summary
					const summary = this._extractCharacterSummary(fullChar);
					if (summary) summaries.push(summary);
				} else {
					// Only have blob metadata - create summary from available API data
					// Use metadata from API response if available, otherwise extract from blob ID
					let name, source;

					if (blob.character_name && blob.owner) {
						// Use API-provided metadata (preferred)
						name = blob.character_name;
						source = blob.owner;
					} else {
						// Fallback to extracting from blob ID (format: name-source)
						const parts = blob.id.split("-");
						source = parts.length > 1 ? parts[parts.length - 1] : "Unknown";
						name = parts.length > 1 ? parts.slice(0, -1).join("-") : blob.id;
					}

					summaries.push({
						id: blob.id,
						name: name,
						source: source,
						_fClass: blob.class || "Unknown", // Use API metadata if available
						_fRace: blob.race || "Unknown", // Use API metadata if available
						_fLevel: blob.level || 0, // Use API metadata if available
						_fBackground: blob.background || null, // Use API metadata if available
						updatedAt: blob.uploadedAt ? new Date(blob.uploadedAt).getTime() : Date.now(),
						_isLocallyModified: false,
					});
				}
			}

			// Cache the summaries
			this._saveSummariesToCache(summaries);

			console.log(`CharacterManager: Loaded ${summaries.length} character summaries`);

			// Apply source filter if requested
			if (sources) {
				const sourceList = Array.isArray(sources) ? sources : [sources];
				return summaries.filter(s => sourceList.includes(s.source));
			}

			return summaries;
		} catch (error) {
			console.error("CharacterManager: Error loading character summaries:", error);
			// Fallback to cached summaries
			const { summaries } = this._loadSummariesFromCache();
			return sources ? summaries.filter(s => sources.includes(s.source)) : summaries;
		}
	}

	/**
	 * DEPRECATED: Use loadCharacterSummaries() for lists and ensureFullCharacter(id) for individual characters
	 * This method has been removed to prevent accidental full JSON loading.
	 * @deprecated
	 */
	static async loadCharacters (sources = null) {
		throw new Error("loadCharacters() is deprecated. Use loadCharacterSummaries() for lists and ensureFullCharacter(id) for individual characters.");
	}

	/**
	 * Perform the actual character loading, using cached blob list and character data where possible
	 * @param {Array<string>} [sources] - Optional list of sources to filter by
	 * @returns {Promise<Array>} Array of characters
	 */
	static async _performLoad (sources = null) {
		try {
			// First, load from localStorage to get any locally modified characters
			const localStorageCharacters = this._loadFromLocalStorage();
			const localCharMap = new Map();

			// Create a map of localStorage characters by ID for fast lookup
			for (const character of localStorageCharacters) {
				if (character && character.id) {
					localCharMap.set(character.id, character);
				}
			}

			console.log(`CharacterManager: Found ${localStorageCharacters.length} characters in localStorage`);

			// Try to get the blob list, but don't fail if server is unavailable
			let blobs = [];
			try {
				blobs = await this._getBlobList(sources);
			} catch (e) {
				console.warn("CharacterManager: Server unavailable, using localStorage only:", e.message);
				return this._processAndStoreCharacters(localStorageCharacters, false);
			}

			// Check for characters that exist in localStorage but not in server blob list
			// These are considered deleted and should be removed from local storage
			if (blobs && blobs.length >= 0 && localStorageCharacters.length > 0) {
				const serverCharacterIds = new Set(blobs.map(blob => blob.id));
				const charactersToDelete = [];

				for (const localChar of localStorageCharacters) {
					if (localChar && localChar.id && !serverCharacterIds.has(localChar.id)) {
						// If this character has local unsaved changes, keep it.
						// New characters created on this device (or edits not yet synced)
						// are marked with `_isLocallyModified` and should not be purged.
						if (localChar._isLocallyModified) {
							console.log(`CharacterManager: Preserving locally modified character ${localChar.id} (not present on server yet)`);
							continue;
						}

						// Character exists locally but not on server - it was deleted elsewhere
						charactersToDelete.push(localChar.id);
					}
				}

				// Remove deleted characters from local storage and in-memory cache
				if (charactersToDelete.length > 0) {
					console.log(`CharacterManager: Removing ${charactersToDelete.length} deleted characters:`, charactersToDelete);

					// Remove from localStorage
					const updatedLocalStorage = localStorageCharacters.filter(char =>
						!char || !char.id || !charactersToDelete.includes(char.id),
					);
					this._saveToLocalStorage(updatedLocalStorage);

					// Remove from in-memory caches
					for (const charId of charactersToDelete) {
						this._characters.delete(charId);
						this._blobCache.delete(charId);

						// Remove from array
						const arrayIndex = this._charactersArray.findIndex(c => c && c.id === charId);
						if (arrayIndex >= 0) {
							this._charactersArray.splice(arrayIndex, 1);
						}
					}

					// Update localStorageCharacters array for the rest of this function
					localStorageCharacters.splice(0, localStorageCharacters.length, ...updatedLocalStorage);

					// Update localCharMap
					localCharMap.clear();
					for (const character of updatedLocalStorage) {
						if (character && character.id) {
							localCharMap.set(character.id, character);
						}
					}

					// Broadcast the deletions to other tabs
					for (const charId of charactersToDelete) {
						this._broadcastSync("CHARACTER_DELETED", { characterId: charId });
					}
				}
			}

			if (!blobs || blobs.length === 0) {
				// No blobs available - use localStorage data if we have it
				if (localStorageCharacters.length > 0) {
					console.log("CharacterManager: No blobs available, using localStorage data only");
					return this._processAndStoreCharacters(localStorageCharacters, false);
				} else {
					console.log("CharacterManager: No characters available (no blobs, no localStorage)");
					return [];
				}
			}

			// Determine which characters we need to fetch based on localStorage staleness
			const charactersToFetch = [];
			const cachedCharacters = [];
			const now = Date.now();
			const STALENESS_THRESHOLD = 10 * 60 * 1000; // 10 minutes for blob cache freshness
			// If a character's JSON in localStorage is newer than this threshold,
			// avoid re-fetching the server blob on page load to reduce network load.
			const LOCAL_JSON_FRESH_MS = 1 * 60 * 1000; // 1 minute

			for (const blob of blobs) {
				const cached = this._blobCache.get(blob.id);
				const existingCharacter = this._characters.get(blob.id);
				const localStorageCharacter = localCharMap.get(blob.id);

				// PRIMARY SOURCE: localStorage data (always prefer if exists and not extremely stale)
				if (localStorageCharacter) {
					const localAge = now - (localStorageCharacter._lastModified || localStorageCharacter._localVersion || 0);

					// ALWAYS use localStorage if it's locally modified (user has made edits)
					if (localStorageCharacter._isLocallyModified) {
						console.log(`CharacterManager: Using locally modified character: ${localStorageCharacter.name}`);
						cachedCharacters.push(localStorageCharacter);
						continue;
					}

					// If localStorage JSON is very fresh (less than 1 minute), prefer it
					// and avoid an extra fetch on page load.
					if (localAge < LOCAL_JSON_FRESH_MS) {
						console.log(`CharacterManager: Using fresh localStorage JSON for ${localStorageCharacter.name} (age ${localAge}ms)`);
						cachedCharacters.push(localStorageCharacter);
						continue;
					}

					// Use localStorage if not stale (less than STALENESS_THRESHOLD)
					if (localAge < STALENESS_THRESHOLD) {
						cachedCharacters.push(localStorageCharacter);
						continue;
					}

					// Even if localStorage is stale, prefer it over server if server data isn't significantly newer
					const serverTimestamp = blob.uploadedAt ? new Date(blob.uploadedAt).getTime() : 0;
					const localTimestamp = localStorageCharacter._lastModified || localStorageCharacter._localVersion || 0;

					// If server timestamp isn't significantly newer (>1 hour), stick with localStorage
					if (!serverTimestamp || (localTimestamp > 0 && (serverTimestamp - localTimestamp) < 60 * 60 * 1000)) {
						cachedCharacters.push(localStorageCharacter);
						continue;
					}
				}

				// SECONDARY SOURCE: In-memory character with local modifications (shouldn't happen but safety net)
				if (existingCharacter && existingCharacter._isLocallyModified) {
					cachedCharacters.push(existingCharacter);
					continue;
				}

				// TERTIARY SOURCE: Blob cache if still fresh (avoid unnecessary network requests)
				if (cached && cached.character && (now - (cached.lastFetched || 0)) < STALENESS_THRESHOLD) {
					cachedCharacters.push(cached.character);
				} else {
					// LAST RESORT: Need to fetch from server (no localStorage or very stale)
					charactersToFetch.push(blob);
				}
			}

			// Fetch only the characters we don't have cached or that are stale
			const fetchedCharacters = [];
			if (charactersToFetch.length > 0) {
				const fetchPromises = charactersToFetch.map(async (blob) => {
					try {
						// Handle localStorage URLs differently
						if (blob.url && blob.url.startsWith("localStorage://")) {
							const characterId = blob.url.replace("localStorage://", "");
							const characters = this._loadFromLocalStorage();
							const character = characters.find(c =>
								this._generateCompositeId(c.name, c.source) === characterId,
							);

							if (!character) {
								console.warn(`CharacterManager: Character ${characterId} not found in localStorage`);
								return null;
							}

							// Update cache with localStorage data
							this._blobCache.set(blob.id, {
								blob: blob,
								character: character,
								lastFetched: now,
							});

							return character;
						}

						// Fetch character directly from blob URL
						const response = await fetch(blob.url);

						if (!response.ok) {
							console.warn(`CharacterManager: Failed to fetch character ${blob.id}: ${response.statusText}`);
							return null;
						}

						const characterData = await response.json();
						if (!characterData) {
							console.warn(`CharacterManager: Invalid response for character ${blob.id}`);
							return null;
						}

						const character = (characterData.character && Array.isArray(characterData.character))
							? characterData.character[0]
							: characterData;

						// Update cache with fresh data
						this._blobCache.set(blob.id, {
							blob: blob,
							character: character,
							lastFetched: now,
						});

						return character;
					} catch (error) {
						console.warn(`CharacterManager: Error fetching character ${blob.id}:`, error);
						return null;
					}
				});

				const results = await Promise.all(fetchPromises);
				fetchedCharacters.push(...results.filter(c => c));
			}

			// Combine cached and newly fetched characters
			const allCharacters = [...cachedCharacters, ...fetchedCharacters];

			// Add any localStorage-only characters that don't have blobs (local-only characters)
			for (const localChar of localStorageCharacters) {
				if (localChar && localChar.id) {
					// Check if this character is already included
					const alreadyIncluded = allCharacters.some(c => c && c.id === localChar.id);
					if (!alreadyIncluded) {
						allCharacters.push(localChar);
					}
				}
			}

			// If no characters found, try localStorage as fallback
			if (allCharacters.length === 0) {
				return this._processAndStoreCharacters(localStorageCharacters, false); // false = not from remote
			}

			// Process and store all characters, but we need to differentiate between localStorage and remote
			// Split the characters into localStorage vs remote-fetched
			const localChars = [];
			const remoteChars = [];

			for (const char of cachedCharacters) {
				if (localStorageCharacters.some(ls => ls.id === char.id)) {
					localChars.push(char);
				} else {
					remoteChars.push(char);
				}
			}

			// Add fetched characters (all remote)
			remoteChars.push(...fetchedCharacters);

			// Process remote characters FIRST (so localStorage can override)
			const remoteProcessed = remoteChars.length > 0 ? this._processAndStoreCharacters(remoteChars, true) : [];

			// Process localStorage characters LAST (preserves _isLocallyModified flags and takes final precedence)
			const localProcessed = localChars.length > 0 ? this._processAndStoreCharacters(localChars, false) : [];

			// Return combined results
			return [...remoteProcessed, ...localProcessed];
		} catch (error) {
			console.error("CharacterManager: Error in _performLoad:", error);
			// Fallback to localStorage
			return this._loadFromLocalStorage();
		}
	}

	/**
	 * Get blob list metadata, using a client-side localStorage cache to avoid
	 * hitting the server list endpoint on every page load. If the cache is stale
	 * or missing, fetches from `/api/characters/load` and caches the result.
	 * @param {Array<string>} [sources]
	 * @param {boolean} [force]
	 */
	static async _getBlobList (sources = null, force = false) {
		try {
			// First, always try to use cached blob list if available and not forced
			const raw = localStorage.getItem(this._LIST_CACHE_KEY);
			if (raw && !force) {
				try {
					const parsed = JSON.parse(raw);
					if (parsed && parsed.ts && (Date.now() - parsed.ts) < this._LIST_CACHE_TTL) {
						let blobs = parsed.blobs || [];
						if (sources) {
							const sourceList = Array.isArray(sources) ? sources : [sources];
							blobs = blobs.filter(blob => {
								const parts = blob.id.split("-");
								const source = parts[parts.length - 1];
								return sourceList.includes(source);
							});
						}
						return blobs;
					}
				} catch (e) {
					// Malformed cache, fall through to fetch
				}
			}

			// If we have localStorage characters but no blob list cache, only return
			// synthetic blobs when we're offline. When online, prefer fetching the
			// authoritative server list (unless 'force' is specified).
			const localStorageCharacters = this._loadFromLocalStorage();
			if (localStorageCharacters.length > 0 && !force && !navigator.onLine) {
				const syntheticBlobs = this._getLocalStorageBlobList(sources);
				if (syntheticBlobs.length > 0) {
					return syntheticBlobs;
				}
			}

			let url = `${API_BASE_URL}/characters/list`;
			if (sources && sources.length > 0) {
				const sourcesParam = sources.map(s => `sources=${encodeURIComponent(s)}`).join("&");
				url += `&${sourcesParam}`;
			}

			// Add timestamp for cache busting when forcing refresh
			if (force) {
				const separator = url.includes("?") ? "&" : "?";
				url += `${separator}t=${Date.now()}`;
			}

			if (force) console.log("CharacterManager: Fetching /characters/list (force)", url);
			else console.log("CharacterManager: Fetching /characters/list", url);
			const response = await fetch(url, {
				cache: "no-cache",
				headers: {
					"Cache-Control": "no-cache, no-store, must-revalidate",
					"Pragma": "no-cache",
					"Expires": "0",
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch character metadata: ${response.statusText}`);
			}

			const metadata = await response.json();
			const blobs = metadata.characters || [];

			// Cache the unfiltered blob list for future use
			try {
				localStorage.setItem(this._LIST_CACHE_KEY, JSON.stringify({ blobs, ts: Date.now() }));
			} catch (e) {
				console.warn("CharacterManager: Failed to cache blob list locally:", e);
			}

			// If this was a full (unfiltered) server fetch, purge any locally-cached
			// characters that no longer appear on the server list. This keeps the
			// UI and localStorage in sync with server-side deletions.
			try {
				if (!sources) {
					// Full unfiltered server fetch - treat server list as authoritative
					this._purgeLocalCharactersNotInServer(blobs, true);
				}
			} catch (e) { /* non-fatal */ }

			// If sources filter requested, apply it to the returned list
			if (sources) {
				const sourceList = Array.isArray(sources) ? sources : [sources];
				return blobs.filter(blob => {
					const parts = blob.id.split("-");
					const source = parts[parts.length - 1];
					return sourceList.includes(source);
				});
			}

			return blobs;
		} catch (e) {
			console.warn("CharacterManager: Error fetching blob list metadata:", e);
			// Fall back to localStorage if API is not available
			return this._getLocalStorageBlobList(sources);
		}
	}

	/**
	 * Remove any locally cached characters that are not present in the server's
	 * blob list. This will remove entries from localStorage, in-memory caches,
	 * blob cache, and any editing state so the UI will stop showing deleted
	 * characters.
	 * @param {Array} serverBlobs - Array of blob metadata from server
	 */
	static _purgeLocalCharactersNotInServer (serverBlobs, force = false) {
		try {
			if (!Array.isArray(serverBlobs)) return;
			// Build a set of server IDs and a normalized variants set to account for
			// differences in ID formatting (some code paths use '-' while local
			// composite IDs use '_' between name and source). This prevents
			// accidental purging when the same character exists remotely but with
			// a slightly different ID format.
			const rawServerIds = (serverBlobs || []).map(b => b && b.id).filter(Boolean);
			const serverIds = new Set(rawServerIds);
			const serverIdsNorm = new Set();
			for (const sid of rawServerIds) {
				serverIdsNorm.add(sid);
				// dash <-> underscore variants
				serverIdsNorm.add(sid.replace(/-/g, "_"));
				serverIdsNorm.add(sid.replace(/_/g, "-"));
				// Strip common file extensions or suffixes if present
				serverIdsNorm.add((sid.split(".")[0] || sid));
			}
			const local = this._loadFromLocalStorage();
			// Only mark for removal characters that are not locally modified. Preserve
			// local-only creations/edits (marked with `_isLocallyModified`) so the
			// user doesn't lose in-progress work when a server list fetch occurs.
			const toRemove = (local || []).filter(c => {
				if (!c || !c.id) return false;
				// Consider present if either the raw server IDs or normalized variants contain this id
				const presentOnServer = serverIds.has(c.id) || serverIdsNorm.has(c.id);
				if (presentOnServer) return false;
				// If this is an authoritative purge (force=true), remove regardless of local modification
				if (force) return true;
				// Otherwise preserve locally-modified items
				return !c._isLocallyModified;
			}).map(c => c.id);
			if (!toRemove.length) return;
			console.log(`CharacterManager: Purging ${toRemove.length} local character(s) not found on server`);

			// Also purge from summary cache
			const { summaries, timestamp } = this._loadSummariesFromCache();
			const updatedSummaries = summaries.filter(s => !toRemove.includes(s.id));
			if (updatedSummaries.length !== summaries.length) {
				this._saveSummariesToCache(updatedSummaries);
				console.log(`CharacterManager: Purged ${summaries.length - updatedSummaries.length} summaries`);
			}

			for (const id of toRemove) {
				try {
					// If the character is already in-memory, use existing removal path
					if (this._characters && this._characters.has && this._characters.has(id)) {
						this.removeCharacter(id);
						continue;
					}
					// Otherwise remove from persisted localStorage list
					const stored = this._loadFromLocalStorage();
					const filtered = (stored || []).filter(c => c && c.id !== id);
					try { localStorage.setItem(this._STORAGE_KEY, JSON.stringify(filtered)); } catch (e) { /* ignore */ }
					// Remove blob cache entry
					if (this._blobCache && this._blobCache.has && this._blobCache.has(id)) this._blobCache.delete(id);
					// Clear editing state if present
					try {
						const editingRaw = localStorage.getItem("editingCharacter");
						if (editingRaw) {
							const editing = JSON.parse(editingRaw);
							if (editing && editing.id === id) localStorage.removeItem("editingCharacter");
						}
					} catch (e) { /* ignore */ }
					if (globalThis._CHARACTER_EDIT_DATA && globalThis._CHARACTER_EDIT_DATA[id]) delete globalThis._CHARACTER_EDIT_DATA[id];
					// Notify listeners so UI updates
					this._notifyListeners();
				} catch (e) {
					console.warn("CharacterManager: Error purging character", id, e);
				}
			}
		} catch (e) {
			console.warn("CharacterManager: _purgeLocalCharactersNotInServer failed:", e);
		}
	}

	/**
	 * Get blob list from localStorage characters (fallback when API is not available)
	 * @param {Array<string>} [sources] - Optional list of sources to filter by
	 */
	static _getLocalStorageBlobList (sources = null) {
		try {
			const characters = this._loadFromLocalStorage();
			const blobs = [];

			for (const character of characters) {
				if (!character || !character.name) continue;

				const characterId = this._generateCompositeId(character.name, character.source);
				const blob = {
					id: characterId,
					url: `localStorage://${characterId}`,
					filename: `${characterId}.json`,
					pathname: `characters/${characterId}.json`,
					uploadedAt: new Date().toISOString(),
					size: JSON.stringify(character).length,
				};

				blobs.push(blob);
			}

			// If sources filter requested, apply it to the returned list
			if (sources) {
				const sourceList = Array.isArray(sources) ? sources : [sources];
				return blobs.filter(blob => {
					const character = characters.find(c =>
						this._generateCompositeId(c.name, c.source) === blob.id,
					);
					return character && sourceList.includes(character.source);
				});
			}

			return blobs;
		} catch (e) {
			console.warn("CharacterManager: Error creating localStorage blob list:", e);
			return [];
		}
	}

	/**
	 * Process and store characters, ensuring no duplicates
	 * @param {Array} characters - Raw character data from API
	 * @param {boolean} isFromRemote - Whether this data is from remote source
	 * @returns {Array} Processed characters
	 */
	static _processAndStoreCharacters (characters, isFromRemote = true) {
		// Merge incoming characters into the existing cache instead of replacing everything.
		// This preserves characters that weren't part of this payload (e.g., because we only
		// fetched a subset of blobs that were stale) so they don't disappear from the UI.
		const processedCharacters = [];

		for (const character of characters) {
			if (!character || !character.name) {
				console.warn("CharacterManager: Skipping character without name:", character);
				continue;
			}

			// Generate composite ID from name + source if no ID exists
			if (!character.id) {
				character.id = this._generateCompositeId(character.name, character.source);
			}

			// Check for existing local modifications
			const existingCharacter = this._characters.get(character.id);
			if (existingCharacter && existingCharacter._isLocallyModified && isFromRemote) {
				// We have local changes and this is remote data - handle conflict
				console.log(`CharacterManager: Conflict detected for ${character.id}: keeping local changes`);
				this._handleVersionConflict(existingCharacter, character);
				processedCharacters.push(existingCharacter); // Keep local version
				continue;
			}

			// If this is localStorage data and we already have the character in memory, be careful
			if (!isFromRemote && existingCharacter) {
				// This is localStorage data - it should take precedence if it's locally modified or newer
				const shouldUseLocalStorage = character._isLocallyModified
					|| (character._localVersion && character._localVersion > (existingCharacter._localVersion || 0))
					|| (character._lastModified && character._lastModified > (existingCharacter._lastModified || 0));

				if (!shouldUseLocalStorage) {
					// Skip this localStorage character if the in-memory one is newer/better
					console.log(`CharacterManager: Skipping older localStorage data for ${character.name}`);
					processedCharacters.push(existingCharacter);
					continue;
				} else {
					console.log(`CharacterManager: Using localStorage data over in-memory for ${character.name}`);
				}
			}

			// Process character for display
			const processedCharacter = this._processCharacterForDisplay(character);

			// Handle version tracking and local modification flags
			if (isFromRemote) {
				// Prefer server clocks; never invent Date.now() as remote version
				if (character._serverUpdatedAt || character.updated_at || character.updatedAt) {
					this._applyServerTimestamp(
						processedCharacter,
						character._serverUpdatedAt || character.updated_at || character.updatedAt,
					);
				}
				if (!existingCharacter || !existingCharacter._isLocallyModified) {
					processedCharacter._isLocallyModified = false;
				} else {
					processedCharacter._isLocallyModified = existingCharacter._isLocallyModified;
				}
			} else {
				// This is from localStorage - preserve all version tracking flags as-is
				// This ensures locally modified characters stay marked as such
				if (character._isLocallyModified !== undefined) {
					processedCharacter._isLocallyModified = character._isLocallyModified;
				}
				if (character._localVersion) {
					processedCharacter._localVersion = character._localVersion;
				}
				if (character._remoteVersion) {
					processedCharacter._remoteVersion = character._remoteVersion;
				}
				if (character._lastModified) {
					processedCharacter._lastModified = character._lastModified;
				}
			}

			// Upsert into the map (replace/update existing or add new)
			this._characters.set(character.id, processedCharacter);

			// Debug logging for specific character issues (simplified)
			if (character.name && character.name.toLowerCase().includes("garurt") && character._isLocallyModified) {
				console.log(`CharacterManager: Processing locally modified ${character.name}`);
			}

			// Track which characters were part of this update (returned to caller)
			processedCharacters.push(processedCharacter);
		}

		// Rebuild the array from the full map so we keep characters not present in this payload
		this._charactersArray = Array.from(this._characters.values());

		// Populate DataLoader cache for hover/popout functionality and offline support
		if (processedCharacters.length > 0) {
			const formattedData = { character: processedCharacters };
			if (typeof DataLoader !== "undefined") {
				DataLoader._pCache_addToCache({
					allDataMerged: formattedData,
					propAllowlist: new Set(["character"]),
				});
			}
		}

		// Save the full cache to localStorage for offline access (preserve all characters)
		this._saveToLocalStorage(Array.from(this._characters.values()));

		// Notify listeners of the update
		this._notifyListeners();

		return processedCharacters;
	}

	/**
	 * Process a single character for display (adds computed fields)
	 */
	static _processCharacterForDisplay (character) {
		// Clone to avoid modifying original
		const processed = { ...character };

		// Do NOT invent version clocks on ingest — that makes arrival time look like edit time.
		// Preserve existing sync fields; default dirty flag only.
		if (processed._isLocallyModified === undefined) processed._isLocallyModified = false;
		if (processed._serverUpdatedAt && !processed._remoteVersion) {
			processed._remoteVersion = this._toTimestampMs(processed._serverUpdatedAt);
		}
		if (!processed._lastModified && processed._serverUpdatedAt) {
			processed._lastModified = this._toTimestampMs(processed._serverUpdatedAt);
		}

		// Add computed fields that the filters and display expect
		if (processed.race) {
			processed._fRace = processed.race.variant ? `Variant ${processed.race.name}` : processed.race.name;
		}

		if (processed.class && Array.isArray(processed.class)) {
			// Create detailed class display with subclasses
			processed._fClass = processed.class.map(cls => {
				let classStr = cls.name;
				if (cls.subclass && cls.subclass.name) {
					classStr += ` (${cls.subclass.name})`;
				}
				return classStr;
			}).join("/");

			// Also create a simple class list for filtering/search
			processed._fClassSimple = processed.class.map(cls => cls.name).join("/");

			// Calculate total level from class levels
			processed._fLevel = processed.class.reduce((total, cls) => {
				return total + (cls.level || 0);
			}, 0);
		} else {
			processed._fLevel = 1;
		}

		if (processed.background) {
			processed._fBackground = processed.background.name;
		}

		// Ensure __prop is set for DataLoader compatibility
		processed.__prop = "character";

		return processed;
	}

	/**
	 * Get all characters (from cache if loaded)
	 * @returns {Array} Array of characters
	 */
	static getCharacters () {
		// Be defensive: ensure we never return undefined entries which can
		// break downstream UI/filter/render logic.
		return this._charactersArray.filter(c => c);
	}

	/**
	 * Get a character summary by ID (fast lookup from summary cache)
	 * @param {string} id - Character ID
	 * @returns {Object|null} Character summary or null if not found
	 */
	static getSummaryById (id) {
		const { summaries } = this._loadSummariesFromCache();
		return summaries.find(s => s.id === id) || null;
	}

	/**
	 * Ensure full character data is available, fetching lazily if needed
	 * @param {string} id - Character ID
	 * @param {Object} [opts]
	 * @param {boolean} [opts.forceNetwork] - Bypass memory/localStorage and fetch from server
	 * @returns {Promise<Object|null>} Full character object or null if not found
	 */
	static async ensureFullCharacter (id, opts = {}) {
		if (!id) return null;
		const forceNetwork = !!opts.forceNetwork;

		if (!forceNetwork) {
			let fullCharacter = this._characters.get(id);
			if (fullCharacter && !this._isCharacterStub(fullCharacter)) {
				console.log(`CharacterManager: Using cached full character: ${fullCharacter.name}`);
				return fullCharacter;
			} else if (fullCharacter && this._isCharacterStub(fullCharacter)) {
				console.log(`CharacterManager: Found stub for ${fullCharacter.name}, need to fetch full character`);
			}

			const localCharacters = this._loadFromLocalStorage();
			fullCharacter = localCharacters.find(c => c && c.id === id);
			if (fullCharacter) {
				console.log(`CharacterManager: Using localStorage full character: ${fullCharacter.name}`);
				const processed = this._processCharacterForDisplay(fullCharacter);
				this._characters.set(id, processed);
				return processed;
			}
		} else {
			this.forceRefreshCharacters([id]);
			this._characters.delete(id);
		}

		if (!navigator.onLine) {
			console.warn(`CharacterManager: Cannot load character ${id} - offline and not in cache`);
			throw new Error("Character not available offline. Please connect to the internet and try again.");
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 15000);

		try {
			console.log(`CharacterManager: Fetching full character from server via API: ${id}`);
			const apiUrl = `${API_BASE_URL}/characters/get?id=${encodeURIComponent(id)}`;
			const response = await fetch(apiUrl, {
				signal: controller.signal,
				headers: { "Cache-Control": "no-cache" },
			});

			if (!response.ok) {
				if (response.status === 404) {
					throw new Error("Character file not found on server. It may have been deleted.");
				} else if (response.status === 403) {
					throw new Error("Access denied. You may not have permission to view this character.");
				} else if (response.status >= 500) {
					throw new Error("Server error. Please try again in a few moments.");
				}
				throw new Error(`Failed to load character: Server responded with ${response.status}`);
			}

			const apiResponse = await response.json();
			if (!apiResponse.success || !apiResponse.character) {
				throw new Error(apiResponse.error || "Invalid response from character API.");
			}

			const characterData = apiResponse.character;
			let fullCharacter = (characterData.character && Array.isArray(characterData.character))
				? characterData.character[0]
				: characterData;

			if (!fullCharacter) {
				throw new Error("Character data is malformed or incomplete.");
			}

			const serverUpdatedAt = apiResponse.metadata?.updated_at;
			if (serverUpdatedAt) {
				fullCharacter._isLocallyModified = false;
				this._applyServerTimestamp(fullCharacter, serverUpdatedAt);
			}

			const processed = this._processCharacterForDisplay(fullCharacter);
			processed.id = id;

			this._characters.set(id, processed);

			const arrayIndex = this._charactersArray.findIndex(c => c && c.id === id);
			if (arrayIndex >= 0) {
				this._charactersArray[arrayIndex] = processed;
			} else {
				this._charactersArray.push(processed);
			}

			this._updateLocalStorageCache(processed);

			const summary = this._extractCharacterSummary(processed);
			if (summary) {
				const { summaries } = this._loadSummariesFromCache();
				const summaryIndex = summaries.findIndex(s => s.id === id);
				if (summaryIndex >= 0) summaries[summaryIndex] = summary;
				else summaries.push(summary);
				this._saveSummariesToCache(summaries);
			}

			if (typeof DataLoader !== "undefined") {
				DataLoader._pCache_addToCache({
					allDataMerged: { character: [processed] },
					propAllowlist: new Set(["character"]),
				});
			}

			this._notifyListeners();
			console.log(`CharacterManager: Successfully loaded full character: ${processed.name}`);
			return processed;
		} catch (error) {
			if (error.name === "AbortError") {
				throw new Error("Request timed out. Please check your internet connection and try again.");
			} else if (error.name === "TypeError" && String(error.message || "").includes("Failed to fetch")) {
				throw new Error("Network error. Please check your internet connection.");
			}
			console.error(`CharacterManager: Error fetching character ${id}:`, error);
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Check if a character object is just a summary/stub (not full character)
	 * @param {Object} character - Character object to check
	 * @returns {boolean} True if this is a stub, false if it's a full character
	 */
	static _isCharacterStub (character) {
		if (!character) return true;

		// A stub typically only has id, name, source, updatedAt, and _f* fields
		// A full character has class, race, background, abilities, etc.
		return !character.class && !character.race && !character.background && !character.abilities;
	}

	/**
	 * Get a character by ID (returns cached full character or null)
	 * Use ensureFullCharacter() if you want to fetch lazily
	 * @param {string} id - Character ID
	 * @returns {Object|null} Character object or null if not found
	 */
	static getCharacterById (id) {
		const character = this._characters.get(id) || null;

		// If we have a character but it's just a stub, return null so caller uses ensureFullCharacter()
		if (character && this._isCharacterStub(character)) {
			console.warn(`CharacterManager: Character ${id} is a stub, use ensureFullCharacter() instead`);
			return null;
		}

		return character;
	}

	/**
	 * Add or update a single character (for editor functionality)
	 * @param {Object} character - Character data
	 * @param {boolean} isFromRemote - Whether this update is from remote source
	 */
	static addOrUpdateCharacter (character, isFromRemote = false) {
		if (!character || !character.name) {
			console.warn("CharacterManager: Cannot add character without name");
			return;
		}

		// Ensure we don't end up with duplicate characters that differ only by id
		// (e.g., old saved copies). Remove any existing entries with the same
		// name+source composite ID but a different id before upserting.
		this._dedupeByNameAndSource(character);

		// Generate composite ID if no ID exists
		if (!character.id) {
			character.id = this._generateCompositeId(character.name, character.source);
		}

		// Handle version tracking for local vs remote changes
		const now = Date.now();
		const existingCharacter = this._characters.get(character.id);

		if (isFromRemote) {
			// Stamp server time if provided on the incoming object
			if (character._serverUpdatedAt) {
				this._applyServerTimestamp(character, character._serverUpdatedAt);
			}

			// This is from remote - update remote version but preserve local changes
			if (existingCharacter && existingCharacter._isLocallyModified) {
				const localTs = this._getLocalEffectiveTs(existingCharacter);
				const remoteTs = Math.max(
					this._toTimestampMs(character._serverUpdatedAt),
					this._toTimestampMs(character._lastModified),
					this._toTimestampMs(character._remoteVersion),
				);
				if (localTs > remoteTs) {
					// Local is newer — keep local, queue push
					this._addToOfflineQueue("update", existingCharacter);
					return;
				}
				// Remote is newer — resolve via LWW
				this._handleVersionConflict(existingCharacter, character);
				return;
			} else {
				// No local changes - safe to update from remote (do not invent Date.now())
				character._isLocallyModified = false;
				if (!character._serverUpdatedAt && existingCharacter?._serverUpdatedAt) {
					character._serverUpdatedAt = existingCharacter._serverUpdatedAt;
				}
			}
		} else {
			// This is a local change or a synchronized save
			if (existingCharacter) {
				// Preserve remote/server version unless explicitly set
				if (!character._remoteVersion) {
					character._remoteVersion = existingCharacter._remoteVersion || 0;
				}
				if (!character._serverUpdatedAt && existingCharacter._serverUpdatedAt) {
					character._serverUpdatedAt = existingCharacter._serverUpdatedAt;
				}
				if (!character._localVersion) character._localVersion = now;
				if (!character._lastModified) character._lastModified = now;
				if (character._isLocallyModified === undefined) {
					character._isLocallyModified = true;
				}
			} else {
				// New character
				if (!character._localVersion) character._localVersion = now;
				if (!character._lastModified) character._lastModified = now;
				if (character._isLocallyModified === undefined) {
					character._isLocallyModified = true;
				}
			}

			// Only add to offline queue if we're offline AND it's actually a local modification
			if (!navigator.onLine && character._isLocallyModified) {
				this._addToOfflineQueue("update", character);
			}
		}

		const processed = this._processCharacterForDisplay(character);

		// Update or add to map
		const existingIndex = this._charactersArray.findIndex(c => c.id === character.id);
		if (existingIndex >= 0) {
			// Update existing
			this._charactersArray[existingIndex] = processed;
		} else {
			// Add new
			this._charactersArray.push(processed);
		}

		this._characters.set(character.id, processed);

		// Update DataLoader cache to maintain consistency
		this._updateDataLoaderCache();

		// Always update localStorage cache to persist character changes
		this._updateLocalStorageCache(processed);

		// Notify listeners
		this._notifyListeners();
	}

	/**
	 * Handle version conflicts between local and remote character data
	 * @param {Object} localCharacter - Local version with changes
	 * @param {Object} remoteCharacter - Remote version from server
	 */
	static _handleVersionConflict (localCharacter, remoteCharacter) {
		// Auto-resolve by preferring the newer character based on server/local clocks.
		// Avoid adding conflict metadata to the character object itself.
		// Important: do NOT call `addOrUpdateCharacter` here because that method
		// may re-enter this conflict handler.
		try {
			const localTs = this._getLocalEffectiveTs(localCharacter);
			const remoteTs = Math.max(
				this._toTimestampMs(remoteCharacter._serverUpdatedAt),
				this._toTimestampMs(remoteCharacter._lastModified),
				this._toTimestampMs(remoteCharacter._remoteVersion),
			);
			let winner = null;
			let winnerIsFromRemote = false;

			if (!localTs && !remoteTs) {
				// If timestamps are not present, prefer local by default when dirty
				winner = localCharacter._isLocallyModified ? localCharacter : remoteCharacter;
				winnerIsFromRemote = winner === remoteCharacter;
			} else if (remoteTs > localTs) {
				winner = remoteCharacter;
				winnerIsFromRemote = true;
			} else {
				winner = localCharacter;
				winnerIsFromRemote = false;
			}

			// Apply the resolved character without re-entering conflict resolution
			this._applyResolvedCharacter(winner, winnerIsFromRemote);
		} catch (e) {
			console.warn("CharacterManager: Automatic conflict resolution failed, keeping local by default:", e);
			this._applyResolvedCharacter(localCharacter, false);
		}
	}

	/**
	 * Safely apply a resolved character into the in-memory and persisted caches
	 * without invoking the normal conflict-resolution path (which may call
	 * _handleVersionConflict again). This performs the minimal upsert work,
	 * updates versions/flags appropriately, saves to localStorage, updates
	 * DataLoader, and notifies listeners.
	 * @param {Object} character
	 * @param {boolean} isFromRemote
	 */
	static _applyResolvedCharacter (character, isFromRemote) {
		if (!character || !character.name) return;

		// Ensure composite ID
		if (!character.id) character.id = this._generateCompositeId(character.name, character.source);

		const now = Date.now();
		const existing = this._characters.get(character.id) || null;

		// Normalize version fields based on source
		if (isFromRemote) {
			if (character._serverUpdatedAt) {
				this._applyServerTimestamp(character, character._serverUpdatedAt);
			}
			character._isLocallyModified = false;
		} else {
			// Local/accepted local version
			character._localVersion = character._localVersion || now;
			character._lastModified = character._lastModified || now;
			character._isLocallyModified = character._isLocallyModified === undefined ? true : character._isLocallyModified;
			if (existing?._serverUpdatedAt && !character._serverUpdatedAt) {
				character._serverUpdatedAt = existing._serverUpdatedAt;
			}
		}

		// Process for display and upsert into caches
		const processed = this._processCharacterForDisplay(character);

		// Upsert into array and map without triggering dedupe/conflict logic
		const idx = this._charactersArray.findIndex(c => c && c.id === processed.id);
		if (idx >= 0) this._charactersArray[idx] = processed; else this._charactersArray.push(processed);
		this._characters.set(processed.id, processed);

		// Update caches and persist
		this._updateDataLoaderCache();
		try {
			this._updateLocalStorageCache(processed);
		} catch (e) {
			console.warn("CharacterManager: Error persisting resolved character:", e);
		}

		// Notify listeners
		this._notifyListeners();
	}

	/**
	 * Add an operation to the offline queue
	 * @param {string} operation - 'create', 'update', 'delete'
	 * @param {Object} data - Character data or operation details
	 */
	static _addToOfflineQueue (operation, data) {
		const queueItem = {
			id: Date.now() + Math.random(), // Simple unique ID
			operation,
			data: { ...data },
			timestamp: Date.now(),
		};

		this._offlineQueue.push(queueItem);

		// Persist to localStorage
		try {
			localStorage.setItem(this._OFFLINE_QUEUE_KEY, JSON.stringify(this._offlineQueue));
		} catch (e) {
			console.warn("CharacterManager: Failed to persist offline queue:", e);
		}
	}

	/**
	 * Process offline queue when coming back online
	 */
	static async _processOfflineQueue () {
		if (this._offlineQueue.length === 0) return;

		console.log(`CharacterManager: Processing ${this._offlineQueue.length} offline operations`);

		const failures = [];

		for (const item of this._offlineQueue) {
			try {
				switch (item.operation) {
					case "create":
					case "update":
						await this.saveCharacter(item.data, item.operation === "update");
						break;
					case "delete":
						await this.pDeleteCharacter(item.data?.id || item.data?.characterId, item.data);
						break;
					default:
						console.warn("Unknown offline operation:", item.operation);
				}
			} catch (e) {
				console.warn(`CharacterManager: Failed to process offline operation ${item.id}:`, e);
				failures.push(item);
			}
		}

		// Keep failed operations for retry
		this._offlineQueue = failures;
		try {
			localStorage.setItem(this._OFFLINE_QUEUE_KEY, JSON.stringify(this._offlineQueue));
		} catch (e) {
			console.warn("CharacterManager: Failed to update offline queue:", e);
		}

		if (failures.length === 0) {
			console.log("CharacterManager: All offline operations processed successfully");
		} else {
			console.warn(`CharacterManager: ${failures.length} operations failed, will retry later`);
		}
	}

	/**
	 * Notify about conflicts (placeholder for UI integration)
	 * @param {Object} localCharacter - Local version
	 * @param {Object} remoteCharacter - Remote version
	 */
	static _notifyConflict (localCharacter, remoteCharacter) {
		// TODO: Show conflict resolution UI
		console.warn(`Conflict for character ${localCharacter.name}: Local changes preserved, remote changes available`);

		// For now, just log the conflict
		if (typeof JqueryUtil !== "undefined" && JqueryUtil.showCopiedEffect) {
			// Show a temporary notification if the utility is available
			JqueryUtil.showCopiedEffect($("body"), `Conflict detected for ${localCharacter.name}`, "warning");
		}
	}

	/**
	 * Load offline queue from localStorage on startup
	 */
	static _loadOfflineQueue () {
		try {
			const stored = localStorage.getItem(this._OFFLINE_QUEUE_KEY);
			if (stored) {
				this._offlineQueue = JSON.parse(stored) || [];
			}
		} catch (e) {
			console.warn("CharacterManager: Failed to load offline queue:", e);
			this._offlineQueue = [];
		}
	}

	/**
	 * Set a custom conflict resolver function
	 * @param {Function} resolver - Function(localChar, remoteChar) -> resolvedChar | null
	 */
	static setConflictResolver (resolver) {
		this._conflictResolver = resolver;
	}

	/**
	 * Remove any cached characters that share the same name+source as the
	 * provided character but have a different id. This prevents duplicate
	 * entries after edits or re-saves where a character may have been saved
	 * under a different id previously.
	 * @param {Object} character
	 */
	static _dedupeByNameAndSource (character) {
		try {
			if (!character || !character.name) return;
			const targetComposite = this._generateCompositeId(character.name, character.source);
			const toRemove = [];

			for (const [id, c] of this._characters.entries()) {
				if (!c || !c.name) continue;
				const comp = this._generateCompositeId(c.name, c.source);
				if (comp === targetComposite && id !== (character.id || targetComposite)) {
					toRemove.push(id);
				}
			}

			if (toRemove.length === 0) return;

			for (const id of toRemove) {
				this._characters.delete(id);
				const idx = this._charactersArray.findIndex(cc => cc.id === id);
				if (idx !== -1) this._charactersArray.splice(idx, 1);
				if (this._blobCache.has(id)) this._blobCache.delete(id);
			}

			// Persist the deduped state to localStorage
			try {
				this._saveToLocalStorage([...this._charactersArray]);
			} catch (e) {
				console.warn("CharacterManager: Error saving deduped cache to localStorage:", e);
			}
		} catch (e) {
			console.warn("CharacterManager: Error during deduplication:", e);
		}
	}

	/**
	 * Quick edit functionality for HP and other frequently updated fields
	 * @param {string} characterId - Character ID
	 * @param {Object} updates - Fields to update (e.g., {hp: 25})
	 */
	static updateCharacterQuickEdit (characterId, updates) {
		const character = this._characters.get(characterId);
		if (!character) {
			console.warn(`CharacterManager: Character ${characterId} not found for quick edit`);
			return false;
		}

		console.log(`CharacterManager: Quick edit for ${character.name}:`, {
			characterId: characterId,
			updates: updates,
			before: {
				hp: character.hp,
				_isLocallyModified: character._isLocallyModified,
				_localVersion: character._localVersion,
			},
		});

		// Mark as locally modified with version tracking
		const now = Date.now();
		character._localVersion = now;
		character._lastModified = now;
		character._isLocallyModified = true;

		// Apply updates
		Object.assign(character, updates);

		console.log(`CharacterManager: After quick edit for ${character.name}:`, {
			hp: character.hp,
			_isLocallyModified: character._isLocallyModified,
			_localVersion: character._localVersion,
		});

		// Update in array as well
		const arrayIndex = this._charactersArray.findIndex(c => c.id === characterId);
		if (arrayIndex >= 0) {
			Object.assign(this._charactersArray[arrayIndex], updates);
			// Also update version tracking on array item
			this._charactersArray[arrayIndex]._localVersion = now;
			this._charactersArray[arrayIndex]._lastModified = now;
			this._charactersArray[arrayIndex]._isLocallyModified = true;
		}

		// Add to offline queue if we're offline
		if (!navigator.onLine) {
			this._addToOfflineQueue("update", character);
		}

		// Update DataLoader cache
		this._updateDataLoaderCache();

		// Update localStorage cache if this character is currently being edited
		this._updateLocalStorageCache(character);

		// FORCE complete cache invalidation to ensure UI shows updated data
		this._invalidateAllCaches();

		// Notify listeners of the update
		this._notifyListeners();

		// Broadcast quick edit to other tabs and peers so everyone sees the change
		try {
			this._broadcastSync("CHARACTER_UPDATED", { character });
		} catch (e) {
			console.warn("CharacterManager: Failed to broadcast CHARACTER_UPDATED to other tabs:", e);
		}

		// Also save to server to trigger WebSocket broadcast to other devices/users
		this._saveQuickEditToServer(character).catch(error => {
			console.warn(`CharacterManager: Failed to save quick edit to server for ${character.name}:`, error);
		});

		return true;
	}

	/**
	 * Save quick edit changes to server to trigger WebSocket broadcast
	 * @param {Object} character - Character with updates
	 */
	static async _saveQuickEditToServer (character, opts = {}) {
		try {
			console.log(`CharacterManager: Saving quick edit to server for ${character.name}`);

			// Use the same session key as main save path
			let sessionToken = null;
			try {
				sessionToken = localStorage.getItem("sessionToken");
			} catch (e) {
				console.warn("Could not get session token:", e);
			}

			if (!sessionToken) {
				console.log("No session token available - attempting anonymous quick edit save");
			}

			const apiUrl = `${API_BASE_URL}/characters/save`;

			const characterData = {
				...character,
				_isLocallyModified: undefined,
				_localVersion: undefined,
				_lastModified: undefined,
				_remoteVersion: undefined,
				_serverUpdatedAt: undefined,
				_fRace: undefined,
				_fClass: undefined,
				_fClassSimple: undefined,
				_fLevel: undefined,
				_fBackground: undefined,
				__prop: undefined,
			};

			const requestBody = {
				characterData: characterData,
				characterId: character.id,
				isEdit: true,
				baseUpdatedAt: character._serverUpdatedAt || null,
			};

			const headers = {
				"Content-Type": "application/json",
			};
			if (sessionToken) headers["X-Session-Token"] = sessionToken;

			const response = await fetch(apiUrl, {
				method: "POST",
				headers,
				body: JSON.stringify(requestBody),
			});

			if (response.status === 409) {
				const conflict = await response.json().catch(() => ({}));
				console.warn("CharacterManager: Quick edit conflict — adopting server state if newer");
				const serverTs = this._toTimestampMs(conflict.updatedAt);
				const localTs = this._getLocalEffectiveTs(character);
				if (!opts.isConflictRetry && localTs > serverTs && conflict.updatedAt) {
					character._serverUpdatedAt = conflict.updatedAt;
					return this._saveQuickEditToServer(character, { isConflictRetry: true });
				}
				if (conflict.characterData) {
					conflict.characterData.id = character.id;
					conflict.characterData._isLocallyModified = false;
					this._applyServerTimestamp(conflict.characterData, conflict.updatedAt);
					this._applyResolvedCharacter(conflict.characterData, true);
				}
				return;
			}

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(`Server save failed: ${response.status} - ${errorData.error || "Unknown error"}`);
			}

			const result = await response.json();
			console.log(`CharacterManager: Quick edit saved to server successfully:`, result);

			// Clear the local modification flags since it's now synced
			character._isLocallyModified = false;
			if (result.updatedAt) {
				this._applyServerTimestamp(character, result.updatedAt);
			}
			this._updateLocalStorageCache(character);
			character._localVersion = undefined;
		} catch (error) {
			console.error(`CharacterManager: Error saving quick edit to server:`, error);
			// Don't throw - we want quick edits to work even if server save fails
		}
	}

	/**
	 * Update HP for a character (most common quick edit)
	 * @param {string} characterId - Character ID
	 * @param {number} newHp - New HP value
	 */
	static updateCharacterHp (characterId, newHp) {
		return this.updateCharacterQuickEdit(characterId, { hp: newHp });
	}

	/**
	 * Helper to update DataLoader cache after character changes
	 */
	static _updateDataLoaderCache () {
		if (this._charactersArray.length > 0 && typeof DataLoader !== "undefined") {
			const formattedData = { character: [...this._charactersArray] };
			DataLoader._pCache_addToCache({
				allDataMerged: formattedData,
				propAllowlist: new Set(["character"]),
			});
		}
	}

	/**
	 * Force invalidation of all caches to ensure UI shows fresh data
	 */
	static _invalidateAllCaches () {
		try {
			// Clear DataLoader cache
			if (typeof DataLoader !== "undefined") {
				// Force DataLoader to refresh character data
				const formattedData = { character: [...this._charactersArray] };
				DataLoader._pCache_addToCache({
					allDataMerged: formattedData,
					propAllowlist: new Set(["character"]),
				});
			}

			// Clear blob list cache to force fresh metadata fetch
			try {
				localStorage.removeItem(this._LIST_CACHE_KEY);
			} catch (e) {
				console.warn("CharacterManager: Error clearing blob list cache:", e);
			}

			// Force refresh of blob cache timestamps
			for (const [id, cached] of this._blobCache.entries()) {
				const character = this._characters.get(id);
				if (character) {
					// Update with current character data and fresh timestamp
					this._blobCache.set(id, {
						...cached,
						character: character,
						lastFetched: Date.now(),
					});
				}
			}
		} catch (e) {
			console.warn("CharacterManager: Error during cache invalidation:", e);
		}
	}

	/**
	 * Update localStorage cache if this character is currently being edited
	 * @param {Object} character - Updated character data
	 */
	static _updateLocalStorageCache (character) {
		// Update 'editingCharacter' entry if it exists and matches this character
		try {
			const editingCharacterData = localStorage.getItem("editingCharacter");
			if (editingCharacterData) {
				const editingCharacter = JSON.parse(editingCharacterData);
				const editingId = editingCharacter.id || this._generateCompositeId(editingCharacter.name, editingCharacter.source);
				if (editingId === character.id) {
					localStorage.setItem("editingCharacter", JSON.stringify(character));
				}
			}
		} catch (e) {
			console.warn("CharacterManager: Error updating editingCharacter in localStorage:", e);
		}

		// ALWAYS update the main character cache in localStorage
		// This ensures saved characters persist through page refreshes
		try {
			// Load existing stored characters
			const stored = this._loadFromLocalStorage();
			const mergedMap = new Map();

			// Add existing stored characters first
			for (const c of stored) {
				if (c && c.id) mergedMap.set(c.id, c);
			}

			// Add current in-memory characters (they should be authoritative)
			for (const c of this._charactersArray) {
				if (c && c.id) mergedMap.set(c.id, c);
			}

			// Ensure the recently updated character is included (upsert)
			if (character && character.id) {
				mergedMap.set(character.id, character);
			}

			const mergedArray = Array.from(mergedMap.values());

			// Save with proper error handling
			this._saveToLocalStorage(mergedArray);

			// Update blob cache with fresh timestamp so loading logic knows this is current
			if (character && character.id) {
				const existingBlobCache = this._blobCache.get(character.id);
				this._blobCache.set(character.id, {
					blob: existingBlobCache?.blob || {
						id: character.id,
						url: `localStorage://${character.id}`,
						lastModified: Date.now(),
					},
					character: character,
					lastFetched: Date.now(), // Mark as fresh
				});
			}

			// Force cache invalidation to ensure UI shows updated data
			this._invalidateAllCaches();
		} catch (e) {
			console.warn("CharacterManager: Error merging character into localStorage cache:", e);
		}
	}

	/**
	 * Remove a character by ID from all local caches (even if not currently in memory).
	 * @param {string} id - Character ID to remove
	 */
	static removeCharacter (id) {
		if (!id) return;

		const hadMemory = this._characters.has(id);

		this._characters.delete(id);
		if (this._blobCache.has(id)) this._blobCache.delete(id);

		const index = this._charactersArray.findIndex(c => c && c.id === id);
		if (index >= 0) this._charactersArray.splice(index, 1);

		try {
			this._saveToLocalStorage([...this._charactersArray.filter(Boolean)]);
		} catch (e) {
			console.warn("CharacterManager: Failed to persist deletion to localStorage:", e);
		}

		try {
			const stored = this._loadFromLocalStorage() || [];
			const filtered = stored.filter(c => c && c.id !== id);
			if (filtered.length !== stored.length) this._saveToLocalStorage(filtered);
		} catch (e) { /* ignore */ }

		try {
			const { summaries } = this._loadSummariesFromCache();
			const filteredSummaries = summaries.filter(s => s && s.id !== id);
			this._saveSummariesToCache(filteredSummaries);
		} catch (e) { /* ignore */ }

		try {
			this._broadcastSync("CHARACTER_DELETED", { characterId: id });
		} catch (e) {
			console.warn("CharacterManager: Failed to broadcast CHARACTER_DELETED:", e);
		}

		try {
			const editingRaw = localStorage.getItem("editingCharacter");
			if (editingRaw) {
				try {
					const editing = JSON.parse(editingRaw);
					if (editing && (editing.id === id
						|| this._generateCompositeId(editing.name, editing.source) === id)) {
						localStorage.removeItem("editingCharacter");
					}
				} catch (e) { /* ignore malformed editingCharacter */ }
			}

			if (globalThis._CHARACTER_EDIT_DATA && globalThis._CHARACTER_EDIT_DATA[id]) {
				delete globalThis._CHARACTER_EDIT_DATA[id];
			}
		} catch (e) {
			console.warn("CharacterManager: Error clearing editing state for deleted character:", e);
		}

		try {
			this.invalidateBlobListCache();
		} catch (e) {
			try { this._invalidateBlobListCache(); } catch (e2) { /* ignore */ }
		}

		if (hadMemory) this._notifyListeners();
	}

	/**
	 * DEPRECATED: Use loadCharacterSummaries(true) to force refresh of summaries
	 * @deprecated
	 */
	static async reloadCharacters () {
		throw new Error("reloadCharacters() is deprecated. Use loadCharacterSummaries(true) to force refresh of summaries.");
	}

	/**
	 * Clear all cached data
	 */
	static clearCache () {
		this._characters.clear();
		this._charactersArray.length = 0;
		this._blobCache.clear(); // Clear blob cache as well
		this._isLoaded = false;
		this._isLoading = false;
		this._loadPromise = null;

		// Also clear the blob list cache
		try {
			localStorage.removeItem(this._LIST_CACHE_KEY);
		} catch (e) {
			console.warn("CharacterManager: Error clearing blob list cache:", e);
		}

		this._notifyListeners();
	}

	/**
	 * Invalidate the blob list cache to force fresh list fetch on next load
	 */
	static invalidateBlobListCache () {
		try {
			localStorage.removeItem(this._LIST_CACHE_KEY);
		} catch (e) {
			console.warn("CharacterManager: Error invalidating blob list cache:", e);
		}
	}

	/**
	 * Force-fetch the server blob list and character summaries, purging any local characters
	 * not present on the server. Public convenience method intended for UI actions like a manual "Refresh" button.
	 * @returns {Promise<Array>} Refreshed character summaries
	 */
	static async forceRefreshListAndReload () {
		// Force a fresh blob list from server and refresh summaries
		try {
			const summaries = await this.loadCharacterSummaries(true);
			// Suppress background checks for a short window to avoid immediate racing reloads
			this._suppressBackgroundChecksUntil = Date.now() + 10 * 1000; // 10s
			return summaries;
		} catch (e) {
			console.error("CharacterManager: Force refresh failed:", e);
			throw e;
		}
	}

	/**
	 * Similar to _invalidateAllCaches but DO NOT remove the blob list cache.
	 * Used after we've just fetched the server list to avoid double-fetching.
	 */
	static _invalidateCachesKeepList () {
		try {
			// Clear DataLoader cache
			if (typeof DataLoader !== "undefined") {
				const formattedData = { character: [...this._charactersArray] };
				DataLoader._pCache_addToCache({
					allDataMerged: formattedData,
					propAllowlist: new Set(["character"]),
				});
			}

			// NOTE: Intentionally do not remove this._LIST_CACHE_KEY here

			// Force refresh of blob cache timestamps
			for (const [id, cached] of this._blobCache.entries()) {
				const character = this._characters.get(id);
				if (character) {
					this._blobCache.set(id, {
						...cached,
						character: character,
						lastFetched: Date.now(),
					});
				}
			}
		} catch (e) {
			console.warn("CharacterManager: Error during cache invalidation (keep list):", e);
		}
	}

	/**
	 * Start a daily recheck of the `/characters/list` endpoint to ensure
	 * newly added or deleted characters on the server are discovered.
	 * This runs at most once per 24 hours.
	 * @param {number} intervalMs - Interval for the daily check (default 24h)
	 */
	static startDailyListRecheck (intervalMs = 24 * 60 * 60 * 1000) {
		try {
			if (this._dailyListInterval) {
				clearInterval(this._dailyListInterval);
			}

			// Run immediately once, then on the interval
			const runCheck = async () => {
				try {
					// Check cached timestamp first; only force a server fetch if cache is
					// older than the configured interval (default 24h). This avoids
					// unnecessary network requests on simple page navigations.
					const cachedRaw = localStorage.getItem(this._LIST_CACHE_KEY);
					let cachedTs = 0;
					let cachedBlobs = [];
					if (cachedRaw) {
						try {
							const parsed = JSON.parse(cachedRaw);
							cachedTs = parsed.ts || 0;
							cachedBlobs = parsed.blobs || [];
						} catch (e) { cachedTs = 0; cachedBlobs = []; }
					}

					// If cached list is recent enough, skip forced fetch
					if (cachedTs && (Date.now() - cachedTs) < intervalMs) {
						// Nothing to do — cache is fresh
						return;
					}

					// Cache is stale (or missing) — force a server list fetch and compare
					const serverBlobs = await this._getBlobList(null, true); // force fetch
					const serverIds = new Set((serverBlobs || []).map(b => b.id));
					const cachedIds = new Set((cachedBlobs || []).map(b => b.id));
					let changed = false;
					if (serverIds.size !== cachedIds.size) changed = true;
					else {
						for (const id of serverIds) if (!cachedIds.has(id)) { changed = true; break; }
					}
					if (changed) {
						console.log("CharacterManager: Daily list recheck detected changes; invalidating caches and reloading");
						try { localStorage.setItem(this._LIST_CACHE_KEY, JSON.stringify({ blobs: serverBlobs || [], ts: Date.now() })); } catch (e) { /* ignore */ }
						this._invalidateAllCaches();
						await this.loadCharacterSummaries(true);
						await this.reconcileWithServer();
					}
				} catch (e) {
					console.warn("CharacterManager: Daily list recheck failed:", e);
				}
			};

			// Run an immediate check, but don't block
			runCheck();

			this._dailyListInterval = setInterval(runCheck, intervalMs);
		} catch (e) {
			console.warn("CharacterManager: Failed to start daily list recheck:", e);
		}
	}

	static _stopDailyListRecheck () {
		if (this._dailyListInterval) {
			clearInterval(this._dailyListInterval);
			this._dailyListInterval = null;
		}
	}

	/**
	 * Integration method for existing 5etools data loader patterns
	 * This makes characters work like any other content type in the system
	 */
	static async pGetCharacterData () {
		await this.loadCharacterSummaries(true);
		const characters = this.getCharacters();
		return { character: characters };
	}

	/**
	 * Check if the user can edit a character based on user authentication
	 * @param {Object|string} characterOrSource - Character object or source name
	 * @returns {boolean} True if user can edit this character
	 */
	static canEditCharacter (characterOrSource) {
		try {
			const sessionToken = localStorage.getItem("sessionToken");
			const currentUserData = localStorage.getItem("currentUser");

			if (!sessionToken || !currentUserData) {
				return false;
			}

			const currentUser = JSON.parse(currentUserData);
			const source = typeof characterOrSource === "string"
				? characterOrSource
				: characterOrSource?.source;

			if (!source || source === "Unknown" || source === "") {
				return false;
			}

			const username = (currentUser.username || "").toLowerCase();
			const sourceLc = String(source).toLowerCase();

			// Owner match (source is typically username)
			if (username && sourceLc === username) return true;

			// Backward-compatible personal bucket names
			if (username && ["mycharacters", "my characters"].includes(sourceLc)) return true;

			// Authenticated user editing their own loaded character by ownership hint
			const owner = typeof characterOrSource === "object" ? characterOrSource?._owner || characterOrSource?.owner : null;
			if (owner && String(owner).toLowerCase() === username) return true;

			return false;
		} catch (e) {
			console.error("Error checking character edit permissions:", e);
			return false;
		}
	}

	/**
	 * Promise-based save character method (matches 5etools naming convention)
	 * @param {Object} characterData - Character data to save
	 * @param {boolean} isEdit - Whether this is an edit of existing character
	 * @returns {Promise<boolean>} Success status
	 */
	static async pSaveCharacter (characterData, isEdit = false) {
		return this.saveCharacter(characterData, isEdit);
	}

	/**
	 * Save character to server (handles both new and existing characters)
	 * @param {Object} characterData - Character data to save
	 * @param {boolean} isEdit - Whether this is an edit of existing character
	 * @param {Object} [opts]
	 * @param {boolean} [opts.isConflictRetry] - Internal: already retried after 409
	 * @returns {Promise<boolean>} Success status
	 */
	static async saveCharacter (characterData, isEdit = false, opts = {}) {
		if (!characterData || !characterData.source) {
			console.warn("CharacterManager: Cannot save character without source");
			return false;
		}

		if (!this.canEditCharacter(characterData)) {
			console.warn("CharacterManager: No permission to edit character from source:", characterData.source);
			return false;
		}

		try {
			// Get session token for authentication
			const sessionToken = localStorage.getItem("sessionToken");
			if (!sessionToken) {
				console.error("CharacterManager: No session token found");
				return false;
			}

			// Resolve canonical server ID so we UPDATE instead of duplicate-INSERT
			const previousId = characterData.id || null;
			const characterId = await this._resolveCanonicalCharacterId(characterData, previousId);
			const baseUpdatedAt = characterData._serverUpdatedAt || null;
			const treatAsEdit = !!(isEdit || (characterId && characterId === previousId) || characterData._serverUpdatedAt);

			const response = await fetch(`${API_BASE_URL}/characters/save`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Session-Token": sessionToken,
				},
				body: JSON.stringify({
					characterData: characterData,
					isEdit: treatAsEdit,
					characterId: characterId,
					baseUpdatedAt: baseUpdatedAt,
				}),
			});

			if (response.ok) {
				const saveResult = await response.json();
				const serverUpdatedAt = saveResult.updatedAt || new Date().toISOString();
				const resolvedId = saveResult.characterId || characterId;

				// Mark the character as synchronized (saved to server)
				const now = Date.now();
				characterData.id = resolvedId;
				characterData._localVersion = now;
				characterData._lastModified = now;
				characterData._isLocallyModified = false;
				this._applyServerTimestamp(characterData, serverUpdatedAt);
				this._clearTombstone(characterData.name, characterData.source, resolvedId);

				// Drop stale alias IDs (composite vs name-userId)
				if (previousId && previousId !== resolvedId) {
					this.removeCharacter(previousId);
					this._removeCharacterFromCache(previousId);
				}
				this._purgeLocalByNameAndSource(characterData.name, characterData.source);
				// Re-add the canonical copy after purge
				this.addOrUpdateCharacter(characterData, false);

				// Update blob cache with the fresh blob info from save result
				if (saveResult.blob) {
					this._blobCache.set(resolvedId, {
						blob: {
							id: resolvedId,
							url: saveResult.blob.url,
							uploadedAt: saveResult.blob.uploadedAt || serverUpdatedAt,
							size: saveResult.blob.size,
							pathname: saveResult.blob.pathname,
						},
						character: characterData,
						lastFetched: Date.now(),
					});
				}

				// Also ensure localStorage is updated
				this._updateLocalStorageCache(characterData);

				// Update character summaries cache for immediate visibility in character list
				this._addCharacterToSummariesCache(characterData);

				// Invalidate blob list cache to ensure server sync on next list load
				this.invalidateBlobListCache();

				// Broadcast change to other tabs
				this._broadcastSync("CHARACTER_UPDATED", { character: characterData });

				return true;
			}

			if (response.status === 409) {
				const conflict = await response.json().catch(() => ({}));
				const serverUpdatedAt = conflict.updatedAt;
				const serverChar = conflict.characterData;
				const localTs = this._getLocalEffectiveTs(characterData);
				const serverTs = this._toTimestampMs(serverUpdatedAt);

				console.warn("CharacterManager: Save conflict (409)", { localTs, serverTs, serverUpdatedAt });

				if (!opts.isConflictRetry && characterData._isLocallyModified !== false && localTs > serverTs) {
					// Local is newer — retry once using server's current updatedAt as base
					characterData._serverUpdatedAt = serverUpdatedAt;
					return this.saveCharacter(characterData, true, { isConflictRetry: true });
				}

				// Server is newer (or retry already attempted) — adopt server copy
				if (serverChar) {
					serverChar.id = characterId;
					serverChar._isLocallyModified = false;
					this._applyServerTimestamp(serverChar, serverUpdatedAt);
					this._applyResolvedCharacter(serverChar, true);
					this._broadcastSync("CHARACTER_UPDATED", { character: serverChar });
				}
				return false;
			}

			const error = await response.json().catch(() => ({}));
			console.error("CharacterManager: Server error saving character:", error);
			return false;
		} catch (error) {
			console.error("CharacterManager: Error saving character:", error);
			// Queue for later if offline
			if (!navigator.onLine) {
				characterData._isLocallyModified = true;
				characterData._lastModified = characterData._lastModified || Date.now();
				this._addToOfflineQueue(isEdit ? "update" : "create", characterData);
			}
			return false;
		}
	}

	/**
	 * Delete a character from server and purge all local caches.
	 * @param {string} characterId - Preferred character ID
	 * @param {Object} [characterHint] - Optional character object from the editor when not in memory
	 * @returns {Promise<boolean>} Success status
	 */
	static async pDeleteCharacter (characterId, characterHint = null) {
		const sessionToken = localStorage.getItem("sessionToken");
		if (!sessionToken) {
			console.error("CharacterManager: No session token found");
			return false;
		}

		// Resolve the best character object we can (memory → localStorage → editor hint)
		let character = null;
		if (characterId) {
			character = this.getCharacterById(characterId)
				|| this._getCachedCharacterById(characterId)
				|| this._characters.get(characterId)
				|| null;
		}
		if (!character && characterHint && typeof characterHint === "object") {
			character = characterHint;
		}
		if (!character && characterId) {
			const locals = this._loadFromLocalStorage() || [];
			character = locals.find(c => c && (c.id === characterId
				|| this._generateCompositeId(c.name, c.source) === characterId)) || null;
		}

		if (character && !this.canEditCharacter(character)) {
			console.warn(`CharacterManager: No permission to delete character: ${character.name}`);
			return false;
		}

		// Collect candidate server IDs — editor often has composite id while D1 uses name-userId
		const candidateIds = [];
		const pushId = (id) => {
			if (id && !candidateIds.includes(id)) candidateIds.push(id);
		};
		pushId(characterId);
		pushId(character?.id);
		if (character?.name) {
			pushId(this._generateCompositeId(character.name, character.source));
		}

		// Also try matching against the live server list by name
		const matchedServerIds = [];
		try {
			const blobs = await this._getBlobList(null, true);
			const nameLc = (character?.name || "").toLowerCase();
			for (const blob of (blobs || [])) {
				if (!blob?.id) continue;
				const blobName = (blob.character_name || blob.name || "").toLowerCase();
				const nameSlug = nameLc.replace(/[^a-z0-9_-]/g, "");
				const isNameMatch = nameLc && blobName === nameLc;
				const isIdPrefixMatch = nameSlug && String(blob.id).toLowerCase().startsWith(nameSlug);
				if (isNameMatch || isIdPrefixMatch) {
					pushId(blob.id);
					if (!matchedServerIds.includes(blob.id)) matchedServerIds.push(blob.id);
				}
			}
		} catch (e) {
			console.warn("CharacterManager: Could not resolve delete IDs from server list:", e);
		}

		if (!candidateIds.length) {
			console.warn("CharacterManager: No character ID available for deletion");
			return false;
		}

		let serverDeleted = false;
		let lastError = null;
		const resolvedIds = []; // ok or already-absent

		for (const id of candidateIds) {
			try {
				const response = await fetch(`${API_BASE_URL}/characters/delete?id=${encodeURIComponent(id)}`, {
					method: "DELETE",
					headers: {
						"Content-Type": "application/json",
						"X-Session-Token": sessionToken,
					},
				});

				if (response.ok) {
					serverDeleted = true;
					resolvedIds.push(id);
					console.log(`CharacterManager: Deleted character on server: ${id}`);
					continue;
				}

				const error = await response.json().catch(() => ({}));
				if (response.status === 404) {
					resolvedIds.push(id);
					console.log(`CharacterManager: Character already absent on server: ${id}`);
					continue;
				}
				lastError = error;
				console.error("CharacterManager: Server error deleting character:", id, error);
			} catch (error) {
				lastError = error;
				console.error("CharacterManager: Error deleting character:", id, error);
			}
		}

		// Purge every local copy we know about (by all candidate ids + name/source)
		for (const id of candidateIds) {
			this.removeCharacter(id);
			this._removeCharacterFromCache(id);
		}
		if (character?.name) {
			this._purgeLocalByNameAndSource(character.name, character.source);
		}

		this.invalidateBlobListCache();
		this._clearSummariesCache();
		this._notifyListeners();

		if (serverDeleted || matchedServerIds.every(id => resolvedIds.includes(id)) || matchedServerIds.length === 0) {
			this._markTombstone(character?.name, character?.source, characterId);
			return true;
		}

		console.error("CharacterManager: Delete failed for server-matched IDs", { matchedServerIds, resolvedIds, lastError });
		return false;
	}

	/**
	 * Remove local characters matching name+source regardless of id scheme.
	 */
	static _purgeLocalByNameAndSource (name, source) {
		if (!name) return;
		const targetComposite = this._generateCompositeId(name, source);
		const toRemove = new Set();

		for (const [id, c] of this._characters.entries()) {
			if (!c?.name) continue;
			if (c.name === name && (c.source || "") === (source || "")) toRemove.add(id);
			if (this._generateCompositeId(c.name, c.source) === targetComposite) toRemove.add(id);
		}

		for (const c of (this._loadFromLocalStorage() || [])) {
			if (!c?.name) continue;
			if (c.name === name && (c.source || "") === (source || "")) {
				if (c.id) toRemove.add(c.id);
				toRemove.add(this._generateCompositeId(c.name, c.source));
			}
		}

		for (const id of toRemove) {
			this.removeCharacter(id);
			this._removeCharacterFromCache(id);
		}
	}

	/**
	 * Update a character stat and save to server
	 * @param {string} characterId - Character ID
	 * @param {string} statPath - Dot notation path to stat (e.g., "hp.current")
	 * @param {any} newValue - New value for the stat
	 * @returns {Promise<boolean>} Success status
	 */
	static async updateCharacterStat (characterId, statPath, newValue) {
		const character = this.getCharacterById(characterId);
		if (!character) {
			console.warn(`CharacterManager: Character ${characterId} not found for stat update`);
			return false;
		}

		if (!this.canEditCharacter(character)) {
			console.warn(`CharacterManager: No permission to edit character: ${character.name}`);
			return false;
		}

		try {
			// Parse and set the value
			const parsedValue = this._parseStatValue(newValue);
			this._setNestedProperty(character, statPath, parsedValue);

			// Save to server first
			const success = await this.saveCharacter(character, true);

			if (success) {
				// Only update local caches if server save succeeded
				this.updateCharacterQuickEdit(characterId, { [this._getTopLevelProperty(statPath)]: this._getNestedProperty(character, this._getTopLevelProperty(statPath)) });
			} else {
				// Revert local changes if server update failed
				console.warn("CharacterManager: Server update failed, reverting local changes");
				await this.ensureFullCharacter(characterId, { forceNetwork: true });
			}

			return success;
		} catch (error) {
			console.error("CharacterManager: Error updating character stat:", error);
			return false;
		}
	}

	/**
	 * Helper to parse stat values to appropriate types
	 */
	static _parseStatValue (value) {
		if (value === null || value === "" || value === undefined) {
			return null;
		}
		// Try to parse as number if it looks like one
		const numValue = Number(value);
		if (!isNaN(numValue) && value.toString().trim() !== "") {
			return numValue;
		}
		return value; // Return as string if not a number
	}

	/**
	 * Helper to set nested properties using dot notation
	 */
	static _setNestedProperty (obj, path, value) {
		const keys = path.split(".");
		const lastKey = keys.pop();
		const target = keys.reduce((current, key) => {
			if (!current[key] || typeof current[key] !== "object") {
				current[key] = {};
			}
			return current[key];
		}, obj);

		// Handle null/empty values appropriately
		if (value === null || value === "" || value === undefined) {
			delete target[lastKey];
		} else {
			target[lastKey] = value;
		}
	}

	/**
	 * Helper to get nested properties using dot notation
	 */
	static _getNestedProperty (obj, path) {
		return path.split(".").reduce((current, key) => current?.[key], obj);
	}

	/**
	 * Helper to get top-level property from dot notation path
	 */
	static _getTopLevelProperty (path) {
		return path.split(".")[0];
	}

	/**
	 * Generate composite ID from character name and source
	 * @param {string} name - Character name
	 * @param {string} source - Character source
	 * @returns {string} Composite ID
	 */
	static _generateCompositeId (name, source) {
		if (!name) return null;
		const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
		const cleanSource = (source || "unknown").toLowerCase().replace(/[^a-z0-9_-]/g, "");
		return `${cleanName}_${cleanSource}`;
	}

	/**
	 * Helper to generate character ID (legacy method, now uses composite ID)
	 */
	static _generateCharacterId (name, source) {
		return this._generateCompositeId(name, source);
	}

	/**
	 * Apply a WebSocket CHARACTER_UPDATED/CREATED broadcast with LWW gating.
	 * Never wipe a newer dirty local copy.
	 * @param {Object} data - Broadcast payload
	 */
	static async _applyRemoteBroadcast (data) {
		const characterId = data.characterId;
		if (!characterId) return;

		const remoteUpdatedAt = data.updatedAt || null;
		const remoteTs = this._toTimestampMs(remoteUpdatedAt);
		const local = this._getCachedCharacterById(characterId);

		if (local) {
			const localTs = this._getLocalEffectiveTs(local);
			const localServerTs = this._toTimestampMs(local._serverUpdatedAt);

			// Stale broadcast relative to what we already have from server
			if (remoteTs && localServerTs && remoteTs < localServerTs && !local._isLocallyModified) {
				console.log(`CharacterManager: Ignoring stale broadcast for ${characterId} (${remoteUpdatedAt} < ${local._serverUpdatedAt})`);
				return;
			}

			// Local dirty and newer than broadcast — keep local, queue push
			if (local._isLocallyModified && localTs > remoteTs) {
				console.log(`CharacterManager: Keeping newer local edits for ${characterId}; queueing push`);
				this._addToOfflineQueue("update", local);
				return;
			}
		}

		let updatedCharacter = null;
		if (data.characterData) {
			updatedCharacter = { ...data.characterData };
			updatedCharacter.id = characterId;
			updatedCharacter._isLocallyModified = false;
			if (remoteUpdatedAt) this._applyServerTimestamp(updatedCharacter, remoteUpdatedAt);
		} else {
			// No payload — fetch from server (bypass local cache)
			try {
				updatedCharacter = await this.ensureFullCharacter(characterId, { forceNetwork: true });
			} catch (e) {
				console.warn(`CharacterManager: Failed to fetch character ${characterId} after broadcast:`, e);
				return;
			}
		}

		if (!updatedCharacter) return;

		this._clearSummariesCache();
		this._applyResolvedCharacter(updatedCharacter, true);
		this._addCharacterToSummariesCache(updatedCharacter);

		if (typeof CharacterP2P !== "undefined" && CharacterP2P._updateUIComponentsWithCharacter) {
			CharacterP2P._updateUIComponentsWithCharacter(updatedCharacter, characterId);
		}

		console.log(`CharacterManager: Applied remote broadcast for ${updatedCharacter.name || characterId}`);
	}

	/**
	 * Reconcile local caches with server list (source of truth) on connect/reconnect.
	 */
	static async reconcileWithServer () {
		if (this._reconcileInProgress) {
			console.log("CharacterManager: Reconcile already in progress");
			return;
		}
		if (!navigator.onLine) {
			console.log("CharacterManager: Skipping reconcile while offline");
			return;
		}

		this._reconcileInProgress = true;
		try {
			console.log("CharacterManager: Reconciling with server...");
			this.invalidateBlobListCache();
			this._clearSummariesCache();

			const blobs = await this._getBlobList(null, true);
			const serverIds = new Set((blobs || []).map(b => b.id).filter(Boolean));

			for (const blob of (blobs || [])) {
				const id = blob.id;
				if (!id) continue;
				const serverUpdatedAt = blob.updated_at || blob.uploadedAt || null;
				const serverTs = this._toTimestampMs(serverUpdatedAt);
				const local = this._getCachedCharacterById(id);

				if (local?._isLocallyModified && this._getLocalEffectiveTs(local) > serverTs) {
					console.log(`CharacterManager: Pushing newer local edits for ${id}`);
					await this.saveCharacter(local, true);
					continue;
				}

				const localServerTs = this._toTimestampMs(local?._serverUpdatedAt);
				if (!local || (serverTs && serverTs > localServerTs)) {
					try {
						await this.ensureFullCharacter(id, { forceNetwork: true });
					} catch (e) {
						console.warn(`CharacterManager: Reconcile fetch failed for ${id}:`, e);
					}
				}
			}

			// Local dirty orphans not on server → push create/save (unless tombstoned)
			const localAll = [
				...this._charactersArray.filter(Boolean),
				...(this._loadFromLocalStorage() || []),
			];
			const seen = new Set();
			for (const local of localAll) {
				if (!local?.id || seen.has(local.id)) continue;
				seen.add(local.id);
				if (this._isTombstoned(local)) {
					console.log(`CharacterManager: Skipping tombstoned local character ${local.id}`);
					this.removeCharacter(local.id);
					this._removeCharacterFromCache(local.id);
					continue;
				}
				if (!serverIds.has(local.id) && local._isLocallyModified) {
					console.log(`CharacterManager: Pushing orphan local character ${local.id}`);
					await this.saveCharacter(local, false);
				} else if (!serverIds.has(local.id) && !local._isLocallyModified) {
					console.log(`CharacterManager: Removing stale local character missing on server: ${local.id}`);
					this._removeCharacterFromCache(local.id);
				}
			}

			await this._processOfflineQueue();
			this._notifyListeners();
			console.log("CharacterManager: Reconcile complete");
		} catch (e) {
			console.warn("CharacterManager: Reconcile failed:", e);
		} finally {
			this._reconcileInProgress = false;
		}
	}

	/**
	 * Wire online event to drain offline queue and reconcile once.
	 */
	static _initOnlineSync () {
		if (this._onlineListenerSet) return;
		this._onlineListenerSet = true;
		try {
			window.addEventListener("online", () => {
				console.log("CharacterManager: Back online — reconciling");
				this.reconcileWithServer().catch(err => {
					console.warn("CharacterManager: Online reconcile failed:", err);
				});
			});
			this._loadOfflineQueue();
		} catch (e) {
			console.warn("CharacterManager: Failed to init online sync:", e);
		}
	}

	/**
	 * Initialize cross-tab synchronization
	 * Listen for storage events to sync character changes across tabs
	 */
	static _initCrossTabSync () {
		// Listen for localStorage changes from other tabs
		window.addEventListener("storage", (event) => {
			// Only handle our character-related storage changes
			if (event.key === "characterManager_sync" && event.newValue) {
				try {
					const syncData = JSON.parse(event.newValue);
					this._handleCrossTabSync(syncData);
				} catch (e) {
					console.warn("CharacterManager: Error parsing cross-tab sync data:", e);
				}
			}
		});
	}

	/**
	 * Handle cross-tab synchronization events
	 */
	static _handleCrossTabSync (syncData) {
		const { type, character, characterId } = syncData;

		switch (type) {
			case "CHARACTER_UPDATED":
				if (character && character.id) {
					const existing = this._characters.get(character.id);
					const incomingTs = this._getLocalEffectiveTs(character);
					const existingTs = this._getLocalEffectiveTs(existing);
					// Only apply if incoming is newer or we don't have it yet
					if (existing && existingTs > incomingTs) {
						console.log(`CharacterManager: Ignoring older cross-tab update for ${character.id}`);
						break;
					}

					this._characters.set(character.id, character);

					const index = this._charactersArray.findIndex(c => c.id === character.id);
					if (index !== -1) {
						this._charactersArray[index] = character;
					} else {
						this._charactersArray.push(character);
					}

					this._updateLocalStorageCache(character);

					if (globalThis._CHARACTER_EDIT_DATA && globalThis._CHARACTER_EDIT_DATA[character.id]) {
						globalThis._CHARACTER_EDIT_DATA[character.id] = character;
					}

					this._notifyListeners();
				}
				break;

			case "CHARACTER_DELETED":
				if (characterId) {
					this._markTombstone(null, null, characterId);
					this.removeCharacter(characterId);
					this._removeCharacterFromCache(characterId);
					this._notifyListeners();
				}
				break;

			case "CHARACTERS_RELOADED":
				// Another tab reloaded characters — refresh summaries from server
				this.forceRefreshCharacters();
				this.reconcileWithServer().catch(err => {
					console.warn("CharacterManager: Cross-tab reconcile failed:", err);
				});
				break;
		}
	}

	/**
	 * Broadcast character changes to other tabs
	 */
	static _broadcastSync (type, data = {}) {
		const syncData = {
			type,
			timestamp: Date.now(),
			...data,
		};

		// Use localStorage to communicate with other tabs
		// The storage event will fire in other tabs but not this one
		localStorage.setItem("characterManager_sync", JSON.stringify(syncData));

		// Clean up the sync item after a short delay to prevent clutter
		setTimeout(() => {
			if (localStorage.getItem("characterManager_sync") === JSON.stringify(syncData)) {
				localStorage.removeItem("characterManager_sync");
			}
		}, 1000);
	}

	/**
	 * Initialize WebRTC P2P sync (optional). Call this after page load if you want LAN P2P sync.
	 * @param {{signalingUrl?: string}} opts
	 */
	static p2pInit (opts = {}) {
		try {
			if (typeof CharacterP2P === "undefined") {
				console.warn("CharacterManager: CharacterP2P not available; skipping p2pInit");
				return;
			}

			// CharacterP2P.init() doesn't take parameters - it uses Cloudflare workers
			CharacterP2P.init();
		} catch (e) {
			console.warn("CharacterManager: p2pInit failed", e);
		}
	}

	/**
	 * Internal handler invoked by CharacterP2P when a remote peer sends a sync message.
	 * Accepts messages like { type: 'CHARACTER_UPDATED'|'CHARACTER_DELETED'|'CHARACTERS_RELOADED', character, characterId }
	 */
	static _handleP2PSync (msg) {
		try {
			if (!msg || !msg.type) return;
			const { type, character, characterId, origin } = msg;
			// Ignore messages originating from this client id (already applied locally)
			if (origin && typeof CharacterP2P !== "undefined" && origin === CharacterP2P.clientId) return;
			switch (type) {
				case "CHARACTER_UPDATED":
					if (character && character.id) {
						// Update full character cache if exists
						this.addOrUpdateCharacter(character, true);

						// Update summary cache with accurate data from full character
						const summary = this._extractCharacterSummary(character);
						if (summary) {
							const { summaries, timestamp } = this._loadSummariesFromCache();
							const summaryIndex = summaries.findIndex(s => s.id === character.id);
							if (summaryIndex >= 0) {
								summaries[summaryIndex] = summary;
							} else {
								summaries.push(summary);
							}
							this._saveSummariesToCache(summaries);
							console.log(`CharacterManager: Updated summary cache for ${character.name} via WebSocket`);
						}
					}
					break;
				case "CHARACTER_DELETED":
					if (characterId) {
						// Remove from both full and summary caches
						this.removeCharacter(characterId);

						// Also remove from summary cache
						const { summaries } = this._loadSummariesFromCache();
						const updatedSummaries = summaries.filter(s => s.id !== characterId);
						if (updatedSummaries.length !== summaries.length) {
							this._saveSummariesToCache(updatedSummaries);
							console.log(`CharacterManager: Removed ${characterId} from summary cache via WebSocket`);
						}

						// Character deletions might indicate server state changes, so invalidate list cache
						console.log("CharacterManager: Character deletion detected via WebSocket, invalidating list cache");
						this._invalidateBlobListCache();
					}
					break;
				case "CHARACTERS_RELOADED":
					// Clear summary cache to force fresh reload
					try {
						localStorage.removeItem(this._SUMMARIES_CACHE_KEY);
					} catch (e) { /* ignore */ }
					this.forceRefreshCharacters();
					this.reconcileWithServer().catch(err => {
						console.warn("CharacterManager: P2P reload reconcile failed:", err);
					});
					break;
			}
		} catch (e) {
			console.warn("CharacterManager: _handleP2PSync failed", e);
		}
	}

	/**
	 * Invalidate the blob list cache to force a fresh fetch on next load
	 * Use this when WebSocket events suggest the server character list may have changed
	 */
	static _invalidateBlobListCache () {
		try {
			localStorage.removeItem(this._LIST_CACHE_KEY);
		} catch (e) {
			console.warn("CharacterManager: Error invalidating blob list cache:", e);
		}
	}
}

// Initialize cross-tab synchronization when the class is loaded
CharacterManager._initCrossTabSync();
CharacterManager._initOnlineSync();

// Make it available globally for all scripts
// @ts-ignore - Intentionally adding to globalThis
globalThis.CharacterManager = CharacterManager;

// Auto-initialize P2P when running in a browser so pages automatically join the room.
// Non-blocking and guarded for non-browser environments.
try {
	if (typeof window !== "undefined" && (window.location?.protocol === "http:" || window.location?.protocol === "https:")) {
		// Defer slightly so other scripts can register listeners if needed
		setTimeout(() => {
			try {
				const CM = window["CharacterManager"];
				if (CM && typeof CM.p2pInit === "function") {
					// If a TURN key is present on window or a meta tag, pass it to p2pInit so
					// the browser can fetch TurnWebRTC credentials directly (insecure to expose key).

					try {
						CharacterP2P.init();
					} catch (e) {
					}
				}
			} catch (e) {
			}
		}, 500);
	}
} catch (e) {
	// ignore in non-browser contexts
}
