import {
	PANEL_TYP_INITIATIVE_TRACKER, PANEL_TYP_INITIATIVE_TRACKER_CREATURE_VIEWER,
	PANEL_TYP_INITIATIVE_TRACKER_PLAYER_V0,
	PANEL_TYP_INITIATIVE_TRACKER_PLAYER_V1,
	PANEL_TYP_CHARACTERS,
} from "./dmscreen-consts.js";
import {InitiativeTracker} from "./initiativetracker/dmscreen-initiativetracker.js";
import {InitiativeTrackerPlayerV0, InitiativeTrackerPlayerV1} from "./dmscreen-playerinitiativetracker.js";
import {InitiativeTrackerCreatureViewer} from "./dmscreen-initiativetrackercreatureviewer.js";
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
			$content,
		},
	) {
		if (!this._PANEL_TYPES[type]) return undefined;

		return this._PANEL_TYPES[type]
			.getSaveableContent({
				type,
				toSaveTitle,
				$content,
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
			$content,
		},
	) {
		return {
			t: type,
			r: toSaveTitle,
			s: this._IS_STATELESS
				? {}
				: $($content.children()[0]).data("getState")(),
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
	 * @return {jQuery}
	 */
	_$getPanelElement ({state}) {
		throw new Error("Unimplemented!");
	}

	async pDoPopulate ({state = {}, title = null} = {}) {
		this._panel.set$ContentTab(
			this.constructor._PANEL_TYPE,
			state,
			$(`<div class="panel-content-wrapper-inner"></div>`).append(this._$getPanelElement({state})),
			title || this.constructor._TITLE,
			true,
		);

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

	_$getPanelElement ({state}) {
		return InitiativeTracker.$getPanelElement(this._board, state);
	}
}

export class PanelContentManager_InitiativeTrackerCreatureViewer extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_INITIATIVE_TRACKER_CREATURE_VIEWER;
	static _TITLE = "Creature Viewer";
	static _IS_STATELESS = true;

	static _ = this._register();

	_$getPanelElement ({state}) {
		return InitiativeTrackerCreatureViewer.$getPanelElement(this._board, state);
	}
}

export class PanelContentManager_InitiativeTrackerPlayerViewV1 extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_INITIATIVE_TRACKER_PLAYER_V1;
	static _TITLE = "Initiative Tracker";
	static _IS_STATELESS = true;

	static _ = this._register();

	_$getPanelElement ({state}) {
		return InitiativeTrackerPlayerV1.$getPanelElement(this._board, state);
	}
}

export class PanelContentManager_InitiativeTrackerPlayerViewV0 extends _PanelContentManager {
	static _PANEL_TYPE = PANEL_TYP_INITIATIVE_TRACKER_PLAYER_V0;
	static _TITLE = "Initiative Tracker";
	static _IS_STATELESS = true;

	static _ = this._register();

	_$getPanelElement ({state}) {
		return InitiativeTrackerPlayerV0.$getPanelElement(this._board, state);
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
		
		// Load available characters using centralized manager
		const loadCharacters = async () => {
			try {
				const characters = await CharacterManager.loadCharacters();
				$selCharacter.empty().append(`<option value="">Select a character...</option>`);
				characters.forEach(char => {
					$selCharacter.append(`<option value="${char.name}">${char.name}</option>`);
				});
			} catch (error) {
				console.warn('Failed to load characters via CharacterManager:', error);
			}
		};
		
		// Add CharacterManager listener to re-render character when updated
		let currentCharacterId = null;
		const characterUpdateListener = (characters) => {
			if (currentCharacterId) {
				const updatedCharacter = characters.find(c => {
					const id = CharacterManager._generateCompositeId(c.name, c.source);
					return id === currentCharacterId;
				});
				
				if (updatedCharacter) {
					// Re-register the updated character
					globalThis._CHARACTER_EDIT_DATA[currentCharacterId] = updatedCharacter;
					
					// Re-render the character
					const renderedHtml = Renderer.character.getCompactRenderedString(updatedCharacter, {isStatic: false});
					const $rendered = $(renderedHtml);
					$content.empty().append($rendered);
					Renderer.character._bindCharacterSheetListeners($content[0]);
				}
			}
		};
		
		CharacterManager.addListener(characterUpdateListener);

		// Handle character selection
		$selCharacter.on("change", async () => {
			const characterName = $selCharacter.val();
			if (!characterName) {
				$content.empty();
				currentCharacterId = null;
				return;
			}
			
			try {
				// Use centralized character manager
				const characters = await CharacterManager.loadCharacters();
				const character = characters.find(c => c.name === characterName);
				if (character) {
					// Characters from CharacterManager are already processed with computed fields
					// Register character for editing in global registry
					const characterId = CharacterManager._generateCompositeId(character.name, character.source);
					currentCharacterId = characterId;
					if (!globalThis._CHARACTER_EDIT_DATA) globalThis._CHARACTER_EDIT_DATA = {};
					globalThis._CHARACTER_EDIT_DATA[characterId] = character;
					
					// Use RenderCharacters to render the character in non-static mode
					const renderedHtml = Renderer.character.getCompactRenderedString(character, {isStatic: false});
					const $rendered = $(renderedHtml);
					$content.empty().append($rendered);
					
					// Bind character sheet listeners for quick edit functionality
					Renderer.character._bindCharacterSheetListeners($content[0]);
				}
			} catch (error) {
				console.warn('Failed to load character:', error);
				$content.html(`<div class="p-2 text-danger">Failed to load character</div>`);
				currentCharacterId = null;
			}
		});
		
		$btnRefresh.on("click", loadCharacters);
		
		// Clean up listener when panel is destroyed (if possible)
		if ($container.data) {
			const originalData = $container.data.bind($container);
			$container.data = function(key, value) {
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
			selectedCharacter: $selCharacter.val()
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
