// CharacterSpellManager - provides spell selection UI matching spells.html exactly
// Use a function to define the class when needed to handle timing issues with ListPage

function createCharacterSpellManager () {
	if (typeof ListPage === "undefined") {
		console.warn("ListPage is not available yet. CharacterSpellManager will be created when ListPage is loaded.");
		return null;
	}

	class CharacterSpellManager extends ListPage {
		constructor () {
			super({
				pageFilter: new PageFilterSpells({
					sourceFilterOpts: {
						pFnOnChange: (...args) => this._pLoadSource.apply(this, args),
					},
				}),

				listOptions: {
					fnSort: PageFilterSpells.sortSpells,
				},

				dataProps: ["spell"],
				listClass: "spells",
			});

			this._selectedSpells = new Map();
			this._onComplete = null;
			this._$modalInner = null;
			this._doClose = null;
			this._characterData = null; // Store character context for filtering
			this._existingSpellNames = new Set();
			this._existingSpellHashes = new Set();
			this._characterFilterValues = null; // stored defaults for Reset
			this._seenHashes = new Set();
			this._isDebug = false; // set to true for verbose logging during development
			this._handleFilterChangeDebounced = null;
		}

		// Bind the modal Reset button so it restores character-specific defaults (shift+click still does full reset)
		_bindResetButtonToCharacterDefaults () {
			if (!this._$modalInner || !this._filterBox) return;
			try {
				const $btnReset = this._$modalInner.find("#reset");
				if (!$btnReset || !$btnReset.length) return;
				$btnReset.off("click").click((evt) => {
					if (evt.shiftKey || !this._characterFilterValues) {
					// perform full reset (preserve original behaviour on shift-click)
						this._filterBox.reset({isResetAll: !!evt.shiftKey});
					} else {
					// restore character defaults
						this._filterBox.setFromValues(this._characterFilterValues);
					}
					// re-render and re-apply filters
					try { this._filterBox.render(); } catch (e) {}
					this.handleFilterChange();
				});
			} catch (e) {
			/* swallow any errors silently */
			}
		}

		// Parse existing spells from character data to pre-select them
		_parseExistingSpells (characterData) {
			console.log("📖 Parsing existing character spells...");

			if (!characterData?.spells?.levels) {
				console.log("No existing spells found");
				return;
			}

			// Extract spell names and hashes from all spell levels
			const existingSpellNames = new Set();
			const existingSpellHashes = new Set();
			Object.keys(characterData.spells.levels).forEach(level => {
				const levelData = characterData.spells.levels[level];
				if (levelData?.spells && Array.isArray(levelData.spells)) {
					levelData.spells.forEach(spellEntry => {
					// Handle spell names with source (e.g., "Aganazzar's Scorcher|XGE")
						const [namePart, sourcePart] = spellEntry.split("|");
						const name = namePart?.trim();
						const source = sourcePart?.trim() || "PHB";
						existingSpellNames.add(name);
						const hash = `${UrlUtil.encodeForHash(name)}_${UrlUtil.encodeForHash(source)}`;
						existingSpellHashes.add(hash);
					});
				}
			});

			console.log(`Found ${existingSpellNames.size} existing spells (names) and ${existingSpellHashes.size} hashes:`, Array.from(existingSpellNames));
			this._existingSpellNames = existingSpellNames;
			this._existingSpellHashes = existingSpellHashes;
		}

		// Main entry point - opens the spell selection modal
		async openSpellManager (characterData, onComplete) {
			console.log("🎯 Opening spell manager...");
			console.log("Character data:", characterData);

			this._characterData = characterData; // Store for filter context
			this._onComplete = onComplete;

			// Ensure we start with a fresh filter/list state each time the modal opens.
			// This prevents filters from being cached between modal opens (e.g., when editing different characters).
			try {
				this._characterFilterValues = null;
				this._selectedSpells = new Map();
				this._seenHashes = new Set();
				this._existingSpellNames = new Set();
				this._existingSpellHashes = new Set();
				if (this._filterBox && this._filterBox.reset) {
					try { this._filterBox.reset({isResetAll: true}); } catch (e) { /* ignore */ }
				}
				// Recreate the page filter so it doesn't carry previous filter items
				this._pageFilter = new PageFilterSpells({
					sourceFilterOpts: {
						pFnOnChange: (...args) => this._pLoadSource.apply(this, args),
					},
				});
				console.log("♻️ Reset filter and page state for fresh modal open");
			} catch (e) {
				console.warn("Error while resetting modal filter state:", e);
			}

			// Parse existing spells from character data
			this._parseExistingSpells(characterData);

			const {$modalInner, doClose} = UiUtil.getShowModal({
				title: "Select Spells for Character",
				isHeight100: true,
				isWidth100: true,
				isUncappedHeight: true,
				isHeaderBorder: true,
				cbClose: () => {
					console.log("� Spell manager closed");
				},
			});

			this._$modalInner = $modalInner;
			this._doClose = doClose;

			// Create the same DOM structure as spells.html
			await this._pRenderModalContent();

			// Initialize the page system
			await this.pOnLoad();

			// Set up our custom event handlers
			this._setupEventHandlers();
		}

		// Creates the DOM structure matching spells.html
		async _pRenderModalContent () {
			const htmlStructure = `
			<div class="view-col-group h-100 mh-0">
				<div class="view-col-wrapper">
					<div class="view-col ve-flex-7" id="listcontainer">
						<div class="lst__form-top" id="filter-search-group">
							<div class="w-100 relative">
								<input type="search" id="lst__search" autocomplete="off" autocapitalize="off" spellcheck="false" class="search form-control lst__search lst__search--no-border-h">
								<div id="lst__search-glass" class="lst__wrp-search-glass no-events ve-flex-vh-center"><span class="glyphicon glyphicon-search"></span></div>
								<div class="lst__wrp-search-visible no-events ve-flex-vh-center"></div>
							</div>
							<button type="button" class="ve-btn ve-btn-default" id="reset">Reset</button>
						</div>

						<div id="filtertools" class="input-group input-group--bottom ve-flex no-shrink">
							<button type="button" class="ve-col-2-9 sort ve-btn ve-btn-default ve-btn-xs" data-sort="name">Name</button>
							<button type="button" class="ve-col-1-5 sort ve-btn ve-btn-default ve-btn-xs" data-sort="level">Level</button>
							<button type="button" class="ve-col-1-7 sort ve-btn ve-btn-default ve-btn-xs" data-sort="time">Time</button>
							<button type="button" class="ve-col-1-2 sort ve-btn ve-btn-default ve-btn-xs" data-sort="school">School</button>
							<button type="button" class="ve-col-0-6 sort ve-btn ve-btn-default ve-btn-xs" data-sort="concentration" title="Concentration">C.</button>
							<button type="button" class="ve-col-2-4 sort ve-btn ve-btn-default ve-btn-xs" data-sort="range">Range</button>
							<button type="button" class="sort ve-btn ve-btn-default ve-btn-xs ve-grow" data-sort="source">Source</button>
						</div>

						<div id="list" class="list list--stats"></div>
					</div>
					
					<div id="contentwrapper" class="view-col ve-flex-5">
						<div class="w-100 ve-flex" id="stat-tabs">
							<div class="ml-auto ve-flex" id="tabs-right"></div>
						</div>

						<div id="wrp-pagecontent" class="relative wrp-stats-table">
							<table id="pagecontent" class="w-100 stats">
								<tr><th class="ve-tbl-border" colspan="6"></th></tr>
								<tr><td colspan="6" class="initial-message initial-message--med">Select a spell to view it here</td></tr>
								<tr><th class="ve-tbl-border" colspan="6"></th></tr>
							</table>
						</div>

						<div class="ve-flex-vh-center mt-2 no-print">
							<div class="ve-flex-v-center mr-3">
								<span>Selected: <span id="selected-count">0</span> spells</span>
							</div>
							<div class="ve-flex-v-center mr-3" id="spell-suggestions">
								<!-- Spell suggestions will be populated here -->
							</div>
							<div class="ve-flex-v-center">
								<button type="button" id="btn-add-selected" class="ve-btn ve-btn-primary mr-2">Add Selected</button>
								<button type="button" id="btn-cancel" class="ve-btn ve-btn-default">Cancel</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;

			this._$modalInner.html(htmlStructure);
		}

		// Set up event handlers for our custom modal buttons
		_setupEventHandlers () {
			this._$modalInner.find("#btn-add-selected").click(() => {
				const selectedSpells = this.getSelectedSpells();
				console.log("🔮 Selected spells:", selectedSpells);
				if (this._onComplete) {
					this._onComplete(selectedSpells);
				}
				if (this._doClose) {
					this._doClose();
				}
			});

			this._$modalInner.find("#btn-cancel").click(() => {
				if (this._doClose) {
					this._doClose();
				}
			});

			// Display spell count suggestions
			this._displaySpellSuggestions();
		}

		// Display helpful spell count suggestions based on character class and level
		_displaySpellSuggestions () {
			if (!this._characterData?.class) return;

			const suggestions = this._calculateSpellSuggestions();
			if (!suggestions.length) return;

			const $suggestionsContainer = this._$modalInner.find("#spell-suggestions");
			const suggestionsHtml = `
			<div class="ve-small ve-muted">
				<strong>Suggestions:</strong> ${suggestions.join(", ")}
			</div>
		`;
			$suggestionsContainer.html(suggestionsHtml);
		}

		// Calculate appropriate spell count suggestions based on D&D 5e guidelines
		_calculateSpellSuggestions () {
			if (!this._characterData?.class) return [];

			const suggestions = [];

			// Get the highest level spellcasting class
			const spellcastingClass = this._characterData.class.find(cls => {
				const className = cls.name;
				const fullCasters = ["Bard", "Cleric", "Druid", "Sorcerer", "Warlock", "Wizard"];
				const halfCasters = ["Paladin", "Ranger"];
				return fullCasters.includes(className) || halfCasters.includes(className)
				   || (className === "Fighter" && cls.subclass?.name === "Eldritch Knight")
				   || (className === "Rogue" && cls.subclass?.name === "Arcane Trickster");
			});

			if (!spellcastingClass) return [];

			const className = spellcastingClass.name;
			const level = spellcastingClass.level || 1;

			// Spell count suggestions by class
			if (className === "Wizard") {
				suggestions.push(`Cantrips: ${Math.min(3 + Math.floor((level - 1) / 3), 5)}`);
				suggestions.push(`Spellbook: ${6 + (level - 1) * 2} total`);
				suggestions.push(`Prepared: ${Math.max(1, Math.floor(level / 2) + 3)} per day`);
			} else if (className === "Sorcerer") {
				const cantrips = level === 1 ? 4 : level < 4 ? 4 : level < 10 ? 5 : 6;
				const known = level === 1 ? 2 : level < 3 ? 3 : level < 4 ? 4 : level < 5 ? 5
				         : level < 6 ? 6 : level < 7 ? 7 : level < 8 ? 8 : level < 9 ? 9
				         : level < 10 ? 10 : level < 11 ? 11 : level < 17 ? 12 : level < 19 ? 13
				         : level < 20 ? 14 : 15;
				suggestions.push(`Cantrips: ${cantrips}`);
				suggestions.push(`Known: ${known} total`);
			} else if (className === "Bard") {
				const cantrips = level < 4 ? 2 : level < 10 ? 3 : 4;
				const known = level < 2 ? 4 : level < 3 ? 5 : level < 4 ? 6 : level < 5 ? 7
				         : level < 6 ? 8 : level < 7 ? 9 : level < 8 ? 10 : level < 9 ? 11
				         : level < 10 ? 12 : level < 11 ? 13 : level < 13 ? 14 : level < 14 ? 15
				         : level < 15 ? 16 : level < 16 ? 17 : level < 17 ? 18 : level < 18 ? 19
				         : level < 19 ? 20 : level < 20 ? 21 : 22;
				suggestions.push(`Cantrips: ${cantrips}`);
				suggestions.push(`Known: ${known} total`);
			} else if (className === "Cleric" || className === "Druid") {
				const cantrips = level < 4 ? 3 : level < 10 ? 4 : 5;
				const prepared = Math.max(1, level + 3); // Assuming +3 wisdom modifier
				suggestions.push(`Cantrips: ${cantrips}`);
				suggestions.push(`Prepared: ${prepared} per day`);
			} else if (className === "Warlock") {
				const cantrips = level < 4 ? 2 : level < 10 ? 3 : 4;
				const known = level < 2 ? 2 : level < 3 ? 3 : level < 4 ? 4 : level < 5 ? 5
				         : level < 6 ? 6 : level < 7 ? 7 : level < 8 ? 8 : level < 9 ? 9 : 10;
				suggestions.push(`Cantrips: ${cantrips}`);
				suggestions.push(`Known: ${known} total`);
			} else if (className === "Paladin" || className === "Ranger") {
				if (level >= 2) {
					const prepared = Math.max(1, Math.floor(level / 2) + 2); // Assuming +2 modifier
					suggestions.push(`Prepared: ${prepared} per day`);
				}
			} else if (className === "Fighter" && spellcastingClass.subclass?.name === "Eldritch Knight") {
				if (level >= 3) {
					const cantrips = level < 10 ? 2 : 3;
					const known = level < 4 ? 3 : level < 7 ? 4 : level < 8 ? 5 : level < 10 ? 6
					         : level < 11 ? 7 : level < 13 ? 8 : level < 14 ? 9 : level < 16 ? 10
					         : level < 19 ? 11 : level < 20 ? 12 : 13;
					suggestions.push(`Cantrips: ${cantrips}`);
					suggestions.push(`Known: ${known} total`);
				}
			} else if (className === "Rogue" && spellcastingClass.subclass?.name === "Arcane Trickster") {
				if (level >= 3) {
					const cantrips = level < 10 ? 3 : 4;
					const known = level < 4 ? 3 : level < 7 ? 4 : level < 8 ? 5 : level < 10 ? 6
					         : level < 11 ? 7 : level < 13 ? 8 : level < 14 ? 9 : level < 16 ? 10
					         : level < 19 ? 11 : level < 20 ? 12 : 13;
					suggestions.push(`Cantrips: ${cantrips}`);
					suggestions.push(`Known: ${known} total`);
				}
			}

			return suggestions;
		}

		getSelectedSpells () {
			return Array.from(this._selectedSpells.values());
		}

		// Handle filter changes using the standard ListPage pattern
		handleFilterChange () {
			if (!this._filterBox || !this._list || !this._dataList) {
				console.warn(`⚠️ Filter change called but missing components:`, {
					filterBox: !!this._filterBox,
					list: !!this._list,
					dataList: !!this._dataList,
				});
				return;
			}

			const f = this._filterBox.getValues();
			// Avoid expensive console logging unless debugging
			if (this._isDebug) console.log(`🔄 Applying filters to ${this._dataList?.length ?? 0} spells...`, f);

			// Skip re-applying if values unchanged
			try {
				const curValsStr = JSON.stringify(f);
				if (this._lastFilterValuesStr === curValsStr) return;
				this._lastFilterValuesStr = curValsStr;
			} catch (e) {
			// If serialization fails for any reason, continue and apply filters
			}

			const beforeCount = this._list.visibleItems.length;
			this._list.filter(item => {
				if (!item) return false;

				// Prefer using the stored entity on the ListItem if available. This avoids index-mismatch
				// bugs where item.ix no longer references the original data array index.
				const ent = item.data && item.data.entity ? item.data.entity : (this._dataList && this._dataList[item.ix]);
				if (!ent) {
					console.warn(`⚠️ Invalid item/entity in filter:`, item);
					return false;
				}

				// Debug: occasionally log mismatches for investigation
				if ((item.ix !== undefined) && this._dataList && this._dataList[item.ix] && this._dataList[item.ix] !== ent) {
					console.debug(`ℹ️ Filter: using item.data.entity rather than this._dataList[item.ix] (ix=${item.ix})`);
				}

				const pass = this._pageFilter.toDisplay(f, ent);
				// If debug mode is enabled, log cases where an entity passes despite its level not being in the Level filter
				if (this._isDebug && pass && f && f.Level && Object.keys(f.Level).length) {
					const lvlKeys = Object.keys(f.Level).map(k => Number.parseInt(k));
					if (!lvlKeys.includes(ent.level)) {
						console.debug(`🐞 Debug: spell passed filters despite level ${ent.level} not in active Level keys`, {name: ent.name, level: ent.level, levelKeys: lvlKeys, values: f});
					}
				}

				return pass;
			});
			const afterCount = this._list.visibleItems.length;

			if (this._isDebug) console.log(`🎯 Filter applied: ${beforeCount} -> ${afterCount} visible spells`);

			FilterBox.selectFirstVisible(this._dataList);
			// Update selection count after filtering
			this._updateSelectedCount();
		}

		// Required by PageFilterSpells for source loading
		async _pLoadSource () {
		// In modal context, we load all data upfront so no dynamic loading needed
			return Promise.resolve();
		}

		_updateSelectedCount () {
			const count = this._selectedSpells.size;
			const $counter = this._$modalInner.find("#selected-count");
			if ($counter.length) {
				$counter.text(count);
			}
		}

		// Handle right-click context menu (simplified for modal)
		_openContextMenu (evt, list, listItem) {
		// For now, just prevent default context menu in modal
			evt.preventDefault();
		}

		// Check if a spell is already selected by the character
		_isSpellSelected (spellName) {
		// Prefer hash-based lookup if available
			if (!this._existingSpellHashes) return this._existingSpellNames && this._existingSpellNames.has(spellName);
			// Try name-based first
			if (this._existingSpellNames && this._existingSpellNames.has(spellName)) return true;
			// Hash-based: attempt to find any hash matching this name (any source)
			for (const h of this._existingSpellHashes) {
				if (h.startsWith(`${UrlUtil.encodeForHash(spellName)}_`)) return true;
			}
			return false;
		}

		// Override stats rendering for modal context
		_renderStats_doBuildStatsTab ({ent}) {
			this._renderStats_doBuildStatsTab_spell({ent});
		}

		_renderStats_doBuildStatsTab_spell ({ent}) {
			try {
				let classesFilterValues;
				this._$pgContent = this._$modalInner.find("#pagecontent");
				// Use basic spell rendering for modal context
				this._renderBasicSpellPreview(ent);
			} catch (error) {
				console.error("Error rendering spell:", error);
				this._renderBasicSpellPreview(ent);
			}
		}

		_renderBasicSpellPreview (ent) {
		// Enhanced fallback rendering with proper 5etools-style formatting
			const levelText = ent.level === 0 ? "Cantrip" : `Level ${ent.level}`;
			const school = Parser.spSchoolAbvToFull ? Parser.spSchoolAbvToFull(ent.school) : ent.school;
			const time = Parser.spTimeListToFull ? Parser.spTimeListToFull(ent.time) : PageFilterSpells.getTblTimeStr(ent.time[0]);
			const range = Parser.spRangeToFull(ent.range);
			const components = Parser.spComponentsToFull ? Parser.spComponentsToFull(ent.components, ent.level) : "Components info";
			const duration = Parser.spDurationToFull ? Parser.spDurationToFull(ent.duration) : "Duration info";

			// Try to use Renderer.get() for proper text rendering with links
			let entriesHtml = "";
			if (ent.entries && typeof Renderer !== "undefined" && Renderer.get) {
				try {
					const renderer = Renderer.get();
					entriesHtml = ent.entries.map(entry => renderer.render(entry)).join("");
				} catch (e) {
				// Fallback to basic text
					entriesHtml = ent.entries ? ent.entries.map(entry => `<p>${entry}</p>`).join("") : "";
				}
			} else {
				entriesHtml = ent.entries ? ent.entries.map(entry => `<p>${entry}</p>`).join("") : "";
			}

			const html = `
			<table class="stats stats--book">
				<tr><th class="border" colspan="6"></th></tr>
				<tr><th class="stats-name" colspan="6">${ent.name}</th></tr>
				<tr><th class="stats-source" colspan="6">${levelText} ${school}</th></tr>
				<tr><th class="border" colspan="6"></th></tr>
				<tr><td colspan="6"><strong>Casting Time:</strong> ${time}</td></tr>
				<tr><td colspan="6"><strong>Range:</strong> ${range}</td></tr>
				<tr><td colspan="6"><strong>Components:</strong> ${components}</td></tr>
				<tr><td colspan="6"><strong>Duration:</strong> ${duration}</td></tr>
				<tr><th class="border" colspan="6"></th></tr>
				<tr><td class="divider" colspan="6"><div></div></td></tr>
				<tr><td colspan="6">${entriesHtml}</td></tr>
				<tr><th class="border" colspan="6"></th></tr>
			</table>
		`;

			this._$pgContent.empty().html(html);
		}

		// Initialize primary lists with full filtering system
		async _pOnLoad_pInitPrimaryLists () {
		// Initialize filter and list system
			await this._initFilterAndList();
		}

		// Initialize the complete filter system
		async _initFilterAndList () {
			const $modal = this._$modalInner;
			const $iptSearch = $modal.find("#lst__search");
			const $btnReset = $modal.find("#reset");

			// Use the page filter provided by the class (constructed in constructor via super)
			// Initialize filter box using the SAME pattern as ListPage
			this._filterBox = await this._pageFilter.pInitFilterBox({
				$iptSearch: $iptSearch,
				$wrpFormTop: $modal.find(`#filter-search-group`),
				$btnReset: $btnReset,
			});

			// Ensure any persisted state is fully loaded before attempting to reset it.
			// pInitFilterBox calls pDoLoadState internally, but some environments may load async
			// data afterward; call pDoLoadState explicitly here to be defensive.
			try {
				if (this._filterBox && this._filterBox.pDoLoadState) await this._filterBox.pDoLoadState();
				// Now clear persisted state for modal usage so the character defaults below are authoritative.
				if (this._filterBox && this._filterBox.reset) {
					this._filterBox.reset({isResetAll: true});
					console.log("🧹 Cleared persisted FilterBox state for modal (after load)");
				}
			} catch (e) {
			/* ignore */
			}

			console.log(`🎛️ FilterBox initialized with ${this._filterBox.filters.length} filters`);

			// Initialize List.js with proper configuration
			const $listContainer = $modal.find("#list");
			const pFnGetFluff = Renderer.spell.pGetFluff.bind(Renderer.spell);
			this._list = new List({
				$iptSearch: $iptSearch,
				$wrpList: $listContainer,
				fnSort: PageFilterSpells.sortSpells,
				syntax: new ListSyntaxSpells({fnGetDataList: () => this._dataList, pFnGetFluff}),
				isBindFindHotkey: true,
			});

			// IMPORTANT: initialize the list so it can perform its initial search/filter/render
			this._list.init();

			// Connect filter box to handle changes
			// Use a debounced handler to avoid CPU spikes when many filter events fire in quick succession
			try {
				this._handleFilterChangeDebounced = MiscUtil.debounce(this.handleFilterChange.bind(this), 50);
				this._filterBox.on(FILTER_BOX_EVNT_VALCHANGE, this._handleFilterChangeDebounced);
			} catch (e) {
			// Fallback to direct binding if debounce or event binding fails
				this._filterBox.on(FILTER_BOX_EVNT_VALCHANGE, this.handleFilterChange.bind(this));
			}

			// Initialize sorting
			const wrpBtnsSort = $modal.find(`#filtertools`)[0];
			if (wrpBtnsSort) {
				SortUtil.initBtnSortHandlers(wrpBtnsSort, this._list);
			}

			// Consolidated handler for list updates: update counts, run fallback if needed, and optional debug logging
			const $outVisibleResults = $modal.find(`.lst__wrp-search-visible`);
			this._list.on("updated", () => {
				try {
					this._updateSelectedCount();
					const $lc = $listContainer;
					const vis = this._list.visibleItems.length;
					const domCount = $lc.find(".lst__Row, .lst__row").length; // allow slightly flexible class naming
					if (vis > 0 && domCount === 0) {
						console.warn(`⚠️ List updated but DOM empty (visible ${vis}). Running fallback.`);
						this._fallbackToDirectDOM($listContainer);
					}
					$outVisibleResults.html(`${this._list.visibleItems.length}/${this._list.items.length}`);
					if (this._isDebug) {
						try {
							const names = (this._list.visibleItems || []).slice(0, 10).map(it => it.name);
							console.log(`📦 List updated: ${this._list.visibleItems.length}/${this._list.items.length} visible. First:`, names);
						} catch (e) { /* ignore debug errors */ }
					}
				} catch (e) {
					console.error(`Error during consolidated updated handler:`, e);
				}
			});

			console.log(`📋 List and Filter system initialized`);
		}

		// Load spell data and initialize the full filtering system
		async pOnLoad () {
			console.log("🎯 Starting spell manager initialization with full filtering...");

			// Load spell data
			const spellData = await DataUtil.spell.loadJSON();
			if (!spellData?.spell?.length) {
				console.error("❌ No spell data loaded");
				return;
			}

			console.log(`📚 Loaded ${spellData.spell.length} spells`);

			// Initialize the primary list with full ListPage functionality
			await this._pOnLoad_pInitPrimaryLists();
			this._pOnLoad_initVisibleItemsDisplay();

			// Add spell data to the list
			this._addData(spellData);

			// Set up character-specific defaults after initialization, but don't filter yet
			if (this._characterData) {
				this._setDefaultFiltersForCharacter();
				this._displaySpellSuggestions();
			}

			// Update selected count
			this._updateSelectedCount();

			// Now apply initial filtering to show all appropriate spells
			setTimeout(() => {
				console.log("🔄 Applying initial filtering...");
				// Apply the filter state determined above instead of forcing all items visible.
				try {
					this.handleFilterChange();
				} catch (e) {
					console.warn("Error applying initial filters:", e);
				}
			}, 100);

			console.log("✅ CharacterSpellManager loaded with full filtering system");
		}

		// Override state loading to avoid null reference errors in modal context
		async _pOnLoad_pLoadListState () {
			console.log("🔄 Loading list state (modal context - simplified)");
			// In modal context, we don't need to load/save complex state
			// Just return without doing anything to avoid null reference errors
			return Promise.resolve();
		}

		// Override other state methods that might cause issues in modal context
		_pOnLoad_pLoadSublistState () {
			console.log("🔄 Loading sublist state (modal context - skipped)");
			return Promise.resolve();
		}

		_pOnLoad_bindListOptions () {
			console.log("🔄 Binding list options (modal context - simplified)");
			// We'll handle our own list options without the complex page binding
		}

		// Add data using proper ListPage processing with full filtering support
		_addData (data) {
			if (!data || !data.spell || !data.spell.length) {
				console.warn("No spell data provided to _addData");
				return;
			}

			console.log(`📚 Processing ${data.spell.length} spells with full filtering...`);

			// Store spell data
			this._dataList = data.spell;

			// Reset seen hashes so we can rebuild the list each time the modal opens
			this._seenHashes = new Set();

			// Clear any previous list items and DOM (handle re-open of modal using same manager)
			if (this._list) {
				try {
					this._list.removeAllItems();
				} catch (e) {
				// ignore
				}
			}
			if (this._$modalInner) {
				const $lc = this._$modalInner.find("#list");
				if ($lc.length) $lc.empty();
			}

			// Process each spell with proper filtering integration
			let addedCount = 0;
			data.spell.forEach((spell, i) => {
				try {
				// Add normalized data for filtering/sorting
					spell._normalisedTime = PageFilterSpells.getNormalisedTime(spell.time);
					spell._normalisedRange = PageFilterSpells.getNormalisedRange(spell.range);
					spell._isConc = spell.duration.some(d => d.concentration);

					const listItem = this.getListItem(spell, i);
					if (listItem) {
						this._list.addItem(listItem);
						addedCount++;
					}
				} catch (error) {
					console.warn(`Failed to process spell ${spell.name}:`, error);
				}
			});

			console.log(`📊 Successfully added ${addedCount} spells to list`);

			// Initialize and update the list so it can perform its search/filter/render
			// If the list was initialized during a previous modal open, force re-init so it rebinds to the new DOM
			if (this._list) this._list._isInit = false;
			this._list.init();
			this._list.update();
			console.log(`🔄 List updated. Items: ${this._list.items.length}, Visible: ${this._list.visibleItems.length}`);

			this._filterBox.render();
			console.log(`🎛️ Filter box rendered`);

			// Check if list items are in the DOM
			const $listContainer = this._$modalInner.find("#list");
			console.log(`📝 List container children: ${$listContainer.children().length}`);
			console.log(`📝 List container HTML length: ${$listContainer.html().length}`);

			// Debug first few list items
			if (this._list.items.length > 0) {
				console.log(`🔍 First list item:`, this._list.items[0]);
				console.log(`🔍 First list item element:`, this._list.items[0].elm);
			}

			// Check if List.js is actually putting items in the DOM
			const actualDomItems = $listContainer.find(".lst__row").length;
			console.log(`📝 Actual DOM items with .lst__row: ${actualDomItems}`);

			// If List.js isn't working, fall back to direct DOM manipulation
			if (this._list.items.length > 0 && actualDomItems === 0) {
				console.log(`⚠️ List.js not rendering items to DOM, falling back to direct manipulation`);
				this._fallbackToDirectDOM($listContainer);
			}

			// Don't filter initially - show all spells first
			console.log(`🎯 Skipping initial filtering to show all spells`);
			// this.handleFilterChange();

			console.log(`✅ Successfully loaded ${addedCount} spells with full filtering system`);
		}

		// Fallback method when List.js doesn't render items properly
		_fallbackToDirectDOM ($listContainer) {
			console.log(`🔄 Using direct DOM manipulation for ${this._list.items.length} spells...`);
			// Clear the container
			$listContainer.empty();
			let appendedCount = 0;
			// Append visibleItems in order so they match List.js sorting
			const visible = this._list.visibleItems || [];
			visible.forEach((item, ix) => {
				const elementToUse = item.ele || item.elm || item._element;
				if (elementToUse) {
				// Ensure we append the actual DOM node (not a jQuery wrapper)
					$listContainer.append(elementToUse);
					appendedCount++;
				} else console.warn(`⚠️ Visible item ${ix} missing DOM element`, item);
			});
			console.log(`✅ Direct DOM manipulation complete: ${appendedCount} visible items added`);
			$listContainer.find(".lst__row").show();
			console.log(`📝 Fallback: Showed ${$listContainer.find(".lst__row").length} DOM items directly`);
		}

		// Create list items matching spells.js pattern with selection functionality
		getListItem (spell, spI) {
		// Generate a simple hash for modal context (avoid UrlUtil.autoEncodeHash which requires page registration)
			const hash = `${UrlUtil.encodeForHash(spell.name)}_${UrlUtil.encodeForHash(spell.source)}`;
			if (this._seenHashes.has(hash)) return null;
			this._seenHashes.add(hash);

			const isExcluded = ExcludeUtil.isExcluded(hash, "spell", spell.source);

			// Let the page filter process this spell for filtering
			this._pageFilter.mutateAndAddToFilters(spell, isExcluded);

			const source = Parser.sourceJsonToAbv(spell.source);
			const time = PageFilterSpells.getTblTimeStr(spell.time[0]);
			const school = Parser.spSchoolAndSubschoolsAbvsShort(spell.school, spell.subschools);
			const concentration = spell._isConc ? "×" : "";
			const range = Parser.spRangeToFull(spell.range, {isDisplaySelfArea: true});

			// Create checkbox for spell selection
			const $checkbox = $(`<input type="checkbox" class="spell-select-cb mr-2">`);
			// Use hash-based matching for preselection
			const itemHash = `${UrlUtil.encodeForHash(spell.name)}_${UrlUtil.encodeForHash(spell.source)}`;
			if (this._existingSpellHashes && this._existingSpellHashes.has(itemHash)) {
				$checkbox.prop("checked", true);
				this._selectedSpells.set(itemHash, spell);
			}

			$checkbox.on("change", (evt) => {
				if ($checkbox.prop("checked")) {
					this._selectedSpells.set(itemHash, spell);
				} else {
					this._selectedSpells.delete(itemHash);
				}
				this._updateSelectedCount();
				evt.stopPropagation();
			});

			// Create the DOM element structure using raw DOM (not jQuery) for List.js compatibility
			const eleLi = document.createElement("div");
			eleLi.className = `lst__row ve-flex-col ${isExcluded ? "lst__row--blocklisted" : ""}`;

			const eleInner = document.createElement("a");
			eleInner.href = `#${hash}`;
			eleInner.className = "lst__row-border lst__row-inner";

			// Add checkbox to the inner element
			eleInner.appendChild($checkbox[0]);

			// Create and append other elements
			const elements = [
				{class: "bold ve-col-2-9 pl-0 pr-1", text: spell.name},
				{class: "ve-col-1-5 px-1 ve-text-center", text: PageFilterSpells.getTblLevelStr(spell)},
				{class: "ve-col-1-7 px-1 ve-text-center", text: time},
				{class: `ve-col-1-2 px-1 sp__school-${spell.school} ve-text-center`,
					text: school,
			 title: Parser.spSchoolAbvToFull(spell.school),
			 style: Parser.spSchoolAbvToStylePart(spell.school)},
				{class: "ve-col-0-6 px-1 ve-text-center", text: concentration, title: "Concentration"},
				{class: "ve-col-2-4 px-1 ve-text-right", text: range},
				{class: `ve-col-1-7 ve-text-center ${Parser.sourceJsonToSourceClassname(spell.source)} pl-1 pr-0`,
			 text: source,
					title: `${Parser.sourceJsonToFull(spell.source)}${Renderer.utils.getSourceSubText(spell)}`},
			];

			elements.forEach(el => {
				const span = document.createElement("span");
				span.className = el.class;
				span.textContent = el.text;
				if (el.title) span.title = el.title;
				if (el.style) span.setAttribute("style", el.style);
				eleInner.appendChild(span);
			});

			eleLi.appendChild(eleInner);

			// Add click handler for the entire row
			eleLi.addEventListener("click", (evt) => {
				if (!evt.target || !(evt.target instanceof Element) || !evt.target.classList.contains("spell-select-cb")) {
					this._renderStats_doBuildStatsTab({ent: spell});
				}
			});

			const listItem = new ListItem(
				spI,
				eleLi, // Raw DOM element for List.js
				spell.name,
				{
					hash,
					source,
					page: spell.page,
					level: spell.level,
					time,
					school: Parser.spSchoolAbvToFull(spell.school),
					concentration,
					normalisedTime: spell._normalisedTime,
					normalisedRange: spell._normalisedRange,
				},
				{
					isExcluded,
					entity: spell,
				},
			);

			return listItem;
		}

		// Set default filter state based on character class/level with full filtering system
		_setDefaultFiltersForCharacter () {
			if (!this._pageFilter || !this._characterData || !this._filterBox) return;

			try {
				console.log("🎯 Setting character-appropriate default filters...");

				// Set up character-appropriate class filters
				const characterClasses = this._characterData.class || [];
				let classesFilterValues = {};
				if (characterClasses.length > 0) {
					const classNames = characterClasses.map(cls => cls.name).filter(Boolean);
					console.log(`🏛️ Character classes: ${classNames.join(", ")}`);
					// Build filter values for the "Classes" filter (select all of the character's classes)
					classesFilterValues = {};
					characterClasses.forEach(cls => {
						try {
							const classSource = cls.source || Parser.SRC_PHB;
							// Use PageFilterSpells helper to construct the display string used in the filter items
							const fi = PageFilterSpells._getClassFilterItem({
								className: cls.name,
								classSource: classSource,
								isVariantClass: false,
								definedInSource: classSource,
							});
							if (fi && fi.item) classesFilterValues[fi.item] = 1;
						} catch (e) {
							console.warn(`Could not map class for filter: ${cls.name}`, e);
						}
					});

				// Apply the classes selection to the filter box along with level below
				}

				// Determine allowed spell levels from the character's spell data (preferred)
				const levelsAllowed = new Set();
				if (this._characterData.spells && this._characterData.spells.levels && Object.keys(this._characterData.spells.levels).length) {
				// Use explicit spell-level entries (these include known spells and maxSlots info)
					Object.keys(this._characterData.spells.levels).forEach(k => {
						const lvl = Number.parseInt(k);
						if (!Number.isNaN(lvl)) levelsAllowed.add(lvl);
					});
					// Always include cantrips (level 0) by default
					levelsAllowed.add(0);
					console.log(`🎚️ Using character.spells.levels keys for allowed spell levels (including cantrips): ${[...levelsAllowed].sort((a, b) => a - b).join(",")}`);
				} else {
				// Fallback: approximate allowed levels from class progression (legacy behaviour)
					const characterLevel = characterClasses.length ? Math.max(...characterClasses.map(cls => cls.level || 1)) : 1;
					// Helper: caster progression
					const fullCasters = new Set(["Bard", "Cleric", "Druid", "Sorcerer", "Wizard", "Warlock"]);
					const halfCasters = new Set(["Paladin", "Ranger"]);
					// Eldritch Knight and Arcane Trickster act as one-third casters
					characterClasses.forEach(cls => {
						const name = cls.name;
						const lvl = cls.level || 1;
						let maxForClass = 0;
						if (fullCasters.has(name)) maxForClass = Math.min(9, Math.floor(lvl));
						else if (halfCasters.has(name)) maxForClass = Math.min(9, Math.floor(lvl / 2));
						else if (name === "Fighter" && cls.subclass?.name === "Eldritch Knight") maxForClass = Math.min(9, Math.floor(lvl / 3));
						else if (name === "Rogue" && cls.subclass?.name === "Arcane Trickster") maxForClass = Math.min(9, Math.floor(lvl / 3));
						else maxForClass = Math.min(9, Math.floor(lvl / 2)); // Conservative default: treat as half-caster
						if (maxForClass < 1) maxForClass = 1; // show at least 1st-level spells for low-level casters
						for (let L = 0; L <= maxForClass; ++L) levelsAllowed.add(L);
					});
					console.log(`🎚️ Fallback character level approximation, per-class allowed max levels: ${[...levelsAllowed].sort((a, b) => a - b).join(",")}`);
				}

				// Build the values object for FilterBox.setFromValues
				const values = {};
				// Level filter: include all allowed levels
				values.Level = {};
				[...levelsAllowed].forEach(l => values.Level[l] = 1);
				// Classes filter: pick the character's classes (if computed above)
				if (typeof classesFilterValues !== "undefined" && Object.keys(classesFilterValues).length) {
				// Apply to both the MultiFilter header and the child Class filter to ensure both recognise the selection
					values.Classes = classesFilterValues;
					values.Class = classesFilterValues;
				}

				// Subclass filter: if the character has subclasses, include those as well
				const subclassFilterValues = {};
				characterClasses.forEach(cls => {
					try {
						const classSource = cls.source || Parser.SRC_PHB;
						// Always include the base class pill for this class
						const baseClassFi = PageFilterSpells._getClassFilterItem({
							className: cls.name,
							classSource: classSource,
							isVariantClass: false,
							definedInSource: classSource,
						});
						if (baseClassFi && baseClassFi.item) subclassFilterValues[baseClassFi.item] = 1;

						const sc = cls.subclass;
						if (sc && (sc.name || sc.shortName)) {
							const subclassSource = sc.source || classSource;
							const subclassShort = sc.shortName || sc.name;
							const subclassName = sc.name || sc.shortName;
							// Base subclass pill (e.g. "Warlock: Genie") — covers shared expanded spells
							const baseSubclassFi = PageFilterSpells._getSubclassFilterItem({
								className: cls.name,
								classSource: classSource,
								subclassShortName: subclassShort,
								subclassName: subclassName,
								subclassSource: subclassSource,
								isVariantClass: false,
								definedInSource: subclassSource,
							});
							if (baseSubclassFi?.item) subclassFilterValues[baseSubclassFi.item] = 1;

							// Also include kind-specific pills (e.g. "Warlock: Genie, Marid")
							if (sc.subSubclass) {
								const kindFi = PageFilterSpells._getSubclassFilterItem({
									className: cls.name,
									classSource: classSource,
									subclassShortName: subclassShort,
									subclassName: subclassName,
									subclassSource: subclassSource,
									subSubclassName: sc.subSubclass,
									isVariantClass: false,
									definedInSource: subclassSource,
								});
								if (kindFi?.item) subclassFilterValues[kindFi.item] = 1;
							}
						}
					} catch (e) {
						console.warn(`Could not map subclass for filter: ${cls.name}`, e);
					}
				});
				if (Object.keys(subclassFilterValues).length) values.Subclass = subclassFilterValues;

				// Debug: log the exact pill keys we will apply for classes and subclass
				try {
					console.log(`🔎 Class pill keys applied:`, Object.keys(values.Classes || {}));
					console.log(`🔎 Subclass pill keys applied:`, Object.keys(values.Subclass || {}));
				} catch (e) { /* ignore logging errors */ }

				if (Object.keys(values).length) {
					console.log(`🔧 Applying filter defaults:`, values);
					// Store the character defaults so we can restore them on Reset
					this._characterFilterValues = values;
					// Apply immediately using a "fast path" directly against the page filter values so the
					// list updates instantly for the user (avoids waiting for FilterBox UI population).
					try {
						const fastValues = this._characterFilterValues;
						this._list.filter(item => {
							if (!item) return false;
							const ent = item.data && item.data.entity ? item.data.entity : (this._dataList && this._dataList[item.ix]);
							if (!ent) return false;
							return this._pageFilter.toDisplay(fastValues, ent);
						});
						console.log("⚡ Fast-path applied character defaults directly to the list");
						this._updateSelectedCount();
					} catch (e) {
						console.warn("Fast-path filter apply failed; will fallback to waiting for FilterBox sync", e);
					}
					// Still render/bind reset and attempt to sync the FilterBox UI when it finishes loading
					try { this._filterBox.render(); } catch (e) { /* ignore if not present */ }
					this._bindResetButtonToCharacterDefaults();
					const applyWhenReady = async () => {
						try { if (this._filterBox && this._filterBox.pDoLoadState) await this._filterBox.pDoLoadState(); } catch (e) { /* ignore */ }
						try {
							this._filterBox.setFromValues(this._characterFilterValues);
							console.log(`🔎 Post-render FilterBox values:`, this._filterBox.getValues());
						} catch (e) {
							console.warn("Failed to set filter values after waiting:", e);
						}
						// Re-run the canonical handler to ensure full internal state sync
						this.handleFilterChange();
					};
					applyWhenReady();
				}

				console.log("✅ Filters configured for character spell selection");
			} catch (error) {
				console.warn("Error setting character filters:", error);
			}
		}
	} // End of CharacterSpellManager class

	return CharacterSpellManager;
}

// Make CharacterSpellManager available globally
window.CharacterSpellManager = null;

// Function to get the CharacterSpellManager class (creates it if needed)
function getCharacterSpellManager () {
	if (!window.CharacterSpellManager) {
		window.CharacterSpellManager = createCharacterSpellManager();
	}
	return window.CharacterSpellManager;
}

// Make the function globally available
window.getCharacterSpellManager = getCharacterSpellManager;

// Try to create it immediately if ListPage is available
if (typeof ListPage !== "undefined") {
	window.CharacterSpellManager = createCharacterSpellManager();
} else {
	// Listen for when ListPage becomes available
	if (typeof window.addEventListener !== "undefined") {
		window.addEventListener("DOMContentLoaded", () => {
			// Check periodically until ListPage is available
			const checkListPage = setInterval(() => {
				if (typeof ListPage !== "undefined" && !window.CharacterSpellManager) {
					window.CharacterSpellManager = createCharacterSpellManager();
					clearInterval(checkListPage);
					console.log("✅ CharacterSpellManager created after ListPage became available");
				}
			}, 100); // Check every 100ms

			// Stop checking after 10 seconds to prevent infinite loop
			setTimeout(() => clearInterval(checkListPage), 10000);
		});
	}
}
