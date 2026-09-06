import React, { useCallback, useEffect, useState } from 'react';
import {
	ChevronDown,
	FileText,
	MapPin,
	Monitor,
	Network,
	RefreshCw,
	ShieldAlert,
	VideoOff,
	Waypoints,
} from 'lucide-react';
import { STUN_SERVERS, addressesDiffer, isPublicIp, runWebrtcLeakTest, sameAddressFamily } from '@/lib/webrtcLeak';
import { cn } from '@/lib/utils';

function emptyCards() {
	return STUN_SERVERS.map((server) => ({
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
	}));
}

function leakFor(ip, publicIp) {
	if (!ip || !publicIp || !isPublicIp(ip)) return false;
	if (!sameAddressFamily(ip, publicIp)) return false;
	return addressesDiffer(ip, publicIp);
}

function ConnectionCard({ conn, publicIp }) {
	const [open, setOpen] = useState(false);
	const pending = conn.status === 'loading';

	useEffect(() => {
		if (conn.status === 'loading') setOpen(false);
	}, [conn.status]);
	const failed = conn.status === 'error' || Boolean(conn.error);
	const leaked = leakFor(conn.ip, publicIp);
	const hasIp = Boolean(conn.ip);
	const publicMapped = hasIp && isPublicIp(conn.ip);
	const geo = conn.geo;
	const ipLabel = failed ? 'Unreachable' : hasIp ? conn.ip : pending ? 'Testing…' : 'No address';

	return (
		<div className="paper-tile flex flex-col rounded-md p-4">
			<div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
				<Waypoints className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} />
				<span className="min-w-0 flex-1 truncate text-foreground">WebRTC Connection</span>
				<span className="shrink-0 font-mono text-muted-foreground">#{conn.id}</span>
			</div>
			<div className="mt-2 truncate font-mono text-[11px] text-muted-foreground" title={conn.host}>
				{conn.host}
			</div>

			<div className="mt-4 flex min-h-6 items-center gap-2">
				<span className="relative flex h-1.5 w-1.5 shrink-0">
					{pending && (
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
					)}
					<span
						className={cn(
							'relative inline-flex h-1.5 w-1.5 rounded-full',
							failed
								? 'bg-destructive'
								: leaked
									? 'bg-amber-400'
									: hasIp
										? 'bg-emerald-400'
										: 'bg-primary',
						)}
					/>
				</span>
				<div
					className={cn(
						'font-display text-xl font-medium tracking-wide break-all',
						failed
							? 'text-destructive'
							: leaked
								? 'text-amber-400'
								: hasIp
									? 'text-emerald-400'
									: 'text-muted-foreground',
					)}
				>
					{ipLabel}
				</div>
			</div>
			{leaked && (
				<div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-400">
					Differs from public IP
				</div>
			)}
			{hasIp && !publicMapped && !failed && (
				<div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
					Local / non-public
				</div>
			)}

			<div className="mt-4 space-y-2.5 rounded-md border border-border bg-background/40 px-3 py-3">
				<div className="flex items-start gap-2.5">
					<Network className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
					<div className="min-w-0">
						<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
							NAT
						</div>
						<div className="text-sm leading-snug text-foreground">
							{pending && conn.nat === '—' ? '—' : conn.nat}
						</div>
					</div>
				</div>
				<div className="flex items-start gap-2.5">
					<Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
					<div className="min-w-0">
						<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
							ISP
						</div>
						<div className="text-sm leading-snug text-foreground">
							{pending && !geo ? '—' : geo?.network?.isp || geo?.network?.org || '—'}
						</div>
					</div>
				</div>
				<div className="flex items-start gap-2.5">
					<MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
					<div className="min-w-0">
						<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
							Region
						</div>
						<div className="flex items-center gap-1.5 text-sm leading-snug text-foreground">
							{geo?.location?.flagImg && (
								<img
									src={geo.location.flagImg}
									alt=""
									className="h-3 w-4 rounded-[1px] object-cover"
								/>
							)}
							{pending && !geo?.location?.country ? '—' : geo?.location?.country || '—'}
						</div>
					</div>
				</div>
			</div>

			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen((prev) => !prev)}
				className="mt-3 flex min-h-[40px] w-full items-center justify-between gap-2 rounded-md px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-primary"
			>
				<span className="flex items-center gap-2">
					<FileText className="h-3.5 w-3.5" strokeWidth={2} />
					SDP Log ({conn.sdpLog?.length ?? 0})
				</span>
				<ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
			</button>
			{open && (
				<pre className="mt-1 max-h-48 overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
					{(conn.sdpLog || []).join('\n') || 'No SDP gathered.'}
				</pre>
			)}
		</div>
	);
}

