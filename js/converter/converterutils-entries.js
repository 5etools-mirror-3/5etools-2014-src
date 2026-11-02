import {ActionTag, DiceConvert, SenseTag, SkillTag, TagCondition, TaggerUtils} from "./converterutils-tags.js";
import {VetoolsConfig} from "../utils-config/utils-config-config.js";
import {ConverterTaggerInitializable} from "./converterutils-taggerbase.js";
import {WALKER_CONVERTER, WALKER_CONVERTER_KEY_BLOCKLIST} from "./converterutils-walker.js";

const LAST_KEY_ALLOWLIST = new Set([
	"entries",
	"entry",
	"items",
	"entriesHigherLevel",
	"rows",
	"row",
	"fluff",
]);

export class TagJsons {
	static async pInit ({spells}) {
		await TagCondition.pInit();
		await SkillTag.pInit();
		await SenseTag.pInit();
		await SpellTag.pInit(spells);
		await ItemTag.pInit();
		await ActionTag.pInit();
		await FeatTag.pInit();
		await AdventureBookTag.pInit();
		await CreatureTag.pInit();
	}

	/**
	 * @param json
	 * @param {?Set<string>} keySet
	 * @param {boolean} isOptimistic
	 * @param {?Array<object>} creaturesToTag
	 * @param {"classic" | null} styleHint
	 */
	static mutTagObject (json, {keySet = null, isOptimistic = true, creaturesToTag = null, styleHint = null} = {}) {
		styleHint ||= VetoolsConfig.get("styleSwitcher", "style");

		const fnCreatureTagSpecific = CreatureTag.getFnTryRunSpecific(creaturesToTag);

		Object.keys(json)
			.forEach(k => {
				if (WALKER_CONVERTER_KEY_BLOCKLIST.has(k)) return;
				if (keySet != null && !keySet.has(k)) return;

				json[k] = WALKER_CONVERTER.walk(
					{_: json[k]},
					{
						object: (obj, lastKey) => {
							if (lastKey != null && !LAST_KEY_ALLOWLIST.has(lastKey)) return obj;

							obj = TagCondition.tryRun(obj, {styleHint});
							obj = SkillTag.tryRunStrictCapsWords(obj, {styleHint});
							// spells > senses, as "casts Darkvision" should reference the spell
							// spells > rules, as "Cone of Cold" can be mis-tagged as "Cone [AoE] of Cold"
							obj = SpellTag.tryRun(obj, {styleHint, isOptimistic});
							obj = SenseTag.tryRun(obj, {styleHint});
							// items > actions, as "Hide Armor" can be mis-tagged as "Hide"
							obj = ItemTag.tryRun(obj, {styleHint});
							obj = ActionTag.tryRunStrictCapsWords(obj, {styleHint});
							obj = TableTag.tryRun(obj, {styleHint});
							obj = TrapTag.tryRun(obj, {styleHint});
							obj = HazardTag.tryRun(obj, {styleHint});
							obj = ChanceTag.tryRun(obj, {styleHint});
							obj = QuickrefTag.tryRun(obj, {styleHint});
							obj = DiceConvert.getTaggedEntry(obj, {styleHint});
							obj = FeatTag.tryRun(obj, {styleHint});
							obj = AdventureBookTag.tryRun(obj, {styleHint});

							if (fnCreatureTagSpecific) obj = fnCreatureTagSpecific(obj);

							return obj;
						},
					},
				)._;
			});
	}

	/**
	 * @param json
	 * @param {?Set<string>} keySet
	 * @param {boolean} isOptimistic
	 * @param {"classic" | null} styleHint
	 */
	static mutTagObjectStrictCapsWords (json, {keySet = null, isOptimistic = false, styleHint = null} = {}) {
		styleHint ||= VetoolsConfig.get("styleSwitcher", "style");

		Object.keys(json)
			.forEach(k => {
				if (WALKER_CONVERTER_KEY_BLOCKLIST.has(k)) return;
				if (keySet != null && !keySet.has(k)) return;

				json[k] = WALKER_CONVERTER.walk(
					{_: json[k]},
					{
						object: (obj, lastKey) => {
							if (lastKey != null && !LAST_KEY_ALLOWLIST.has(lastKey)) return obj;

							// TODO(Future)

							return obj;
						},
					},
				)._;
			});
	}
}

TagJsons._BLOCKLIST_FILE_PREFIXES = null;

