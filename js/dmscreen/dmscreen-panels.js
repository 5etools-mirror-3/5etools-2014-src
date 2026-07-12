import {
	PANEL_TYP_ADVENTURE_DYNAMIC_MAP,
	PANEL_TYP_COUNTER,
	PANEL_TYP_INITIATIVE_TRACKER, PANEL_TYP_INITIATIVE_TRACKER_CREATURE_VIEWER,
	PANEL_TYP_INITIATIVE_TRACKER_PLAYER_V0,
	PANEL_TYP_INITIATIVE_TRACKER_PLAYER_V1, PANEL_TYP_MONEY_CONVERTER, PANEL_TYP_TEXTBOX, PANEL_TYP_TIME_TRACKER, PANEL_TYP_UNIT_CONVERTER,
	PANEL_TYP_CHARACTERS,

} from "./dmscreen-consts.js";
import {InitiativeTracker} from "./initiativetracker/dmscreen-initiativetracker.js";
import {InitiativeTrackerPlayerV0, InitiativeTrackerPlayerV1} from "./dmscreen-playerinitiativetracker.js";
import {InitiativeTrackerCreatureViewer} from "./dmscreen-initiativetrackercreatureviewer.js";
import {Counter} from "./dmscreen-counter.js";
import {NoteBox} from "./dmscreen-notebox.js";
import {UnitConverter} from "./dmscreen-unitconverter.js";
import {MoneyConverter} from "./dmscreen-moneyconverter.js";
import {TimeTracker} from "./dmscreen-timetracker.js";
import {DmMapper} from "./dmscreen-mapper.js";
import {RenderCharacters} from "../render-characters.js";
// CharacterManager is available globally via character-manager.js script tag

export class PanelContentManagerFactory {
	static _PANEL_TYPES = {};

	static registerPanelType ({panelType, Cls}) {
		this._PANEL_TYPES[panelType] = Cls;
	}

	/* -------------------------------------------- */

	static async pFromSavedState ({board, saved, ixTab, panel}) {
		if (!this._PANEL_TYPES[saved.t]) return undefined;

		const ContentManager = new this._PANEL_TYPES[saved.t]({board, panel});
		await ContentManager.pLoadState({ixTab, saved});

		return true;
	}

	/* -------------------------------------------- */

	static getSaveableContent (
		{
			type,
			toSaveTitle,
			panelApp,
		},
	) {
		if (!this._PANEL_TYPES[type]) return undefined;

		return this._PANEL_TYPES[type]
			.getSaveableContent({
				type,
				toSaveTitle,
				panelApp,
			});
	}
}

/* -------------------------------------------- */

class _PanelContentManager {
	static _PANEL_TYPE = null;
	static _TITLE = null;
	static _IS_STATELESS = false;

	static _register () {
		PanelContentManagerFactory.registerPanelType({panelType: this._PANEL_TYPE, Cls: this});
		return null;
	}

	static getSaveableContent (
		{
			type,
			toSaveTitle,
			panelApp,
		},
	) {
		return {
			t: type,
			r: toSaveTitle,
			s: this._IS_STATELESS
				? {}
				: panelApp.getState(),
		};
	}

	/* -------------------------------------------- */

	constructor (
		{
			board,
			panel,
		},
	) {
		this._board = board;
		this._panel = panel;
	}

	/* -------------------------------------------- */

	/**
	 * @abstract
	 * @return {*}
	 */
	_getPanelApp ({state}) {
		throw new Error("Unimplemented!");
	}

	async pDoPopulate ({state = {}, title = null} = {}) {
		const panelApp = this._getPanelApp({state});

		this._panel.setEleContentTab({
			panelType: this.constructor._PANEL_TYPE,
			contentMeta: state,
			panelApp,
			eleContent: ee`<div class="panel-content-wrapper-inner"></div>`.appends(panelApp.getPanelElement()),
			title: title || this.constructor._TITLE,
			tabCanRename: true,
		});

		this._board.fireBoardEvent({type: "panelPopulate", payload: {type: this.constructor._PANEL_TYPE}});
	}

	_doHandleTabRenamed ({ixTab, saved}) {
		if (saved.r != null) this._panel.tabDatas[ixTab].tabRenamed = true;
	}

	async pLoadState ({ixTab, saved}) {
		await this.pDoPopulate({state: saved.s, title: saved.r});
		this._doHandleTabRenamed({ixTab, saved});
	}
}

