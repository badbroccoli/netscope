// Detects the visitor's public IP address and enriches it with geolocation,
// network (ISP/ASN), and timezone data — entirely client-side, since a static
// GitHub Pages deploy has no backend to proxy the request through.
//
// Providers are tried in order until one succeeds. Each is normalized to the
// same shape so the UI never has to care which one answered. All providers
// below serve HTTPS with permissive CORS ("Access-Control-Allow-Origin: *"),
// which is required for a browser fetch from a static page — verified live,
// since provider CORS/HTTPS support changes without notice and many
// "free API" write-ups online are stale or wrong.
//
// ipwho.is's free plan shares a 1,000 requests/day quota across the whole
// calling domain (not per visitor) when used via CORS, so a fallback chain
// keeps the page useful even if that's exhausted.
//
// Every "Re-scan" must be a genuinely fresh lookup, not a cached one:
// - `cache: 'no-store'` tells the browser to skip its HTTP cache entirely —
//   no serving a stale response from disk/memory, no revalidation shortcuts.
// - A `_=<timestamp>` cache-busting param makes each request URL unique, as
//   a second line of defense against any intermediate cache (e.g. a CDN in
//   front of a provider) that might ignore Cache-Control on repeat hits.
// - `credentials: 'omit'` guarantees no cookies are ever sent to, or stored
//   from, these third-party providers. Cross-origin fetches never include
//   the browser's cookie jar by default anyway, but this makes it explicit
//   and un-misconfigurable rather than relying on that default.
const TIMEOUT_MS = 6000;

function withCacheBust(url) {
	const separator = url.includes('?') ? '&' : '?';
	return `${url}${separator}_=${Date.now()}`;
}

async function fetchJson(url, { timeoutMs = TIMEOUT_MS } = {}) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(withCacheBust(url), {
			signal: controller.signal,
			headers: { Accept: 'application/json' },
			cache: 'no-store',
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
		});
		if (!response.ok) {
			throw new Error(`Request failed with status ${response.status}`);
		}
		return await response.json();
	} finally {
		clearTimeout(timer);
	}
}

function offsetToUtc(offsetSeconds) {
	if (typeof offsetSeconds !== 'number' || Number.isNaN(offsetSeconds)) return null;
	const sign = offsetSeconds >= 0 ? '+' : '-';
	const abs = Math.abs(offsetSeconds);
	const hours = String(Math.floor(abs / 3600)).padStart(2, '0');
	const minutes = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
	return `${sign}${hours}:${minutes}`;
}

function normalizeIpWhoIs(data) {
	if (!data.success) {
		throw new Error(data.message || 'ipwho.is reported failure');
	}
	return {
		source: 'ipwho.is',
		ip: data.ip,
		type: data.type || null,
		hostname: null,
		location: {
			city: data.city || null,
			region: data.region || null,
			postal: data.postal || null,
			country: data.country || null,
			countryCode: data.country_code || null,
			isEu: typeof data.is_eu === 'boolean' ? data.is_eu : null,
			flagImg: data.flag?.img || null,
		},
		coordinates: {
			lat: typeof data.latitude === 'number' ? data.latitude : null,
			lon: typeof data.longitude === 'number' ? data.longitude : null,
		},
		network: {
			asn: data.connection?.asn ? `AS${data.connection.asn}` : null,
			asName: data.connection?.org || null,
			isp: data.connection?.isp || null,
			org: data.connection?.org || null,
			domain: data.connection?.domain || null,
			mobile: null,
			proxy: null,
			hosting: null,
		},
		timezone: {
			id: data.timezone?.id || null,
			utc: data.timezone?.utc || null,
		},
		currency: data.currency?.code || null,
	};
}

function normalizeGeoJs(data) {
	return {
		source: 'geojs.io',
		ip: data.ip,
		type: data.ip && data.ip.includes(':') ? 'IPv6' : 'IPv4',
		hostname: null,
		location: {
			city: data.city || null,
			region: data.region || null,
			postal: null,
			country: data.country || null,
			countryCode: data.country_code || null,
			isEu: typeof data.eu === 'string' ? data.eu === 'true' : null,
			flagImg: data.country_code
				? `https://flagcdn.com/w80/${data.country_code.toLowerCase()}.png`
				: null,
		},
		coordinates: {
			lat: data.latitude ? Number(data.latitude) : null,
			lon: data.longitude ? Number(data.longitude) : null,
		},
		network: {
			asn: data.asn ? `AS${data.asn}` : null,
			asName: data.organization_name || data.organization || null,
			isp: data.organization_name || data.organization || null,
			org: data.organization_name || data.organization || null,
			domain: null,
			mobile: null,
			proxy: null,
			hosting: null,
		},
		timezone: {
			id: data.timezone || null,
			utc: null,
		},
		currency: null,
	};
}

