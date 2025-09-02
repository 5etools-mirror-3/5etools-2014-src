import {OmnisearchState} from "./omnisearch-state.js";
import {VetoolsConfig} from "../utils-config/utils-config-config.js";
import {SyntaxMetaCategories, SyntaxMetaGroup, SyntaxMetaPageRange, SyntaxMetaSource} from "./omnisearch-models.js";
// CharacterManager is available globally via character-manager.js script tag

"use strict";

const inCategoryAliasShort = {
	"Spell": "S",
	"Item": "I",
	"Class": "C",
	"Creature": "B",
	"Background": "K",
	"Race": "R",
	"Other Reward": "O",
	"Feat": "F",
	"Psionic": "P",
	"Adventure": "A",
	"Deity": "D",
	"Object": "J",
	"Condition": "N",
	"Disease": "N",
	"Optional Feature": "T",
	"Vehicle": "V",
	"Action": "U",
	"Language": "L",
	"Cult": "G",
	"Boon": "G",
	"Book": "M",
	"Table": "E",
	"Variant Rule": "W",
	"Hazard": "H",
	"Trap": "H",
	"Quickref": "Q",
	"Recipe": "Y",
	"Deck": "Z",
};

export class OmnisearchBacking {
	static _CATEGORY_COUNTS = {};

	static _searchIndex = null;
	static _adventureBookLookup = null; // A map of `<sourceLower>: (adventureCatId|bookCatId)`
	static _pLoadSearch = null;

	static async _pInit () {
		this._pLoadSearch ||= this._pDoSearchLoad();
		await this._pLoadSearch;
	}

	static async _pDoSearchLoad () {
		elasticlunr.clearStopWords();
		this._searchIndex = elasticlunr(function () {
			this.addField("n");
			this.addField("cf");
			this.addField("s");
			this.setRef("id");
		});
		SearchUtil.removeStemmer(this._searchIndex);

		const siteIndex = Omnidexer.decompressIndex(await DataUtil.loadJSON(`${Renderer.get().baseUrl}search/index.json`));
		siteIndex.forEach(it => this._addToIndex(it));

		const prereleaseIndex = await PrereleaseUtil.pGetSearchIndex({id: this._maxId + 1});
		prereleaseIndex.forEach(it => this._addToIndex(it));

		const brewIndex = await BrewUtil2.pGetSearchIndex({id: this._maxId + 1});
		brewIndex.forEach(it => this._addToIndex(it));

		// Load dynamic character data from API
		await this._pLoadCharacterIndex();

		// region Partnered homebrew
		//   Note that we filter out anything which is already in the user's homebrew, to avoid double-indexing
		const sourcesBrew = new Set(
			BrewUtil2.getSources()
				.map(src => src.json),
		);

		const partneredIndexRaw = Omnidexer.decompressIndex(await DataUtil.loadJSON(`${Renderer.get().baseUrl}search/index-partnered.json`));
		const partneredIndex = partneredIndexRaw
			.filter(it => !sourcesBrew.has(it.s));
		// Re-ID, to:
		//   - override the base partnered index IDs (which has statically-generated IDs starting at 0)
		//   - avoid any holes
		partneredIndex
			.forEach((it, i) => it.id = this._maxId + 1 + i);
		partneredIndex.forEach(it => this._addToIndex(it));
		// endregion

		this._adventureBookLookup = {};
		[prereleaseIndex, brewIndex, siteIndex, partneredIndex].forEach(index => {
			index.forEach(it => {
				if (it.c === Parser.CAT_ID_ADVENTURE || it.c === Parser.CAT_ID_BOOK) this._adventureBookLookup[it.s.toLowerCase()] = it.c;
			});
		});

		this._initReInCategory();
	}

