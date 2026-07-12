/**
 * Character API handlers using Cloudflare D1 database
 * Updated to use user authentication instead of source-based passwords
 */

import { getUserFromSession, setCORSHeaders } from "./auth-api.js";

/**
 * Utility function to broadcast character sync events to WebSocket rooms
 * @param {Object} env - Cloudflare Worker environment bindings
 * @param {string} eventType - Type of event (created, updated, deleted)
 * @param {string} characterId - Character ID
 * @param {string} characterName - Character name
 * @param {string} username - Username of the user who made the change
 * @param {Object} characterData - Full character data object (optional, for updates/creates)
 * @param {string} roomName - Room name to broadcast to (default: character-sync)
 * @param {string|null} updatedAt - Server authoritative updated_at ISO timestamp
 */
async function broadcastCharacterEvent(env, eventType, characterId, characterName, username, characterData = null, roomName = "character-sync", updatedAt = null) {
    try {
        console.log(`[BROADCAST] Starting broadcast for ${eventType} - Character: ${characterId}`);
        
        // Create the broadcast message with full character data
        const message = {
            type: eventType.toUpperCase(),
            characterId: characterId,
            characterName: characterName,
            username: username,
            characterData: characterData, // Include full character JSON
            updatedAt: updatedAt,
            timestamp: Date.now(),
            room: roomName
        };
        
        console.log(`[BROADCAST] Message created:`, JSON.stringify(message));
        
        if (!env.ROOM_MANAGER) {
            console.error(`[BROADCAST] ROOM_MANAGER not available in env`);
            return;
        }
        
        // Get the Durable Object room manager
        const roomId = env.ROOM_MANAGER.idFromName(roomName);
        const roomObject = env.ROOM_MANAGER.get(roomId);
        
        console.log(`[BROADCAST] Got room object for room: ${roomName}`);
        
        // Create internal broadcast request
        const broadcastRequest = new Request(`https://internal/broadcast`, {
            method: 'POST',
            body: JSON.stringify(message),
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Broadcast': 'true'
            }
        });
        
        console.log(`[BROADCAST] Sending request to room object...`);
        
        // Send the broadcast request to the room object
        const response = await roomObject.fetch(broadcastRequest);
        
        console.log(`[BROADCAST] Response status: ${response.status}`);
        
        if (response.ok) {
            console.log(`[BROADCAST] Successfully broadcasted ${eventType} event for character ${characterId}`);
        } else {
            const errorText = await response.text();
            console.error(`[BROADCAST] Broadcast failed with status ${response.status}: ${errorText}`);
        }
        
    } catch (error) {
        console.error(`[BROADCAST] Failed to broadcast ${eventType} event for character ${characterId}:`, error);
        console.error(`[BROADCAST] Error stack:`, error.stack);
        // Don't throw - broadcasting failure shouldn't break the API operation
    }
}

/**
 * Handle preflight CORS requests
 */
function handleOptions() {
    return setCORSHeaders(new Response(null, { status: 200 }));
}

/**
 * Create a JSON response with CORS headers
 */
function jsonResponse(data, status = 200) {
    return setCORSHeaders(new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            "Content-Type": "application/json"
        }
    }));
}

/**
 * Get user from session token in request
 */
async function getAuthenticatedUser(request, db) {
    const sessionToken = request.headers.get('X-Session-Token') || 
                        request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!sessionToken) {
        return null;
    }
    
    return await getUserFromSession(sessionToken, db);
}

/**
 * Save or update a character
 * POST /api/characters/save
 */
