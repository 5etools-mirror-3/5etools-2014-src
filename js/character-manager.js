/**
 * Centralized Character Manager - Single Source of Truth for Character Data
 * Integrates with 5etools DataLoader system to prevent character duplication
 */

/*
 * Lightweight WebRTC P2P manager for character sync.
 * - Creates an RTCPeerConnection and DataChannel named "character-sync"
 * - Supports optional WebSocket signaling (provide signalingUrl) or manual copy/paste of offer/answer
 * - Sends/receives JSON messages; on receive, calls CharacterManager._handleP2PSync if available
 *
 * Usage:
 *  CharacterP2P.init({ signalingUrl: 'ws://192.168.1.10:9000' }); // optional
 *  // Or manual flow:
 *  const offer = await CharacterP2P.createOffer(); // paste to other peer
 *  await CharacterP2P.acceptOffer(remoteOffer); // returns answer to paste
 *  await CharacterP2P.setRemoteAnswer(remoteAnswer);
 *  CharacterP2P.send({ type: 'CHARACTER_UPDATED', character: {...} });
 */

class CharacterP2P {
	static _pc = null;
	static _dc = null;
	static _signalingSocket = null;
	static _lastInitOpts = null;
	static clientId = Math.random().toString(36).slice(2, 10);
	static _onOpen = [];
	static _knownPeers = new Set();
	static _reconnectAttempts = 0;
	static _reconnectTimer = null;
	static _maxReconnectAttempts = 6;
	static _announceTimer = null;
	static _announceInterval = 30 * 1000; // 30s

	static _startPeriodicAnnounce() {
		if (this._announceTimer) return;
		if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
		this._announceTimer = setInterval(() => {
			try {
				if (this._dc && this._dc.readyState === 'open') {
					this.send({ type: 'PEER_ANNOUNCE', clientId: this.clientId });
				} else if (this._signalingSocket && this._signalingSocket.readyState === WebSocket.OPEN) {
					this._signalingSocket.send(JSON.stringify({ type: 'relay', payload: { type: 'PEER_ANNOUNCE', clientId: this.clientId }, origin: this.clientId }));
				}
			} catch (e) { /* ignore */ }
		}, this._announceInterval);
	}

	static _stopPeriodicAnnounce() {
		if (this._announceTimer) { clearInterval(this._announceTimer); this._announceTimer = null; }
	}



	/**
	 * Initialize optional WebSocket signaling.
	 * @param {{signalingUrl?: string}} opts
	 */
	static async init(opts = {}) {
		// remember opts so reconnect attempts can re-use them
		this._lastInitOpts = opts || {};
	// turnApiKey is optional. We do NOT fetch TURN credentials from the API in-browser.
	// Instead, if a turnApiKey is provided we will use the TurnWebRTC relay WebSocket
	// as the signaling channel at wss://turnwebrtc.com/api/relay/{room}?apikey=KEY
	// (exposing the key in-browser is intentional for this flow)
	const turnApiKey = opts && opts['turnApiKey'] || "d881b9e9-09ec-4a9d-a826-4e10e7c75298";
	// Use Google's public STUN servers for local network discovery
	let iceServers = [
		{ urls: 'stun:stun.l.google.com:19302' },
		{ urls: 'stun:stun1.l.google.com:19302' }
	];

		// Create RTCPeerConnection with discovered ICE servers (or empty array)
		if (!this._pc) {
			this._pc = new RTCPeerConnection({ iceServers });

			// Handle remote datachannel (incoming)
			this._pc.ondatachannel = (ev) => {
				console.info('CharacterP2P: Received remote data channel');
				this._setupDataChannel(ev.channel);
			};

			// Gather ICE candidates and send via signaling if present
			this._pc.onicecandidate = (ev) => {
				if (!ev.candidate) {
					console.info('CharacterP2P: ICE gathering complete');
					return;
				}
				console.debug('CharacterP2P: New ICE candidate:', ev.candidate.type, ev.candidate.candidate);
				if (this._signalingSocket && this._signalingSocket.readyState === WebSocket.OPEN) {
					this._signalingSocket.send(JSON.stringify({ type: 'ice', candidate: ev.candidate, origin: this.clientId }));
				}
			};
			
			// Add connection state change logging
			this._pc.onconnectionstatechange = () => {
				console.info('CharacterP2P: Connection state:', this._pc.connectionState);
				if (this._pc.connectionState === 'connected') {
					console.info('CharacterP2P: WebRTC connection established!');
				} else if (this._pc.connectionState === 'failed') {
					console.warn('CharacterP2P: WebRTC connection failed');
				}
			};
			
			this._pc.oniceconnectionstatechange = () => {
				console.info('CharacterP2P: ICE connection state:', this._pc.iceConnectionState);
			};
		}

		// Determine signaling URL. Try TurnWebRTC with SSL fallback.
		const room = 'characters'
		let signalingUrl = `wss://turnwebrtc.com/api/relay/${room}?apikey=${turnApiKey}`;

		try {
			this._signalingSocket = new WebSocket(signalingUrl);
			this._signalingSocket.addEventListener('open', () => {
				console.info('CharacterP2P: signaling socket open', signalingUrl);
				this._setupWebSocketMessageHandlers();

				// Auto-create and send an offer after a staggered delay to reduce collisions.
				try {
					const seed = parseInt(this.clientId.slice(0, 4), 36) || Math.floor(Math.random() * 65535);
					const delay = seed % 3000; // up to 3s stagger (reduced for faster connection)
					console.info(`CharacterP2P: Will send offer in ${delay}ms with clientId: ${this.clientId}`);
					setTimeout(async () => {
						try {
							if (this._dc && this._dc.readyState === 'open') {
								console.info('CharacterP2P: Data channel already open, skipping offer');
								return;
							}
							console.info('CharacterP2P: Creating offer...');
							const offer = await this.createOffer();
							if (this._signalingSocket && this._signalingSocket.readyState === WebSocket.OPEN) {
								console.info('CharacterP2P: Sending offer to signaling server');
								this._signalingSocket.send(JSON.stringify({ type: 'offer', offer, origin: this.clientId }));
								this._offered = true;
							} else {
								console.warn('CharacterP2P: Signaling socket not ready when trying to send offer');
							}
						} catch (e) {
							console.warn('CharacterP2P: auto-offer failed', e);
						}
					}, delay);
				} catch (e) {
					console.info('CharacterP2P: failed to schedule auto-offer', e);
				}
			});

			this._signalingSocket.addEventListener('error', (ev) => {
				console.warn('CharacterP2P: signaling socket error', ev);
				// Try HTTP fallback if HTTPS failed due to SSL certificate issues
				this._signalingSocket = null;
				this._tryHttpFallback(room, turnApiKey);
			});
		} catch (e) {
			console.info(`CharacterP2P: could not connect to signaling URL ${signalingUrl}`, e);
			this._signalingSocket = null;
			console.info('CharacterP2P: operating in manual offer/answer mode.');
		}
	}

