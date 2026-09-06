// WebRTC leak test. A static GitHub Pages deploy has no backend, so this
// runs entirely in the browser: open an RTCPeerConnection against a public
// STUN server, read the ICE candidates the browser gathers, and see which
// addresses were exposed. STUN-mapped (srflx) IPs are what a remote peer —
// or a tracking script — would learn, and they can bypass a VPN/proxy that
// only wraps HTTP(S).
//
// NAT type is inferred from ICE candidate shapes, then refined by asking
// two STUN servers from the *same* local socket (one PeerConnection, two
// iceServers). Independent PeerConnections each get their own UDP port, so
// comparing ports across the four cards would not distinguish cone vs
// symmetric NAT.

import { lookupIpInfo } from '@/lib/networkInfo';

export const STUN_SERVERS = [
	{ id: 1, host: 'stun.l.google.com:19302', urls: 'stun:stun.l.google.com:19302' },
	{ id: 2, host: 'stun.voip.blackberry.com:3478', urls: 'stun:stun.voip.blackberry.com:3478' },
	{ id: 3, host: 'global.stun.twilio.com', urls: 'stun:global.stun.twilio.com:3478' },
	{ id: 4, host: 'stun.cloudflare.com', urls: 'stun:stun.cloudflare.com:3478' },
];

const GATHER_TIMEOUT_MS = 8000;

export function normalizeIp(address) {
	if (!address) return null;
	let ip = String(address).trim();
	if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
	const zone = ip.indexOf('%');
	if (zone !== -1) ip = ip.slice(0, zone);
	return ip || null;
}

export function isIPv4(ip) {
	return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip);
}

export function isMdns(ip) {
	return typeof ip === 'string' && ip.toLowerCase().endsWith('.local');
}

export function isPrivateIp(ip) {
	const addr = normalizeIp(ip);
	if (!addr) return true;
	if (isMdns(addr)) return true;

	if (isIPv4(addr)) {
		const [a, b] = addr.split('.').map(Number);
		if (a === 0 || a === 10 || a === 127) return true;
		if (a === 169 && b === 254) return true;
		if (a === 192 && b === 168) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		return false;
	}

	const v6 = addr.toLowerCase();
	if (v6 === '::1' || v6 === '::') return true;
	if (v6.startsWith('fe80:')) return true;
	if (v6.startsWith('fc') || v6.startsWith('fd')) return true;
	if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice('::ffff:'.length));
	return false;
}

export function isPublicIp(ip) {
	const addr = normalizeIp(ip);
	if (!addr || isMdns(addr)) return false;
	return !isPrivateIp(addr);
}

function parseCandidate(iceCandidate) {
	const raw = iceCandidate?.candidate;
	if (!raw) return null;

	const parts = raw.replace(/^candidate:/, '').trim().split(/\s+/);
	const typIdx = parts.indexOf('typ');
	const raddrIdx = parts.indexOf('raddr');
	const rportIdx = parts.indexOf('rport');

	const address = normalizeIp(iceCandidate.address || iceCandidate.ip || parts[4]);
	const port = Number(iceCandidate.port ?? parts[5]) || null;
	const protocol = String(iceCandidate.protocol || parts[2] || '').toLowerCase();
	const type = iceCandidate.type || (typIdx >= 0 ? parts[typIdx + 1] : null);
	const relatedAddress = normalizeIp(
		iceCandidate.relatedAddress || (raddrIdx >= 0 ? parts[raddrIdx + 1] : null),
	);
	const relatedPort = Number(iceCandidate.relatedPort ?? (rportIdx >= 0 ? parts[rportIdx + 1] : null)) || null;

	return {
		raw,
		address,
		port,
		protocol,
		type,
		relatedAddress,
		relatedPort,
	};
}

function candidatesFromSdp(sdp) {
	if (!sdp) return [];
	return sdp
		.split(/\r?\n/)
		.filter((line) => line.startsWith('a=candidate:'))
		.map((line) => ({ candidate: line.slice('a='.length).trim() }));
}

