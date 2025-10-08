import {
	InitiativeTrackerPlayerMessageHandlerV0,
	InitiativeTrackerPlayerMessageHandlerV1,
	InitiativeTrackerPlayerUiV0,
	InitiativeTrackerPlayerUiV1,
} from "./initiativetracker/initiativetracker-player.js";

window.addEventListener("load", async () => {
	await Promise.all([
		PrereleaseUtil.pInit(),
		BrewUtil2.pInit(),
	]);
	ExcludeUtil.pInitialise().then(null); // don't await, as this is only used for search

	const hash = window.location.hash.slice(1);

	const views = new InitTrackerPlayerViews();
	views.init({hash});

	Hist.replaceHistoryHash("");

	window.dispatchEvent(new Event("toolsLoaded"));
});

/// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

class InitTrackerPlayerViews extends BaseComponent {
	constructor () {
		super();

		TabUiUtil.decorate(this, {isInitMeta: true});
	}

	init ({hash}) {
		const {v0: tokenV0, v1: tokenV1} = this.constructor._getTokens({hash});

		const wrpContent = es(`#page-content`).empty();

		const iptTabMetas = [
			new TabUiUtil.TabMeta({name: "Standard", hasBorder: true, hasBackground: true}),
			new TabUiUtil.TabMeta({name: "Manual (Legacy)", hasBorder: true, hasBackground: true}),
		];

		const tabMetas = this._renderTabs(iptTabMetas, {eleParent: wrpContent, additionalClassesWrpHeads: "initp__fullscreen-hidden"});
		const [tabMetaV1, tabMetaV0] = tabMetas;

		const viewV1 = new InitTrackerPlayerViewV1({parent: this});
		const viewV0 = new InitTrackerPlayerViewV0({parent: this});

		viewV1.render({tabMeta: tabMetaV1, token: tokenV1});
		viewV0.render({tabMeta: tabMetaV0, token: tokenV0});
	}

	static _getTokens ({hash}) {
		hash = (hash || "").trim();
		if (!hash) return {v0: null, v1: null};

		if (hash.startsWith("v1:")) return {v0: null, v1: hash.slice(3)};
		if (hash.startsWith("v0:")) return {v0: hash.slice(3), v1: null};
		return {v0: null, v1: hash};
	}
}

/// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

class InitiativeTrackerPlayerMessageHandlerPageV1 extends InitiativeTrackerPlayerMessageHandlerV1 {
	constructor (wrpTab) {
		super(false);
		this._wrpTab = wrpTab;
	}

	initUi () {
		if (this._isUiInit) return;

		this._isUiInit = true;
		this._wrpTab.findAll(`.initp__initial`).forEach(ele => ele.remove());
		this._wrpTab.findAll(`.initp__wrp_active`).forEach(ele => ele.showVe());

		this._eleMeta = this._wrpTab.find(`.initp__meta`);
		this._eleHead = this._wrpTab.find(`.initp__header`);
		this._eleRows = this._wrpTab.find(`.initp__rows`);
	}

	static initUnloadMessage () {
		window.addEventListener("beforeunload", evt => {
			const message = `The connection will be closed`;
			(evt || window.event).message = message;
			return message;
		});
	}
}

/**
 * PeerJS implementation.
 */
class InitTrackerPlayerViewV1 {
	constructor ({parent}) {
		this._parent = parent;
	}

	render ({tabMeta, token}) {
		const view = new InitiativeTrackerPlayerMessageHandlerPageV1(tabMeta.wrpTab);

		const iptPlayerName = ee`<input class="form-control code">`
			.onn("change", () => iptServerToken.removeClass("form-control--error"))
			.disableSpellcheck();

		const iptServerToken = ee`<input class="form-control code">`
			.onn("change", () => iptPlayerName.removeClass("form-control--error"))
			.disableSpellcheck();

		if (token) iptServerToken.val(token);

		const btnConnect = ee`<button class="ve-btn ve-btn-xs ve-btn-primary">Connect</button>`
			.onn("click", async () => {
				if (!iptPlayerName.val().trim()) return iptPlayerName.addClass("form-control--error");
				if (!iptServerToken.val().trim()) return iptServerToken.addClass("form-control--error");

				try {
					btnConnect.attr("disabled", true);
					const ui = new InitiativeTrackerPlayerUiV1(view, iptPlayerName.val(), iptServerToken.val());
					await ui.pInit();
					InitiativeTrackerPlayerMessageHandlerPageV1.initUnloadMessage();
					view.initUi();
				} catch (e) {
					btnConnect.attr("disabled", false);
					throw e;
				}
			});

		ee(tabMeta.wrpTab)`<div class="ve-flex-col initp__content px-2 py-3 min-h-0">
			<div class="initp__initial row">
				<div class="ve-col-12">
					<p>
						The Player View is part of a peer-to-peer (i.e., serverless) system to allow players to connect to a DM's <a href="dmscreen.html">DM Screen</a> initiative tracker. As a player, the usage is as follows:
					<ol>
						<li>Enter a name into the "Player Name" field.</li>
						<li>Paste a "server token," provided by a DM, into the "Server Token" field.</li>
						<li>Click "Connect."</li>
					</ol>
					<p>After a short delay, you should be connected to the DM and this page will change to display the encounter in the DM's tracker. <i>Please note that this system is highly experimental. Your experience may vary.</i></p>
				</div>
			</div>

			<hr class="initp__initial">

			<div class="initp__initial row w-100 ve-flex">
				<div class="ve-col-5 bold mr-4">Player Name</div>
				<div class="ve-col-5 bold">Server Token</div>
				<div class="ve-col-2 ve-text-center"></div>
			</div>
			<div class="initp__initial row w-100 ve-flex mb-4">
				<div class="ve-col-5 bold mr-4">${iptPlayerName}</div>
				<div class="ve-col-5 bold">${iptServerToken}</div>
				<div class="ve-col-2 ve-flex-vh-center">${btnConnect}</div>
			</div>

			<div class="initp__wrp_active">
				<div class="initp__meta"></div>
				<div class="initp__header"></div>
				<div class="initp__rows"></div>
			</div>
		</div>`;

		const body = es(document.body);
		body.onn("keypress", (evt) => {
			if (this._parent._getActiveTab() !== tabMeta) return;

			if (EventUtil.getKeyIgnoreCapsLock(evt) === "f" && EventUtil.noModifierKeys(evt) && !EventUtil.isInInput(evt)) {
				evt.preventDefault();

				if (view.isActive) body.toggleClass("is-fullscreen");
			}
		});
	}
}

