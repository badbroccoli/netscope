// Client-side download/upload throughput test. There's no backend to proxy
// through (static GitHub Pages site), so this hits Cloudflare's public speed
// test endpoints directly — the same `speed.cloudflare.com/__down` /
// `__up` API that powers speed.cloudflare.com itself. It's free, keyless,
// and serves permissive CORS (`Access-Control-Allow-Origin: *`), which is
// required for a browser fetch from a different origin — verified live.
//
// This is NEVER run automatically. It moves tens of megabits of data, which
// is unlike the tiny lookups netscope/ping do in the background, so it only
// ever runs when a user explicitly clicks "Run speed test".
//
// Both directions omit credentials and disable caching for the same reasons
// as networkInfo.js/ping.js: no cookies in or out, and no chance a CDN or
// the browser's HTTP cache quietly serves a stale/short-circuited response
// instead of actually moving the bytes.

const DOWNLOAD_ENDPOINT = 'https://speed.cloudflare.com/__down';
const UPLOAD_ENDPOINT = 'https://speed.cloudflare.com/__up';

const DOWNLOAD_BYTES = 25_000_000; // 25 MB — enough to get a stable reading on fast links
const UPLOAD_BYTES = 6_000_000; // 6 MB — smaller, since upload is usually the bottleneck
const MAX_PHASE_MS = 8000; // stop measuring (not the request) after this long either way
const PROGRESS_THROTTLE_MS = 150;

function withCacheBust(url) {
	const separator = url.includes('?') ? '&' : '?';
	return `${url}${separator}_=${Date.now()}`;
}

function toMbps(bytes, ms) {
	if (!ms || ms <= 0) return 0;
	return (bytes * 8) / (ms / 1000) / 1_000_000;
}

// Random (not zero-filled) payload so nothing in the path can cheat the
// timing by compressing a predictable buffer. crypto.getRandomValues() caps
// out at 65,536 bytes per call in browsers, so it's filled in chunks.
function randomPayload(size) {
	const bytes = new Uint8Array(size);
	const chunk = 65536;
	for (let offset = 0; offset < size; offset += chunk) {
		crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + chunk, size)));
	}
	return bytes;
}

/**
 * Streams a large download from Cloudflare's speed-test endpoint, reporting
 * live Mbps as bytes arrive, and stopping (not failing) after MAX_PHASE_MS
 * so a slow connection doesn't hang the test — the throughput observed so
 * far is still a valid reading.
 */
async function measureDownload(onProgress) {
	const controller = new AbortController();
	const hardTimeout = setTimeout(() => controller.abort(), MAX_PHASE_MS * 2);
	const start = performance.now();
	let lastReportedAt = 0;

	try {
		const response = await fetch(withCacheBust(`${DOWNLOAD_ENDPOINT}?bytes=${DOWNLOAD_BYTES}`), {
			cache: 'no-store',
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
			signal: controller.signal,
		});
		if (!response.ok || !response.body) {
			throw new Error(`Download probe failed with status ${response.status}`);
		}

		const reader = response.body.getReader();
		let received = 0;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			received += value.length;
			const elapsed = performance.now() - start;

			if (elapsed - lastReportedAt > PROGRESS_THROTTLE_MS) {
				lastReportedAt = elapsed;
				onProgress?.(toMbps(received, elapsed));
			}
			if (elapsed > MAX_PHASE_MS) {
				await reader.cancel();
				break;
			}
		}

		const elapsed = performance.now() - start;
		return { bytes: received, mbps: toMbps(received, elapsed) };
	} finally {
		clearTimeout(hardTimeout);
	}
}

/**
 * Uploads a random payload to Cloudflare's speed-test endpoint and times the
 * full round trip. Upload can't be measured progressively with `fetch` (no
 * standard browser API exposes request-body send progress), so this reports
 * a single reading once the response comes back, capped by an abort timeout.
 */
async function measureUpload(onProgress) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), MAX_PHASE_MS * 2);
	const payload = randomPayload(UPLOAD_BYTES);
	const start = performance.now();

	try {
		onProgress?.(null); // signal "upload in flight, no live number available"
		const response = await fetch(withCacheBust(UPLOAD_ENDPOINT), {
			method: 'POST',
			body: payload,
			cache: 'no-store',
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`Upload probe failed with status ${response.status}`);
		}
		const elapsed = performance.now() - start;
		const mbps = toMbps(UPLOAD_BYTES, elapsed);
		onProgress?.(mbps);
		return { bytes: UPLOAD_BYTES, mbps };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Runs download then upload, reporting live progress via callbacks. Only
 * ever invoked by an explicit user action (see the "Run speed test" button
 * in HomePage.jsx) — never on page load or alongside re-scan/re-ping.
 */
export async function runSpeedTest({ onDownloadProgress, onUploadProgress } = {}) {
	const download = await measureDownload(onDownloadProgress);
	const upload = await measureUpload(onUploadProgress);
	return {
		downloadMbps: download.mbps,
		uploadMbps: upload.mbps,
		downloadBytes: download.bytes,
		uploadBytes: upload.bytes,
		queriedAt: new Date().toISOString(),
	};
}