export async function handleCharacterSave(request, env) {
    if (request.method === "OPTIONS") return handleOptions();
    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    console.log('[CHAR_API] Character save request received');

    try {
        // Authenticate user
        const user = await getAuthenticatedUser(request, env.DB);
        console.log(`[CHAR_API] User authenticated: ${user?.username || 'No user'}`);
        
        const { characterData, isEdit, characterId, baseUpdatedAt = null } = await request.json();
        
        // For character creation, authentication is required
        // For character updates, allow anonymous updates (for quick edits)
        if (!user && (!isEdit && !characterId)) {
            return jsonResponse({
                error: "Authentication required to create new characters. Please log in."
            }, 401);
        }

        // Validation
        if (!characterData || !characterData.name) {
            return jsonResponse({ error: "Invalid character data" }, 400);
        }

		// Normalize character data for 5etools compatibility (strips client sync meta)
		const normalizedCharacterData = _normalizeCharacterData(characterData);

		// Extract metadata for efficient querying
		const metadata = _extractCharacterMetadata(normalizedCharacterData);

		// Generate character ID if not provided
		let finalCharacterId = characterId;
		if (!finalCharacterId) {
			if (!user) {
				return jsonResponse({
					error: "Character ID required for anonymous updates"
				}, 400);
			}
			// Generate ID from character name and user ID
			finalCharacterId = normalizedCharacterData.name.toLowerCase()
				.replace(/[^a-z0-9\s]/g, "") // Remove special characters
				.replace(/\s+/g, "-") // Replace spaces with dashes
				.substring(0, 50) + `-${user.id}`; // Add user ID
		}

		// Load existing row (full metadata for conditional update)
		let existingCharacter;
		if (user) {
			existingCharacter = await env.DB
				.prepare("SELECT character_id, created_at, updated_at, user_id, source_name, character_data FROM characters WHERE character_id = ? AND user_id = ?")
				.bind(finalCharacterId, user.id)
				.first();

			// Also allow update by character_id alone when authenticated owner matches any row
			if (!existingCharacter && (isEdit || characterId)) {
				const byId = await env.DB
					.prepare("SELECT character_id, created_at, updated_at, user_id, source_name, character_data FROM characters WHERE character_id = ?")
					.bind(finalCharacterId)
					.first();
				if (byId && byId.user_id !== user.id) {
					return jsonResponse({
						error: "Access denied: You can only edit your own characters."
					}, 403);
				}
				existingCharacter = byId || null;
			}
		} else {
			existingCharacter = await env.DB
				.prepare("SELECT character_id, created_at, updated_at, user_id, source_name, character_data FROM characters WHERE character_id = ?")
				.bind(finalCharacterId)
				.first();

			if (!existingCharacter) {
				return jsonResponse({
					error: "Character not found for anonymous update"
				}, 404);
			}
		}

		const wasUpdate = !!existingCharacter;
		const dbUserId = user?.id || (existingCharacter?.user_id) || 'anonymous';
		const dbUsername = user?.username || (existingCharacter?.source_name) || 'anonymous';
		const nowIso = new Date().toISOString();

		if (wasUpdate) {
			// Optimistic concurrency: only overwrite if client base matches current updated_at
			// Allow first save without baseUpdatedAt (legacy clients / first LWW migration)
			if (baseUpdatedAt != null && existingCharacter.updated_at != null
				&& String(baseUpdatedAt) !== String(existingCharacter.updated_at)) {
				let currentData = null;
				try {
					currentData = JSON.parse(existingCharacter.character_data);
				} catch (e) {
					currentData = null;
				}
				return jsonResponse({
					error: "Conflict: character was updated elsewhere",
					code: "STALE_UPDATE",
					characterId: finalCharacterId,
					updatedAt: existingCharacter.updated_at,
					characterData: currentData,
				}, 409);
			}

			const expectedUpdatedAt = baseUpdatedAt != null ? baseUpdatedAt : existingCharacter.updated_at;

			const updateResult = await env.DB
				.prepare(`
					UPDATE characters SET
						user_id = ?,
						source_name = ?,
						character_name = ?,
						character_data = ?,
						character_level = ?,
						character_race = ?,
						character_background = ?,
						character_class = ?,
						updated_at = ?
					WHERE character_id = ?
					  AND updated_at = ?
				`)
				.bind(
					dbUserId,
					dbUsername,
					normalizedCharacterData.name,
					JSON.stringify(normalizedCharacterData),
					metadata.level,
					metadata.race,
					metadata.background,
					metadata.primaryClass,
					nowIso,
					finalCharacterId,
					expectedUpdatedAt
				)
				.run();

			// Race: another writer beat us between SELECT and UPDATE
			if (updateResult?.meta?.changes === 0) {
				const current = await env.DB
					.prepare("SELECT character_data, updated_at FROM characters WHERE character_id = ?")
					.bind(finalCharacterId)
					.first();
				let currentData = null;
				try {
					currentData = current ? JSON.parse(current.character_data) : null;
				} catch (e) {
					currentData = null;
				}
				return jsonResponse({
					error: "Conflict: character was updated elsewhere",
					code: "STALE_UPDATE",
					characterId: finalCharacterId,
					updatedAt: current?.updated_at || existingCharacter.updated_at,
					characterData: currentData,
				}, 409);
			}
		} else {
			await env.DB
				.prepare(`
					INSERT INTO characters
					(character_id, user_id, source_name, character_name, character_data,
					 character_level, character_race, character_background, character_class,
					 created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`)
				.bind(
					finalCharacterId,
					dbUserId,
					dbUsername,
					normalizedCharacterData.name,
					JSON.stringify(normalizedCharacterData),
					metadata.level,
					metadata.race,
					metadata.background,
					metadata.primaryClass,
					nowIso,
					nowIso
				)
				.run();
		}

		// Create sync event for WebSocket broadcasts
		try {
			await env.DB
				.prepare(`
					INSERT INTO character_sync_events 
					(character_id, user_id, event_type, sync_data, created_at)
					VALUES (?, ?, ?, ?, ?)
				`)
				.bind(
					finalCharacterId,
					dbUserId,
					wasUpdate ? "updated" : "created",
					JSON.stringify({
						characterId: finalCharacterId,
						characterName: normalizedCharacterData.name,
						username: dbUsername,
						updatedAt: nowIso,
					}),
					nowIso
				)
				.run();
			console.log(`[CHAR_API] Sync event created for ${finalCharacterId}`);
		} catch (syncEventError) {
			console.error(`[CHAR_API] Failed to create sync event:`, syncEventError);
			// Continue with broadcast even if sync event fails
		}

		console.log(`[CHAR_API] Starting broadcast for ${finalCharacterId}`);
		await broadcastCharacterEvent(
			env,
			wasUpdate ? "CHARACTER_UPDATED" : "CHARACTER_CREATED",
			finalCharacterId,
			normalizedCharacterData.name,
			dbUsername,
			normalizedCharacterData,
			"character-sync",
			nowIso
		);
		console.log(`[CHAR_API] Broadcast completed for ${finalCharacterId}`);

        return jsonResponse({
            success: true,
            message: wasUpdate ? "Character updated successfully" : "Character created successfully",
            characterId: finalCharacterId,
            wasUpdate: wasUpdate,
            updatedAt: nowIso,
        });

    } catch (error) {
        console.error("Save character error:", error);
        return jsonResponse({
            error: "Failed to save character",
            details: error.message
        }, 500);
    }
}

