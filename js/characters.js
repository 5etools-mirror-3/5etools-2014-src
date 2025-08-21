
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

	pGetSublistItem (character, hash) {
		const cellsText = [
			character.name,
			character._fRace,
			character._fClass,
			character.level,
		];

		const $ele = $(`<div class="lst__row lst__row--sublist ve-flex-col">
				<a href="#${UrlUtil.autoEncodeHash(character)}" class="lst__row-border lst__row-inner">
					${this.constructor._getRowCellsHtml({values: cellsText})}
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
				race: character._fRace,
				class: character._fClass,
				level: character.level,
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

			propLoader: "character",

			pFnGetFluff: Renderer.character.pGetFluff.bind(Renderer.character),

			bookViewOptions: {
				namePlural: "characters",
				pageTitle: "Characters Book View",
			},
		});
	}

	getListItem (character, chI, isExcluded) {
		this._pageFilter.mutateAndAddToFilters(character, isExcluded);

		const eleLi = document.createElement("div");
		eleLi.className = `lst__row ve-flex-col ${isExcluded ? "lst__row--blocklisted" : ""}`;

		const hash = UrlUtil.autoEncodeHash(character);
		const source = Parser.sourceJsonToAbv(character.source || "");
		const classText = character.class ? character.class.map(cls => cls.name).join("/") : "Unknown";

		eleLi.innerHTML = `<a href="#${hash}" class="lst__row-border lst__row-inner">
			<span class="bold ve-col-4-2 pl-0">${character.name}</span>
			<span class="ve-col-4-1">${character._fRace}</span>
			<span class="ve-col-1-7 ve-text-center">${classText}</span>
			<span class="ve-col-1-7 ve-text-center">${character.level}</span>
			<span class="ve-col-1 ve-text-center ${Parser.sourceJsonToSourceClassname(character.source || "")} pr-0" title="${Parser.sourceJsonToFull(character.source || "")}">${source}</span>
		</a>`;

		const listItem = new ListItem(
			chI,
			eleLi,
			character.name,
			{
				hash,
				source,
				race: character._fRace,
				class: classText,
				level: character.level,
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
		
		// Try to load character data from database API first
		const databaseLoaded = await this._pLoadCharacterDataFromDatabase();
		
		// If database loading failed, the normal file loading will proceed
		if (!databaseLoaded) {
			console.log('Database loading failed, proceeding with normal file loading');
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
			
			// First get the list of characters from blob storage
			const listResponse = await fetch('/api/characters/list');
			if (!listResponse.ok) {
				throw new Error('Failed to fetch character list');
			}
			
			const listData = await listResponse.json();
			if (!listData.success) {
				throw new Error(listData.error || 'Failed to get character list');
			}

			// Load each character's data
			const characterDataPromises = listData.characters.map(async (charInfo) => {
				try {
					const loadResponse = await fetch(`/api/characters/load?url=${encodeURIComponent(charInfo.url)}`);
					if (!loadResponse.ok) {
						console.warn(`Failed to load character: ${charInfo.filename}`);
						return null;
					}
					
					const loadData = await loadResponse.json();
					if (loadData.success && loadData.character) {
						// Extract character from the wrapper format
						if (loadData.character.character && Array.isArray(loadData.character.character)) {
							return loadData.character.character[0]; // Return the actual character data
						}
						return loadData.character;
					}
					return null;
				} catch (e) {
					console.warn(`Error loading character ${charInfo.filename}:`, e);
					return null;
				}
			});

			const characterResults = await Promise.all(characterDataPromises);
			const validCharacters = characterResults.filter(char => char);
			
			if (validCharacters.length > 0) {
				// Convert to expected 5etools format
				const formattedData = {
					character: validCharacters
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
			console.log('Falling back to static file loading');
			return false;
		}
	}

	_processCharacterForDisplay(character) {
		// Add computed fields that the filters and display expect
		if (character.race) {
			character._fRace = character.race.variant ? `Variant ${character.race.name}` : character.race.name;
		}
		if (character.class && Array.isArray(character.class)) {
			character._fClass = character.class.map(cls => cls.name).join("/");
		}
		if (character.background) {
			character._fBackground = character.background.name;
		}
	}

	_setupDatabaseRefresh() {
		// Set up periodic refresh of character data from database
		setInterval(async () => {
			try {
				const response = await fetch('/api/characters');
				if (response.ok) {
					const characterData = await response.json();
					const formattedData = {
						character: Array.isArray(characterData) ? characterData : characterData.characters || []
					};
					
					// Process characters
					formattedData.character.forEach(char => this._processCharacterForDisplay(char));
					
					// Update the list if data has changed
					const currentCount = this._dataList?.length || 0;
					if (formattedData.character.length !== currentCount) {
						this._addData(formattedData);
						console.log('Character data refreshed from database');
					}
				}
			} catch (e) {
				console.debug('Database refresh failed (normal if database unavailable):', e.message);
			}
		}, 30000); // Refresh every 30 seconds
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
		// Use the custom character renderer with dice rolling and reordered layout
		let renderedContent;
		if (typeof Renderer.characterCustom?.getCompactRenderedString === 'function') {
			// Use custom character renderer with dice rolling and reordered layout
			renderedContent = Renderer.characterCustom.getCompactRenderedString(ent);
		} else {
			// Fallback to hover renderer
			const fn = Renderer.hover.getFnRenderCompact(UrlUtil.PG_CHARACTERS);
			renderedContent = fn(ent);
		}
		
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

	async _$pGetWrpControls ({$wrpContent}) {
		const out = await super._$pGetWrpControls({$wrpContent});
		const {$wrpPrint} = out;

		// region Markdown
		const pGetAsMarkdown = async () => {
			const toRender = this._bookViewToShow?.length ? this._bookViewToShow : [this._fnGetEntLastLoaded()];
			if (!Array.isArray(toRender)) return RendererMarkdown.character.pGetMarkdownDoc(toRender);
			return toRender.map(character => RendererMarkdown.character.pGetMarkdownDoc(character)).join('\n\n---\n\n');
		};

		const $btnDownloadMarkdown = $(`<button class="ve-btn ve-btn-default ve-btn-sm">Download as Markdown</button>`)
			.click(async () => DataUtil.userDownloadText("characters.md", await pGetAsMarkdown()));

		const $btnCopyMarkdown = $(`<button class="ve-btn ve-btn-default ve-btn-sm px-2" title="Copy Markdown to Clipboard"><span class="glyphicon glyphicon-copy"></span></button>`)
			.click(async () => {
				await MiscUtil.pCopyTextToClipboard(await pGetAsMarkdown());
				JqueryUtil.showCopiedEffect($btnCopyMarkdown);
			});

		const $btnDownloadMarkdownSettings = $(`<button class="ve-btn ve-btn-default ve-btn-sm px-2" title="Markdown Settings"><span class="glyphicon glyphicon-cog"></span></button>`)
			.click(async () => RendererMarkdown.pShowSettingsModal());

		$$`<div class="ve-flex-v-center ve-btn-group ml-2">
			${$btnDownloadMarkdown}
			${$btnCopyMarkdown}
			${$btnDownloadMarkdownSettings}
		</div>`.appendTo($wrpPrint);
		// endregion

		return out;
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
			// Store character data for editor (Vercel serverless approach)
			localStorage.setItem('editingCharacter', JSON.stringify(charactersPage._currentCharacter));
			
			// Optional: Try to get load instructions from API 
			try {
				const response = await fetch(`/api/characters/load?source=${encodeURIComponent(charactersPage._currentCharacter.source || 'custom')}`);
				
				if (response.ok) {
					const result = await response.json();
					console.log('Character load API response:', result);
					// The API provides instructions but doesn't actually return data in Vercel serverless
				}
			} catch (error) {
				console.log('API load failed, using cached data:', error.message);
			}
			
			// Navigate to character editor (data already stored in localStorage above)
			window.location.href = 'charactereditor.html?edit=true';
		}
	});
});

globalThis.dbg_page = charactersPage;