function classifyNat(parsed) {
	const host = parsed.filter((c) => c.type === 'host');
	const srflx = parsed.filter((c) => c.type === 'srflx');
	const publicHost = host.some((c) => isPublicIp(c.address));

	if (publicHost) return 'Open Internet';
	if (srflx.length > 0) return 'Port Restricted Cone or Symmetric';
	if (host.length > 0) return 'Firewall';
	return 'Blocked';
}

function pickDisplayIp(parsed) {
	const srflx = parsed.filter((c) => c.type === 'srflx' && isPublicIp(c.address));
	const publicHost = parsed.filter((c) => c.type === 'host' && isPublicIp(c.address));
	const host = parsed.filter((c) => c.type === 'host' && c.address && !isMdns(c.address));

	const v4 = (list) => list.find((c) => isIPv4(c.address));
	const any = (list) => list[0];

	const chosen = v4(srflx) || any(srflx) || v4(publicHost) || any(publicHost) || v4(host) || any(host);
	return chosen?.address ?? null;
}

function publicIpsOf(parsed) {
	const ips = parsed.map((c) => c.address).filter(isPublicIp);
	return [...new Set(ips)];
}

function gatherIce(urls) {
	return new Promise((resolve) => {
		const RTC = typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null;
		if (!RTC) {
			resolve({ candidates: [], sdpLog: [], sdp: null, error: 'unsupported' });
			return;
		}

		const urlList = Array.isArray(urls) ? urls : [urls];
		const pc = new RTC({ iceServers: urlList.map((u) => ({ urls: u })) });
		const iceCandidates = [];
		const sdpLog = [];
		let settled = false;

		const finish = () => {
			if (settled) return;
			settled = true;
			const sdp = pc.localDescription?.sdp ?? null;
			pc.onicecandidate = null;
			pc.onicegatheringstatechange = null;
			try {
				pc.close();
			} catch {
				// already closed
			}

			for (const extra of candidatesFromSdp(sdp)) {
				if (!iceCandidates.some((c) => c.candidate === extra.candidate)) {
					iceCandidates.push(extra);
					if (extra.candidate && !sdpLog.includes(extra.candidate)) sdpLog.push(extra.candidate);
				}
			}

			if (sdpLog.length === 0) sdpLog.push('iceGatheringState: complete (no candidates)');
			resolve({ candidates: iceCandidates, sdpLog, sdp, error: null });
		};

		sdpLog.push(`createDataChannel('netscope')`);
		pc.createDataChannel('netscope');

		pc.onicecandidate = (event) => {
			if (!event.candidate) {
				sdpLog.push('iceGatheringState: complete');
				finish();
				return;
			}
			iceCandidates.push(event.candidate);
			if (event.candidate.candidate) sdpLog.push(event.candidate.candidate);
		};

		pc.onicegatheringstatechange = () => {
			if (pc.iceGatheringState === 'complete') finish();
		};

		pc.createOffer()
			.then((offer) => {
				sdpLog.push('createOffer()');
				return pc.setLocalDescription(offer);
			})
			.then(() => {
				sdpLog.push('setLocalDescription()');
				if (pc.iceGatheringState === 'complete') finish();
			})
			.catch((error) => {
				if (settled) return;
				settled = true;
				try {
					pc.close();
				} catch {
					// already closed
				}
				resolve({
					candidates: [],
					sdpLog,
					sdp: null,
					error: error?.message || 'Failed to create WebRTC offer',
				});
			});

		setTimeout(finish, GATHER_TIMEOUT_MS);
	});
}

