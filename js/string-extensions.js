String.prototype.applySpeedIcons = function () {
	return this.replace(/(\w+\s+)?\d+\s+feet/g, (match, movement) => {
		const icon = movement && movement.trim() === "fly" ? "flight" : "walk";
		return `<img src="./img/statsicons/${icon}-icon.webp" width="20" height="20"> ${match}`;
	});
};

