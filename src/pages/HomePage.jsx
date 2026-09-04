import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
	Activity,
	Building2,
	Check,
	Copy,
	Globe2,
	Hash,
	MapPin,
	RefreshCw,
	Server,
	ShieldAlert,
	Signal,
	Wifi,
} from 'lucide-react';
import { getNetworkInfo } from '@/lib/networkInfo';
import { getPingResults } from '@/lib/ping';
import { cn } from '@/lib/utils';

function LocalClock({ timeZone, utc }) {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(timer);
	}, []);

	let label = null;
	try {
		label = new Intl.DateTimeFormat('en-GB', {
			timeZone,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
		}).format(now);
	} catch {
		label = null;
	}

	return (
		<span className="font-display text-2xl font-medium tracking-wide text-foreground tabular-nums">
			{label ?? utc ?? '—'}
		</span>
	);
}

function Tile({ icon: Icon, label, children, className }) {
	return (
		<div className={cn('paper-tile rounded-md p-4', className)}>
			<div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
				<Icon className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
				{label}
			</div>
			{children}
		</div>
	);
}

function TileValue({ children, className }) {
	return (
		<div className={cn('font-display text-xl font-medium leading-snug tracking-wide text-foreground', className)}>
			{children ?? '—'}
		</div>
	);
}

function TileSub({ children }) {
	if (!children) return null;
	return <div className="mt-1 text-sm leading-snug text-muted-foreground">{children}</div>;
}

function FlagBadge({ flag }) {
	if (!flag) return null;
	return (
		<span
			key={flag}
			className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary-foreground"
		>
			{flag}
		</span>
	);
}

function SkeletonPane() {
	return (
		<div className="animate-pulse">
			<div className="h-3 w-40 rounded bg-foreground/10" />
			<div className="mt-4 h-14 w-3/4 rounded bg-foreground/10" />
			<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="h-24 rounded-md bg-foreground/5" />
				))}
			</div>
		</div>
	);
}

function latencyTone(ms) {
	if (ms == null) return 'text-muted-foreground';
	if (ms < 120) return 'text-emerald-400';
	if (ms < 300) return 'text-amber-400';
	return 'text-destructive';
}

function PingTabs({ ping, status, onRefresh }) {
	const [active, setActive] = useState(0);

	if (status === 'loading') {
		return (
			<div className="animate-pulse">
				<div className="h-10 w-full max-w-2xl rounded-md bg-foreground/10" />
			</div>
		);
	}

	if (status === 'error') {
		return (
			<div className="flex flex-col items-center gap-3 py-10 text-center">
				<ShieldAlert className="h-7 w-7 text-primary" strokeWidth={1.5} />
				<p className="font-display text-xl font-medium uppercase tracking-[0.12em]">
					Ping probe failed
				</p>
				<button
					type="button"
					onClick={onRefresh}
					className="min-h-[44px] rounded-md bg-primary px-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition-transform hover:brightness-110 active:scale-[0.98]"
				>
					Try again
				</button>
			</div>
		);
	}

	if (!ping) return null;

	return (
		<div className="flex flex-wrap gap-2" role="tablist" aria-label="Ping targets">
			{ping.results.map((r, i) => (
				<button
					key={r.url}
					type="button"
					role="tab"
					aria-selected={i === active}
					onClick={() => setActive(i)}
					className={cn(
						'flex min-h-[40px] items-center gap-2 rounded-md border px-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors',
						i === active
							? 'border-primary bg-primary/15 text-primary'
							: 'border-border bg-secondary text-secondary-foreground hover:border-primary/50 hover:text-primary',
					)}
				>
					<span
						className={cn(
							'h-1.5 w-1.5 rounded-full',
							r.ok ? 'bg-emerald-400' : r.timedOut ? 'bg-amber-400' : 'bg-destructive',
						)}
					/>
					<span>{r.name}</span>
					<span className={cn('tabular-nums', latencyTone(r.latencyMs))}>
						{r.latencyMs != null ? `${r.latencyMs} ms` : '—'}
					</span>
				</button>
			))}
		</div>
	);
}

