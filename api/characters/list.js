import { list } from "@vercel/blob";
import { getCachedBlobs, setCachedBlobs, isFresh } from "./cache.js";

export default async function handler (req, res) {
	// Enable CORS - Set headers for all requests including preflight
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRF-Token, X-Api-Version");
	res.setHeader("Access-Control-Max-Age", "86400"); // Cache preflight for 24 hours

	// Handle preflight OPTIONS request
	if (req.method === "OPTIONS") {
		res.status(200).end();
		return;
	}

	// Cache at edge for 1 hour (3600 seconds) - only for non-OPTIONS requests
	res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
	// Optional: Add ETag for better cache validation
	res.setHeader("ETag", `"characters-${Date.now()}"`);
	// Optional: Add Vary header if response varies by headers
	res.setHeader("Vary", "Accept-Encoding");

	if (req.method !== "GET") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	try {
		let characters = [];

		if (process.env.BLOB_READ_WRITE_TOKEN) {
			// Check if we have fresh cached data
			if (isFresh()) {
				const cached = getCachedBlobs();
				characters = cached.blobs || [];
			} else {
				// Cache is stale or empty, fetch fresh data
				try {
					const { blobs } = await list({
						prefix: "characters/",
						limit: 1000,
						token: process.env.BLOB_READ_WRITE_TOKEN,
					});

					characters = blobs
						.filter(blob => blob.pathname.endsWith(".json"))
						.map(blob => {
							const filename = blob.pathname.split("/").pop();
							const characterId = filename.replace(".json", "");

							return {
								id: characterId,
								filename: filename,
								pathname: blob.pathname,
								url: blob.url,
								uploadedAt: blob.uploadedAt,
								size: blob.size,
							};
						});

					// Cache the processed results
					setCachedBlobs(characters);
				} catch (blobError) {
					console.error("Blob storage error:", blobError);
					// Try to use stale cache if available
					const cached = getCachedBlobs();
					characters = cached.blobs || [];
				}
			}
		}

		return res.status(200).json({
			success: true,
			message: "Character list retrieved successfully",
			characters: characters,
			count: characters.length,
		});
	} catch (error) {
		console.error("List characters error:", error);
		return res.status(500).json({
			error: "Failed to list characters",
			details: error.message,
		});
	}
}