/// /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

class InitiativeTrackerPlayerMessageHandlerPageV0 extends InitiativeTrackerPlayerMessageHandlerV0 {
	constructor (wrpTab) {
		super(false);
		this._wrpTab = wrpTab;
	}

	initUi () {
		if (this._isUiInit) return;

		this._isUiInit = true;
		this._wrpTab.findAll(`.initp__initial`).forEach(ele => ele.remove());
		this._wrpTab.findAll(`.initp__wrp_active`).forEach(ele => ele.showVe());

		this._eleMeta = this._wrpTab.find(`.initp__meta`);
		this._eleHead = this._wrpTab.find(`.initp__header`);
		this._eleRows = this._wrpTab.find(`.initp__rows`);

		window.addEventListener("beforeunload", evt => {
			if (this._clientData.client.isActive) {
				const message = `The connection will be closed`;
				(evt || window.event).message = message;
				return message;
			}
		});
	}
}

/**
 * Legacy implementation.
 */
class InitTrackerPlayerViewV0 {
	constructor ({parent}) {
		this._parent = parent;
	}

	render ({tabMeta, token}) {
		const view = new InitiativeTrackerPlayerMessageHandlerPageV0(tabMeta.wrpTab);

		const iptServerToken = ee`<input class="form-control code">`.disableSpellcheck();

		if (token) iptServerToken.val(token);

		const btnGenClientToken = ee`<button class="ve-btn ve-btn-xs ve-btn-primary">Generate Client Token</button>`
			.onn("click", () => dispWarning.remove());

		const iptClientToken = ee`<input class="form-control code copyable" readonly disabled>`.disableSpellcheck();

		const ui = new InitiativeTrackerPlayerUiV0(view, iptServerToken, btnGenClientToken, iptClientToken);
		ui.init();

		const dispWarning = ee`<div class="alert alert-warning my-3">
			<p>Use of &quot;Standard&quot; mode is strongly recommended, as it provides a simplified workflow. If Standard mode is unavailable, &quot;Manual&quot; mode may be used instead.</p>
		</div>`;

		ee(tabMeta.wrpTab)`<div class="ve-flex-col initp__content px-2 py-3 min-h-0">
			${dispWarning}

			<div class="initp__initial ve-flex">
				<div class="ve-col-12">
					<p>
						The Player View is part of a peer-to-peer (i.e., serverless) system to allow players to connect to a DM's DM Screen initiative tracker. As a player, the usage is as follows:
					<ol>
						<li>Paste a "server token," provided by a DM, into the "Server Token" field, and click "Generate Client Token."</li>
						<li>Wait for a token to appear in the "Client Token" field, copy it, and send it to the DM.</li>
					</ol>
					<p>Once the DM accepts your token, this page will change to display the encounter in the DM's tracker.</p>
				</div>
			</div>

			<hr class="initp__initial">

			<div class="initp__initial ve-flex-h-center w-100">
				<div class="ve-col-5 bold">Server Token</div>
				<div class="ve-col-2 ve-text-center"></div>
				<div class="ve-col-5 bold">Client Token</div>
			</div>
			<div class="initp__initial ve-flex-h-center w-100 flex mb-4">
				<div class="ve-col-5 bold">${iptServerToken}</div>
				<div class="ve-col-2 ve-flex-vh-center">${btnGenClientToken}</div>
				<div class="ve-col-5 bold">${iptClientToken}</div>
			</div>

			<div class="initp__wrp_active">
				<div class="initp__meta"></div>
				<div class="initp__header"></div>
				<div class="initp__rows"></div>
			</div>
		</div>`;

		const body = es(document.body);
		body.onn("keypress", (evt) => {
			if (this._parent._getActiveTab() !== tabMeta) return;

			if (EventUtil.getKeyIgnoreCapsLock(evt) === "f" && EventUtil.noModifierKeys(evt) && !EventUtil.isInInput(evt)) {
				evt.preventDefault();

				if (view.isActive) body.toggleClass("is-fullscreen");
			}
		});
	}
}