export default function HomePage() {
	const [status, setStatus] = useState('loading');
	const [data, setData] = useState(null);
	const [copied, setCopied] = useState(false);
	const [refreshedAt, setRefreshedAt] = useState(null);
	const [ping, setPing] = useState(null);
	const [pingStatus, setPingStatus] = useState('idle');

	const load = useCallback(async () => {
		setStatus('loading');
		try {
			const payload = await getNetworkInfo();
			setData(payload);
			setRefreshedAt(new Date());
			setStatus('ready');
		} catch (error) {
			setStatus('error');
		}
	}, []);

	const loadPing = useCallback(async () => {
		setPingStatus('loading');
		try {
			const payload = await getPingResults();
			setPing(payload);
			setPingStatus('ready');
		} catch (error) {
			setPingStatus('error');
		}
	}, []);

	useEffect(() => {
		load();
		loadPing();
	}, [load, loadPing]);

	const copyIp = async () => {
		if (!data?.ip) return;
		try {
			await navigator.clipboard.writeText(data.ip);
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		} catch {
			setCopied(false);
		}
	};

	const lat = data?.coordinates?.lat;
	const lon = data?.coordinates?.lon;
	const hasCoords = typeof lat === 'number' && typeof lon === 'number';
	const bbox = hasCoords
		? `${lon - 0.14},${lat - 0.08},${lon + 0.14},${lat + 0.08}`
		: null;

	const connectionFlags = data
		? [
				data.network.mobile === true && 'Mobile',
				data.network.proxy === true && 'Proxy / VPN',
				data.network.hosting === true && 'Data center',
				data.location.isEu === true && 'EU',
			].filter(Boolean)
		: [];

	return (
		<div className="relative min-h-screen min-h-[100dvh] bg-background text-foreground">
			<Helmet>
				<title>NetScope — Your IP Address & Network Intelligence</title>
				<meta
					name="description"
					content="Detect your public IP address and see your full network profile — location, ISP, ASN, timezone and an interactive map — in one glass pane."
				/>
			</Helmet>

			{/* Backdrop: clay glow + vignette + grain */}
			<div className="pointer-events-none fixed inset-0" aria-hidden="true">
				<div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-primary/15 blur-[140px]" />
				<div className="absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-primary/10 blur-[140px]" />
				<div className="grain-overlay absolute inset-0" />
			</div>

			<main className="relative z-10 mx-auto flex min-h-screen min-h-[100dvh] w-full max-w-6xl items-center justify-center px-4 py-8 sm:px-8 sm:py-10">
				<section className="glass-pane pane-in w-full rounded-lg p-6 sm:p-10">
					{/* Pane header */}
					<header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
						<div>
							<div className="font-display text-lg font-semibold uppercase tracking-[0.3em] text-foreground">
								Net<span className="text-primary">Scope</span>
							</div>
							<div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
								Live network observation
							</div>
						</div>
						<div className="flex items-center gap-4">
							<span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
								<span
									className={cn(
										'live-dot h-2 w-2 rounded-full',
										status === 'ready' ? 'bg-emerald-400' : status === 'error' ? 'bg-destructive' : 'bg-primary',
									)}
								/>
								{status === 'ready' ? 'Online' : status === 'error' ? 'Offline' : 'Probing'}
							</span>
							<button
								type="button"
								onClick={load}
								disabled={status === 'loading'}
								className="flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-secondary px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary-foreground transition-colors hover:border-primary/60 hover:text-primary active:scale-[0.98] disabled:opacity-50"
							>
								<RefreshCw className={cn('h-3.5 w-3.5', status === 'loading' && 'animate-spin')} strokeWidth={2} />
								Re-scan
							</button>
						</div>
					</header>

					{status === 'loading' && (
						<div className="pt-8">
							<SkeletonPane />
						</div>
					)}

					{status === 'error' && (
						<div className="flex flex-col items-center gap-4 py-16 text-center">
							<ShieldAlert className="h-8 w-8 text-primary" strokeWidth={1.5} />
							<p className="font-display text-2xl font-medium uppercase tracking-[0.12em]">
								Signal lost
							</p>
							<p className="max-w-md text-sm text-muted-foreground">
								The network lookup service did not answer. Check your connection and try again.
							</p>
							<button
								type="button"
								onClick={load}
								className="mt-2 min-h-[44px] rounded-md bg-primary px-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground transition-transform hover:brightness-110 active:scale-[0.98]"
							>
								Try again
							</button>
						</div>
					)}

					{status === 'ready' && data && (
						<div className="pt-8">
							{/* IP hero + map */}
							<div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-8">
								<div>
									<div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">
										Your public IP address
									</div>
									<div className="mt-3 flex flex-wrap items-center gap-4">
										<h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground break-all sm:text-6xl md:text-7xl sm:leading-none">
											{data.ip}
										</h1>
										<button
											type="button"
											onClick={copyIp}
											aria-label="Copy IP address"
											className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary active:scale-[0.98]"
										>
											{copied ? (
												<Check className="h-4 w-4 text-emerald-400" strokeWidth={2} />
											) : (
												<Copy className="h-4 w-4" strokeWidth={2} />
											)}
										</button>
									</div>
									<div className="mt-4 flex flex-wrap items-center gap-2">
										{data.type && <FlagBadge flag={data.type} />}
										{data.location.country && (
											<FlagBadge
												flag={
													<span className="flex items-center gap-1.5">
														{data.location.flagImg && (
															<img
																src={data.location.flagImg}
																alt={`${data.location.country} flag`}
																className="h-3 w-4 rounded-[1px] object-cover"
															/>
														)}
														{data.location.country}
													</span>
												}
											/>
										)}
										{connectionFlags.map((flag) => (
											<FlagBadge key={flag} flag={flag} />
										))}
									</div>

									{/* Network tiles */}
									<div className="mt-8 grid gap-4 sm:grid-cols-2">
										<Tile icon={Wifi} label="ISP">
											<TileValue>{data.network.isp}</TileValue>
											<TileSub>{data.network.domain}</TileSub>
										</Tile>
										<Tile icon={Building2} label="Organization">
											<TileValue>{data.network.org}</TileValue>
										</Tile>
										<Tile icon={Hash} label="Autonomous system">
											<TileValue>{data.network.asn}</TileValue>
											<TileSub>{data.network.asName}</TileSub>
										</Tile>
										<Tile icon={Server} label="Reverse DNS">
											<TileValue className="break-all text-base">
												{data.hostname || 'Not published'}
											</TileValue>
										</Tile>
									</div>
								</div>

								{/* Map — the intentionally broken frame */}
								<div className="relative">
									<div className="lg:-rotate-2 lg:translate-y-3">
										<div className="rounded-md border border-border bg-card p-2 shadow-[10px_10px_0_hsl(18_58%_52%/0.35)]">
											{hasCoords ? (
												<iframe
													title="Map of your approximate network location"
													src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`}
													className="h-64 w-full rounded-sm sm:h-72 lg:h-80"
													loading="lazy"
												/>
											) : (
												<div className="flex h-64 w-full items-center justify-center rounded-sm text-sm text-muted-foreground">
													No coordinates available
												</div>
											)}
											<div className="flex items-center justify-between px-1 pb-1 pt-2">
												<span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
													Approximate position
												</span>
												{hasCoords && (
													<a
														href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`}
														target="_blank"
														rel="noreferrer"
														className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary hover:underline"
													>
														Enlarge
													</a>
												)}
											</div>
										</div>
									</div>
								</div>
							</div>

							{/* Location & time tiles */}
							<div className="mt-10 grid gap-4 sm:grid-cols-2">
								<Tile icon={MapPin} label="Location">
									<TileValue>
										{[data.location.city, data.location.region].filter(Boolean).join(', ') || '—'}
									</TileValue>
									<TileSub>
										{[data.location.postal, data.location.country].filter(Boolean).join(' · ')}
									</TileSub>
								</Tile>
								<Tile icon={Globe2} label="Timezone">
									{data.timezone.id ? (
										<LocalClock timeZone={data.timezone.id} utc={data.timezone.utc} />
									) : (
										<TileValue>{data.timezone.utc ?? '—'}</TileValue>
									)}
									<TileSub>
										{[data.timezone.id, data.timezone.utc && `UTC ${data.timezone.utc}`]
											.filter(Boolean)
											.join(' · ')}
									</TileSub>
								</Tile>
							</div>

							{data.currency && (
								<div className="mt-4 grid gap-4 sm:grid-cols-2">
									<Tile icon={Signal} label="Currency">
										<TileValue>{data.currency}</TileValue>
									</Tile>
								</div>
							)}

							{/* Ping probe tabs */}
						<div className="mt-10 border-t border-border pt-8">
							<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
								<div>
									<div className="font-display text-xl font-semibold uppercase tracking-[0.18em] text-foreground">
										Ping probe
									</div>
									<div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
										HTTP round-trip latency to popular websites
									</div>
								</div>
								<button
									type="button"
									onClick={loadPing}
									disabled={pingStatus === 'loading'}
									className="flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-secondary px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary-foreground transition-colors hover:border-primary/60 hover:text-primary active:scale-[0.98] disabled:opacity-50"
								>
									<RefreshCw className={cn('h-3.5 w-3.5', pingStatus === 'loading' && 'animate-spin')} strokeWidth={2} />
									Re-ping
								</button>
							</div>
							<PingTabs ping={ping} status={pingStatus} onRefresh={loadPing} />
						</div>

						{/* Pane footer */}
							<footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
								<span>
									Geolocation: {data.source} · Map: OpenStreetMap
								</span>
								<span>
									{refreshedAt &&
										`Scanned ${refreshedAt.toLocaleTimeString('en-GB', { hour12: false })}`}
								</span>
							</footer>
						</div>
					)}
				</section>
			</main>
		</div>
	);
}
