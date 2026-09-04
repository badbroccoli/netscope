// Measures approximate HTTP round-trip latency ("ping") from the visitor's
// browser to a set of well-known websites. There's no ICMP ping in a
// browser, and most sites don't send CORS headers, so we can't read the
// actual HTTP status — we use `mode: 'no-cors'` and just time how long the
// (opaque) response takes to arrive. That's still a solid latency proxy: the
// request really does leave the browser, hit the target's edge/server, and
// come back before the promise resolves.

const PING_TARGETS = [
	{ name: 'Google', url: 'https://www.google.com' },
	{ name: 'Cloudflare', url: 'https://www.cloudflare.com' },
	{ name: 'GitHub', url: 'https://github.com' },
	{ name: 'Amazon', url: 'https://www.amazon.com' },
	{ name: 'Wikipedia', url: 'https://www.wikipedia.org' },
	{ name: 'Microsoft', url: 'https://www.microsoft.com' },
	{ name: 'Apple', url: 'https://www.apple.com' },
];

const TIMEOUT_MS = 5000;

async function pingOne(target) {
	const start = performance.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		// `no-cors` lets the request complete without a CORS-allow header from
		// the target (the response body/status is opaque, but the timing is real).
		await fetch(target.url, {
			method: 'HEAD',
			mode: 'no-cors',
			cache: 'no-store',
			redirect: 'follow',
			signal: controller.signal,
		});
		const latencyMs = Math.round(performance.now() - start);
		return { name: target.name, url: target.url, ok: true, timedOut: false, latencyMs };
	} catch (error) {
		const timedOut = error?.name === 'AbortError';
		return { name: target.name, url: target.url, ok: false, timedOut, latencyMs: null };
	} finally {
		clearTimeout(timer);
	}
}

export async function getPingResults() {
	const results = await Promise.all(PING_TARGETS.map(pingOne));
	return { results, queriedAt: new Date().toISOString() };
}
