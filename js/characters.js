
import {RenderCharacters} from "./render-characters.js";
// CharacterManager is available globally via character-manager.js script tag

class CharactersSublistManager extends SublistManager {
	static _getRowTemplate () {
		return [
			new SublistCellTemplate({
				name: "Name",
				css: "bold ve-col-5 pl-0 pr-1",
				colStyle: "",
			}),
			new SublistCellTemplate({
				name: "Class",
				css: "ve-col-3-8 px-1 ve-text-center",
				colStyle: "text-center",
			}),
			new SublistCellTemplate({
				name: "Race",
				css: "ve-col-1-2 px-1",
				colStyle: "",
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
			character._fClass || "Unknown",
			character._fRace || "Unknown",
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
				class: character._fClass || "Unknown",
				race: character._fRace || "Unknown",
				level: character._fLevel || 1,
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
			<span class="ve-col-1-7">${character._fRace || "Unknown"}</span>
			<span class="ve-col-4-1">${classText}</span>
			<span class="ve-col-1-7 ">${level}</span>
			<span class="ve-col-1 ${Parser.sourceJsonToSourceClassname(character.source || "")} pr-0" title="${Parser.sourceJsonToFull(character.source || "")}">${source}</span>
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

		// Use centralized character manager to load characters
		try {
			const characters = await CharacterManager.loadCharacters();
			if (characters.length > 0) {
				// Format for 5etools compatibility
				const formattedData = { character: characters };
				this._addData(formattedData);
				console.log(`Loaded ${characters.length} characters via CharacterManager`);
			} else {
				console.log('No characters found - this is normal for a fresh installation');
			}
		} catch (e) {
			console.warn('Failed to load characters via CharacterManager:', e);
		}

		// Set up listener for character updates
		CharacterManager.addListener((characters) => {
			// Update the list when characters change
			if (this._list) {
				const formattedData = { character: characters };
				// Clear existing data and add fresh data
				this._dataList.length = 0;
				this._addData(formattedData);
				this._list.update();
			}

			// Re-render currently displayed character if it was updated
			if (this._currentCharacter) {
				const characterId = CharacterManager._generateCompositeId(this._currentCharacter.name, this._currentCharacter.source);
				const updatedCharacter = characters.find(c => {
					const id = CharacterManager._generateCompositeId(c.name, c.source);
					return id === characterId;
				});

				if (updatedCharacter) {
					// Update the stored reference and re-render
					this._currentCharacter = updatedCharacter;

					// Update global character edit data for consistency
					if (globalThis._CHARACTER_EDIT_DATA) {
						globalThis._CHARACTER_EDIT_DATA[characterId] = updatedCharacter;
					}

					this._renderStats_doBuildStatsTab({ent: updatedCharacter});
				}
			}
		});

		// Start auto-refresh (like the original system)
		CharacterManager.startAutoRefresh();

		// Preload spell data so spell links work in character sheets
		try {
			await DataLoader.pCacheAndGetAllSite(UrlUtil.PG_SPELLS);
		} catch (e) {
			console.warn("Failed to preload spell data for character page:", e);
		}
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
			// Try CharacterManager first for cached character
			const character = CharacterManager.getCharacterById(characterId);
			if (character) {
				return character;
			}

			// If not in cache, fallback to direct API call
			const response = await fetch(`/api/characters/${characterId}`);
			if (response.ok) {
				const character = await response.json();
				this._processCharacterForDisplay(character);
				// Add to CharacterManager cache
				CharacterManager.addOrUpdateCharacter(character);
				return character;
			}
		} catch (e) {
			console.warn(`Failed to load character ${characterId}:`, e.message);
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
			// Check if user has access to the character's source
			this._updateEditButtonVisibility(ent);
		}
	}

	async _updateEditButtonVisibility(character) {
		const $editBtn = $("#btn-edit-character");
		const characterSource = character.source.toLowerCase();

		if (!characterSource || characterSource === 'Unknown' || characterSource === '') {
			// No source specified, hide edit button
			$editBtn.hide();
			return;
		}

		// Check if user has cached password for this source
		const cachedPassword = this._getCachedPassword(characterSource);

		if (cachedPassword) {
			// User has access, show edit button
			$editBtn.show();
			$editBtn.attr('title', `Edit character from source: ${characterSource}`);
		} else {
			// No access, hide edit button
			$editBtn.hide();
		}
	}

	_getCachedPassword(sourceName) {
		try {
			const stored = localStorage.getItem('sourcePasswords');
			const passwords = stored ? JSON.parse(stored) : {};
			return passwords[sourceName] || null;
		} catch (e) {
			console.error('Error loading cached passwords:', e);
			return null;
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
			const character = charactersPage._currentCharacter;
			const characterSource = character.source.toLowerCase();

			// Double-check access before allowing edit
			if (!characterSource || characterSource === 'Unknown' || characterSource === '') {
				alert('This character has no source specified and cannot be edited.');
				return;
			}

			const cachedPassword = charactersPage._getCachedPassword(characterSource);
			if (!cachedPassword) {
				alert(`You need to login to source "${characterSource}" to edit this character. Please visit the Sources page to authenticate.`);
				return;
			}

			// Store character data for editor
			localStorage.setItem('editingCharacter', JSON.stringify(charactersPage._currentCharacter));

			// Navigate to character editor (data already stored in localStorage above)
			window.location.href = 'charactereditor.html?edit=true';
		}
	});
});

globalThis.dbg_page = charactersPage;