export class SpellTag extends ConverterTaggerInitializable {
	static _SPELL_NAMES = {};
	static _SPELL_NAME_REGEX = null;
	static _SPELL_NAME_REGEX_SPELL = null;
	static _SPELL_NAME_REGEX_AND = null;
	static _SPELL_NAME_REGEX_CAST = null;

	static _NON_STANDARD = new Set([
		// Skip "Divination" to avoid tagging occurrences of the school
		"Divination",
		// Skip spells we specifically handle
		"Antimagic Field",
		"Dispel Magic",
	].map(it => it.toLowerCase()));

	static async _pInit (spells) {
		spells
			.forEach(sp => this._SPELL_NAMES[sp.name.toLowerCase()] = {name: sp.name, source: sp.source});

		const spellNamesFiltered = Object.keys(this._SPELL_NAMES)
			.filter(n => !this._NON_STANDARD.has(n));

		this._SPELL_NAME_REGEX = new RegExp(`\\b(${spellNamesFiltered.map(it => it.escapeRegexp()).join("|")})\\b`, "gi");
		this._SPELL_NAME_REGEX_SPELL = new RegExp(`\\b(${spellNamesFiltered.map(it => it.escapeRegexp()).join("|")}) (spell|cantrip)`, "gi");
		this._SPELL_NAME_REGEX_AND = new RegExp(`\\b(${spellNamesFiltered.map(it => it.escapeRegexp()).join("|")}) (and {@spell)`, "gi");
		this._SPELL_NAME_REGEX_CAST = new RegExp(`(?<prefix>casts?(?: the(?: spell)?)? )(?<spell>${spellNamesFiltered.map(it => it.escapeRegexp()).join("|")})\\b`, "gi");
	}

	static _tryRun (ent, {styleHint = null, blocklistNames = null, isOptimistic = true} = {}) {
		styleHint ||= VetoolsConfig.get("styleSwitcher", "style");

		if (blocklistNames) blocklistNames = blocklistNames.getWithBlocklistIgnore([ent.name]);

		return WALKER_CONVERTER.walk(
			ent,
			{
				string: (str) => {
					const ptrStack = {_: ""};
					TaggerUtils.walkerStringHandler(
						["@spell"],
						ptrStack,
						0,
						0,
						str,
						{
							fnTag: (strMod) => this._fnTag({strMod, styleHint, blocklistNames, isOptimistic}),
						},
					);
					return ptrStack._;
				},
			},
		);
	}

	static _getSpellMeta ({name, styleHint}) {
		name = name.toLowerCase();
		return this._SPELL_NAMES[name];
	}

	static _fnTag ({strMod, styleHint, blocklistNames, isOptimistic}) {
		if (isOptimistic) {
			strMod = strMod
				.replace(this._SPELL_NAME_REGEX_SPELL, (...m) => {
					const spellMeta = this._SPELL_NAMES[m[1].toLowerCase()];
					if (blocklistNames?.isBlocked(spellMeta.name)) return m[0];
					return `{@spell ${m[1]}${spellMeta.source !== Parser.SRC_PHB ? `|${spellMeta.source}` : ""}} ${m[2]}`;
				});
		}

		// Tag common spells which often don't have e.g. the word "spell" nearby
		strMod = strMod
			.replace(/\b(antimagic field|dispel magic)\b/gi, (...m) => {
				const spellMeta = this._SPELL_NAMES[m[1].toLowerCase()];
				if (blocklistNames?.isBlocked(spellMeta.name)) return m[0];
				return `{@spell ${m[1]}${spellMeta.source !== Parser.SRC_PHB ? `|${spellMeta.source}` : ""}}`;
			});

		strMod = strMod
			.replace(this._SPELL_NAME_REGEX_CAST, (...m) => {
				const spellMeta = this._SPELL_NAMES[m.last().spell.toLowerCase()];
				if (blocklistNames?.isBlocked(spellMeta.name)) return m[0];
				return `${m.last().prefix}{@spell ${m.last().spell}${spellMeta.source !== Parser.SRC_PHB ? `|${spellMeta.source}` : ""}}`;
			});

		return strMod
			.replace(this._SPELL_NAME_REGEX_AND, (...m) => {
				const spellMeta = this._SPELL_NAMES[m[1].toLowerCase()];
				if (blocklistNames?.isBlocked(spellMeta.name)) return m[0];
				return `{@spell ${m[1]}${spellMeta.source !== Parser.SRC_PHB ? `|${spellMeta.source}` : ""}} ${m[2]}`;
			})
			.replace(/(spells(?:|[^.!?:{]*): )([^.!?]+)/gi, (...mOuter) => {
				const spellPart = mOuter[2].replace(this._SPELL_NAME_REGEX, (...m) => {
					const spellMeta = this._getSpellMeta({name: m[1], styleHint});
					if (!spellMeta) return m[0];
					if (blocklistNames?.isBlocked(spellMeta.name)) return m[0];
					return `{@spell ${m[1]}${spellMeta.source !== Parser.SRC_PHB ? `|${spellMeta.source}` : ""}}`;
				});
				return `${mOuter[1]}${spellPart}`;
			})
			.replace(this._SPELL_NAME_REGEX_CAST, (...m) => {
				const spellMeta = this._SPELL_NAMES[m.last().spell.toLowerCase()];
				if (blocklistNames?.isBlocked(spellMeta.name)) return m[0];
				return `${m.last().prefix}{@spell ${m.last().spell}${spellMeta.source !== Parser.SRC_PHB ? `|${spellMeta.source}` : ""}}`;
			})
		;
	}
}

export class ItemTag extends ConverterTaggerInitializable {
	static _WALKER = MiscUtil.getWalker({
		keyBlocklist: new Set([
			...WALKER_CONVERTER_KEY_BLOCKLIST,
			"packContents", // Avoid tagging item pack contents
		]),
	});

