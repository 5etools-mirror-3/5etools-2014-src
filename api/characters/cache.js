// Simple shared in-memory cache for character blob list metadata.
// This module is intentionally minimal and process-local.

const DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
const TTL = process.env.CHAR_LIST_CACHE_MS ? Number(process.env.CHAR_LIST_CACHE_MS) : DEFAULT_TTL;

let _blobs = null;
let _ts = 0;

export function getCachedBlobs () {
	return { blobs: _blobs, ts: _ts };
}

export function setCachedBlobs (blobs) {
	_blobs = Array.isArray(blobs) ? blobs : [];
	_ts = Date.now();
}

export function isFresh () {
	return _blobs && (Date.now() - _ts) < TTL;
}

export function invalidate () {
	_blobs = null;
	_ts = 0;
}

export function getTs () {
	return _ts;
}

export default { getCachedBlobs, setCachedBlobs, isFresh, invalidate, getTs };