/**
 * Get a specific character
 * GET /api/characters/get?id=character-id
 */
export async function handleCharacterGet(request, env) {
    if (request.method === "OPTIONS") return handleOptions();
    if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
        // Character get is public for lazy loading support
        // No authentication required to view character details

        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (!id) {
            return jsonResponse({
                error: "Character ID is required",
                usage: "Use ?id=character-id to fetch a specific character"
            }, 400);
        }

        // Fetch character from database (public endpoint)
        const character = await env.DB
            .prepare(`
                SELECT c.character_id, c.character_name, c.character_data, c.created_at, c.updated_at,
                       c.source_name as owner
                FROM characters c
                WHERE c.character_id = ?
            `)
            .bind(id)
            .first();

        if (!character) {
            return jsonResponse({
                error: "Character not found",
                id: id,
                note: "No character found with the specified ID"
            }, 404);
        }

        // Parse character data and wrap it in the expected format
        const characterData = JSON.parse(character.character_data);
        const wrappedCharacter = {
            character: [characterData]
        };

        return jsonResponse({
            success: true,
            message: "Character loaded successfully",
            character: wrappedCharacter,
            id: id,
            metadata: {
                created_at: character.created_at,
                updated_at: character.updated_at,
                owner: character.owner
            }
        });

    } catch (error) {
        console.error("Get character error:", error);
        return jsonResponse({
            error: "Failed to load character",
            details: error.message
        }, 500);
    }
}

/**
 * List all characters
 * GET /api/characters/list
 */