	static async _pInit () {
		const itemArr = await Renderer.item.pBuildList();
		const standardItems = itemArr.filter(it => !SourceUtil.isNonstandardSource(it.source));

		const itemProperties = await DataLoader.pCacheAndGetAllSite("itemProperty");
		const standardItemProperties = itemProperties.filter(it => !SourceUtil.isNonstandardSource(it.source));

		await this._pInit_classic({standardItems, standardProperties: standardItemProperties});
	}

	static _ITEM_NAMES__CLASSIC = {};
	static _ITEM_PROPERTY_NAMES__CLASSIC = {};
	static ITEM_NAMES_REGEX_OTHER__CLASSIC = null;
	static _ITEM_NAMES_REGEX_EQUIPMENT__CLASSIC = null;
	static _ITEM_NAMES_REGEX_STRICT__CLASSIC = null;
	static _ITEM_NAMES_GEMSTONE__CLASSIC = {};
	static _ITEM_NAMES_REGEX_GEMSTONE__CLASSIC = null;
	static _ITEM_PROPERTY_REGEX__CLASSIC = null;

	static async _pInit_classic ({standardItems, standardProperties}) {
		await this._pInit_generic({
			standardItems,
			standardProperties,
			lookupItemNames: this._ITEM_NAMES__CLASSIC,
			lookupItemPropertyNames: this._ITEM_PROPERTY_NAMES__CLASSIC,
			propItemNamesRegexOther: "ITEM_NAMES_REGEX_OTHER__CLASSIC",
			propItemNamesRegexEquipment: "_ITEM_NAMES_REGEX_EQUIPMENT__CLASSIC",
			propItemNamesRegexStrict: "_ITEM_NAMES_REGEX_STRICT__CLASSIC",
			lookupItemNamesGemstone: this._ITEM_NAMES_GEMSTONE__CLASSIC,
			propItemNamesRegexGemstone: "_ITEM_NAMES_REGEX_GEMSTONE__CLASSIC",
			propItemPropertyNamesRegex: "_ITEM_PROPERTY_REGEX__CLASSIC",
			srcPhb: Parser.SRC_PHB,
		});
	}

	static _TOOL_TYPES = new Set([
		Parser.ITM_TYP_ABV__ARTISAN_TOOL,
		Parser.ITM_TYP_ABV__GAMING_SET,
		Parser.ITM_TYP_ABV__INSTRUMENT,
		Parser.ITM_TYP_ABV__TOOL,
	]);

	static _NON_EQUIPMENT_TYPES = new Set([
		Parser.ITM_TYP_ABV__MELEE_WEAPON,
		Parser.ITM_TYP_ABV__RANGED_WEAPON,
		Parser.ITM_TYP_ABV__LIGHT_ARMOR,
		Parser.ITM_TYP_ABV__MEDIUM_ARMOR,
		Parser.ITM_TYP_ABV__HEAVY_ARMOR,
		Parser.ITM_TYP_ABV__SHIELD,
	]);