export default function WebrtcLeakPanel({ publicIp }) {
	const [cards, setCards] = useState(emptyCards);
	const [status, setStatus] = useState('loading');

	const load = useCallback(async () => {
		setStatus('loading');
		setCards(emptyCards());
		try {
			await runWebrtcLeakTest((next) => setCards(next));
			setStatus('ready');
		} catch {
			setStatus('error');
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const leakedCount = cards.filter((c) => leakFor(c.ip, publicIp)).length;
	const mappedCount = cards.filter((c) => isPublicIp(c.ip)).length;
	const allFailed = status === 'ready' && cards.every((c) => c.status === 'error' || c.error);

	return (
		<div className="mt-10 border-t border-border pt-8">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<VideoOff className="h-5 w-5 text-destructive" strokeWidth={1.75} />
					<div className="font-display text-xl font-semibold uppercase tracking-[0.18em] text-foreground">
						WebRTC leak test
					</div>
				</div>
				<button
					type="button"
					onClick={load}
					disabled={status === 'loading'}
					aria-label="Refresh WebRTC leak test"
					className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground transition-colors hover:border-primary/60 hover:text-primary active:scale-[0.98] disabled:opacity-50"
				>
					<RefreshCw className={cn('h-3.5 w-3.5', status === 'loading' && 'animate-spin')} strokeWidth={2} />
				</button>
			</div>

			<p className="mb-5 max-w-4xl text-sm leading-relaxed text-muted-foreground">
				When the browser obtains network addresses through WebRTC, it may bypass your VPN or proxy
				and expose your real IP to websites. This test checks which IP is exposed when you connect
				over WebRTC; if the returned IP address or region is not what you expect, there may be a
				risk of WebRTC leaks and you may need to adjust your proxy settings. Besides the IP used
				for WebRTC connections, we also detect your NAT type.
			</p>

			{status === 'ready' && leakedCount > 0 && (
				<p className="mb-5 text-sm text-amber-400">
					Possible leak: {leakedCount} connection{leakedCount === 1 ? '' : 's'} returned a public IP
					that does not match {publicIp}.
				</p>
			)}
			{status === 'ready' && leakedCount === 0 && mappedCount === 0 && !allFailed && (
				<p className="mb-5 text-sm text-muted-foreground">
					No public IP was exposed over WebRTC — STUN may be blocked, or WebRTC is disabled.
				</p>
			)}

			{status === 'error' || allFailed ? (
				<div className="flex flex-col items-center gap-3 py-10 text-center">
					<ShieldAlert className="h-7 w-7 text-primary" strokeWidth={1.5} />
					<p className="font-display text-xl font-medium uppercase tracking-[0.12em]">
						WebRTC unavailable
					</p>
					<p className="max-w-md text-sm text-muted-foreground">
						This browser did not expose ICE candidates, so STUN-mapped addresses cannot be read.
					</p>
					<button
						type="button"
						onClick={load}
						className="min-h-[44px] rounded-md bg-primary px-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition-transform hover:brightness-110 active:scale-[0.98]"
					>
						Try again
					</button>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					{cards.map((conn) => (
						<ConnectionCard key={conn.id} conn={conn} publicIp={publicIp} />
					))}
				</div>
			)}
		</div>
	);
}
