import React, { useCallback, useEffect, useState } from 'react';
import { DoorOpen, MapPin, Octagon, RefreshCw, Server, ShieldAlert } from 'lucide-react';
import { DNS_LEAK_SLOTS, runDnsLeakTest } from '@/lib/dnsLeak';
import { cn } from '@/lib/utils';

function emptyCards() {
	return DNS_LEAK_SLOTS.map((slot) => ({
		id: slot.id,
		providerName: slot.name,
		status: 'loading',
		ip: null,
		isp: null,
		country: null,
		countryCode: null,
		flagImg: null,
	}));
}

function EndpointCard({ card, index }) {
	const pending = card.status === 'loading' || card.status === 'resolving';
	const failed = card.status === 'error';
	const ipLabel = failed ? 'Test Error' : card.ip || 'Testing…';

	return (
		<div className="paper-tile flex flex-col rounded-md p-4">
			<div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
				<DoorOpen className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} />
				<span className="min-w-0 flex-1 truncate text-foreground">DNS Endpoint Test</span>
				<span className="shrink-0 font-mono text-muted-foreground">#{index + 1}</span>
			</div>
			<div className="mt-2 truncate font-mono text-[11px] text-muted-foreground" title={card.providerName}>
				{card.providerName}
			</div>

			<div className="mt-4 flex min-h-6 items-center gap-2">
				<span className="relative flex h-1.5 w-1.5 shrink-0">
					{pending && (
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
					)}
					<span
						className={cn(
							'relative inline-flex h-1.5 w-1.5 rounded-full',
							failed ? 'bg-destructive' : card.ip ? 'bg-emerald-400' : 'bg-primary',
						)}
					/>
				</span>
				<div
					className={cn(
						'font-display text-xl font-medium tracking-wide break-all',
						failed ? 'text-destructive' : card.ip ? 'text-emerald-400' : 'text-muted-foreground',
					)}
				>
					{ipLabel}
				</div>
			</div>

			<div className="mt-4 space-y-2.5 rounded-md border border-border bg-background/40 px-3 py-3">
				<div className="flex items-start gap-2.5">
					<Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
					<div className="min-w-0">
						<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
							ISP
						</div>
						<div className="text-sm leading-snug text-foreground">{pending && !card.isp ? '—' : card.isp || '—'}</div>
					</div>
				</div>
				<div className="flex items-start gap-2.5">
					<MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
					<div className="min-w-0">
						<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
							Endpoint Region
						</div>
						<div className="flex items-center gap-1.5 text-sm leading-snug text-foreground">
							{card.flagImg && (
								<img src={card.flagImg} alt="" className="h-3 w-4 rounded-[1px] object-cover" />
							)}
							{pending && !card.country ? '—' : card.country || '—'}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function DnsLeakPanel() {
	const [cards, setCards] = useState(emptyCards);
	const [status, setStatus] = useState('loading');

	const load = useCallback(async () => {
		setStatus('loading');
		setCards(emptyCards());
		await runDnsLeakTest((index, patch) => {
			setCards((prev) => prev.map((card, i) => (i === index ? { ...card, ...patch } : card)));
		});
		setStatus('ready');
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const allFailed = status === 'ready' && cards.every((card) => card.status === 'error');

	return (
		<div className="mt-10 border-t border-border pt-8">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<Octagon className="h-5 w-5 text-destructive" strokeWidth={1.75} />
					<div className="font-display text-xl font-semibold uppercase tracking-[0.18em] text-foreground">
						DNS leak test
					</div>
				</div>
				<button
					type="button"
					onClick={load}
					disabled={status === 'loading'}
					aria-label="Refresh DNS leak test"
					className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-secondary text-secondary-foreground transition-colors hover:border-primary/60 hover:text-primary active:scale-[0.98] disabled:opacity-50"
				>
					<RefreshCw className={cn('h-3.5 w-3.5', status === 'loading' && 'animate-spin')} strokeWidth={2} />
				</button>
			</div>

			<p className="mb-5 max-w-4xl text-sm leading-relaxed text-muted-foreground">
				Even while you are using a VPN or proxy, DNS queries may still be sent over your local
				network, exposing the domains of the sites you visit. ISPs, firewalls, public Wi-Fi
				providers and others along the path can intercept them and learn which sites you are
				visiting. This test visits a newly generated domain name to detect which region your DNS
				queries go through; if the returned region differs from the region of the VPN/proxy you are
				using, there may be a risk of DNS leaks.
			</p>

			{allFailed ? (
				<div className="flex flex-col items-center gap-3 py-10 text-center">
					<ShieldAlert className="h-7 w-7 text-primary" strokeWidth={1.5} />
					<p className="font-display text-xl font-medium uppercase tracking-[0.12em]">
						DNS probe failed
					</p>
					<p className="max-w-md text-sm text-muted-foreground">
						None of the leak-test partners answered. Check your connection and try again.
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
					{cards.map((card, index) => (
						<EndpointCard key={card.id} card={card} index={index} />
					))}
				</div>
			)}
		</div>
	);
}