	static _pInit_generic (
		{
			standardItems,
			standardProperties,
			lookupItemNames,
			lookupItemPropertyNames,
			propItemNamesRegexOther,
			propItemNamesRegexEquipment,
			propItemNamesRegexStrict,
			lookupItemNamesGemstone,
			propItemNamesRegexGemstone,
			propItemPropertyNamesRegex,
			srcPhb,
		},
	) {
		if (!standardItems.length) return;

		// region Tools
		const tools = standardItems.filter(it => it.type && this._TOOL_TYPES.has(DataUtil.itemType.unpackUid(it.type).abbreviation) && it.name !== "Horn");
		tools.forEach(tool => {
			lookupItemNames[tool.name.toLowerCase()] = {name: tool.name, source: tool.source};
		});

		// endregion

		// region Other items
		const otherItems = standardItems
			.filter(it => {
				if (it.type && this._TOOL_TYPES.has(DataUtil.itemType.unpackUid(it.type).abbreviation)) return false;
				// Disallow specific items
				if (it.name === "Wave" && [Parser.SRC_DMG].includes(it.source)) return false;
				// Allow all non-mundane DMG items
				if (it.source === Parser.SRC_DMG && !Renderer.item.isMundane(it)) return true;
				// Allow "sufficiently complex name" items
				if (it.name.split(" ").length > 2) return true;
				// Allow basic weapons
				if (it.weaponCategory && Renderer.item.isMundane(it)) return true;
				// Allow specific variants, as generally longer "basic weapon" names
				if (it._category === "Specific Variant") return true;
				return false;
			})
			.sort((itemA, itemB) => {
				// Prefer specific variants first, as they have longer names
				const compType = Number(itemB._category === "Specific Variant") - Number(itemA._category === "Specific Variant");
				if (compType) return compType;
				// Prefer names with more parts
				const compTks = itemB.name.split(" ").length - itemA.name.split(" ").length;
				if (compTks) return compTks;
				return SortUtil.ascSortLower(itemA.name, itemB.name);
			})
		;
		otherItems.forEach(it => {
			lookupItemNames[it.name.toLowerCase()] = {name: it.name, source: it.source};
		});

		// Match tools and other items together, so a tool cannot end up part of a longer item name/tag
		const itemNames = [...tools, ...otherItems].map(it => it.name);
		if (itemNames.length) this[propItemNamesRegexOther] = TaggerUtils.getNameRegex(itemNames, {flags: "gi"});
		// endregion

		// region Basic equipment
		// (Has some overlap with others)
		const itemsEquipment = standardItems
			.filter(itm => itm.source === srcPhb && (!itm.type || !this._NON_EQUIPMENT_TYPES.has(DataUtil.itemType.unpackUid(itm.type).abbreviation)));
		if (itemsEquipment.length) this[propItemNamesRegexEquipment] = TaggerUtils.getNameRegex(itemsEquipment.map(it => it.name), {flags: "gi"});
		itemsEquipment.forEach(itm => lookupItemNames[itm.name.toLowerCase()] = {name: itm.name, source: itm.source});
		// endregion

		// region Strict naming
		if (propItemNamesRegexStrict) {
			this[propItemNamesRegexStrict] = new RegExp(`^(${standardItems.map(it => it.name.escapeRegexp()).join("|")})$`, "gi");

			standardItems.forEach(itm => {
				const key = itm.name.toLowerCase();
				// Prevent e.g. SCAG "Musical Instrument" overriding PHB
				if (lookupItemNames[key]?.source === srcPhb) return;
				lookupItemNames[key] = {name: itm.name, source: itm.source};
			});
		}
		// endregion

		// region Gemstones
		const gemstones = standardItems
			.filter(it => it.type && DataUtil.itemType.unpackUid(it.type).abbreviation === Parser.ITM_TYP_ABV__TREASURE_GEMSTONE);
		const gemstoneNames = gemstones
			.flatMap(it => {
				const namePlural = it.name.toPlural();
				lookupItemNamesGemstone[it.name.toLowerCase()] = {name: it.name, source: it.source, valueGp: it.value / 100, isPlural: false};
				lookupItemNamesGemstone[namePlural.toLowerCase()] = {name: it.name, source: it.source, valueGp: it.value / 100, isPlural: true};
				return [it.name, namePlural];
			})
			.sort((nameA, nameB) => nameB.length - nameA.length || SortUtil.ascSortLower(nameA, nameB));

		if (gemstoneNames.length) this[propItemNamesRegexGemstone] = new RegExp(`\\b(?<itemName>${gemstoneNames.map(it => it.escapeRegexp()).join("|")})\\b(?: (?<itemSuffix>gemstones?|gems?|stones?|crystals?))?(?=(?: \\((?:worth [^.!?]*?)?(?<valueParens>[\\d,]+)\\+? gp|[^.!?]*?\\bworth\\b[^.!?]*?(?<value>[\\d,]+)\\+? gp))`, "gi");
		// endregion

		// region Item properties
		standardProperties.forEach(ent => {
			const name = Renderer.item.getPropertyName(ent);
			lookupItemPropertyNames[name.toLowerCase()] = {abbreviation: ent.abbreviation, source: ent.source};
		});

		if (standardProperties.length) this[propItemPropertyNamesRegex] = new RegExp(`(?<=the )(?<propertyName>${standardProperties.map(ent => Renderer.item.getPropertyName(ent).escapeRegexp()).join("|")})(?= property)`, "gi");
		// endregion
	}

