import "../../../js/parser.js";
import "../../../js/utils.js";
import "../../../js/utils-dataloader.js";
import "../../../js/utils-config.js";
import "../../../js/render.js";
import "../../../js/render-dice.js";
import {ItemTag, TagJsons} from "../../../js/converter/converterutils-entries.js";
import {ActionTag, TagCondition} from "../../../js/converter/converterutils-tags.js";
import {loadSpells, setUp, teardown} from "../../../node/util-tag-jsons.js";

beforeAll(async () => {
	setUp();
	try {
		await TagJsons.pInit({
			spells: loadSpells(),
		});
	} finally {
		teardown();
	}
});

describe.each(["mutTagObject", "mutTagObjectStrictCapsWords"])("method=%s", method => {
	it.each([false, true])("Avoid tagging metadata (isWrapped=%s)", isWrapped => {
		const ent = {
			name: "Darkvision",
			source: "PHB",
			reprintedAs: ["Darkvision"],
			srd: "Darkvision",
			srd52: "Darkvision",
		};
		const entity = MiscUtil.copyFast(ent);
		const json = isWrapped ? {spell: [entity]} : entity;

		TagJsons[method](json, {styleHint: "classic"});

		expect(entity).toEqual(ent);
	});
});

describe("Tagging flow", () => {
	it("Match spell references before matching senses", () => {
		const input = {entries: ["The creature casts Darkvision. It has Darkvision out to 60 feet."]};

		TagJsons.mutTagObject(input, {styleHint: "classic"});

		expect(input.entries).toEqual(["The creature casts {@spell Darkvision}. It has {@sense Darkvision} out to 60 feet."]);
	});
});

// TODO(Future) factor out with `TagCondition`
describe("TagCondition: Context matching", () => {
	it.each([
		["prone to trouble and petrified wood", "prone to trouble and petrified wood"],
		["invisible stalker and poisoned food", "invisible stalker and poisoned food"],
		["invisible stalkers and poisoned weapons", "invisible stalkers and poisoned weapons"],

		["knocked prone and poisoned", "knocked {@condition prone} and {@condition poisoned}"],

		["{@condition prone} to trouble and {@condition petrified} wood", "{@condition prone} to trouble and {@condition petrified} wood"],

		["prone to trouble and petrified of petrified wood", "prone to trouble and petrified of petrified wood"],
		["prone to trouble and petrified by petrified wood", "prone to trouble and {@condition petrified} by petrified wood"],
	])("Avoids over-tagging in standard mode (input=%s)", (input, expected) => {
		expect(TagCondition.tryRun(input, {styleHint: "classic"})).toBe(expected);
	});
});

// TODO(Future) factor out with `ActionTag`
describe.each(["classic"])("ActionTag: Strict action tagging (styleHint=%s)", styleHint => {
	const source = "";

	it("Tags using expected edition", () => {
		expect(ActionTag.tryRunStrictCapsWords("take the Dash action", {styleHint})).toBe(`take the {@action Dash${source}} action`);
	});

	it.each(["Attack or damage roll", "Attack and damage rolls"])(`Avoids bad "Attack" tags (input=%s)`, input => {
		expect(ActionTag.tryRunStrictCapsWords(input, {styleHint})).toBe(input);
	});

	it("Tags plural opportunity attacks", () => {
		expect(ActionTag.tryRunStrictCapsWords("several Opportunity Attacks are made", {styleHint}))
			.toBe(`several {@action Opportunity Attack|${styleHint === "one" ? "XPHB" : ""}|Opportunity Attacks} are made`);
	});
});

// TODO(Future) factor out with `ItemTag`
describe.each(["classic"])("ItemTag: Name matching (styleHint=%s)", styleHint => {
	const source = "";

	it.each([
		"Horn of Valhalla, Brass",
		"Instrument of the Bards, Cli Lyre",
		"Armor of Vulnerability (Bludgeoning)",
		"+1 Battleaxe",
	])("Tags complete item names once (input=%s)", input => {
		const expected = `{@item ${input}${source}}`;

		expect(ItemTag.tryRun(input, {styleHint})).toBe(expected);
		expect(ItemTag.tryRun(expected, {styleHint})).toBe(expected);
	});

	it("Tags tools", () => {
		const sourceTool = "PHB";

		expect(ItemTag.tryRun("Thieves' Tools and a Staff of Healing", {styleHint}))
			.toBe(`{@item Thieves' Tools|${sourceTool}} and a {@item Staff of Healing${source}}`);
	});
});
