"use strict";

export class RenderCharacters {
	static $getRenderedCharacter (character) {
		const $out = $$`<table class="w-100 stats"><tbody></tbody></table>`;
		const $tbody = $out.find(`tbody`);

		$tbody.append(RenderCharacters._getRenderedSection_header(character));
		$tbody.append(RenderCharacters._getRenderedSection_stats(character));
		if (character.spellcasting) $tbody.append(RenderCharacters._getRenderedSection_spells(character));
		$tbody.append(RenderCharacters._getRenderedSection_traits(character));
		$tbody.append(RenderCharacters._getRenderedSection_actions(character));
		if (character.equipment?.length) $tbody.append(RenderCharacters._getRenderedSection_equipment(character));
		if (character.customText) $tbody.append(RenderCharacters._getRenderedSection_customText(character));

		return $out;
	}

	static _getRenderedSection_header (character) {
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

		return $$`<tr>
			<th class="ve-tbl-border" colspan="6"></th>
		</tr>
		<tr>
			<th class="stats-name" colspan="6">
				<div class="stats-name-page">
					<span class="stats-name">${character.name}</span>
					<span class="stats-source source${character.source}" title="${Parser.sourceJsonToFull(character.source)}">${Parser.sourceJsonToAbv(character.source)}</span>
				</div>
			</th>
		</tr>
		<tr>
			<td colspan="6" class="stats-size-type-alignment">
				<i>Level ${character.level} ${raceText} ${classText}, ${alignmentText}</i>
			</td>
		</tr>`;
	}

	static _getRenderedSection_stats (character) {
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

		const saveText = character.save ? 
			Object.entries(character.save)
				.map(([k, v]) => `${StrUtil.uppercaseFirst(k)} ${v}`)
				.join(", ") : 
			"—";

		const skillText = character.skill ? 
			Object.entries(character.skill)
				.map(([k, v]) => `${StrUtil.toTitleCase(k)} ${v}`)
				.join(", ") : 
			"—";

		const languageText = character.languages?.length ? 
			character.languages.join(", ") : 
			"—";

		return $$`<tr>
			<td colspan="6">
				<table class="summary stripe-odd-table">
					<tr>
						<th class="ve-col-2 ve-text-center">Armor Class</th>
						<th class="ve-col-2 ve-text-center">Hit Points</th>
						<th class="ve-col-2 ve-text-center">Speed</th>
					</tr>
					<tr>
						<td class="ve-text-center">${acText}</td>
						<td class="ve-text-center">${hpText}</td>
						<td class="ve-text-center">${speedText}</td>
					</tr>
				</table>
			</td>
		</tr>
		<tr>
			<td colspan="6">
				<table class="summary stripe-odd-table">
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
			</td>
		</tr>
		<tr>
			<td colspan="6">
				<div class="ve-flex">
					<div class="ve-flex-v-center mr-2"><b>Saving Throws:</b></div>
					<div>${saveText}</div>
				</div>
			</td>
		</tr>
		<tr>
			<td colspan="6">
				<div class="ve-flex">
					<div class="ve-flex-v-center mr-2"><b>Skills:</b></div>
					<div>${skillText}</div>
				</div>
			</td>
		</tr>
		<tr>
			<td colspan="6">
				<div class="ve-flex">
					<div class="ve-flex-v-center mr-2"><b>Passive Perception:</b></div>
					<div>${character.passive || 10}</div>
				</div>
			</td>
		</tr>
		<tr>
			<td colspan="6">
				<div class="ve-flex">
					<div class="ve-flex-v-center mr-2"><b>Languages:</b></div>
					<div>${languageText}</div>
				</div>
			</td>
		</tr>
		<tr>
			<td colspan="6">
				<div class="ve-flex">
					<div class="ve-flex-v-center mr-2"><b>Proficiency Bonus:</b></div>
					<div>${character.proficiencyBonus || `+${Math.ceil(character.level / 4) + 1}`}</div>
				</div>
			</td>
		</tr>`;
	}

	static _getRenderedSection_spells (character) {
		if (!character.spellcasting) return "";

		const spellcasting = character.spellcasting;
		const $out = $$`<tr><td class="divider" colspan="6"><div></div></td></tr>`;

		$out.append($$`<tr>
			<td colspan="6" class="mon__stat-block-section-head">
				<h3 class="mon__sect-head-inner">Spellcasting</h3>
			</td>
		</tr>`);

		const spellText = `The character is a ${spellcasting.level}${Parser.getOrdinalForm(spellcasting.level)}-level spellcaster. Its spellcasting ability is ${spellcasting.ability ? StrUtil.uppercaseFirst(spellcasting.ability) : "unknown"} (spell save DC ${spellcasting.dc || "unknown"}, ${spellcasting.mod || "+"} to hit with spell attacks).`;

		$out.append($$`<tr>
			<td colspan="6">
				<div class="rd__b">${spellText}</div>
			</td>
		</tr>`);

		if (spellcasting.spells) {
			Object.entries(spellcasting.spells).forEach(([level, spellData]) => {
				const levelText = level === "0" ? "Cantrips (at will)" : 
					`${Parser.getOrdinalForm(level)} level (${spellData.slots || 0} slots)`;
				
				const spellList = spellData.spells?.map(spell => 
					typeof spell === "string" ? `{@spell ${spell}}` : spell
				).join(", ") || "";

				$out.append($$`<tr>
					<td colspan="6">
						<div class="rd__b">
							<div><b>${levelText}:</b> ${Renderer.get().render(spellList)}</div>
						</div>
					</td>
				</tr>`);
			});
		}

		return $out;
	}

