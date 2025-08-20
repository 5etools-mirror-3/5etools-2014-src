"use strict";

import {SITE_STYLE__CLASSIC} from "./consts.js";

/** @abstract */
class _RenderCharactersImplBase {
	_style;

	/**
	 * @param {object} character
	 * @param {object} [opts]
	 * @param {boolean} [opts.isSkipExcludesRender]
	 * @return {HTMLElementExtended}
	 */
	getRenderedCharacter (character, opts) {
		opts ||= {};
		const renderer = Renderer.get();
		return $(this._getRenderedCharacter({character, opts, renderer}));
	}

	/**
	 * @abstract
	 * @param {object} character
	 * @param {object} opts
	 * @param {boolean} [opts.isSkipExcludesRender]
	 * @param {Renderer} renderer
	 * @return {string}
	 */
	_getRenderedCharacter ({character, opts, renderer}) {
		throw new Error("Unimplemented!");
	}

	_getCommonHtmlParts ({character, opts, renderer}) {
		return {
			htmlPtIsExcluded: this._getCommonHtmlParts_isExcluded({character, opts}),
			htmlPtName: this._getCommonHtmlParts_name({character, opts}),
			htmlPtSizeTypeAlignment: this._getCommonHtmlParts_sizeTypeAlignment({character}),
			htmlPtAc: this._getCommonHtmlParts_ac({character}),
			htmlPtHp: this._getCommonHtmlParts_hp({character}),
			htmlPtSpeed: this._getCommonHtmlParts_speed({character}),
			htmlPtAbilityScores: this._getCommonHtmlParts_abilityScores({character}),
			htmlPtSaves: this._getCommonHtmlParts_saves({character}),
			htmlPtSkills: this._getCommonHtmlParts_skills({character}),
			htmlPtSenses: this._getCommonHtmlParts_senses({character}),
			htmlPtLanguages: this._getCommonHtmlParts_languages({character}),
			htmlPtSpellcasting: this._getCommonHtmlParts_spellcasting({character, renderer}),
			htmlPtTraits: this._getCommonHtmlParts_traits({character, renderer}),
			htmlPtActions: this._getCommonHtmlParts_actions({character, renderer}),
			htmlPtEquipment: this._getCommonHtmlParts_equipment({character, renderer}),
			htmlPtCustom: this._getCommonHtmlParts_custom({character, renderer}),
		};
	}

	_getCommonHtmlParts_isExcluded ({character, opts}) {
		if (opts.isSkipExcludesRender) return "";
		return Renderer.utils.getExcludedTr({entity: character, dataProp: "character", page: UrlUtil.PG_CHARACTERS, isExcluded: ExcludeUtil.isExcluded(UrlUtil.autoEncodeHash(character), "character", character.source, {isNoCount: true})});
	}

	_getCommonHtmlParts_name ({character, opts}) {
		return Renderer.utils.getNameTr(character, {page: UrlUtil.PG_CHARACTERS});
	}

	_getCommonHtmlParts_sizeTypeAlignment ({character}) {
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

		const alignmentText = character.alignment ? 
			Parser.alignmentListToFull(character.alignment) : 
			"Unknown";

		return `<tr><td colspan="6"><i>Level ${character.level} ${raceText} ${classText}, ${alignmentText}</i></td></tr>`;
	}

	_getCommonHtmlParts_ac ({character}) {
		return character.ac ? 
			character.ac.map(it => `${it.ac}${it.from ? ` (${it.from.join(", ")})` : ""}`).join(", ") : 
			"Unknown";
	}

	_getCommonHtmlParts_hp ({character}) {
		return character.hp ? 
			`${character.hp.average}${character.hp.formula ? ` (${character.hp.formula})` : ""}` : 
			"Unknown";
	}

	_getCommonHtmlParts_speed ({character}) {
		return character.speed ? 
			Object.entries(character.speed)
				.map(([k, v]) => `${k === "walk" ? "" : `${k} `}${v} ft.`)
				.join(", ") : 
			"30 ft.";
	}

