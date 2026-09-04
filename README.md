# NetScope

**NetScope** shows you your public IP address and a live profile of the network you're connecting from — location, ISP, ASN, timezone, an interactive map, and round-trip latency to a handful of popular websites — all in one glass-pane UI.

🔗 **Live site:** https://badbroccoli.github.io/netscope/

![status](https://img.shields.io/badge/deploy-GitHub%20Pages-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## Features

- **Public IP detection** with one-click copy
- **Network intelligence** — ISP, organization, ASN, reverse DNS (where available)
- **Approximate geolocation** — city/region/country, plotted on an OpenStreetMap embed
- **Timezone** with a live local clock
- **Connection flags** — mobile, proxy/VPN, data center, EU
- **Ping probe** — approximate HTTP round-trip latency to Google, Cloudflare, GitHub, Amazon, Wikipedia, Microsoft, and Apple

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
│   ├── format.js / utils.js
├── components/              # UI components (shadcn/ui + a few custom ones)
└── hooks/
```

### Why no backend?

GitHub Pages only serves static files, so all lookups happen **directly from the visitor's browser**:

- **IP + geolocation** (`src/lib/networkInfo.js`) tries a chain of free, CORS-enabled, HTTPS providers in order — [ipwho.is](https://ipwhois.io/) → [geojs.io](https://www.geojs.io/) → [ipapi.co](https://ipapi.co/) → [ipify.org](https://www.ipify.org/) (IP only, last resort) — normalizing whichever one answers into a single shape. This keeps the page working even if one provider is down or rate-limited.
- **Ping probe** (`src/lib/ping.js`) can't use real ICMP from a browser, and most target sites don't send CORS headers, so it times a `fetch(..., { mode: 'no-cors' })` request instead. The response body/status is opaque, but the round-trip really happens, so the timing is a solid latency proxy.

### Known trade-offs of the static/client-side approach

- **Shared rate limits:** ipwho.is's free CORS tier shares a 1,000 requests/day quota across the whole calling domain (not per visitor). If NetScope gets popular, that provider may throttle before the others do — that's exactly why there's a fallback chain.
- **No reverse DNS:** none of the client-side-friendly providers do a reverse-DNS lookup, so the "Reverse DNS" tile will usually show "Not published."
- **Ping is approximate:** it measures browser→target wall-clock time, not a true ICMP round-trip, and can't distinguish a slow server from a slow network hop.

If you need exact reverse DNS or true server-side latency, you'd reintroduce a small backend (e.g. Cloudflare Workers, a Vercel/Render function) and point `networkInfo.js`/`ping.js` at it instead — the UI already expects the same data shape those modules return.

### "Re-scan" / "Re-ping" are always genuinely fresh

Clicking either button is guaranteed to hit the network again, not replay something cached:

- Every request is sent with `cache: 'no-store'` and a `_=<timestamp>` cache-busting query param, so neither the browser's HTTP cache nor an intermediate CDN can serve a stale hit.
- Every request is sent with `credentials: 'omit'`, so no cookies are ever sent to, or stored from, ipwho.is/geojs.io/ipapi.co/ipify.org or any of the ping targets. (Cross-origin `fetch` calls never include this site's cookies by default anyway — this just makes it explicit and impossible to accidentally change.)
- Clicking either button also clears this site's own cookies/`localStorage`/`sessionStorage` first (`src/lib/clearLocalState.js`) — a no-op today since NetScope doesn't set any, kept as a guardrail if that ever changes.
- Third-party cookies belonging to *other* origins (e.g. one Google already set in your browser) can't be read or cleared by this page's JavaScript — that's the browser's same-origin policy, not a NetScope limitation.

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
