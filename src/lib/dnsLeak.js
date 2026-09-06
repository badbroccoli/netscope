// Client-side DNS leak test. A browser cannot read which resolver answered a
// lookup, so we ask services that *are* the authoritative nameserver for a
// never-before-seen hostname to tell us which recursive resolver queried them.
//
// Four card slots match the usual homepage layout (ip-api, bash.ws,
// dns.myipstack.com, fastly). If a slot's own partner fails — CORS, timeout,
// or a dead endpoint — that card walks a shared standby list and shows the
// name of whoever actually replied.
//
// Every partner below is HTTPS with permissive CORS, which a static GitHub
// Pages page requires. Partners are tried from the visitor's browser so the
// result is *their* resolver, not a server's.

import { lookupIpInfo } from '@/lib/networkInfo';

const TIMEOUT_MS = 5000;
const BASH_TIMEOUT_MS = 8000;
const STANDBY_TIMEOUT_MS = 5000;

function withCacheBust(url) {
	const separator = url.includes('?') ? '&' : '?';
	return `${url}${separator}_=${Date.now()}`;
}

function randomToken(length) {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let token = '';
	for (let i = 0; i < length; i += 1) {
		token += alphabet[bytes[i] % alphabet.length];
	}
	return token;
}

export function isValidIP(ip) {
	if (typeof ip !== 'string') return false;
	const value = ip.trim();
	if (!value || value.length > 45) return false;
	if (value.includes(':')) {
		try {
			return Boolean(new URL(`http://[${value}]`));
		} catch {
			return false;
		}
	}
	const parts = value.split('.');
	if (parts.length !== 4) return false;
	return parts.every((part) => {
		if (!/^\d{1,3}$/.test(part)) return false;
		const n = Number(part);
		return n >= 0 && n <= 255;
	});
}

async function fetchRaw(url, { timeoutMs = TIMEOUT_MS, headers } = {}) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(withCacheBust(url), {
			signal: controller.signal,
			headers,
			cache: 'no-store',
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
		});
		if (!response.ok) {
			throw new Error(`Request failed with status ${response.status}`);
		}
		return response;
	} finally {
		clearTimeout(timer);
	}
}

