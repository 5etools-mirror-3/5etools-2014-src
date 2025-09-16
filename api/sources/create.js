import { PasswordUtils } from "./password-utils.js";

export default async function handler (req, res) {
	// Enable CORS
	res.setHeader("Access-Control-Allow-Credentials", true);
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
	res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version");

	res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
	res.setHeader("Pragma", "no-cache");
	res.setHeader("Expires", "0");

	if (req.method === "OPTIONS") {
		res.status(200).end();
		return;
	}

	if (req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	try {
		const { source, password } = req.body;

		// Validate input
		if (!source || !password) {
			return res.status(400).json({
				success: false,
				error: "Source name and password are required",
			});
		}

		// Sanitize source name
		const sanitizedSource = PasswordUtils.sanitizeSourceName(source);
		if (!sanitizedSource || sanitizedSource.length === 0) {
			return res.status(400).json({
				success: false,
				error: "Invalid source name. Use only letters, numbers, underscores, and hyphens.",
			});
		}

		if (password.length < 1) {
			return res.status(400).json({
				success: false,
				error: "Password cannot be empty",
			});
		}

		// Create the source
		const result = await PasswordUtils.createSource(sanitizedSource, password);

		return res.status(200).json({
			success: true,
			message: "Source created successfully",
			source: result.source,
			createdAt: result.createdAt,
		});
	} catch (error) {
		console.error("Create source error:", error);

		if (error.message === "Source already exists") {
			return res.status(409).json({
				success: false,
				error: "Source already exists. Choose a different name.",
			});
		}

		if (error.message === "BLOB_READ_WRITE_TOKEN not configured") {
			return res.status(500).json({
				success: false,
				error: "Server configuration error",
			});
		}

		return res.status(500).json({
			success: false,
			error: "Failed to create source",
		});
	}
}