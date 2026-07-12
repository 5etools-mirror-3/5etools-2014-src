"use strict";

class PageFilterCharacters extends PageFilterBase {
	constructor (opts) {
		super(opts);

		this._sourceFilter = new SourceFilter();
		this._levelFilter = new RangeFilter({
			header: "Level",
			min: 1,
			max: 20,
		});
	}

	static mutateForFilters (character) {
		if (!character) return; // Defensive: skip if undefined/null

		// Only compute race if we don't already have it (preserve API metadata)
		if (!character._fRace) {
			character._fRace = character.race?.name || "Unknown";
		}

		// Only compute class info if we don't already have it (preserve API metadata)
		if (!character._fClass) {
			// Create detailed class display with subclasses
			if (character.class && Array.isArray(character.class)) {
				character._fClass = character.class.map(cls => {
					let classStr = cls.name;
					if (cls.subclass && cls.subclass.name) {
						classStr += ` (${cls.subclass.name})`;
					}
					return classStr;
				}).join("/");
			} else {
				character._fClass = "Unknown";
			}
		}

		// Only compute class simple if we don't already have it
		if (!character._fClassSimple) {
			if (character.class && Array.isArray(character.class)) {
				// Also create a simple class list for filtering/search
				character._fClassSimple = character.class.map(cls => cls.name).join("/");
			} else {
				character._fClassSimple = "Unknown";
			}
		}

		// Only compute level if we don't already have it (preserve API metadata)
		if (!character._fLevel) {
			if (character.class && Array.isArray(character.class)) {
				// Calculate total level from class levels
				character._fLevel = character.class.reduce((total, cls) => {
					return total + (cls.level || 0);
				}, 0);
			} else {
				character._fLevel = 1;
			}
		}

		character._fBackground = character.background?.name || "Unknown";
		character._fSource = character.source;
	}

	addToFilters (character, isExcluded) {
		if (isExcluded) return;
		this._sourceFilter.addItem(character._fSource);
	}

	mutateAndAddToFilters (character, isExcluded) {
		PageFilterCharacters.mutateForFilters(character);
		this.addToFilters(character, isExcluded);
	}

	async _pPopulateBoxOptions (opts) {
		opts.filters = [
			this._sourceFilter,
			this._levelFilter,
		];
	}

	toDisplay (values, character) {
		if (!character) return false; // Defensive: do not display undefined entries
		return this._filterBox.toDisplay(
			values,
			character._fSource,
			character._fLevel,
		);
	}
}
