#!/usr/bin/env node

/**
 * Generate External Image URLs for Service Worker Caching
 *
 * This script scans through all JSON data files to find image references
 * and generates a list of external image URLs that should be cached by the service worker.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Base URL for external images
const EXTERNAL_IMG_BASE = "https://5e.tools/img/";

// Set to store unique image URLs
const imageUrls = new Set();

/**
 * Recursively search for image references in an object/array
 */
function extractImageUrls (obj, path = "") {
	if (typeof obj === "string") {
		// Look for strings that look like image extensions
		const imageExtensions = [".webp", ".png", ".jpg", ".jpeg", ".svg", ".gif"];
		const hasImageExtension = imageExtensions.some(ext => obj.includes(ext));

		if (hasImageExtension) {
			// Clean up the path and add to our set
			let imagePath = obj;

			// Remove any leading slashes
			imagePath = imagePath.replace(/^\/+/, "");

			// Handle different formats:
			if (imagePath.startsWith("img/")) {
				// Full path like "img/bestiary/tokens/MM/Aboleth.webp"
				const fullUrl = EXTERNAL_IMG_BASE + imagePath.replace(/^img\//, "");
				imageUrls.add(fullUrl);
			} else if (imagePath.includes("/") && !imagePath.startsWith("http")) {
				// Relative path like "adventure/BGDIA/001-ud5xx-00-01.webp"
				// These should be treated as img/ prefixed paths
				const fullUrl = EXTERNAL_IMG_BASE + imagePath;
				imageUrls.add(fullUrl);
			} else {
				// Might be a filename only or other format
				// For now, let's see what we get
				console.log(`  Skipping non-path image reference: "${imagePath}" in ${path}`);
			}
		}
	} else if (Array.isArray(obj)) {
		obj.forEach((item, index) => extractImageUrls(item, `${path}[${index}]`));
	} else if (obj && typeof obj === "object") {
		Object.entries(obj).forEach(([key, value]) => {
			extractImageUrls(value, path ? `${path}.${key}` : key);
		});
	}
}

/**
 * Process a single JSON file
 */
function processJsonFile (filePath) {
	try {
		const content = fs.readFileSync(filePath, "utf8");
		const data = JSON.parse(content);
		extractImageUrls(data);
	} catch (error) {
		console.warn(`Warning: Could not process ${filePath}:`, error.message);
	}
}

/**
 * Recursively scan directory for JSON files
 */
function scanDirectory (dirPath) {
	const entries = fs.readdirSync(dirPath, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);

		if (entry.isDirectory()) {
			scanDirectory(fullPath);
		} else if (entry.isFile() && entry.name.endsWith(".json")) {
			processJsonFile(fullPath);
		}
	}
}

/**
 * Add some common image patterns that might not be in the data files
 */
function addCommonImagePatterns () {
	// Add common bestiary image patterns
	const commonPatterns = [
		// Bestiary tokens - common patterns
		"bestiary/tokens/",
		"bestiary/",
		// Book covers and content
		"covers/",
		"book/",
		// Adventure content
		"adventure/",
		// Items and equipment
		"items/",
		// Spells
		"spells/",
		// Classes and subclasses
		"classes/",
		// Races
		"races/",
		// Deities
		"deities/",
		// Maps
		"maps/",
	];

	// Note: We can't generate specific URLs without the actual filenames,
	// so we'll just add these as patterns for manual inclusion if needed
	console.log("Common image directory patterns to consider:");
	commonPatterns.forEach(pattern => {
		console.log(`  ${EXTERNAL_IMG_BASE}${pattern}**/*`);
	});
}

/**
 * Main execution
 */
function main () {
	console.log("🔍 Scanning for image references in JSON data files...");

	const dataDir = path.join(projectRoot, "data");

	if (!fs.existsSync(dataDir)) {
		console.error("Error: data directory not found at", dataDir);
		process.exit(1);
	}

	// Scan all JSON files in the data directory
	scanDirectory(dataDir);

	// Convert Set to sorted array
	const sortedUrls = Array.from(imageUrls).sort();

	console.log(`\n📊 Found ${sortedUrls.length} unique image URLs:`);

	if (sortedUrls.length === 0) {
		console.log("\n⚠️  No image URLs found in JSON data files.");
		console.log("This might indicate that:");
		console.log("1. Images are referenced dynamically in code");
		console.log("2. Image paths are stored in a different format");
		console.log("3. Images are referenced by filename only, not full paths\n");

		addCommonImagePatterns();
	} else {
		// Output the URLs
		sortedUrls.forEach(url => console.log(`  ${url}`));

		// Write to a file for use in build process
		const outputFile = path.join(projectRoot, "image-urls.json");
		const outputData = {
			generated: new Date().toISOString(),
			baseUrl: EXTERNAL_IMG_BASE,
			count: sortedUrls.length,
			urls: sortedUrls,
		};

		fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
		console.log(`\n💾 Saved image URLs to: ${outputFile}`);
	}

	console.log("\n✅ Scan complete!");
}

// Run the script
main();