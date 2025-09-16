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
		if (!sanitizedSource) {
			return res.status(400).json({
				success: false,
				error: "Invalid source name",
			});
		}

		// Validate the password
		const isValid = await PasswordUtils.validatePassword(sanitizedSource, password);

		return res.status(200).json({
			success: true,
			valid: isValid,
			source: sanitizedSource,
		});
	} catch (error) {
		console.error("Validate source error:", error);

		return res.status(500).json({
			success: false,
			error: "Failed to validate password",
		});
	}
}