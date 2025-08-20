"use strict";

class PageFilterCharacters extends PageFilterBase {
	static _MISC_FILTER_OPTS = {
		spellcaster: "Spellcaster",
		multiclass: "Multiclass",
	};

	constructor () {
		super();

		this._levelFilter = new RangeFilter({
			header: "Level",
			min: 1,
			max: 20,
		});
		this._raceFilter = new Filter({
			header: "Race",
			items: [],
		});
		this._classFilter = new Filter({
			header: "Class",
			items: [],
		});
		this._backgroundFilter = new Filter({
			header: "Background",
			items: [],
		});
		this._alignmentFilter = new Filter({
			header: "Alignment",
			items: ["L", "NX", "C", "G", "NY", "E", "N", "U", "A"],
			displayFn: alignment => Parser.alignmentAbvToFull(alignment).toTitleCase(),
			itemSortFn: null,
		});
		this._sourceFilter = new SourceFilter();
		this._miscFilter = new Filter({
			header: "Miscellaneous",
			items: Object.keys(PageFilterCharacters._MISC_FILTER_OPTS),
			displayFn: (k) => PageFilterCharacters._MISC_FILTER_OPTS[k],
		});
	}

	static mutateForFilters (character) {
		character._fLevel = character.level;
		character._fRace = character.race?.name || "Unknown";
		character._fClass = character.class?.map(cls => cls.name).join(", ") || "Unknown";
		character._fBackground = character.background?.name || "Unknown";
		character._fAlignment = character.alignment ? Parser.alignmentListToFull(character.alignment) : "Unknown";
		character._fSource = character.source || "Unknown";
		character._fMisc = [];

		if (character.spellcasting) character._fMisc.push("spellcaster");
		if (character.class && character.class.length > 1) character._fMisc.push("multiclass");

		// Add search strings
		character._fSearch = [
			character.name,
			character._fRace,
			character._fClass,
			character._fBackground,
			character._fAlignment,
			character.customText || "",
		].join(" ").toLowerCase();
	}

	addToFilters (character, isExcluded) {
		if (isExcluded) return;

		this._sourceFilter.addItem(character._fSource);
		this._raceFilter.addItem(character._fRace);
		this._classFilter.addItem(character._fClass);
		this._backgroundFilter.addItem(character._fBackground);
	}

	mutateAndAddToFilters (character, isExcluded) {
		PageFilterCharacters.mutateForFilters(character);
		this.addToFilters(character, isExcluded);
	}

	async _pPopulateBoxOptions (opts) {
		opts.filters = [
			this._sourceFilter,
			this._levelFilter,
			this._raceFilter,
			this._classFilter,
			this._backgroundFilter,
			this._alignmentFilter,
			this._miscFilter,
		];
	}

	toDisplay (values, character) {
		return this._filterBox.toDisplay(
			values,
			character._fSource,
			character._fLevel,
			character._fRace,
			character._fClass,
			character._fBackground,
			character._fAlignment,
			character._fMisc,
		);
	}
}