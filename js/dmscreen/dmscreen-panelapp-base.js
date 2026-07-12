/** @abstract */
export class DmScreenPanelAppBase {
	static getPanelApp ({board, savedState}) {
		return new this({board, savedState});
	}

	constructor ({board, savedState}) {
		this._board = board;
		this._savedState = savedState;
	}

	/**
	 * @abstract
	 * @return {Object}
	 */
	getState () { throw new Error("Unimplemented!"); }

	getPanelElement () {
		return this._getPanelElement(this._board, this._savedState);
	}

	/**
	 * @abstract
	 * @return {HTMLElementExtended}
	 */
	_getPanelElement (board, state) { throw new Error("Unimplemented!"); }
}