export class PanelContentManager_InitiativeTracker extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_INITIATIVE_TRACKER;
	static _TITLE = "Initiative Tracker";

	static _ = this._register();

	_getPanelApp ({state}) {
		return InitiativeTracker.getPanelApp({board: this._board, savedState: state});
	}
}

export class PanelContentManager_InitiativeTrackerCreatureViewer extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_INITIATIVE_TRACKER_CREATURE_VIEWER;
	static _TITLE = "Creature Viewer";
	static _IS_STATELESS = true;

	static _ = this._register();

	_getPanelApp ({state}) {
		return InitiativeTrackerCreatureViewer.getPanelApp({board: this._board, savedState: state});
	}
}

export class PanelContentManager_InitiativeTrackerPlayerViewV1 extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_INITIATIVE_TRACKER_PLAYER_V1;
	static _TITLE = "Initiative Tracker";
	static _IS_STATELESS = true;

	static _ = this._register();

	_getPanelApp ({state}) {
		return InitiativeTrackerPlayerV1.getPanelApp({board: this._board, savedState: state});
	}
}

export class PanelContentManager_InitiativeTrackerPlayerViewV0 extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_INITIATIVE_TRACKER_PLAYER_V0;
	static _TITLE = "Initiative Tracker";
	static _IS_STATELESS = true;

	static _ = this._register();

	_getPanelApp ({state}) {
		return InitiativeTrackerPlayerV0.getPanelApp({board: this._board, savedState: state});
	}
}

export class PanelContentManager_Counter extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_COUNTER;
	static _TITLE = "Counter";

	static _ = this._register();

	_getPanelApp ({state}) {
		return Counter.getPanelApp({board: this._board, savedState: state});
	}
}

export class PanelContentManager_NoteBox extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_TEXTBOX;
	static _TITLE = "Notes";

	static _ = this._register();

	_getPanelApp ({state}) {
		return NoteBox.getPanelApp({board: this._board, savedState: state});
	}
}

export class PanelContentManager_UnitConverter extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_UNIT_CONVERTER;
	static _TITLE = "Unit Converter";

	static _ = this._register();

	_getPanelApp ({state}) {
		return UnitConverter.getPanelApp({board: this._board, savedState: state});
	}
}

export class PanelContentManager_MoneyConverter extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_MONEY_CONVERTER;
	static _TITLE = "Coin Converter";

	static _ = this._register();

	_getPanelApp ({state}) {
		return MoneyConverter.getPanelApp({board: this._board, savedState: state});
	}
}

export class PanelContentManager_TimeTracker extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_TIME_TRACKER;
	static _TITLE = "Time Tracker";

	static _ = this._register();

	_getPanelApp ({state}) {
		return TimeTracker.getPanelApp({board: this._board, savedState: state});
	}
}

export class PanelContentManager_DynamicMap extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_ADVENTURE_DYNAMIC_MAP;
	static _TITLE = "Map Viewer";

	static _ = this._register();

	_getPanelApp ({state}) {
		return DmMapper.getPanelApp({board: this._board, savedState: state});
	}
}