	_getCommonHtmlParts_abilityScores ({character}) {
		return `<tr><td colspan="6">
			<table class="w-100 summary striped-odd">
				<tr>
					<th class="ve-col-2 ve-text-center">STR</th>
					<th class="ve-col-2 ve-text-center">DEX</th>
					<th class="ve-col-2 ve-text-center">CON</th>
					<th class="ve-col-2 ve-text-center">INT</th>
					<th class="ve-col-2 ve-text-center">WIS</th>
					<th class="ve-col-2 ve-text-center">CHA</th>
				</tr>
				<tr>
					<td class="ve-text-center">${character.str || 10} (${UiUtil.intToBonus(Parser.getAbilityModifier(character.str || 10))})</td>
					<td class="ve-text-center">${character.dex || 10} (${UiUtil.intToBonus(Parser.getAbilityModifier(character.dex || 10))})</td>
					<td class="ve-text-center">${character.con || 10} (${UiUtil.intToBonus(Parser.getAbilityModifier(character.con || 10))})</td>
					<td class="ve-text-center">${character.int || 10} (${UiUtil.intToBonus(Parser.getAbilityModifier(character.int || 10))})</td>
					<td class="ve-text-center">${character.wis || 10} (${UiUtil.intToBonus(Parser.getAbilityModifier(character.wis || 10))})</td>
					<td class="ve-text-center">${character.cha || 10} (${UiUtil.intToBonus(Parser.getAbilityModifier(character.cha || 10))})</td>
				</tr>
			</table>
		</td></tr>`;
	}

	_getCommonHtmlParts_saves ({character}) {
		return character.save ? 
			Object.entries(character.save)
				.map(([k, v]) => `${StrUtil.uppercaseFirst(k)} ${v}`)
				.join(", ") : 
			"—";
	}

	_getCommonHtmlParts_skills ({character}) {
		return character.skill ? 
			Object.entries(character.skill)
				.map(([k, v]) => `${StrUtil.toTitleCase(k)} ${v}`)
				.join(", ") : 
			"—";
	}

	_getCommonHtmlParts_senses ({character}) {
		return character.passive || 10;
	}

	_getCommonHtmlParts_languages ({character}) {
		return character.languages?.length ? 
			character.languages.join(", ") : 
			"—";
	}

	_getCommonHtmlParts_spellcasting ({character, renderer}) {
		if (!character.spellcasting) return "";

		const spellcasting = character.spellcasting;
		let out = `<tr><td class="divider" colspan="6"><div></div></td></tr>
		<tr><td colspan="6" class="mon__stat-block-section-head">
			<h3 class="mon__sect-head-inner">Spellcasting</h3>
		</td></tr>`;

		const spellText = `The character is a ${spellcasting.level}${Parser.getOrdinalForm(spellcasting.level)}-level spellcaster. Its spellcasting ability is ${spellcasting.ability ? StrUtil.uppercaseFirst(spellcasting.ability) : "unknown"} (spell save DC ${spellcasting.dc || "unknown"}, ${spellcasting.mod || "+"} to hit with spell attacks).`;

		out += `<tr><td colspan="6"><div class="rd__b">${spellText}</div></td></tr>`;

		if (spellcasting.spells) {
			Object.entries(spellcasting.spells).forEach(([level, spellData]) => {
				const levelText = level === "0" ? "Cantrips (at will)" : 
					`${Parser.getOrdinalForm(level)} level (${spellData.slots || 0} slots)`;
				
				const spellList = spellData.spells?.map(spell => 
					typeof spell === "string" ? `{@spell ${spell}}` : spell
				) || [];

				const spellText = spellList.length ? renderer.render(spellList.join(", ")) : "";

				out += `<tr><td colspan="6">
					<div class="rd__b">
						<div><b>${levelText}:</b> ${spellText}</div>
					</div>
				</td></tr>`;
			});
		}

		return out;
	}

	_getCommonHtmlParts_traits ({character, renderer}) {
		if (!character.trait?.length) return "";

		let out = `<tr><td class="divider" colspan="6"><div></div></td></tr>`;

		character.trait.forEach(trait => {
			out += `<tr><td colspan="6" class="mon__stat-block-section-head">
				<h3 class="mon__sect-head-inner">${trait.name}</h3>
			</td></tr>
			<tr><td colspan="6">
				<div class="rd__b">
					${renderer.render(trait.entries)}
				</div>
			</td></tr>`;
		});

		return out;
	}

	_getCommonHtmlParts_actions ({character, renderer}) {
		if (!character.action?.length) return "";

		let out = `<tr><td class="divider" colspan="6"><div></div></td></tr>
		<tr><td colspan="6" class="mon__stat-block-section-head">
			<h3 class="mon__sect-head-inner">Actions</h3>
		</td></tr>`;

		character.action.forEach(action => {
			out += `<tr><td colspan="6">
				<div class="rd__b">
					<div><b>${action.name}.</b> ${renderer.render(action.entries)}</div>
				</div>
			</td></tr>`;
		});

		return out;
	}

