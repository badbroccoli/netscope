# NetScope

**NetScope** shows you your public IP address and a live profile of the network you're connecting from — location, ISP, ASN, timezone, an interactive map, round-trip latency to a handful of popular websites, plus DNS and WebRTC leak tests — all in one glass-pane UI.

🔗 **Live site:** https://badbroccoli.github.io/netscope/

![status](https://img.shields.io/badge/deploy-GitHub%20Pages-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## Features

- **Public IP detection** with one-click copy
- **Network intelligence** — ISP, organization, ASN, reverse DNS (where available)
- **Approximate geolocation** — city/region/country, plotted on an OpenStreetMap embed
- **Timezone** with a live local clock
- **Connection flags** — mobile, proxy/VPN, data center, EU
- **Ping probe** — approximate HTTP round-trip latency to Google, Cloudflare, GitHub, Amazon, Wikipedia, Microsoft, and Apple. Tabs are collapsed by default; click one to see its full URL, latency, a plain-language status, and a methodology note, click it again to fold it back.
- **DNS leak test** — four independent probes of which recursive resolver actually answered a never-before-seen hostname, each showing the resolver IP, ISP, and region. If that region doesn't match the VPN/proxy you think you're using, DNS may be leaking. Runs on page load; refresh with the section's own button.
- **WebRTC leak test** — gathers ICE candidates from four public STUN servers and compares any STUN-mapped public IP against the page's detected IP. Also reports NAT type. A mismatch can mean WebRTC is bypassing a VPN/proxy that only wraps HTTP(S). Runs on page load; refresh with the section's own button.
- **Speed test** — manual, on-demand download/upload throughput test (never runs automatically)

## Architecture

NetScope is a **fully static single-page app** — there is no backend. It's built with [Vite](https://vite.dev) + [React](https://react.dev), styled with [Tailwind CSS](https://tailwindcss.com) and [shadcn/ui](https://ui.shadcn.com) components, and deployed to **GitHub Pages** via GitHub Actions.

```
src/
├── App.jsx                 # Router
├── main.jsx                # Entry point
├── pages/HomePage.jsx      # The whole app UI
├── lib/
│   ├── networkInfo.js      # Client-side IP/geolocation lookup (multi-provider)
│   ├── ping.js              # Client-side latency probe
│   ├── speedTest.js         # Client-side download/upload throughput test (opt-in)
│   ├── dnsLeak.js           # Client-side DNS leak probes (resolver IP per partner)
│   ├── webrtcLeak.js        # Client-side WebRTC/STUN leak + NAT type
│   ├── clearLocalState.js   # Wipe this origin's cookies/storage before a rescan
│   ├── format.js / utils.js
├── components/
│   ├── DnsLeakPanel.jsx / WebrtcLeakPanel.jsx
│   └── …                    # shadcn/ui + a few custom ones
└── hooks/
```

### Why no backend?

GitHub Pages only serves static files, so all lookups happen **directly from the visitor's browser**:

- **IP + geolocation** (`src/lib/networkInfo.js`) tries a chain of free, CORS-enabled, HTTPS providers in order — [ipwho.is](https://ipwhois.io/) → [geojs.io](https://www.geojs.io/) → [ipapi.co](https://ipapi.co/) → [ipify.org](https://www.ipify.org/) (IP only, last resort) — normalizing whichever one answers into a single shape. This keeps the page working even if one provider is down or rate-limited. The same module also exports `lookupIpInfo(ip)` (ipify omitted) so the leak tests can label an already-known resolver or STUN-mapped address with ISP/region.
- **Ping probe** (`src/lib/ping.js`) can't use real ICMP from a browser, and most target sites don't send CORS headers, so it times a `fetch(..., { mode: 'no-cors' })` `HEAD` request instead. The response body/status is opaque, but the round-trip really happens, so the timing is a solid latency proxy.
- **DNS leak test** (`src/lib/dnsLeak.js`) can't read which recursive resolver answered a lookup from the browser, so it asks services that *are* the authoritative nameserver for a never-before-seen hostname to report which resolver queried them. Four homepage cards try a primary partner each — [ip-api.com](https://ip-api.com/) (EDNS), [bash.ws](https://bash.ws/), [dns.myipstack.com](https://dns.myipstack.com/), [Fastly](https://www.fastly.com/) — and if that partner fails (CORS, timeout, dead endpoint) the card walks a shared standby list ([ipleak.net](https://ipleak.net/), [surfsharkdns.com](https://surfsharkdns.com/), [browserleaks.net](https://browserleaks.net/)) and shows whoever actually replied.
- **WebRTC leak test** (`src/lib/webrtcLeak.js`) opens an `RTCPeerConnection` against four public STUN servers (Google, BlackBerry, Twilio, Cloudflare), reads the ICE candidates the browser gathers, and compares any STUN-mapped (`srflx`) public IP to the page's detected IP. STUN-mapped addresses are what a remote peer — or a tracking script — would learn, and they can bypass a VPN/proxy that only wraps HTTP(S). NAT type is inferred from candidate shapes, then refined by asking two STUN servers from the *same* local socket (one PeerConnection, two `iceServers`).
- **Speed test** (`src/lib/speedTest.js`) hits [speed.cloudflare.com](https://speed.cloudflare.com)'s public `__down`/`__up` endpoints — the same keyless, CORS-enabled API that powers Cloudflare's own speed test page. Download is measured progressively by streaming the response body; upload times a single `POST` round trip. It's opt-in only (see below), never automatic.

### Known trade-offs of the static/client-side approach

- **Shared rate limits:** ipwho.is's free CORS tier shares a 1,000 requests/day quota across the whole calling domain (not per visitor). If NetScope gets popular, that provider may throttle before the others do — that's exactly why there's a fallback chain. Leak-test geo lookups use the same chain (minus ipify).
- **No reverse DNS:** none of the client-side-friendly providers do a reverse-DNS lookup, so the "Reverse DNS" tile will usually show "Not published."
- **Ping is approximate:** it measures browser→target wall-clock time, not a true ICMP round-trip, and can't distinguish a slow server from a slow network hop.
- **DNS leak is only as good as the partners:** each card needs a CORS-enabled, HTTPS leak-test API. A failed primary walks standbys and labels the partner that actually answered; if every partner is down, the card shows an error rather than a fake "no leak."
- **WebRTC needs STUN:** if the browser has WebRTC disabled or STUN is blocked, cards show no public IP — which can be the desired privacy outcome, not a test failure. NAT type is inferred from ICE candidate shapes, not a full RFC 3489/5780 classification.

If you need exact reverse DNS or true server-side latency, you'd reintroduce a small backend (e.g. Cloudflare Workers, a Vercel/Render function) and point `networkInfo.js`/`ping.js` at it instead — the UI already expects the same data shape those modules return.

### "Re-scan" / "Re-ping" / leak-test refresh are always genuinely fresh

Clicking **Re-scan** or **Re-ping** is guaranteed to hit the network again, not replay something cached. The DNS and WebRTC sections have their own refresh buttons (they do **not** re-run when you click Re-scan) and follow the same rules:

- Every HTTP request is sent with `cache: 'no-store'` and a `_=<timestamp>` cache-busting query param, so neither the browser's HTTP cache nor an intermediate CDN can serve a stale hit. DNS leak probes also use a fresh random hostname per run, so the authoritative nameserver has never seen that name before.
- Every HTTP request is sent with `credentials: 'omit'`, so no cookies are ever sent to, or stored from, ipwho.is/geojs.io/ipapi.co/ipify.org, the leak-test partners, or any of the ping targets. (Cross-origin `fetch` calls never include this site's cookies by default anyway — this just makes it explicit and impossible to accidentally change.)
- Clicking Re-scan or Re-ping also clears this site's own cookies/`localStorage`/`sessionStorage` first (`src/lib/clearLocalState.js`) — a no-op today since NetScope doesn't set any, kept as a guardrail if that ever changes.
- Third-party cookies belonging to *other* origins (e.g. one Google already set in your browser) can't be read or cleared by this page's JavaScript — that's the browser's same-origin policy, not a NetScope limitation.
- WebRTC refresh re-gathers ICE candidates live over STUN; there is no HTTP cache in that path.

### Speed test is opt-in, always

Unlike network info, ping, and the DNS/WebRTC leak tests (which load automatically; ping re-runs on "Re-ping", leak tests re-run from their own refresh buttons), the speed test **never runs on page load and never runs alongside anything else** — it only starts when you click "Run speed test." It moves ~30 MB of real data to measure throughput, which is a meaningfully different cost/privacy profile than the lightweight background lookups, so it's opt-in by design rather than bundled into the automatic scan.

## Local development

Requirements: Node (version pinned in [`.nvmrc`](.nvmrc); use `nvm use` if you have nvm).

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build     # production build → dist/
npm run preview   # preview the production build locally
npm run lint       # eslint
```

## Deploying to GitHub Pages

Deployment is automated with [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): every push to `main` builds the app and publishes `dist/` via GitHub's official Pages actions.

One-time setup (repo owner):

1. **Settings → Pages → Build and deployment → Source:** select **GitHub Actions**.
2. Push to `main` (or run the workflow manually from the **Actions** tab).
3. The site will be live at `https://<owner>.github.io/<repo>/`.

### Deploying under a different path/domain

Vite's `base` is set in [`vite.config.js`](vite.config.js):

```js
const BASE_PATH = process.env.NODE_ENV === 'production' ? '/netscope/' : '/';
```

- **Different repo name / project page:** change `/netscope/` to `/your-repo-name/`.
- **Custom domain or user/org root page** (`https://<user>.github.io/`): change it to `/`, and add a `public/CNAME` file containing your domain if using a custom domain.

`App.jsx` reads this back via `import.meta.env.BASE_URL`, so React Router's `basename` always matches automatically — no other changes needed.

## Tech stack

- [Vite](https://vite.dev) 7 + [React](https://react.dev) 18
- [React Router](https://reactrouter.com) 7
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) (Radix UI primitives)
- [Framer Motion](https://www.framer.com/motion/), [lucide-react](https://lucide.dev) icons
- [OpenStreetMap](https://www.openstreetmap.org) embed for the location map

## License

[MIT](LICENSE)