async function fetchJson(url, options) {
	const response = await fetchRaw(url, {
		...options,
		headers: { Accept: 'application/json', ...options?.headers },
	});
	if (response.status === 204) {
		throw new Error('Empty response');
	}
	const text = await response.text();
	if (!text) throw new Error('Empty response');
	return JSON.parse(text);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Force a DNS lookup without needing CORS on the target. Image onerror is
// enough: the resolver still has to ask the authoritative server for the
// never-before-seen hostname.
function probeHostname(host) {
	return new Promise((resolve) => {
		const img = new Image();
		const done = () => {
			img.onload = img.onerror = null;
			resolve();
		};
		const timer = setTimeout(done, 2500);
		img.onload = img.onerror = () => {
			clearTimeout(timer);
			done();
		};
		img.src = `https://${host}/favicon.ico?_=${Date.now()}`;
	});
}

const ipApi = {
	id: 'ipapi',
	name: 'ip-api.com',
	async run() {
		const host = `${randomToken(32)}.edns.ip-api.com`;
		const data = await fetchJson(`https://${host}/json`);
		const ip = data?.dns?.ip;
		if (!isValidIP(ip)) throw new Error('ipapi: missing dns.ip');
		const geo = typeof data.dns.geo === 'string' ? data.dns.geo : '';
		const [country, isp] = geo.split(' - ').map((part) => part.trim());
		return { ip, country: country || null, isp: isp || null };
	},
};

const bashWs = {
	id: 'bashws',
	name: 'bash.ws',
	async run() {
		const idResponse = await fetchRaw('https://bash.ws/id', { timeoutMs: BASH_TIMEOUT_MS });
		const id = (await idResponse.text()).trim();
		if (!id || !/^[a-z0-9]+$/i.test(id)) {
			throw new Error('bash.ws: invalid test id');
		}
		await Promise.all(Array.from({ length: 8 }, (_, i) => probeHostname(`${i}.${id}.bash.ws`)));
		await sleep(400);
		const data = await fetchJson(`https://bash.ws/dnsleak/test/${id}?json`, {
			timeoutMs: BASH_TIMEOUT_MS,
		});
		if (!Array.isArray(data)) throw new Error('bash.ws: unexpected response');
		const dns = data.find((row) => row?.type === 'dns' && isValidIP(row.ip));
		if (!dns) throw new Error('bash.ws: no resolver IP');
		return {
			ip: dns.ip,
			isp: dns.asn || null,
			country: dns.country_name || null,
			countryCode: dns.country_code || null,
		};
	},
};

const myipstack = {
	id: 'myipstack',
	name: 'dns.myipstack.com',
	async run() {
		const host = `${randomToken(16)}.dns.myipstack.com`;
		const data = await fetchJson(`https://${host}/`, { timeoutMs: 4000 });
		const ip = data?.dns?.ip || data?.ip || data?.resolver;
		if (!isValidIP(ip)) throw new Error('myipstack: missing resolver IP');
		return { ip };
	},
};

const fastly = {
	id: 'fastly',
	name: 'fastly.com',
	async run() {
		const host = `${randomToken(24)}.u.fastly-analytics.com`;
		const data = await fetchJson(`https://${host}/debug_resolver`);
		const ip = data?.dns_resolver_info?.ip;
		if (!isValidIP(ip)) throw new Error('fastly: missing dns_resolver_info.ip');
		const info = data.dns_resolver_info;
		return {
			ip,
			isp: info.as_name || null,
			countryCode: info.cc || null,
		};
	},
};

function pickTopIp(ipMap) {
	if (Array.isArray(ipMap)) {
		for (const entry of ipMap) {
			if (typeof entry === 'string' && isValidIP(entry)) return entry;
			if (entry && typeof entry === 'object' && isValidIP(entry.ip)) return entry.ip;
		}
		return null;
	}
	if (!ipMap || typeof ipMap !== 'object') return null;
	let topIp = null;
	let topCount = -1;
	for (const [ip, count] of Object.entries(ipMap)) {
		if (!isValidIP(ip)) continue;
		const n = Number(count);
		const score = Number.isFinite(n) ? n : 1;
		if (score <= topCount) continue;
		topCount = score;
		topIp = ip;
	}
	return topIp;
}

const ipleak = {
	id: 'ipleak',
	name: 'ipleak.net',
	async run() {
		const session = randomToken(40);
		const query = async (rand) => {
			const host = `${session}-${rand}.ipleak.net`;
			const data = await fetchJson(`https://${host}/dnsdetection/`, {
				timeoutMs: STANDBY_TIMEOUT_MS,
			});
			return pickTopIp(data?.ip);
		};
		await Promise.all([query('1'), query(randomToken(6)), query(randomToken(6))]);
		await sleep(350);
		const ip = await query(randomToken(6));
		if (!isValidIP(ip)) throw new Error('ipleak: no resolver IP');
		return { ip };
	},
};

const surfshark = {
	id: 'surfshark',
	name: 'surfsharkdns.com',
	async run() {
		const host = `jn32${randomToken(9)}.ipv4.surfsharkdns.com`;
		const data = await fetchJson(`https://${host}`, { timeoutMs: STANDBY_TIMEOUT_MS });
		if (!data || typeof data !== 'object') throw new Error('surfshark: empty response');
		for (const value of Object.values(data)) {
			const ip = value?.IP || value?.ip;
			if (isValidIP(ip)) return { ip };
		}
		throw new Error('surfshark: no resolver IP');
	},
};

const browserleaks = {
	id: 'browserleaks',
	name: 'browserleaks.net',
	async run() {
		const host = `${randomToken(12)}.dns4.browserleaks.net`;
		const data = await fetchJson(`https://${host}/`, { timeoutMs: STANDBY_TIMEOUT_MS });
		const ip = pickTopIp(data);
		if (!isValidIP(ip)) throw new Error('browserleaks: no resolver IP');
		return { ip };
	},
};

const STANDBYS = [ipleak, surfshark, browserleaks];

export const DNS_LEAK_SLOTS = [
	{ primary: ipApi },
	{ primary: bashWs },
	{ primary: myipstack },
	{ primary: fastly },
].map(({ primary }) => ({
	id: primary.id,
	name: primary.name,
	primary,
	standbys: STANDBYS.filter((provider) => provider.id !== primary.id),
}));

async function runProvider(provider, attempts = 2) {
	let lastError = null;
	for (let i = 0; i < attempts; i += 1) {
		try {
			const result = await provider.run();
			if (!isValidIP(result?.ip)) {
				throw new Error(`${provider.id}: invalid IP`);
			}
			return { ...result, providerId: provider.id, providerName: provider.name };
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError || new Error(`${provider.id}: failed`);
}

async function runSlot(slot) {
	const queue = [slot.primary, ...slot.standbys];
	let lastError = null;
	for (const provider of queue) {
		try {
			return await runProvider(provider);
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError || new Error(`${slot.name}: every partner failed`);
}

/**
 * Runs all four DNS leak cards. `onUpdate(index, patch)` is called as each
 * card moves from loading → IP known → geo filled, or to error.
 */
export async function runDnsLeakTest(onUpdate) {
	const jobs = DNS_LEAK_SLOTS.map((slot, index) => {
		const delay = index * 200;
		return (async () => {
			if (delay) await sleep(delay);
			try {
				const result = await runSlot(slot);
				onUpdate(index, {
					status: 'resolving',
					ip: result.ip,
					providerName: result.providerName,
					isp: result.isp || null,
					country: result.country || null,
					countryCode: result.countryCode || null,
					flagImg: null,
				});
				const geo = await lookupIpInfo(result.ip);
				onUpdate(index, {
					status: 'ready',
					ip: result.ip,
					providerName: result.providerName,
					isp: geo?.network?.isp || geo?.network?.org || result.isp || null,
					country: geo?.location?.country || result.country || null,
					countryCode: geo?.location?.countryCode || result.countryCode || null,
					flagImg: geo?.location?.flagImg || null,
				});
			} catch {
				onUpdate(index, {
					status: 'error',
					ip: null,
					isp: null,
					country: null,
					countryCode: null,
					flagImg: null,
				});
			}
		})();
	});
	await Promise.allSettled(jobs);
}
