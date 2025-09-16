import { list } from "@vercel/blob";

export default async function handler (req, res) {
	// Enable CORS
	// When allowing credentials, browsers require a specific Origin value
	res.setHeader("Access-Control-Allow-Credentials", true);
	const requestOrigin = req.headers.origin;
	if (process.env.CORS_ALLOWED_ORIGINS) {
		const allowed = process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
		if (requestOrigin && allowed.includes(requestOrigin)) {
			res.setHeader("Access-Control-Allow-Origin", requestOrigin);
		} else if (allowed.length) {
			res.setHeader("Access-Control-Allow-Origin", allowed[0]);
		} else {
			res.setHeader("Access-Control-Allow-Origin", requestOrigin || "*");
		}
	} else {
		res.setHeader("Access-Control-Allow-Origin", requestOrigin || "*");
	}
	res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version");

	// Prevent caching of character data API responses
	res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
	res.setHeader("Pragma", "no-cache");
	res.setHeader("Expires", "0");

	if (req.method === "OPTIONS") {
		res.status(200).end();
		return;
	}

	if (req.method !== "GET") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	try {
		const { id, url } = req.query;

		if (!id && !url) {
			return res.status(400).json({
				error: "Character ID or blob URL is required",
				usage: "Use ?id=character-name-source or ?url=blob-url to fetch a specific character",
			});
		}

		if (!process.env.BLOB_READ_WRITE_TOKEN) {
			return res.status(500).json({
				error: "BLOB_READ_WRITE_TOKEN not configured",
				note: "Cannot load characters without blob storage configuration",
			});
		}

		let fetchUrl;

		if (url) {
			// Direct blob URL provided - use it directly
			fetchUrl = url;
		} else {
			// Only ID provided - construct the blob path and fetch it
			const pathname = `characters/${id}.json`;

			// Try to get the blob info first to get the proper URL
			try {
				const { blobs } = await list({
					prefix: pathname,
					limit: 1,
					token: process.env.BLOB_READ_WRITE_TOKEN,
				});

				if (blobs.length === 0) {
					return res.status(404).json({
						error: "Character not found",
						id: id,
						note: "No character found with the specified ID",
					});
				}

				fetchUrl = blobs[0].url;
			} catch (error) {
				return res.status(404).json({
					error: "Character not found",
					id: id,
					details: error.message,
				});
			}
		}

		// Fetch the character data with cache busting
		const cacheBusterUrl = `${fetchUrl}${fetchUrl.includes("?") ? "&" : "?"}_t=${Date.now()}`;
		const response = await fetch(cacheBusterUrl, {
			cache: "no-cache",
			headers: {
				"Cache-Control": "no-cache, no-store, must-revalidate",
				"Pragma": "no-cache",
				"Expires": "0",
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch character from blob storage: ${response.statusText}`);
		}

		const characterData = await response.json();

		return res.status(200).json({
			success: true,
			message: "Character loaded successfully",
			character: characterData,
			id: id,
			fetchedFrom: fetchUrl,
		});
	} catch (error) {
		console.error("Get character error:", error);
		return res.status(500).json({
			error: "Failed to load character",
			details: error.message,
		});
	}
}