export class PanelContentManager_Characters extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_CHARACTERS;
	static _TITLE = "Characters";
	static _IS_STATELESS = false;

	static _ = this._register();

	_$getPanelElement ({state}) {
		const $container = $(`<div class="ve-flex-col h-100 min-h-0"></div>`);

		// Add character selection controls
		const $controls = $(`
			<div class="p-2 ve-flex-v-center">
				<label class="mr-2">Character:</label>
				<select class="form-control input-xs" title="Select Character">
					<option value="">Select a character...</option>
				</select>
				<button class="btn btn-xs btn-default ml-2" title="Refresh Characters">
					<span class="glyphicon glyphicon-refresh"></span>
				</button>
			</div>
		`);

		const $content = $(`<div class="ve-flex-col min-h-0 h-100 overflow-y-auto"></div>`);

		$container.append($controls).append($content);

		const $selCharacter = $controls.find("select");
		const $btnRefresh = $controls.find("button");

		// Load available characters using summaries (faster for dropdown)
		const loadCharacters = async () => {
			try {
				const summaries = await CharacterManager.loadCharacterSummaries();
				$selCharacter.empty().append(`<option value="">Select a character...</option>`);
				summaries.forEach(summary => {
					$selCharacter.append(`<option value="${summary.id}" data-name="${summary.name}">${summary.name}</option>`);
				});
			} catch (error) {
				console.warn("Failed to load character summaries for DM screen:", error);
			}
		};

		// Add CharacterManager listener to re-render character when updated
		let currentCharacterId = null;
		const characterUpdateListener = (characters) => {
			console.log(`DM Screen Character Panel: Received character update, currentCharacterId: ${currentCharacterId}`);
			console.log(`DM Screen Character Panel: Received ${characters.length} characters:`, characters.map(c => ({name: c.name, source: c.source, id: CharacterManager._generateCompositeId(c.name, c.source)})));

			if (currentCharacterId) {
				const updatedCharacter = characters.find(c => {
					const id = CharacterManager._generateCompositeId(c.name, c.source);
					console.log(`DM Screen Character Panel: Checking character ${c.name} with ID ${id} against current ${currentCharacterId}`);
					return id === currentCharacterId;
				});

				if (updatedCharacter) {
					console.log(`DM Screen Character Panel: Re-rendering character ${updatedCharacter.name}`);
					// Re-register the updated character
					globalThis._CHARACTER_EDIT_DATA[currentCharacterId] = updatedCharacter;

					// Re-render the character
					const renderedHtml = Renderer.character.getCompactRenderedString(updatedCharacter, {isStatic: false});
					const $rendered = $(renderedHtml);
					$content.empty().append($rendered);
					Renderer.character._bindCharacterSheetListeners($content[0]);
				} else {
					console.log(`DM Screen Character Panel: No matching character found for ID ${currentCharacterId}`);
					console.log(`DM Screen Character Panel: Available character IDs:`, characters.map(c => CharacterManager._generateCompositeId(c.name, c.source)));
				}
			} else {
				console.log(`DM Screen Character Panel: No current character ID set, skipping update`);
			}
		};

		CharacterManager.addListener(characterUpdateListener);

		// Handle character selection with lazy loading
		$selCharacter.on("change", async () => {
			const characterId = $selCharacter.val();
			if (!characterId) {
				$content.empty();
				currentCharacterId = null;
				return;
			}

			// Show loading state
			$content.html(`<div class="p-2 ve-text-center">
				<i class="fas fa-spinner fa-spin"></i> Loading character...
			</div>`);

			currentCharacterId = characterId;

			try {
				// Use lazy loading to get the full character
				const character = await CharacterManager.ensureFullCharacter(characterId);
				if (character) {
					console.log(`DM Screen Character Panel: Loaded full character ${character.name}, ID: ${characterId}`);

					// Register character for editing in global registry
					if (!globalThis._CHARACTER_EDIT_DATA) globalThis._CHARACTER_EDIT_DATA = {};
					globalThis._CHARACTER_EDIT_DATA[characterId] = character;

					// Use RenderCharacters to render the character in non-static mode
					const renderedHtml = Renderer.character.getCompactRenderedString(character, {isStatic: false});
					const $rendered = $(renderedHtml);
					$content.empty().append($rendered);

					// Bind character sheet listeners for quick edit functionality
					Renderer.character._bindCharacterSheetListeners($content[0]);
				} else {
					$content.html(`<div class="p-2 text-danger">
						<i class="fas fa-exclamation-triangle"></i> Character not found or failed to load
						${!navigator.onLine ? " (you are offline)" : ""}
					</div>`);
				}
			} catch (error) {
				console.warn("Failed to load character:", error);
				$content.html(`<div class="p-2 text-danger">
					<i class="fas fa-exclamation-triangle"></i> Error: ${error.message || "Failed to load character"}
				</div>`);
				currentCharacterId = null;
			}
		});

		$btnRefresh.on("click", loadCharacters);

		// Clean up listener when panel is destroyed (if possible)
		if ($container.data) {
			const originalData = $container.data.bind($container);
			$container.data = function (key, value) {
				if (key === "cleanup" && typeof value === "function") {
					const originalCleanup = value;
					return originalData(key, () => {
						CharacterManager.removeListener(characterUpdateListener);
						originalCleanup();
					});
				}
				return originalData(key, value);
			};
		}

		// Initial load
		loadCharacters();

		// State management
		$container.data("getState", () => ({
			selectedCharacter: $selCharacter.val(),
		}));

		// Restore state if provided
		if (state.selectedCharacter) {
			setTimeout(() => {
				$selCharacter.val(state.selectedCharacter).trigger("change");
			}, 100);
		}

		return $container;
	}
}
