import {ConfigSettingsGroup} from "./util-config-settings-group.js";
import {ConfigSettingBoolean, ConfigSettingEnum, ConfigSettingExternal, ConfigSettingNumber} from "./utils-config-setting-base.js";
import {SITE_STYLE__CLASSIC, SITE_STYLE_DISPLAY} from "../consts.js";
import {StyleSwitcher} from "../styleswitch.js";
import { M } from "../../lib/dice-box-assets/Dice.js";

const settingsGroupStyleSwitcher = new ConfigSettingsGroup({
	groupId: "styleSwitcher",
	name: "Appearance",
	configSettings: [
		new (
			class extends ConfigSettingExternal {
				_configId = "theme";
				_name = "Theme";
				_help = "The color theme to be applied.";
				_isRowLabel = true;

				_getEleExternal () { return StyleSwitcher.getSelStyle(); }
			}
		)(),
		new ConfigSettingEnum({
			configId: "style",
			name: "Style",
			help: `The styling to be applied when rendering specific information (stat blocks, etc.).`,
			isRowLabel: true,
			isReloadRequired: true,
			default: SITE_STYLE__CLASSIC,
			values: [
				SITE_STYLE__CLASSIC,
			],
			fnDisplay: it => SITE_STYLE_DISPLAY[it] || it,
		}),
		new (
			class extends ConfigSettingExternal {
				_configId = "isWideMode";
				_name = "Wide Mode (Experimental)";
				_help = "This feature is unsupported. Expect bugs.";
				_isRowLabel = true;

				_getEleExternal () { return StyleSwitcher.getCbWide(); }
			}
		)(),
	],
});

const _MARKDOWN_TAG_RENDER_MODES = {
	"convertMarkdown": "Convert to Markdown",
	"ignore": "Leave As-Is",
	"convertText": "Convert to Text",
};

const settingsGroupMarkdown = new ConfigSettingsGroup({
	groupId: "markdown",
	name: "Markdown",
	configSettings: [
		new ConfigSettingEnum({
			configId: "tagRenderMode",
			name: `Tag Handling (<code>@tag</code>)`,
			help: `The output to produce when rendering a 5etools "@tag".`,
			isRowLabel: true,
			default: "convertMarkdown",
			values: [
				"convertMarkdown",
				"ignore",
				"convertText",
			],
			fnDisplay: it => _MARKDOWN_TAG_RENDER_MODES[it] || it,
		}),
		new ConfigSettingBoolean({
			configId: "isAddColumnBreaks",
			name: `Add GM Binder Column Breaks (<code>\\\\columnbreak</code>)`,
			help: `If "\\\\columnbreak"s should be added to exported Markdown, at an approximate column breakpoint.`,
			isRowLabel: true,
			default: false,
		}),
		new ConfigSettingBoolean({
			configId: "isAddPageBreaks",
			name: `Add GM Binder Page Breaks (<code>\\\\pagebreak</code>)`,
			help: `If "\\\\pagebreak"s should be added to exported Markdown, at an approximate page breakpoint.`,
			isRowLabel: true,
			default: false,
		}),
	],
});

const _DICE_THEME_OPTIONS = {
	"default": "Default",
	"blueGreenMetal": "Blue Green Metal",
	"diceOfRolling": "Dice of Rolling",
	"diceOfRolling-fate": "Dice of Rolling - Fate",
	"gemstone": "Gemstone",
	"rock": "Rock",
	"rust": "Rust",
	"wooden": "Wooden",
};

const DICE_THEME_OPTIONS = [
	"default",
	"blueGreenMetal",
	"diceOfRolling",
	"diceOfRolling-fate",
	"gemstone",
	"rock",
	"rust",
	"wooden",
];
const settingsGroupDice = new ConfigSettingsGroup({
	groupId: "dice",
	name: "Dice Rolling (reload page to apply changes)",
	configSettings: [
		new ConfigSettingBoolean({
			configId: "enable3dDice",
			name: "Enable 3D Dice",
			help: "Use 3D animated dice for rolling instead of text results. Powered by dice-box library.",
			isRowLabel: true,
			default: true,
		}),
		new ConfigSettingEnum({
			configId: "theme3d",
			name: "Dice Theme",
			help: "The visual theme to use for 3D dice. Only applies when 3D dice are enabled.",
			isRowLabel: true,
			default: DICE_THEME_OPTIONS[Math.floor(Math.random() * DICE_THEME_OPTIONS.length)],
			values: DICE_THEME_OPTIONS,
			fnDisplay: it => _DICE_THEME_OPTIONS[it] || it,
		}),
		new ConfigSettingEnum({
			configId: "throwForce",
			name: "3D Dice Throw Force",
			help: "The force applied to dice when thrown.",
			isRowLabel: true,
			default: 8,
			values: [1, 4, 8, 12, 20, 100, 1000000],
			fnDisplay: it => {
				const L = {
					1: "Just Drop them",
					4: "Soft",
					8: "Normal",
					12: "Hard",
					40: "Strong",
					100: "Sam's normal throw",
					1000000: "Throw onto the floor",
				};
				return `${L[it] || it} (${it})`;
			},
		}),
	],
});

export const SETTINGS_GROUPS = [
	settingsGroupStyleSwitcher,
	settingsGroupMarkdown,
	settingsGroupDice,
];
