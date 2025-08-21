"use strict";

export class RenderCharacters {
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
		// Use the comprehensive format from getCompactRenderedString for consistency
		const compactHtml = Renderer.character.getCompactRenderedString(character);
		const $out = $(compactHtml);
		
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
			(Array.isArray(character.alignment) ? character.alignment.join(" ") : character.alignment) :
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
					<div>${character.proficiencyBonus || `+${Math.ceil(character.level / 4) + 1}`}</div>
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

	static bindListenersCompact (character, ele) {
		// Bind dice listeners to the element
		if (ele) {
			Renderer.dice.bindOnclickListener(ele);
		}
	}
}

// Add to Renderer namespace for compatibility
if (typeof Renderer !== "undefined") {
	Renderer.character = {
		$getRenderedCharacter: RenderCharacters.$getRenderedCharacter.bind(RenderCharacters),
		pGetFluff: async (character) => character.fluff || null,
		getCompactRenderedString: (character, {isStatic = false} = {}) => {
			const renderer = Renderer.get().setFirstSection(true);
			const renderStack = [];

			// Header with basic character info
			const ptLevel = character.level || "?";
			const ptRace = character.race?.name || "Unknown Race";
			const ptClass = character.class?.map(c => `${c.name}${c.subclass ? ` (${c.subclass.name})` : ''} ${c.level || ''}`).join(", ") || "Unknown Class";
			const ptBackground = character.background?.name || "Unknown Background";
			const ptAlignment = character.alignment ? Parser.alignmentListToFull(character.alignment) : "Unknown";

			renderStack.push(`
				${Renderer.utils.getNameTr(character, {page: UrlUtil.PG_CHARACTERS})}
				<tr><td colspan="6" class="pb-2 pt-0">
			`);

			// Character header info
			const headerInfo = {
				type: "list",
				style: "list-hang-notitle",
				items: [
					{type: "item", name: "Level:", entry: `${ptLevel} ${ptRace} ${ptClass}`},
					{type: "item", name: "Background:", entry: ptBackground},
					{type: "item", name: "Alignment:", entry: ptAlignment},
				]
			};

			renderer.recursiveRender(headerInfo, renderStack, {depth: 1});

		// Core Stats Section - All 6 Ability Scores
		const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
		const abilityRows = [];
		abilities.forEach(ab => {
			const score = character[ab] || 10; // Default to 10 if not specified
			const modifier = Parser.getAbilityModifier(score);
			const modValue = typeof modifier === 'number' ? modifier : parseInt(modifier) || 0;
			const modStr = modValue >= 0 ? `+${modValue}` : `${modValue}`;
			const saveBonus = character.save?.[ab] || modStr;
			abilityRows.push(`<span class="ability-score rollable" data-roll="1d20${modStr}" data-name="${ab.toUpperCase()} Check" title="Click to roll ${ab.toUpperCase()} check"><strong>${ab.toUpperCase()}</strong> ${score} (${modStr})</span>`);
		});
		
		renderStack.push(`<div class="character-abilities mt-2">`);
		renderStack.push(`<p><strong>Ability Scores:</strong><br>${abilityRows.join(' | ')}</p>`);
		renderStack.push(`</div>`);

		// All Saving Throws
		const savingThrows = [];
		abilities.forEach(ab => {
			const score = character[ab] || 10;
			const modifier = Parser.getAbilityModifier(score);
			const modValue = typeof modifier === 'number' ? modifier : parseInt(modifier) || 0;
			const saveBonus = character.save?.[ab];
			let finalBonus = modValue;
			
			if (saveBonus) {
				finalBonus = typeof saveBonus === 'string' ? parseInt(saveBonus) || modValue : saveBonus;
			}
			
			const finalStr = finalBonus >= 0 ? `+${finalBonus}` : `${finalBonus}`;
			const isProficient = character.save?.[ab] ? ' (Prof)' : '';
			savingThrows.push(`<span class="rollable" data-roll="1d20${finalStr}" data-name="${ab.toUpperCase()} Save" title="Click to roll ${ab.toUpperCase()} saving throw">${ab.toUpperCase()} ${finalStr}${isProficient}</span>`);
		});

		const saveInfo = {
			type: "entries",
			entries: [`<p><strong>Saving Throws:</strong> ${savingThrows.join(' | ')}</p>`]
		};
		renderer.recursiveRender(saveInfo, renderStack, {depth: 1});			// Combat Stats
			const combatStats = [];
			if (character.ac) {
				const acValue = Array.isArray(character.ac) ? character.ac[0].ac : character.ac;
				const acSource = Array.isArray(character.ac) && character.ac[0].from ? ` (${character.ac[0].from.join(', ')})` : '';
				combatStats.push(`<strong>AC:</strong> ${acValue}${acSource}`);
			}
			
			if (character.hp) {
				const hp = character.hp;
				const currentHp = hp.current != null ? hp.current : hp.average || hp.max || "?";
				const maxHp = hp.max || hp.average || "?";
				const tempHp = hp.temp || 0;
				combatStats.push(`<strong>HP:</strong> ${currentHp}/${maxHp}${tempHp > 0 ? ` (+${tempHp} temp)` : ''}`);
				if (hp.formula) combatStats.push(`<em>Hit Dice: ${hp.formula}</em>`);
			}
			
			if (character.speed) {
				const speeds = [];
				Object.entries(character.speed).forEach(([type, value]) => {
					speeds.push(`${type === 'walk' ? '' : type + ' '}${value} ft.`);
				});
				combatStats.push(`<strong>Speed:</strong> ${speeds.join(', ')}`);
			}

			if (character.proficiencyBonus) {
				combatStats.push(`<strong>Proficiency Bonus:</strong> ${character.proficiencyBonus}`);
			}

			if (combatStats.length) {
				const combatInfo = {
					type: "entries",
					entries: [`<p>${combatStats.join('<br>')}</p>`]
				};
				renderer.recursiveRender(combatInfo, renderStack, {depth: 1});
			}

		// All Skills (standard D&D 5e skills)
		const allSkills = {
			'Acrobatics': 'dex', 'Animal Handling': 'wis', 'Arcana': 'int', 'Athletics': 'str',
			'Deception': 'cha', 'History': 'int', 'Insight': 'wis', 'Intimidation': 'cha',
			'Investigation': 'int', 'Medicine': 'wis', 'Nature': 'int', 'Perception': 'wis',
			'Performance': 'cha', 'Persuasion': 'cha', 'Religion': 'int', 'Sleight of Hand': 'dex',
			'Stealth': 'dex', 'Survival': 'wis'
		};

		const skillEntries = [];
		Object.entries(allSkills).forEach(([skillName, ability]) => {
			const abilityScore = character[ability] || 10;
			const abilityMod = Parser.getAbilityModifier(abilityScore);
			const modValue = typeof abilityMod === 'number' ? abilityMod : parseInt(abilityMod) || 0;
			
			// Check if character has this skill trained
			const skillKey = skillName.toLowerCase().replace(/\s+/g, '');
			const customBonus = character.skill?.[skillKey] || character.skill?.[skillName];
			
			let finalBonus = modValue;
			let isProficient = '';
			
			if (customBonus) {
				finalBonus = typeof customBonus === 'string' ? parseInt(customBonus) || modValue : customBonus;
				isProficient = ' (Prof)';
			}
			
			const finalStr = finalBonus >= 0 ? `+${finalBonus}` : `${finalBonus}`;
			skillEntries.push(`<span class="rollable skill-item" data-roll="1d20${finalStr}" data-name="${skillName} Check" title="Click to roll ${skillName} (${ability.toUpperCase()})">${skillName} ${finalStr}${isProficient}</span>`);
		});
		
		// Group skills by category for better organization
		const skillsByCategory = {
			"Physical": ["Athletics", "Acrobatics", "Sleight of Hand", "Stealth"],
			"Mental": ["Arcana", "History", "Investigation", "Nature", "Religion"],
			"Wisdom": ["Animal Handling", "Insight", "Medicine", "Perception", "Survival"],
			"Social": ["Deception", "Intimidation", "Performance", "Persuasion"]
		};

		const skillInfo = {type: "entries", name: "Skills", entries: []};
		
		Object.entries(skillsByCategory).forEach(([category, categorySkills]) => {
			const categoryEntries = categorySkills.map(skillName => {
				return skillEntries.find(entry => entry.includes(`>${skillName} `));
			}).filter(Boolean);
			
			if (categoryEntries.length) {
				skillInfo.entries.push(`<p><strong>${category}:</strong><br>${categoryEntries.join(' | ')}</p>`);
			}
		});
		
		renderer.recursiveRender(skillInfo, renderStack, {depth: 1});

		// Languages & Passive Perception
		const miscInfo = [];
		if (character.languages?.length) {
			miscInfo.push(`<strong>Languages:</strong> ${character.languages.join(', ')}`);
		}
		if (character.passive) {
			miscInfo.push(`<strong>Passive Perception:</strong> ${character.passive}`);
		} else {
			// Calculate passive perception if not provided
			const wisScore = character.wis || 10;
			const wisMod = Parser.getAbilityModifier(wisScore);
			const wisModValue = typeof wisMod === 'number' ? wisMod : parseInt(wisMod) || 0;
			const perceptionBonus = character.skill?.perception || wisModValue;
			const perceptionValue = typeof perceptionBonus === 'number' ? perceptionBonus : parseInt(perceptionBonus) || wisModValue;
			const passivePerception = 10 + perceptionValue;
			miscInfo.push(`<strong>Passive Perception:</strong> ${passivePerception}`);
		}
		if (miscInfo.length) {
			const miscInfoObj = {
				type: "entries",
				entries: [`<p>${miscInfo.join('<br>')}</p>`]
			};
			renderer.recursiveRender(miscInfoObj, renderStack, {depth: 1});
		}

			// Spellcasting
			if (character.spellcasting) {
				const sc = character.spellcasting;
				const spellInfo = {
					type: "entries",
					name: "Spellcasting",
					entries: [
						`<p><strong>Spell Save DC:</strong> ${sc.dc} | <strong>Spell Attack Bonus:</strong> ${sc.mod}</p>`
					]
				};
				
				if (sc.spells) {
					const spellLevels = [];
					Object.entries(sc.spells).forEach(([level, spellData]) => {
						const levelName = level === "0" ? "Cantrips" : `Level ${level}`;
						const slots = spellData.slots ? ` (${spellData.slotsUsed || 0}/${spellData.slots} slots used)` : '';
						spellLevels.push(`<strong>${levelName}${slots}:</strong> ${spellData.spells.join(', ')}`);
					});
					spellInfo.entries.push(`<p>${spellLevels.join('<br>')}</p>`);
				}
				
				renderer.recursiveRender(spellInfo, renderStack, {depth: 1});
			}

			// Actions
			if (character.action?.length) {
				const actionInfo = {
					type: "entries",
					name: "Actions",
					entries: []
				};
				
				character.action.forEach(action => {
					actionInfo.entries.push({
						type: "entries",
						name: action.name,
						entries: action.entries
					});
				});
				
				renderer.recursiveRender(actionInfo, renderStack, {depth: 1});
			}

			// Traits/Features
			if (character.trait?.length) {
				const traitInfo = {
					type: "entries",
					name: "Features & Traits",
					entries: []
				};
				
				character.trait.forEach(trait => {
					traitInfo.entries.push({
						type: "entries",
						name: trait.name,
						entries: trait.entries
					});
				});
				
				renderer.recursiveRender(traitInfo, renderStack, {depth: 1});
			}

			// Equipment
			if (character.equipment?.length) {
				const equipInfo = {
					type: "entries",
					name: "Equipment",
					entries: []
				};
				
				const equipped = character.equipment.filter(item => item.equipped);
				const other = character.equipment.filter(item => !item.equipped);
				
				if (equipped.length) {
					const equippedList = {
						type: "list",
						name: "Equipped",
						items: equipped.map(item => {
							const qty = item.quantity ? ` (${item.quantity})` : '';
							const desc = item.description ? ` - ${item.description}` : '';
							return `${item.name}${qty}${desc}`;
						})
					};
					equipInfo.entries.push(equippedList);
				}
				
				if (other.length) {
					const otherList = {
						type: "list", 
						name: "Other Equipment",
						items: other.map(item => {
							const qty = item.quantity ? ` (${item.quantity})` : '';
							const desc = item.description ? ` - ${item.description}` : '';
							return `${item.name}${qty}${desc}`;
						})
					};
					equipInfo.entries.push(otherList);
				}
				
				renderer.recursiveRender(equipInfo, renderStack, {depth: 1});
			}

			// Resources (Hit Dice, Inspiration, etc.)
			if (character.resources?.length) {
				const resourceInfo = {
					type: "entries",
					name: "Resources",
					entries: [`<p>${character.resources.map(resource => `<strong>${resource.name}:</strong> ${resource.current}/${resource.max}`).join('<br>')}</p>`]
				};
				renderer.recursiveRender(resourceInfo, renderStack, {depth: 1});
			}

			// Conditions
			if (character.conditions?.length) {
				const conditionInfo = {
					type: "entries",
					name: "Current Conditions",
					entries: [`<p>${character.conditions.map(condition => {
						const duration = condition.duration ? ` (${condition.duration})` : '';
						return `<strong>${condition.name}${duration}</strong>`;
					}).join('<br>')}</p>`]
				};
				renderer.recursiveRender(conditionInfo, renderStack, {depth: 1});
			}

			// Custom description
			if (character.customText) {
				const customInfo = {
					type: "entries",
					name: "Description", 
					entries: [character.customText]
				};
				renderer.recursiveRender(customInfo, renderStack, {depth: 1});
			}

			// Fluff entries
			if (character.fluff?.entries?.length) {
				const fluffInfo = {
					type: "entries",
					name: "Background",
					entries: character.fluff.entries
				};
				renderer.recursiveRender(fluffInfo, renderStack, {depth: 1});
			}

			// Character entries
			if (character.entries) {
				renderer.recursiveRender({entries: character.entries}, renderStack, {depth: 1});
			}

			renderStack.push(`</td></tr>`);
			if (character.source) renderStack.push(Renderer.utils.getPageTr(character));
			
			return renderStack.join("");
		},

		// Add dice rolling functionality
		bindCharacterDiceRolling: ($characterElement) => {
			$characterElement.find('.rollable').click(function(e) {
				e.preventDefault();
				e.stopPropagation();
				
				const $this = $(this);
				const diceExpression = $this.attr('data-roll');
				const rollName = $this.attr('data-name') || 'Roll';
				
				if (diceExpression && Renderer.dice) {
					// Create packed dice data for the dice system
					const packedData = {
						toRoll: diceExpression,
						name: rollName,
						prompt: {
							entry: `Rolling ${rollName}`,
							mode: "dice"
						}
					};
					
					// Create a fake element with the packed dice data
					const $fakeElement = $('<span>').attr('data-packed-dice', JSON.stringify(packedData));
					
					// Use the existing dice roller system
					Renderer.dice.pRollerClickUseData(e, $fakeElement[0]).then(null);
				}
			});
		},

		bindListenersCompact: (character, ele) => {
			// Use the class method
			RenderCharacters.bindListenersCompact(character, ele);
		},
	};
}
