"use strict";

export class RenderCharacters {
	/**
	 * Calculate total character level from class levels
	 * @param {Object} character - The character data object
	 * @returns {number} Total level
	 */
	static _getCharacterLevel(character) {
		if (!character || !character.class || !Array.isArray(character.class)) {
			return 0;
		}
		return character.class.reduce((total, cls) => {
			return total + (cls.level || 0);
		}, 0);
	}

	static _getModifierText(score) {
		const mod = Math.floor((score - 10) / 2);
		return mod >= 0 ? `+${mod}` : `${mod}`;
	}

	static _getOrdinalSuffix(num) {
		const suffixes = ["th", "st", "nd", "rd"];
		const v = num % 100;
		return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
	}

	static _renderSimpleText(entries) {
		if (!entries) return "";
		if (typeof entries === "string") return entries;
		if (Array.isArray(entries)) {
			return entries.map(entry =>
				typeof entry === "string" ? entry : entry.text || JSON.stringify(entry)
			).join(" ");
		}
		return entries.text || JSON.stringify(entries);
	}
	static $getRenderedCharacter (character) {
		// Use the unified renderer for consistency - return raw HTML
		return Renderer.character.getCompactRenderedString(character);
	}

	static _getRenderedSection_header (character) {
		const raceText = character.race ?
			(character.race.variant ? 
				`Variant {@race ${character.race.name}|${character.race.source || "PHB"}}` : 
				`{@race ${character.race.name}|${character.race.source || "PHB"}}`) :
			"Unknown Race";

		const classText = character.class ?
			character.class.map(cls => {
				const classLink = `{@class ${cls.name}|${cls.source || "PHB"}}`;
				let text = `${classLink} ${cls.level}`;
				if (cls.subclass) {
					const subclassLink = `{@class ${cls.name}|${cls.source || "PHB"}|${cls.subclass.shortName || cls.subclass.name}|${cls.subclass.source || "PHB"}}`;
					text += ` (${subclassLink})`;
				}
				return text;
			}).join(", ") :
			"Unknown Class";

		const alignmentText = character.alignment ?
			(Array.isArray(character.alignment) ? character.alignment.join(" ") : character.alignment) :
			"Unknown";

		const renderer = Renderer.get();
		
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
				<i>Level ${RenderCharacters._getCharacterLevel(character)} ${renderer.render(raceText)} ${renderer.render(classText)}, ${alignmentText}</i>
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
						<td class="ve-text-center">${character.str || 10} (${RenderCharacters._getModifierText(character.str || 10)})</td>
						<td class="ve-text-center">${character.dex || 10} (${RenderCharacters._getModifierText(character.dex || 10)})</td>
						<td class="ve-text-center">${character.con || 10} (${RenderCharacters._getModifierText(character.con || 10)})</td>
						<td class="ve-text-center">${character.int || 10} (${RenderCharacters._getModifierText(character.int || 10)})</td>
						<td class="ve-text-center">${character.wis || 10} (${RenderCharacters._getModifierText(character.wis || 10)})</td>
						<td class="ve-text-center">${character.cha || 10} (${RenderCharacters._getModifierText(character.cha || 10)})</td>
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
					<div>${character.proficiencyBonus || `+${Math.ceil(RenderCharacters._getCharacterLevel(character) / 4) + 1}`}</div>
				</div>
			</td>
		</tr>`;
	}

	static _getRenderedSection_resources (character) {
		if (!character.resources?.length) return "";

		const $out = $$`<tr><td class="divider" colspan="6"><div></div></td></tr>`;

		$out.append($$`<tr>
			<td colspan="6" class="mon__stat-block-section-head">
				<h3 class="mon__sect-head-inner">Resources</h3>
			</td>
		</tr>`);

		character.resources.forEach(resource => {
			$out.append($$`<tr>
				<td colspan="6">
					<div class="ve-flex">
						<div class="ve-flex-v-center mr-2"><b>${resource.name}:</b></div>
						<div>${resource.current}/${resource.max}</div>
					</div>
				</td>
			</tr>`);
		});

		return $out;
	}

	static _getRenderedSection_conditions (character) {
		if (!character.conditions?.length) return "";

		const $out = $$`<tr><td class="divider" colspan="6"><div></div></td></tr>`;

		$out.append($$`<tr>
			<td colspan="6" class="mon__stat-block-section-head">
				<h3 class="mon__sect-head-inner">Conditions</h3>
			</td>
		</tr>`);

		character.conditions.forEach(condition => {
			$out.append($$`<tr>
				<td colspan="6">
					<div class="ve-flex">
						<div class="ve-flex-v-center mr-2"><b>${condition.name}:</b></div>
						<div>${condition.duration || ""}</div>
					</div>
				</td>
			</tr>`);
		});

		return $out;
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
				let levelText;
				if (level === "0") {
					levelText = "Cantrips (at will)";
				} else {
					const slotsUsed = spellData.slotsUsed || 0;
					const totalSlots = spellData.slots || 0;
					const slotDisplay = totalSlots > 0 ? `(${totalSlots - slotsUsed}/${totalSlots} slots)` : `(${totalSlots} slots)`;
					levelText = `${RenderCharacters._getOrdinalSuffix(level)} level ${slotDisplay}`;
				}

				const spellList = spellData.spells?.map(spell =>
					typeof spell === "string" ? spell : spell.name || spell
				).join(", ") || "";

				$out.append($$`<tr>
					<td colspan="6">
						<div class="rd__b">
							<div><b>${levelText}:</b> ${spellList}</div>
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
						${RenderCharacters._renderSimpleText(trait.entries)}
					</div>
				</td>
			</tr>`);
		});

		return $out;
	}

	static _getRenderedSection_actions (character) {
		if (!character.action || !character.action.length) return "";

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
						<div><b>${action.name}.</b> ${RenderCharacters._renderSimpleText(action.entries)}</div>
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
				<div class="rd__b">${RenderCharacters._renderSimpleText(character.customText)}</div>
			</td>
		</tr>`;
	}

	static getCompactRenderedString (character, opts = {}) {
		opts = {...opts};

		const ptLevel = `Level ${RenderCharacters._getCharacterLevel(character) || "?"}`;
		const ptRace = character.race?.name || "Unknown Race";
		const ptClass = character.class?.map(c => {
			let classStr = c.name;
			if (c.subclass && c.subclass.name) {
				classStr += ` (${c.subclass.name})`;
			}
			return classStr;
		}).join("/") || "Unknown Class";

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

	static bindListenersCompact (character, ele) {
		// Bind dice listeners to the element
		if (ele) {
			Renderer.dice.bindOnclickListener(ele);

			// Add character sheet interactivity
			if (Renderer.character._bindCharacterSheetListeners) {
				Renderer.character._bindCharacterSheetListeners(ele);
			}
		}
	}
}

// NOTE: The main character renderer is now in render.js (Renderer.character class)
// This file only provides the legacy RenderCharacters class for backward compatibility
