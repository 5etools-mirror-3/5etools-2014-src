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
		// Wait for Renderer to be available and properly initialized
		if (typeof Renderer === 'undefined' || !Renderer.get || !Renderer.get().setBaseMediaUrl) {
			// If Renderer isn't ready, try again in a short delay
			setTimeout(initImageConfig, 100);
			return;
		}
		
		if (IMAGE_CONFIG.USE_EXTERNAL_IMAGES) {
			try {
				// Set the base media URL for images to point to 5e.tools
				Renderer.get().setBaseMediaUrl("img", IMAGE_CONFIG.EXTERNAL_IMG_BASE + "img/");
				
				console.log("✓ Image configuration: Using external images from", IMAGE_CONFIG.EXTERNAL_IMG_BASE + "img/");
				
				// Test that the configuration worked
				const testUrl = Renderer.get().getMediaUrl("img", "test.webp");
				console.log("✓ Test image URL:", testUrl);
				
				// Mark as successfully configured
				window.IMAGE_CONFIG_LOADED = true;
				
			} catch (error) {
				console.error("Failed to configure external images:", error);
				console.log("Falling back to local images");
			}
		} else {
			console.log("Image configuration: Using local images");
		}
	}
	
	// Track initialization attempts
	let initAttempts = 0;
	const maxAttempts = 100; // Try for up to 10 seconds
	
	function initWithRetry() {
		initAttempts++;
		
		if (window.IMAGE_CONFIG_LOADED) {
			console.log("✓ Image config already loaded");
			return;
		}
		
		if (initAttempts > maxAttempts) {
			console.warn("⚠️ Failed to initialize image config after", maxAttempts, "attempts");
			console.log("Renderer available:", typeof Renderer !== 'undefined');
			console.log("Renderer.get available:", typeof Renderer !== 'undefined' && !!Renderer.get);
			console.log("setBaseMediaUrl available:", typeof Renderer !== 'undefined' && !!Renderer.get && !!Renderer.get().setBaseMediaUrl);
			return;
		}
		
		// Wait for Renderer to be available and properly initialized
		if (typeof Renderer === 'undefined' || !Renderer.get || !Renderer.get().setBaseMediaUrl) {
			setTimeout(initWithRetry, 100);
			return;
		}
		
		initImageConfig();
	}
	
	// Initialize immediately if possible
	initWithRetry();
	
	// Initialize when DOM is ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initWithRetry);
	} else {
		// DOM is already ready, try again
		setTimeout(initWithRetry, 10);
	}
	
	// Also try when window loads (later event)
	window.addEventListener('load', initWithRetry);
	
	// Try multiple times with different intervals
	setTimeout(initWithRetry, 50);
	setTimeout(initWithRetry, 200);
	setTimeout(initWithRetry, 500);
	setTimeout(initWithRetry, 1000);
	
	// Listen for any custom events that might indicate Renderer is ready
	document.addEventListener('toolsLoaded', initWithRetry);
	
	// Make config available globally for debugging and manual initialization
	window.IMAGE_CONFIG = IMAGE_CONFIG;
	window.initImageConfig = initImageConfig;
	window.initImageConfigWithRetry = initWithRetry;
})();