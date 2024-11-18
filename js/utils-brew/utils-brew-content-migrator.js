export class BrewDocContentMigrator {
	static mutMakeCompatible (json) {
		this._mutMakeCompatible_item(json);
		this._mutMakeCompatible_race(json);
		this._mutMakeCompatible_monster(json);
		this._mutMakeCompatible_trap(json);
		this._mutMakeCompatible_object(json);
	}

	/* ----- */

	static _mutMakeCompatible_item (json) {
		if (!json.variant) return false;

		// 2022-07-09
		json.magicvariant = json.variant;
		delete json.variant;
	}

	/* ----- */

	static _mutMakeCompatible_race (json) {
		if (!json.subrace) return false;

		json.subrace.forEach(sr => {
			if (!sr.race) return;
			sr.raceName = sr.race.name;
			sr.raceSource = sr.race.source || sr.source || Parser.SRC_PHB;
		});
	}

	/* ----- */

	static _mutMakeCompatible_monster (json) {
		if (!json.monster) return false;

		json.monster.forEach(mon => {
			// 2022-03-22
			if (typeof mon.size === "string") mon.size = [mon.size];

			// 2022=05-29
			if (mon.summonedBySpell && !mon.summonedBySpellLevel) mon.summonedBySpellLevel = 1;
		});
	}

	/* ----- */

	static _mutMakeCompatible_trap (json) {
		if (!json.trap) return false;

		json.trap.forEach(ent => {
			// 2024-11-13
			if (ent.rating) return;

			if (!ent.tier && !ent.level && !ent.threat) return;

			ent.rating = [
				{
					tier: ent.tier,
					level: ent.level,
					threat: ent.threat,
				},
			];
			delete ent.tier;
			delete ent.level;
			delete ent.threat;
		});
	}

	/* ----- */

	static _mutMakeCompatible_object (json) {
		if (!json.object) return false;

		json.object.forEach(obj => {
			// 2023-10-07
			if (typeof obj.size === "string") obj.size = [obj.size];
		});
	}
}