	/* -------------------------------------------- */

	/**
	 * @param ent
	 * @param {"classic" | null} styleHint
	 */
	static _tryRun (ent, {styleHint = null} = {}) {
		styleHint ||= VetoolsConfig.get("styleSwitcher", "style");

		const entTagged = this._WALKER.walk(
			ent,
			{
				string: (str) => {
					const ptrStack = {_: ""};

					TaggerUtils.walkerStringHandler(
						["@item"],
						ptrStack,
						0,
						0,
						str,
						{
							fnTag: this._fnTag_classic.bind(this),
						},
					);

					str = ptrStack._;
					ptrStack._ = "";

					TaggerUtils.walkerStringHandler(
						["@itemProperty"],
						ptrStack,
						0,
						0,
						str,
						{
							fnTag: this._fnTag_classic_properties.bind(this),
						},
					);

					return ptrStack._;
				},
			},
		);

		return this._WALKER.walk(
			entTagged,
			{
				string: (str) => {
					const ptrStack = {_: ""};

					TaggerUtils.walkerStringHandler(
						["@item"],
						ptrStack,
						0,
						0,
						str,
						{
							fnTag: this._fnTag_classic_gemstones.bind(this),
						},
					);

					return ptrStack._;
				},
			},
		);
	}

	static _fnTag_classic (strMod) {
		if (this.ITEM_NAMES_REGEX_OTHER__CLASSIC != null) {
			strMod = strMod
				.replace(this.ITEM_NAMES_REGEX_OTHER__CLASSIC, (...m) => {
					const itemMeta = this._ITEM_NAMES__CLASSIC[m[1].toLowerCase()];
					return `{@item ${m[1]}${itemMeta.source !== Parser.SRC_DMG ? `|${itemMeta.source}` : ""}}`;
				});
		}

		return strMod;
	}

	static _fnTag_gemstones ({strMod, itemNamesRegex, itemNames}) {
		if (itemNamesRegex == null) return strMod;

		return strMod
			.replace(itemNamesRegex, (...m) => {
				const {itemName, valueParens, value} = m.at(-1);

				const itemMeta = itemNames[itemName.toLowerCase()];
				const valueGp = Number((valueParens || value).replace(/,/g, ""));
				if (valueGp !== itemMeta.valueGp) return m[0];

				const ptUid = m[0].toLowerCase() === itemMeta.name.toLowerCase()
					? DataUtil.proxy.getUidPacked("item", {name: m[0], source: itemMeta.source}, "item", {isMaintainCase: true})
					: DataUtil.proxy.getUidPacked("item", {name: itemMeta.name, source: itemMeta.source}, "item", {isMaintainCase: true, displayName: m[0]});

				return `{@item ${ptUid}}`;
			});
	}

	static _fnTag_classic_gemstones (strMod) {
		return this._fnTag_gemstones({
			strMod,
			itemNamesRegex: this._ITEM_NAMES_REGEX_GEMSTONE__CLASSIC,
			itemNames: this._ITEM_NAMES_GEMSTONE__CLASSIC,
		});
	}

	static _fnTag_classic_properties (strMod) {
		if (this._ITEM_PROPERTY_REGEX__CLASSIC != null) {
			strMod = strMod
				.replace(this._ITEM_PROPERTY_REGEX__CLASSIC, (...m) => {
					const meta = this._ITEM_PROPERTY_NAMES__CLASSIC[m[1].toLowerCase()];
					return `{@itemProperty ${meta.abbreviation}|${meta.source !== Parser.SRC_PHB ? `${meta.source}` : ""}|${m[1]}}`;
				});
		}

		return strMod;
	}