	_getCommonHtmlParts_equipment ({character, renderer}) {
		if (!character.equipment?.length) return "";

		const equipmentList = character.equipment.map(item => {
			const desc = item.description ? ` (${item.description})` : "";
			return `${item.name}${desc}`;
		}).join(", ");

		return `<tr><td class="divider" colspan="6"><div></div></td></tr>
		<tr><td colspan="6" class="mon__stat-block-section-head">
			<h3 class="mon__sect-head-inner">Equipment</h3>
		</td></tr>
		<tr><td colspan="6">
			<div class="rd__b">${equipmentList}</div>
		</td></tr>`;
	}

	_getCommonHtmlParts_custom ({character, renderer}) {
		if (!character.customText) return "";

		return `<tr><td class="divider" colspan="6"><div></div></td></tr>
		<tr><td colspan="6" class="mon__stat-block-section-head">
			<h3 class="mon__sect-head-inner">Description</h3>
		</td></tr>
		<tr><td colspan="6">
			<div class="rd__b">${renderer.render(character.customText)}</div>
		</td></tr>`;
	}
}

class _RenderCharactersImplClassic extends _RenderCharactersImplBase {
	_style = SITE_STYLE__CLASSIC;

	_getRenderedCharacter ({character, opts, renderer}) {
		const {
			htmlPtIsExcluded,
			htmlPtName,
			htmlPtSizeTypeAlignment,
			htmlPtAc,
			htmlPtHp,
			htmlPtSpeed,
			htmlPtAbilityScores,
			htmlPtSaves,
			htmlPtSkills,
			htmlPtSenses,
			htmlPtLanguages,
			htmlPtSpellcasting,
			htmlPtTraits,
			htmlPtActions,
			htmlPtEquipment,
			htmlPtCustom,
		} = this._getCommonHtmlParts({character, opts, renderer});

		return `<table class="w-100 stats">
			<tr><th class="ve-tbl-border" colspan="6"></th></tr>
			${htmlPtIsExcluded}
			${htmlPtName}
			${htmlPtSizeTypeAlignment}
			<tr><th class="ve-tbl-border" colspan="6"></th></tr>
			<tr>
				<td class="divider" colspan="6"><div></div></td>
			</tr>
			<tr class="text">
				<td colspan="6">
					<strong>Armor Class</strong> ${htmlPtAc}
				</td>
			</tr>
			<tr class="text">
				<td colspan="6">
					<strong>Hit Points</strong> ${htmlPtHp}
				</td>
			</tr>
			<tr class="text">
				<td colspan="6">
					<strong>Speed</strong> ${htmlPtSpeed}
				</td>
			</tr>
			<tr><td class="divider" colspan="6"><div></div></td></tr>
			${htmlPtAbilityScores}
			<tr><td class="divider" colspan="6"><div></div></td></tr>
			<tr class="text">
				<td colspan="6">
					<strong>Saving Throws</strong> ${htmlPtSaves}
				</td>
			</tr>
			<tr class="text">
				<td colspan="6">
					<strong>Skills</strong> ${htmlPtSkills}
				</td>
			</tr>
			<tr class="text">
				<td colspan="6">
					<strong>Passive Perception</strong> ${htmlPtSenses}
				</td>
			</tr>
			<tr class="text">
				<td colspan="6">
					<strong>Languages</strong> ${htmlPtLanguages}
				</td>
			</tr>
			<tr><td class="divider" colspan="6"><div></div></td></tr>
			${htmlPtSpellcasting}
			${htmlPtTraits}
			${htmlPtActions}
			${htmlPtEquipment}
			${htmlPtCustom}
			<tr><th class="ve-tbl-border" colspan="6"></th></tr>
		</table>`;
	}
}

