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

	if (req.method !== "GET") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	try {
		// For now, we return an empty list since Vercel Blob doesn't easily support listing
		// This could be expanded to maintain an index of sources if needed
		const sources = await PasswordUtils.listSources();

		return res.status(200).json({
			success: true,
			sources: sources,
			message: "Note: Source listing is limited on this platform. Contact your DM for available source names.",
		});
	} catch (error) {
		console.error("List sources error:", error);

		return res.status(500).json({
			success: false,
			error: "Failed to list sources",
		});
	}
}