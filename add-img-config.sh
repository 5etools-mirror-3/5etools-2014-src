#!/bin/bash

# Script to add img-config.js to all HTML files that include render.js
# This enables external image loading from 5e.tools

echo "Adding image configuration to HTML files..."

for file in *.html; do
    if grep -q 'render\.js' "$file"; then
        # Check if img-config.js is already included
        if grep -q 'img-config\.js' "$file"; then
            echo "  $file - Already configured"
        else
            # Add img-config.js after render.js
            if sed -i.bak 's|<script type="text/javascript" defer src="js/render\.js"></script>|<script type="text/javascript" defer src="js/render.js"></script>\
<script type="text/javascript" defer src="js/img-config.js"></script>|' "$file"; then
                echo "  $file - Added img-config.js"
                # Remove backup file
                rm "$file.bak"
            else
                echo "  $file - Failed to update"
            fi
        fi
    else
        echo "  $file - No render.js found, skipping"
    fi
done

echo "Image configuration setup complete!"
echo "Images will now load from https://5e.tools/img/ instead of local files."
echo ""
echo "To disable external images, edit js/img-config.js and set USE_EXTERNAL_IMAGES to false."