function refineNatType(parsed) {
	const host = parsed.filter((c) => c.type === 'host');
	if (host.some((c) => isPublicIp(c.address))) return 'Open Internet';

	const srflx = parsed.filter((c) => c.type === 'srflx' && isPublicIp(c.address));
	if (srflx.length === 0) return null;

	const groups = new Map();
	for (const c of srflx) {
		const key = c.relatedAddress ? `${c.relatedAddress}|${c.relatedPort ?? ''}` : '_';
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(`${c.address}|${c.port}`);
	}

	let sawSplitPorts = false;
	let sawSameMapping = false;
	for (const mapped of groups.values()) {
		const unique = new Set(mapped);
		if (unique.size === 1 && mapped.length >= 2) sawSameMapping = true;
		if (unique.size > 1) {
			const ips = new Set(mapped.map((entry) => entry.slice(0, entry.lastIndexOf('|'))));
			if (ips.size === 1) sawSplitPorts = true;
		}
	}

	if (sawSplitPorts) return 'Symmetric';
	if (sawSameMapping) return 'Port Restricted Cone';
	return 'Port Restricted Cone or Symmetric';
}

function emptyConnection(server) {
	return {
		id: server.id,
		host: server.host,
		urls: server.urls,
		ip: null,
		publicIps: [],
		nat: '—',
		sdpLog: [],
		error: null,
		geo: null,
		status: 'loading',
		candidateCount: 0,
	};
}

async function probeStunServer(server) {
	const gathered = await gatherIce(server.urls);
	const parsed = gathered.candidates.map(parseCandidate).filter(Boolean);
	const ip = pickDisplayIp(parsed);
	const nat = classifyNat(parsed);

	return {
		...emptyConnection(server),
		ip,
		publicIps: publicIpsOf(parsed),
		nat,
		sdpLog: gathered.sdpLog,
		error: gathered.error,
		status: gathered.error ? 'error' : 'ready',
		candidateCount: parsed.length,
	};
}

function geoLookup(ip, cache) {
	if (!ip || !isPublicIp(ip)) return Promise.resolve(null);
	if (!cache.has(ip)) cache.set(ip, lookupIpInfo(ip));
	return cache.get(ip);
}

function applyNat(connection, globalNat) {
	if (connection.nat === 'Open Internet' || connection.nat === 'Firewall' || connection.nat === 'Blocked') {
		return connection.nat;
	}
	return globalNat || connection.nat;
}

async function probeNatType() {
	const gathered = await gatherIce([STUN_SERVERS[0].urls, STUN_SERVERS[3].urls]);
	if (gathered.error) return null;
	const parsed = gathered.candidates.map(parseCandidate).filter(Boolean);
	return refineNatType(parsed);
}

export async function runWebrtcLeakTest(onUpdate) {
	if (typeof RTCPeerConnection === 'undefined') {
		throw new Error('WebRTC is not supported in this browser');
	}

	const geoCache = new Map();
	const connections = STUN_SERVERS.map(emptyConnection);
	onUpdate?.(connections.map((c) => ({ ...c })));

	const [probed, globalNat] = await Promise.all([
		Promise.all(
			STUN_SERVERS.map(async (server, index) => {
				const result = await probeStunServer(server);
				result.geo = await geoLookup(result.ip, geoCache);
				connections[index] = result;
				onUpdate?.(connections.map((c) => ({ ...c })));
				return result;
			}),
		),
		probeNatType(),
	]);

	const finalized = probed.map((c) => ({ ...c, nat: applyNat(c, globalNat) }));
	onUpdate?.(finalized);

	return {
		connections: finalized,
		nat: globalNat,
		queriedAt: new Date().toISOString(),
	};
}

export function sameAddressFamily(a, b) {
	const left = normalizeIp(a);
	const right = normalizeIp(b);
	if (!left || !right) return false;
	return isIPv4(left) === isIPv4(right);
}

export function addressesDiffer(a, b) {
	const left = normalizeIp(a)?.toLowerCase();
	const right = normalizeIp(b)?.toLowerCase();
	if (!left || !right) return false;
	return left !== right;
}
