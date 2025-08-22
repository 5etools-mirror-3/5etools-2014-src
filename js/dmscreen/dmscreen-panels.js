import {
	PANEL_TYP_INITIATIVE_TRACKER, PANEL_TYP_INITIATIVE_TRACKER_CREATURE_VIEWER,
	PANEL_TYP_INITIATIVE_TRACKER_PLAYER_V0,
	PANEL_TYP_INITIATIVE_TRACKER_PLAYER_V1,
	PANEL_TYP_CHARACTERS,
} from "./dmscreen-consts.js";
import {InitiativeTracker} from "./initiativetracker/dmscreen-initiativetracker.js";
import {InitiativeTrackerPlayerV0, InitiativeTrackerPlayerV1} from "./dmscreen-playerinitiativetracker.js";
import {InitiativeTrackerCreatureViewer} from "./dmscreen-initiativetrackercreatureviewer.js";

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
		
		// Load available characters
		const loadCharacters = async () => {
			try {
				const response = await fetch('/api/characters/load');
				if (response.ok) {
					const characters = await response.json();
					$selCharacter.empty().append(`<option value="">Select a character...</option>`);
					characters.forEach(char => {
						$selCharacter.append(`<option value="${char.name}">${char.name}</option>`);
					});
				}
			} catch (error) {
				console.warn('Failed to load characters:', error);
			}
		};
		
		// Handle character selection
		$selCharacter.on("change", async () => {
			const characterName = $selCharacter.val();
			if (!characterName) {
				$content.empty();
				return;
			}
			
			try {
				const response = await fetch('/api/characters/load');
				if (response.ok) {
					const characters = await response.json();
					const character = characters.find(c => c.name === characterName);
					if (character) {
						// Import character rendering functions
						if (typeof RenderCharacters !== 'undefined') {
							const $rendered = RenderCharacters.$getRenderedCharacter(character);
							$content.empty().append($rendered);
						} else {
							// Fallback simple rendering
							const classInfo = character.class?.map(c => `${c.name} ${c.level}`).join(", ") || "Unknown";
							$content.html(`
								<div class="p-2">
									<h4>${character.name}</h4>
									<p><strong>Level:</strong> ${classInfo}</p>
									<p><strong>Race:</strong> ${character.race?.name || "Unknown"}</p>
									<p><strong>Background:</strong> ${character.background?.name || "Unknown"}</p>
								</div>
							`);
						}
					}
				}
			} catch (error) {
				console.warn('Failed to load character:', error);
				$content.html(`<div class="p-2 text-danger">Failed to load character</div>`);
			}
		});
		
		$btnRefresh.on("click", loadCharacters);
		
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
