import {RenderCharacters} from "./render-characters.js";

class CharactersSublistManager extends SublistManager {
	static _getRowTemplate () {
		return [
			new SublistCellTemplate({
				name: "Name",
				css: "bold ve-col-6 pl-0 pr-1",
				colStyle: "",
			}),
			new SublistCellTemplate({
				name: "Race",
				css: "ve-col-3 px-1",
				colStyle: "",
			}),
			new SublistCellTemplate({
				name: "Level",
				css: "ve-text-center ve-col-1-5 px-1",
				colStyle: "text-center",
			}),
			new SublistCellTemplate({
				name: "Source",
				css: "ve-text-center ve-col-1-5 pl-1 pr-0",
				colStyle: "text-center",
			}),
		];
	}

	pGetSublistItem (character, hash) {
		const cellsText = [
			character.name,
			character._fRace,
			character.level,
			Parser.sourceJsonToAbv(character.source),
		];

		const $ele = $(`<div class="lst__row lst__row--sublist ve-flex-col">
			<a href="#${hash}" class="lst__row-border lst__row-inner">
				${this.constructor._getRowCellsHtml({values: cellsText, templates: this.constructor._ROW_TEMPLATE})}
			</a>
		</div>`)
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

class CharactersPage extends ListPage {
	constructor () {
		const pageFilter = new PageFilterCharacters();
		super({
			dataSource: DataUtil.character.loadJSON.bind(DataUtil.character),
			prereleaseDataSource: DataUtil.character.loadPrerelease.bind(DataUtil.character),
			brewDataSource: DataUtil.character.loadBrew.bind(DataUtil.character),

			pageFilter,

			dataProps: ["character"],

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

	_renderStats_doBuildStatsTab ({ent}) {
		this._$pgContent.empty().append(new RenderCharacters().$getRenderedCharacter(ent));
	}

	async _pGetFluff (character) {
		return character.fluff || null;
	}

	_getSearchCache (entity) {
		// Return the search cache created by the filter's mutateForFilters method
		return entity._fSearch || "";
	}

	// Add compact reference data support for DM screen integration
	static getCompactReferenceData (character) {
		const raceText = character.race ? 
			(character.race.variant ? `Variant ${character.race.name}` : character.race.name) : 
			"Unknown Race";
		
		const classText = character.class ? 
			character.class.map(cls => {
				let text = `${cls.name} ${cls.level}`;
				if (cls.subclass) text += ` (${cls.subclass.name})`;
				return text;
			}).join(", ") : 
			"Unknown Class";

		return {
			name: character.name,
			source: character.source,
			hash: UrlUtil.autoEncodeHash(character),
			level: character.level,
			race: raceText,
			class: classText,
			page: UrlUtil.PG_CHARACTERS,
		};
	}
}

const charactersPage = new CharactersPage();
charactersPage.sublistManager = new CharactersSublistManager();
window.addEventListener("load", () => charactersPage.pOnLoad());

globalThis.dbg_page = charactersPage;