	/**
	 * Try HTTP fallback when HTTPS WebSocket fails due to SSL certificate issues
	 */
	static _tryHttpFallback(room, turnApiKey) {
		try {
			// Try unsecured WebSocket connection as fallback
			const httpSignalingUrl = `ws://turnwebrtc.com/api/relay/${room}?apikey=${turnApiKey}`;
			console.info('CharacterP2P: Trying HTTP fallback:', httpSignalingUrl);
			
			this._signalingSocket = new WebSocket(httpSignalingUrl);
			
			this._signalingSocket.addEventListener('open', () => {
				console.info('CharacterP2P: HTTP fallback WebSocket connected');
				// Set up the same message handlers as the main connection
				this._setupWebSocketMessageHandlers();
			});
			
			this._signalingSocket.addEventListener('error', (ev) => {
				console.info('CharacterP2P: HTTP fallback also failed, operating in manual mode');
				this._signalingSocket = null;
			});
			
		} catch (e) {
			console.info('CharacterP2P: HTTP fallback failed:', e);
		}
	}

	/**
	 * Set up WebSocket message handlers (shared between HTTPS and HTTP connections)
	 */
	static _setupWebSocketMessageHandlers() {
		if (!this._signalingSocket) return;
		
		this._signalingSocket.addEventListener('message', async (ev) => {
			try {
				const msg = JSON.parse(ev.data);
				console.info('CharacterP2P: Received message:', msg.type, 'from:', msg.origin);
				if (msg.origin === this.clientId) return; // ignore own messages
				
				if (msg.type === 'offer') {
					console.info('CharacterP2P: Received offer, creating answer...');
					const answer = await this.acceptOffer(msg.offer);
					console.info('CharacterP2P: Sending answer back...');
					this._signalingSocket.send(JSON.stringify({ type: 'answer', answer, origin: this.clientId }));
				} else if (msg.type === 'answer') {
					console.info('CharacterP2P: Received answer, setting remote answer...');
					await this.setRemoteAnswer(msg.answer);
				} else if (msg.type === 'ice' && msg.candidate) {
					console.debug('CharacterP2P: Adding ICE candidate:', msg.candidate.type);
					try {
						await this._pc.addIceCandidate(msg.candidate);
						console.debug('CharacterP2P: ICE candidate added successfully');
					} catch (e) {
						console.warn('CharacterP2P: Failed to add ICE candidate:', e.message);
					}
				} else if (msg.type === 'relay' && msg.payload) {
					try {
						const payload = msg.payload;
						if (typeof CharacterManager !== 'undefined' && CharacterManager._handleP2PSync) {
							CharacterManager._handleP2PSync(payload);
						}
					} catch (e) {
						console.warn('CharacterP2P: error handling relay payload', e);
					}
				}
			} catch (e) {
				console.warn('CharacterP2P: error parsing signaling message', e);
			}
		});
		
		this._signalingSocket.addEventListener('close', (ev) => {
			console.info('CharacterP2P: signaling socket closed', ev);
			if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
				this._startPeriodicAnnounce();
			}
		});
	}


	static _setupDataChannel(dc) {
		console.info('CharacterP2P: Setting up data channel, state:', dc.readyState);
		this._dc = dc;
		
		this._dc.onopen = () => {
			console.info('CharacterP2P: Data channel opened successfully!');
			// Announce ourselves so peers can list connected clients
			try {
				this._knownPeers.add(this.clientId);
				this._onOpen.forEach(fn => fn());
				this.send({ type: 'PEER_ANNOUNCE', clientId: this.clientId });
			} catch (e) {
				console.warn('CharacterP2P: peer announce failed', e);
			}
			// After a short delay, log discovered peers (excluding self)
			setTimeout(() => {
				const others = Array.from(this._knownPeers).filter(id => id !== this.clientId);
				console.info('CharacterP2P: known peers', others);
			}, 600);
		};
		
		this._dc.onerror = (error) => {
			console.error('CharacterP2P: Data channel error:', error);
		};
		
		this._dc.onmessage = (ev) => {
			try {
				const data = JSON.parse(ev.data);
				// Attach origin if not present
				data.origin = data.origin || 'p2p';
				if (data.type === 'PEER_ANNOUNCE' && data.clientId) {
					if (!this._knownPeers.has(data.clientId)) {
						this._knownPeers.add(data.clientId);
						console.info('CharacterP2P: discovered peer', data.clientId);
						// Reply with our announce so discovery is mutual
						try { this.send({ type: 'PEER_ANNOUNCE', clientId: this.clientId }); } catch (e) { /* ignore */ }
					}
					return;
				}
				if (typeof CharacterManager !== 'undefined' && CharacterManager._handleP2PSync) {
					CharacterManager._handleP2PSync(data);
				}
			} catch (e) {
				console.warn('CharacterP2P: error parsing message', e);
			}
		};
		
		this._dc.onclose = () => {
			console.info('CharacterP2P: Data channel closed');
			this._dc = null;
		};
		
		// If the channel is already open, trigger the onopen handler
		if (dc.readyState === 'open') {
			console.info('CharacterP2P: Data channel already open, triggering onopen');
			this._dc.onopen();
		}
	}

	/**
	 * Create an offer and local datachannel. Returns the SDP offer object (JSON) to share with a peer.
	 */
	static async createOffer() {
		if (!this._pc) this.init();

		// Create datachannel with better configuration
		console.info('CharacterP2P: Creating data channel...');
		const dc = this._pc.createDataChannel('character-sync', {
			ordered: true,
			maxRetransmits: 3
		});
		this._setupDataChannel(dc);

		console.info('CharacterP2P: Creating offer...');
		const offer = await this._pc.createOffer();
		await this._pc.setLocalDescription(offer);
		console.info('CharacterP2P: Local description set, waiting for ICE candidates...');

		// Wait for ICE gathering to finish with better timeout handling
		await new Promise(res => {
			if (this._pc.iceGatheringState === 'complete') {
				res();
			} else {
				const timeout = setTimeout(res, 1000); // 1 second timeout
				const onicechange = () => {
					if (this._pc.iceGatheringState === 'complete') {
						clearTimeout(timeout);
						this._pc.removeEventListener('icegatheringstatechange', onicechange);
						res();
					}
				};
				this._pc.addEventListener('icegatheringstatechange', onicechange);
			}
		});

		return this._pc.localDescription ? this._pc.localDescription.sdp : offer.sdp;
	}

	/**
	 * Accept a remote offer (SDP string or object). Returns an answer SDP string to send back.
	 */
	static async acceptOffer(remoteOffer) {
		if (!this._pc) this.init();

		// If passed an object with sdp, normalize
		const offer = (typeof remoteOffer === 'string') ? { type: 'offer', sdp: remoteOffer } : remoteOffer;
		console.info('CharacterP2P: Setting remote offer description...');
		await this._pc.setRemoteDescription(offer);

		// Create answer
		console.info('CharacterP2P: Creating answer...');
		const answer = await this._pc.createAnswer();
		await this._pc.setLocalDescription(answer);

		// Wait a moment for ICE
		await new Promise(res => setTimeout(res, 200));

		return this._pc.localDescription ? this._pc.localDescription.sdp : answer.sdp;
	}

	/**
	 * Set the remote answer (SDP) when acting as offerer.
	 */
	static async setRemoteAnswer(remoteAnswer) {
		if (!this._pc) this.init();
		const answer = (typeof remoteAnswer === 'string') ? { type: 'answer', sdp: remoteAnswer } : remoteAnswer;
		await this._pc.setRemoteDescription(answer);
	}

	/**
	 * Send a JSON-serializable object to the connected peer(s).
	 */
	static send(obj) {
		try {
			const payload = { ...(obj || {}), origin: this.clientId };
			const str = JSON.stringify(payload);
			if (this._dc && this._dc.readyState === 'open') {
				this._dc.send(str);
				return true;
			}
			// If no datachannel but signaling socket exists, relay via signaling channel (best-effort)
			if (this._signalingSocket && this._signalingSocket.readyState === WebSocket.OPEN) {
				this._signalingSocket.send(JSON.stringify({ type: 'relay', payload: payload, origin: this.clientId }));
				return true;
			}
			console.warn('CharacterP2P: no open channel to send message - DC state:', this._dc ? this._dc.readyState : 'null', 'WS state:', this._signalingSocket ? this._signalingSocket.readyState : 'null');
			return false;
		} catch (e) {
			console.warn('CharacterP2P: send failed', e);
			return false;
		}
	}

	static onOpen(fn) {
		if (this._dc && this._dc.readyState === 'open') fn();
		else this._onOpen.push(fn);
	}


}

