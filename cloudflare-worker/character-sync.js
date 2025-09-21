/**
 * Cloudflare Worker with WebSockets for real-time character synchronization
 * Uses Durable Objects for proper room management and persistent state
 */
import { RoomManager } from "./room-manager.js";

export { RoomManager };

export default {
	async fetch (request, env, ctx) {
		const upgradeHeader = request.headers.get("Upgrade");

		if (upgradeHeader !== "websocket") {
			return new Response("Expected WebSocket", { status: 400 });
		}

		// Get room name from URL (default to 'character-sync')
		const url = new URL(request.url);
		const roomName = url.searchParams.get("room") || "character-sync";

		// Get Durable Object instance for this room
		const roomId = env.ROOM_MANAGER.idFromName(roomName);
		const roomObject = env.ROOM_MANAGER.get(roomId);

		// Forward the request to the Durable Object
		return roomObject.fetch(request);
	},
};