	/* -------------------------------------------- */

	static tryRunBasicEquipment (ent, {styleHint = null} = {}) {
		if (!this._IS_INIT) throw new Error("Not initialized!");

		return this._WALKER.walk(
			ent,
			{
				string: (str) => {
					const ptrStack = {_: ""};

					TaggerUtils.walkerStringHandler(
						["@item"],
						ptrStack,
						0,
						0,
						str,
						{
							fnTag: this._fnTagBasicEquipment_classic.bind(this),
						},
					);
					return ptrStack._;
				},
			},
		);
	}

	static _fnTagBasicEquipment_classic (strMod) {
		if (this._ITEM_NAMES_REGEX_EQUIPMENT__CLASSIC == null) return strMod;

		return strMod
			.replace(this._ITEM_NAMES_REGEX_EQUIPMENT__CLASSIC, (...m) => {
				const itemMeta = this._ITEM_NAMES__CLASSIC[m[1].toLowerCase()];
				return `{@item ${m[1]}${itemMeta.source !== Parser.SRC_DMG ? `|${itemMeta.source}` : ""}}`;
			})
		;
	}

	/* -------------------------------------------- */

	static _tryRunStrictCapsWords (ent, {styleHint = null} = {}) {
		styleHint ||= VetoolsConfig.get("styleSwitcher", "style");

		return WALKER_CONVERTER.walk(
			ent,
			{
				string: (str) => {
					const ptrStack = {_: ""};
					TaggerUtils.walkerStringHandlerStrictCapsWords(
						["@item"],
						ptrStack,
						str,
						{
							fnTag: (strMod) => this._fnTagStrict({strMod, styleHint}),
						},
					);
					return ptrStack._;
				},
			},
		);
	}

	static _fnTagStrict ({strMod, styleHint}) {
		return strMod.replace(this._ITEM_NAMES_REGEX_STRICT__CLASSIC, (...m) => {
			const itemMeta = this._ITEM_NAMES__CLASSIC[m[1].toLowerCase()];
			return `{@item ${m[1]}|${itemMeta.source}}`;
		});
	}
}

export class TableTag {
	static tryRun (it) {
		return WALKER_CONVERTER.walk(
			it,
			{
				string: (str) => {
					const ptrStack = {_: ""};
					TaggerUtils.walkerStringHandler(
						["@table"],
						ptrStack,
						0,
						0,
						str,
						{
							fnTag: this._fnTag.bind(this),
						},
					);
					return ptrStack._;
				},
			},
		);
	}

	static _fnTag (strMod) {
		return strMod
			.replace(/Wild Magic Surge table/g, `{@table Wild Magic Surge|PHB} table`)
		;
	}
}

export class TrapTag {
	static _RE_TRAP_SEE = /\b(?<name>Fire-Breathing Statue|Sphere of Annihilation|Collapsing Roof|Falling Net|Pits|Poison Darts|Poison Needle|Rolling Sphere)(?<suffix> \(see)/gi;

	static tryRun (it) {
		return WALKER_CONVERTER.walk(
			it,
			{
				string: (str) => {
					const ptrStack = {_: ""};
					TaggerUtils.walkerStringHandler(
						["@trap"],
						ptrStack,
						0,
						0,
						str,
						{
							fnTag: this._fnTag.bind(this),
						},
					);
					return ptrStack._;
				},
			},
		);
	}

	static _fnTag (strMod) {
		return strMod
			.replace(this._RE_TRAP_SEE, (...m) => {
				const {name, suffix} = m.at(-1);
				return `{@trap ${name}}${suffix}`;
			})
		;
	}
}

export class HazardTag {
	static _RE_HAZARD_SEE = /\b(?<name>High Altitude|Brown Mold|Green Slime|Webs|Yellow Mold|Extreme Cold|Extreme Heat|Heavy Precipitation|Strong Wind|Desecrated Ground|Frigid Water|Quicksand|Razorvine|Slippery Ice|Thin Ice)(?<suffix> \(see)/gi;

	static tryRun (it) {
		return WALKER_CONVERTER.walk(
			it,
			{
				string: (str) => {
					const ptrStack = {_: ""};
					TaggerUtils.walkerStringHandler(
						["@hazard"],
						ptrStack,
						0,
						0,
						str,
						{
							fnTag: this._fnTag.bind(this),
						},
					);
					return ptrStack._;
				},
			},
		);
	}

	static _fnTag (strMod) {
		return strMod
			.replace(this._RE_HAZARD_SEE, (...m) => {
				const {name, suffix} = m.at(-1);
				return `{@hazard ${name}}${suffix}`;
			})
		;
	}
}

export class CreatureTag extends ConverterTaggerInitializable {
	/**
	 * Dynamically create a walker which can be re-used.
	 */
	static getFnTryRunSpecific (creaturesToTag) {
		if (!creaturesToTag?.length) return null;

		// region Create a regular expression per source
		const bySource = {};
		creaturesToTag.forEach(({name, source}) => {
			(bySource[source] = bySource[source] || []).push(name);
		});
		const res = Object.entries(bySource)
			.mergeMap(([source, names]) => {
				const re = new RegExp(`\\b(${names.map(it => it.escapeRegexp()).join("|")})\\b`, "gi");
				return {[source]: re};
			});
		// endregion

		const fnTag = strMod => {
			Object.entries(res)
				.forEach(([source, re]) => {
					strMod = strMod.replace(re, (...m) => `{@creature ${m[0]}${source !== Parser.SRC_MM ? `|${source}` : ""}}`);
				});
			return strMod;
		};

		return (it) => {
			return WALKER_CONVERTER.walk(
				it,
				{
					string: (str) => {
						const ptrStack = {_: ""};
						TaggerUtils.walkerStringHandler(
							["@creature"],
							ptrStack,
							0,
							0,
							str,
							{
								fnTag,
							},
						);
						return ptrStack._;
					},
				},
			);
		};
	}