	static async _pLoadCharacterIndex () {
		try {
			// Use centralized character manager to avoid duplication
			const characters = await CharacterManager.loadCharacters();
			
			if (characters.length === 0) {
				console.log('No characters found for search indexing');
				return;
			}
			
			// Characters are already processed and cached by CharacterManager
			console.log(`Loaded ${characters.length} characters for search indexing via CharacterManager`);

			// Convert characters to search index format
			const characterIndex = characters.map((character, i) => ({
				id: this._maxId + 1 + i,
				c: Parser.CAT_ID_CHARACTER,
				n: character.name,
				s: character.source || "Unknown",
				u: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_CHARACTERS](character),
				p: character.page || 0,
				h: 1, // Enable hover
			}));

			characterIndex.forEach(it => this._addToIndex(it));
			console.log(`Added ${characterIndex.length} characters to search index`);
		} catch (error) {
			console.warn('Error loading characters for search:', error);
		}
	}

	static _maxId = null;

	static _addToIndex (d) {
		this._maxId = d.id;
		d.cf = Parser.pageCategoryToFull(d.c);
		if (!this._CATEGORY_COUNTS[d.cf]) this._CATEGORY_COUNTS[d.cf] = 1;
		else this._CATEGORY_COUNTS[d.cf]++;
		this._searchIndex.addDoc(d);
	}

	static _IN_CATEGORY_ALIAS = null;
	static _IN_CATEGORY_ALIAS_SHORT = null;
	static _RE_SYNTAX__IN_CATEGORY = null;
	static _initializationFailed = false;

	static _initReInCategory () {
		if (this._RE_SYNTAX__IN_CATEGORY) return;

		// If initialization previously failed, don't spam console warnings
		if (this._initializationFailed) return;

		// Safety check to ensure Parser is fully loaded
		if (!Parser || !Parser.pageCategoryToFull || !Parser.CAT_ID_GROUPS) {
			console.warn("Parser not fully loaded, deferring omnisearch initialization");
			this._initializationFailed = true;
			return;
		}
		
		// Additional safety check for required constants
		const requiredConstants = [
			'CAT_ID_CREATURE', 'CAT_ID_CHARACTER', 'CAT_ID_QUICKREF', 'CAT_ID_RACE', 
			'CAT_ID_OTHER_REWARD', 'CAT_ID_CLASS_FEATURE', 'CAT_ID_SUBCLASS_FEATURE',
			'CAT_ID_LEGENDARY_GROUP', 'CAT_ID_CHAR_CREATION_OPTIONS', 'CAT_ID_ITEM_MASTERY',
			'CAT_ID_SPELL', 'CAT_ID_BACKGROUND', 'CAT_ID_ITEM', 'CAT_ID_TABLE', 'CAT_ID_BOOK',
			'CAT_ID_ADVENTURE', 'CAT_ID_FEAT', 'CAT_ID_CONDITION', 'CAT_ID_VEHICLE', 
			'CAT_ID_OBJECT', 'CAT_ID_DEITY', 'CAT_ID_RECIPES'
		];
		
		for (const constant of requiredConstants) {
			if (Parser[constant] === undefined || Parser[constant] === null) {
				console.warn(`Parser constant ${constant} not available, deferring omnisearch initialization`);
				this._initializationFailed = true;
				return;
			}
		}
		
		// Reset the failure flag since we got this far
		this._initializationFailed = false;

		const inCategoryAlias = {};
		
		// Safely add basic entries with null checks
		if (Parser.CAT_ID_CREATURE) {
			inCategoryAlias["creature"] = [Parser.pageCategoryToFull(Parser.CAT_ID_CREATURE)];
			inCategoryAlias["monster"] = [Parser.pageCategoryToFull(Parser.CAT_ID_CREATURE)];
		}
		if (Parser.CAT_ID_CHARACTER) {
			inCategoryAlias["character"] = [Parser.pageCategoryToFull(Parser.CAT_ID_CHARACTER)];
		}

		// Safely add Renderer tag entries if they exist
		try {
			if (Renderer && Renderer.tag) {
				if (Renderer.tag.TagQuickref) inCategoryAlias[new Renderer.tag.TagQuickref().tagName] = [Parser.pageCategoryToFull(Parser.CAT_ID_QUICKREF)];
				if (Renderer.tag.TagRace) inCategoryAlias[new Renderer.tag.TagRace().tagName] = [Parser.pageCategoryToFull(Parser.CAT_ID_RACE)];
				if (Renderer.tag.TagReward) inCategoryAlias[new Renderer.tag.TagReward().tagName] = [Parser.pageCategoryToFull(Parser.CAT_ID_OTHER_REWARD)];
				if (Renderer.tag.TagOptfeature && Parser.CAT_ID_GROUPS["optionalfeature"]) {
					inCategoryAlias[new Renderer.tag.TagOptfeature().tagName] = Parser.CAT_ID_GROUPS["optionalfeature"].map(catId => Parser.pageCategoryToFull(catId));
				}
				if (Renderer.tag.TagClassFeature) inCategoryAlias[new Renderer.tag.TagClassFeature().tagName] = [Parser.pageCategoryToFull(Parser.CAT_ID_CLASS_FEATURE)];
				if (Renderer.tag.TagSubclassFeature) inCategoryAlias[new Renderer.tag.TagSubclassFeature().tagName] = [Parser.pageCategoryToFull(Parser.CAT_ID_SUBCLASS_FEATURE)];
				if (Renderer.tag.TagVehupgrade && Parser.CAT_ID_GROUPS["vehicleUpgrade"]) {
					inCategoryAlias[new Renderer.tag.TagVehupgrade().tagName] = Parser.CAT_ID_GROUPS["vehicleUpgrade"].map(catId => Parser.pageCategoryToFull(catId));
				}
				if (Renderer.tag.TagLegroup) inCategoryAlias[new Renderer.tag.TagLegroup().tagName] = [Parser.pageCategoryToFull(Parser.CAT_ID_LEGENDARY_GROUP)];
				if (Renderer.tag.TagCharoption) inCategoryAlias[new Renderer.tag.TagCharoption().tagName] = [Parser.pageCategoryToFull(Parser.CAT_ID_CHAR_CREATION_OPTIONS)];
				if (Renderer.tag.TagItemMastery) inCategoryAlias[new Renderer.tag.TagItemMastery().tagName] = [Parser.pageCategoryToFull(Parser.CAT_ID_ITEM_MASTERY)];
			}
		} catch (e) {
			console.warn("Error initializing some Renderer tag entries:", e);
		}

		inCategoryAlias["optionalfeature"] = inCategoryAlias["optfeature"];
		inCategoryAlias["mastery"] = inCategoryAlias["itemMastery"];

		const inCategoryAliasShort = {};
		
		// Safely add short aliases with null checks
		if (Parser.CAT_ID_SPELL) inCategoryAliasShort["sp"] = [Parser.pageCategoryToFull(Parser.CAT_ID_SPELL)];
		if (Parser.CAT_ID_BACKGROUND) inCategoryAliasShort["bg"] = [Parser.pageCategoryToFull(Parser.CAT_ID_BACKGROUND)];
		if (Parser.CAT_ID_ITEM) inCategoryAliasShort["itm"] = [Parser.pageCategoryToFull(Parser.CAT_ID_ITEM)];
		if (Parser.CAT_ID_TABLE) inCategoryAliasShort["tbl"] = [Parser.pageCategoryToFull(Parser.CAT_ID_TABLE)];
		if (Parser.CAT_ID_BOOK) inCategoryAliasShort["bk"] = [Parser.pageCategoryToFull(Parser.CAT_ID_BOOK)];
		if (Parser.CAT_ID_ADVENTURE) inCategoryAliasShort["adv"] = [Parser.pageCategoryToFull(Parser.CAT_ID_ADVENTURE)];
		if (Parser.CAT_ID_FEAT) inCategoryAliasShort["ft"] = [Parser.pageCategoryToFull(Parser.CAT_ID_FEAT)];
		if (Parser.CAT_ID_CONDITION) inCategoryAliasShort["con"] = [Parser.pageCategoryToFull(Parser.CAT_ID_CONDITION)];
		if (Parser.CAT_ID_VEHICLE) inCategoryAliasShort["veh"] = [Parser.pageCategoryToFull(Parser.CAT_ID_VEHICLE)];
		if (Parser.CAT_ID_OBJECT) inCategoryAliasShort["obj"] = [Parser.pageCategoryToFull(Parser.CAT_ID_OBJECT)];
		if (Parser.CAT_ID_DEITY) inCategoryAliasShort["god"] = [Parser.pageCategoryToFull(Parser.CAT_ID_DEITY)];
		if (Parser.CAT_ID_RECIPES) inCategoryAliasShort["rcp"] = [Parser.pageCategoryToFull(Parser.CAT_ID_RECIPES)]; // :^)
		if (Parser.CAT_ID_CHARACTER) inCategoryAliasShort["char"] = [Parser.pageCategoryToFull(Parser.CAT_ID_CHARACTER)];

		// Reference existing aliases safely
		if (inCategoryAlias["classFeature"]) inCategoryAliasShort["cf"] = inCategoryAlias["classFeature"];
		if (inCategoryAlias["subclassFeature"]) inCategoryAliasShort["scf"] = inCategoryAlias["subclassFeature"];
		if (inCategoryAlias["monster"]) inCategoryAliasShort["mon"] = inCategoryAlias["monster"];
		if (inCategoryAlias["optfeature"]) inCategoryAliasShort["opf"] = inCategoryAlias["optfeature"];

		const getLowercaseKeyed = obj => {
			return Object.fromEntries(
				Object.entries(obj)
					.map(([k, v]) => [k.toLowerCase(), v]),
			);
		};

		this._IN_CATEGORY_ALIAS = getLowercaseKeyed(inCategoryAlias);
		this._IN_CATEGORY_ALIAS_SHORT = getLowercaseKeyed(inCategoryAliasShort);

		// Order is important; approx longest first
		const ptCategory = [
			...Object.keys(this._CATEGORY_COUNTS).map(it => it.toLowerCase().escapeRegexp()),
			...Object.keys(this._IN_CATEGORY_ALIAS),
			...Object.keys(this._IN_CATEGORY_ALIAS_SHORT),
		]
			.join("|");

		this._RE_SYNTAX__IN_CATEGORY = new RegExp(`\\bin:\\s*(?<isNegate>!)?(?<category>${ptCategory})s?\\b`, "i");
	}

	/* -------------------------------------------- */

	static async pGetFilteredResults (results, {isApplySrdFilter = false, isApplyPartneredFilter = false} = {}) {
		if (isApplySrdFilter && OmnisearchState.isSrdOnly) {
			results = results.filter(res => res.doc.r || res.doc.r2);
		}

		if (isApplyPartneredFilter && !OmnisearchState.isShowPartnered) {
			results = results.filter(res => !res.doc.s || !res.doc.dP);
		}

		if (!OmnisearchState.isShowBrew) {
			// Always filter in partnered, as these are handled by the more specific filter, above
			results = results.filter(res => !res.doc.s || res.doc.dP || !BrewUtil2.hasSourceJson(res.doc.s));
		}

		if (!OmnisearchState.isShowUa) {
			results = results.filter(res => !res.doc.s || !SourceUtil.isNonstandardSourceWotc(res.doc.s));
		}

		if (!OmnisearchState.isShowLegacy) {
			results = results.filter(res => !res.doc.s || !SourceUtil.isLegacySourceWotc(res.doc.s));
		}

		if (!OmnisearchState.isShowBlocklisted && ExcludeUtil.getList().length) {
			const resultsNxt = [];
			for (const res of results) {
				if (res.doc.c === Parser.CAT_ID_QUICKREF || res.doc.c === Parser.CAT_ID_PAGE) {
					resultsNxt.push(res);
					continue;
				}

				const bCat = Parser.pageCategoryToProp(res.doc.c);
				if (bCat !== "item") {
					if (!ExcludeUtil.isExcluded(res.doc.u, bCat, res.doc.s, {isNoCount: true})) resultsNxt.push(res);
					continue;
				}

				const item = await DataLoader.pCacheAndGetHash(UrlUtil.PG_ITEMS, res.doc.u);
				if (!Renderer.item.isExcluded(item, {hash: res.doc.u})) resultsNxt.push(res);
			}
			results = resultsNxt;
		}

		const styleHint = VetoolsConfig.get("styleSwitcher", "style");
		results
			.forEach(result => this._mutResultScores({result, styleHint}));
		results.sort((a, b) => SortUtil.ascSort(b.score, a.score));

		return results;
	}

	/* -------------------------------------------- */

	static _RE_SYNTAX__SOURCE = /\bsource:\s*(?<isNegate>!)?(?<source>.*)\b/i;
	static _RE_SYNTAX__PAGE = /\bpage:\s*(?<isNegate>!)?(?<pageStart>\d+)\s*(?:-\s*(?<pageEnd>\d+)\s*)?\b/i;

	static async pGetResults (searchTerm) {
		await this._pInit();

		searchTerm = (searchTerm || "").toAscii();

		const syntaxMetasCategory = [];
		const syntaxMetasSource = [];
		const syntaxMetasPageRange = [];

		searchTerm = searchTerm
			.replace(this._RE_SYNTAX__SOURCE, (...m) => {
				const {isNegate, source} = m.at(-1);
				syntaxMetasSource.push(new SyntaxMetaSource({
					isNegate: !!isNegate,
					source: source.trim().toLowerCase(),
				}));
				return "";
			})
			.replace(this._RE_SYNTAX__PAGE, (...m) => {
				const {isNegate, pageStart, pageEnd} = m.at(-1);
				syntaxMetasPageRange.push(new SyntaxMetaPageRange({
					isNegate: !!isNegate,
					pageRange: [
						Number(pageStart),
						pageEnd ? Number(pageEnd) : Number(pageStart),
					],
				}));
				return "";
			})
			.replace(this._RE_SYNTAX__IN_CATEGORY, (...m) => {
				let {isNegate, category} = m.at(-1);
				category = category.toLowerCase().trim();

				const categories = (
					this._IN_CATEGORY_ALIAS[category]
					|| this._IN_CATEGORY_ALIAS_SHORT[category]
					|| [category]
				)
					.map(it => it.toLowerCase());

				syntaxMetasCategory.push(new SyntaxMetaCategories({
					isNegate: !!isNegate,
					categories,
				}));
				return "";
			})
			.replace(/\s+/g, " ")
			.trim();

		const results = await this._pGetResults_pGetBaseResults({
			searchTerm,
			syntaxMetas: [
				syntaxMetasCategory.length
					? new SyntaxMetaGroup({syntaxMetas: syntaxMetasCategory})
					: null,
				syntaxMetasSource.length
					? new SyntaxMetaGroup({syntaxMetas: syntaxMetasSource})
					: null,
				syntaxMetasPageRange.length
					? new SyntaxMetaGroup({syntaxMetas: syntaxMetasPageRange})
					: null,
			]
				.filter(Boolean),
		});

		return this.pGetFilteredResults(results, {isApplySrdFilter: true, isApplyPartneredFilter: true});
	}

	static _pGetResults_pGetBaseResults (
		{
			searchTerm,
			syntaxMetas,
		},
	) {
		if (!syntaxMetas.length) {
			return this._searchIndex.search(
				searchTerm,
				{
					fields: {
						n: {boost: 5, expand: true},
						s: {expand: true},
					},
					bool: "AND",
					expand: true,
				},
			);
		}

		const resultsUnfiltered = searchTerm
			? this._searchIndex
				.search(
					searchTerm,
					{
						fields: {
							n: {boost: 5, expand: true},
							s: {expand: true},
						},
						bool: "AND",
						expand: true,
					},
				)
			: Object.values(this._searchIndex.documentStore.docs).map(it => ({doc: it}));

		return resultsUnfiltered
			.filter(res => {
				const resCache = {
					source: res.doc.s ? Parser.sourceJsonToAbv(res.doc.s).toLowerCase() : null,
					category: res.doc.cf.toLowerCase(),
				};
				return syntaxMetas.every(syntaxMeta => syntaxMeta.isMatch(res, resCache));
			});
	}

	/* -------------------------------------------- */

	static _SOURCES_CORE_LEGACY = new Set([
		Parser.SRC_PHB,
		Parser.SRC_DMG,
		Parser.SRC_MM,
	]);

	static _CATEGORIES_DEPRIORITIZED = new Set([
		Parser.CAT_ID_RECIPES,
		Parser.CAT_ID_LANGUAGE,
		Parser.CAT_ID_CARD,
	]);

	static _mutResultScores ({result, styleHint}) {
		if (this._SOURCES_CORE_LEGACY.has(result.doc.s)) result.score *= 1.1;
		if (SourceUtil.isNonstandardSource(result.doc.s)) result.score *= 0.66;
		if (SourceUtil.isLegacySourceWotc(result.doc.s)) result.score *= 0.75;

		if (this._CATEGORIES_DEPRIORITIZED.has(result.doc.c)) result.score *= 0.5;
	}

	/* -------------------------------------------- */

	static getCategoryAliasesShort () {
		// Try to initialize if not already done
		this._initReInCategory();
		
		// If initialization failed but Parser is now available, try again
		if (!this._IN_CATEGORY_ALIAS_SHORT && this._initializationFailed) {
			this._initializationFailed = false; // Reset the flag
			this._initReInCategory();
		}

		return this._IN_CATEGORY_ALIAS_SHORT || {}; // Return empty object as fallback
	}
}
