// Wipes any state NetScope's own origin might be holding — cookies,
// localStorage, sessionStorage — before a "Re-scan"/"Re-ping" so each click
// starts from a clean slate. NetScope doesn't set any of these today (no
// auth, no analytics), so this is normally a no-op; it's here so a rescan
// stays guaranteed-clean even if that ever changes, without anyone having to
// remember to update this call site too.
//
// Note on THIRD-PARTY cookies (ipwho.is, geojs.io, google.com, ...): a page
// cannot read or delete another origin's cookies — that's the browser's
// same-origin policy, not something JavaScript can bypass. There's nothing
// to clear there because there's nothing to begin with: every fetch in
// networkInfo.js and ping.js is sent with `credentials: 'omit'`, so the
// browser never sends this site's cookie jar to those domains and never
// stores anything they try to set in return.
export function clearLocalTraces() {
	try {
		localStorage.clear();
	} catch {
		// Storage can be unavailable (e.g. Safari private mode) — non-fatal.
	}

	try {
		sessionStorage.clear();
	} catch {
		// Same as above.
	}

	try {
		for (const cookie of document.cookie.split(';')) {
			const name = cookie.split('=')[0].trim();
			if (!name) continue;
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	} catch {
		// document.cookie can throw in some locked-down/sandboxed contexts.
	}
}