	/* -------------------------------------------- */

	static _WALKER = MiscUtil.getWalker({
		keyBlocklist: new Set([
			...WALKER_CONVERTER_KEY_BLOCKLIST,
		]),
	});

	static _LOOKUP_CLASSIC = null;
	static _LOOKUP_CLASSIC_PLURAL = null;

	static _RE_CLASSIC = null;
	static _RE_CLASSIC_PLURAL = null;

	static async _pInit () {
		// TODO(Future)
	}

	/* -------------------------------------------- */

	/**
	 * @param ent
	 * @param {"classic" | null} styleHint
	 */
	static _tryRun (ent, {styleHint = null} = {}) {
		styleHint ||= VetoolsConfig.get("styleSwitcher", "style");

		// No-op
		return ent;
	}
}

export class ChanceTag {
	static tryRun (it) {
		return WALKER_CONVERTER.walk(
			it,
			{
				string: (str) => {
					const ptrStack = {_: ""};
					TaggerUtils.walkerStringHandler(
						["@chance"],
						ptrStack,
						0,
						0,
						str,
						{
							fnTag: this._fnTag.bind(this),
						},
					);
					return ptrStack._;
				},
			},
		);
	}

	static _fnTag (strMod) {
		return strMod
			.replace(/\b(?<pct>\d+)(?: percent)(?<suffix> chance)/g, (...m) => `{@chance ${m.at(-1).pct}}${m.at(-1).suffix}`)
		;
	}
}

export class QuickrefTag {
	static tryRun (it) {
		return WALKER_CONVERTER.walk(
			it,
			{
				string: (str) => {
					const ptrStack = {_: ""};
					TaggerUtils.walkerStringHandler(
						["@quickref"],
						ptrStack,
						0,
						0,
						str,
						{
							fnTag: this._fnTag.bind(this),
						},
					);
					return ptrStack._;
				},
			},
		);
	}

	static _fnTag (strMod) {
		return strMod
			.replace(QuickrefTag._RE_BASIC, (...m) => `{@quickref ${QuickrefTag._LOOKUP_BASIC[m[0].toLowerCase()]}}`)
			.replace(QuickrefTag._RE_VISION, (...m) => `{@quickref ${QuickrefTag._LOOKUP_VISION[m[0].toLowerCase()]}||${m[0]}}`)
			.replace(QuickrefTag._RE_COVER, (...m) => `{@quickref ${QuickrefTag._LOOKUP_COVER[m[0].toLowerCase()]}||${m[0]}}`)
		;
	}
}
QuickrefTag._RE_BASIC = /\b([Dd]ifficult [Tt]errain|Vision and Light)\b/g;
QuickrefTag._RE_VISION = /\b(dim light|bright light|lightly obscured|heavily obscured)\b/gi;
QuickrefTag._RE_COVER = /\b(half cover|three-quarters cover|total cover)\b/gi;
QuickrefTag._LOOKUP_BASIC = {
	"difficult terrain": "difficult terrain||3",
	"vision and light": "Vision and Light||2",
};
QuickrefTag._LOOKUP_VISION = {
	"bright light": "Vision and Light||2",
	"dim light": "Vision and Light||2",
	"lightly obscured": "Vision and Light||2",
	"heavily obscured": "Vision and Light||2",
};
QuickrefTag._LOOKUP_COVER = {
	"half cover": "Cover||3",
	"three-quarters cover": "Cover||3",
	"total cover": "Cover||3",
};

export class FeatTag extends ConverterTaggerInitializable {
	static _FEAT_LOOKUP = [];