class _RenderCompactCharactersImplClassic {
	/**
	 * @param {object} character
	 * @param {object} [opts]
	 * @param {boolean} [opts.isEmbeddedEntity]
	 * @return {string}
	 */
	getCompactRenderedString (character, opts) {
		opts ||= {};

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

		const alignmentText = character.alignment ? 
			Parser.alignmentListToFull(character.alignment) : 
			"Unknown";

		const acText = character.ac ? 
			character.ac.map(it => `${it.ac}${it.from ? ` (${it.from.join(", ")})` : ""}`).join(", ") : 
			"Unknown";

		const hpText = character.hp ? 
			`${character.hp.average}${character.hp.formula ? ` (${character.hp.formula})` : ""}` : 
			"Unknown";

		const speedText = character.speed ? 
			Object.entries(character.speed)
				.map(([k, v]) => `${k === "walk" ? "" : `${k} `}${v} ft.`)
				.join(", ") : 
			"30 ft.";

		return `
		<div class="ve-flex-col">
			<div class="mb-1">
				<div class="ve-muted ve-small">${raceText} ${classText}</div>
				<div class="ve-muted ve-small">${alignmentText}</div>
			</div>
			<div class="ve-flex-wrap-gap-1">
				<div class="ve-small"><strong>AC</strong> ${acText}</div>
				<div class="ve-small"><strong>HP</strong> ${hpText}</div>
				<div class="ve-small"><strong>Speed</strong> ${speedText}</div>
			</div>
			<div class="ve-flex-wrap-gap-1 mt-1">
				<div class="ve-small"><strong>STR</strong> ${character.str || 10} (${UiUtil.intToBonus(Parser.getAbilityModifier(character.str || 10))})</div>
				<div class="ve-small"><strong>DEX</strong> ${character.dex || 10} (${UiUtil.intToBonus(Parser.getAbilityModifier(character.dex || 10))})</div>
				<div class="ve-small"><strong>CON</strong> ${character.con || 10} (${UiUtil.intToBonus(Parser.getAbilityModifier(character.con || 10))})</div>
				<div class="ve-small"><strong>INT</strong> ${character.int || 10} (${UiUtil.intToBonus(Parser.getAbilityModifier(character.int || 10))})</div>
				<div class="ve-small"><strong>WIS</strong> ${character.wis || 10} (${UiUtil.intToBonus(Parser.getAbilityModifier(character.wis || 10))})</div>
				<div class="ve-small"><strong>CHA</strong> ${character.cha || 10} (${UiUtil.intToBonus(Parser.getAbilityModifier(character.cha || 10))})</div>
			</div>
		</div>`.trim();
	}
}

export class RenderCharacters {
	_RENDER_CLASSIC = new _RenderCharactersImplClassic();
	_RENDER_COMPACT_CLASSIC = new _RenderCompactCharactersImplClassic();

	/**
	 * @param {object} character
	 * @param {object} [opts]
	 * @param {boolean} [opts.isSkipExcludesRender]
	 * @return {HTMLElementExtended}
	 */
	$getRenderedCharacter (character, opts) {
		const styleHint = VetoolsConfig.get("styleSwitcher", "style");
		switch (styleHint) {
			case SITE_STYLE__CLASSIC: return this._RENDER_CLASSIC.getRenderedCharacter(character, opts);
			default: throw new Error(`Unhandled style "${styleHint}"`);
		}
	}

	/**
	 * @param {object} character
	 * @param {object} [opts]
	 * @param {boolean} [opts.isEmbeddedEntity]
	 * @return {string}
	 */
	getCompactRenderedString (character, opts) {
		const styleHint = VetoolsConfig.get("styleSwitcher", "style");
		switch (styleHint) {
			case SITE_STYLE__CLASSIC: return this._RENDER_COMPACT_CLASSIC.getCompactRenderedString(character, opts);
			default: throw new Error(`Unhandled style "${styleHint}"`);
		}
	}

	/**
	 * @param {object} character
	 * @param {object} [opts]
	 * @param {boolean} [opts.isEmbeddedEntity]
	 * @return {string}
	 */
	getEmbeddedEntityRenderedString (character, opts) {
		const styleHint = VetoolsConfig.get("styleSwitcher", "style");
		switch (styleHint) {
			case SITE_STYLE__CLASSIC: return this._RENDER_COMPACT_CLASSIC.getCompactRenderedString(character, opts);
			default: throw new Error(`Unhandled style "${styleHint}"`);
		}
	}

	static async pGetFluff (character) {
		return null;
	}
}

Renderer.character = {
	getCompactRenderedString: (character, opts) => new RenderCharacters().getCompactRenderedString(character, opts),
	getEmbeddedEntityRenderedString: (character, opts) => new RenderCharacters().getEmbeddedEntityRenderedString(character, opts),
	bindListenersCompact: ($content, opts) => {
		// Add any specific event listeners for character compact rendering if needed
		// This is called after rendering compact content to set up interactions
	},
	pGetFluff: async (character) => RenderCharacters.pGetFluff(character),
};