function normalizeIpApiCo(data) {
	if (data.error) {
		throw new Error(data.reason || 'ipapi.co reported failure');
	}
	return {
		source: 'ipapi.co',
		ip: data.ip,
		type: data.version || null,
		hostname: null,
		location: {
			city: data.city || null,
			region: data.region || null,
			postal: data.postal || null,
			country: data.country_name || null,
			countryCode: data.country_code || null,
			isEu: typeof data.in_eu === 'boolean' ? data.in_eu : null,
			flagImg: data.country_code
				? `https://flagcdn.com/w80/${data.country_code.toLowerCase()}.png`
				: null,
		},
		coordinates: {
			lat: typeof data.latitude === 'number' ? data.latitude : null,
			lon: typeof data.longitude === 'number' ? data.longitude : null,
		},
		network: {
			asn: data.asn || null,
			asName: data.org || null,
			isp: data.org || null,
			org: data.org || null,
			domain: null,
			mobile: null,
			proxy: null,
			hosting: null,
		},
		timezone: {
			id: data.timezone || null,
			utc: offsetToUtc(data.utc_offset ? Number(data.utc_offset.slice(0, 3)) * 3600 : null),
		},
		currency: data.currency || null,
	};
}

// Last-resort provider: only the bare IP, no geolocation. Keeps the page
// useful even if every geolocation provider above is unreachable/rate-limited.
function normalizeIpify(data) {
	return {
		source: 'ipify.org',
		ip: data.ip,
		type: data.ip && data.ip.includes(':') ? 'IPv6' : 'IPv4',
		hostname: null,
		location: { city: null, region: null, postal: null, country: null, countryCode: null, isEu: null, flagImg: null },
		coordinates: { lat: null, lon: null },
		network: { asn: null, asName: null, isp: null, org: null, domain: null, mobile: null, proxy: null, hosting: null },
		timezone: { id: null, utc: null },
		currency: null,
	};
}

const PROVIDERS = [
	{ url: 'https://ipwho.is/', normalize: normalizeIpWhoIs },
	{ url: 'https://get.geojs.io/v1/ip/geo.json', normalize: normalizeGeoJs },
	{ url: 'https://ipapi.co/json/', normalize: normalizeIpApiCo },
	{ url: 'https://api.ipify.org?format=json', normalize: normalizeIpify },
];

// Same chain as above, but for a *specific* IP (used by the WebRTC and DNS
// leak tests to label resolver / STUN-mapped addresses with ISP/region).
// ipify is omitted — it only returns the caller's IP, not a lookup of an
// arbitrary address.
const LOOKUP_PROVIDERS = [
	{
		url: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}`,
		normalize: normalizeIpWhoIs,
	},
	{
		url: (ip) => `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`,
		normalize: normalizeGeoJs,
	},
	{
		url: (ip) => `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
		normalize: normalizeIpApiCo,
	},
];

export async function getNetworkInfo() {
	const errors = [];
	for (const provider of PROVIDERS) {
		try {
			const data = await fetchJson(provider.url);
			const info = provider.normalize(data);
			if (!info.ip) throw new Error('Provider returned no IP');
			return { ...info, queriedAt: new Date().toISOString() };
		} catch (error) {
			errors.push(`${provider.url}: ${error.message}`);
		}
	}
	throw new Error(`All network-info providers failed:\n${errors.join('\n')}`);
}

// Best-effort geo/ISP for an already-known IP. Returns null instead of
// throwing — a failed lookup shouldn't fail the leak tests themselves.
export async function lookupIpInfo(ip) {
	if (!ip) return null;
	for (const provider of LOOKUP_PROVIDERS) {
		try {
			const data = await fetchJson(provider.url(ip));
			const info = provider.normalize(data);
			if (!info.ip) throw new Error('Provider returned no IP');
			return info;
		} catch {
			// try the next provider
		}
	}
	return null;
}