	static _getRenderedSection_traits (character) {
		if (!character.trait?.length) return "";

		const $out = $$`<tr><td class="divider" colspan="6"><div></div></td></tr>`;

		character.trait.forEach(trait => {
			$out.append($$`<tr>
				<td colspan="6" class="mon__stat-block-section-head">
					<h3 class="mon__sect-head-inner">${trait.name}</h3>
				</td>
			</tr>
			<tr>
				<td colspan="6">
					<div class="rd__b">
						${Renderer.get().render(trait.entries)}
					</div>
				</td>
			</tr>`);
		});

		return $out;
	}

	static _getRenderedSection_actions (character) {
		if (!character.action?.length) return "";

		const $out = $$`<tr><td class="divider" colspan="6"><div></div></td></tr>
		<tr>
			<td colspan="6" class="mon__stat-block-section-head">
				<h3 class="mon__sect-head-inner">Actions</h3>
			</td>
		</tr>`;

		character.action.forEach(action => {
			$out.append($$`<tr>
				<td colspan="6">
					<div class="rd__b">
						<div><b>${action.name}.</b> ${Renderer.get().render(action.entries)}</div>
					</div>
				</td>
			</tr>`);
		});

		return $out;
	}

	static _getRenderedSection_equipment (character) {
		if (!character.equipment?.length) return "";

		const $out = $$`<tr><td class="divider" colspan="6"><div></div></td></tr>
		<tr>
			<td colspan="6" class="mon__stat-block-section-head">
				<h3 class="mon__sect-head-inner">Equipment</h3>
			</td>
		</tr>`;

		const equipmentList = character.equipment.map(item => {
			const desc = item.description ? ` (${item.description})` : "";
			return `${item.name}${desc}`;
		}).join(", ");

		$out.append($$`<tr>
			<td colspan="6">
				<div class="rd__b">${equipmentList}</div>
			</td>
		</tr>`);

		return $out;
	}

	static _getRenderedSection_customText (character) {
		if (!character.customText) return "";

		return $$`<tr><td class="divider" colspan="6"><div></div></td></tr>
		<tr>
			<td colspan="6" class="mon__stat-block-section-head">
				<h3 class="mon__sect-head-inner">Description</h3>
			</td>
		</tr>
		<tr>
			<td colspan="6">
				<div class="rd__b">${Renderer.get().render(character.customText)}</div>
			</td>
		</tr>`;
	}

	static getCompactRenderedString (character, opts = {}) {
		opts = {...opts};

		const ptLevel = `Level ${character.level || "?"}`;
		const ptRace = character.race?.name || "Unknown Race";
		const ptClass = character.class?.map(c => c.name).join("/") || "Unknown Class";

		const renderer = Renderer.get();
		
		const renderStack = [];
		renderStack.push(`<div class="ve-flex-col h-100 min-h-0">`);
		renderStack.push(`<div class="split-v-center">`);
		renderStack.push(`<div class="mr-auto"><span class="stats-name">${character.name}</span></div>`);
		renderStack.push(`<div class="ve-flex-v-center"><span class="stats-source source${character.source || ""}">${Parser.sourceJsonToAbv(character.source || "")}</span></div>`);
		renderStack.push(`</div>`);
		renderStack.push(`<div class="mb-1"><i>${ptLevel} ${ptRace} ${ptClass}</i></div>`);
		
		if (character.customText) {
			renderStack.push(`<div class="mb-2">${renderer.render({entries: [character.customText]}, 1)}</div>`);
		}

		renderStack.push(`</div>`);
		
		return renderStack.join("");
	}

	static bindListenersCompact (character) {
		// No special listeners needed for character compact view
	}
}

if (typeof module !== "undefined") {
	module.exports = {
		RenderCharacters,
	};
}

// Add to Renderer namespace for compatibility
if (typeof Renderer !== "undefined") {
	Renderer.character = {
		$getRenderedCharacter: RenderCharacters.$getRenderedCharacter.bind(RenderCharacters),
		pGetFluff: async (character) => character.fluff || null,
	};
}