export async function handleCharacterList(request, env) {
    if (request.method === "OPTIONS") return handleOptions();
    if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
        // Character list is public - no authentication required
        // All users should be able to see the full character list

        // Fetch all characters from database (public endpoint)
        const { results } = await env.DB
            .prepare(`
                SELECT 
                    c.character_id as id,
                    c.character_name,
                    c.created_at as uploadedAt,
                    c.updated_at,
                    LENGTH(c.character_data) as size,
                    c.character_level,
                    c.character_race,
                    c.character_background,
                    c.character_class,
                    c.source_name as owner
                FROM characters c
                ORDER BY c.updated_at DESC
                LIMIT 1000
            `)
            .all();

        // Format results to match the expected API format
        const characters = results.map(char => ({
            id: char.id,
            filename: `${char.id}.json`,
            pathname: `characters/${char.id}.json`,
            uploadedAt: char.uploadedAt,
            size: char.size,
            // Additional metadata
            character_name: char.character_name,
            level: char.character_level,
            race: char.character_race,
            background: char.character_background,
            class: char.character_class,
            owner: char.owner, // Now using source_name instead of username
            updated_at: char.updated_at
        }));

        return jsonResponse({
            success: true,
            message: "Character list retrieved successfully",
            characters: characters,
            count: characters.length
        });

    } catch (error) {
        console.error("List characters error:", error);
        return jsonResponse({
            error: "Failed to list characters",
            details: error.message
        }, 500);
    }
}

/**
 * Delete a character
 * DELETE /api/characters/delete?id=character-id
 */
export async function handleCharacterDelete(request, env) {
    if (request.method === "OPTIONS") return handleOptions();
    if (request.method !== "DELETE") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
        // Authenticate user
        const user = await getAuthenticatedUser(request, env.DB);
        if (!user) {
            return jsonResponse({
                error: "Authentication required. Please log in to delete characters."
            }, 401);
        }

        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (!id) {
            return jsonResponse({
                error: "Character ID is required",
                usage: "Use ?id=character-id to delete a specific character"
            }, 400);
        }

        // Check if character exists and verify user ownership
        const character = await env.DB
            .prepare("SELECT character_id, character_name, user_id FROM characters WHERE character_id = ?")
            .bind(id)
            .first();

        if (!character) {
            return jsonResponse({
                error: "Character not found",
                id: id
            }, 404);
        }

        if (String(character.user_id) !== String(user.id)) {
            return jsonResponse({
                error: "Access denied: You can only delete your own characters."
            }, 403);
        }

        // Delete the character
        await env.DB
            .prepare("DELETE FROM characters WHERE character_id = ? AND CAST(user_id AS TEXT) = ?")
            .bind(id, String(user.id))
            .run();

		// Create sync event for WebSocket broadcasts
		await env.DB
			.prepare(`
				INSERT INTO character_sync_events 
				(character_id, user_id, event_type, sync_data, created_at)
				VALUES (?, ?, ?, ?, ?)
			`)
			.bind(
				id,
				user.id,
				"deleted",
				JSON.stringify({
					characterId: id,
					characterName: character.character_name,
					username: user.username
				}),
				new Date().toISOString()
			)
			.run();

		// Broadcast character deletion to all connected WebSocket clients
		await broadcastCharacterEvent(
			env,
			"CHARACTER_DELETED",
			id,
			character.character_name,
			user.username
		);

        return jsonResponse({
            success: true,
            message: "Character deleted successfully",
            characterId: id
        });

    } catch (error) {
        console.error("Delete character error:", error);
        return jsonResponse({
            error: "Failed to delete character",
            details: error.message
        }, 500);
    }
}

/**
 * Extract metadata from character data for efficient querying
 * @param {Object} characterData - Normalized character data
 * @returns {Object} Extracted metadata
 */
function _extractCharacterMetadata(characterData) {
	// Extract level - sum all class levels or use level field
	let level = 1;
	if (characterData.class && Array.isArray(characterData.class)) {
		level = characterData.class.reduce((total, cls) => total + (cls.level || 1), 0);
	} else if (characterData.level) {
		level = characterData.level;
	}

	// Extract race name
	let race = "Unknown";
	if (characterData.race) {
		if (typeof characterData.race === 'string') {
			race = characterData.race;
		} else if (characterData.race.name) {
			race = characterData.race.name;
		}
	}

	// Extract background
	let background = null;
	if (characterData.background) {
		if (typeof characterData.background === 'string') {
			background = characterData.background;
		} else if (characterData.background.name) {
			background = characterData.background.name;
		}
	}

	// Extract primary class (first class or highest level class)
	let primaryClass = "Unknown";
	if (characterData.class && Array.isArray(characterData.class)) {
		// Find the class with the highest level
		const highestClass = characterData.class.reduce((prev, current) => {
			return (current.level || 1) > (prev.level || 1) ? current : prev;
		}, characterData.class[0]);
		primaryClass = highestClass.name || primaryClass;
	} else if (characterData.class && typeof characterData.class === 'string') {
		primaryClass = characterData.class;
	}

	return {
		level,
		race,
		background,
		primaryClass
	};
}

