
import {RenderCharacters} from "./render-characters.js";

class CharactersSublistManager extends SublistManager {
	static _getRowTemplate () {
		return [
			new SublistCellTemplate({
				name: "Name",
				css: "bold ve-col-5 pl-0 pr-1",
				colStyle: "",
			}),
			new SublistCellTemplate({
				name: "Race",
				css: "ve-col-3-8 px-1",
				colStyle: "",
			}),
			new SublistCellTemplate({
				name: "Class",
				css: "ve-col-1-2 px-1 ve-text-center",
				colStyle: "text-center",
			}),
			new SublistCellTemplate({
				name: "Level",
				css: "ve-col-2 pl-1 pr-0 ve-text-center",
				colStyle: "text-center",
			}),
		];
	}

	static _getRowCellsHtml ({values, templates = null}) {
		templates = templates || this._getRowTemplate();
		return values
			.map((val, i) => SublistCell.renderHtml({templates, cell: val, ix: i}))
			.join("");
	}

	pGetSublistItem (character, hash) {
		const cellsText = [
			character.name,
			character._fRace || "Unknown",
			character._fClass || "Unknown",
			character._fLevel || 0,
		];

		const $ele = $(`<div class="lst__row lst__row--sublist ve-flex-col">
				<a href="#${UrlUtil.autoEncodeHash(character)}" class="lst__row-border lst__row-inner">
					${CharactersSublistManager._getRowCellsHtml({values: cellsText})}
				</a>
			</div>
		`)
			.contextmenu(evt => this._handleSublistItemContextMenu(evt, listItem))
			.click(evt => this._listSub.doSelect(listItem, evt));

		const listItem = new ListItem(
			hash,
			$ele,
			character.name,
			{
				hash,
				race: character._fRace || "Unknown",
				class: character._fClass || "Unknown",
				level: character._fLevel || 0,
			},
			{
				entity: character,
				mdRow: [...cellsText],
			},
		);
		return listItem;
	}
}

class CharactersPage extends ListPageMultiSource {
	constructor () {
		super({
			pageFilter: new PageFilterCharacters({
				sourceFilterOpts: {
					pFnOnChange: (...args) => this._pLoadSource(...args),
				},
			}),

			dataProps: ["character"],

			propLoader: "character", // Required by ListPageMultiSource, but we override loading

			pFnGetFluff: Renderer.character.pGetFluff.bind(Renderer.character),

			bookViewOptions: {
				namePlural: "characters",
				pageTitle: "Characters Book View",
			},
		});
	}

	// Override the default multi-source loading to use our blob storage instead
	async _pLoadAllSources () {
		// Characters are loaded from blob storage in _pOnLoad_pPreDataLoad
		// No need to load from static files
		return [];
	}

	// Override source loading since all characters come from API
	async _pLoadSource (src, nextFilterVal) {
		// Characters don't use traditional source loading
		// All characters are loaded from API regardless of source
		console.log(`Character source loading skipped for ${src} - using API data`);
		return;
	}

	getListItem (character, chI, isExcluded) {
		this._pageFilter.mutateAndAddToFilters(character, isExcluded);

		const eleLi = document.createElement("div");
		eleLi.className = `lst__row ve-flex-col ${isExcluded ? "lst__row--blocklisted" : ""}`;

		const hash = UrlUtil.autoEncodeHash(character);
		const source = Parser.sourceJsonToAbv(character.source || "");
		const classText = character._fClass || "Unknown";
		const level = character._fLevel || 0;

		eleLi.innerHTML = `<a href="#${hash}" class="lst__row-border lst__row-inner">
			<span class="bold ve-col-4-2 pl-0">${character.name}</span>
			<span class="ve-col-4-1">${character._fRace || "Unknown"}</span>
			<span class="ve-col-1-7 ve-text-center">${classText}</span>
			<span class="ve-col-1-7 ve-text-center">${level}</span>
			<span class="ve-col-1 ve-text-center ${Parser.sourceJsonToSourceClassname(character.source || "")} pr-0" title="${Parser.sourceJsonToFull(character.source || "")}">${source}</span>
		</a>`;

		const listItem = new ListItem(
			chI,
			eleLi,
			character.name,
			{
				hash,
				source,
				race: character._fRace || "Unknown",
				class: classText,
				level: level,
			},
			{
				entity: character,
			},
		);

		eleLi.addEventListener("click", (evt) => this._list.doSelect(listItem, evt));
		eleLi.addEventListener("contextmenu", (evt) => this._openContextMenu(evt, this._list, listItem));

		return listItem;
	}

	async _pOnLoad_pPreDataLoad () {
		// Ensure Example source is loaded for hover/popout functionality
		await this._pLoadSource("Example", "yes");

		// Load character data from Vercel Blob storage
		const databaseLoaded = await this._pLoadCharacterDataFromDatabase();

		if (!databaseLoaded) {
			console.log('No characters found in blob storage - this is normal for a fresh installation');
			// Don't fall back to old file loading - characters now only come from blob storage
		}

		// Preload spell data so spell links work in character sheets
		try {
			await DataLoader.pCacheAndGetAllSite(UrlUtil.PG_SPELLS);
		} catch (e) {
			console.warn("Failed to preload spell data for character page:", e);
		}
	}