	static async _pInit () {
		const featData = await DataUtil.feat.loadJSON();
		const [featsNonStandard, feats] = [...featData.feat]
			.sort((a, b) => SortUtil.ascSortDateString(Parser.sourceJsonToDate(a.source), Parser.sourceJsonToDate(b.source)) || SortUtil.ascSortLower(a.name, b.name) || SortUtil.ascSortLower(a.source, b.source))
			.segregate(feat => SourceUtil.isNonstandardSource(feat.source));
		this._FEAT_LOOKUP = [
			...feats,
			...featsNonStandard,
		]
			.map(feat => ({searchName: feat.name.toLowerCase(), feat}));
	}

	static _tryRun (it) {
		return WALKER_CONVERTER.walk(
			it,
			{
				string: (str) => {
					const ptrStack = {_: ""};
					TaggerUtils.walkerStringHandler(
						["@feat"],
						ptrStack,
						0,
						0,
						str,
						{
							fnTag: this._fnTag.bind(this),
						},
					);
					return ptrStack._;
				},
			},
		);
	}

	static _fnTag (strMod) {
		return strMod
			.replace(/(?<pre>\bgain the )(?<name>.*)(?<post> feat\b)/, (...m) => {
				const {pre, post, name} = m.at(-1);
				const feat = this._getFeat(name);
				if (!feat) return m[0];
				const uid = DataUtil.proxy.getUid("feat", feat, {isMaintainCase: true});
				const [uidName, ...uidRest] = uid.split("|");

				// Tag display name not expected
				if (name.toLowerCase() !== uidName.toLowerCase()) throw new Error(`Unimplemented!`);

				const uidFinal = [
					name,
					...uidRest,
				]
					.join("|");
				return `${pre}{@feat ${uidFinal}}${post}`;
			})
		;
	}

	static _getFeat (name) {
		const searchName = name.toLowerCase().trim();
		const featMeta = this._FEAT_LOOKUP.find(it => it.searchName === searchName);
		if (!featMeta) return null;
		return featMeta.feat;
	}
}

export class AdventureBookTag extends ConverterTaggerInitializable {
	static _ADVENTURE_RES = [];
	static _BOOK_RES = [];

	static async _pInit () {
		for (const meta of [
			{
				propRes: "_ADVENTURE_RES",
				propData: "adventure",
				tag: "adventure",
				contentsUrl: `${Renderer.get().baseUrl}data/adventures.json`,
			},
			{
				propRes: "_BOOK_RES",
				propData: "book",
				tag: "book",
				contentsUrl: `${Renderer.get().baseUrl}data/books.json`,
			},
		]) {
			const contents = await DataUtil.loadJSON(meta.contentsUrl);

			this[meta.propRes] = contents[meta.propData]
				.map(({name, id}) => {
					const re = new RegExp(`\\b${name.escapeRegexp()}\\b`, "g");
					return str => str.replace(re, (...m) => `{@${meta.tag} ${m[0]}|${id}}`);
				});
		}
	}

	static _tryRun (it) {
		return WALKER_CONVERTER.walk(
			it,
			{
				string: (str) => {
					const ptrStack = {_: ""};
					TaggerUtils.walkerStringHandler(
						["@adventure", "@book"],
						ptrStack,
						0,
						0,
						str,
						{
							fnTag: this._fnTag.bind(this),
						},
					);
					return ptrStack._;
				},
			},
		);
	}

	static _fnTag (strMod) {
		for (const arr of [this._ADVENTURE_RES, this._BOOK_RES]) {
			strMod = arr.reduce((str, fn) => fn(str), strMod);
		}
		return strMod;
	}
}