/**
 * Normalize character data to ensure 5etools compatibility
 * @param {Object} characterData - Raw character data
 * @returns {Object} Normalized character data
 */
function _normalizeCharacterData(characterData) {
	const normalized = { ...characterData };

	// Strip client-only sync metadata before persisting to D1
	const clientMetaKeys = [
		"_localVersion",
		"_remoteVersion",
		"_lastModified",
		"_isLocallyModified",
		"_serverUpdatedAt",
		"_fRace",
		"_fClass",
		"_fClassSimple",
		"_fLevel",
		"_fBackground",
		"__prop",
	];
	for (const key of clientMetaKeys) {
		delete normalized[key];
	}

	// Ensure class is an array of class objects
	if (normalized.class && typeof normalized.class === 'string') {
		normalized.class = [{
			name: normalized.class,
			level: normalized.level || 1,
			source: "PHB" // Default source for basic classes
		}];
	} else if (!normalized.class) {
		normalized.class = [{
			name: "Fighter", // Default class
			level: normalized.level || 1,
			source: "PHB"
		}];
	}

	// Ensure race is an object
	if (normalized.race && typeof normalized.race === 'string') {
		normalized.race = {
			name: normalized.race,
			source: "PHB" // Default source for basic races
		};
	} else if (!normalized.race) {
		normalized.race = {
			name: "Human",
			source: "PHB"
		};
	}

	// Ensure HP structure
	if (normalized.hp && typeof normalized.hp === 'number') {
		normalized.hp = {
			max: normalized.hp,
			current: normalized.hp
		};
	} else if (!normalized.hp) {
		normalized.hp = {
			max: 8,
			current: 8
		};
	}

	// Ensure AC structure
	if (normalized.ac && typeof normalized.ac === 'number') {
		normalized.ac = [{
			ac: normalized.ac,
			from: ["Unarmored"]
		}];
	} else if (!normalized.ac) {
		normalized.ac = [{
			ac: 10,
			from: ["Unarmored"]
		}];
	}

	return normalized;
}

/**
 * Test WebSocket broadcast without authentication (temporary)
 * POST /api/characters/test-broadcast
 */
export async function handleTestBroadcast(request, env) {
    if (request.method === "OPTIONS") return handleOptions();
    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    console.log('[TEST] Test broadcast request received');

    try {
        const { characterId, characterName, eventType } = await request.json();
        
        const testCharacterId = characterId || `test-char-${Date.now()}`;
        const testCharacterName = characterName || 'Test Character';
        const testEventType = eventType || 'CHARACTER_UPDATED';
        
        console.log(`[TEST] Broadcasting test event: ${testEventType} for ${testCharacterId}`);
        
        // Broadcast test event
        await broadcastCharacterEvent(
            env,
            testEventType,
            testCharacterId,
            testCharacterName,
            'test-user'
        );
        
        console.log(`[TEST] Test broadcast completed`);
        
        return jsonResponse({
            success: true,
            message: 'Test broadcast sent',
            broadcastData: {
                characterId: testCharacterId,
                characterName: testCharacterName,
                eventType: testEventType
            }
        });
        
    } catch (error) {
        console.error('[TEST] Test broadcast error:', error);
        return jsonResponse({
            error: 'Test broadcast failed',
            details: error.message
        }, 500);
    }
}

/**
 * Route character API requests based on path
 */
export async function handleCharacterAPI(request, env) {
	const url = new URL(request.url);
	const path = url.pathname;

	if (path.endsWith("/save")) {
		return handleCharacterSave(request, env);
	} else if (path.endsWith("/get")) {
		return handleCharacterGet(request, env);
	} else if (path.endsWith("/list")) {
		return handleCharacterList(request, env);
	} else if (path.endsWith("/delete")) {
		return handleCharacterDelete(request, env);
	} else if (path.endsWith("/test-broadcast")) {
		return handleTestBroadcast(request, env);
	} else {
		return jsonResponse({
			error: "Not found",
			availableEndpoints: ["/save", "/get", "/list", "/delete", "/test-broadcast"]
		}, 404);
	}
}
