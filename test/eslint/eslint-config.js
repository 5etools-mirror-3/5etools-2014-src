export const CONFIG_IGNORES = {
	// Note: there should be no other properties in this object
	ignores: [
		// Other dirs
		"audio/*",
		"certs/*",
		"css/*",
		"data/*",
		"doc/*",
		"docker/*",
		"docker-build/*",
		"fonts/*",
		"homebrew/*",
		"icon/*",
		"img/*",
		"prerelease/*",
		"scss/*",
		"search/*",
		"spellcheck/*",

		// Generated
		"sw.js",
		"sw-injector.js",

		// Libraries
		"lib/*",
		"node_modules/*",

		// Scratches
		"scratch/*",
		"trash/*",
		"trash_in/*",

		// Fork-only Node/API surfaces (Cloudflare workers, Vercel-style handlers)
		"api/*",
		"cloudflare-worker/*",

		// Fork feature islands with historical lint debt (synced separately from upstream style)
		"js/character-manager.js",
		"js/character-spell-manager.js",
		"js/charactereditor.js",
		"js/characters.js",
		"js/filter-characters.js",
		"js/render-characters.js",
		"js/dice-box-manager.js",
		"js/dice-config.js",
		"js/login.js",
		"js/img-config.js",
		"sw-template.js",
		"node/generate-image-urls.mjs",
	],
};