	async _pLoadCharacterDataFromDatabase() {
		try {
			console.log('Loading character data from Vercel Blob storage...');

			// Load all characters from the API
			const response = await fetch('/api/characters/load');
			if (!response.ok) {
				throw new Error('Failed to fetch characters from API');
			}

			const characters = await response.json();

			if (characters && characters.length > 0) {
				// Convert to expected 5etools format
				const formattedData = {
					character: characters
				};

				// Process each character to ensure it has the required computed fields
				formattedData.character.forEach(char => this._processCharacterForDisplay(char));

				// Add to data loader cache
				this._addData(formattedData);
				console.log(`Loaded ${formattedData.character.length} characters from blob storage`);

				// Set up periodic refresh
				this._setupDatabaseRefresh();

				return true;
			} else {
				console.warn('No valid characters found in blob storage');
				return false;
			}
		} catch (e) {
			console.warn('Failed to load character data from blob storage:', e.message);
			return false;
		}
	}

	// Set up periodic refresh of character data
	_setupDatabaseRefresh() {
		// Refresh character data every 5 minutes to catch updates
		if (this._refreshInterval) {
			clearInterval(this._refreshInterval);
		}

		this._refreshInterval = setInterval(async () => {
			console.log('Refreshing character data from blob storage...');
			try {
				const refreshed = await this._pLoadCharacterDataFromDatabase();
				if (refreshed) {
					// Re-render the list with fresh data
					if (this._list) {
						this._list.update();
					}
				}
			} catch (e) {
				console.warn('Failed to refresh character data:', e);
			}
		}, 5 * 60 * 1000); // 5 minutes
	}

	_processCharacterForDisplay(character) {
		// Add computed fields that the filters and display expect
		if (character.race) {
			character._fRace = character.race.variant ? `Variant ${character.race.name}` : character.race.name;
		}
		if (character.class && Array.isArray(character.class)) {
			// Create detailed class display with subclasses
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
			character._fLevel = 1;
		}
		if (character.background) {
			character._fBackground = character.background.name;
		}
	}

	async loadCharacterById(characterId) {
		try {
			const response = await fetch(`/api/characters/${characterId}`);
			if (response.ok) {
				const character = await response.json();
				this._processCharacterForDisplay(character);
				return character;
			}
		} catch (e) {
			console.warn(`Failed to load character ${characterId} from database:`, e.message);
		}
		return null;
	}

	_doPreviewExpand ({listItem, dispExpandedOuter, btnToggleExpand, dispExpandedInner}) {
		super._doPreviewExpand({listItem, dispExpandedOuter, btnToggleExpand, dispExpandedInner});
		// Dice rolling is now handled by 5etools built-in system
	}

	_addData (data) {
		super._addData(data);

		// Also populate DataLoader cache for hover/popout functionality
		if (data.character && data.character.length) {
			DataLoader._pCache_addToCache({
				allDataMerged: data,
				propAllowlist: new Set(["character"])
			});
		}
	}

	_renderStats_doBuildStatsTab ({ent}) {
		// Use the hover renderer for character display
		const fn = Renderer.hover.getFnRenderCompact(UrlUtil.PG_CHARACTERS);
		const renderedContent = fn(ent);

		// Clear and populate the existing table directly
		this._$pgContent.empty().html(`
			<tr><th class="ve-tbl-border" colspan="6"></th></tr>
			<tr><td colspan="6">${renderedContent}</td></tr>
			<tr><th class="ve-tbl-border" colspan="6"></th></tr>
		`);

		// Bind listeners for interactive elements
		const fnBind = Renderer.hover.getFnBindListenersCompact(UrlUtil.PG_CHARACTERS);
		if (fnBind) fnBind(ent, this._$pgContent[0]);

		// Show Edit button and store current character
		this._currentCharacter = ent;
		const $editBtn = $("#btn-edit-character");
		if ($editBtn.length) {
			$editBtn.show();
		}
	}

	async _pGetFluff (character) {
		return character.fluff || null;
	}

	async _pPreloadSublistSources (json) {
		if (json.l && json.l.items && json.l.sources) { // if it's an encounter file
			json.items = json.l.items;
			json.sources = json.l.sources;
		}
		const loaded = Object.keys(this._loadedSources)
			.filter(it => this._loadedSources[it].loaded);
		const lowerSources = json.sources?.map(it => it.toLowerCase()) || [];
		const toLoad = Object.keys(this._loadedSources)
			.filter(it => !loaded.includes(it))
			.filter(it => lowerSources.includes(it.toLowerCase()));
		const loadTotal = toLoad.length;
		if (loadTotal) {
			await Promise.all(toLoad.map(src => this._pLoadSource(src, "yes")));
		}
	}

	_getSearchCache (entity) {
		if (!entity._fSearch) {
			entity._fSearch = [
				entity.name,
				entity._fRace,
				entity._fClass,
				entity._fBackground,
				entity.customText || "",
			].join(" ").toLowerCase();
		}
		return entity._fSearch;
	}
}

const charactersPage = new CharactersPage();
charactersPage.sublistManager = new CharactersSublistManager();
window.addEventListener("load", () => {
	charactersPage.pOnLoad();

	// Initialize Edit Character button
	$("#btn-edit-character").click(async () => {
		if (charactersPage._currentCharacter) {
			// Store character data for editor
			localStorage.setItem('editingCharacter', JSON.stringify(charactersPage._currentCharacter));

			// Navigate to character editor (data already stored in localStorage above)
			window.location.href = 'charactereditor.html?edit=true';
		}
	});
});

globalThis.dbg_page = charactersPage;