// Expose in same global scope for backward compatibility
// @ts-ignore - Intentionally adding to globalThis
globalThis.CharacterP2P = CharacterP2P;

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
	static _freshnessThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds
	static _STORAGE_KEY = 'VeTool_CharacterManager_Cache';
	// Client-side cache for the blob list (metadata returned by /api/characters/load)
	static _LIST_CACHE_KEY = 'VeTool_CharacterManager_ListCache';
	static _LIST_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

	static getInstance() {
		if (!this._instance) {
			this._instance = new CharacterManager();
		}
		return this._instance;
	}

	/**
	 * Set the freshness threshold for character data
	 * @param {number} milliseconds - How long to consider character data fresh
	 */
	static setFreshnessThreshold(milliseconds) {
		this._freshnessThreshold = milliseconds;
	}

	/**
	 * Force refresh characters by clearing their lastFetched timestamps
	 * @param {Array<string>} [characterIds] - Specific characters to refresh, or all if not specified
	 */
	static forceRefreshCharacters(characterIds = null) {
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
	 * Load characters from localStorage cache
	 * @returns {Array} Array of cached characters
	 */
	static _loadFromLocalStorage() {
		try {
			const stored = localStorage.getItem(this._STORAGE_KEY);
			if (!stored) return [];

			const data = JSON.parse(stored);
			if (!Array.isArray(data)) return [];

			return data;
		} catch (e) {
			console.warn('CharacterManager: Failed to load from localStorage:', e);
			return [];
		}
	}

	/**
	 * Save characters to localStorage cache
	 * @param {Array} characters - Characters to cache
	 */
	static _saveToLocalStorage(characters) {
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
			console.log(`CharacterManager: Saved ${merged.length} characters to localStorage cache (merged ${incoming.length} incoming)`);
		} catch (e) {
			console.warn('CharacterManager: Failed to save to localStorage:', e);
		}
	}

	/**
	 * Check for stale characters in the background and update if needed
	 * @param {Array<string>} [sources] - Optional list of sources to check
	 */
	static async _checkForStaleCharactersInBackground(sources = null) {
		try {
			// Wait a bit to not block the initial UI load
			setTimeout(async () => {
				const now = Date.now();
				let hasStaleCharacters = false;

				// Check if any characters are stale
				for (const [id, cached] of this._blobCache.entries()) {
					if (sources && sources.length > 0) {
						// Check if this character matches the source filter
						const character = cached.character;
						if (!character || !sources.includes(character.source)) {
							continue;
						}
					}

					if ((now - (cached.lastFetched || 0)) > this._freshnessThreshold) {
						hasStaleCharacters = true;
						break;
					}
				}

				if (hasStaleCharacters) {
					// Force a background refresh
					this.forceRefreshCharacters();
					// This will trigger a new load that actually hits the API
					const updated = await this._performFullApiLoad(sources);
					if (updated.length > 0) {
						this._notifyListeners();
					}
				}
			}, 100); // Small delay to not block UI
		} catch (e) {
			console.warn('CharacterManager: Error in background staleness check:', e);
		}
	}

	/**
	 * Perform a full API load (used for background updates)
	 * Forces a fresh fetch of the blob list and all characters
	 * @param {Array<string>} [sources] - Optional list of sources to filter by
	 */
	static async _performFullApiLoad(sources = null) {
		try {
			// Force refresh the blob list cache
			const blobs = await this._getBlobList(sources, true);

			if (!blobs || blobs.length === 0) {
				console.warn('CharacterManager: No character blobs found during full API load');
				return [];
			}

			// Fetch all characters fresh from API (ignore cache)
			const fetchPromises = blobs.map(async (blob) => {
				try {
					const cacheBusterUrl = `${blob.url}${blob.url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
					const response = await fetch(`/api/characters/get?url=${encodeURIComponent(cacheBusterUrl)}&id=${encodeURIComponent(blob.id)}`, {
						cache: 'no-cache',
						headers: {
							'Cache-Control': 'no-cache, no-store, must-revalidate',
							'Pragma': 'no-cache',
							'Expires': '0'
						}
					});

					if (!response.ok) {
						console.warn(`CharacterManager: Failed to fetch character ${blob.id}: ${response.statusText}`);
						return null;
					}

					const apiResponse = await response.json();
					if (!apiResponse.success) {
						console.warn(`CharacterManager: Invalid response for character ${blob.id}`);
						return null;
					}

					const characterData = apiResponse.character;
					const character = (characterData.character && Array.isArray(characterData.character))
						? characterData.character[0]
						: characterData;

					// Update cache with fresh timestamp
					this._blobCache.set(blob.id, {
						blob: blob,
						character: character,
						lastFetched: Date.now()
					});

					return character;
				} catch (error) {
					console.warn(`CharacterManager: Error fetching character ${blob.id}:`, error);
					return null;
				}
			});

			const fetchedCharacters = (await Promise.all(fetchPromises)).filter(c => c);
			return this._processAndStoreCharacters(fetchedCharacters);
		} catch (error) {
			console.warn('CharacterManager: Background API load failed:', error);
			return [];
		}
	}

	/**
	 * Register a listener for character data changes
	 * @param {Function} callback - Called when characters are loaded/updated
	 */
	static addListener(callback) {
		this._listeners.add(callback);
	}

	/**
	 * Remove a listener
	 * @param {Function} callback - The callback to remove
	 */
	static removeListener(callback) {
		this._listeners.delete(callback);
	}

	/**
	 * Notify all listeners of character data changes
	 */
	static _notifyListeners() {
		this._listeners.forEach(callback => {
			try {
				callback(this._charactersArray);
			} catch (e) {
				console.warn('Error in character manager listener:', e);
			}
		});
	}

	/**
	 * Load characters from the API (single source of truth)
	 * @param {Array<string>} [sources] - Optional list of sources to filter by
	 * @returns {Promise<Array>} Array of characters
	 */
	static async loadCharacters(sources = null) {
		// If already loaded and no specific sources requested, return cached data
		if (this._isLoaded && !sources) return [...this._charactersArray];

		// If currently loading, wait for that to finish
		if (this._isLoading) return this._loadPromise;

		this._isLoading = true;
		this._loadPromise = this._performLoad(sources);

		try {
			const characters = await this._loadPromise;
			if (!sources) this._isLoaded = true;
			return characters;
		} finally {
			this._isLoading = false;
			this._loadPromise = null;
		}
	}

	/**
	 * Perform the actual character loading, using cached blob list and character data where possible
	 * @param {Array<string>} [sources] - Optional list of sources to filter by
	 * @returns {Promise<Array>} Array of characters
	 */
	static async _performLoad(sources = null) {
		try {
			// First, get the blob list (this uses the cached list endpoint data)
			const blobs = await this._getBlobList(sources);

			if (!blobs || blobs.length === 0) {
				console.log('CharacterManager: No character blobs found');
				return this._loadFromLocalStorage();
			}

			// Check which characters we already have fresh in cache
			const charactersToFetch = [];
			const cachedCharacters = [];
			const now = Date.now();

			for (const blob of blobs) {
				const cached = this._blobCache.get(blob.id);
				if (cached && cached.character && (now - (cached.lastFetched || 0)) < this._freshnessThreshold) {
					// Use cached character if it's still fresh
					cachedCharacters.push(cached.character);
				} else {
					// Need to fetch this character
					charactersToFetch.push(blob);
				}
			}

			console.log(`CharacterManager: Using ${cachedCharacters.length} cached characters, fetching ${charactersToFetch.length} characters`);

			// Fetch only the characters we don't have cached or that are stale
			const fetchedCharacters = [];
			if (charactersToFetch.length > 0) {
				const fetchPromises = charactersToFetch.map(async (blob) => {
					try {
						// Handle localStorage URLs differently
						if (blob.url && blob.url.startsWith('localStorage://')) {
							const characterId = blob.url.replace('localStorage://', '');
							const characters = this._loadFromLocalStorage();
							const character = characters.find(c =>
								this._generateCompositeId(c.name, c.source) === characterId
							);

							if (!character) {
								console.warn(`CharacterManager: Character ${characterId} not found in localStorage`);
								return null;
							}

							// Update cache with localStorage data
							this._blobCache.set(blob.id, {
								blob: blob,
								character: character,
								lastFetched: now
							});

							return character;
						}

						// Use the /api/characters/get endpoint for individual character fetching
						const response = await fetch(`/api/characters/get?url=${encodeURIComponent(blob.url)}&id=${encodeURIComponent(blob.id)}`);

						if (!response.ok) {
							console.warn(`CharacterManager: Failed to fetch character ${blob.id}: ${response.statusText}`);
							return null;
						}

						const apiResponse = await response.json();
						if (!apiResponse.success || !apiResponse.character) {
							console.warn(`CharacterManager: Invalid response for character ${blob.id}`);
							return null;
						}

						const characterData = apiResponse.character;
						const character = (characterData.character && Array.isArray(characterData.character))
							? characterData.character[0]
							: characterData;

						// Update cache with fresh data
						this._blobCache.set(blob.id, {
							blob: blob,
							character: character,
							lastFetched: now
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

			// If no characters found, try localStorage as fallback
			if (allCharacters.length === 0) {
				console.log('CharacterManager: No characters loaded from API, trying localStorage');
				return this._loadFromLocalStorage();
			}

			// Process and store all characters
			return this._processAndStoreCharacters(allCharacters);

		} catch (error) {
			console.error('CharacterManager: Error in _performLoad:', error);
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
	static async _getBlobList(sources = null, force = false) {
		try {
			const raw = localStorage.getItem(this._LIST_CACHE_KEY);
			if (raw && !force) {
				try {
					const parsed = JSON.parse(raw);
					if (parsed && parsed.ts && (Date.now() - parsed.ts) < this._LIST_CACHE_TTL) {
						let blobs = parsed.blobs || [];
						if (sources) {
							const sourceList = Array.isArray(sources) ? sources : [sources];
							blobs = blobs.filter(blob => {
								const parts = blob.id.split('-');
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

			let url = `/api/characters/list`;
			if (sources && sources.length > 0) {
				const sourcesParam = sources.map(s => `sources=${encodeURIComponent(s)}`).join('&');
				url += `?${sourcesParam}`;
			}

			const response = await fetch(url, {
				cache: 'no-cache',
				headers: {
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					'Pragma': 'no-cache',
					'Expires': '0'
				}
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
				console.warn('CharacterManager: Failed to cache blob list locally:', e);
			}

			// If sources filter requested, apply it to the returned list
			if (sources) {
				const sourceList = Array.isArray(sources) ? sources : [sources];
				return blobs.filter(blob => {
					const parts = blob.id.split('-');
					const source = parts[parts.length - 1];
					return sourceList.includes(source);
				});
			}

			return blobs;
		} catch (e) {
			console.warn('CharacterManager: Error fetching blob list metadata:', e);
			// Fall back to localStorage if API is not available
			return this._getLocalStorageBlobList(sources);
		}
	}

	/**
	 * Get blob list from localStorage characters (fallback when API is not available)
	 * @param {Array<string>} [sources] - Optional list of sources to filter by
	 */
	static _getLocalStorageBlobList(sources = null) {
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
					size: JSON.stringify(character).length
				};

				blobs.push(blob);
			}

			// If sources filter requested, apply it to the returned list
			if (sources) {
				const sourceList = Array.isArray(sources) ? sources : [sources];
				return blobs.filter(blob => {
					const character = characters.find(c =>
						this._generateCompositeId(c.name, c.source) === blob.id
					);
					return character && sourceList.includes(character.source);
				});
			}

			return blobs;
		} catch (e) {
			console.warn('CharacterManager: Error creating localStorage blob list:', e);
			return [];
		}
	}

	/**
	 * Process and store characters, ensuring no duplicates
	 * @param {Array} characters - Raw character data from API
	 * @returns {Array} Processed characters
	 */
	static _processAndStoreCharacters(characters) {
		// Merge incoming characters into the existing cache instead of replacing everything.
		// This preserves characters that weren't part of this payload (e.g., because we only
		// fetched a subset of blobs that were stale) so they don't disappear from the UI.
		const processedCharacters = [];

		for (const character of characters) {
			if (!character || !character.name) {
				console.warn('CharacterManager: Skipping character without name:', character);
				continue;
			}

			// Generate composite ID from name + source if no ID exists
			if (!character.id) {
				character.id = this._generateCompositeId(character.name, character.source);
			}

			// Process character for display
			const processedCharacter = this._processCharacterForDisplay(character);

			// Upsert into the map (replace/update existing or add new)
			this._characters.set(character.id, processedCharacter);

			// Track which characters were part of this update (returned to caller)
			processedCharacters.push(processedCharacter);
		}

		// Rebuild the array from the full map so we keep characters not present in this payload
		this._charactersArray = Array.from(this._characters.values());

		// Populate DataLoader cache for hover/popout functionality and offline support
		if (processedCharacters.length > 0) {
			const formattedData = { character: processedCharacters };
			if (typeof DataLoader !== 'undefined') {
				DataLoader._pCache_addToCache({
					allDataMerged: formattedData,
					propAllowlist: new Set(["character"])
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
	static _processCharacterForDisplay(character) {
		// Clone to avoid modifying original
		const processed = { ...character };

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
	static getCharacters() {
		return [...this._charactersArray];
	}

	/**
	 * Get a character by ID
	 * @param {string} id - Character ID
	 * @returns {Object|null} Character object or null if not found
	 */
	static getCharacterById(id) {
		return this._characters.get(id) || null;
	}

	/**
	 * Add or update a single character (for editor functionality)
	 * @param {Object} character - Character data
	 */
	static addOrUpdateCharacter(character) {
		if (!character || !character.name) {
			console.warn('CharacterManager: Cannot add character without name');
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

		// Notify listeners
		this._notifyListeners();
	}

	/**
	 * Remove any cached characters that share the same name+source as the
	 * provided character but have a different id. This prevents duplicate
	 * entries after edits or re-saves where a character may have been saved
	 * under a different id previously.
	 * @param {Object} character
	 */
	static _dedupeByNameAndSource(character) {
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
				console.warn('CharacterManager: Error saving deduped cache to localStorage:', e);
			}
		} catch (e) {
			console.warn('CharacterManager: Error during deduplication:', e);
		}
	}

	/**
	 * Quick edit functionality for HP and other frequently updated fields
	 * @param {string} characterId - Character ID
	 * @param {Object} updates - Fields to update (e.g., {hp: 25})
	 */
	static updateCharacterQuickEdit(characterId, updates) {
		const character = this._characters.get(characterId);
		if (!character) {
			console.warn(`CharacterManager: Character ${characterId} not found for quick edit`);
			return false;
		}

		// Apply updates
		Object.assign(character, updates);

		// Update in array as well
		const arrayIndex = this._charactersArray.findIndex(c => c.id === characterId);
		if (arrayIndex >= 0) {
			Object.assign(this._charactersArray[arrayIndex], updates);
		}

		// Update DataLoader cache
		this._updateDataLoaderCache();

		// Update localStorage cache if this character is currently being edited
		this._updateLocalStorageCache(character);

		// Notify listeners of the update
		this._notifyListeners();

		// Broadcast quick edit to other tabs and peers so everyone sees the change
		try {
			this._broadcastSync('CHARACTER_UPDATED', { character });
		} catch (e) {
			console.warn('CharacterManager: Failed to broadcast CHARACTER_UPDATED to other tabs:', e);
		}

		try {
			if (typeof CharacterP2P !== 'undefined' && CharacterP2P.send) {
				CharacterP2P.send({ type: 'CHARACTER_UPDATED', character });
			}
		} catch (e) {
			console.warn('CharacterManager: Failed to send P2P CHARACTER_UPDATED', e);
		}

		return true;
	}

	/**
	 * Update HP for a character (most common quick edit)
	 * @param {string} characterId - Character ID
	 * @param {number} newHp - New HP value
	 */
	static updateCharacterHp(characterId, newHp) {
		return this.updateCharacterQuickEdit(characterId, { hp: newHp });
	}

	/**
	 * Helper to update DataLoader cache after character changes
	 */
	static _updateDataLoaderCache() {
		if (this._charactersArray.length > 0 && typeof DataLoader !== 'undefined') {
			const formattedData = { character: [...this._charactersArray] };
			DataLoader._pCache_addToCache({
				allDataMerged: formattedData,
				propAllowlist: new Set(["character"])
			});
		}
	}

	/**
	 * Update localStorage cache if this character is currently being edited
	 * @param {Object} character - Updated character data
	 */
	static _updateLocalStorageCache(character) {
		// Update 'editingCharacter' entry if it exists and matches this character
		try {
			const editingCharacterData = localStorage.getItem('editingCharacter');
			if (editingCharacterData) {
				const editingCharacter = JSON.parse(editingCharacterData);
				const editingId = editingCharacter.id || this._generateCompositeId(editingCharacter.name, editingCharacter.source);
				if (editingId === character.id) {
					localStorage.setItem('editingCharacter', JSON.stringify(character));
				}
			}
		} catch (e) {
			console.warn('CharacterManager: Error updating editingCharacter in localStorage:', e);
		}

		// Merge the updated character into the full character cache in localStorage instead of overwriting it
		try {
			// Load existing stored characters (may be empty)
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
			if (character && character.id) mergedMap.set(character.id, character);

			const mergedArray = Array.from(mergedMap.values());
			this._saveToLocalStorage(mergedArray);
		} catch (e) {
			console.warn('CharacterManager: Error merging character into localStorage cache:', e);
		}
	}

	/**
	 * Remove a character by ID
	 * @param {string} id - Character ID to remove
	 */
	static removeCharacter(id) {
		if (this._characters.has(id)) {
			// Remove from in-memory caches
			this._characters.delete(id);

			const index = this._charactersArray.findIndex(c => c.id === id);
			if (index >= 0) this._charactersArray.splice(index, 1);

			// Remove any blob cache entry
			if (this._blobCache.has(id)) this._blobCache.delete(id);

			// Persist the updated full cache to localStorage so deletions survive reloads
			try {
				this._saveToLocalStorage([...this._charactersArray]);
			} catch (e) {
				console.warn('CharacterManager: Failed to persist deletion to localStorage:', e);
			}

			// Broadcast deletion to other tabs
			try {
				this._broadcastSync('CHARACTER_DELETED', { characterId: id });
			} catch (e) {
				console.warn('CharacterManager: Failed to broadcast CHARACTER_DELETED:', e);
			}

			// Also send deletion over P2P if available
			try {
				if (typeof CharacterP2P !== 'undefined' && CharacterP2P.send) {
					CharacterP2P.send({ type: 'CHARACTER_DELETED', characterId: id });
				}
			} catch (e) {
				console.warn('CharacterManager: Failed to send P2P CHARACTER_DELETED', e);
			}

			// Notify listeners
			this._notifyListeners();
		}
	}

	/**
	 * Force reload characters from API
	 * @returns {Promise<Array>} Fresh character data
	 */
	static async reloadCharacters() {
		this._isLoaded = false;
		return this.loadCharacters();
	}

	/**
	 * Clear all cached data
	 */
	static clearCache() {
		this._characters.clear();
		this._charactersArray.length = 0;
		this._blobCache.clear(); // Clear blob cache as well
		this._isLoaded = false;
		this._isLoading = false;
		this._loadPromise = null;
		this._stopAutoRefresh();

		// Also clear the blob list cache
		try {
			localStorage.removeItem(this._LIST_CACHE_KEY);
		} catch (e) {
			console.warn('CharacterManager: Error clearing blob list cache:', e);
		}

		this._notifyListeners();
	}

	/**
	 * Invalidate the blob list cache to force fresh list fetch on next load
	 */
	static invalidateBlobListCache() {
		try {
			localStorage.removeItem(this._LIST_CACHE_KEY);
			console.log('CharacterManager: Blob list cache invalidated');
		} catch (e) {
			console.warn('CharacterManager: Error invalidating blob list cache:', e);
		}
	}

	/**
	 * Start automatic refresh of character data (like existing system)
	 * @param {number} intervalMs - Refresh interval in milliseconds (default 5 minutes)
	 */
	static startAutoRefresh(intervalMs = 5 * 60 * 1000) {
		if (this._refreshInterval) {
			clearInterval(this._refreshInterval);
		}

		this._refreshInterval = setInterval(async () => {
			try {
				await this.reloadCharacters();
			} catch (e) {
				console.warn('CharacterManager: Auto-refresh failed:', e);
			}
		}, intervalMs);

	}

	/**
	 * Stop automatic refresh
	 */
	static _stopAutoRefresh() {
		if (this._refreshInterval) {
			clearInterval(this._refreshInterval);
			this._refreshInterval = null;
		}
	}

	/**
	 * Integration method for existing 5etools data loader patterns
	 * This makes characters work like any other content type in the system
	 */
	static async pGetCharacterData() {
		const characters = await this.loadCharacters();
		return { character: characters };
	}

	/**
	 * Check if the user can edit a character based on source passwords
	 * @param {Object|string} characterOrSource - Character object or source name
	 * @returns {boolean} True if user can edit this character
	 */
	static canEditCharacter(characterOrSource) {
		try {
			const source = typeof characterOrSource === 'string'
				? characterOrSource
				: characterOrSource?.source;

			if (!source || source === 'Unknown' || source === '') {
				return false;
			}

			const cachedPasswords = localStorage.getItem('sourcePasswords');
			if (!cachedPasswords) return false;

			const passwords = JSON.parse(cachedPasswords);
			return !!passwords[source];
		} catch (e) {
			console.error('Error checking character edit permissions:', e);
			return false;
		}
	}

	/**
	 * Save character to server (handles both new and existing characters)
	 * @param {Object} characterData - Character data to save
	 * @param {boolean} isEdit - Whether this is an edit of existing character
	 * @returns {Promise<boolean>} Success status
	 */
	static async saveCharacter(characterData, isEdit = false) {
		if (!characterData || !characterData.source) {
			console.warn('CharacterManager: Cannot save character without source');
			return false;
		}

		if (!this.canEditCharacter(characterData)) {
			console.warn('CharacterManager: No permission to edit character from source:', characterData.source);
			return false;
		}

		try {
			const cachedPasswords = localStorage.getItem('sourcePasswords');
			const passwords = JSON.parse(cachedPasswords);
			const password = passwords[characterData.source];

			// Generate character ID if needed
			const characterId = characterData.id || this._generateCompositeId(characterData.name, characterData.source);

			const API_BASE_URL = window.location.origin.includes('localhost')
				? 'http://localhost:3000/api'
				: '/api';

			const response = await fetch(`${API_BASE_URL}/characters/save`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					characterData: characterData,
					source: characterData.source,
					password: password,
					isEdit: isEdit,
					characterId: characterId
				})
			});

			if (response.ok) {
				const saveResult = await response.json();

				// Update local cache - the local copy is already correct after save
				characterData.id = characterId;
				this.addOrUpdateCharacter(characterData);

				// Update blob cache with the fresh blob info from save result
				if (saveResult.blob) {
					this._blobCache.set(characterId, {
						blob: {
							id: characterId,
							url: saveResult.blob.url,
							uploadedAt: saveResult.blob.uploadedAt,
							size: saveResult.blob.size,
							pathname: saveResult.blob.pathname
						},
						character: characterData,
						lastFetched: Date.now() // Mark as fresh since we just saved it
					});
				}

				// Also ensure localStorage is updated
				this._updateLocalStorageCache(characterData);

				// Broadcast change to other tabs
				this._broadcastSync('CHARACTER_UPDATED', { character: characterData });

				// Also send over P2P channel if available
				try {
					if (typeof CharacterP2P !== 'undefined' && CharacterP2P.send) {
						CharacterP2P.send({ type: 'CHARACTER_UPDATED', character: characterData });
					}
				} catch (e) {
					console.warn('CharacterManager: Failed to send P2P CHARACTER_UPDATED', e);
				}

				console.log(`CharacterManager: Successfully saved character: ${characterData.name}`);
				return true;
			} else {
				const error = await response.json();
				console.error('CharacterManager: Server error saving character:', error);
				return false;
			}
		} catch (error) {
			console.error('CharacterManager: Error saving character:', error);
			return false;
		}
	}

	/**
	 * Update a character stat and save to server
	 * @param {string} characterId - Character ID
	 * @param {string} statPath - Dot notation path to stat (e.g., "hp.current")
	 * @param {any} newValue - New value for the stat
	 * @returns {Promise<boolean>} Success status
	 */
	static async updateCharacterStat(characterId, statPath, newValue) {
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
				console.warn('CharacterManager: Server update failed, reverting local changes');
				await this.reloadCharacters();
			}

			return success;
		} catch (error) {
			console.error('CharacterManager: Error updating character stat:', error);
			return false;
		}
	}

	/**
	 * Helper to parse stat values to appropriate types
	 */
	static _parseStatValue(value) {
		if (value === null || value === '' || value === undefined) {
			return null;
		}
		// Try to parse as number if it looks like one
		const numValue = Number(value);
		if (!isNaN(numValue) && value.toString().trim() !== '') {
			return numValue;
		}
		return value; // Return as string if not a number
	}

	/**
	 * Helper to set nested properties using dot notation
	 */
	static _setNestedProperty(obj, path, value) {
		const keys = path.split('.');
		const lastKey = keys.pop();
		const target = keys.reduce((current, key) => {
			if (!current[key] || typeof current[key] !== 'object') {
				current[key] = {};
			}
			return current[key];
		}, obj);

		// Handle null/empty values appropriately
		if (value === null || value === '' || value === undefined) {
			delete target[lastKey];
		} else {
			target[lastKey] = value;
		}
	}

	/**
	 * Helper to get nested properties using dot notation
	 */
	static _getNestedProperty(obj, path) {
		return path.split('.').reduce((current, key) => current?.[key], obj);
	}

	/**
	 * Helper to get top-level property from dot notation path
	 */
	static _getTopLevelProperty(path) {
		return path.split('.')[0];
	}

	/**
	 * Generate composite ID from character name and source
	 * @param {string} name - Character name
	 * @param {string} source - Character source
	 * @returns {string} Composite ID
	 */
	static _generateCompositeId(name, source) {
		if (!name) return null;
		const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '');
		const cleanSource = (source || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '');
		return `${cleanName}_${cleanSource}`;
	}

	/**
	 * Helper to generate character ID (legacy method, now uses composite ID)
	 */
	static _generateCharacterId(name, source) {
		return this._generateCompositeId(name, source);
	}

	/**
	 * Initialize cross-tab synchronization
	 * Listen for storage events to sync character changes across tabs
	 */
	static _initCrossTabSync() {
		// Listen for localStorage changes from other tabs
		window.addEventListener('storage', (event) => {
			// Only handle our character-related storage changes
			if (event.key === 'characterManager_sync' && event.newValue) {
				try {
					const syncData = JSON.parse(event.newValue);
					this._handleCrossTabSync(syncData);
				} catch (e) {
					console.warn('CharacterManager: Error parsing cross-tab sync data:', e);
				}
			}
		});
	}

	/**
	 * Handle cross-tab synchronization events
	 */
	static _handleCrossTabSync(syncData) {
		const { type, character, characterId } = syncData;

		switch (type) {
			case 'CHARACTER_UPDATED':
				if (character && this._characters.has(character.id)) {
					// Update the character in our local cache
					this._characters.set(character.id, character);

					// Update the array
					const index = this._charactersArray.findIndex(c => c.id === character.id);
					if (index !== -1) {
						this._charactersArray[index] = character;
					}

					// Update localStorage cache if this character is being edited
					this._updateLocalStorageCache(character);

					// Update global character edit data for UI consistency
					if (globalThis._CHARACTER_EDIT_DATA && globalThis._CHARACTER_EDIT_DATA[character.id]) {
						globalThis._CHARACTER_EDIT_DATA[character.id] = character;
					}

					// Notify listeners to re-render
					this._notifyListeners();

					console.log(`CharacterManager: Synced character update from another tab: ${character.name}`);
				}
				break;

			case 'CHARACTER_DELETED':
				if (characterId && this._characters.has(characterId)) {
					// Remove from cache
					this._characters.delete(characterId);
					this._charactersArray = this._charactersArray.filter(c => c.id !== characterId);

					// Notify listeners
					this._notifyListeners();

					console.log(`CharacterManager: Synced character deletion from another tab: ${characterId}`);
				}
				break;

			case 'CHARACTERS_RELOADED':
				// Another tab reloaded characters, we should too
				console.log('CharacterManager: Another tab reloaded characters, syncing...');
				this.forceRefreshCharacters(); // Force refresh
				this.loadCharacters(); // Reload
				break;
		}
	}

	/**
	 * Broadcast character changes to other tabs
	 */
	static _broadcastSync(type, data = {}) {
		const syncData = {
			type,
			timestamp: Date.now(),
			...data
		};

		// Use localStorage to communicate with other tabs
		// The storage event will fire in other tabs but not this one
		localStorage.setItem('characterManager_sync', JSON.stringify(syncData));

		// Clean up the sync item after a short delay to prevent clutter
		setTimeout(() => {
			if (localStorage.getItem('characterManager_sync') === JSON.stringify(syncData)) {
				localStorage.removeItem('characterManager_sync');
			}
		}, 1000);
	}

	/**
	 * Initialize WebRTC P2P sync (optional). Call this after page load if you want LAN P2P sync.
	 * @param {{signalingUrl?: string}} opts
	 */
	static p2pInit(opts = {}) {
		try {
			if (typeof CharacterP2P === 'undefined') {
				console.warn('CharacterManager: CharacterP2P not available; skipping p2pInit');
				return;
			}

			// Use provided signalingUrl (prefer ws://) or manual flow with optional in-browser TURN key.
			CharacterP2P.init(opts);
		} catch (e) {
			console.warn('CharacterManager: p2pInit failed', e);
		}
	}

	/**
	 * Internal handler invoked by CharacterP2P when a remote peer sends a sync message.
	 * Accepts messages like { type: 'CHARACTER_UPDATED'|'CHARACTER_DELETED'|'CHARACTERS_RELOADED', character, characterId }
	 */
	static _handleP2PSync(msg) {
		try {
			if (!msg || !msg.type) return;
			const { type, character, characterId, origin } = msg;
			// Ignore messages originating from this client id (already applied locally)
			if (origin && typeof CharacterP2P !== 'undefined' && origin === CharacterP2P.clientId) return;
			switch (type) {
				case 'CHARACTER_UPDATED':
					if (character && character.id) {
						this.addOrUpdateCharacter(character);
					}
					break;
				case 'CHARACTER_DELETED':
					if (characterId) this.removeCharacter(characterId);
					break;
				case 'CHARACTERS_RELOADED':
					this.forceRefreshCharacters();
					this.loadCharacters();
					break;
			}
		} catch (e) {
			console.warn('CharacterManager: _handleP2PSync failed', e);
		}
	}
}

	// Initialize cross-tab synchronization when the class is loaded
	CharacterManager._initCrossTabSync();

// Make it available globally for all scripts
// @ts-ignore - Intentionally adding to globalThis
globalThis.CharacterManager = CharacterManager;

// Auto-initialize P2P when running in a browser so pages automatically join the room.
// Non-blocking and guarded for non-browser environments.
try {
	if (typeof window !== 'undefined' && (window.location?.protocol === 'http:' || window.location?.protocol === 'https:')) {
		// Defer slightly so other scripts can register listeners if needed
		setTimeout(() => {
			try {
					const CM = window['CharacterManager'];
					if (CM && typeof CM.p2pInit === 'function') {
						// If a TURN key is present on window or a meta tag, pass it to p2pInit so
						// the browser can fetch TurnWebRTC credentials directly (insecure to expose key).
						const key = window['TURN_WEB_RTC'] || (document.querySelector && document.querySelector("meta[name=\"turn-web-rtc\"]")?.getAttribute('content'));

						try {
							if (key) CM.p2pInit({ turnApiKey: key });
							else CM.p2pInit();
						} catch (e) {
							console.info('CharacterManager: auto p2pInit failed', e);
						}
					}
			} catch (e) {
				console.info('CharacterManager: auto p2pInit failed', e);
			}
		}, 500);
	}
} catch (e) {
	// ignore in non-browser contexts
}

// Manage periodic peer announces based on tab visibility
try {
	if (typeof document !== 'undefined' && typeof window !== 'undefined') {
		document.addEventListener('visibilitychange', () => {
			try {
				if (document.visibilityState === 'visible') {
					if (typeof CharacterP2P !== 'undefined' && typeof CharacterP2P._startPeriodicAnnounce === 'function') {
						CharacterP2P._startPeriodicAnnounce();
					}
				} else {
					if (typeof CharacterP2P !== 'undefined' && typeof CharacterP2P._stopPeriodicAnnounce === 'function') {
						CharacterP2P._stopPeriodicAnnounce();
					}
				}
			} catch (e) { /* ignore */ }
		});
	}
} catch (e) { /* ignore in non-browser contexts */ }
