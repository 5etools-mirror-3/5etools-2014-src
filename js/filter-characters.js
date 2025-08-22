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
		character._fRace = character.race?.name || "Unknown";
		
		// Create detailed class display with subclasses
		if (character.class && Array.isArray(character.class)) {
			character._fClass = character.class.map(cls => {
				let classStr = cls.name;
				if (cls.subclass && cls.subclass.name) {
					classStr += ` (${cls.subclass.name})`;
				}
				return classStr;
			}).join("/");
			
			// Also create a simple class list for filtering/search
			character._fClassSimple = character.class.map(cls => cls.name).join("/");
			
			// Calculate total level from class levels
			character._fLevel = character.class.reduce((total, cls) => {
				return total + (cls.level || 0);
			}, 0);
		} else {
			character._fClass = "Unknown";
			character._fClassSimple = "Unknown";
			character._fLevel = 1;
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
		return this._filterBox.toDisplay(
			values,
			character._fSource,
			character._fLevel,
		);
	}
}
