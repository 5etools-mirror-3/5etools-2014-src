/**
 * Image Configuration for 5etools
 * Sets the base media URL to point to the external 5e.tools domain for images
 */

(function() {
	'use strict';
	
	// Configuration for image hosting
	const IMAGE_CONFIG = {
		// Base URL for images hosted on 5e.tools
		EXTERNAL_IMG_BASE: "https://5e.tools/",
		
		// Enable external image loading
		USE_EXTERNAL_IMAGES: true
	};
	
	/**
	 * Initialize image configuration
	 * This should be called before any pages that use images are loaded
	 */
	function initImageConfig() {
		// Wait for Renderer to be available
		if (typeof Renderer === 'undefined' || !Renderer.get) {
			// If Renderer isn't ready, try again in a short delay
			setTimeout(initImageConfig, 100);
			return;
		}
		
		if (IMAGE_CONFIG.USE_EXTERNAL_IMAGES) {
			// Set the base media URL for images to point to 5e.tools
			Renderer.get().setBaseMediaUrl("img", IMAGE_CONFIG.EXTERNAL_IMG_BASE + "img/");
			
			console.log("Image configuration: Using external images from", IMAGE_CONFIG.EXTERNAL_IMG_BASE + "img/");
			
			// Add debugging for getMediaUrl calls
			const originalGetMediaUrl = Renderer.get().getMediaUrl;
			Renderer.get().getMediaUrl = function(mediaDir, path) {
				const result = originalGetMediaUrl.call(this, mediaDir, path);
				if (mediaDir === "img") {
					console.log(`Image URL: ${path} -> ${result}`);
				}
				return result;
			};
		} else {
			console.log("Image configuration: Using local images");
		}
	}
	
	// Initialize when DOM is ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initImageConfig);
	} else {
		initImageConfig();
	}
	
	// Also try to initialize immediately in case Renderer is already available
	initImageConfig();
	
	// Make config available globally for debugging
	window.IMAGE_CONFIG = IMAGE_CONFIG;
	window.initImageConfig = initImageConfig;
})();