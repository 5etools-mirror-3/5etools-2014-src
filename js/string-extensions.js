String.prototype.applySpeedIcons = function () {
    return this.replace(/(<span class="bold rd__list-item-name">Speed)(:)(<\/span>)/g, 
        '$1<img src="./img/statsicons/walk-icon.webp" width="20" height="20">$2$3');
};

String.prototype.applySizeIcons = function () {
    return this.replace(/(<span class="bold rd__list-item-name">Size)(:)(<\/span>)/g, 
        '$1<img src="./img/statsicons/creature-size-icon.webp" width="20" height="20">$2$3');
};

String.prototype.applySkillIcons = function () {
    return this.replace(
        /(<span[^>]*data-vet-hash="([^"]+)_phb"[^>]*>)([^<]+)(<\/span>)/g,
        function(match, openTag, skillHash, skillText, closeTag) {
            // Decode the hash and normalize it
            const decodedHash = decodeURIComponent(skillHash);
            const normalizedHash = decodedHash.toLowerCase().replace(/\s+/g, '');
            
            // Normalize the skill name for comparison
            const skillName = skillText.trim();
            const normalizedSkillName = skillName.toLowerCase().replace(/\s+/g, '');
            
            // Check if this is actually a skill by verifying the hash matches the skill name pattern
            if (normalizedHash === normalizedSkillName) {
                console.log(skillName);
                const iconName = skillName.toLowerCase().split(" ").join("-");
                const icon = `<img src="./img/skillsicons/${iconName}-icon.webp" width="20" height="20">`;
                return `${openTag}${icon}${skillText}${closeTag}`;
            }
            
            // If not a skill, return unchanged
            return match;
        }
    );
};
